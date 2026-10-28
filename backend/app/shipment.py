"""Single-shipment scenario engine on the Mumbai network.

Four strategies face the SAME shipment and the SAME disruptions:
  A Traditional planning (M0): committed buyer, FIFO loading wait, no checks, no re-plan.
  B Freshness-aware (M1):      committed buyer, first-expiring loaded first (shorter wait).
  C Smart optimization (M2):   at planning time picks the best buyer from forecast conditions; no re-plan.
  D FreshFlow agentic (M3):    C's plan, then the agent (agent.Investigation — the same tools, policy and
                               approval gate as the T17 workflow) re-plans at a checkpoint after the
                               disruption is detected. A proposal executes only after human approval.

Decisions use ESTIMATED shelf life (sensor estimate − conservative buffer); outcomes use the TRUE
(latent) shelf life, as in the fleet simulation. Rerouting never restores lost shelf life — it only
changes the remaining exposure time and the buyer's minimum requirement.
All parameters are SYNTHETIC (catalogue.py / uploaded workbook).
"""
import hashlib
import json
import random
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .catalogue import DISRUPTIONS, SETTING_BOUNDS, SEVERITIES

STRATEGIES = [
    {'key': 'A', 'model': 'M0', 'label': 'Traditional Planning'},
    {'key': 'B', 'model': 'M1', 'label': 'Freshness-Aware'},
    {'key': 'C', 'model': 'M2', 'label': 'Smart Optimization'},
    {'key': 'D', 'model': 'M3', 'label': 'FreshFlow Agentic AI'},
]


class ShipmentInputError(ValueError):
    """Request references unknown ids or out-of-bounds settings (HTTP 422)."""


class Disruption(BaseModel):
    model_config = ConfigDict(extra='forbid')
    type: Literal['heavy_traffic', 'road_closure', 'temperature_rise', 'refrigeration_failure',
                  'humidity_problem', 'buyer_cancellation', 'price_drop', 'product_damage']
    severity: Literal['low', 'medium', 'high'] = 'medium'


class ShipmentRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    commodity_id: str = 'tomato'
    origin_id: str = 'H1'
    buyer_id: str = 'B02'
    quantity_kg: float = Field(800, gt=0, le=10000)
    quality_grade: Literal['A', 'B', 'C'] = 'A'
    disruptions: list[Disruption] = Field(default_factory=list, max_length=8)
    settings: dict[str, float] = Field(default_factory=dict)
    mode: Literal['deterministic', 'live'] = 'deterministic'
    dataset_id: str = 'default'

    @field_validator('disruptions')
    @classmethod
    def unique_types(cls, v):
        if len({d.type for d in v}) != len(v):
            raise ValueError('Each disruption type can be selected once')
        return v

    @field_validator('settings')
    @classmethod
    def bounded(cls, v):
        for key, value in v.items():
            if key not in SETTING_BOUNDS:
                raise ValueError(f'Unknown setting {key}')
            lo, hi = SETTING_BOUNDS[key]
            if not lo <= value <= hi:
                raise ValueError(f'{key} must be between {lo} and {hi}')
        return v


# ----------------------------------------------------------------------------------- helpers

def thermal_age(hours, temp_c, q10, base=20.0):
    return max(0.0, hours) * q10 ** ((temp_c - base) / 10)


def min_rsl(ds, commodity, buyer_id):
    return max(2.0, ds['buyers'][buyer_id]['min_rsl_fraction'] * commodity['shelf_life_hours_20c'])


def grade_factor(ds, grade):
    return {'A': 1.0, 'B': ds['freshness']['grade_price_factor_B'], 'C': ds['freshness']['grade_price_factor_C']}[grade]


def offer_price(ds, commodity, buyer_id, grade, arrival_rsl, settings, price_factors):
    """Buyer offer ₹/kg = reference × market factor × buyer factor × grade factor × freshness factor × event factor.
    Freshness enters ONLY through the arrival-shelf-life factor; grade (damage) is separate — no double counting."""
    buyer = ds['buyers'][buyer_id]
    fr = ds['freshness']
    minimum = min_rsl(ds, commodity, buyer_id)
    ratio = arrival_rsl / minimum if minimum else 2
    discount = 0.0 if ratio >= 1.5 else fr['max_freshness_discount'] * min(1.0, (1.5 - ratio) / 0.5)
    return (commodity['reference_price_inr_kg'] * settings['market_price_factor'] * buyer['price_factor']
            * grade_factor(ds, grade) * (1 - discount) * price_factors.get(buyer_id, 1.0))


def seed_for(settings, req):
    # Normalise numbers so 800 and 800.0 (or seed 7 and 7.0) give the same stream.
    payload = json.dumps([int(settings['seed']), req.commodity_id, req.origin_id, req.buyer_id, round(float(req.quantity_kg), 6)])
    return int(hashlib.sha256(payload.encode()).hexdigest()[:12], 16)


def route(ds, origin, buyer):
    key = f'{origin}>{buyer}'
    if key not in ds['routes']:
        raise ShipmentInputError(f'No road route from {origin} to {buyer}')
    return key, ds['routes'][key]


# ----------------------------------------------------------------------------------- scenario

def conditions(ds, commodity, req, settings, rng):
    fr = ds['freshness']
    sev = {d.type: SEVERITIES.index(d.severity) for d in req.disruptions}
    pick = lambda name, field, default: DISRUPTIONS[name][field][sev[name]] if name in sev else default  # noqa: E731
    hub_temp = fr['base_temperature_c'] + settings['temperature_shift_c'] + pick('temperature_rise', 'temp_c', 0)
    humidity_off = max(0.0, (abs(settings['humidity_rh_percent'] - 90) - 5) / 20)
    humidity = min(0.9, commodity['humidity_sensitivity'] * (pick('humidity_problem', 'humidity_scale', 0) + humidity_off))
    grade_drop = pick('product_damage', 'grade_drop', 0)
    grade = 'ABC'[min(2, 'ABC'.index(req.quality_grade) + grade_drop)]
    capacity_left = pick('buyer_cancellation', 'capacity_left', 1.0)
    unavailable_morning = sorted(b for b in ds['buyers'] if b != req.buyer_id and rng.random() > settings['buyer_availability'])
    return {
        'severity': {k: SEVERITIES[v] for k, v in sev.items()},
        'traffic': settings['traffic_multiplier'] * pick('heavy_traffic', 'traffic', 1.0),
        'closure_hours': pick('road_closure', 'closure_hours', 0.0),
        'hub_temp_c': hub_temp,
        'truck_temp_c': hub_temp + pick('refrigeration_failure', 'temp_c', 0),
        'humidity_loss_fraction': humidity,
        'quantity_after_damage_kg': req.quantity_kg * (1 - pick('product_damage', 'qty_loss', 0.0)),
        'grade': grade,
        'committed_capacity_left': capacity_left,
        'committed_price_factor': pick('price_drop', 'price_factor', 1.0),
        'unavailable_morning': unavailable_morning,
    }


def capacities(ds, req, cond):
    caps = {b: float(v['capacity_kg']) for b, v in ds['buyers'].items()}
    caps[req.buyer_id] *= cond['committed_capacity_left']
    return caps


def unavailable_now(req, cond):
    out = list(cond['unavailable_morning'])
    if cond['committed_capacity_left'] == 0:
        out.append(req.buyer_id)
    return sorted(set(out))


def plan_time_choice(ds, commodity, req, settings, est0, buffer, unavailable_morning):
    """C/D planning on FORECAST conditions. The committed buyer is kept when the forecast says it can accept the
    load; otherwise the best feasible buyer by expected value is chosen. Morning availability is known;
    disruptions that happen after dispatch are not."""
    fr = ds['freshness']
    best, best_net = req.buyer_id, None
    feasible = {}
    for buyer_id in ds['buyers']:
        if buyer_id in unavailable_morning:
            continue
        key = f'{req.origin_id}>{buyer_id}'
        if key not in ds['routes']:
            continue
        r = ds['routes'][key]
        hours = r['freeflow_minutes'] / 60 * settings['traffic_multiplier']
        temp = fr['base_temperature_c'] + settings['temperature_shift_c']
        aging = thermal_age(fr['fefo_queue_hours'] + hours, temp, commodity['q10'], fr['base_temperature_c'])
        arrival_low = est0 - buffer - aging
        b = ds['buyers'][buyer_id]
        ok = (arrival_low >= min_rsl(ds, commodity, buyer_id) and req.quantity_kg <= b['capacity_kg']
              and req.quality_grade in b['accepted_grades'].split(','))
        if not ok:
            continue
        price = offer_price(ds, commodity, buyer_id, req.quality_grade, est0 - aging, settings, {})
        feasible[buyer_id] = req.quantity_kg * price - (ds['costs']['truck_fixed_inr'] + r['distance_km'] * ds['costs']['truck_per_km_inr'])
    if req.buyer_id in feasible or not feasible:
        return req.buyer_id
    return max(feasible, key=feasible.get)


def drive_path(ds, commodity, req, settings, cond, rsl0, plan, queue_hours, divert_to=None):
    """Simulate the physical journey with TRUE shelf life. Returns timeline, km, hours, arrival RSL."""
    fr = ds['freshness']
    q10, base = commodity['q10'], fr['base_temperature_c']
    plan_key, r = route(ds, req.origin_id, plan)
    f = fr['checkpoint_fraction']
    route_hours = r['freeflow_minutes'] / 60 * cond['traffic']
    closure = cond['closure_hours'] if plan == req.buyer_id else 0.0
    t, rsl, km = 0.0, rsl0, 0.0
    timeline = [{'hours': 0.0, 'rsl_hours': rsl, 'label': 'At hub'}]

    def step(hours, temp, label, distance=0.0):
        nonlocal t, rsl, km
        t += hours
        rsl = max(0.0, rsl - thermal_age(hours, temp, q10, base))
        km += distance
        timeline.append({'hours': round(t, 3), 'rsl_hours': round(rsl, 3), 'label': label})

    step(queue_hours, cond['hub_temp_c'], 'Loaded and dispatched')
    step(route_hours * f, cond['truck_temp_c'], 'Checkpoint — disruption detected', r['distance_km'] * f)
    if cond['humidity_loss_fraction']:
        rsl = max(0.0, rsl * (1 - cond['humidity_loss_fraction']))
        timeline[-1]['rsl_hours'] = round(rsl, 3)
    leg_key = None
    if divert_to:
        leg = ds['legs'][plan_key][divert_to]
        step(settings['approval_delay_hours'], cond['truck_temp_c'], 'Waiting for approval')
        step(leg['freeflow_minutes'] / 60 * cond['traffic'], cond['truck_temp_c'], f'Arrived at {divert_to}', leg['distance_km'])
        leg_key = [plan_key, divert_to]
    else:
        detour_km = closure * 15.0  # synthetic detour speed assumption
        step(route_hours * (1 - f) + closure, cond['truck_temp_c'], f'Arrived at {plan}', r['distance_km'] * (1 - f) + detour_km)
    return {'timeline': timeline, 'lead_time_hours': t, 'arrival_rsl_hours': rsl, 'distance_km': km,
            'route_key': plan_key, 'leg': leg_key}


def outcome(ds, commodity, req, settings, cond, strategy, path, buyer_id, diverted, status):
    costs = ds['costs']
    buyer = ds['buyers'][buyer_id]
    qty = cond['quantity_after_damage_kg']
    minimum = min_rsl(ds, commodity, buyer_id)
    available = buyer['capacity_kg'] * (cond['committed_capacity_left'] if buyer_id == req.buyer_id else 1.0)
    reasons = []
    if buyer_id in unavailable_now(req, cond):
        reasons.append('Buyer cancelled or unavailable')
    elif qty > available:
        reasons.append(f'Buyer can take only {available:,.0f} kg')
    if cond['grade'] not in buyer['accepted_grades'].split(','):
        reasons.append(f'Buyer does not accept grade {cond["grade"]}')
    if path['arrival_rsl_hours'] < minimum:
        reasons.append(f'Arrived with {path["arrival_rsl_hours"]:.1f} h shelf life; buyer needs {minimum:.1f} h')
    accepted = not reasons
    price = offer_price(ds, commodity, buyer_id, cond['grade'], path['arrival_rsl_hours'], settings,
                        {req.buyer_id: cond['committed_price_factor']})
    tech = {'A': costs['tech_inr_kg_A'], 'B': costs['tech_inr_kg_B'], 'C': costs['tech_inr_kg_C'],
            'D': costs['tech_inr_kg_D_base'] + costs['tech_inr_kg_D_agent'] * settings['agent_cost_multiplier']}[strategy]
    revenue = qty * price if accepted else 0.0
    ledger = {
        'procurement_inr': req.quantity_kg * commodity['reference_price_inr_kg'] * costs['procurement_share_of_reference'],
        'transport_inr': costs['truck_fixed_inr'] + path['distance_km'] * costs['truck_per_km_inr'],
        'handling_inr': req.quantity_kg * costs['handling_inr_kg'],
        'rescue_inr': costs['diversion_fixed_inr'] if diverted else 0.0,
        'agent_tech_inr': req.quantity_kg * tech,
    }
    meta = next(s for s in STRATEGIES if s['key'] == strategy)
    return {
        'strategy': strategy, 'model': meta['model'], 'label': meta['label'], 'status': status,
        'buyer_id': buyer_id, 'buyer_name': ds['locations'][buyer_id]['name'], 'channel': buyer['channel'],
        'diverted': diverted, 'lead_time_hours': path['lead_time_hours'], 'arrival_rsl_hours': path['arrival_rsl_hours'],
        'minimum_rsl_hours': minimum, 'accepted': accepted, 'rejection_reasons': reasons,
        'input_kg': req.quantity_kg, 'sellable_kg': qty if accepted else 0.0, 'spoiled_kg': req.quantity_kg - (qty if accepted else 0.0),
        'price_inr_kg': price if accepted else 0.0, 'offer_inr_kg': price, 'revenue_inr': revenue, **ledger,
        'gross_margin_inr': revenue - ledger['procurement_inr'],
        'operating_profit_inr': revenue - sum(ledger.values()),
        'distance_km': path['distance_km'], 'timeline': path['timeline'], 'route_key': path['route_key'], 'leg': path['leg'],
        'evidence_category': 'SIMULATED RESULT',
    }


# ----------------------------------------------------------------------------------- agent hooks

def is_shipment(state):
    return state.get('network') == 'mumbai'


_DATASETS = {}


def register_dataset(ds):
    _DATASETS[ds['id']] = ds


def dataset_for(state):
    return _DATASETS[state['shipment']['dataset_id']]


def agent_options(state):
    """Options from the checkpoint, in the same shape as optimization.alternatives(). Used by the agent tools."""
    ctx = state['shipment']
    ds = dataset_for(state)
    commodity = ds['commodities'][ctx['commodity_id']]
    fr = ds['freshness']
    plan = ctx['plan_buyer_id']
    qty = state['quantity_kg']
    est_cp = state['rsl_hours']
    low_cp = state['rsl_lower_hours']
    plan_key = ctx['plan_route_key']
    route_plan = ds['routes'][plan_key]
    options = []
    for buyer_id, buyer in ds['buyers'].items():
        if buyer_id == state['destination']:
            hours = route_plan['freeflow_minutes'] / 60 * ctx['traffic'] * (1 - fr['checkpoint_fraction']) + ctx['closure_hours_plan']
            km = route_plan['distance_km'] * (1 - fr['checkpoint_fraction']) + ctx['closure_hours_plan'] * 15.0
            rescue = 0.0
        else:
            leg = ds['legs'][plan_key][buyer_id]
            hours = ctx['approval_delay_hours'] + leg['freeflow_minutes'] / 60 * ctx['traffic']
            km = leg['distance_km']
            rescue = ds['costs']['diversion_fixed_inr']
        aging = thermal_age(hours, ctx['truck_temp_c'], commodity['q10'], fr['base_temperature_c'])
        arrival_low = low_cp - aging
        minimum = max(2.0, buyer['min_rsl_fraction'] * commodity['shelf_life_hours_20c'])
        available = state['buyer_capacities'].get(buyer_id, buyer['capacity_kg'])
        reasons = []
        if buyer_id in state['unavailable_buyers']:
            reasons.append('Buyer unavailable or contract cancelled')
        if state['quality_grade'] not in buyer['accepted_grades'].split(','):
            reasons.append('Buyer does not accept this quality grade')
        if arrival_low < minimum:
            reasons.append('Insufficient conservative arrival shelf life')
        if qty > available:
            reasons.append('Buyer capacity exceeded')
        price = offer_price(ds, commodity, buyer_id, state['quality_grade'], est_cp - aging, ctx['settings'], state['price_factors'])
        transport = km * ds['costs']['truck_per_km_inr']
        options.append({
            'id': buyer_id, 'name': ds['locations'][buyer_id]['name'], 'channel': buyer['channel'],
            'price_inr_kg': price, 'travel_hours': hours, 'distance_km': km, 'minimum_rsl_hours': minimum,
            'capacity_kg': buyer['capacity_kg'], 'available_capacity_kg': available,
            'transport_inr_kg': transport / qty, 'rescue_cost_inr_kg': rescue / qty,
            'arrival_rsl_lower_hours': arrival_low, 'feasible': not reasons, 'reasons': reasons,
            'net_proceeds_inr': qty * price - transport - rescue,
            'route': {'origin': 'checkpoint', 'destination': buyer_id, 'reachable': True, 'travel_hours': hours,
                      'path': ['checkpoint', buyer_id], 'source': 'OSRM road distance (OpenStreetMap); simulated traffic'},
        })
    return sorted(options, key=lambda o: (o['feasible'], o['net_proceeds_inr']), reverse=True)


def agent_buyers(state):
    ds = dataset_for(state)
    return {'buyers': [{'id': o['id'], 'name': o['name'], 'channel': o['channel'], 'offer_inr_kg': round(o['price_inr_kg'], 2),
                        'minimum_rsl_hours': round(o['minimum_rsl_hours'], 1)} for o in agent_options(state)],
            'unavailable_buyers': state['unavailable_buyers'], 'price_factors': state['price_factors'],
            'source': f'SYNTHETIC buyer offers ({ds["source"]}); not live market quotes'}


def agent_routes(state):
    return {'routes': [{'origin': 'checkpoint', 'destination': o['id'], 'reachable': True,
                        'travel_hours': round(o['travel_hours'], 2), 'distance_km': round(o['distance_km'], 1),
                        'source': o['route']['source']} for o in agent_options(state)]}


def buyer_ids(state):
    return list(dataset_for(state)['buyers'])


# ----------------------------------------------------------------------------------- orchestration

def simulate_shipment(ds, req, shipment_id):
    """Returns (result, state). The agent investigation is run by the caller on `state`."""
    register_dataset(ds)
    if req.commodity_id not in ds['commodities']:
        raise ShipmentInputError(f'Unknown commodity {req.commodity_id}')
    if ds['locations'].get(req.origin_id, {}).get('type') != 'hub':
        raise ShipmentInputError(f'{req.origin_id} is not a collection hub')
    if req.buyer_id not in ds['buyers']:
        raise ShipmentInputError(f'{req.buyer_id} is not a buyer')
    settings = {**ds['settings'], **req.settings}
    commodity = ds['commodities'][req.commodity_id]
    fr = ds['freshness']
    rng = random.Random(seed_for(settings, req))
    shelf = commodity['shelf_life_hours_20c']
    rsl0 = shelf * fr['hub_rsl_fraction'] * settings['initial_shelf_life_multiplier']
    est0 = max(0.0, rsl0 + rng.gauss(0, settings['prediction_error_hours']))
    buffer = max(fr['buffer_fraction_of_shelf_life'] * shelf, 2 * settings['prediction_error_hours'])
    cond = conditions(ds, commodity, req, settings, rng)
    plan = plan_time_choice(ds, commodity, req, settings, est0, buffer, cond['unavailable_morning'])

    paths = {
        'A': drive_path(ds, commodity, req, settings, cond, rsl0, req.buyer_id, fr['fifo_queue_hours']),
        'B': drive_path(ds, commodity, req, settings, cond, rsl0, req.buyer_id, fr['fefo_queue_hours']),
        'C': drive_path(ds, commodity, req, settings, cond, rsl0, plan, fr['fefo_queue_hours']),
    }
    results = {k: outcome(ds, commodity, req, settings, cond, k, paths[k], req.buyer_id if k in 'AB' else plan, False, 'completed')
               for k in paths}

    # Agent view at the checkpoint: sensor estimate (true temperatures are observed by sensors).
    cp = paths['C']['timeline'][2]
    true_cp = cp['rsl_hours']
    est_cp = max(0.0, true_cp + (est0 - rsl0))
    plan_key = paths['C']['route_key']
    state = {
        'id': shipment_id, 'version': 0, 'status': 'event_detected', 'evidence_category': 'SYNTHETIC',
        'quantity_kg': cond['quantity_after_damage_kg'], 'initial_rsl_hours': est0, 'rsl_hours': est_cp,
        'rsl_lower_hours': max(0.0, est_cp - buffer), 'destination': plan,
        'delay_hours': cond['closure_hours'] if plan == req.buyer_id else 0.0, 'safety_hold': False,
        'event': {'disruptions': [d.model_dump() for d in req.disruptions], 'detected_at': 'checkpoint'},
        'proposal': None, 'agent_mode': None, 'monitoring': True, 'trace': [],
        'current_location': 'checkpoint', 'elapsed_hours': cp['hours'],
        'buyer_capacities': capacities(ds, req, cond), 'unavailable_buyers': unavailable_now(req, cond),
        'price_factors': {req.buyer_id: cond['committed_price_factor']}, 'quality_grade': cond['grade'],
        'network': 'mumbai',
        'shipment': {'dataset_id': ds['id'], 'commodity_id': req.commodity_id, 'origin_id': req.origin_id,
                     'committed_buyer_id': req.buyer_id, 'plan_buyer_id': plan, 'plan_route_key': plan_key,
                     'traffic': cond['traffic'], 'truck_temp_c': cond['truck_temp_c'],
                     'closure_hours_plan': cond['closure_hours'] if plan == req.buyer_id else 0.0,
                     'approval_delay_hours': settings['approval_delay_hours'], 'settings': settings},
    }
    result = {
        'request': req.model_dump(), 'settings': settings, 'commodity': commodity, 'conditions': cond,
        'initial_rsl_hours': rsl0, 'estimated_initial_rsl_hours': est0, 'conservative_buffer_hours': buffer,
        'plan_buyer_id': plan, 'strategies': results, 'paths': paths,
    }
    return result, state


def project_d(ds, result, state):
    """D outcome given the persisted agent state: executed / proposed (if approved) / continuing."""
    req = ShipmentRequest(**result['request'])
    settings, cond = result['settings'], result['conditions']
    commodity = ds['commodities'][req.commodity_id]
    rsl0 = result['initial_rsl_hours']
    plan = result['plan_buyer_id']
    tools = [t['tool'] for t in state['trace']]
    fr = ds['freshness']
    proposal = state.get('proposal')
    executed = 'human_approved' in tools
    if executed or proposal:
        target = state['destination'] if executed else proposal['id']
        path = drive_path(ds, commodity, req, settings, cond, rsl0, plan, fr['fefo_queue_hours'], divert_to=target)
        status = 'executed' if executed else 'proposed_awaiting_approval'
        d = outcome(ds, commodity, req, settings, cond, 'D', path, target, True, status)
    else:
        path = drive_path(ds, commodity, req, settings, cond, rsl0, plan, fr['fefo_queue_hours'])
        status = 'rejected_kept_plan' if 'human_rejected' in tools else (
            'no_intervention_needed' if 'no_intervention_required' in tools else
            'agent_failed' if 'investigation_failed' in tools else 'no_feasible_alternative')
        d = outcome(ds, commodity, req, settings, cond, 'D', path, plan, False, status)
    return d


def narrative(ds, result, d, state):
    """Plain-language explanation built only from computed facts of this run."""
    req = result['request']
    cond = result['conditions']
    a = result['strategies']['A']
    lines = []
    for dtype, severity in cond['severity'].items():
        lines.append(f'{DISRUPTIONS[dtype]["label"]} ({severity}) — {DISRUPTIONS[dtype]["explain"].rstrip(".").lower()}.')
    if a['accepted']:
        lines.append(f'Without FreshFlow, {a["buyer_name"]} would still accept the load after {a["lead_time_hours"]:.1f} h, '
                     f'with {a["arrival_rsl_hours"]:.1f} h of shelf life left.')
    else:
        lines.append(f'Without FreshFlow, the shipment to {a["buyer_name"]} would be rejected: {"; ".join(a["rejection_reasons"]).lower()}.')
    if result['plan_buyer_id'] != req['buyer_id']:
        lines.append(f'Before dispatch, the forecast already showed {a["buyer_name"]} could not accept this load, so smart planning '
                     f'chose {ds["locations"][result["plan_buyer_id"]]["name"]} instead.')
    status = d['status']
    if status in ['executed', 'proposed_awaiting_approval']:
        verb = 'redirected the shipment to' if status == 'executed' else 'proposes diverting to'
        lines.append(f'FreshFlow checked {len(ds["buyers"])} buyers from the checkpoint and {verb} {d["buyer_name"]}: '
                     f'it arrives with {d["arrival_rsl_hours"]:.1f} h left (needs {d["minimum_rsl_hours"]:.1f} h).')
        if status == 'proposed_awaiting_approval':
            lines.append('A diversion changes the commercial plan, so it waits for your approval.')
    elif status == 'no_intervention_needed':
        lines.append('FreshFlow checked every buyer from the checkpoint; keeping the current plan was already the best option, so it did nothing.')
    elif status == 'agent_failed':
        failure = next(t['result'] for t in reversed(state['trace']) if t['tool'] == 'investigation_failed')
        lines.append(f'The live AI agent could not run ({failure.get("message", "provider error")}). Nothing was executed; '
                     'the shipment stays on its plan. Run again with the deterministic agent, or fix the provider account.')
    elif status == 'rejected_kept_plan':
        lines.append('You rejected the diversion, so the shipment continues on its original plan.')
    else:
        lines.append('FreshFlow found no buyer that could accept the shipment in time; it escalated to a human instead of forcing a diversion.')
    return lines


def view(ds, result, state):
    d = project_d(ds, result, state)
    strategies = {**result['strategies'], 'D': d}
    return {'strategies': strategies, 'narrative': narrative(ds, result, d, state),
            'decision_status': d['status'], 'evidence_category': 'SIMULATED RESULT'}
