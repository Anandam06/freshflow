"""Capture demo-mode fixtures by driving Codex's real FastAPI app (in-process TestClient, temp DB).

    cd freshflow/frontend
    PYTHONPATH=<backend deps> python -X utf8 scripts/sync_fixtures.py

Every file written to src/services/mock/fixtures/ is a verbatim API response (or a copy of a
shared/ fixture), so demo mode never shows numbers the backend did not produce:

  batch-*.json            shared/fixtures T17 journey (executed API examples)
  health.json             GET /api/v1/health
  scenario-defaults.json  GET /api/v1/scenarios/defaults
  evidence.json           GET /api/v1/evidence
  sensitivity.json        GET /api/v1/scenarios/sensitivity (stored study)
  run.json                POST /api/v1/simulations {} -> {id, result}
  run-batches.json        GET /api/v1/simulations/{id}/batches?offset=0&limit=100
  run-decisions.json      per awaiting batch: GET decision, POST approve; plus one POST reject

Takes a few minutes (each simulation runs the full v2 engine). Re-run when backend logic changes.
"""
import json
import os
import pathlib
import shutil
import sys
import tempfile

FRONTEND = pathlib.Path(__file__).resolve().parent.parent
ROOT = FRONTEND.parent
OUT = FRONTEND / "src" / "services" / "mock" / "fixtures"
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("FRESHFLOW_ENV", "development")
os.environ.pop("FRESHFLOW_OPERATOR_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402

MAX_DECISIONS = 8


def write(name, payload):
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def ok(response):
    if response.status_code != 200:
        raise SystemExit(f"{response.request.method} {response.request.url} -> {response.status_code}: {response.text[:300]}")
    return response.json()


def client():
    tmp = tempfile.mkdtemp(prefix="freshflow-fixtures-")
    return TestClient(create_app(os.path.join(tmp, "fixtures.sqlite")))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for f in (ROOT / "shared" / "fixtures").glob("batch-*.json"):
        shutil.copyfile(f, OUT / f.name)

    c = client()
    write("health.json", ok(c.get("/api/v1/health")))
    write("scenario-defaults.json", ok(c.get("/api/v1/scenarios/defaults")))
    write("evidence.json", ok(c.get("/api/v1/evidence")))
    sens = c.get("/api/v1/scenarios/sensitivity")
    write("sensitivity.json", sens.json() if sens.status_code == 200 else None)

    print("running default simulation…", flush=True)
    created = ok(c.post("/api/v1/simulations", json={}))
    run_id = created["id"]
    write("run.json", created)
    page = ok(c.get(f"/api/v1/simulations/{run_id}/batches", params={"offset": 0, "limit": 100}))
    write("run-batches.json", page)

    decisions = {}
    for record in page["batches"]:
        if len(decisions) >= MAX_DECISIONS:
            break
        before = ok(c.get(f"/api/v1/simulations/{run_id}/decisions/{record['id']}"))
        if before["state"]["status"] != "awaiting_approval":
            continue
        after = ok(c.post(f"/api/v1/simulations/{run_id}/decisions/{record['id']}/approve",
                          json={"expected_version": before["state"]["version"]}))
        decisions[record["id"]] = {"pending": before, "approved": after}

    # Rejections need an untouched copy of the same run (approvals are persisted per run).
    print("running second simulation for the rejection branch…", flush=True)
    c2 = client()
    run2 = ok(c2.post("/api/v1/simulations", json={}))["id"]
    for batch_id, d in decisions.items():
        rejected = ok(c2.post(f"/api/v1/simulations/{run2}/decisions/{batch_id}/reject",
                              json={"expected_version": d["pending"]["state"]["version"]}))
        rejected["run_id"] = run_id  # same seed and config; present under the captured run id
        d["rejected"] = rejected
    write("run-decisions.json", decisions)
    print(f"captured run {run_id}: {page['total']} batches, {len(decisions)} interactive decisions -> {OUT}")


if __name__ == "__main__":
    main()
