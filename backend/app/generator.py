"""Seeded latent conditions, observations and exogenous market events."""
from datetime import datetime, timedelta, timezone
import random
from .models import BatchRecord
from .optimization import BUYERS


def generate(config, seed):
    rng = random.Random(seed)
    batches = []
    for i in range(config.batches):
        day = i * config.days // config.batches
        market = random.Random(seed * 1009 + day * 9176)
        buyers = [{**buyer, 'available': market.random() < config.buyer_availability,
                   'demand_kg': buyer['capacity_kg'] * market.uniform(0.8, 1.0)} for buyer in BUYERS]
        cancellations = [buyer['id'] for buyer in BUYERS if market.random() < config.cancellation_probability]
        price_factors = {buyer['id']: market.uniform(0.85, 1.15) for buyer in BUYERS}
        maturity = rng.choice(['mature_green', 'pink', 'red'])
        grade = rng.choices(['A', 'B', 'C'], weights=[0.5, 0.4, 0.1])[0]
        physical_rsl = rng.uniform(28, 100) * config.initial_rsl_scale
        physical_rsl *= {'mature_green': 1.2, 'pink': 1, 'red': 0.8}[maturity]
        physical_rsl *= {'A': 1, 'B': 0.9, 'C': 0.75}[grade]
        estimate = max(0, physical_rsl + rng.gauss(0, config.prediction_error_hours))
        disrupted = rng.random() < config.disruption_probability
        temperature = (rng.uniform(30, 38) if disrupted else 20) + config.temperature_shift_c
        observed_temperature = temperature + rng.gauss(0, 0.5)
        humidity = rng.uniform(70, 98)
        dispatch = datetime(2026, 1, 1, 6, tzinfo=timezone.utc) + timedelta(days=day)
        harvest = dispatch - timedelta(hours=rng.uniform(6, 24))
        safety_hold = rng.random() < 0.01
        batch = {'id': f'T{i+1}', 'day': day, 'quantity_kg': float(rng.randint(200, 800)),
                 'morning_buyer': BUYERS[0 if i % 10 < 5 else 1 if i % 10 < 8 else 2]['id'],
                 'maturity': maturity, 'quality_grade': grade,
                 'harvest_timestamp': harvest.isoformat(), 'dispatch_timestamp': dispatch.isoformat(),
                 'collection_location': 'collection_center', 'dispatch_location': 'depot',
                 'initial_rsl_hours': estimate, 'procurement_inr_kg': rng.uniform(10, 16),
                 'physical_condition': {'initial_rsl_hours': physical_rsl, 'safety_hold': safety_hold},
                 'sensor_observation': {'initial_rsl_hours': estimate, 'temperature_c': 20,
                                        'humidity_percent': 90, 'prediction_error_sd_hours': config.prediction_error_hours},
                 'buyer_snapshot': buyers,
                 'future_event': {'temperature_c': observed_temperature, 'physical_temperature_c': temperature,
                                  'humidity_percent': humidity, 'duration_hours': 6,
                                  'temperature_history': [{'start_hour': 0, 'end_hour': 6, 'physical_c': temperature, 'observed_c': observed_temperature}],
                                  'humidity_history': [{'start_hour': 0, 'end_hour': 6, 'relative_humidity_percent': humidity}],
                                  'delay_hours': rng.uniform(8, 18) * config.traffic_multiplier if disrupted else 0,
                                  'safety_hold': safety_hold, 'cancelled_buyers': cancellations,
                                  'price_factors': price_factors, 'observed_at_hour': 6, 'current_location': 'junction'}}
        batches.append(BatchRecord.model_validate(batch).model_dump())
    return batches


def planning_view(batch):
    return {k: v for k, v in batch.items() if k not in ['future_event', 'physical_condition']}
