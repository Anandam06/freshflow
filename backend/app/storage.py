import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def trace(state, tool, inputs, result):
    state['trace'].append({'sequence': len(state['trace']) + 1,
                           'timestamp': datetime.now(timezone.utc).isoformat(),
                           'tool': tool, 'inputs': inputs, 'result': result})


def seed_state():
    state = {'id': 'T17', 'version': 0, 'status': 'monitoring', 'evidence_category': 'SYNTHETIC',
             'quantity_kg': 500.0, 'initial_rsl_hours': 52.0, 'rsl_hours': 52.0,
             'rsl_lower_hours': 46.0, 'destination': 'Retailer A', 'delay_hours': 0.0,
             'safety_hold': False, 'event': None, 'proposal': None, 'agent_mode': None,
             'monitoring': True, 'trace': []}
    trace(state, 'seed', {}, {'scenario': 'illustrative T17; dedicated single-batch capacity'})
    return state


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
        state = seed_state()
        with self.connect() as db:
            db.execute('INSERT INTO batches VALUES (?, ?) ON CONFLICT(id) DO NOTHING', ('T17', json.dumps(state)))
        return self.get()

    def reset(self, id='T17'):
        """Re-seed the dedicated demo batch. The version keeps increasing so stale approvals still fail."""
        if id != 'T17':
            raise KeyError(id)
        previous = self.get(id)

        def restore(state):
            version = state['version']
            state.clear()
            state.update(seed_state())
            state['version'] = version
            trace(state, 'demo_reset', {}, {'previous_version': previous['version'], 'previous_destination': previous['destination']})
        return self.mutate(id, restore)

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

    def put_batch(self, id, state):
        with self.connect() as db:
            db.execute('INSERT INTO batches VALUES (?, ?)', (id, json.dumps(state)))

    def record_llm_usage(self, entries):
        """Accumulate token usage of live agent runs (no prompts or secrets are stored)."""
        if not entries:
            return
        with self.connect() as db:
            if not self.postgres:
                db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT body FROM runs WHERE id=?', ('llm_usage',)).fetchone()
            totals = json.loads(row[0]) if row else {'executions': 0, 'requests': 0, 'input_tokens': 0, 'output_tokens': 0,
                                                     'tool_calls': 0, 'estimated_cost_usd': 0.0, 'by_model': {}}
            for e in entries:
                r, model = e['result'], e['inputs'].get('model', 'unknown')
                totals['executions'] += 1
                for k in ('requests', 'input_tokens', 'output_tokens', 'tool_calls'):
                    totals[k] += r.get(k, 0)
                totals['estimated_cost_usd'] = round(totals['estimated_cost_usd'] + (r.get('estimated_cost_usd') or 0), 6)
                m = totals['by_model'].setdefault(model, {'executions': 0, 'input_tokens': 0, 'output_tokens': 0, 'estimated_cost_usd': 0.0})
                m['executions'] += 1
                m['input_tokens'] += r.get('input_tokens', 0)
                m['output_tokens'] += r.get('output_tokens', 0)
                m['estimated_cost_usd'] = round(m['estimated_cost_usd'] + (r.get('estimated_cost_usd') or 0), 6)
            body = json.dumps(totals)
            if row:
                db.execute('UPDATE runs SET body=? WHERE id=?', (body, 'llm_usage'))
            else:
                db.execute('INSERT INTO runs VALUES (?,?)', ('llm_usage', body))

    def llm_usage(self):
        try:
            totals = self.get_run('llm_usage')
        except KeyError:
            totals = {'executions': 0, 'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'tool_calls': 0,
                      'estimated_cost_usd': 0.0, 'by_model': {}}
        n = totals['executions']
        return {**totals, 'average_cost_per_execution_usd': round(totals['estimated_cost_usd'] / n, 6) if n else None,
                'average_tokens_per_execution': round((totals['input_tokens'] + totals['output_tokens']) / n) if n else None}

    def put_run(self, id, result):
        with self.connect() as db:
            db.execute('INSERT INTO runs VALUES (?,?)', (id, json.dumps(result)))

    def put_run_bundle(self, id, result, artifact):
        with self.connect() as db:
            db.execute('INSERT INTO runs VALUES (?,?)', (id, json.dumps(result)))
            db.execute('INSERT INTO runs VALUES (?,?)', (id + ':artifact', json.dumps(artifact)))

    def get_run(self, id):
        with self.connect() as db:
            row = db.execute('SELECT body FROM runs WHERE id=?', (id,)).fetchone()
        if not row:
            raise KeyError(id)
        return json.loads(row[0])

    def mutate_run(self, id, fn):
        with self.connect() as db:
            if not self.postgres:
                db.execute('BEGIN IMMEDIATE')
            query = 'SELECT body FROM runs WHERE id=?' + (' FOR UPDATE' if self.postgres else '')
            row = db.execute(query, (id,)).fetchone()
            if not row:
                raise KeyError(id)
            document = json.loads(row[0])
            result = fn(document)
            db.execute('UPDATE runs SET body=? WHERE id=?', (json.dumps(document), id))
        return result


class DatabaseConnection:
    """Adapter for static parameterized statements shared by SQLite/Postgres."""
    def __init__(self, connection, postgres):
        self.connection = connection
        self.postgres = postgres

    def execute(self, statement, parameters=()):
        return self.connection.execute(statement.replace('?', '%s') if self.postgres else statement, parameters)
