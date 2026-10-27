# Model and system boundaries

Sense → predict → detect → decide → act → verify → replan. Synthetic events update a persistent batch. Tool-based investigation reads batch state, freshness, buyers/routes, ranks options, checks policy and proposes an action. Human approval revalidates policy and commits a destination change atomically with its trace. Optimistic version checks reject stale investigations and approvals. Subsequent events trigger another investigation. Physical actuation remains a simulated adapter.

The live Responses API loop lets the model select tool order and inspect exceptions, bounded to 10 responses and 16 calls. Tool prerequisites and policy are deterministic. The model cannot call approval, invent authoritative prices, override a safety hold or change buyer constraints. Credentials and model name must be explicitly configured. Mock-provider tests validate protocol plumbing, not actual model competence. Tool results follow the [official function-calling workflow](https://developers.openai.com/api/docs/guides/function-calling).

## Simulation

M0 uses arrival order, static buyer assignments (50% retailer, 30% wholesale, 20% processor by batch-ID bucket), and morning prices. M1 keeps those same assignments and changes dispatch order to FEFO. M2 uses FEFO and enumerates available buyers for each lot at morning planning time, maximizing net proceeds subject to quality, payload and remaining capacity. M3 starts with the identical M2 plan, then uses realized disruption observations to divert infeasible deliveries. Each model sees the same batches and exogenous event draws. Planning receives no future-event fields. Full-batch allocations are sequential; there is no claim of globally optimal fleet routing. No overnight carryover is modeled.

Daily buyer reservations cannot exceed capacity; fleet dispatch mass is bounded and each lot is below vehicle payload. M3 releases a superseded reservation before reallocation and retains original transport as a sunk cost. Transport costs for diversion are added, not substituted. Unallocated, rejected and safety-held lots are conservatively written off. Thus the reported spoilage measure includes commercial unsold inventory. Safety violations count dispatch outcomes violating known holds; zero is an enforced invariant, not evidence of real-world safety.

The quality proxy is `remaining = max(0, initial - duration × 2^((temperature−20)/10))`. Queue aging is also subtracted. Conservative RSL is remaining minus six hours, floored at zero. The buffer is not a calibrated confidence interval. [UC Davis Tomato Produce Facts](https://postharvest.ucdavis.edu/produce-facts-sheets/tomato) supports temperature/maturity dependence; it does not supply or validate these coefficients. Humidity, cultivar, chilling injury and pathogens are not modeled. See the assumption register before making any scientific claim.

## Financial definitions

- Gross revenue = accepted kg × channel price. Rejected/write-off lots produce zero revenue.
- Operating profit = revenue − procurement − transport − handling − rescue − technology operations. Procurement applies to all input kg. Write-offs and markdowns are not subtracted again.
- Net realization per input kg = (revenue − all operating costs except procurement) / input kg.
- **Net batch realization margin** is operationally defined as operating profit / gross revenue, equal to operating profit margin. This interpretation needs confirmation against the original case wording. It is undefined when revenue is zero.
- Relative margin uplift = Mx margin / M0 margin − 1, defined only for positive baseline margin. Percentage-point change = 100 × (Mx margin − M0 margin).
- Incremental profit is Mx−M0. Incremental event-driven policy profit is M3−M2. Do not attribute M1/M2 improvements to the agent.
- M3 period ROI = (incremental operating profit vs M0 − setup cost) / setup cost. Payback days = setup cost / average daily incremental profit. Null when economically undefined. Extrapolated payback assumes the period repeats; it is not a forecast.
- Buyer rejection denominator: attempted non-held deliveries. On-time fulfilment denominator: all input batches, deadline 24 hours including queue. Rescue success denominator: all M3 intervention attempts, success requires acceptance at a changed destination.
- Target success: spoilage below 10% AND relative margin uplift at least 12%. Probability is an empirical frequency across seeded repetitions, not a population estimate or statistical assurance.

All prices/costs and operating conditions are illustrative. Case loss baseline 25–30% is not imposed on the generator. Failure to match it or meet targets must remain visible. Calibration and final evaluation must remain separate if fitting is introduced later.
