"""Build-time warm-up: store the default seed-60000 fleet run (the Control Tower / replay run) in the image's SQLite database.

Runs in the Dockerfile. Identical requests later reuse this stored, deterministic result.
"""
import os

os.environ.setdefault('FRESHFLOW_ENV', 'public-demo')

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402

client = TestClient(create_app())
response = client.post('/api/v1/simulations', json={'repetitions': 1})
response.raise_for_status()
print('cached replay simulation', response.json()['id'])
