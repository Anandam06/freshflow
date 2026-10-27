"""Real PostgreSQL integration: CI provides a dedicated test database."""
import json
import os
from uuid import uuid4
import pytest
from app.storage import Store


@pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='No dedicated PostgreSQL test server configured')
def test_postgres_persistent_state_and_versioning():
    store = Store(os.environ['TEST_DATABASE_URL'])
    state = store.seed()
    test_id = 'test-' + str(uuid4())
    state['id'] = test_id
    state['version'] = 0
    with store.connect() as db:
        db.execute('INSERT INTO batches VALUES (?, ?)', (test_id, json.dumps(state)))
    updated = store.mutate(test_id, lambda s: s.update(destination='Wholesale B'), 0)
    assert updated['version'] == 1
    assert Store(os.environ['TEST_DATABASE_URL']).get(test_id)['destination'] == 'Wholesale B'
    with pytest.raises(ValueError):
        store.mutate(test_id, lambda s: s.update(destination='Processor C'), 0)
