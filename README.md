# FreshFlow backend MVP

Codex-owned implementation for Abhikalp 2026. Frontend remains owned by Claude Code. Branch: `feat/backend-codex`; frontend branch: `feat/frontend-claude`; integrated branch: `main`. This is a functioning local backend demonstration, **not a completed competition submission or validated field product**.

## Run

From `freshflow/`, with Python 3.13:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
$env:PYTHONPATH = "$PWD\backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://localhost:8000/docs for an interactive, executable API. Health: http://localhost:8000/health. Environment variables in `.env.example` are documentation; this service does not automatically load `.env`. Set them in the shell or hosting secret manager.

For this workspace, dependencies have also been installed into the parent `.deps/` directory. Use `$env:PYTHONPATH = "$PWD\..\.deps;$PWD\backend"` to run without a new environment.

## Verify and reproduce

```powershell
python -m pytest backend/tests -q
python backend/run_experiment.py --seed 2026 --batches 2000 --repetitions 3
python backend/export_contract.py
python backend/validate_scenarios.py
python backend/smoke_http.py
```

The experiment writes `data/synthetic/batches.json` and `data/results/comparison.json`. These generated files are ignored by Git. Run results include seeds, dataset hashes, assumptions version, definitions and limitations. API runs persist in SQLite and can be retrieved by ID.

## Integration

Read [API contract](shared/api-contract.yaml), [frontend handoff](docs/integration.md), [demo walkthrough](docs/mvp-demo.md), [model definitions](docs/architecture.md), and [deployment](docs/deployment.md). Pydantic models generate the checked-in OpenAPI 3.1 contract; regenerate it after any API change and notify the frontend owner. Never calculate authoritative financial metrics in the frontend.

Frontend files appeared during concurrent work. They remain untouched and are excluded from the backend commit. [Contract review](docs/frontend-contract-review.md) records the adapter changes needed before live integration.

No Round 1 slides were supplied or changed. No frontend files were created. Deployment is fixed to Vercel + Render + GitHub; PostgreSQL is supported via `DATABASE_URL`, with SQLite retained for local use. Live provider behavior is not verified until configured credentials are used; the default deterministic mode is labeled explicitly. Public deployment, deck and video remain outstanding.
