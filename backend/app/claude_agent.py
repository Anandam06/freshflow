"""Live agent orchestration with Anthropic Claude.

Claude only chooses which tools to call and explains its decision. Every number comes from the
Python tools (agent.Investigation): RSL prediction, buyer offers, capacity, routes, optimization
and policy checks. Claude cannot approve or execute — `request_human_approval` only persists a
proposal, and execution happens later through the human approval endpoint.
"""
import json
import os

from .storage import trace

DEFAULT_MODEL = 'claude-haiku-5-5'
MAX_TURNS = 8
MAX_TOOL_CALLS = 16
MAX_TOKENS = 1024

# USD per million tokens (list prices, prompts up to 100K tokens) used for the usage estimate only.
PRICES = {
    'claude-haiku-5-5': (0.10, 0.50),
    'claude-sonnet-5-5': (2.00, 10.00),
    'claude-opus-5-5': (4.00, 20.00),
}

SYSTEM = (
    "You are FreshFlow's shipment exception agent for fresh produce in Mumbai. A disruption was detected. "
    "Investigate with the tools, then decide. Call the read tools (get_batch_state, predict_remaining_shelf_life, "
    "get_buyer_options, check_buyer_capacity, calculate_route_eta) together in your first turn, then "
    "optimize_destination. If the best feasible option differs from the current destination, call "
    "validate_constraints on it and then request_human_approval for it. If the current destination is already best "
    "or nothing is feasible, do not request approval. Every price, shelf life, time and cost comes from tool results — "
    "never invent or recompute numbers. You cannot approve or execute anything. "
    "Refer to buyers by name, not id. Finish with at most two short sentences explaining the decision for an operations manager."
)


def model_name():
    return os.getenv('ANTHROPIC_MODEL') or DEFAULT_MODEL


def compact(value):
    """Shrink tool results before they reach the model: drop geometry/route detail, round floats."""
    if isinstance(value, float):
        return round(value, 2)
    if isinstance(value, dict):
        return {k: compact(v) for k, v in value.items() if k not in ('route', 'geometry', 'path', 'source', 'method')}
    if isinstance(value, list):
        return [compact(v) for v in value]
    return value


def anthropic_tools(tool_schema, names, destinations):
    tools = []
    for name in names:
        schema = tool_schema(name, destinations)
        tools.append({'name': schema['name'], 'description': schema['description'],
                      'input_schema': schema['parameters'], 'strict': True})
    return tools


def estimated_cost(model, input_tokens, output_tokens):
    price = PRICES.get(model)
    if not price:
        return None
    return round(input_tokens / 1e6 * price[0] + output_tokens / 1e6 * price[1], 6)


def claude_loop(investigation, tool_schema, tool_names, destinations, client=None):
    import anthropic

    state = investigation.state
    model = model_name()
    client = client or anthropic.Anthropic(max_retries=2, timeout=60)
    tools = anthropic_tools(tool_schema, tool_names, destinations)
    messages = [{'role': 'user', 'content': f"Shipment {state['id']} is disrupted ({json.dumps(compact(state.get('event')))}). Investigate and decide."}]
    usage = {'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cache_read_input_tokens': 0, 'tool_calls': 0}
    explanation = ''
    try:
        for _ in range(MAX_TURNS):
            response = client.messages.create(
                model=model, max_tokens=MAX_TOKENS, system=SYSTEM, tools=tools, messages=messages,
                output_config={'effort': 'low'},  # orchestration is simple; low effort keeps tokens down
            )
            usage['requests'] += 1
            usage['input_tokens'] += response.usage.input_tokens
            usage['output_tokens'] += response.usage.output_tokens
            usage['cache_read_input_tokens'] += getattr(response.usage, 'cache_read_input_tokens', 0) or 0
            if response.stop_reason == 'refusal':
                raise ValueError('The model declined this request; no action executed')
            messages.append({'role': 'assistant', 'content': response.content})
            text = ' '.join(b.text for b in response.content if b.type == 'text').strip()
            if text:
                explanation = text
            calls = [b for b in response.content if b.type == 'tool_use']
            if not calls:
                if response.stop_reason == 'max_tokens':
                    raise ValueError('Model response was cut off; no action executed')
                return
            results = []
            for call in calls:
                usage['tool_calls'] += 1
                if usage['tool_calls'] > MAX_TOOL_CALLS:
                    raise ValueError('Agent tool budget exhausted')
                try:
                    if not isinstance(call.input, dict):
                        raise ValueError('Tool arguments must be an object')
                    output = investigation.call(call.name, dict(call.input))
                    results.append({'type': 'tool_result', 'tool_use_id': call.id, 'content': json.dumps(compact(output))})
                except (ValueError, TypeError) as exc:
                    trace(state, 'tool_rejected', {'name': call.name}, {'error': str(exc)})
                    results.append({'type': 'tool_result', 'tool_use_id': call.id, 'content': f'Error: {exc}', 'is_error': True})
            messages.append({'role': 'user', 'content': results})
        raise ValueError('Agent turn budget exhausted')
    finally:
        if explanation:
            trace(state, 'agent_explanation', {'model': model}, {
                'text': explanation[:1200], 'note': 'Written by the language model; every number comes from tool results'})
        trace(state, 'llm_usage', {'provider': 'anthropic', 'model': model}, {
            **usage, 'estimated_cost_usd': estimated_cost(model, usage['input_tokens'], usage['output_tokens']),
            'pricing_basis': 'list price per million tokens; estimate only'})
