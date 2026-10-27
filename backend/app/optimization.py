"""Enumerate all three channels for one indivisible batch; no global-optimality claim."""

BUYERS = [
    {'id': 'Retailer A', 'price_inr_kg': 32.0, 'travel_hours': 12.0,
     'minimum_rsl_hours': 24.0, 'capacity_kg': 14000.0, 'transport_inr_kg': 2.0},
    {'id': 'Wholesale B', 'price_inr_kg': 24.0, 'travel_hours': 5.0,
     'minimum_rsl_hours': 8.0, 'capacity_kg': 14000.0, 'transport_inr_kg': 1.2},
    {'id': 'Processor C', 'price_inr_kg': 16.0, 'travel_hours': 2.0,
     'minimum_rsl_hours': 2.0, 'capacity_kg': 10000.0, 'transport_inr_kg': 0.8},
]


def alternatives(rsl_lower_hours, quantity_kg, safety_hold=False, delay_hours=0,
                 capacities=None, price_multiplier=1, rescue=False):
    options = []
    for buyer in BUYERS:
        travel = buyer['travel_hours'] + (delay_hours if buyer['id'] == 'Retailer A' else 0)
        available = (capacities or {}).get(buyer['id'], buyer['capacity_kg'])
        arrival = rsl_lower_hours - travel
        reasons = []
        if safety_hold:
            reasons.append('Food-safety hold: diversion prohibited')
        if arrival < buyer['minimum_rsl_hours']:
            reasons.append('Insufficient conservative arrival shelf life')
        if quantity_kg > available:
            reasons.append('Buyer capacity exceeded')
        if quantity_kg > 1000:
            reasons.append('Vehicle payload exceeded')
        rescue_cost = 0.75 if rescue else 0.0
        net = quantity_kg * (buyer['price_inr_kg'] * price_multiplier -
                             buyer['transport_inr_kg'] - rescue_cost)
        options.append({**buyer, 'price_inr_kg': buyer['price_inr_kg'] * price_multiplier,
                        'arrival_rsl_lower_hours': arrival, 'travel_hours': travel,
                        'feasible': not reasons, 'reasons': reasons,
                        'available_capacity_kg': available, 'net_proceeds_inr': net,
                        'rescue_cost_inr_kg': rescue_cost})
    return sorted(options, key=lambda x: (x['feasible'], x['net_proceeds_inr']), reverse=True)
