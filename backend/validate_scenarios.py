"""Publish reproducible normal/adverse outputs without target tuning."""
import json
from pathlib import Path
from app.models import SimulationRequest
from app.simulation import simulate

root = Path(__file__).resolve().parents[1]
scenarios = {
    'default': SimulationRequest(),
    'adverse': SimulationRequest(seed=3026, disruption_probability=0.8, price_multiplier=0.6, capacity_multiplier=0.5),
}
results = {name: simulate(config) for name, config in scenarios.items()}
(root / 'data/results').mkdir(parents=True, exist_ok=True)
(root / 'data/results/scenarios.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
lines = ['# Executed synthetic scenario results', '',
         'These are SIMULATED RESULT outputs from uncalibrated synthetic assumptions, not observed business outcomes. Each scenario uses 2,000 batches over 30 days and three repetitions. Evaluation seeds were inspected during development and are not untouched validation data.', '',
         '| Scenario | Model | Mean spoilage | Mean operating profit (INR) | Runs meeting both targets |',
         '|---|---|---:|---:|---:|']
for name, result in results.items():
    for model, summary in result['summary'].items():
        lines.append(f"| {name} | {model} | {summary['mean_spoilage_rate']:.2%} | {summary['mean_operating_profit_inr']:,.2f} | {summary['runs_meeting_both_targets']}/3 |")
    gain = result['summary']['M3']['mean_operating_profit_inr'] - result['summary']['M2']['mean_operating_profit_inr']
    print(f'{name}: M3-M2 incremental intervention-policy profit INR {gain:,.2f}')
lines += ['', 'Default: seeds 2026–2028, disruption probability 0.30, price/capacity multipliers 1. Adverse: seeds 3026–3028, disruption probability 0.80, price multiplier 0.60, capacity multiplier 0.50.', '',
          'M1 can underperform M0 because FEFO alone retains fixed buyer contracts and can prioritize lots that cannot satisfy the assigned buyer; operating technology costs also increase. This is reported rather than hidden. M3−M2 measures deterministic event-driven policy benefit; live LLM quality and execution latency are not measured by these runs.', '',
          'A 3/3 frequency is not proof of a 100% real-world success probability. Negative or zero M0 margin makes relative margin uplift undefined; such runs cannot establish the combined target. No coefficients were fitted to force success.', '',
          'Reproduce: `python backend/validate_scenarios.py`. Full machine-readable results: `data/results/scenarios.json`.']
(root / 'docs/simulation-results.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
