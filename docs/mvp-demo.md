# Five-minute demo outline

Start with a fresh dedicated SQLite database by setting `FRESHFLOW_DB` to a new filename before starting the backend. Avoid deleting prior traces. The interactive `/docs` page can demonstrate all backend actions while frontend integration is pending.

1. **0:00–0:45:** Run `POST /api/v1/simulations` with 2,000 batches and 3 repetitions. Show M0–M3 results, evidence labels and target failures as well as successes.
2. **0:45–1:15:** Read T17: 500 kg assigned to Retailer A; initial RSL 52 h, conservative RSL 46 h.
3. **1:15–1:45:** Post default event `{}`: 35 C for 6 h and 12 h retailer delay. Updated conservative RSL is about 29 h, making Retailer A infeasible on arrival.
4. **1:45–3:00:** Investigate with `{"mode":"live"}` only with credentials configured. Otherwise use and explicitly label deterministic mode. Show real tool inputs, returned alternatives, policy reasons and pending proposal. Live tool order may vary.
5. **3:00–3:45:** Approve using returned version. Read state again: Wholesale B is persisted, trace includes approval/execution/verification, monitoring resumes. This verifies database state, not physical shipment delivery.
6. **3:45–4:30:** Inject a new safety-hold event. Investigation must escalate for manual review with no rescue proposal. Show stale approvals rejected.
7. **4:30–5:00:** Show assumptions, costs and M3−M2 attribution. State model limitations, deployment status and pilot validation requirements.

The demo is not ready to call “working Agentic AI” until a real provider run is captured and reviewed. Do not present the default fallback or mocked tests as live model evidence.
