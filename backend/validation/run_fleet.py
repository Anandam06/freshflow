"""Run the fleet scenario matrix (paired seeds, all four strategies) with batch-level audits.

Uses the backend's own generate/evaluate/financials/comparisons — the exact sequence app.simulation.simulate
runs — so per-seed metrics are identical to a POST /api/v1/simulations with repetitions=1 at that seed.
Usage: python -m validation.run_fleet [--workers 14] [--only S01,X01]
"""
import argparse
import hashlib
import json
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence' / 'raw'
DETAIL_SEED = 60000
DETAIL_SCENARIOS = {'S01', 'X01', 'X04', 'S17', 'S09'}
MODELS = ['M0', 'M1', 'M2', 'M3']


def digest(batches):
    return hashlib.sha256(json.dumps(batches, sort_keys=True).encode()).hexdigest()


def audit(rows, batches, model, config, metrics):
    from app.simulation import day_capacities
    issues = []
    q = sum(r['quantity_kg'] for r in rows)
    residual = q - sum(r['sold_kg'] + r['spoiled_kg'] for r in rows)
    if abs(residual) > 1e-6:
        issues.append(f'mass balance residual {residual}')
    if any(r['sold_kg'] < 0 or r['spoiled_kg'] < 0 for r in rows):
        issues.append('negative stock')
    if any(r['revenue_inr'] and not r['buyer_acceptance'] for r in rows):
        issues.append('revenue on unaccepted batch')
    rev = sum(r['sold_kg'] * r['realized_unit_price_inr'] for r in rows)
    if abs(rev - metrics['gross_sales_revenue_inr']) > 1e-3:
        issues.append('revenue recompute mismatch')
    costs = sum(metrics[k] for k in ['procurement_inr', 'transport_inr', 'handling_inr', 'rescue_inr', 'agent_sensor_inr'])
    if abs(metrics['gross_sales_revenue_inr'] - costs - metrics['operating_profit_inr']) > 1e-3:
        issues.append('profit identity mismatch')
    if abs(sum(r['procurement_inr'] for r in rows) - sum(r['quantity_kg'] * b['procurement_inr_kg'] for r, b in
                                                       zip(sorted(rows, key=lambda r: r['batch_id']), sorted(batches, key=lambda b: b['id'])))) > 1e-3:
        issues.append('procurement not charged on every input kg')
    by_day = {}
    for b in batches:
        by_day.setdefault(b['day'], b)
    over = 0
    for day, first in by_day.items():
        cap = day_capacities([first], config)
        used = {}
        for r in rows:
            if r['day'] == day and r['sold_kg'] > 0:
                used[r['destination']] = used.get(r['destination'], 0) + r['sold_kg']
        over += sum(1 for k, v in used.items() if v > cap[k] + 1e-6)
    if over:
        issues.append(f'{over} buyer-day capacity violations')
    if any(r['safety_violation'] for r in rows):
        issues.append('unsafe produce sold')
    bad_origin = sum(1 for r in rows if r['rescue_attempt'] and r['route'] and r['route'].get('origin', 'junction') != 'junction')
    if bad_origin:
        issues.append(f'{bad_origin} reroutes not starting at current position')
    return {'mass_residual_kg': residual, 'capacity_violations': over, 'issues': issues, 'passed': not issues}


def extras(rows, config, model):
    acc = [r for r in rows if r['buyer_acceptance']]
    sold = sum(r['sold_kg'] for r in rows)
    attempts = sum(r['rescue_attempt'] for r in rows)
    rescued = sum(r['rescued'] for r in rows)
    return {
        'batches': len(rows),
        'accepted_batches': len(acc),
        'salvage_kg': sum(r['sold_kg'] for r in acc if r['destination'] == 'Processor C'),
        'mean_estimated_initial_rsl_h': sum(r['estimated_freshness']['rsl_hours'] for r in rows) / len(rows),
        'mean_arrival_rsl_accepted_h': sum(r['realized_arrival_rsl_hours'] for r in acc) / len(acc) if acc else None,
        'realized_price_per_sold_kg_inr': sum(r['revenue_inr'] for r in acc) / sold if sold else None,
        'rescue_attempts': attempts,
        'failed_interventions': attempts - rescued,
        'approval_wait_hours_total': attempts * config.approval_delay_hours if model == 'M3' else 0.0,
        'safety_holds': sum(1 for r in rows if r['trace'][0]['result']['event']['safety_hold']),
        'diverted_batches': sum(1 for r in rows if r['destination'] and r['morning_destination'] and r['destination'] != r['morning_destination']),
    }


def trim(r):
    keep = {k: r[k] for k in ['batch_id', 'day', 'quantity_kg', 'morning_destination', 'destination', 'sold_kg', 'spoiled_kg',
                              'revenue_inr', 'realized_unit_price_inr', 'procurement_inr', 'transport_inr', 'handling_inr',
                              'rescue_inr', 'agent_sensor_inr', 'rescue_attempt', 'rescued', 'buyer_acceptance', 'on_time',
                              'realized_arrival_rsl_hours', 'constraint_violations', 'solver_status']}
    keep['estimated_rsl_h'] = r['estimated_freshness']['rsl_hours']
    keep['estimated_rsl_lower_h'] = r['estimated_freshness']['rsl_lower_hours']
    keep['route'] = r['route']
    if r['rescue_attempt']:
        keep['candidates'] = [{k: o[k] for k in ['id', 'price_inr_kg', 'travel_hours', 'arrival_rsl_lower_hours', 'feasible', 'reasons',
                                                 'net_proceeds_inr', 'minimum_rsl_hours']} for o in r['candidate_decisions']]
        keep['trace'] = [{'sequence': t['sequence'], 'tool': t['tool'], 'timestamp': t['timestamp']} for t in r['trace']]
    return keep


def run_job(sid, overrides, seed):
    from app.models import SimulationRequest
    from app.generator import generate
    from app.simulation import evaluate
    from app.financials import financials, comparisons
    t0 = time.perf_counter()
    config = SimulationRequest(seed=seed, repetitions=1, **overrides)
    batches = generate(config, seed)
    d0 = digest(batches)
    metrics, audits, extra, detail = [], {}, {}, {}
    for model in MODELS:
        rows = evaluate(batches, model, config)
        m = financials(rows, model, config.setup_cost_inr if model == 'M3' else 0)
        metrics.append(m)
        audits[model] = audit(rows, batches, model, config, m)
        audits[model]['same_events_digest'] = digest(batches) == d0
        extra[model] = extras(rows, config, model)
        if seed == DETAIL_SEED and sid in DETAIL_SCENARIOS:
            detail[model] = [trim(r) for r in rows]
    metrics = comparisons(metrics, config.days, config.setup_cost_inr)
    for m in metrics:
        m.pop('financial_waterfall', None)
    return {'scenario_id': sid, 'seed': seed, 'config': config.model_dump(), 'dataset_sha256': d0,
            'metrics': metrics, 'extras': extra, 'audit': audits, 'runtime_s': time.perf_counter() - t0,
            'finished_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'detail': detail}


def main():
    from validation.scenarios import fleet_jobs, SEEDS
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=14)
    ap.add_argument('--only', default='')
    ap.add_argument('--seeds', type=int, default=len(SEEDS))
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / 'fleet_results.jsonl'
    done = set()
    if out.exists():
        for line in out.read_text(encoding='utf-8').splitlines():
            r = json.loads(line)
            done.add((r['scenario_id'], r['seed']))
    only = set(filter(None, a.only.split(',')))
    jobs = [(sid, o, s) for sid, o in fleet_jobs() for s in SEEDS[:a.seeds]
            if (not only or sid in only) and (sid, s) not in done]
    print(f'{len(jobs)} jobs ({len(done)} already done)', flush=True)
    t0 = time.time()
    with ProcessPoolExecutor(a.workers) as ex, out.open('a', encoding='utf-8') as fh:
        futures = [ex.submit(run_job, *j) for j in jobs]
        for i, f in enumerate(as_completed(futures), 1):
            r = f.result()
            detail = r.pop('detail')
            if detail:
                (OUT / f"detail_{r['scenario_id']}_{r['seed']}.json").write_text(json.dumps(detail), encoding='utf-8')
            fh.write(json.dumps(r) + '\n')
            fh.flush()
            if i % 25 == 0 or i == len(jobs):
                print(f'{i}/{len(jobs)} done, {time.time() - t0:.0f}s elapsed', flush=True)


if __name__ == '__main__':
    main()
