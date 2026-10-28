"""Build data/network/mumbai_network.json: 15 locations + real road routes from OSRM (OpenStreetMap).

    python backend/build_mumbai_network.py            # ~5 min, public OSRM demo server, 1 req at a time

Coordinates are approximate public locations of APMC markets and city localities.
Buyers are SYNTHETIC (no real company is represented). Road geometry, distance and free-flow
duration come from OSRM over OpenStreetMap; traffic is NOT live and is applied in the model as a
simulated multiplier. Diversions start from a checkpoint at 35% of the original route's distance.
"""
import datetime
import json
import math
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "network" / "mumbai_network.json"
OSRM = "https://router.project-osrm.org"
CHECKPOINT_FRACTION = 0.35

HUBS = [
    {"id": "H1", "name": "Turbhe APMC – Vegetable Market", "lat": 19.0790, "lon": 73.0130},
    {"id": "H2", "name": "Turbhe APMC – Fruit Market", "lat": 19.0838, "lon": 73.0072},
    {"id": "H3", "name": "Kalyan APMC", "lat": 19.2437, "lon": 73.1356},
]
# channel: retail | wholesale | horeca | processor  (synthetic buyers at real localities)
BUYERS = [
    {"id": "B01", "name": "Retail DC · Bhiwandi", "area": "Bhiwandi", "channel": "retail", "lat": 19.2813, "lon": 73.0483},
    {"id": "B02", "name": "Supermarket · Andheri West", "area": "Andheri West", "channel": "retail", "lat": 19.1364, "lon": 72.8296},
    {"id": "B03", "name": "Supermarket · Powai", "area": "Powai", "channel": "retail", "lat": 19.1176, "lon": 72.9060},
    {"id": "B04", "name": "Supermarket · Thane West", "area": "Thane West", "channel": "retail", "lat": 19.2183, "lon": 72.9781},
    {"id": "B05", "name": "Supermarket · Bandra West", "area": "Bandra West", "channel": "retail", "lat": 19.0596, "lon": 72.8295},
    {"id": "B06", "name": "Wholesale · Dadar Market", "area": "Dadar", "channel": "wholesale", "lat": 19.0186, "lon": 72.8424},
    {"id": "B07", "name": "Wholesale · Byculla Market", "area": "Byculla", "channel": "wholesale", "lat": 18.9790, "lon": 72.8333},
    {"id": "B08", "name": "Wholesale · Borivali Market", "area": "Borivali", "channel": "wholesale", "lat": 19.2307, "lon": 72.8567},
    {"id": "B09", "name": "Hotels · Lower Parel", "area": "Lower Parel", "channel": "horeca", "lat": 18.9986, "lon": 72.8270},
    {"id": "B10", "name": "Restaurants · Colaba", "area": "Colaba", "channel": "horeca", "lat": 18.9067, "lon": 72.8147},
    {"id": "B11", "name": "Food Processor · Taloja MIDC", "area": "Taloja", "channel": "processor", "lat": 19.0656, "lon": 73.1157},
    {"id": "B12", "name": "Food Processor · Rabale MIDC", "area": "Rabale", "channel": "processor", "lat": 19.1386, "lon": 73.0103},
]


def get(url, attempts=4):
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FreshFlow-Abhikalp-MVP/1.0 (one-time precompute)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
            time.sleep(0.4)  # be gentle with the public demo server
            if data.get("code") == "Ok":
                return data
        except Exception as exc:  # noqa: BLE001
            print("retry", i, exc, flush=True)
        time.sleep(2 * (i + 1))
    raise SystemExit(f"OSRM failed: {url}")


def route(a, b):
    url = f"{OSRM}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}?overview=simplified&geometries=geojson"
    r = get(url)["routes"][0]
    coords = [[round(lat, 5), round(lon, 5)] for lon, lat in r["geometry"]["coordinates"]]
    return {"distance_km": round(r["distance"] / 1000, 2), "freeflow_minutes": round(r["duration"] / 60, 1), "geometry": coords}


def haversine(p, q):
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [p[0], p[1], q[0], q[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def point_at_fraction(geometry, fraction):
    seg = [haversine(geometry[i], geometry[i + 1]) for i in range(len(geometry) - 1)]
    target = sum(seg) * fraction
    run = 0.0
    for i, d in enumerate(seg):
        if run + d >= target and d > 0:
            t = (target - run) / d
            a, b = geometry[i], geometry[i + 1]
            return [round(a[0] + (b[0] - a[0]) * t, 5), round(a[1] + (b[1] - a[1]) * t, 5)], i + 1
        run += d
    return geometry[-1], len(geometry) - 1


def main():
    routes, checkpoints = {}, {}
    for h in HUBS:
        for b in BUYERS:
            key = f"{h['id']}>{b['id']}"
            r = route((h["lat"], h["lon"]), (b["lat"], b["lon"]))
            cp, idx = point_at_fraction(r["geometry"], CHECKPOINT_FRACTION)
            r["checkpoint"] = cp
            r["checkpoint_index"] = idx
            routes[key] = r
            print("route", key, r["distance_km"], "km", r["freeflow_minutes"], "min", flush=True)
            # diversion legs from this checkpoint to every buyer
            legs = {}
            for alt in BUYERS:
                legs[alt["id"]] = route(cp, (alt["lat"], alt["lon"]))
            checkpoints[key] = legs
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "OSRM public demo server over OpenStreetMap data (road geometry, distance, free-flow duration)",
        "traffic": "Not live. The model applies a simulated traffic multiplier to free-flow durations.",
        "checkpoint_fraction": CHECKPOINT_FRACTION,
        "attribution": "© OpenStreetMap contributors",
        "hubs": HUBS, "buyers": BUYERS, "routes": routes, "diversion_legs": checkpoints,
    }, separators=(",", ":")), encoding="utf-8")
    print("wrote", OUT, flush=True)


if __name__ == "__main__":
    main()
