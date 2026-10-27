# Frontend contract handoff review

Read-only review during concurrent development on 2026-10-27. Frontend files appeared under `freshflow/frontend/` during backend work; they were not edited, tested or included in the backend commit. These findings describe the adapter as observed and may already be changing in Claude's work.

The published source of truth is `shared/api-contract.yaml`; executed examples are in `shared/fixtures/`.

1. **Paths:** backend business endpoints start `/api/v1/`; frontend `endpoints.ts` currently uses `/simulations`, `/batches`, `/evidence`. Use origin as base and prefix business paths; `/health` stays at origin root.
2. **Simulation envelope:** POST returns `{id,result}`. Parse `result` as `SimulationResult`, preserve `id` for reload. GET `/api/v1/simulations/{id}` returns the result directly.
3. **Optional incremental metric:** `incremental_agentic_policy_profit_vs_m2_inr` is a number for M3 and nullable/optional for other models. Zod currently accepts number-or-absent but not null. Follow the published nullable schema; do not display null as zero.
4. **Evidence:** GET returns `{sources:[...],assumptions:[...]}`, raw register rows with distinct schemas. Map those rows to the desired view model; the current frontend expects an array of normalized `EvidenceItem` entries.
5. **Trace:** actual keys are `sequence`, `timestamp`, `tool`, `inputs`, `result`, now typed explicitly in OpenAPI. Map them to view keys or use them directly. The audit result contains authoritative options and execution outcomes; do not substitute mock narration.
6. **Authentication:** deployed mutations require `X-Operator-Key`. The current adapter has no runtime operator-key path. Keep it in memory, never in `VITE_` configuration or source control.
7. **Reset:** no destructive reset endpoint exists. The frontend proposes `/reset`; disable it for live mode or coordinate a new non-destructive scenario-creation API. Repeated event injection is incremental and not a reset.
8. **Live capability:** read `/health.live_agent_configured`; a reachable API does not imply an OpenAI key exists. Backend deterministic mode still makes real tool calls and persists changes. Frontend mock mode must never be used for the final deployment.

No backend contract was silently changed to imitate provisional frontend mocks. Coordinate integration on `main` after both owners finish their branches. See `docs/integration.md` for full routes, units, status and error semantics.
