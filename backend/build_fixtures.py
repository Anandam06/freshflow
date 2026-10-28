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
        run = save('simulation', client.post('/api/v1/simulations', json={'batches': 2000, 'repetitions': 3}))
        run_id = run['id']
        save('run-results', client.get(f'/api/v1/simulations/{run_id}/results'))
        save('run-batches-page', client.get(f'/api/v1/simulations/{run_id}/batches?limit=3'))
        save('run-decision-T17', client.get(f'/api/v1/simulations/{run_id}/decisions/T17'))
        save('scenario-defaults', client.get('/api/v1/scenarios/defaults'))
        save('assumptions', client.get('/api/v1/assumptions'))
        save('sources', client.get('/api/v1/sources'))
print('Wrote executed API fixtures including run-scoped results, batches, decisions and provenance')
