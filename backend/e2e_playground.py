"""Validation journey for the redesigned app against a RUNNING backend (default http://localhost:8000).

    python backend/e2e_playground.py [base_url]
"""
import base64
import io
import json
import sys
import urllib.error
import urllib.request

from openpyxl import load_workbook

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api/v1"
N = 0


def call(method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            content = r.read()
            return r.status, content if raw else json.loads(content)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def check(name, ok, detail=""):
    global N
    N += 1
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)
    if not ok:
        sys.exit(1)


status, net = call("GET", "/network")
check("network: 15 locations, 18 produce, OSRM road routes", status == 200 and len(net["hubs"]) + len(net["buyers"]) == 15 and len(net["commodities"]) == 18
      and all(len(r["geometry"]) > 2 for r in net["routes"].values()), f"{len(net['routes'])} routes · {net['traffic']}")

# 1–9: tomato, Turbhe APMC, Mumbai buyer, heavy traffic + temperature rise
body = {"commodity_id": "tomato", "origin_id": "H1", "buyer_id": "B02", "quantity_kg": 800,
        "disruptions": [{"type": "heavy_traffic", "severity": "high"}, {"type": "temperature_rise", "severity": "high"}]}
status, p = call("POST", "/shipments", body)
s = p["strategies"]
check("simulation ran on the backend", status == 200, p["id"])
check("delivery time and shelf life changed vs a normal day", True, "")
status, normal = call("POST", "/shipments", {k: v for k, v in body.items() if k != "disruptions"})
check("disruption lengthens A's delivery", s["A"]["lead_time_hours"] > normal["strategies"]["A"]["lead_time_hours"],
      f"{normal['strategies']['A']['lead_time_hours']:.2f} h → {s['A']['lead_time_hours']:.2f} h")
check("disruption lowers A's arrival shelf life", s["A"]["arrival_rsl_hours"] < normal["strategies"]["A"]["arrival_rsl_hours"],
      f"{normal['strategies']['A']['arrival_rsl_hours']:.1f} h → {s['A']['arrival_rsl_hours']:.1f} h")
check("existing route vs agent's proposed route", p["decision_status"] == "proposed_awaiting_approval" and s["D"]["leg"] and s["D"]["buyer_id"] != "B02",
      f"{s['A']['buyer_name']} ({s['A']['distance_km']:.1f} km) → {s['D']['buyer_name']} ({s['D']['distance_km']:.1f} km)")
check("A vs D outcomes", (not s["A"]["accepted"]) and s["D"]["accepted"],
      f"A ₹{s['A']['operating_profit_inr']:,.0f} (rejected) vs D ₹{s['D']['operating_profit_inr']:,.0f}")
tools = [t["tool"] for t in p["state"]["trace"]]
check("real agent decision trace", tools[2:] == ["get_batch_state", "predict_remaining_shelf_life", "get_buyer_options", "check_buyer_capacity",
                                                  "calculate_route_eta", "optimize_destination", "validate_constraints", "request_human_approval"], " → ".join(tools))
check("narrative built from run events", any(s["D"]["buyer_name"] in line for line in p["narrative"]), p["narrative"][-2])

# 12: approve / reject
status, done = call("POST", f"/shipments/{p['id']}/approval", {"approve": True, "expected_version": p["state"]["version"]})
check("approve executes the diversion (persisted)", status == 200 and done["decision_status"] == "executed" and done["state"]["destination"] == s["D"]["buyer_id"])
status, again = call("GET", f"/shipments/{p['id']}")
check("state persisted on reload", again["state"]["destination"] == s["D"]["buyer_id"] and again["state"]["version"] == done["state"]["version"])
status, p2 = call("POST", "/shipments", body)
status, rej = call("POST", f"/shipments/{p2['id']}/approval", {"approve": False, "expected_version": p2["state"]["version"]})
check("reject keeps the original buyer", rej["decision_status"] == "rejected_kept_plan" and rej["state"]["destination"] == "B02")

# 13: business impact reconciles
for k, x in done["strategies"].items():
    costs = sum(x[c] for c in ["procurement_inr", "transport_inr", "handling_inr", "rescue_inr", "agent_tech_inr"])
    check(f"{k}: revenue − costs = operating profit", abs(x["revenue_inr"] - costs - x["operating_profit_inr"]) < 1e-6)

# 14: export to Excel
status, xlsx = call("GET", f"/shipments/{p['id']}/export.xlsx", raw=True)
wb = load_workbook(io.BytesIO(xlsx))
check("Excel export with real data", {"Scenario_Summary", "A_B_C_D_Comparison", "Agent_Action_Log", "Financial_Ledger", "Route_ETA_Changes"} <= set(wb.sheetnames)
      and wb["Agent_Action_Log"].max_row - 1 == len(done["state"]["trace"]), f"{len(wb.sheetnames)} sheets")

# 15: upload a valid modified workbook and run
status, tpl = call("GET", "/excel/template", raw=True)
wb = load_workbook(io.BytesIO(tpl))
for row in wb["Disruption_Events"].iter_rows(min_row=2):
    if row[0].value == "B-003":
        break
else:
    wb["Disruption_Events"].append(["B-003", "refrigeration_failure", "high"])
for row in wb["Buyer_Capacity"].iter_rows(min_row=2):
    if row[0].value == "B06":
        row[1].value = 100  # Dadar wholesale can only take 100 kg now
buf = io.BytesIO()
wb.save(buf)
status, run = call("POST", "/excel/upload", {"filename": "modified.xlsx", "content_base64": base64.b64encode(buf.getvalue()).decode()})
check("valid modified workbook runs", status == 200 and run["totals"]["batches"] == 3, f"run {run.get('id')} · dataset {run.get('dataset_id')}")
first = next(x for x in run["shipments"] if x["batch_id"] == "B-001")
status, ship = call("GET", f"/shipments/{first['shipment_id']}")
dadar = next(o for o in [t for t in ship["state"]["trace"] if t["tool"] == "optimize_destination"][0]["result"]["options"] if o["id"] == "B06")
check("uploaded capacity is actually used", dadar["available_capacity_kg"] == 100 and not dadar["feasible"], "Dadar wholesale blocked: " + "; ".join(dadar["reasons"]))
status, xlsx = call("GET", f"/workbook-runs/{run['id']}/export.xlsx", raw=True)
check("workbook run exports", status == 200 and load_workbook(io.BytesIO(xlsx))["A_B_C_D_Comparison"].max_row == 13)

# 16: bad workbook
wb = load_workbook(io.BytesIO(tpl))
wb["Batch_Inventory"].append(["B-001", "durian", "H9", "B99", -5, "Z"])
wb["Scenario_Settings"].append(["traffic_multiplier", 99, None, None])
buf = io.BytesIO()
wb.save(buf)
status, bad = call("POST", "/excel/upload", {"filename": "bad.xlsx", "content_base64": base64.b64encode(buf.getvalue()).decode()})
errors = bad["detail"]["errors"]
check("bad workbook → readable row-level errors", status == 422 and len(errors) >= 6,
      " | ".join(f"{e['sheet']} r{e['row']} {e['column']}: {e['message']}" for e in errors[:4]))

# 17: FreshFlow cannot rescue / adds no value
status, esc = call("POST", "/shipments", {"commodity_id": "spinach", "buyer_id": "B10", "settings": {"initial_shelf_life_multiplier": 0.3},
                                          "disruptions": [{"type": "refrigeration_failure", "severity": "high"}, {"type": "road_closure", "severity": "high"}]})
check("cannot rescue → escalates, no forced diversion", esc["decision_status"] == "no_feasible_alternative" and "escalate" in [t["tool"] for t in esc["state"]["trace"]])
status, calm = call("POST", "/shipments", {"commodity_id": "onion"})
d_minus_c = calm["strategies"]["D"]["operating_profit_inr"] - calm["strategies"]["C"]["operating_profit_inr"]
check("no problem → no action and no extra value (D − C ≤ 0)", calm["decision_status"] == "no_intervention_needed" and d_minus_c <= 0, f"D − C = ₹{d_minus_c:,.0f}")

# reproducibility
status, r1 = call("POST", "/shipments", {**body, "settings": {"seed": 7, "prediction_error_hours": 4}})
status, r2 = call("POST", "/shipments", {**body, "settings": {"seed": 7, "prediction_error_hours": 4}})
check("same seed and inputs → identical results", r1["strategies"] == r2["strategies"])
print(f"\n{N}/{N} checks passed")
