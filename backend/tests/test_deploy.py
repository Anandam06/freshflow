"""Single-service deployment behaviour: SPA serving, public-demo access, result reuse, AI budget."""
from fastapi.testclient import TestClient

from app.main import create_app


def make(tmp_path, monkeypatch, **env):
    dist = tmp_path / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<!doctype html><title>FreshFlow</title>', encoding='utf-8')
    (dist / 'assets' / 'app.js').write_text('console.log(1)', encoding='utf-8')
    (tmp_path / 'secret.txt').write_text('do-not-serve', encoding='utf-8')
    monkeypatch.delenv('FRESHFLOW_OPERATOR_KEY', raising=False)
    monkeypatch.setenv('FRESHFLOW_STATIC_DIR', str(dist))
    for k, v in {'FRESHFLOW_ENV': 'public-demo', **env}.items():
        monkeypatch.setenv(k, v)
    return TestClient(create_app(tmp_path / 'deploy.sqlite'))


def test_frontend_routes_assets_and_no_traversal(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    assert 'FreshFlow' in c.get('/').text
    assert 'FreshFlow' in c.get('/playground').text  # client-side route
    assert c.get('/assets/app.js').text == 'console.log(1)'
    assert c.get('/api/v1/unknown').status_code == 404
    assert c.get('/api/v1/health').json()['status'] == 'ok'
    assert 'do-not-serve' not in c.get('/../secret.txt').text
    assert 'do-not-serve' not in c.get('/assets/..%2f..%2fsecret.txt').text


def test_head_requests_mirror_get_without_body(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    for path in ['/', '/playground', '/assets/app.js', '/api/v1/health']:
        get, head = c.get(path), c.head(path)
        assert head.status_code == 200 and head.content == b''
        assert head.headers['content-type'] == get.headers['content-type']
    assert c.head('/api/v1/unknown').status_code == 404
    assert c.head('/api/v1/excel/upload').status_code in (404, 405)  # POST-only routes are never served to HEAD/GET


def test_public_demo_needs_no_key_but_production_does(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    assert c.post('/api/v1/shipments', json={}).status_code == 200
    prod = make(tmp_path / 'p', monkeypatch, FRESHFLOW_ENV='production')
    assert prod.post('/api/v1/shipments', json={}).status_code == 503


def test_identical_simulation_requests_reuse_the_stored_run(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    body = {'batches': 40, 'repetitions': 1, 'days': 2}
    a = c.post('/api/v1/simulations', json=body).json()
    b = c.post('/api/v1/simulations', json=body).json()
    assert a['id'] == b['id'] and a['result'] == b['result']
    assert c.post('/api/v1/simulations', json={**body, 'seed': 1}).json()['id'] != a['id']


def test_daily_ai_budget_blocks_live_runs(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch, FRESHFLOW_LLM_DAILY_BUDGET_USD='0.001', FRESHFLOW_LLM_PROVIDER='anthropic',
             ANTHROPIC_API_KEY='test-key-not-real')
    c.app.state.store.record_llm_usage([{'inputs': {'model': 'claude-haiku-5-5'}, 'result': {'estimated_cost_usd': 0.002}}])
    r = c.post('/api/v1/shipments', json={'mode': 'live'})
    assert r.status_code == 429 and 'budget' in r.json()['detail']
    assert c.post('/api/v1/shipments', json={'mode': 'deterministic'}).status_code == 200
