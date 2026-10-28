"""Run-scoped audit and interactive replay, isolated from immutable experiment metrics."""
from .agent import apply_event, investigate, approve
from .models import SimulationRequest
from .simulation import generate, evaluate, plan_day
from .storage import trace


def build_artifact(config):
    batches = generate(config, config.seed)
    # Only M3 outcomes back the interactive replay; per-batch decisions are prepared on first access.
    outcomes = {'M3': evaluate(batches, 'M3', config)}
    return {'batches': batches, 'outcomes': outcomes, 'replay': {}, 'books': {}}


def prepare_day(artifact, day, config):
    key = str(day)
    if key in artifact['books']:
        return
    batches = [b for b in artifact['batches'] if b['day'] == day]
    observed = [{k: v for k, v in b.items() if k not in ['future_event', 'physical_condition']} for b in batches]
    plans, capacities = plan_day(observed, 'M2', config)
    artifact['books'][key] = capacities
    originals = {b['id']: b for b in batches}
    for batch, chosen, queue in plans:
        b = originals[batch['id']]
        state = {'id': b['id'], 'version': 0, 'status': 'monitoring', 'evidence_category': 'SYNTHETIC',
                 'quantity_kg': b['quantity_kg'], 'initial_rsl_hours': b['initial_rsl_hours'],
                 'rsl_hours': max(0, b['initial_rsl_hours'] - queue),
                 'rsl_lower_hours': max(0, b['initial_rsl_hours'] - queue - 6),
                 'destination': chosen['id'] if chosen else 'UNALLOCATED', 'delay_hours': 0,
                 'safety_hold': False, 'event': None, 'proposal': None, 'agent_mode': None,
                 'monitoring': True, 'trace': [], 'current_location': 'junction', 'elapsed_hours': 6 + queue,
                 'buyer_capacities': {}, 'unavailable_buyers': [], 'price_factors': {},
                 'quality_grade': b.get('quality_grade', 'A')}
        trace(state, 'get_batch_state', {}, {'scope': 'run-scoped interactive replay', 'morning_destination': state['destination']})
        artifact['replay'][b['id']] = {'state': state, 'reserved_buyer': chosen['id'] if chosen else None,
                                     'day': day, 'queue_hours': queue, 'investigated': False}


def decision(artifact, batch_id, config, run_id):
    batch = next((b for b in artifact['batches'] if b['id'] == batch_id), None)
    if batch is None:
        raise KeyError(batch_id)
    prepare_day(artifact, batch['day'], config)
    replay = artifact['replay'][batch_id]
    state = replay['state']
    if not replay['investigated']:
        event = batch['future_event']
        state['buyer_capacities'] = dict(artifact['books'][str(batch['day'])])
        if replay['reserved_buyer']:
            state['buyer_capacities'][replay['reserved_buyer']] += batch['quantity_kg']
        state['unavailable_buyers'] = event.get('cancelled_buyers', [])
        state['price_factors'] = event.get('price_factors', {})
        apply_event(state, {k: event[k] for k in ['temperature_c', 'duration_hours', 'delay_hours', 'safety_hold']})
        state['rsl_lower_hours'] = max(0, state['rsl_hours'] - max(6, 2 * config.prediction_error_hours))
        state['rsl_hours'] = max(0, state['rsl_hours'] - config.approval_delay_hours)
        state['rsl_lower_hours'] = max(0, state['rsl_lower_hours'] - config.approval_delay_hours)
        state['elapsed_hours'] += config.approval_delay_hours
        if replay['reserved_buyer']:
            investigate(state, 'deterministic')
        else:
            state['status'] = 'manual_review'
            trace(state, 'dispatch_blocked', {}, {'reason': 'No morning vehicle/buyer allocation; cannot reroute an undispatched load'})
        replay['investigated'] = True
    outcome = next(r for r in artifact['outcomes']['M3'] if r['batch_id'] == batch_id)
    return {'run_id': run_id, 'batch_id': batch_id, 'scope': 'Interactive replay; immutable experiment metrics are not rewritten',
            'state': state, 'simulated_outcome': outcome}


def decide(artifact, batch_id, config, run_id, version, approved):
    result = decision(artifact, batch_id, config, run_id)
    state = result['state']
    if state['version'] != version:
        raise ValueError('Stale decision version')
    replay = artifact['replay'][batch_id]
    book = artifact['books'][str(replay['day'])]
    capacities = dict(book)
    if replay['reserved_buyer']:
        capacities[replay['reserved_buyer']] += state['quantity_kg']
    state['buyer_capacities'] = capacities
    approve(state, approved)
    if approved:
        if replay['reserved_buyer']:
            book[replay['reserved_buyer']] += state['quantity_kg']
        book[state['destination']] -= state['quantity_kg']
        assert book[state['destination']] >= 0
        replay['reserved_buyer'] = state['destination']
    state['version'] += 1
    return result
