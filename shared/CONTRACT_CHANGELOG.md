# Contract notice to Claude — v1.1.0

The requested run-scoped endpoints and data schemas are available now in `shared/api-contract.yaml` and `shared/schema/`. No frontend files were modified. Existing T17 endpoints, `/health`, and simulation `{id,result}` responses are retained.

New endpoints: `/api/v1/health`, `/scenarios/defaults`, `/simulations/{run_id}/results`, `/simulations/{run_id}/batches`, `/simulations/{run_id}/decisions/{batch_id}`, decision `/approve` and `/reject`, `/assumptions`, `/sources` (all business paths prefixed `/api/v1`). Approval/rejection bodies contain `expected_version` only.

New scenario parameters and nullable/optional result fields are defined in OpenAPI. Fetch defaults instead of freezing frontend defaults. Batch listing is paginated with `offset`/`limit` and audits repetition 0. Decisions are interactive replays with independent persisted approvals; historical simulation results remain immutable. Simulation outcomes, actual tool traces, candidate options and signed financial ledgers are returned in decision responses. Do not interpret a reroute command as confirmed buyer acceptance.

Engine v2 changes dataset generation, optimization, observations and accounting detail, so old v1 numeric fixtures are not comparable. Frozen case-calibration defaults are now `initial_rsl_scale=1.4`, `disruption_probability=0.0`, and default evaluation seed `60000`. This boundary fit is a documented limitation, not a claim about real traffic; stress scenarios explicitly add disruptions. Fetch `/api/v1/scenarios/defaults` rather than silently retaining frontend defaults from v1. Explicitly display `agent_mode`; simulated approvals are not human approvals and deterministic orchestration is not a live LLM run.

Health and evidence responses are now typed. The run result adds signed `financial_waterfall`, salvage-as-revenue-subset, distributions, percentile ranges and M3-versus-M2 downside probability. `/api/v1/scenarios/sensitivity` exposes the saved nine-scenario study when available. Original frontend schemas tolerate additive response fields; backend-authoritative financial values remain unchanged by display transformations.

# v1.2.0 — 2026-10-28 (Claude Code, backend handover)

- New `POST /api/v1/batches/{batch_id}/reset` (operator-gated): re-seeds the dedicated demo batch T17 for repeated demonstrations. The version keeps increasing, so approvals against a pre-reset version return 409. The trace starts `seed`, `demo_reset`.
- Agent behaviour: if the best feasible option equals the current destination, the agent no longer asks for approval of "no change". It records `no_intervention_required` and keeps `status: monitoring`. Applies to T17 and to run decisions.
- Run artifacts are built lazily (decisions prepared on first access; only M3 outcomes stored). The API is unchanged; POST /simulations is ~30% faster and stored runs are much smaller.
- No schema fields changed.

# v1.3.0 — 2026-10-28 (Claude Code, UX redesign)

Additive only; every v1.2.0 endpoint is unchanged.

- `GET /api/v1/network`: 15-location Mumbai network (3 APMC hubs, 12 synthetic buyers), OSRM road geometry for 36 routes and 432 diversion legs, 18 commodities, buyer terms, disruption catalogue, setting bounds.
- `POST /api/v1/shipments` (operator-gated): one-shipment scenario. It returns strategies A–D (internal M0–M3), a narrative built from run events, `decision_status`, and the persisted agent state (trace from the same `agent.Investigation` tools as T17). `GET /api/v1/shipments/{id}` reloads it. `POST /api/v1/shipments/{id}/approval` takes `{approve, expected_version}`.
- Excel: `GET /api/v1/excel/template` (11 input sheets); `POST /api/v1/excel/upload` takes `{filename, content_base64}`, returns 422 with row-level `detail.errors` or runs every batch; `GET /api/v1/workbook-runs/{id}` and `/export.xlsx`; `GET /api/v1/shipments/{id}/export.xlsx`; `POST /api/v1/exports/comparison`; `GET /api/v1/simulations/{id}/export.xlsx`.
- Fix: the shipment seed normalises numbers, so `800` and `800.0` give identical results.

# v1.4.0 — 2026-10-28 (Claude Code)

- Live agent orchestration uses Anthropic Claude (`claude-haiku-5-5` by default; `ANTHROPIC_MODEL` to change). Claude chooses tools and writes a short explanation; every number still comes from the Python tools, and execution still needs human approval. The OpenAI path remains, selectable with `FRESHFLOW_LLM_PROVIDER=openai`.
- `/api/v1/health` adds `llm_provider` and `llm_model`.
- New `GET /api/v1/llm-usage`: cumulative requests, tokens, tool calls and estimated USD cost of live agent runs, plus the average per execution.
- Live traces add `agent_explanation` (model-written text) and `llm_usage` (tokens, estimated cost) entries.
