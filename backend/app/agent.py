import json
import os
import httpx

from .freshness import predict_rsl
from .optimization import alternatives, BUYERS
from .storage import trace


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
        if name not in ['inspect_batch', 'predict_freshness', 'check_buyers_routes', 'rank_options', 'check_policy', 'propose_action']:
            raise ValueError('Unknown tool')
        if name == 'inspect_batch':
            result = {k: self.state[k] for k in ['id', 'destination', 'quantity_kg', 'event', 'safety_hold']}
        elif name == 'predict_freshness':
            result = {k: self.state[k] for k in ['rsl_hours', 'rsl_lower_hours']}
            result['interpretation'] = 'Synthetic quality estimate; safety hold is separate'
        elif name == 'check_buyers_routes':
            result = {'buyers': BUYERS, 'retailer_delay_hours': self.state['delay_hours'],
                      'source': 'SYNTHETIC dedicated T17 buyer capacities; not live market quotes'}
        elif name == 'rank_options':
            if not {'inspect_batch', 'predict_freshness', 'check_buyers_routes'} <= self.seen:
                raise ValueError('Inspect batch, freshness and buyer routes before ranking')
            self.options = alternatives(self.state['rsl_lower_hours'], self.state['quantity_kg'],
                                        self.state['safety_hold'], self.state['delay_hours'], rescue=True)
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
        trace(self.state, name, args, result)
        return result


TOOL_NAMES = ['inspect_batch', 'predict_freshness', 'check_buyers_routes', 'rank_options', 'check_policy', 'propose_action']


def tool_schema(name):
    properties = {'destination': {'type': 'string', 'enum': [b['id'] for b in BUYERS]}} if name in ['check_policy', 'propose_action'] else {}
    return {'type': 'function', 'name': name, 'description': {
        'inspect_batch': 'Read latest batch event and safety hold.',
        'predict_freshness': 'Read current synthetic remaining shelf life and conservative bound.',
        'check_buyers_routes': 'Read available buyer capacities, price quotes and route delays.',
        'rank_options': 'Enumerate feasible options after inspecting batch, freshness, and routes.',
        'check_policy': 'Validate the selected ranked destination against deterministic policy.',
        'propose_action': 'Persist a policy-checked proposal for human approval; cannot execute.'}[name],
            'parameters': {'type': 'object', 'properties': properties,
                           'required': list(properties), 'additionalProperties': False}, 'strict': True}


def live_loop(investigation, transport=None):
    key, model = os.getenv('OPENAI_API_KEY'), os.getenv('OPENAI_MODEL')
    if not key or not model:
        raise ValueError('Live mode requires OPENAI_API_KEY and OPENAI_MODEL; no silent fallback')
    history = [{'role': 'user', 'content': 'Investigate this batch exception. Use tools to discover evidence, rank alternatives, check policy, and propose a feasible rescue. Stop if no feasible option. You cannot approve or execute.'}]
    calls = 0
    with httpx.Client(timeout=45, transport=transport) as client:
        for _ in range(10):
            response = client.post('https://api.openai.com/v1/responses',
                headers={'Authorization': f'Bearer {key}'}, json={
                    'model': model, 'input': history, 'tools': [tool_schema(n) for n in TOOL_NAMES],
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
    else:
        for name in TOOL_NAMES[:4]:
            inv.call(name, {})
        feasible = next((o for o in inv.options if o['feasible']), None)
        if feasible:
            inv.call('check_policy', {'destination': feasible['id']})
            inv.call('propose_action', {'destination': feasible['id']})
    if not state['proposal']:
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
    current_options = alternatives(state['rsl_lower_hours'], state['quantity_kg'],
                                   state['safety_hold'], state['delay_hours'], rescue=True)
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
