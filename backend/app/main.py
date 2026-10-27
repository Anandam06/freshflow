import json
import os
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .agent import apply_event, investigate, approve
from .models import SimulationRequest, SimulationResult, CreatedSimulation, BatchState, EventRequest, InvestigateRequest, ApprovalRequest
from .simulation import simulate
from .storage import Store, trace


def create_app(db_path=None):
    app = FastAPI(title='FreshFlow API', version='1.0.0', description='Synthetic demonstration. All currency INR, mass kg, durations hours. Ratios are fractions, not percentages.')
    default_db = str(Path(__file__).resolve().parents[2] / 'data/freshflow.sqlite')
    store = Store(db_path or os.getenv('DATABASE_URL') or os.getenv('FRESHFLOW_DB', default_db))
    app.state.store = store
    store.seed()
    app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','),
                       allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-Operator-Key'])

    def operator(x_operator_key: str | None = Header(default=None)):
        expected = os.getenv('FRESHFLOW_OPERATOR_KEY')
        if expected:
            import secrets
            if not x_operator_key or not secrets.compare_digest(x_operator_key, expected):
                raise HTTPException(401, 'Operator key required')
        elif os.getenv('FRESHFLOW_ENV', 'development') != 'development':
            raise HTTPException(503, 'Configure FRESHFLOW_OPERATOR_KEY before public deployment')

    @app.exception_handler(KeyError)
    async def missing(request, exc):
        return JSONResponse(status_code=404, content={'detail': 'Resource not found'})

    @app.exception_handler(ValueError)
    async def conflict(request, exc):
        return JSONResponse(status_code=409, content={'detail': str(exc)})

    @app.get('/health')
    def health():
        with store.connect() as db:
            db.execute('SELECT 1').fetchone()
        return {'status': 'ok', 'version': '1.0.0', 'database': 'postgresql' if store.postgres else 'sqlite',
                'live_agent_configured': bool(os.getenv('OPENAI_API_KEY') and os.getenv('OPENAI_MODEL'))}

    @app.get('/api/v1/batches', response_model=list[BatchState])
    def batches():
        return [store.get()]

    @app.get('/api/v1/batches/{batch_id}', response_model=BatchState)
    def batch(batch_id: str):
        return store.get(batch_id)

    @app.post('/api/v1/batches/{batch_id}/events', response_model=BatchState, dependencies=[Depends(operator)])
    def event(batch_id: str, request: EventRequest):
        return store.mutate(batch_id, lambda s: apply_event(s, request.model_dump()))

    @app.post('/api/v1/batches/{batch_id}/investigate', response_model=BatchState, dependencies=[Depends(operator)])
    def investigation(batch_id: str, request: InvestigateRequest):
        # Network work outside write transaction; CAS refuses decisions based on stale snapshots.
        state = store.get(batch_id)
        version = state['version']
        if state['status'] != 'event_detected':
            raise HTTPException(409, 'A new event is required before investigation')
        try:
            investigate(state, request.mode)
        except (httpx.HTTPError, ValueError) as exc:
            trace(state, 'investigation_failed', {'mode': request.mode}, {'error_type': type(exc).__name__})
            state['proposal'] = None
            state['status'] = 'event_detected'
            store.mutate(batch_id, lambda s: s.update(state), version)
            raise HTTPException(502 if isinstance(exc, httpx.HTTPError) else 409,
                                'Investigation failed; inspect trace and configuration; no action executed') from exc
        return store.mutate(batch_id, lambda s: s.update(state), version)

    @app.post('/api/v1/batches/{batch_id}/approval', response_model=BatchState, dependencies=[Depends(operator)])
    def approval(batch_id: str, request: ApprovalRequest):
        return store.mutate(batch_id, lambda s: approve(s, request.approve), request.expected_version)

    @app.post('/api/v1/simulations', response_model=CreatedSimulation, dependencies=[Depends(operator)])
    def simulation(request: SimulationRequest):
        result = SimulationResult.model_validate(simulate(request)).model_dump()
        id = str(uuid4())
        store.put_run(id, result)
        return {'id': id, 'result': result}

    @app.get('/api/v1/simulations/{run_id}', response_model=SimulationResult)
    def run(run_id: str):
        return store.get_run(run_id)

    @app.get('/api/v1/evidence')
    def evidence():
        import csv
        root = Path(__file__).resolve().parents[2] / 'research'
        return {name: list(csv.DictReader((root / f'{name}.csv').open(encoding='utf-8')))
                for name in ['assumptions', 'sources']}

    return app


app = create_app()
