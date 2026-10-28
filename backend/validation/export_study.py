"""Publish the 30-seed validation study to the app, so Advanced Analysis shows the same numbers as the Excel workbook.

Reads evidence/raw/fleet_results.jsonl (run_fleet) and writes, through the same summarize() the API uses:
  data/results/study/index.json      one row per fleet scenario
  data/results/study/{id}.json       full SimulationResult (30 runs) per scenario
  data/results/sensitivity.json      the Risk & sensitivity subset, replacing the older 10-seed study
"""
import json
from pathlib import Path

from app.models import SimulationRequest
from app.simulation import summarize
from validation.scenarios import SCENARIOS, SEEDS, SUPPLEMENTARY

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data' / 'results' / 'study'
WORKBOOK = 'evidence/FreshFlow_Scenario_Validation.xlsx'
RISK = ['S01', 'X01', 'S32', 'X22', 'X23', 'X24', 'X04', 'X09', 'S17', 'S33', 'X31']
COSTS = ['procurement_inr', 'transport_inr', 'handling_inr', 'rescue_inr', 'agent_sensor_inr']


def scenario_meta():
    meta = {sid: {'id': sid, 'group': group, 'name': name, 'description': desc, 'overrides': o}
            for sid, group, name, eng, o, desc in SCENARIOS if eng == 'fleet'}
    for xid, base, name, o in SUPPLEMENTARY:
        meta[xid] = {'id': xid, 'group': 'X Supplementary (30% disruptions)', 'name': name,
                     'description': f'{base} with disruption probability 0.30.', 'overrides': o}
    return meta


def main():
    rows = {}
    for line in (ROOT / 'evidence' / 'raw' / 'fleet_results.jsonl').read_text(encoding='utf-8').splitlines():
        r = json.loads(line)
        rows.setdefault(r['scenario_id'], {})[r['seed']] = r
    OUT.mkdir(parents=True, exist_ok=True)
    index, risk = [], {}
    for sid, meta in scenario_meta().items():
        by_seed = rows.get(sid, {})
        if sorted(by_seed) != SEEDS:
            raise SystemExit(f'{sid}: expected seeds {SEEDS[0]}–{SEEDS[-1]}, found {len(by_seed)}')
        runs = []
        for seed in SEEDS:
            metrics = by_seed[seed]['metrics']
            for m in metrics:  # run_fleet drops the waterfall; it is fully determined by the stored totals
                m['financial_waterfall'] = [{'account': 'gross_sales_revenue', 'amount_inr': m['gross_sales_revenue_inr']}] + [
                    {'account': k, 'amount_inr': -m[k]} for k in COSTS]
            runs.append({'seed': seed, 'dataset_sha256': by_seed[seed]['dataset_sha256'], 'metrics': metrics})
        config = SimulationRequest(**{**by_seed[SEEDS[0]]['config'], 'seed': SEEDS[0], 'repetitions': len(SEEDS)})
        result = summarize(config, runs)
        result['study'] = {**meta, 'seeds': [SEEDS[0], SEEDS[-1]], 'source': WORKBOOK,
                           'note': 'Stored 30-seed validation study, computed once and shown unchanged; identical to the Excel workbook.'}
        (OUT / f'{sid}.json').write_text(json.dumps(result), encoding='utf-8')
        s = result['summary']
        index.append({**meta, 'repetitions': len(runs),
                      'mean_profit_inr': {k: s[k]['mean_operating_profit_inr'] for k in s},
                      'mean_spoilage_rate': {k: s[k]['mean_spoilage_rate'] for k in s},
                      'mean_d_minus_c_inr': result['risk']['mean_incremental_m3_vs_m2_inr']})
        if sid in RISK:  # the Risk page reads summaries and distributions only; full runs stay at /api/v1/studies/{id}
            risk[sid] = {**result, 'runs': result['runs'][:1], 'runs_included': f'first seed only; all {len(runs)} at /api/v1/studies/{sid}'}
    (OUT / 'index.json').write_text(json.dumps(index, indent=1), encoding='utf-8')
    ordered = {sid: risk[sid] for sid in RISK}
    (ROOT / 'data' / 'results' / 'sensitivity.json').write_text(json.dumps(ordered), encoding='utf-8')
    print(f'{len(index)} scenarios published to {OUT.relative_to(ROOT)}; sensitivity: {", ".join(ordered)}')


if __name__ == '__main__':
    main()
