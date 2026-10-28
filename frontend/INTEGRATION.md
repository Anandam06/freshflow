# Frontend ↔ backend integration notes

Contract: `shared/api-contract.yaml` **v1.2.0**. On 2026-10-28 Claude Code took over the backend from Codex (handover). Backend changes since v1.1.0 are listed in `shared/CONTRACT_CHANGELOG.md`.

## What the frontend consumes

| Screen | Endpoints |
|---|---|
| All | `GET /api/v1/health` (`live_agent_configured` drives the live-agent option) |
| Overview, Compare, Scenarios | `GET /api/v1/scenarios/defaults`, `POST /api/v1/simulations`, `GET /api/v1/simulations/{id}` |
| Risk | `GET /api/v1/scenarios/sensitivity` (404 → "study not available" empty state) |
| Tower | `GET /api/v1/batches`, `GET /api/v1/simulations/{id}/batches?offset&limit` |
| Replay (T17) | `GET /api/v1/batches/T17`, `POST …/events`, `POST …/investigate`, `POST …/approval` |
| Replay (run) | `GET /api/v1/simulations/{id}/decisions/{batch}`, `POST …/approve`, `POST …/reject` |
| Evidence | `GET /api/v1/evidence` |

All responses are validated with zod (`src/types/api.ts`). A missing or mistyped required field shows a "Contract mismatch" error naming the path — never silent zeros. Extra fields are tolerated. `tests/contract.test.ts` fails if the TS schemas and the YAML properties for `Metrics`, `ModelSummary`, `BatchState`, `SimulationRequest` and `SimulationResult` diverge.

Error handling follows `docs/integration.md`: 401 → operator-key prompt; 409 → "batch state changed, reload"; 422 → field-level messages from FastAPI `detail`; 502 → "provider failed, nothing executed"; 503 → "backend not configured". Event POSTs are never retried automatically.

## Resolved in v1.2.0

- Run decisions no longer ask a human to approve "no change". When the best option is the current plan, the trace records `no_intervention_required`.
- T17 can be reset: `POST /api/v1/batches/T17/reset` (operator-gated). Versions keep increasing, so stale approvals still fail.
- Run batch pages carry a `simulated_m3` outcome summary, and `?rescue_only=true` filters to batches where the M3 policy attempted a rescue.
- Run artifacts are built lazily: POST /simulations takes ~28 s instead of ~40 s, and stored runs are far smaller.

## Open items

1. **Public scenario runs.** `POST /simulations` requires `X-Operator-Key` and takes ~40 s for the default 2,000 × 3 run (measured in-process; Render free tier will be slower). Jury members without the key cannot press "Run scenario". Options: (a) allow unauthenticated runs within tighter bounds, (b) give the jury a key, or (c) keep it operator-only and **publish a stored baseline run id** for `VITE_BASELINE_SIMULATION_ID`. Either way, a `GET /api/v1/simulations/latest`, or async job + polling, would make long runs more robust.
2. **Run decisions that propose "no change".** In the captured default run, every awaiting decision (T1–T11) proposes the batch's *current* destination and still requires approval. If intended, the UI shows "keep X — no change". If not, consider skipping approval when the plan is unchanged.
3. **Batch list summary columns.** `BatchRecord` has no per-batch status, final destination, rescued flag or arrival RSL. The tower needs those columns without N decision calls. Suggest adding `final_destination`, `rescued`, `rejected`, `realized_arrival_rsl_hours` and `status` to each record (additive, optional).
4. **Type the untyped responses.** `/api/v1/health`, `/scenarios/defaults` and `/scenarios/sensitivity` are `schema: {}`. The frontend's shapes are taken from fixtures and `main.py`.
5. **T17 demo reset.** Repeated jury demos need a non-destructive "new demo session" for T17 (e.g. `POST /api/v1/demo-sessions` returning a fresh batch id). Today the live UI offers no reset; demo mode has a local one.
6. **CORS.** Add the Vercel production and preview origins to `CORS_ORIGINS`.

## Mock → live checklist

- [ ] Backend deployed on Render; `GET /api/v1/health` returns 200 from the browser (CORS ok).
- [ ] `FRESHFLOW_OPERATOR_KEY` set on Render; shared with presenters only.
- [ ] A baseline run created (`POST /api/v1/simulations {}`); its id set as `VITE_BASELINE_SIMULATION_ID` in Vercel.
- [ ] `data/results/sensitivity.json` present on the deployed backend (Risk page), or the empty state accepted.
- [ ] Vercel env: `VITE_API_BASE_URL`, `VITE_BASELINE_SIMULATION_ID`, `VITE_USE_MOCK=false`. Redeploy.
- [ ] Top bar shows **Live API**; no "Demo data" badges anywhere.
- [ ] T17 replay: inject → investigate (deterministic) → approve, with the operator key; trace grows to the execute/verify steps; destination changes.
- [ ] If `OPENAI_API_KEY` and `OPENAI_MODEL` are configured: health shows "Live LLM agent configured" and the live mode option becomes selectable.
- [ ] Control tower: run batches page through; "Decision" opens `/replay/run/{id}/{batch}`.
- [ ] Re-run `scripts/sync_fixtures.py` after the final backend change, so demo mode matches the deployed engine.

## Contract changes the frontend tracks

- v1.0.0 → v1.1.0: paths moved under `/api/v1`; new scenario parameters; run-scoped batches and decisions; typed trace; new tool names (`optimize_destination`, `validate_constraints`, `request_human_approval`, `execute_reroute`, `verify_execution`). Old tool names still render (`src/lib/trace.ts`).
- Please keep bumping `info.version` and noting changes in `shared/CONTRACT_CHANGELOG.md`; the contract test will flag field drift on the next frontend test run.
