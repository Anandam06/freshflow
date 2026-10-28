# Calibration log

2026-10-27: Initial synthetic-v1 assumptions frozen for demonstration. No empirical calibration or target tuning performed. Evaluation seeds start at 2026 and increment per repetition. Any future fitting must use separate calibration seeds/data (suggested 0–999), record parameter changes and evidence, and reserve unseen evaluation seeds before measuring performance. Current demonstration is not an out-of-sample validation of a fitted scientific model.

UC Davis describes maturity-dependent temperature needs and humidity-related quality risks. This implementation uses a simpler uncalibrated thermal-age proxy; it omits maturity, humidity, chilling injury, microbial growth and cultivar effects. Quality RSL must never be treated as a food-safety clearance.

Implementation review: the first exploratory run assigned every M0/M1 batch to Retailer A. This unnecessarily restricted the baseline to one channel. Before publishing the experiment artifact, replaced it with a fixed 50/30/20 batch-ID channel split shared by M0/M1. This is a documented structural assumption revision, not fitted evidence. The exploratory seeds are therefore not untouched holdout data; independent validation still requires new seeds and observed data. No numerical coefficients were tuned to the case targets.

## Engine v2 — supersedes the uncalibrated v1 experiment

The execution assignment explicitly requested baseline calibration to the case-specified 25–30% range. Only M0 outcomes on calibration seeds 101, 102, 103 were used. The initial RSL scale grid 0.8–1.4 at disruption probability 0.3 missed the range (best 34.56%). Before independent evaluation, expanded the grid to probabilities 0/0.1/0.2 and scales 1/1.2/1.4. All trials, the failed first grid and selection objective are preserved in `data/scenarios/calibration.json`.

Frozen selection: initial-RSL scale 1.4 and temperature/traffic disruption probability 0.0, giving calibration M0 mean spoilage 27.3215%. Cancellation probability remains 0.03 and buyer availability 0.95. This boundary solution is a material model limitation: a single aggregate loss target cannot identify realistic disruption frequencies or prove scientific validity. It is not evidence that real operations have no disruptions. The stress scenarios explicitly restore traffic/temperature disruptions.

Parameters were frozen before evaluating seeds 60000–60009. Nine scenarios use all ten seeds without selection. No M1/M2/M3 outcomes were used to choose calibration parameters, and evaluation outcomes are not fed back into tuning. Existing older v1 reports and seeds 2026–2028 are developmental artifacts, not v2 validation. Do not mix their results.
