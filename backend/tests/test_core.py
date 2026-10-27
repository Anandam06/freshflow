import copy
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.agent import apply_event, investigate, approve
from app.freshness import predict_rsl
from app.main import create_app
from app.models import SimulationRequest
from app.optimization import BUYERS
from app.simulation import generate, plan_day, evaluate, simulate
from app.storage import Store


@pytest.fixture
def store(tmp_path):
    result = Store(tmp_path / 'test.sqlite')
    result.seed()
    return result


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('FRESHFLOW_ENV', 'development')
    monkeypatch.delenv('FRESHFLOW_OPERATOR_KEY', raising=False)
    return TestClient(create_app(tmp_path / 'api.sqlite'))


def test_temperature_and_uncertainty():
    cool = predict_rsl(52, 20, 6)
    hot = predict_rsl(52, 35, 6)
    assert 0 <= hot['rsl_lower_hours'] < hot['rsl_hours'] < cool['rsl_hours']
    assert predict_rsl(1, 50, 72)['rsl_hours'] == 0


def test_reproducibility():
    config = SimulationRequest(batches=100, repetitions=2)
    assert simulate(config) == simulate(config)
    assert generate(config, 1) != generate(config, 2)


@pytest.mark.parametrize('model', ['M0', 'M1', 'M2', 'M3'])
@pytest.mark.parametrize('capacity', [0.1, 1, 3])
def test_physical_and_accounting_invariants(model, capacity):
    config = SimulationRequest(batches=300, days=2, repetitions=1, capacity_multiplier=capacity)
    rows = evaluate(generate(config, 77), model, config)
    assert len(rows) == config.batches
    for row in rows:
        assert 0 <= row['sold_kg'] <= row['quantity_kg'] <= 1000
        assert not row['safety_violation']
    for day in range(config.days):
        daily = [r for r in rows if r['day'] == day]
        assert sum(r['sold_kg'] for r in daily) <= 40000 * capacity
        for buyer in BUYERS:
            assert sum(r['sold_kg'] for r in daily if r['destination'] == buyer['id']) <= buyer['capacity_kg'] * capacity


def test_no_future_information():
    config = SimulationRequest(batches=40, days=1)
    batches = generate(config, 8)
    observed = [{k: v for k, v in b.items() if k != 'future_event'} for b in batches]
    original = plan_day(observed, 'M2', config)
    for b in batches:
        b['future_event']['delay_hours'] = 900
    assert original == plan_day([{k: v for k, v in b.items() if k != 'future_event'} for b in batches], 'M2', config)


def test_financial_reconciliation():
    result = simulate(SimulationRequest(batches=100, repetitions=1))
    metrics = result['runs'][0]['metrics']
    for m in metrics:
        assert m['input_kg'] == m['sellable_kg'] + m['spoiled_kg']
        costs = sum(m[k] for k in ['procurement_inr', 'transport_inr', 'handling_inr', 'rescue_inr', 'agent_sensor_inr'])
        assert m['operating_profit_inr'] == pytest.approx(m['gross_sales_revenue_inr'] - costs)
        assert m['net_realization_per_input_kg_inr'] * m['input_kg'] == pytest.approx(m['operating_profit_inr'] + m['procurement_inr'])
    assert metrics[3]['incremental_agentic_policy_profit_vs_m2_inr'] == pytest.approx(metrics[3]['operating_profit_inr'] - metrics[2]['operating_profit_inr'])


def test_hero_flow_persistence_and_duplicate_approval(client):
    path = '/api/v1/batches/T17'
    original = client.get(path).json()
    assert original['destination'] == 'Retailer A'
    event = client.post(path + '/events', json={}).json()
    assert event['status'] == 'event_detected'
    pending = client.post(path + '/investigate', json={}).json()
    assert pending['proposal']['id'] == 'Wholesale B'
    assert pending['destination'] == 'Retailer A'
    assert client.post(path + '/investigate', json={}).status_code == 409
    payload = {'approve': True, 'expected_version': pending['version']}
    done = client.post(path + '/approval', json=payload)
    assert done.status_code == 200
    assert done.json()['destination'] == 'Wholesale B'
    assert done.json()['monitoring']
    assert client.get(path).json()['destination'] == 'Wholesale B'
    assert client.post(path + '/approval', json=payload).status_code == 409


def test_event_invalidates_pending_approval(client):
    path = '/api/v1/batches/T17'
    client.post(path + '/events', json={})
    pending = client.post(path + '/investigate', json={}).json()
    client.post(path + '/events', json={'safety_hold': True})
    assert client.post(path + '/approval', json={'approve': True, 'expected_version': pending['version']}).status_code == 409
    reviewed = client.post(path + '/investigate', json={}).json()
    assert reviewed['status'] == 'manual_review'
    assert reviewed['destination'] == 'Retailer A'
    assert reviewed['proposal'] is None


def test_operator_auth_and_validation(client, monkeypatch):
    monkeypatch.setenv('FRESHFLOW_OPERATOR_KEY', 'test-key')
    assert client.post('/api/v1/simulations', json={}).status_code == 401
    assert client.post('/api/v1/simulations', json={'batches': -1}, headers={'X-Operator-Key': 'test-key'}).status_code == 422
    assert client.get('/api/v1/batches/unknown').status_code == 404
    assert client.post('/api/v1/batches/T17/events', json={'temperature_c': 99}, headers={'X-Operator-Key': 'test-key'}).status_code == 422


def test_simulation_and_evidence_endpoints(client):
    response = client.post('/api/v1/simulations', json={'batches': 20, 'repetitions': 1})
    assert response.status_code == 200
    data = response.json()
    assert client.get('/api/v1/simulations/' + data['id']).json() == data['result']
    assert client.get('/api/v1/evidence').status_code == 200


def test_live_tool_loop_with_mock_provider(store, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-not-a-real-key')
    monkeypatch.setenv('OPENAI_MODEL', 'test-model')
    calls = iter(['check_buyers_routes', 'inspect_batch', 'predict_freshness', 'rank_options', 'check_policy', 'propose_action'])
    def provider(request):
        body = json.loads(request.content)
        assert body['parallel_tool_calls'] is False
        name = next(calls)
        args = {'destination': 'Wholesale B'} if name in ['check_policy', 'propose_action'] else {}
        return httpx.Response(200, json={'output': [{'type': 'function_call', 'id': name, 'call_id': name, 'name': name, 'arguments': json.dumps(args)}]})
    state = store.get()
    apply_event(state, {'temperature_c': 35, 'duration_hours': 6, 'delay_hours': 12, 'safety_hold': False})
    investigate(state, 'live', httpx.MockTransport(provider))
    assert state['status'] == 'awaiting_approval'
    assert state['agent_mode'] == 'live'
    assert state['destination'] == 'Retailer A'
    assert state['trace'][2]['tool'] == 'check_buyers_routes'


def test_live_missing_key_never_silently_falls_back(client, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    client.post('/api/v1/batches/T17/events', json={})
    assert client.post('/api/v1/batches/T17/investigate', json={'mode': 'live'}).status_code == 409
    state = client.get('/api/v1/batches/T17').json()
    assert state['proposal'] is None
    assert state['destination'] == 'Retailer A'


def test_store_reopen_and_stale_write(store):
    state = store.get()
    store.mutate('T17', lambda s: s.update(status='manual_review'), state['version'])
    assert Store(store.path).get()['status'] == 'manual_review'
    with pytest.raises(ValueError):
        store.mutate('T17', lambda s: s.update(destination='Processor C'), state['version'])


def test_rejected_approval_preserves_destination(client):
    path = '/api/v1/batches/T17'
    client.post(path + '/events', json={})
    pending = client.post(path + '/investigate', json={}).json()
    result = client.post(path + '/approval', json={'approve': False, 'expected_version': pending['version']})
    assert result.status_code == 200
    assert result.json()['destination'] == 'Retailer A'
    assert result.json()['status'] == 'manual_review'


def test_competing_approvals_commit_once(store):
    from concurrent.futures import ThreadPoolExecutor
    store.mutate('T17', lambda s: apply_event(s, {'temperature_c': 35, 'duration_hours': 6, 'delay_hours': 12, 'safety_hold': False}))
    state = store.mutate('T17', lambda s: investigate(s, 'deterministic'))
    def attempt():
        try:
            store.mutate('T17', lambda s: approve(s, True), state['version'])
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: attempt(), range(2))) == [False, True]
    assert sum(t['tool'] == 'execute_destination_change' for t in store.get()['trace']) == 1


def test_zero_revenue_metrics_are_undefined():
    from app.financials import financials, comparisons
    config = SimulationRequest(batches=5, days=1)
    batches = generate(config, 4)
    for b in batches:
        b['future_event']['safety_hold'] = True
    metrics = comparisons([financials(evaluate(batches, m, config), m) for m in ['M0', 'M1', 'M2', 'M3']], 1, 50000)
    assert all(m['operating_profit_margin'] is None for m in metrics)
    assert all(m['margin_relative_uplift_vs_m0'] is None for m in metrics)
    assert metrics[3]['payback_days'] is None


def test_policy_blocks_hallucinated_or_unsafe_proposal(store):
    from app.agent import Investigation
    state = store.get()
    inv = Investigation(state)
    with pytest.raises(ValueError):
        inv.call('propose_action', {'destination': 'Wholesale B'})
    for name in ['inspect_batch', 'predict_freshness', 'check_buyers_routes', 'rank_options']:
        inv.call(name, {})
    with pytest.raises(ValueError):
        inv.call('check_policy', {'destination': 'Invented Buyer'})
    assert state['proposal'] is None


def test_provider_failure_is_audited_without_mutation(store, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test')
    monkeypatch.setenv('OPENAI_MODEL', 'test')
    state = store.get()
    apply_event(state, {'temperature_c': 35, 'duration_hours': 6, 'delay_hours': 12, 'safety_hold': False})
    with pytest.raises(httpx.HTTPStatusError):
        investigate(state, 'live', httpx.MockTransport(lambda _: httpx.Response(503)))
    assert state['destination'] == 'Retailer A'
    assert state['proposal'] is None


def test_health_and_contract(client):
    assert client.get('/health').json()['database'] == 'sqlite'
    schema = client.get('/openapi.json').json()
    assert schema['components']['schemas']['Metrics']['properties']['operating_profit_margin']
    assert '/api/v1/batches/{batch_id}/approval' in schema['paths']


def test_daily_static_allocation_does_not_alias_day_buckets():
    config = SimulationRequest()
    dataset = generate(config, 2026)
    for day in range(config.days):
        assert len({b['morning_buyer'] for b in dataset if b['day'] == day}) == 3
