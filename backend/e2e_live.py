"""End-to-end checks against a RUNNING backend (default http://localhost:8000).

    python backend/e2e_live.py [base_url]

Exercises the same endpoints the frontend uses. Exits non-zero on the first failed check.
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
RESULTS = []


def call(method, path, body=None, timeout=300):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def check(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)
    if not ok:
        sys.exit(1)


def simulate(**params):
    t = time.time()
    status, body = call("POST", "/api/v1/simulations", params)
    check(f"POST /simulations {params or '{}'} → 200", status == 200, f"{time.time() - t:.1f}s")
    return body


# Test 1/backend side: health, defaults, docs
status, health = call("GET", "/api/v1/health")
check("health", status == 200 and health["status"] == "ok", json.dumps(health))
status, defaults = call("GET", "/api/v1/scenarios/defaults")
check("scenario defaults", status == 200 and defaults["parameters"]["batches"] == 2000)

# Test 2/3/4: run a changed scenario; four independently computed models; reconciliation
small = {"batches": 600, "repetitions": 2, "disruption_probability": 0.4}
run = simulate(**small)
metrics = run["result"]["runs"][0]["metrics"]
check("config echoes the requested parameters", all(run["result"]["config"][k] == v for k, v in small.items()))
check("four models present in order", [m["model"] for m in metrics] == ["M0", "M1", "M2", "M3"])
check("same input kg for every model", len({m["input_kg"] for m in metrics}) == 1, f"{metrics[0]['input_kg']:.0f} kg")
check("models produce distinct outcomes", len({round(m["operating_profit_inr"]) for m in metrics}) == 4,
      ", ".join(f"{m['model']} ₹{m['operating_profit_inr']:,.0f} / spoil {m['spoilage_rate']:.1%}" for m in metrics))
for m in metrics:
    costs = sum(m[k] for k in ["procurement_inr", "transport_inr", "handling_inr", "rescue_inr", "agent_sensor_inr"])
    check(f"{m['model']} revenue − costs = operating profit", abs(m["gross_sales_revenue_inr"] - costs - m["operating_profit_inr"]) < 1)
    check(f"{m['model']} sellable + spoiled = input", abs(m["sellable_kg"] + m["spoiled_kg"] - m["input_kg"]) < 1e-6)
    waterfall = sum(x["amount_inr"] for x in m["financial_waterfall"])
    check(f"{m['model']} signed waterfall sums to profit", abs(waterfall - m["operating_profit_inr"]) < 1)
    check(f"{m['model']} salvage ⊆ revenue", m["salvage_value_inr"] <= m["gross_sales_revenue_inr"] + 1e-6)
m3, m2, m0 = metrics[3], metrics[2], metrics[0]
check("incremental vs M0 = profit difference", abs(m3["incremental_profit_vs_m0_inr"] - (m3["operating_profit_inr"] - m0["operating_profit_inr"])) < 1)
check("agentic increment = M3 − M2", abs(m3["incremental_agentic_policy_profit_vs_m2_inr"] - (m3["operating_profit_inr"] - m2["operating_profit_inr"])) < 1)
status, stored = call("GET", f"/api/v1/simulations/{run['id']}")
check("stored run reloads identically", status == 200 and stored["runs"] == run["result"]["runs"])
status, page = call("GET", f"/api/v1/simulations/{run['id']}/batches?offset=0&limit=20")
check("batch-level records available", status == 200 and page["total"] == 600 and len(page["batches"]) == 20)

# Test 5/6: agentic rescue on T17 with approve, then reset + reject
status, s = call("POST", "/api/v1/batches/T17/reset")
check("T17 reset", status == 200 and s["destination"] == "Retailer A" and s["status"] == "monitoring")
status, s = call("POST", "/api/v1/batches/T17/events", {})
check("disruption detected", status == 200 and s["status"] == "event_detected", f"RSL lower {s['rsl_lower_hours']:.1f} h")
status, s = call("POST", "/api/v1/batches/T17/investigate", {"mode": "deterministic"})
tools = [t["tool"] for t in s["trace"]]
check("agent investigated with tool calls", status == 200 and s["status"] == "awaiting_approval", " → ".join(tools[2:]))
check("optimizer + policy in trace", "optimize_destination" in tools and "validate_constraints" in tools)
check("proposal is a real change", s["proposal"]["id"] != s["destination"], f"{s['destination']} → {s['proposal']['id']}")
status, live = call("POST", "/api/v1/batches/T17/investigate", {"mode": "live"})
check("cannot re-investigate a pending proposal", status == 409)
status, stale = call("POST", "/api/v1/batches/T17/approval", {"approve": True, "expected_version": s["version"] - 1})
check("stale approval refused", status == 409)
status, a = call("POST", "/api/v1/batches/T17/approval", {"approve": True, "expected_version": s["version"]})
check("approval executes and persists", status == 200 and a["destination"] == s["proposal"]["id"] and a["status"] == "monitoring",
      f"destination {a['destination']}; last tools {[t['tool'] for t in a['trace']][-4:]}")
status, again = call("GET", "/api/v1/batches/T17")
check("state persisted", again["destination"] == a["destination"] and again["version"] == a["version"])
call("POST", "/api/v1/batches/T17/reset")
call("POST", "/api/v1/batches/T17/events", {})
status, s = call("POST", "/api/v1/batches/T17/investigate", {"mode": "deterministic"})
status, r = call("POST", "/api/v1/batches/T17/approval", {"approve": False, "expected_version": s["version"]})
check("rejection keeps destination", status == 200 and r["destination"] == "Retailer A" and r["status"] == "manual_review")
status, live = call("POST", "/api/v1/batches/T17/events", {})
status, live = call("POST", "/api/v1/batches/T17/investigate", {"mode": "live"})
check("live mode never falls back silently (409 no key / 502 provider error)", status in (409, 502), json.dumps(live))
call("POST", "/api/v1/batches/T17/reset")

# Test 7: capacity sensitivity (wholesale/processor capacity via capacity_multiplier)
low = simulate(batches=600, repetitions=1, disruption_probability=0.4, capacity_multiplier=0.3)["result"]["runs"][0]["metrics"]
high = simulate(batches=600, repetitions=1, disruption_probability=0.4, capacity_multiplier=1.5)["result"]["runs"][0]["metrics"]
check("lower capacity → higher M3 spoilage", low[3]["spoilage_rate"] > high[3]["spoilage_rate"],
      f"M3 spoilage {low[3]['spoilage_rate']:.1%} @0.3× vs {high[3]['spoilage_rate']:.1%} @1.5×")
check("lower capacity → lower M3 profit", low[3]["operating_profit_inr"] < high[3]["operating_profit_inr"],
      f"₹{low[3]['operating_profit_inr']:,.0f} vs ₹{high[3]['operating_profit_inr']:,.0f}")

# Test 8: negative outcomes are possible and reported
status, study = call("GET", "/api/v1/scenarios/sensitivity")
negatives = {k: v["risk"]["mean_incremental_m3_vs_m2_inr"] for k, v in study.items() if v["risk"]["mean_incremental_m3_vs_m2_inr"] < 0}
check("stored study contains scenarios where M3 underperforms M2", bool(negatives), ", ".join(f"{k} ₹{v:,.0f}" for k, v in negatives.items()))
check("targets can be missed", any(not m["meets_spoilage_target"] for m in metrics), "M0/M1 miss the <10% spoilage target")

# Test 10: reproducibility
r1 = simulate(seed=777, batches=400, repetitions=1)["result"]["runs"][0]
r2 = simulate(seed=777, batches=400, repetitions=1)["result"]["runs"][0]
check("same seed → identical dataset hash and metrics", r1 == r2, r1["dataset_sha256"][:16])
r3 = simulate(seed=778, batches=400, repetitions=1)["result"]["runs"][0]
check("different seed → different dataset", r3["dataset_sha256"] != r1["dataset_sha256"])

# Evidence
status, ev = call("GET", "/api/v1/evidence")
check("evidence register", status == 200 and len(ev["assumptions"]) > 20 and len(ev["sources"]) >= 2,
      f"{len(ev['assumptions'])} assumptions, {len(ev['sources'])} sources")
print(f"\n{sum(ok for _, ok, _ in RESULTS)}/{len(RESULTS)} checks passed")
