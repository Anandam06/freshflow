# Frontend handoff — API v1.0.0

Base URL: `http://localhost:8000`. All business paths start `/api/v1`. Configure `CORS_ORIGINS` as comma-separated exact frontend origins. Public mutations require `X-Operator-Key`; ask the operator for it at runtime, never embed the secret into a public bundle. Read-only views expose synthetic data only. This shared key is a demo gate, not production identity management.

| Action | Method and path | Body / result |
|---|---|---|
| Configuration status | `GET /health` | Live-agent configuration boolean, not a provider connectivity check |
| Control tower | `GET /api/v1/batches` | Dedicated T17 demo only |
| Batch and trace | `GET /api/v1/batches/T17` | Persistent state, proposal, version, trace |
| Inject disruption | `POST /api/v1/batches/T17/events` | `{}` uses stored schema defaults; durations are incremental |
| Investigate | `POST /api/v1/batches/T17/investigate` | `{"mode":"deterministic"}` or `{"mode":"live"}` |
| Approve / reject | `POST /api/v1/batches/T17/approval` | `{"approve":true,"expected_version":2}`; use the actual latest version |
| Compare policies | `POST /api/v1/simulations` | `{}` → `{id,result}`; synchronous bounded request |
| Reload comparison | `GET /api/v1/simulations/{id}` | Stored `SimulationResult` |
| Evidence | `GET /api/v1/evidence` | Sources and assumptions |

`shared/fixtures/` contains executed API examples. `shared/api-contract.yaml` defines request bounds and typed financial results. Use `openapi-typescript` or an equivalent generator on that contract if desired.

Display ratios as percentages (multiply by 100 only for display). `margin_percentage_point_change_vs_m0` is already in percentage points. Money is INR; weights kg; durations hours. Null means undefined, not zero. Never present ROI/payback when null. All outcomes are synthetic simulation outputs, not observed savings.

Show each M0–M3 contribution separately; only M3−M2 is incremental intervention-policy benefit. Simulation M3 uses `deterministic_policy_emulation`, not the live language model. T17's live/deterministic mode is separate from simulation mode. Live failure never silently falls back.

Approval becomes available only for `awaiting_approval`. On HTTP 409 reload the batch; an event or another operator may have invalidated the proposal. HTTP 422 means invalid input, 401 missing/wrong operator key, 404 unknown resource, 502 provider failure, and 503 missing production configuration. Retrying an approval with an old version will not execute twice. Do not automatically retry event POSTs: events are incremental exposures. A new event invalidates pending proposals and resumes the exception workflow.

Trace is an append-only list of observable tool inputs/results, not private model reasoning. Execution changes the simulated destination and resumes monitoring. It does not place a real transport order or verify physical delivery. Demo capacity is dedicated to T17; simulation capacities are separately enforced per day. Random dataset row T17 is not the dedicated demo fixture.

Breaking changes require a version bump, regenerated contract, fixture updates and explicit coordination with Claude. Use the single GitHub repository `freshflow` with branches `feat/backend-codex`, `feat/frontend-claude`, and `main` for integration. Frontend location is pending; do not recreate it. Backend is prepared locally for an initial commit and GitHub publication once account authorization is supplied.
