import hashlib
import json
from statistics import mean, median

from .models import SimulationRequest
from .freshness import predict_rsl, ASSUMPTIONS_VERSION
from .optimization import BUYERS, alternatives, allocate_day, optimize_destination
from .financials import financials, comparisons
from .generator import generate, planning_view


def day_capacities(batches, config):
    snapshot = batches[0].get('buyer_snapshot', BUYERS) if batches else BUYERS
    return {b['id']: min(b['capacity_kg'], b.get('demand_kg', b['capacity_kg'])) * config.capacity_multiplier
            if b.get('available', True) else 0 for b in snapshot}


def plan_day(observed_batches, model, config):
    if any('future_event' in b or 'physical_condition' in b for b in observed_batches):
        raise ValueError('Planner must receive observation-only records')
    capacities = day_capacities(observed_batches, config)
    fleet = 40000 * config.capacity_multiplier
    ordered = sorted(observed_batches, key=(lambda b: (b['initial_rsl_hours'], b['id'])) if model != 'M0'
                     else (lambda b: int(b['id'][1:])))
    candidates = []
    for index, batch in enumerate(ordered):
        queue = index / 12
        predicted = predict_rsl(batch['initial_rsl_hours'], 20, 6 + queue,
                                max(6, 2 * config.prediction_error_hours))
        candidates.append(alternatives(predicted['rsl_lower_hours'], batch['quantity_kg'], capacities=capacities,
                          price_multiplier=config.price_multiplier, elapsed_hours=6 + queue,
                          quality_grade=batch.get('quality_grade', 'A')))
    if model in ['M2', 'M3']:
        selected = allocate_day(ordered, candidates, capacities, fleet)
    else:
        selected = []
        remaining = dict(capacities)
        for batch, options in zip(ordered, candidates):
            chosen = next(o for o in options if o['id'] == batch['morning_buyer'])
            q = batch['quantity_kg']
            # Baselines obey capacity/payload but do not screen freshness or optimize destinations.
            if q > remaining[chosen['id']] or q > fleet or q > 1000:
                chosen = None
            if chosen:
                remaining[chosen['id']] -= q
                fleet -= q
            selected.append(chosen)
    plans = []
    for index, (batch, chosen) in enumerate(zip(ordered, selected)):
        if chosen:
            capacities[chosen['id']] -= batch['quantity_kg']
        plans.append((batch, chosen, index / 12))
    return plans, capacities


def evaluate(batches, model, config):
    rows = []
    grouped = {}
    for batch in batches:
        grouped.setdefault(batch['day'], []).append(batch)
    for day, todays in sorted(grouped.items()):
        originals = {b['id']: b for b in todays}
        plans, capacities = plan_day([planning_view(b) for b in todays], model, config)
        for batch, chosen, queue in plans:
            full = originals[batch['id']]
            event = full['future_event']
            original = chosen
            q = batch['quantity_kg']
            observed = predict_rsl(batch['initial_rsl_hours'] - queue, event['temperature_c'],
                                   event['duration_hours'], max(6, 2 * config.prediction_error_hours))
            physical = predict_rsl(full['physical_condition']['initial_rsl_hours'] - queue,
                                   event.get('physical_temperature_c', event['temperature_c']), event['duration_hours'], 0)
            available = dict(capacities)
            if chosen:
                available[chosen['id']] += q
            context = dict(safety_hold=event['safety_hold'], delay_hours=event['delay_hours'], capacities=available,
                           price_multiplier=config.price_multiplier, current_location=event.get('current_location', 'junction'),
                           elapsed_hours=6 + queue, unavailable_buyers=event.get('cancelled_buyers', []),
                           price_factors=event.get('price_factors', {}), quality_grade=batch.get('quality_grade', 'A'))
            options = alternatives(observed['rsl_lower_hours'], q, **context)
            attempts, rescued, approval_delay = False, False, 0.0
            audit = []
            def record(tool, inputs, result):
                audit.append({'sequence': len(audit) + 1, 'timestamp': f'day={day};elapsed_hours={6 + queue + approval_delay:.6f}',
                              'tool': tool, 'inputs': inputs, 'result': result})
            record('get_batch_state', {}, {'batch_id': batch['id'], 'destination': chosen['id'] if chosen else None,
                                         'current_location': context['current_location'], 'event': event})
            if model == 'M3' and chosen:
                current = next(o for o in options if o['id'] == chosen['id'])
                best = optimize_destination(options)
                continuation_value = q * current['price_inr_kg'] if current['feasible'] else 0
                if not current['feasible'] or (best and best['id'] != chosen['id'] and best['net_proceeds_inr'] > continuation_value):
                    attempts = True
                    approval_delay = config.approval_delay_hours
                    record('predict_remaining_shelf_life', {'observation': event['temperature_c']}, observed)
                    record('get_buyer_options', {}, {'cancelled': context['unavailable_buyers'], 'price_factors': context['price_factors']})
                    record('check_buyer_capacity', {}, {'available_kg': available})
                    context['elapsed_hours'] += approval_delay
                    options = alternatives(max(0, observed['rsl_lower_hours'] - approval_delay), q, rescue=True, **context)
                    record('calculate_route_eta', {'origin': context['current_location']}, {'routes': [o['route'] for o in options]})
                    candidate = optimize_destination(options)
                    record('optimize_destination', {}, {'options': options, 'selected': candidate['id'] if candidate else None})
                    record('validate_constraints', {}, {'allowed': bool(candidate), 'safety_hold': event['safety_hold']})
                    record('request_human_approval', {}, {'mode': 'SIMULATED approval after configured delay', 'delay_hours': approval_delay})
                    capacities[original['id']] += q
                    chosen = candidate
                    if chosen:
                        capacities[chosen['id']] -= q
                        rescued = chosen['id'] != original['id']
                        record('execute_reroute', {'origin': context['current_location']}, {'destination': chosen['id'], 'delivery_confirmed': False})
            travel = next((o['travel_hours'] for o in options if chosen and o['id'] == chosen['id']), 0)
            actual_arrival_rsl = max(0, physical['rsl_hours'] - travel - approval_delay)
            remaining_window = 6 + queue + approval_delay + travel <= 30
            buyer_active = bool(chosen and chosen['id'] not in event.get('cancelled_buyers', []))
            grade_ok = bool(chosen and not (batch.get('quality_grade') == 'C' and chosen['id'] == 'Retailer A'))
            reachable = bool(chosen and next(o['route']['reachable'] for o in options if o['id'] == chosen['id']))
            accepted = bool(chosen and buyer_active and grade_ok and reachable and remaining_window and not event['safety_hold']
                            and actual_arrival_rsl >= chosen['minimum_rsl_hours'])
            attempted = bool(chosen and not event['safety_hold'])
            realized_price = next((o['price_inr_kg'] for o in options if chosen and o['id'] == chosen['id']), 0)
            transport = q * (original['transport_inr_kg'] if original else 0)
            if attempts and chosen:
                transport += q * chosen['transport_inr_kg']
            row = {'batch_id': batch['id'], 'day': day, 'quantity_kg': q,
                   'destination': chosen['id'] if chosen else None, 'morning_destination': original['id'] if original else None,
                   'current_location': context['current_location'], 'route': next((o['route'] for o in options if chosen and o['id'] == chosen['id']), None),
                   'sold_kg': q if accepted else 0, 'spoiled_kg': 0 if accepted else q,
                   'revenue_inr': q * realized_price if accepted else 0,
                   'realized_unit_price_inr': realized_price,
                   'salvage_value_inr': q * realized_price if accepted and chosen['id'] == 'Processor C' else 0,
                   'procurement_inr': q * batch['procurement_inr_kg'], 'transport_inr': transport,
                   'handling_inr': q * 0.5, 'rescue_inr': q * 0.75 if attempts else 0,
                   'agent_sensor_inr': q * ({'M0': 0, 'M1': 0.1, 'M2': 0.15, 'M3': 0.15 + 0.10 * config.ai_cost_multiplier}[model]),
                   'attempted_delivery': attempted, 'rejected': attempted and not accepted,
                   'on_time': accepted and 6 + travel + queue + approval_delay <= 24,
                   'rescue_attempt': attempts, 'rescued': rescued and accepted,
                   'safety_violation': accepted and event['safety_hold'], 'estimated_freshness': observed,
                   'realized_arrival_rsl_hours': actual_arrival_rsl, 'buyer_acceptance': accepted,
                   'candidate_decisions': options, 'solver_status': original.get('solver_status') if original else None,
                   'constraint_violations': next((o['reasons'] for o in options if chosen and o['id'] == chosen['id']), ['No feasible allocation'])}
            record('verify_execution', {}, {'accepted': accepted, 'sold_kg': row['sold_kg'], 'realized_rsl_hours': actual_arrival_rsl})
            row['trace'] = audit
            row['ledger'] = [{'account': 'sales', 'amount_inr': row['revenue_inr']}] + [
                {'account': key, 'amount_inr': -row[key]} for key in ['procurement_inr', 'transport_inr', 'handling_inr', 'rescue_inr', 'agent_sensor_inr']]
            rows.append(row)
    return rows


def percentile(values, p):
    ordered = sorted(values)
    index = (len(ordered) - 1) * p
    lower = int(index)
    return ordered[lower] + (ordered[min(lower + 1, len(ordered) - 1)] - ordered[lower]) * (index - lower)


def simulate(config: SimulationRequest):
    runs = []
    for repetition in range(config.repetitions):
        seed = config.seed + repetition
        batches = generate(config, seed)
        digest = hashlib.sha256(json.dumps(batches, sort_keys=True).encode()).hexdigest()
        metrics = [financials(evaluate(batches, model, config), model, config.setup_cost_inr if model == 'M3' else 0)
                   for model in ['M0', 'M1', 'M2', 'M3']]
        runs.append({'seed': seed, 'dataset_sha256': digest, 'metrics': comparisons(metrics, config.days, config.setup_cost_inr)})
    return summarize(config, runs)


def summarize(config: SimulationRequest, runs):
    """Result envelope for seeded runs; also used to publish the stored validation study."""
    summary = {}
    for index, model in enumerate(['M0', 'M1', 'M2', 'M3']):
        values = [r['metrics'][index] for r in runs]
        profits, spoilage = [v['operating_profit_inr'] for v in values], [v['spoilage_rate'] for v in values]
        summary[model] = {'mean_operating_profit_inr': mean(profits), 'mean_spoilage_rate': mean(spoilage),
                          'median_operating_profit_inr': median(profits), 'profit_p05_inr': percentile(profits, 0.05),
                          'profit_p95_inr': percentile(profits, 0.95), 'spoilage_p05': percentile(spoilage, 0.05),
                          'spoilage_p95': percentile(spoilage, 0.95), 'profit_distribution_inr': profits,
                          'spoilage_distribution': spoilage,
                          'probability_meeting_both_targets': mean(float(v['meets_spoilage_target'] and v['meets_margin_target']) for v in values),
                          'runs_meeting_both_targets': sum(v['meets_spoilage_target'] and v['meets_margin_target'] for v in values),
                          'repetitions': len(runs)}
    gains = [r['metrics'][3]['operating_profit_inr'] - r['metrics'][2]['operating_profit_inr'] for r in runs]
    return {'evidence_category': 'SIMULATED RESULT', 'agent_mode': 'deterministic_policy_emulation',
            'assumptions_version': ASSUMPTIONS_VERSION, 'config': config.model_dump(), 'runs': runs, 'summary': summary,
            'risk': {'incremental_m3_vs_m2_distribution_inr': gains, 'mean_incremental_m3_vs_m2_inr': mean(gains),
                     'probability_m3_worse_than_m2': mean(float(g < 0) for g in gains),
                     'range_definition': 'Linearly interpolated 5th–95th simulation percentiles; not confidence intervals'},
            'limitations': ['Synthetic assumptions with case-only baseline calibration; no field validation.',
                'M3 simulates bounded event-driven intervention and delayed approvals, not live LLM performance.',
                'Quality RSL does not certify food safety. Humidity is recorded but not assigned an unsupported coefficient.',
                'Whole-lot single-day inventory; unsold inventory is conservatively written off, including commercial waste.',
                'CP-SAT jointly optimizes daily allocation with fixed FEFO loading slots; fallback status is exposed.',
                'A synthetic junction graph defines routes; not GPS or map-derived travel.',
                'Simulation percentiles and probabilities apply only to the specified input distribution.']}
