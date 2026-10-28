"""Exercise an actual local Uvicorn HTTP server, then stop it cleanly."""
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import httpx

with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
with tempfile.TemporaryDirectory() as temporary:
    environment = dict(os.environ, FRESHFLOW_DB=str(Path(temporary) / 'smoke.sqlite'), FRESHFLOW_ENV='development')
    environment.pop('DATABASE_URL', None)
    environment.pop('FRESHFLOW_OPERATOR_KEY', None)
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)],
                               env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=5, trust_env=False) as client:
            for attempt in range(100):
                try:
                    health = client.get('/health')
                    health.raise_for_status()
                    break
                except httpx.ConnectError:
                    if process.poll() is not None:
                        raise RuntimeError(process.stderr.read().decode())
                    time.sleep(0.1)
            else:
                raise RuntimeError('Uvicorn did not start within 10 seconds')
            assert client.get('/docs').status_code == 200
            result = client.post('/api/v1/simulations', json={'batches': 50, 'repetitions': 1})
            result.raise_for_status()
            assert len(result.json()['result']['runs'][0]['metrics']) == 4
            run_id = result.json()['id']
            assert client.get(f'/api/v1/simulations/{run_id}/batches?limit=3').json()['total'] == 50
            assert client.get(f'/api/v1/simulations/{run_id}/decisions/T17').status_code == 200
            assert client.get('/api/v1/health').status_code == 200
            path = '/api/v1/batches/T17'
            client.post(path + '/events', json={}).raise_for_status()
            pending = client.post(path + '/investigate', json={})
            pending.raise_for_status()
            done = client.post(path + '/approval', json={'approve': True, 'expected_version': pending.json()['version']})
            done.raise_for_status()
            assert client.get(path).json()['destination'] == 'Wholesale B'
            print('HTTP smoke passed: health, docs, simulation, event, tools, approval and persisted destination')
    finally:
        process.terminate()
        process.communicate(timeout=10)
