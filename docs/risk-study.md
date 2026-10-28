# Frozen-parameter risk study

SIMULATED RESULT, not field evidence. All nine scenarios use the same prespecified evaluation seeds starting at 60000, disjoint from calibration seeds 101–103. No scenario result is used to tune parameters.

| Scenario | Mean M3 spoilage | Mean M3 profit (INR) | Mean M3−M2 (INR) | P(M3 < M2) | Both targets |
|---|---:|---:|---:|---:|---:|
| baseline | 10.37% | 7,521,564.00 | -51,931.73 | 90% | 6/10 |
| pessimistic | 39.15% | -4,862,306.32 | 861,027.42 | 0% | 0/10 |
| optimistic | 2.20% | 12,118,879.40 | -53,204.47 | 100% | 10/10 |
| lower_buyer_availability | 39.97% | 441,037.54 | -93,630.42 | 100% | 0/10 |
| higher_temperature | 11.43% | 7,213,194.33 | -291,645.35 | 100% | 4/10 |
| greater_traffic | 12.91% | 6,326,472.25 | 1,978,333.61 | 0% | 2/10 |
| higher_prediction_error | 13.90% | 6,935,680.24 | 5,451.53 | 70% | 2/10 |
| slower_approvals | 10.37% | 7,508,050.73 | -65,445.00 | 100% | 6/10 |
| higher_ai_cost | 10.37% | 6,621,605.85 | -951,889.88 | 100% | 6/10 |

Profit/spoilage distributions and linearly interpolated 5th–95th percentile ranges are in `data/results/sensitivity.json`. These are simulation percentile ranges, not confidence intervals. Target frequency is conditional on assumed distributions. The mean/median and individual outcomes are all retained.

M3 can underperform because delayed approvals consume freshness, rescue routes have costs, and AI operation costs exceed recovered value. The experiment uses deterministic event-driven orchestration; it does not measure actual LLM decision quality or live token costs.
