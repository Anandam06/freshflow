"""Prespecified paired-seed scenario study, after baseline-only calibration freezes."""
import argparse
import json
from pathlib import Path
from app.models import SimulationRequest
from app.simulation import simulate

parser = argparse.ArgumentParser()
parser.add_argument('--repetitions', type=int, default=10)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
calibration = json.loads((root / 'data/scenarios/calibration.json').read_text(encoding='utf-8'))
changes = {
    'baseline': {},
    'pessimistic': {'buyer_availability': 0.7, 'disruption_probability': 0.6, 'price_multiplier': 0.7},
    'optimistic': {'buyer_availability': 1, 'disruption_probability': 0, 'price_multiplier': 1.1, 'cancellation_probability': 0},
    'lower_buyer_availability': {'buyer_availability': 0.6},
    'higher_temperature': {'temperature_shift_c': 8},
    'greater_traffic': {'disruption_probability': 0.3, 'traffic_multiplier': 2},
    'higher_prediction_error': {'prediction_error_hours': 12},
    'slower_approvals': {'approval_delay_hours': 8},
    'higher_ai_cost': {'ai_cost_multiplier': 10},
}
results = {}
for name, overrides in changes.items():
    parameters = {'seed': 60000, 'repetitions': args.repetitions,
                  'initial_rsl_scale': calibration['frozen_initial_rsl_scale'],
                  'disruption_probability': calibration['frozen_disruption_probability'], **overrides}
    config = SimulationRequest(**parameters)
    results[name] = simulate(config)
    print(name + ': ' + json.dumps(results[name]['risk']), flush=True)
    (root / 'data/results').mkdir(parents=True, exist_ok=True)
    (root / 'data/results/sensitivity.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
lines = ['# Frozen-parameter risk study', '',
         'SIMULATED RESULT, not field evidence. All nine scenarios use the same prespecified evaluation seeds starting at 60000, disjoint from calibration seeds 101–103. No scenario result is used to tune parameters.', '',
         '| Scenario | Mean M3 spoilage | Mean M3 profit (INR) | Mean M3−M2 (INR) | P(M3 < M2) | Both targets |',
         '|---|---:|---:|---:|---:|---:|']
for name, result in results.items():
    m = result['summary']['M3']
    risk = result['risk']
    lines.append(f"| {name} | {m['mean_spoilage_rate']:.2%} | {m['mean_operating_profit_inr']:,.2f} | {risk['mean_incremental_m3_vs_m2_inr']:,.2f} | {risk['probability_m3_worse_than_m2']:.0%} | {m['runs_meeting_both_targets']}/{m['repetitions']} |")
lines += ['', 'Profit/spoilage distributions and linearly interpolated 5th–95th percentile ranges are in `data/results/sensitivity.json`. These are simulation percentile ranges, not confidence intervals. Target frequency is conditional on assumed distributions. The mean/median and individual outcomes are all retained.', '',
          'M3 can underperform because delayed approvals consume freshness, rescue routes have costs, and AI operation costs exceed recovered value. The experiment uses deterministic event-driven orchestration; it does not measure actual LLM decision quality or live token costs.']
(root / 'docs/risk-study.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
