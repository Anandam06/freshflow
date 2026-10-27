import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def trace(state, tool, inputs, result):
    state['trace'].append({'sequence': len(state['trace']) + 1,
                           'timestamp': datetime.now(timezone.utc).isoformat(),
                           'tool': tool, 'inputs': inputs, 'result': result})


class Store:
    def __init__(self, path):
        self.path = str(path)
        self.postgres = self.path.startswith(('postgresql://', 'postgres://'))
        if not self.postgres:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        if self.postgres:
            import psycopg
            db = psycopg.connect(self.path, connect_timeout=10)
        else:
            db = sqlite3.connect(self.path, timeout=30)
        try:
            with db:
                yield DatabaseConnection(db, self.postgres)
        finally:
            db.close()

    def get(self, id='T17'):
        with self.connect() as db:
            row = db.execute('SELECT body FROM batches WHERE id=?', (id,)).fetchone()
        if row is None:
            raise KeyError(id)
        return json.loads(row[0])

    def seed(self):
        state = {'id': 'T17', 'version': 0, 'status': 'monitoring', 'evidence_category': 'SYNTHETIC',
                 'quantity_kg': 500.0, 'initial_rsl_hours': 52.0, 'rsl_hours': 52.0,
                 'rsl_lower_hours': 46.0, 'destination': 'Retailer A', 'delay_hours': 0.0,
                 'safety_hold': False, 'event': None, 'proposal': None, 'agent_mode': None,
                 'monitoring': True, 'trace': []}
        trace(state, 'seed', {}, {'scenario': 'illustrative T17; dedicated single-batch capacity'})
        with self.connect() as db:
            db.execute('INSERT INTO batches VALUES (?, ?) ON CONFLICT(id) DO NOTHING', ('T17', json.dumps(state)))
        return self.get()

    def mutate(self, id, fn, expected_version=None):
        with self.connect() as db:
            if not self.postgres:
                db.execute('BEGIN IMMEDIATE')
            query = 'SELECT body FROM batches WHERE id=?' + (' FOR UPDATE' if self.postgres else '')
            row = db.execute(query, (id,)).fetchone()
            if not row:
                raise KeyError(id)
            state = json.loads(row[0])
            if expected_version is not None and state['version'] != expected_version:
                raise ValueError('Stale version; reload batch and investigate again')
            fn(state)
            state['version'] += 1
            db.execute('UPDATE batches SET body=? WHERE id=?', (json.dumps(state), id))
        return state

    def put_run(self, id, result):
        with self.connect() as db:
            db.execute('INSERT INTO runs VALUES (?,?)', (id, json.dumps(result)))

    def get_run(self, id):
        with self.connect() as db:
            row = db.execute('SELECT body FROM runs WHERE id=?', (id,)).fetchone()
        if not row:
            raise KeyError(id)
        return json.loads(row[0])


class DatabaseConnection:
    """Adapter for static parameterized statements shared by SQLite/Postgres."""
    def __init__(self, connection, postgres):
        self.connection = connection
        self.postgres = postgres

    def execute(self, statement, parameters=()):
        return self.connection.execute(statement.replace('?', '%s') if self.postgres else statement, parameters)
