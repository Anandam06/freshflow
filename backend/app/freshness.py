"""Illustrative thermal-age quality proxy, NOT a food-safety model."""

ASSUMPTIONS_VERSION = 'synthetic-v2'


def predict_rsl(initial_hours: float, temperature_c: float, duration_hours: float,
                uncertainty_hours: float = 6) -> dict:
    # Q10=2 at 20C is an uncalibrated synthetic assumption, not a fitted coefficient.
    thermal_age = duration_hours * 2 ** ((temperature_c - 20) / 10)
    mean = max(0.0, initial_hours - thermal_age)
    return {'rsl_hours': mean, 'rsl_lower_hours': max(0.0, mean - uncertainty_hours),
            'thermal_age_hours': thermal_age, 'uncertainty_hours': uncertainty_hours,
            'method': 'synthetic thermal-age proxy; lower bound is not a confidence interval'}
