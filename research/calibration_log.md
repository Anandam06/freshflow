# Calibration log

2026-10-27: Initial synthetic-v1 assumptions frozen for demonstration. No empirical calibration or target tuning performed. Evaluation seeds start at 2026 and increment per repetition. Any future fitting must use separate calibration seeds/data (suggested 0–999), record parameter changes and evidence, and reserve unseen evaluation seeds before measuring performance. Current demonstration is not an out-of-sample validation of a fitted scientific model.

UC Davis describes maturity-dependent temperature needs and humidity-related quality risks. This implementation uses a simpler uncalibrated thermal-age proxy; it omits maturity, humidity, chilling injury, microbial growth and cultivar effects. Quality RSL must never be treated as a food-safety clearance.

Implementation review: the first exploratory run assigned every M0/M1 batch to Retailer A. This unnecessarily restricted the baseline to one channel. Before publishing the experiment artifact, replaced it with a fixed 50/30/20 batch-ID channel split shared by M0/M1. This is a documented structural assumption revision, not fitted evidence. The exploratory seeds are therefore not untouched holdout data; independent validation still requires new seeds and observed data. No numerical coefficients were tuned to the case targets.
