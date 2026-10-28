"""CP-SAT daily allocation and exact three-channel intervention subproblems."""

BUYERS = [
    {'id': 'Retailer A', 'price_inr_kg': 32.0, 'travel_hours': 12.0,
     'minimum_rsl_hours': 24.0, 'capacity_kg': 14000.0, 'transport_inr_kg': 2.0},
    {'id': 'Wholesale B', 'price_inr_kg': 24.0, 'travel_hours': 5.0,
     'minimum_rsl_hours': 8.0, 'capacity_kg': 14000.0, 'transport_inr_kg': 1.2},
    {'id': 'Processor C', 'price_inr_kg': 16.0, 'travel_hours': 2.0,
     'minimum_rsl_hours': 2.0, 'capacity_kg': 10000.0, 'transport_inr_kg': 0.8},
]


def alternatives(rsl_lower_hours, quantity_kg, safety_hold=False, delay_hours=0,
                 capacities=None, price_multiplier=1, rescue=False, current_location='junction',
                 elapsed_hours=6, unavailable_buyers=None, price_factors=None, quality_grade='A'):
    options = []
    for buyer in BUYERS:
        route = calculate_route_eta(current_location, buyer['id'], delay_hours)
        travel = route['travel_hours']
        available = (capacities or {}).get(buyer['id'], buyer['capacity_kg'])
        arrival = rsl_lower_hours - travel
        reasons = []
        if not route['reachable']:
            reasons.append('No feasible route from current shipment location')
        if buyer['id'] in (unavailable_buyers or []):
            reasons.append('Buyer unavailable or contract cancelled')
        if quality_grade == 'C' and buyer['id'] == 'Retailer A':
            reasons.append('Retail grade requirement not met')
        if elapsed_hours + travel > 30:
            reasons.append('Buyer receiving window exceeded')
        if safety_hold:
            reasons.append('Food-safety hold: diversion prohibited')
        if arrival < buyer['minimum_rsl_hours']:
            reasons.append('Insufficient conservative arrival shelf life')
        if quantity_kg > available:
            reasons.append('Buyer capacity exceeded')
        if quantity_kg > 1000:
            reasons.append('Vehicle payload exceeded')
        rescue_cost = 0.75 if rescue else 0.0
        price = buyer['price_inr_kg'] * price_multiplier * (price_factors or {}).get(buyer['id'], 1)
        net = quantity_kg * (price -
                             buyer['transport_inr_kg'] - rescue_cost)
        options.append({**buyer, 'price_inr_kg': price, 'route': route,
                        'arrival_rsl_lower_hours': arrival, 'travel_hours': travel,
                        'feasible': not reasons, 'reasons': reasons,
                        'available_capacity_kg': available, 'net_proceeds_inr': net,
                        'rescue_cost_inr_kg': rescue_cost})
    return sorted(options, key=lambda x: (x['feasible'], x['net_proceeds_inr']), reverse=True)


def calculate_route_eta(current_location, destination, delay_hours=0):
    # Explicit synthetic road graph: depot -> junction (6h), then three branches.
    remaining = {b['id']: b['travel_hours'] for b in BUYERS}
    reachable = current_location in ['depot', 'junction'] and destination in remaining
    travel = remaining.get(destination, 0) + (6 if current_location == 'depot' else 0)
    if destination == 'Retailer A':
        travel += delay_hours
    return {'origin': current_location, 'destination': destination, 'reachable': reachable,
            'travel_hours': travel, 'path': [current_location, destination] if current_location != 'depot' else ['depot', 'junction', destination],
            'source': 'SYNTHETIC graph; not map-derived routing'}


def optimize_destination(options):
    """Exact enumeration of a one-lot binary allocation problem, including no-sale option.

    max sum(x_j * net_j), sum(x_j)<=1, x_j in {0,1}; infeasible x_j=0.
    This solves this bounded subproblem exactly; multi-lot dispatch remains sequential.
    """
    return max((o for o in options if o['feasible'] and o['net_proceeds_inr'] > 0),
               key=lambda o: o['net_proceeds_inr'], default=None)


def allocate_day(batches, candidate_lists, capacities, fleet_capacity):
    """Joint whole-lot allocation using OR-Tools CP-SAT with fixed FEFO slots."""
    from ortools.sat.python import cp_model
    model = cp_model.CpModel()
    variables = {}
    for i, options in enumerate(candidate_lists):
        for j, option in enumerate(options):
            if option['feasible'] and option['net_proceeds_inr'] > 0:
                variables[i, j] = model.new_bool_var(f'x_{i}_{j}')
        model.add(sum(v for (bi, _), v in variables.items() if bi == i) <= 1)
    for buyer, capacity in capacities.items():
        model.add(sum(int(batches[i]['quantity_kg']) * variable for (i, j), variable in variables.items()
                      if candidate_lists[i][j]['id'] == buyer) <= int(capacity))
    model.add(sum(int(batches[i]['quantity_kg']) * v for (i, _), v in variables.items()) <= int(fleet_capacity))
    model.maximize(sum(round(candidate_lists[i][j]['net_proceeds_inr'] * 100) * v for (i, j), v in variables.items()))
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_deterministic_time = 0.05
    status = solver.solve(model)
    selections = [None] * len(batches)
    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        for (i, j), variable in variables.items():
            if solver.value(variable):
                selections[i] = {**candidate_lists[i][j], 'solver_status': solver.status_name(status)}
    else:
        # Explicit, reproducible feasible fallback if deterministic search budget expires.
        remaining, fleet = dict(capacities), fleet_capacity
        for i, options in enumerate(candidate_lists):
            q = batches[i]['quantity_kg']
            option = optimize_destination([o for o in options if q <= remaining[o['id']] and q <= fleet])
            if option:
                selections[i] = {**option, 'solver_status': 'GREEDY_FALLBACK_' + solver.status_name(status)}
                remaining[option['id']] -= q
                fleet -= q
    return selections
