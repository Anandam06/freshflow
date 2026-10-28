"""Normalize the evidence register without turning synthetic assumptions into research."""
import csv
import json
from pathlib import Path
from app.models import SimulationRequest

root = Path(__file__).resolve().parents[1]
path = root / 'research/assumptions.csv'
with path.open(encoding='utf-8', newline='') as handle:
    rows = list(csv.DictReader(handle))
for row in rows:
    row['source_url'] = 'https://postharvest.ucdavis.edu/produce-facts-sheets/tomato' if row['category'] == 'RESEARCH' else ''
    row['explanation'] = row.get('basis', '') + '; ' + row.get('limitation', '')
    row['sensitivity_bounds'] = row.get('sensitivity_bounds') or 'Not independently varied; see scenario parameters'
    row['validation_status'] = 'case-specified; not a measured FreshFlow outcome' if row['category'] == 'CASE' else 'synthetic; not empirically validated'
schema = SimulationRequest.model_json_schema()['properties']
for key, value in SimulationRequest().model_dump().items():
    id = 'CFG-' + key
    item = {'id': id, 'category': 'SYNTHETIC', 'parameter': key, 'value': str(value),
            'unit': 'hours' if key.endswith('hours') else 'INR' if key.endswith('inr') else 'C' if key.endswith('_c') else 'count' if key in ['seed', 'batches', 'days', 'repetitions'] else 'ratio',
            'basis': 'API default scenario', 'limitation': 'Case-aligned synthetic experiment; not field data',
            'source_url': '', 'explanation': 'Configurable experiment input, frozen defaults recorded in OpenAPI',
            'sensitivity_bounds': json.dumps({k: v for k, v in schema[key].items() if k in ['minimum', 'maximum']}),
            'validation_status': 'baseline scale case-calibrated only' if key == 'initial_rsl_scale' else 'synthetic; not empirically validated'}
    rows = [r for r in rows if r['id'] != id] + [item]
additional = {
    'V2-maturity': ('Maturity multipliers', 'mature_green=1.2;pink=1;red=0.8', 'ratio'),
    'V2-quality': ('Quality multipliers and grade frequencies', 'A=1;B=0.9;C=0.75;frequency=0.5/0.4/0.1', 'ratio'),
    'V2-sensor': ('Temperature observation noise', 'Gaussian standard deviation 0.5', 'C'),
    'V2-humidity': ('Recorded relative humidity', 'Uniform 70 to 98; no quantitative deterioration coefficient', 'percent'),
    'V2-demand': ('Daily buyer demand fraction of capacity', 'Uniform 0.8 to 1.0', 'ratio'),
    'V2-price': ('Event spot price factor', 'Uniform 0.85 to 1.15', 'ratio'),
    'V2-window': ('Buyer receiving window', '30 from dispatch; service KPI deadline remains 24', 'hours'),
    'V2-harvest': ('Harvest before dispatch', 'Uniform 6 to 24; initial RSL already reflects maturity/quality', 'hours'),
    'V2-route': ('Shared depot-to-junction trunk', '6; outgoing remaining route hours 12/5/2', 'hours'),
    'V2-solver': ('CP-SAT budget', '0.05 deterministic-time units; one worker; random seed 0', 'solver units'),
}
for id, (parameter, value, unit) in additional.items():
    rows = [r for r in rows if r['id'] != id] + [{'id': id, 'category': 'SYNTHETIC', 'parameter': parameter,
        'value': value, 'unit': unit, 'basis': 'Illustrative model design', 'limitation': 'Not fitted to scientific measurements',
        'source_url': '', 'explanation': 'Explicit engine v2 assumption', 'sensitivity_bounds': 'See value and scenario controls',
        'validation_status': 'synthetic; not empirically validated'}]
with path.open('w', encoding='utf-8', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
(root / 'research/assumptions.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
