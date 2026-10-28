# FreshFlow — frontend

React + TypeScript + Vite + Tailwind (shadcn/ui-style components on Radix) + Recharts.
Consumes the FastAPI backend described by `../shared/api-contract.yaml` (v1.1.0, owned by Codex).

The frontend **never computes business metrics**. Every number comes from a backend response, validated at runtime against zod schemas that mirror the contract. The only arithmetic on backend values is in `src/lib/derive.ts` (stepwise profit-bridge differences, pp differences, % vs M0 for the relative view), and each derivation there is documented.

## Run locally (full stack)

Backend (repo root `freshflow/`, Python 3.11+ with `backend/requirements.txt` installed):

```bash
cd backend
FRESHFLOW_ENV=development CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# check: http://localhost:8000/api/v1/health  and  http://localhost:8000/docs
```

Frontend:

```bash
cd frontend
npm ci
cat > .env.local <<EOF
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK=false
VITE_BASELINE_SIMULATION_ID=     # optional: id from POST /api/v1/simulations {} so the dashboard opens instantly
EOF
npm run dev -- --host 0.0.0.0     # http://localhost:5173
```

In development mode (`FRESHFLOW_ENV=development` with no `FRESHFLOW_OPERATOR_KEY`) mutations need no key. When the backend sets `FRESHFLOW_OPERATOR_KEY`, enter it with the **Operator key** button in the top bar; it stays in `sessionStorage` for that tab and is never bundled.

A default simulation (2,000 batches × 3 repetitions, all four models) takes about 30 s on a laptop. Smaller runs (e.g. 500 batches × 1 repetition) take 2–3 s.

Without `VITE_API_BASE_URL`, the app runs in **demo mode**: it replays captured backend responses, and a banner plus "Demo data" badges stay on every screen.

End-to-end checks against running servers:

```bash
python backend/e2e_live.py                                        # 50 API checks (financials, agent, sensitivity, reproducibility)
cd frontend && E2E_API=http://localhost:8000 npx vitest run tests/live.e2e.test.tsx   # UI → backend journeys
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build to `dist/` |
| `npm test` | Vitest: contract conformance, adapters, formatters, UI flows |
| `npm run typecheck` | TypeScript only |

## Screens

Four areas, built so a first-time user can answer: *what shipment am I testing, what went wrong, what did FreshFlow do, where does it go now, and how much freshness and money did that save?*

| Route | Area | Purpose |
|---|---|---|
| `/` | **Home** | Live Mumbai map with the current shipment (backend run, real OSRM road route), freshness status, arrival time, buyer, price; one call to action: *Test a Disruption* |
| `/playground` | **Scenario Playground** | 5 steps: produce (18 items) → hub & buyer on the map → disruption cards with low/medium/high (+ Advanced settings) → *Run FreshFlow Simulation* → results: narrative, decision (approve/reject), original vs FreshFlow route, freshness chart, A vs D (or all four), value by buyer, step-by-step agent timeline, details, Excel export, save for comparison. `?step=5&shipment=<id>` reopens any stored result |
| `/data` | **Data & Reports** | Download the 11-sheet input template, upload an edited workbook (row-level validation; valid files run every batch), export results, export saved-test comparisons, export the fleet simulation |
| `/advanced/*` | **Advanced Analysis** | The original analytics, unchanged in substance: fleet results, compare all four, fleet scenarios, risk & sensitivity, control tower, live T17 agent demo, evidence & assumptions |

Strategies are shown as **A · Traditional Planning, B · Freshness-Aware, C · Smart Optimization, D · FreshFlow Agentic AI**. Internal ids (M0–M3) are unchanged in the API. Every label explains itself on hover, keyboard focus or tap.

Old URLs (`/compare`, `/scenarios`, `/risk`, `/tower`, `/evidence`, `/replay`) redirect to their new homes. The old-to-new mapping is in `docs/UX_REDESIGN.md`.

## Provenance labels

Every data block carries one of these labels:
- **Synthetic simulation** — `SIMULATED RESULT`: backend simulation output.
- **Case target** — `CASE`: a goal from the competition case, never shown as achieved unless a run meets it.
- **Verified reference** — `RESEARCH`: a published source.
- **Synthetic assumption** — `SYNTHETIC`: a generated input.

Trace steps are marked as Prediction, Tool call, Optimization, Policy check, Human approval, Executed action or Verification. Any result the backend marks as an estimate or unverified (e.g. `physical_delivery_verified: false`) also gets a **Simulated outcome** tag.

## Demo fixtures

`scripts/sync_fixtures.py` drives the real backend in-process (FastAPI TestClient, temporary SQLite) and writes verbatim responses to `src/services/mock/fixtures/`:

```bash
cd frontend
PYTHONPATH=<path to backend deps> python -X utf8 scripts/sync_fixtures.py   # ~2–3 min
```

Re-run whenever backend logic, research CSVs or `shared/fixtures` change, then run `npm test`. `tests/contract.test.ts` checks every fixture against the schemas, and checks the schemas field-for-field against `shared/api-contract.yaml`.

## Deployment (Vercel)

1. Import the GitHub repo in Vercel and set **Root Directory = `frontend`**. `vercel.json` sets the Vite build, the `dist` output, SPA rewrites and immutable asset caching.
2. Environment variables (Production and Preview):
   - `VITE_API_BASE_URL=https://<render-service>.onrender.com`
   - `VITE_BASELINE_SIMULATION_ID=<id of a stored default run>` (recommended; see INTEGRATION.md)
   - `VITE_USE_MOCK=false`
3. On Render, add the Vercel URL(s) to the backend's `CORS_ORIGINS`.
4. After deploying, the top bar must show **Live API** (not Demo data), and `/replay` must load T17 from the backend.

## Layout

```
src/
  app/         App shell, routes, providers
  components/  ui/ (shadcn-style primitives), common.tsx (provenance, states, KPI), results.tsx
  charts/      Recharts components + theme (validated categorical palette)
  pages/       One file per screen
  services/    client.ts (interface), http.ts (live), mock/ (demo), endpoints.ts, errors.ts, operatorKey.ts
  state/       SimulationContext (current run, saved scenarios)
  lib/         format.ts (units), derive.ts (documented display derivations), trace.ts (step semantics), export.ts
  types/api.ts zod schemas mirroring the contract
tests/         Vitest + Testing Library
docs/screenshots/  Key screens (demo data)
```
