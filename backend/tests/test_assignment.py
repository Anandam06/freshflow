import copy
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.models import SimulationRequest, SimulationResult, BatchRecord, RunDecision
from app.generator import generate, planning_view
from app.simulation import evaluate, plan_day, simulate
from app.optimization import alternatives, allocate_day, BUYERS
from app.run_service import build_artifact, decision, decide
from app.financials import financials


def test_generator_schema_and_observation_separation():
    config = SimulationRequest(batches=50)
    for batch in generate(config, 17):
        BatchRecord.model_validate(batch)
        assert batch['harvest_timestamp'] < batch['dispatch_timestamp']
        assert 'physical_condition' not in planning_view(batch)
        assert 'future_event' not in planning_view(batch)
        assert batch['future_event']['temperature_history']
        assert batch['future_event']['humidity_history']


def test_sensor_error_does_not_change_latent_condition():
    low = generate(SimulationRequest(batches=20, prediction_error_hours=0), 8)
    high = generate(SimulationRequest(batches=20, prediction_error_hours=12), 8)
    assert [b['physical_condition'] for b in low] == [b['physical_condition'] for b in high]
    assert [b['initial_rsl_hours'] for b in low] != [b['initial_rsl_hours'] for b in high]


def test_impossible_route_blocked():
    options = alternatives(100, 500, current_location='unknown_or_already_delivered')
    assert all(not o['feasible'] for o in options)
    assert all('No feasible route from current shipment location' in o['reasons'] for o in options)


def test_actual_cancelled_buyer_cannot_accept():
    config = SimulationRequest(batches=30, buyer_availability=1)
    data = generate(config, 11)
    for batch in data:
        batch['future_event']['cancelled_buyers'] = [b['id'] for b in BUYERS]
    for model in ['M0', 'M1', 'M2', 'M3']:
        assert not any(row['buyer_acceptance'] for row in evaluate(data, model, config))


def test_reroute_does_not_imply_success_under_sensor_error():
    config = SimulationRequest(batches=1, days=1, buyer_availability=1, cancellation_probability=0)
    data = generate(config, 3)
    b = data[0]
    b.update(initial_rsl_hours=52, quality_grade='A')
    b['physical_condition']['initial_rsl_hours'] = 1
    b['future_event'].update(temperature_c=35, physical_temperature_c=35, duration_hours=6, delay_hours=12, safety_hold=False)
    row = evaluate(data, 'M3', config)[0]
    assert row['rescue_attempt'] and row['destination'] is not None
    assert not row['buyer_acceptance'] and row['sold_kg'] == 0
    assert not row['rescued']


def test_signed_ledger_and_salvage_not_counted_twice():
    config = SimulationRequest(batches=80, days=2)
    rows = evaluate(generate(config, 4), 'M3', config)
    metrics = financials(rows, 'M3')
    assert sum(item['amount_inr'] for row in rows for item in row['ledger']) == pytest.approx(metrics['operating_profit_inr'])
    assert sum(item['amount_inr'] for item in metrics['financial_waterfall']) == pytest.approx(metrics['operating_profit_inr'])
    assert metrics['salvage_value_inr'] <= metrics['gross_sales_revenue_inr']
    assert metrics['gross_sales_revenue_inr'] == pytest.approx(sum(row['sold_kg'] * row['realized_unit_price_inr'] for row in rows))
    assert all(len({x['account'] for x in row['ledger']}) == len(row['ledger']) for row in rows)


def test_regression_freshflow_can_be_worse():
    config = SimulationRequest(batches=80, days=2, disruption_probability=0, cancellation_probability=0,
                               buyer_availability=1, initial_rsl_scale=2, prediction_error_hours=0, ai_cost_multiplier=20)
    data = generate(config, 18)
    m2 = financials(evaluate(data, 'M2', config), 'M2')
    m3 = financials(evaluate(data, 'M3', config), 'M3')
    assert m3['operating_profit_inr'] < m2['operating_profit_inr']


def test_joint_solver_beats_greedy_capacity_example():
    batches = [{'quantity_kg': 600}, {'quantity_kg': 500}, {'quantity_kg': 500}]
    candidates = [[{'id': 'Retailer A', 'feasible': True, 'net_proceeds_inr': value}] for value in [600, 550, 550]]
    result = allocate_day(batches, candidates, {'Retailer A': 1000}, 1000)
    assert result[0] is None
    assert result[1] and result[2]


def test_no_future_or_latent_leakage_changes_plan():
    config = SimulationRequest(batches=40, days=1)
    data = generate(config, 6)
    original = plan_day([planning_view(b) for b in data], 'M2', config)
    for b in data:
        b['physical_condition']['initial_rsl_hours'] = 0
        b['future_event']['delay_hours'] = 999
    assert original == plan_day([planning_view(b) for b in data], 'M2', config)


def test_calibration_and_evaluation_seeds_disjoint():
    root = Path(__file__).resolve().parents[2]
    calibration = json.loads((root / 'data/scenarios/calibration.json').read_text())
    assert not set(calibration['calibration_seeds']) & set(calibration['evaluation_seeds_reserved'])
    assert 0.25 <= calibration['calibration_mean_spoilage'] <= 0.30
    assert SimulationRequest().initial_rsl_scale == calibration['frozen_initial_rsl_scale']
    assert SimulationRequest().disruption_probability == calibration['frozen_disruption_probability']


def test_run_api_contract_decisions_and_results(tmp_path, monkeypatch):
    monkeypatch.delenv('FRESHFLOW_OPERATOR_KEY', raising=False)
    monkeypatch.setenv('FRESHFLOW_ENV', 'development')
    with TestClient(create_app(tmp_path / 'run.sqlite')) as client:
        assert client.get('/api/v1/health').status_code == 200
        assert client.get('/api/v1/scenarios/defaults').json()['parameters']['batches'] == 2000
        made = client.post('/api/v1/simulations', json={'batches': 25, 'repetitions': 1, 'buyer_availability': 1,
                                                         'disruption_probability': 0.8}).json()
        id = made['id']
        result = client.get(f'/api/v1/simulations/{id}/results').json()
        SimulationResult.model_validate(result)
        page = client.get(f'/api/v1/simulations/{id}/batches?limit=5&offset=5').json()
        assert page['total'] == 25 and len(page['batches']) == 5
        assert all(b['simulated_m3']['evidence_category'] == 'SIMULATED RESULT' for b in page['batches'])
        rescues = client.get(f'/api/v1/simulations/{id}/batches?rescue_only=true&limit=50').json()
        assert all(b['simulated_m3']['rescue_attempt'] for b in rescues['batches'])
        assert rescues['total'] == sum(1 for i in range(0, 25, 5) for b in client.get(
            f'/api/v1/simulations/{id}/batches?offset={i}&limit=5').json()['batches'] if b['simulated_m3']['rescue_attempt'])
        found = None
        for i in range(1, 26):
            data = client.get(f'/api/v1/simulations/{id}/decisions/T{i}').json()
            RunDecision.model_validate(data)
            if data['state']['status'] == 'awaiting_approval':
                found = data
                break
        assert found is not None
        assert found['state']['proposal']['id'] != found['state']['destination']  # never 'approve no change'
        path = f"/api/v1/simulations/{id}/decisions/{found['batch_id']}"
        approved = client.post(path + '/approve', json={'expected_version': found['state']['version']})
        assert approved.status_code == 200
        assert client.post(path + '/approve', json={'expected_version': found['state']['version']}).status_code == 409
        assert client.get(f'/api/v1/simulations/{id}/results').json() == result
        assert client.get('/api/v1/assumptions').status_code == 200
        assert client.get('/api/v1/sources').status_code == 200


def test_replay_inventory_cannot_go_negative():
    config = SimulationRequest(batches=30, days=1, buyer_availability=1, disruption_probability=0.8)
    artifact = build_artifact(config)
    for b in artifact['batches']:
        item = decision(artifact, b['id'], config, 'test')
        if item['state']['status'] == 'awaiting_approval':
            try:
                decide(artifact, b['id'], config, 'test', item['state']['version'], True)
            except ValueError:
                pass  # Capacity can change; stale candidate must be rejected.
    assert all(value >= 0 for book in artifact['books'].values() for value in book.values())


def test_feasible_plan_needs_no_approval():
    config = SimulationRequest(batches=30, days=1, buyer_availability=1, disruption_probability=0.0)
    artifact = build_artifact(config)
    states = [decision(artifact, b['id'], config, 'test')['state'] for b in artifact['batches']]
    kept = [s for s in states if s['trace'][-1]['tool'] == 'no_intervention_required']
    assert kept, 'undisrupted feasible plans should continue without approval'
    assert all(s['status'] == 'monitoring' and s['proposal'] is None for s in kept)
    assert not any(s['proposal'] and s['proposal']['id'] == s['destination'] for s in states)
