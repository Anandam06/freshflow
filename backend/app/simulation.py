import hashlib
import json
import random
from statistics import mean

from .models import SimulationRequest
from .freshness import predict_rsl, ASSUMPTIONS_VERSION
from .optimization import BUYERS, alternatives
from .financials import financials, comparisons


def generate(config: SimulationRequest, seed: int):
    rng = random.Random(seed)
    batches = []
    for i in range(config.batches):
        disrupted = rng.random() < config.disruption_probability
        batches.append({'id': f'T{i+1}', 'day': i * config.days // config.batches,
                        'quantity_kg': float(rng.randint(200, 800)),
                        'morning_buyer': BUYERS[0 if i % 10 < 5 else 1 if i % 10 < 8 else 2]['id'],
                        'initial_rsl_hours': rng.uniform(28, 100),
                        'procurement_inr_kg': rng.uniform(10, 16),
                        'future_event': {'temperature_c': rng.uniform(30, 38) if disrupted else 20,
                                         'duration_hours': 6,
                                         'delay_hours': rng.uniform(8, 18) if disrupted else 0,
                                         'safety_hold': rng.random() < 0.01}})
    return batches


def plan_day(observed_batches, model, config):
    # Future-event fields are absent from the planner's input by construction.
    capacities = {b['id']: b['capacity_kg'] * config.capacity_multiplier for b in BUYERS}
    vehicle_remaining = 40000 * config.capacity_multiplier
    ordered = sorted(observed_batches, key=(lambda b: b['initial_rsl_hours']) if model != 'M0' else (lambda b: int(b['id'][1:])))
    plans = []
    for index, batch in enumerate(ordered):
        # Shared queue: 12 loading slots/hour; older lots benefit from FEFO.
        queue_hours = index / 12
        predicted = predict_rsl(batch['initial_rsl_hours'], 20, 6 + queue_hours)
        opts = alternatives(predicted['rsl_lower_hours'], batch['quantity_kg'], capacities=capacities,
                            price_multiplier=config.price_multiplier)
        chosen = next((b for b in opts if b['feasible']), None) if model in ['M2', 'M3'] else next(b for b in opts if b['id'] == batch['morning_buyer'])
        if chosen and (batch['quantity_kg'] > capacities[chosen['id']] or batch['quantity_kg'] > vehicle_remaining):
            chosen = None
        if chosen:
            capacities[chosen['id']] -= batch['quantity_kg']
            vehicle_remaining -= batch['quantity_kg']
        plans.append((batch, chosen, queue_hours))
    return plans, capacities


def evaluate(batches, model, config):
    rows = []
    for day in range(config.days):
        todays = [b for b in batches if b['day'] == day]
        events = {b['id']: b['future_event'] for b in todays}
        observed = [{k: v for k, v in b.items() if k != 'future_event'} for b in todays]
        plans, capacities = plan_day(observed, model, config)
        for batch, chosen, queue_hours in plans:
            event = events[batch['id']]  # Realized only after morning planning.
            prediction = predict_rsl(batch['initial_rsl_hours'] - queue_hours,
                                     event['temperature_c'], event['duration_hours'])
            q = batch['quantity_kg']
            original = chosen
            rescued = False
            rescue_attempt = False
            if model == 'M3' and chosen:
                current = next(o for o in alternatives(prediction['rsl_lower_hours'], q, event['safety_hold'],
                               event['delay_hours'], price_multiplier=config.price_multiplier) if o['id'] == chosen['id'])
                if not current['feasible']:
                    rescue_attempt = True
                    capacities[chosen['id']] += q
                    options = alternatives(prediction['rsl_lower_hours'], q, event['safety_hold'],
                                           event['delay_hours'], capacities, config.price_multiplier, rescue=True)
                    chosen = next((o for o in options if o['feasible']), None)
                    if chosen:
                        capacities[chosen['id']] -= q
                        rescued = chosen['id'] != original['id']
            actual_travel = chosen['travel_hours'] if chosen else 0
            if chosen and not rescue_attempt and chosen['id'] == 'Retailer A':
                actual_travel += event['delay_hours']
            accepted = bool(chosen and not event['safety_hold'] and
                            prediction['rsl_hours'] - actual_travel >= chosen['minimum_rsl_hours'])
            # Every safety-held lot is quarantined in every policy. No safety-vs-profit tradeoff.
            attempted = bool(chosen and not event['safety_hold'])
            transport = q * (original['transport_inr_kg'] if original else 0)
            if rescue_attempt and chosen:
                transport += q * chosen['transport_inr_kg']
            rows.append({'batch_id': batch['id'], 'day': day, 'quantity_kg': q,
                         'destination': chosen['id'] if chosen else None,
                         'sold_kg': q if accepted else 0, 'revenue_inr': q * chosen['price_inr_kg'] if accepted else 0,
                         'procurement_inr': q * batch['procurement_inr_kg'], 'transport_inr': transport,
                         'handling_inr': q * 0.5, 'rescue_inr': q * 0.75 if rescue_attempt else 0,
                         'agent_sensor_inr': q * ({'M0': 0, 'M1': 0.1, 'M2': 0.15, 'M3': 0.25}[model]),
                         'attempted_delivery': attempted, 'rejected': attempted and not accepted,
                         'on_time': accepted and actual_travel + queue_hours <= 24,
                         'rescue_attempt': rescue_attempt, 'rescued': rescued and accepted,
                         'safety_violation': accepted and event['safety_hold']})
    return rows


def simulate(config: SimulationRequest):
    runs = []
    for repetition in range(config.repetitions):
        seed = config.seed + repetition
        batches = generate(config, seed)
        digest = hashlib.sha256(json.dumps(batches, sort_keys=True).encode()).hexdigest()
        metrics = [financials(evaluate(batches, model, config), model, config.setup_cost_inr if model == 'M3' else 0)
                   for model in ['M0', 'M1', 'M2', 'M3']]
        runs.append({'seed': seed, 'dataset_sha256': digest,
                     'metrics': comparisons(metrics, config.days, config.setup_cost_inr)})
    summary = {}
    for index, model in enumerate(['M0', 'M1', 'M2', 'M3']):
        values = [r['metrics'][index] for r in runs]
        summary[model] = {'mean_operating_profit_inr': mean(v['operating_profit_inr'] for v in values),
                          'mean_spoilage_rate': mean(v['spoilage_rate'] for v in values),
                          'probability_meeting_both_targets': mean(float(v['meets_spoilage_target'] and v['meets_margin_target']) for v in values),
                          'runs_meeting_both_targets': sum(v['meets_spoilage_target'] and v['meets_margin_target'] for v in values),
                          'repetitions': config.repetitions}
    return {'evidence_category': 'SIMULATED RESULT', 'agent_mode': 'deterministic_policy_emulation',
            'assumptions_version': ASSUMPTIONS_VERSION, 'config': config.model_dump(), 'runs': runs,
            'summary': summary, 'limitations': [
                'M3 estimates the benefit of event-driven intervention; it does not measure LLM effectiveness.',
                'Uncalibrated synthetic thermal-age model; no food-safety certification.',
                'Whole-batch daily allocation; unused/rejected inventory is conservatively written off at day end.',
                'Spoilage includes unsold commercial write-offs; not all is biological decay.',
                'Sequential channel enumeration is not a global fleet optimizer.',
                'Empirical probabilities describe these seeded synthetic scenarios only.',
                'No target fitting or parameter calibration has been performed.']}
