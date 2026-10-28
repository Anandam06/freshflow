"""Shipment-engine tests against the LIVE deployment (Mumbai OSRM network, 18 commodities, Claude agent).

Usage: python -m validation.run_shipments_live [--base https://freshflow-tatz.onrender.com]
Writes evidence/raw/shipments_live.jsonl (one full API response per test) and network/health snapshots.
"""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence' / 'raw'

COMMODITY_TESTS = [
    ('normal', [], {}),
    ('high_temperature', [{'type': 'temperature_rise', 'severity': 'high'}], {}),
    ('traffic_delay', [{'type': 'heavy_traffic', 'severity': 'high'}], {}),
    ('quality_deterioration', [{'type': 'product_damage', 'severity': 'high'}], {}),
    ('buyer_unavailability', [], {'buyer_availability': 0.4}),
    ('alternative_buyer', [{'type': 'buyer_cancellation', 'severity': 'high'}], {}),
]

EVENT_SCENARIOS = [
    ('S06', [{'type': 'road_closure', 'severity': 'high'}], {}),
    ('S11', [{'type': 'refrigeration_failure', 'severity': 'high'}], {}),
    ('S14', [{'type': 'humidity_problem', 'severity': 'high'}], {}),
    ('S34', [{'type': 'buyer_cancellation', 'severity': 'high'}], {'buyer_availability': 0.0}),
]

# Live Claude agent validation: (case id, disruptions, settings, human decision if a proposal is made)
AGENT_CASES = [
    ('AG1', [{'type': 'buyer_cancellation', 'severity': 'high'}], {}, True),
    ('AG2', [{'type': 'refrigeration_failure', 'severity': 'high'}], {}, True),
    ('AG3', [{'type': 'road_closure', 'severity': 'high'}, {'type': 'heavy_traffic', 'severity': 'high'}], {}, False),
    ('AG4', [{'type': 'price_drop', 'severity': 'high'}], {}, True),
    ('AG5', [{'type': 'buyer_cancellation', 'severity': 'high'}], {'buyer_availability': 0.0}, None),
    ('AG6', [], {}, None),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='https://freshflow-tatz.onrender.com')
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    c = httpx.Client(base_url=a.base, timeout=180)
    network = c.get('/api/v1/network').json()
    (OUT / 'live_network.json').write_text(json.dumps(network, indent=1), encoding='utf-8')
    out = (OUT / 'shipments_live.jsonl').open('w', encoding='utf-8')

    def post(test_id, group, body, extra=None):
        t0 = time.perf_counter()
        r = c.post('/api/v1/shipments', json=body)
        rec = {'test_id': test_id, 'group': group, 'request': body, 'http_status': r.status_code,
               'latency_s': round(time.perf_counter() - t0, 3), 'executed_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
               'response': r.json(), **(extra or {})}
        out.write(json.dumps(rec) + '\n')
        out.flush()
        print(test_id, r.status_code, rec['response'].get('decision_status', rec['response'].get('detail')), flush=True)
        return rec

    for com in network['commodities']:
        for name, dis, settings in COMMODITY_TESTS:
            post(f"C-{com['id']}-{name}", 'commodity', {'commodity_id': com['id'], 'disruptions': dis, 'settings': settings})
    for sid, dis, settings in EVENT_SCENARIOS:
        post(sid, 'event_scenario', {'disruptions': dis, 'settings': settings})
    # Reproducibility: identical request twice must give identical numbers.
    post('R1a', 'reproducibility', {'disruptions': [{'type': 'road_closure', 'severity': 'high'}]})
    post('R1b', 'reproducibility', {'disruptions': [{'type': 'road_closure', 'severity': 'high'}]})
    for cid, dis, settings, decision in AGENT_CASES:
        rec = post(cid, 'agent_live', {'disruptions': dis, 'settings': settings, 'mode': 'live'})
        resp = rec['response']
        if decision is not None and resp.get('decision_status') == 'proposed_awaiting_approval':
            sid = resp['id']
            r = c.post(f'/api/v1/shipments/{sid}/approval', json={'approve': decision, 'expected_version': resp['state']['version']})
            after = c.get(f'/api/v1/shipments/{sid}').json()
            out.write(json.dumps({'test_id': cid + '-approval', 'group': 'agent_approval', 'request': {'approve': decision},
                                  'http_status': r.status_code, 'executed_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                                  'response': after}) + '\n')
            print(cid, 'approval', decision, r.status_code, after.get('decision_status'), flush=True)
            # Stale-version guard: replaying the approval must be refused.
            stale = c.post(f'/api/v1/shipments/{sid}/approval', json={'approve': decision, 'expected_version': resp['state']['version']})
            out.write(json.dumps({'test_id': cid + '-stale', 'group': 'agent_guard', 'request': {'approve': decision, 'stale': True},
                                  'http_status': stale.status_code, 'response': stale.json()}) + '\n')
    (OUT / 'live_llm_usage.json').write_text(json.dumps(c.get('/api/v1/llm-usage').json(), indent=1), encoding='utf-8')
    out.close()


if __name__ == '__main__':
    main()
