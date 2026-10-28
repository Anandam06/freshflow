"""Fit only one baseline parameter to the CASE range, before independent evaluation."""
import json
from pathlib import Path
from statistics import mean
from app.models import SimulationRequest
from app.simulation import generate, evaluate
from app.financials import financials

root = Path(__file__).resolve().parents[1]
seeds = [101, 102, 103]
trials = []
for scale in [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]:
    config = SimulationRequest(initial_rsl_scale=scale, disruption_probability=0.3, batches=2000, days=30, repetitions=1)
    rates = [financials(evaluate(generate(config, seed), 'M0', config), 'M0')['spoilage_rate'] for seed in seeds]
    trials.append({'scale': scale, 'spoilage_rates': rates, 'mean': mean(rates)})
    print(f'M0 only: scale={scale}, mean spoilage={mean(rates):.4f}', flush=True)
selected = min(trials, key=lambda t: abs(t['mean'] - 0.275))
initial_trials = list(trials)
for trial in trials:
    trial['disruption_probability'] = 0.3
if not 0.25 <= selected['mean'] <= 0.30:
    # Pre-evaluation expansion after the one-parameter grid fails the case range.
    for probability in [0.0, 0.1, 0.2]:
        for scale in [1.0, 1.2, 1.4]:
            config = SimulationRequest(initial_rsl_scale=scale, disruption_probability=probability, batches=2000, days=30, repetitions=1)
            rates = [financials(evaluate(generate(config, seed), 'M0', config), 'M0')['spoilage_rate'] for seed in seeds]
            trials.append({'scale': scale, 'disruption_probability': probability, 'spoilage_rates': rates, 'mean': mean(rates)})
    selected = min(trials, key=lambda t: abs(t['mean'] - 0.275))
result = {'calibration_id': 'case-baseline-v2', 'source_category': 'CASE', 'target_range': [0.25, 0.30],
          'objective': 'Nearest mean M0 spoilage to 0.275; initial RSL grid followed by recorded probability-grid expansion when initial grid misses range',
          'calibration_seeds': seeds, 'evaluation_seeds_reserved': list(range(60000, 60010)),
          'frozen_initial_rsl_scale': selected['scale'], 'calibration_mean_spoilage': selected['mean'],
          'frozen_disruption_probability': selected['disruption_probability'], 'initial_grid_trials': initial_trials,
          'within_case_range': 0.25 <= selected['mean'] <= 0.30, 'trials': trials,
          'limitation': 'Case-aligned synthetic calibration, not research or field validation; no M1–M3 outcomes used.'}
(root / 'data/scenarios').mkdir(parents=True, exist_ok=True)
(root / 'data/scenarios/calibration.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k: result[k] for k in ['frozen_initial_rsl_scale', 'calibration_mean_spoilage', 'within_case_range']}))
