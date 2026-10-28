"""Claude orchestration tests with a scripted fake client (no network, no cost)."""
import json
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

READS = ['get_batch_state', 'predict_remaining_shelf_life', 'get_buyer_options', 'check_buyer_capacity', 'calculate_route_eta']
HEAT_AND_TRAFFIC = [{'type': 'heavy_traffic', 'severity': 'high'}, {'type': 'temperature_rise', 'severity': 'high'}]


def tool_use(name, args=None, i=[0]):
    i[0] += 1
    return NS(type='tool_use', id=f'toolu_{i[0]}', name=name, input=args or {})


def reply(*blocks, stop='tool_use'):
    return NS(content=list(blocks), stop_reason=stop, usage=NS(input_tokens=1000, output_tokens=60, cache_read_input_tokens=0))


class ScriptedClaude:
    """Plays the role of the model: picks tools; reads ranked options from the real tool results."""

    def __init__(self, script):
        self.script = script
        self.calls = []
        self.messages = NS(create=self.create)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.script(len(self.calls), kwargs['messages'])


def best_feasible(messages):
    for m in reversed(messages):
        if m['role'] == 'user' and isinstance(m['content'], list):
            for r in m['content']:
                body = json.loads(r['content']) if not r.get('is_error') else {}
                if 'options' in body:
                    return next(o['id'] for o in body['options'] if o['feasible'])
    raise AssertionError('no ranked options seen')


def happy_script(n, messages):
    if n == 1:
        return reply(*[tool_use(t) for t in READS])
    if n == 2:
        return reply(tool_use('optimize_destination'))
    if n == 3:
        return reply(tool_use('validate_constraints', {'destination': best_feasible(messages)}))
    if n == 4:
        return reply(tool_use('request_human_approval', {'destination': best_feasible(messages)}))
    return reply(NS(type='text', text='Retailer arrival is too late; Dadar wholesale can accept it in time.'), stop='end_turn')


@pytest.fixture
def client_with(tmp_path, monkeypatch):
    def make(script):
        import anthropic
        fake = ScriptedClaude(script)
        monkeypatch.setenv('FRESHFLOW_ENV', 'development')
        monkeypatch.delenv('FRESHFLOW_OPERATOR_KEY', raising=False)
        monkeypatch.setenv('FRESHFLOW_LLM_PROVIDER', 'anthropic')
        monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
        monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-haiku-5-5')
        monkeypatch.setattr(anthropic, 'Anthropic', lambda **kw: fake)
        return TestClient(create_app(tmp_path / 'claude.sqlite')), fake
    return make


def run(client, **body):
    r = client.post('/api/v1/shipments', json={'mode': 'live', **body})
    assert r.status_code == 200, r.text
    return r.json()


def tools(p):
    return [t['tool'] for t in p['state']['trace']]


def test_claude_orchestrates_python_tools_and_waits_for_approval(client_with):
    client, fake = client_with(happy_script)
    assert client.get('/api/v1/health').json()['llm_model'] == 'claude-haiku-5-5'
    p = run(client, disruptions=HEAT_AND_TRAFFIC)
    assert p['decision_status'] == 'proposed_awaiting_approval'
    assert p['state']['agent_mode'] == 'live'
    assert tools(p)[2:9] == READS + ['optimize_destination', 'validate_constraints']
    # numbers in the proposal come from the Python optimizer, not the model
    ranked = next(t for t in p['state']['trace'] if t['tool'] == 'optimize_destination')['result']['options']
    assert p['state']['proposal'] == next(o for o in ranked if o['id'] == p['state']['proposal']['id'])
    explanation = next(t for t in p['state']['trace'] if t['tool'] == 'agent_explanation')['result']
    assert 'Dadar' in explanation['text'] and 'tool results' in explanation['note']
    used = next(t for t in p['state']['trace'] if t['tool'] == 'llm_usage')
    assert used['inputs'] == {'provider': 'anthropic', 'model': 'claude-haiku-5-5'}
    assert used['result']['requests'] == 5 and used['result']['input_tokens'] == 5000
    assert used['result']['estimated_cost_usd'] == pytest.approx(5000 / 1e6 * 0.10 + 300 / 1e6 * 0.50)
    # token-lean requests: low effort, small max_tokens, strict tool schemas, geometry stripped
    first = fake.calls[0]
    assert first['output_config'] == {'effort': 'low'} and first['max_tokens'] <= 1024
    assert all(t['strict'] for t in first['tools'])
    assert '"geometry"' not in json.dumps(fake.calls[-1]['messages'], default=str)
    # nothing executed until a human approves
    assert 'execute_destination_change' not in tools(p)
    done = client.post(f"/api/v1/shipments/{p['id']}/approval", json={'approve': True, 'expected_version': p['state']['version']}).json()
    assert done['decision_status'] == 'executed'
    usage = client.get('/api/v1/llm-usage').json()
    assert usage['executions'] == 1 and usage['average_cost_per_execution_usd'] == pytest.approx(used['result']['estimated_cost_usd'])
    assert 'test-key-not-real' not in json.dumps(done) + json.dumps(usage)


def test_out_of_order_tool_call_is_rejected_and_recorded(client_with):
    def script(n, messages):
        if n == 1:
            return reply(tool_use('optimize_destination'))  # before reading anything
        return happy_script(n - 1, messages)
    client, _ = client_with(script)
    p = run(client, disruptions=HEAT_AND_TRAFFIC)
    rejected = next(t for t in p['state']['trace'] if t['tool'] == 'tool_rejected')
    assert 'before ranking' in rejected['result']['error']
    assert p['decision_status'] == 'proposed_awaiting_approval'


def test_tool_budget_stops_runaway_agent(client_with):
    client, _ = client_with(lambda n, m: reply(*[tool_use('get_batch_state') for _ in range(6)]))
    p = run(client, disruptions=HEAT_AND_TRAFFIC)
    assert p['decision_status'] == 'agent_failed'
    failure = next(t for t in p['state']['trace'] if t['tool'] == 'investigation_failed')['result']
    assert 'budget' in failure['message']
    assert 'execute_destination_change' not in tools(p)


def test_refusal_executes_nothing(client_with):
    client, _ = client_with(lambda n, m: reply(stop='refusal'))
    p = run(client, disruptions=HEAT_AND_TRAFFIC)
    assert p['decision_status'] == 'agent_failed' and p['state']['proposal'] is None


def test_without_key_live_mode_is_refused_and_deterministic_still_works(tmp_path, monkeypatch):
    monkeypatch.setenv('FRESHFLOW_ENV', 'development')
    monkeypatch.setenv('FRESHFLOW_LLM_PROVIDER', 'anthropic')
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(create_app(tmp_path / 'nokey.sqlite'))
    assert client.get('/api/v1/health').json()['live_agent_configured'] is False
    assert client.post('/api/v1/shipments', json={'mode': 'live'}).status_code == 409
    assert client.post('/api/v1/shipments', json={'mode': 'deterministic', 'disruptions': HEAT_AND_TRAFFIC}).json()['decision_status'] == 'proposed_awaiting_approval'


def test_model_keeping_the_plan_is_verified_not_escalated(client_with):
    def script(n, messages):
        if n == 1:
            return reply(*[tool_use(t) for t in READS])
        if n == 2:
            return reply(tool_use('optimize_destination'))
        return reply(NS(type='text', text='Keep the current buyer; it is already best.'), stop='end_turn')
    client, _ = client_with(script)
    p = run(client)  # no disruption: current plan is best
    assert p['decision_status'] == 'no_intervention_needed'
    assert 'escalate' not in tools(p) and tools(p).count('no_intervention_required') == 1


def test_model_skipping_a_better_option_is_escalated(client_with):
    def script(n, messages):
        if n == 1:
            return reply(*[tool_use(t) for t in READS])
        if n == 2:
            return reply(tool_use('optimize_destination'))
        return reply(NS(type='text', text='Keep going.'), stop='end_turn')
    client, _ = client_with(script)
    p = run(client, disruptions=HEAT_AND_TRAFFIC)  # current plan infeasible, model proposes nothing
    assert p['decision_status'] == 'no_feasible_alternative' and 'escalate' in tools(p)
