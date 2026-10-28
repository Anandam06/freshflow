# FreshFlow — PPT Evidence Summary

Evidence workbook: `evidence/FreshFlow_Scenario_Validation.xlsx` · Live app: https://freshflow-tatz.onrender.com · API 1.4.0, commit b32cafa · 1140 paired fleet runs (30 seeds × scenario) + live shipment/agent tests.

**All results are SIMULATED on SYNTHETIC data. None is an actual Mumbai operating outcome; no physical truck was rerouted.**
**Reporting convention:** every fleet amount is per simulated 30-day period of 2,000 batches (~1,000 tonnes), averaged across 30 independent runs — never a total across runs. Spoilage rates are the average of the per-run rates. The dashboard uses the same convention and the same stored runs.
Reference format: Scenario → Run ID(s) → Excel sheet/row → source or assumption.

## Slide 3 — Data & Validation

| Claim | Value | Trace |
|---|---|---|
| Commodities implemented | 18 in the Mumbai shipment engine (12 of the 18 on the brief list); fleet simulation is tomato-only | Commodity_Coverage · live /api/v1/network |
| Network | 3 APMC hubs + 12 synthetic buyers = 15 Mumbai/MMR locations; 36 OSRM road routes | Route_ETA_Changes; live_network.json · OSRM/OpenStreetMap |
| Scenarios executed | 31 of 34 brief scenarios executed (26 fleet, 5 live shipment engine); 3 not implemented; +12 declared supplementary | Scenario_Catalog · — |
| Scale | 2,000 batches × 30 days per run; 30 paired seeds per scenario; 1140 fleet runs × 4 strategies = 4,560 strategy-runs; 126 live API shipment tests | Run_Register · — |
| Reproducibility | Same seed + parameters ⇒ identical results on the same platform (S15 reproduced S01 seed-for-seed). Across Linux (live) and Windows (local): A/B exact; C/D differ by up to 10.2% because time-limited CP-SAT solves are platform-sensitive | Live_vs_Local_Check · — |

Suggested wording: *"34 scenarios defined; 26 run as 30-seed paired fleet experiments and 5 on the live Mumbai engine; 3 flagged not implemented. Every number links to an inspectable Excel workbook with run IDs and seeds."*

## Slide 5 — Business Impact

| Claim | Value | Trace |
|---|---|---|
| Baseline spoilage A vs D (S01) | A 26.4% → D 9.5% (C 9.7%); average of per-run rates | Spoilage_Comparison!row 3 · S01 · LOCAL-S01-60000…60029 |
| Baseline profit A vs D (S01) | A ₹37.2 lakh → D ₹76.5 lakh per simulated 30-day period, mean of runs (D − A ₹39.2 lakh; D > A in 100% of seeds) | Profit_Comparison!row 3 · S01 |
| Incremental D vs C (S01, no disruptions) | ₹-52,883 per 30-day period (P05 ₹-89,241, P95 ₹2,132); D > C in 7% of seeds | Profit_Comparison!row 3 · S01 |
| Incremental D vs C (X01, 30% disrupted) | ₹18.6 lakh per 30-day period (P05 ₹15.6 lakh, P95 ₹21.5 lakh); D > C in 100% of seeds; spoilage C 19.4% → D 12.2% | Profit_Comparison!row 29 · X01 (supplementary) |
| Scenarios where D improves profit vs A | 26 of 26 executed fleet scenarios | Profit_Comparison · S-scenarios |
| Scenarios where D does NOT beat C | 25 of 26 brief fleet scenarios (20 of 21 after removing 5 that reproduce S01 exactly: S02, S03, S04, S05, S15). All of these have zero disruption probability (app default); the only brief scenario with disruptions (S32) has D > C. With disruptions (X-family) D beats C in 12 of 12 | Profit_Comparison; Sensitivity_Analysis · — |
| D − C on the live platform (X01) | Live Linux deployment, seeds 60000–60005: mean D − C ₹17.6 lakh (local Windows, same seeds: ₹17.0 lakh) | Live_vs_Local_Check · X01 live run IDs in Run_Register |
| Representative rescue (live) | S06 road closure: Supermarket · Andheri West would reject (Arrived with 28.1 h shelf life; buyer needs 28.8 h); agent proposes Supermarket · Bandra West, 25.6 km, arrival RSL 34.4 h; D profit ₹11,965 vs A ₹-18,793 | Route_ETA_Changes; Agent_Action_Log · S06 · S-0c397cfb23 |
| Live Claude agent | AG1 S-13424dda08: Claude (claude-haiku-5-5) called tools, proposed a diversion, human approved, state changed B02→B05 | Agent_Validation · AG1 |
| Limiting assumption | All data are synthetic; no field calibration. Fleet engine is tomato-only on a 3-buyer synthetic graph; traffic is a simulated multiplier, not live traffic. | README; Assumptions · — |

### What the numbers say (read before choosing headlines)

1. **The big gain is optimization, not the agent alone.** In the baseline (S01), A → D cuts spoilage from 26.4% to 9.5% and raises profit per 30-day period from ₹37.2 lakh to ₹76.5 lakh — but C (optimization without the agent) already reaches 9.7% and ₹77.0 lakh. (Profit_Comparison row 3, Spoilage_Comparison row 3; S01 → LOCAL-S01-60000…60029)
2. **Without disruptions the agent costs slightly more than it saves.** S01 D − C = ₹-52,883 per 30-day period (P05 ₹-89,241, P95 ₹2,132); D beats C in 7% of seeds. (Profit_Comparison row 3)
3. **With disruptions the agent pays.** X01 (30% of lots disrupted, declared supplementary): D − C = ₹18.6 lakh (P05 ₹15.6 lakh, P95 ₹21.5 lakh), D beats C in 100% of seeds; spoilage C 19.4% → D 12.2%. (Profit_Comparison row 29, Spoilage_Comparison row 29)
4. D beats A in 26 of 26 executed brief fleet scenarios. D does **not** beat C in 25 of 26 — 20 of 21 once the 5 scenarios that reproduce S01 exactly (S02, S03, S04, S05, S15) are removed. Every one of them has zero disruptions (the app default); the only brief scenario with disruptions, S32, has D > C. With disruptions, D beats C in 12 of 12 X-scenarios.
4b. **Solver caveat on magnitudes.** ~82% of daily C/D allocations stop at the CP-SAT time limit (feasible, not proven optimal). On the live Linux deployment, X01 seeds 60000–60005 give mean D − C ₹17.6 lakh vs ₹17.0 lakh locally on the same seeds. Quote D − C as "about ₹15–20 lakh per simulated 30-day period under 30% disruption", not as a precise figure.
5. Largest agentic contribution: X03 Moderate traffic, p=0.30 (D − C ₹20.2 lakh); weakest: S33 Agent is not worth the cost (D − C ₹-9.9 lakh). See Sensitivity_Analysis.
6. S02–S05 (traffic only) are identical to S01: the fleet engine applies traffic only to disrupted lots and the default disruption probability is 0. Do not cite S02–S05 as traffic evidence; use X02–X05.

### Representative rescue (live Mumbai engine)
S06 road closure (high), tomato 800 kg, Turbhe APMC (H1) → Supermarket · Andheri West (B02). Traditional plan: 105.1 km, 7.91 h, rejected (Arrived with 28.1 h shelf life; buyer needs 28.8 h), profit ₹-18,793. FreshFlow checks 12 buyers from the simulated checkpoint and proposes Supermarket · Bandra West: 25.6 km, 1.58 h, arrives with 34.4 h shelf life, profit ₹11,965 if approved. Run S-0c397cfb23 → Route_ETA_Changes, Agent_Action_Log. OSRM distances, simulated traffic (×2.0).

### Live Claude agent proof
AG1 S-13424dda08 (buyer cancellation, live mode): claude-haiku-5-5 made 8 tool calls (23,579 input / 466 output tokens, ≈ $0.0026); proposal → human approved → destination B02 → B05, state version 0 → 1; replaying the stale approval returned HTTP 409. AG3 shows a human rejection (plan kept); AG5 shows "no feasible buyer" with nothing executed. → Agent_Validation, Agent_Action_Log, agent_traces.json

Note: fleet-scale D results (S/X scenarios) use a deterministic emulation of the agent policy, not live Claude calls.

## Recommended charts
- Profit_Comparison chart 2: mean profit A/B/C/D for S01 vs X01 — shows optimization gain and where the agent adds value.
- Spoilage_Comparison chart: spoilage A/B/C/D by scenario.
- Profit_Comparison chart 1: D − C by scenario — honest view of when the agent is and is not worth it.

## Limitations to disclose on the slide or in notes
- Synthetic data, no field calibration; percentiles are simulation variability, not confidence intervals.
- Fleet experiments are tomato-only on a 3-buyer synthetic junction graph; the 18-commodity Mumbai engine evaluates single shipments.
- 18 commodities implemented, 12 of the 18 on the brief list (missing: papaya, guava, pomegranate, cabbage, cauliflower, okra).
- Traffic is a simulated multiplier on OSRM free-flow times — no live traffic feed.
- S07 loading delay, S13 ripening, S26 agent execution failure: NOT IMPLEMENTED.
- Fleet runs executed locally on the deployed commit; A/B match the live site exactly, C/D differ by up to 10.2% (time-limited CP-SAT, platform-sensitive).
- The app default has 0% disruptions, so most brief scenarios measure calm conditions; agentic value appears only when disruptions occur (X-family, S32).

## PPT link label
"Explore all simulation scenarios and results" → link to the shared copy of `FreshFlow_Scenario_Validation.xlsx` (never a localhost URL).
