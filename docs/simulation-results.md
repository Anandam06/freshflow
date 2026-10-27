# Executed synthetic scenario results

These are SIMULATED RESULT outputs from uncalibrated synthetic assumptions, not observed business outcomes. Each scenario uses 2,000 batches over 30 days and three repetitions. Evaluation seeds were inspected during development and are not untouched validation data.

| Scenario | Model | Mean spoilage | Mean operating profit (INR) | Runs meeting both targets |
|---|---|---:|---:|---:|
| default | M0 | 22.85% | 4,268,354.19 | 0/3 |
| default | M1 | 24.33% | 3,667,230.89 | 0/3 |
| default | M2 | 8.41% | 8,286,349.91 | 3/3 |
| default | M3 | 2.00% | 8,680,364.41 | 3/3 |
| adverse | M0 | 54.48% | -7,827,961.16 | 0/3 |
| adverse | M1 | 62.83% | -9,525,668.72 | 0/3 |
| adverse | M2 | 60.82% | -9,169,157.51 | 0/3 |
| adverse | M3 | 60.11% | -9,496,445.16 | 0/3 |

Default: seeds 2026–2028, disruption probability 0.30, price/capacity multipliers 1. Adverse: seeds 3026–3028, disruption probability 0.80, price multiplier 0.60, capacity multiplier 0.50.

M1 can underperform M0 because FEFO alone retains fixed buyer contracts and can prioritize lots that cannot satisfy the assigned buyer; operating technology costs also increase. This is reported rather than hidden. M3−M2 measures deterministic event-driven policy benefit; live LLM quality and execution latency are not measured by these runs.

A 3/3 frequency is not proof of a 100% real-world success probability. Negative or zero M0 margin makes relative margin uplift undefined; such runs cannot establish the combined target. No coefficients were fitted to force success.

Reproduce: `python backend/validate_scenarios.py`. Full machine-readable results: `data/results/scenarios.json`.
