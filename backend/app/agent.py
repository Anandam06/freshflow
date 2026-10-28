import json
import os
import httpx

from .freshness import predict_rsl
from .optimization import alternatives, BUYERS, calculate_route_eta, optimize_destination
from .storage import trace
from . import shipment as shipment_network


def apply_event(state, event):
    state['event'] = event
    # Event durations are incremental exposures, not time since harvest.
    result = predict_rsl(state['rsl_hours'], event['temperature_c'], event['duration_hours'])
    state.update(rsl_hours=result['rsl_hours'], rsl_lower_hours=result['rsl_lower_hours'],
                 delay_hours=event['delay_hours'], safety_hold=state['safety_hold'] or event['safety_hold'],
                 proposal=None, status='event_detected', monitoring=True)
    trace(state, 'sense_event', event, result)


class Investigation:
    def __init__(self, state):
        self.state = state
        self.seen = set()
        self.options = None
        self.policy = None

    def call(self, name, args):
        invoked_name = name
        name = TOOL_ALIASES.get(name, name)
        if name == 'check_buyer_capacity':
            result = {'available_capacity_kg': self.state.get('buyer_capacities') or {b['id']: b['capacity_kg'] for b in BUYERS}}
            if shipment_network.is_shipment(self.state):
                result = {'available_capacity_kg': self.state['buyer_capacities']}
            trace(self.state, invoked_name, args, result)
            return result
        if name == 'calculate_route_eta':
            result = (shipment_network.agent_routes(self.state) if shipment_network.is_shipment(self.state) else
                      {'routes': [calculate_route_eta(self.state.get('current_location', 'junction'), b['id'], self.state['delay_hours']) for b in BUYERS]})
            trace(self.state, invoked_name, args, result)
            return result
        if name not in ['inspect_batch', 'predict_freshness', 'check_buyers_routes', 'rank_options', 'check_policy', 'propose_action']:
            raise ValueError('Unknown tool')
        if name == 'inspect_batch':
            result = {k: self.state[k] for k in ['id', 'destination', 'quantity_kg', 'event', 'safety_hold']}
            result['current_location'] = self.state.get('current_location', 'junction')
        elif name == 'predict_freshness':
            result = {k: self.state[k] for k in ['rsl_hours', 'rsl_lower_hours']}
            result['interpretation'] = 'Synthetic quality estimate; safety hold is separate'
        elif name == 'check_buyers_routes' and shipment_network.is_shipment(self.state):
            result = shipment_network.agent_buyers(self.state)
        elif name == 'check_buyers_routes':
            result = {'buyers': BUYERS, 'retailer_delay_hours': self.state['delay_hours'],
                      'price_factors': self.state.get('price_factors', {}),
                      'unavailable_buyers': self.state.get('unavailable_buyers', []),
                      'source': 'SYNTHETIC scenario quotes and capacity observations; not live market data'}
        elif name == 'rank_options':
            if not {'inspect_batch', 'predict_freshness', 'check_buyers_routes'} <= self.seen:
                raise ValueError('Inspect batch, freshness and buyer routes before ranking')
            self.options = state_options(self.state)
            result = {'options': self.options}
        elif name == 'check_policy':
            if self.options is None:
                raise ValueError('Rank options first')
            candidate = next((o for o in self.options if o['id'] == args.get('destination')), None)
            if not candidate:
                raise ValueError('Select a returned destination')
            self.policy = candidate
            result = {'allowed': candidate['feasible'], 'requires_human_approval': True,
                      'reasons': candidate['reasons'], 'destination': candidate['id']}
        else:
            destination = args.get('destination')
            if not self.policy or self.policy['id'] != destination or not self.policy['feasible']:
                raise ValueError('A feasible policy-checked destination is required')
            self.state['proposal'] = self.policy
            self.state['status'] = 'awaiting_approval'
            result = {'status': 'awaiting_approval', 'destination': destination}
        self.seen.add(name)
        trace(self.state, invoked_name, args, result)
        return result


TOOL_ALIASES = {'get_batch_state': 'inspect_batch', 'predict_remaining_shelf_life': 'predict_freshness',
                'get_buyer_options': 'check_buyers_routes', 'optimize_destination': 'rank_options',
                'validate_constraints': 'check_policy', 'request_human_approval': 'propose_action'}
TOOL_NAMES = ['get_batch_state', 'predict_remaining_shelf_life', 'get_buyer_options',
              'check_buyer_capacity', 'calculate_route_eta', 'optimize_destination',
              'validate_constraints', 'request_human_approval']


def state_options(state):
    if shipment_network.is_shipment(state):
        return shipment_network.agent_options(state)
    return alternatives(state['rsl_lower_hours'], state['quantity_kg'], state['safety_hold'], state['delay_hours'],
                        capacities=state.get('buyer_capacities') or None, rescue=True,
                        current_location=state.get('current_location', 'junction'), elapsed_hours=state.get('elapsed_hours', 6),
                        unavailable_buyers=state.get('unavailable_buyers', []), price_factors=state.get('price_factors', {}),
                        quality_grade=state.get('quality_grade', 'A'))


def tool_schema(name, destinations=None):
    canonical = TOOL_ALIASES.get(name, name)
    ids = destinations or [b['id'] for b in BUYERS]
    properties = {'destination': {'type': 'string', 'enum': ids}} if canonical in ['check_policy', 'propose_action'] else {}
    return {'type': 'function', 'name': name, 'description': {
        'inspect_batch': 'Read latest batch event and safety hold.',
        'predict_freshness': 'Read current synthetic remaining shelf life and conservative bound.',
        'check_buyers_routes': 'Read available buyer capacities, price quotes and route delays.',
        'rank_options': 'Enumerate feasible options after inspecting batch, freshness, and routes.',
        'check_policy': 'Validate the selected ranked destination against deterministic policy.',
        'propose_action': 'Persist a policy-checked proposal for human approval; cannot execute.',
        'check_buyer_capacity': 'Read currently available buyer capacity.',
        'calculate_route_eta': 'Calculate routes from the current shipment location.'}[canonical],
            'parameters': {'type': 'object', 'properties': properties,
                           'required': list(properties), 'additionalProperties': False}, 'strict': True}


def llm_provider():
    """Which LLM drives live mode: FRESHFLOW_LLM_PROVIDER, else Anthropic when its key exists, else OpenAI."""
    chosen = (os.getenv('FRESHFLOW_LLM_PROVIDER') or '').strip().lower()
    if chosen:
        return chosen
    if os.getenv('ANTHROPIC_API_KEY'):
        return 'anthropic'
    if os.getenv('OPENAI_API_KEY') and os.getenv('OPENAI_MODEL'):
        return 'openai'
    return None


def live_configured():
    provider = llm_provider()
    if provider == 'anthropic':
        return bool(os.getenv('ANTHROPIC_API_KEY'))
    if provider == 'openai':
        return bool(os.getenv('OPENAI_API_KEY') and os.getenv('OPENAI_MODEL'))
    return False


def live_model():
    provider = llm_provider()
    if provider == 'anthropic':
        from .claude_agent import model_name
        return model_name()
    return os.getenv('OPENAI_MODEL') if provider == 'openai' else None


def live_loop(investigation, transport=None, client=None):
    if llm_provider() == 'anthropic':
        if not os.getenv('ANTHROPIC_API_KEY') and client is None:
            raise ValueError('Live mode requires ANTHROPIC_API_KEY on the backend; no silent fallback')
        from .claude_agent import claude_loop
        destinations = shipment_network.buyer_ids(investigation.state) if shipment_network.is_shipment(investigation.state) else None
        return claude_loop(investigation, tool_schema, TOOL_NAMES, destinations, client)
    return openai_loop(investigation, transport)


def openai_loop(investigation, transport=None):
    key, model = os.getenv('OPENAI_API_KEY'), os.getenv('OPENAI_MODEL')
    if not key or not model:
        raise ValueError('Live mode requires OPENAI_API_KEY and OPENAI_MODEL; no silent fallback')
    history = [{'role': 'user', 'content': 'Investigate this batch exception. Use tools to discover evidence, rank alternatives, check policy, and propose a feasible rescue. Stop if no feasible option. You cannot approve or execute.'}]
    calls = 0
    with httpx.Client(timeout=45, transport=transport) as client:
        for _ in range(10):
            response = client.post('https://api.openai.com/v1/responses',
                headers={'Authorization': f'Bearer {key}'}, json={
                    'model': model, 'input': history, 'tools': [tool_schema(n, shipment_network.buyer_ids(investigation.state) if shipment_network.is_shipment(investigation.state) else None) for n in TOOL_NAMES],
                    'parallel_tool_calls': False, 'store': False, 'max_output_tokens': 1200})
            response.raise_for_status()
            output = response.json()['output']
            history.extend(output)
            tool_calls = [o for o in output if o['type'] == 'function_call']
            if not tool_calls:
                return
            for call in tool_calls:
                calls += 1
                if calls > 16:
                    raise ValueError('Agent tool budget exhausted')
                try:
                    args = json.loads(call['arguments'])
                    if not isinstance(args, dict):
                        raise ValueError('Tool arguments must be an object')
                    result = investigation.call(call['name'], args)
                except (ValueError, TypeError) as exc:
                    result = {'error': str(exc)}
                    trace(investigation.state, 'tool_rejected', {'name': call['name']}, result)
                history.append({'type': 'function_call_output', 'call_id': call['call_id'], 'output': json.dumps(result)})
            if investigation.state['proposal']:
                return
    raise ValueError('Agent turn budget exhausted')


def investigate(state, mode, transport=None):
    if state['status'] != 'event_detected':
        raise ValueError('A new event is required before investigation')
    state['agent_mode'] = mode
    inv = Investigation(state)
    if mode == 'live':
        live_loop(inv, transport)
        if not state['proposal'] and inv.options is not None:
            # The model chose not to propose a change. Accept that only if Python's own ranking agrees
            # the current destination is the best feasible option; otherwise escalate to a human.
            best = optimize_destination(inv.options)
            if best and best['id'] == state['destination']:
                state.update(status='monitoring', monitoring=True)
                trace(state, 'no_intervention_required', {}, {
                    'destination': state['destination'], 'net_proceeds_inr': best['net_proceeds_inr'],
                    'reason': 'Current plan remains the best feasible option; verified against the optimizer ranking'})
                return
    else:
        for name in TOOL_NAMES[:6]:
            inv.call(name, {})
        feasible = optimize_destination(inv.options)
        if feasible and feasible['id'] != state['destination']:
            inv.call('validate_constraints', {'destination': feasible['id']})
            inv.call('request_human_approval', {'destination': feasible['id']})
        elif feasible:
            # Best feasible option is the current plan: nothing to approve.
            state.update(proposal=None, status='monitoring', monitoring=True)
            trace(state, 'no_intervention_required', {}, {
                'destination': state['destination'], 'net_proceeds_inr': feasible['net_proceeds_inr'],
                'reason': 'Current plan remains the best feasible option; no change proposed'})
            return
    if state['proposal'] and state['proposal']['id'] == state['destination']:
        # The best feasible option is the current plan: continue monitoring, no human approval needed.
        kept = state['proposal']
        state.update(proposal=None, status='monitoring', monitoring=True)
        trace(state, 'no_intervention_required', {}, {
            'destination': state['destination'], 'net_proceeds_inr': kept['net_proceeds_inr'],
            'reason': 'Current plan remains the best feasible option; no change proposed'})
    elif not state['proposal']:
        state['status'] = 'manual_review'
        trace(state, 'escalate', {}, {'reason': 'No proposal; human review required; destination unchanged'})


def approve(state, approved):
    if state['status'] != 'awaiting_approval' or not state['proposal']:
        raise ValueError('No pending proposal')
    if not approved:
        state.update(status='manual_review', proposal=None)
        trace(state, 'human_rejected', {}, {'destination': state['destination']})
        return
    proposal = state['proposal']
    current_options = state_options(state)
    checked = next(o for o in current_options if o['id'] == proposal['id'])
    if not checked['feasible']:
        raise ValueError('Proposal is no longer feasible')
    old = state['destination']
    baseline = next(o for o in current_options if o['id'] == old)
    baseline_net = baseline['net_proceeds_inr'] if baseline['feasible'] else 0
    state.update(destination=checked['id'], status='monitoring', monitoring=True, proposal=None)
    trace(state, 'human_approved', {}, {'destination': checked['id']})
    trace(state, 'execute_destination_change', {'previous_destination': old}, {
        'destination': checked['id'], 'estimated_incremental_net_proceeds_inr': checked['net_proceeds_inr'] - baseline_net,
        'evidence_category': 'SIMULATED RESULT', 'scope': 'estimated future proceeds; excludes sunk procurement and original transport'})
    trace(state, 'verify', {}, {'destination_persisted_on_commit': checked['id'],
                               'monitoring_resumed': True, 'physical_delivery_verified': False})
    trace(state, 'execute_reroute', {'origin': state.get('current_location', 'junction')}, {'destination': checked['id'], 'approval_enforced': True})
    trace(state, 'verify_execution', {}, {'persistent_state_verified_on_commit': True, 'buyer_acceptance_verified': False})
