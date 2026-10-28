"""Default dataset for the Mumbai shipment playground. ALL values are SYNTHETIC assumptions.

Every value here is exported to the Excel input template and can be replaced by an uploaded
workbook. Nothing is fitted to real data; see research/assumptions.csv and the
Sources_Assumptions sheet for the limitations.
"""
import json
from pathlib import Path

NETWORK_FILE = Path(__file__).resolve().parents[2] / 'data' / 'network' / 'mumbai_network.json'

# shelf_life_hours_20c: total shelf life of fresh produce held at 20 °C.
# q10: thermal-age acceleration per +10 °C (same proxy as freshness.predict_rsl, commodity-specific).
# humidity_sensitivity: share of remaining shelf life lost under a HIGH humidity problem.
# reference_price_inr_kg: illustrative Mumbai wholesale reference, not a market quote.
COMMODITIES = [
    # vegetables
    ('tomato', 'Tomato', 'vegetable', 72, 2.0, 0.10, 30),
    ('onion', 'Onion', 'vegetable', 720, 1.6, 0.05, 30),
    ('potato', 'Potato', 'vegetable', 720, 1.6, 0.05, 25),
    ('spinach', 'Spinach', 'vegetable', 30, 3.0, 0.30, 40),
    ('carrot', 'Carrot', 'vegetable', 168, 2.0, 0.10, 40),
    ('capsicum', 'Capsicum', 'vegetable', 96, 2.2, 0.12, 60),
    ('cucumber', 'Cucumber', 'vegetable', 96, 2.2, 0.15, 30),
    ('brinjal', 'Brinjal', 'vegetable', 96, 2.0, 0.12, 35),
    # fruits
    ('mango', 'Mango', 'fruit', 96, 2.5, 0.10, 120),
    ('banana', 'Banana', 'fruit', 96, 2.5, 0.08, 45),
    ('grapes', 'Grapes', 'fruit', 72, 2.5, 0.20, 90),
    ('orange', 'Orange', 'fruit', 240, 2.0, 0.08, 70),
    ('apple', 'Apple', 'fruit', 336, 1.8, 0.05, 150),
    ('strawberry', 'Strawberry', 'fruit', 36, 3.0, 0.25, 250),
    ('watermelon', 'Watermelon', 'fruit', 240, 1.8, 0.05, 20),
    ('pineapple', 'Pineapple', 'fruit', 120, 2.2, 0.08, 60),
    ('lemon', 'Lemon', 'fruit', 336, 1.8, 0.05, 80),
    ('coconut', 'Tender Coconut', 'fruit', 720, 1.6, 0.03, 40),
]

# Buyer terms by channel (synthetic). min_rsl_fraction × commodity shelf life = minimum shelf life on arrival.
CHANNELS = {
    'retail': {'label': 'Retail', 'price_factor': 1.25, 'min_rsl_fraction': 0.40, 'accepted_grades': 'A,B', 'capacity_kg': 2500},
    'horeca': {'label': 'Hotels & restaurants', 'price_factor': 1.35, 'min_rsl_fraction': 0.30, 'accepted_grades': 'A', 'capacity_kg': 600},
    'wholesale': {'label': 'Wholesale market', 'price_factor': 1.00, 'min_rsl_fraction': 0.15, 'accepted_grades': 'A,B,C', 'capacity_kg': 8000},
    'processor': {'label': 'Food processor', 'price_factor': 0.55, 'min_rsl_fraction': 0.05, 'accepted_grades': 'A,B,C', 'capacity_kg': 12000},
}
# Deterministic per-buyer variation so buyers in the same channel are not identical.
BUYER_VARIATION = {
    'B01': (1.00, 1.30), 'B02': (1.06, 0.90), 'B03': (1.04, 0.80), 'B04': (0.98, 1.10), 'B05': (1.08, 0.70),
    'B06': (1.02, 1.00), 'B07': (0.97, 0.90), 'B08': (0.95, 1.20), 'B09': (1.05, 1.00), 'B10': (1.10, 0.80),
    'B11': (1.00, 1.00), 'B12': (0.96, 1.20),
}

COSTS = {
    'truck_fixed_inr': 1200.0,          # per trip
    'truck_per_km_inr': 38.0,           # per km driven
    'handling_inr_kg': 0.5,
    'diversion_fixed_inr': 1500.0,      # re-documentation + receiving slot for a diversion
    'procurement_share_of_reference': 0.55,
    'tech_inr_kg_A': 0.0, 'tech_inr_kg_B': 0.10, 'tech_inr_kg_C': 0.15,
    'tech_inr_kg_D_base': 0.15, 'tech_inr_kg_D_agent': 0.10,  # D = base + agent × agent_cost_multiplier
}

FRESHNESS = {
    'base_temperature_c': 20.0,
    'hub_rsl_fraction': 0.50,            # produce reaches the hub with half its shelf life left
    'fifo_queue_hours': 2.0,             # A: first-in-first-out loading wait
    'fefo_queue_hours': 0.5,             # B/C/D: first-expiring loaded first
    'checkpoint_fraction': 0.35,         # disruption detected 35% of the way along the planned route
    'buffer_fraction_of_shelf_life': 0.05,  # conservative bound = estimate − max(5% of shelf life, 2 × prediction error)
    'freshness_discount_threshold': 0.5,    # price discount when arrival shelf life < 50% of the buyer minimum + margin
    'max_freshness_discount': 0.15,
    'grade_price_factor_B': 0.90, 'grade_price_factor_C': 0.75,
}

SETTINGS = {
    'seed': 2026,
    'traffic_multiplier': 2.0,   # typical city congestion vs OSRM free-flow (simulated, not live)
    'temperature_shift_c': 0.0,
    'humidity_rh_percent': 90.0,
    'buyer_availability': 1.0,
    'market_price_factor': 1.0,
    'approval_delay_hours': 0.25,
    'agent_cost_multiplier': 1.0,
    'initial_shelf_life_multiplier': 1.0,
    'prediction_error_hours': 1.0,
}
SETTING_BOUNDS = {
    'seed': (0, 2147483647), 'traffic_multiplier': (0.5, 4.0), 'temperature_shift_c': (-5.0, 15.0),
    'humidity_rh_percent': (40.0, 100.0), 'buyer_availability': (0.0, 1.0), 'market_price_factor': (0.3, 3.0),
    'approval_delay_hours': (0.0, 12.0), 'agent_cost_multiplier': (0.0, 20.0),
    'initial_shelf_life_multiplier': (0.3, 2.0), 'prediction_error_hours': (0.0, 24.0),
}

# Low / medium / high effects of each disruption card (synthetic).
DISRUPTIONS = {
    'heavy_traffic': {'label': 'Heavy Traffic', 'traffic': [1.3, 1.7, 2.2],
                      'explain': 'Congestion slows every road in the city.'},
    'road_closure': {'label': 'Road Closure', 'closure_hours': [1.5, 3.0, 5.0],
                     'explain': 'The planned road is closed ahead, forcing a long detour.'},
    'temperature_rise': {'label': 'Temperature Rise', 'temp_c': [4, 8, 12],
                         'explain': 'A heat wave raises the temperature at the hub and on the road.'},
    'refrigeration_failure': {'label': 'Refrigeration Failure', 'temp_c': [6, 10, 14],
                              'explain': 'The truck cooling unit stops working.'},
    'humidity_problem': {'label': 'Humidity Problem', 'humidity_scale': [0.3, 0.6, 1.0],
                         'explain': 'Wrong humidity makes produce wilt or rot faster.'},
    'buyer_cancellation': {'label': 'Buyer Cancellation', 'capacity_left': [0.5, 0.2, 0.0],
                           'explain': 'The planned buyer cuts or cancels the order.'},
    'price_drop': {'label': 'Sudden Price Drop', 'price_factor': [0.9, 0.8, 0.65],
                   'explain': 'The planned buyer lowers the price it will pay.'},
    'product_damage': {'label': 'Product Damage', 'qty_loss': [0.03, 0.08, 0.15], 'grade_drop': [0, 1, 2],
                       'explain': 'Some produce is bruised during loading.'},
}
SEVERITIES = ['low', 'medium', 'high']


def load_network():
    if not NETWORK_FILE.exists():
        raise RuntimeError('data/network/mumbai_network.json missing; run backend/build_mumbai_network.py')
    return json.loads(NETWORK_FILE.read_text(encoding='utf-8'))


def default_dataset():
    network = load_network()
    commodities = {c[0]: {'id': c[0], 'name': c[1], 'category': c[2], 'shelf_life_hours_20c': float(c[3]), 'q10': float(c[4]),
                          'humidity_sensitivity': float(c[5]), 'reference_price_inr_kg': float(c[6])} for c in COMMODITIES}
    locations = {h['id']: {**h, 'type': 'hub', 'channel': '', 'area': h['name']} for h in network['hubs']}
    buyers = {}
    for b in network['buyers']:
        locations[b['id']] = {**b, 'type': 'buyer'}
        ch = CHANNELS[b['channel']]
        price_var, cap_var = BUYER_VARIATION.get(b['id'], (1.0, 1.0))
        buyers[b['id']] = {'buyer_id': b['id'], 'channel': b['channel'], 'price_factor': round(ch['price_factor'] * price_var, 3),
                           'min_rsl_fraction': ch['min_rsl_fraction'], 'accepted_grades': ch['accepted_grades'],
                           'capacity_kg': round(ch['capacity_kg'] * cap_var)}
    routes = {k: {'distance_km': v['distance_km'], 'freeflow_minutes': v['freeflow_minutes']} for k, v in network['routes'].items()}
    legs = {k: {b: {'distance_km': leg['distance_km'], 'freeflow_minutes': leg['freeflow_minutes']} for b, leg in v.items()}
            for k, v in network['diversion_legs'].items()}
    return {'id': 'default', 'locations': locations, 'routes': routes, 'legs': legs, 'commodities': commodities,
            'buyers': buyers, 'costs': dict(COSTS), 'freshness': dict(FRESHNESS), 'settings': dict(SETTINGS),
            'source': 'built-in synthetic dataset'}
