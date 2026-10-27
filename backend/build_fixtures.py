"""Generate frontend fixtures by executing the real API on a temporary database."""
import json
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import create_app

root = Path(__file__).resolve().parents[1]
output = root / 'shared/fixtures'
output.mkdir(parents=True, exist_ok=True)


def save(name, response):
    response.raise_for_status()
    value = response.json()
    (output / (name + '.json')).write_text(json.dumps(value, indent=2), encoding='utf-8')
    return value


with tempfile.TemporaryDirectory() as temporary:
    with TestClient(create_app(Path(temporary) / 'fixture.sqlite')) as client:
        path = '/api/v1/batches/T17'
        save('batch-initial', client.get(path))
        save('batch-disrupted', client.post(path + '/events', json={}))
        proposal = save('batch-awaiting-approval', client.post(path + '/investigate', json={}))
        save('batch-executed', client.post(path + '/approval', json={'approve': True, 'expected_version': proposal['version']}))
        save('simulation', client.post('/api/v1/simulations', json={'batches': 2000, 'repetitions': 3}))
print('Wrote five executed API fixtures')
