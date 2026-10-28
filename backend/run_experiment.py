import argparse
import json
import gzip
import hashlib
from pathlib import Path
from app.models import SimulationRequest
from app.simulation import simulate, generate

parser = argparse.ArgumentParser()
parser.add_argument('--seed', type=int, default=60000)
parser.add_argument('--batches', type=int, default=2000)
parser.add_argument('--repetitions', type=int, default=3)
args = parser.parse_args()
config = SimulationRequest(**vars(args))
root = Path(__file__).resolve().parents[1]
for directory in ['data/synthetic', 'data/results']:
    (root / directory).mkdir(parents=True, exist_ok=True)
(root / 'data/synthetic/batches.json').write_text(json.dumps(generate(config, config.seed), indent=2), encoding='utf-8')
dataset = (root / 'data/synthetic/batches.json').read_bytes()
(root / 'data/synthetic/batches.json.gz').write_bytes(gzip.compress(dataset, mtime=0))
(root / 'data/synthetic/manifest.json').write_text(json.dumps({'seed': config.seed, 'batches': config.batches,
    'sha256': hashlib.sha256(dataset).hexdigest(), 'config': config.model_dump(),
    'evidence_category': 'SYNTHETIC', 'gzip_mtime': 0}, indent=2), encoding='utf-8')
result = simulate(config)
(root / 'data/results/comparison.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result['summary'], indent=2))
