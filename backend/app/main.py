import json
import os
import re
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from .agent import apply_event, investigate, approve, live_configured, live_model, llm_provider

try:  # optional: only needed for live Claude orchestration
    import anthropic
    LLM_ERRORS = (httpx.HTTPError, anthropic.APIError)
except ImportError:  # pragma: no cover
    LLM_ERRORS = (httpx.HTTPError,)
from .models import SimulationRequest, SimulationResult, CreatedSimulation, BatchState, EventRequest, InvestigateRequest, ApprovalRequest, BatchPage, RunDecision, VersionRequest, Health, EvidenceRegister
from .run_service import build_artifact, decision, decide
from .simulation import simulate
from .storage import Store, trace


def load_local_env(path=Path(__file__).resolve().parents[1] / '.env'):
    """Load backend/.env for local runs. Real environment variables always win; secrets are never logged.
    Skipped under pytest so tests control their own environment."""
    import sys
    if 'pytest' in sys.modules or not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            if value.strip():
                os.environ.setdefault(key.strip(), value.strip())


load_local_env()
from . import catalogue, excel_io
from .shipment import ShipmentInputError, ShipmentRequest, register_dataset, simulate_shipment, view as shipment_view

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


class ShipmentApproval(BaseModel):
    model_config = ConfigDict(extra='forbid')
    approve: bool
    expected_version: int = Field(ge=0)


class WorkbookUpload(BaseModel):
    model_config = ConfigDict(extra='forbid')
    filename: str = Field(max_length=200)
    content_base64: str = Field(max_length=15_000_000)
    mode: str = 'deterministic'


class ComparisonExport(BaseModel):
    model_config = ConfigDict(extra='forbid')
    shipment_ids: list[str] = Field(min_length=1, max_length=50)


def m3_summary(row):
    """Compact SIMULATED RESULT summary of a batch's M3 outcome for list views."""
    if row is None:
        return None
    return {'evidence_category': 'SIMULATED RESULT', 'morning_destination': row['morning_destination'],
            'final_destination': row['destination'], 'rescue_attempt': row['rescue_attempt'], 'rescued': row['rescued'],
            'buyer_acceptance': row['buyer_acceptance'], 'sold_kg': row['sold_kg'], 'spoiled_kg': row['spoiled_kg'],
            'revenue_inr': row['revenue_inr'], 'realized_arrival_rsl_hours': row['realized_arrival_rsl_hours']}


class HeadAsGet:
    """Answer HEAD like the matching GET without a body (link checkers and fetchers probe with HEAD)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'HEAD':
            return await self.app(scope, receive, send)

        async def no_body(message):
            if message['type'] == 'http.response.body':
                message = {**message, 'body': b''}
            await send(message)
        await self.app({**scope, 'method': 'GET'}, receive, no_body)


def create_app(db_path=None):
    app = FastAPI(title='FreshFlow API', version='1.4.0', description='Synthetic demonstration. All currency INR, mass kg, durations hours. Ratios are fractions, not percentages.')
    default_db = str(Path(__file__).resolve().parents[2] / 'data/freshflow.sqlite')
    store = Store(db_path or os.getenv('DATABASE_URL') or os.getenv('FRESHFLOW_DB', default_db))
    app.state.store = store
    store.seed()
    app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','),
                       allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-Operator-Key'], expose_headers=['Content-Disposition'])
    app.add_middleware(HeadAsGet)

    def operator(x_operator_key: str | None = Header(default=None)):
        expected = os.getenv('FRESHFLOW_OPERATOR_KEY')
        if expected:
            import secrets
            if not x_operator_key or not secrets.compare_digest(x_operator_key, expected):
                raise HTTPException(401, 'Operator key required')
        elif os.getenv('FRESHFLOW_ENV', 'development') not in ('development', 'public-demo'):
            raise HTTPException(503, 'Configure FRESHFLOW_OPERATOR_KEY before public deployment')

    def check_llm_budget():
        """Daily USD cap on live LLM runs (FRESHFLOW_LLM_DAILY_BUDGET_USD). Protects a public deployment's API credit."""
        budget = os.getenv('FRESHFLOW_LLM_DAILY_BUDGET_USD')
        if budget and store.llm_spent_today() >= float(budget):
            raise HTTPException(429, f'Daily live-AI budget (${float(budget):g}) reached. Use the deterministic agent, or try again tomorrow.')

    default_ds = catalogue.default_dataset()
    register_dataset(default_ds)
    datasets = {'default': default_ds}

    def dataset(dataset_id):
        if dataset_id not in datasets:
            datasets[dataset_id] = store.get_run('dataset:' + dataset_id)  # KeyError -> 404
            register_dataset(datasets[dataset_id])
        return datasets[dataset_id]

    def run_shipment(req, batch_id=None):
        if req.mode == 'live' and not live_configured():
            raise HTTPException(409, 'Live AI mode is not configured on the backend (set ANTHROPIC_API_KEY); no silent fallback')
        if req.mode == 'live':
            check_llm_budget()
        ds = dataset(req.dataset_id)
        shipment_id = 'S-' + uuid4().hex[:10]
        try:
            result, state = simulate_shipment(ds, req, shipment_id)
        except ShipmentInputError as exc:
            raise HTTPException(422, str(exc)) from exc
        plan = state['shipment']['plan_buyer_id']
        trace(state, 'plan_shipment', {'committed_buyer': req.buyer_id}, {
            'planned_buyer': plan, 'changed_at_planning': plan != req.buyer_id,
            'basis': 'Plan-time optimization on forecast conditions (strategy C)'})
        trace(state, 'sense_event', state['event'], {
            'rsl_hours': state['rsl_hours'], 'rsl_lower_hours': state['rsl_lower_hours'], 'elapsed_hours': state['elapsed_hours'],
            'location': 'checkpoint', 'conditions': {k: v for k, v in result['conditions'].items() if k != 'unavailable_morning'}})
        try:
            investigate(state, req.mode)
        except (*LLM_ERRORS, ValueError) as exc:
            message = str(exc)[:200]
            if hasattr(exc, 'status_code') and hasattr(exc, 'body') and not isinstance(exc, httpx.HTTPError):
                body = exc.body if isinstance(exc.body, dict) else {}
                message = f"{exc.status_code}: {body.get('error', {}).get('message', type(exc).__name__)}"[:300]
            if isinstance(exc, httpx.HTTPStatusError):  # provider's own error text, never the key
                try:
                    message = f"{exc.response.status_code}: {exc.response.json()['error']['message']}"[:300]
                except Exception:  # noqa: BLE001
                    message = f'HTTP {exc.response.status_code} from the LLM provider'
            trace(state, 'investigation_failed', {'mode': req.mode}, {'error_type': type(exc).__name__, 'message': message})
            state['proposal'], state['status'] = None, 'manual_review'
        store.record_llm_usage([t for t in state['trace'] if t['tool'] == 'llm_usage'])
        store.put_batch(shipment_id, state)
        store.put_run('shipment:' + shipment_id, {**result, 'batch_id': batch_id})
        return shipment_payload(shipment_id)

    def shipment_item(shipment_id):
        result = store.get_run('shipment:' + shipment_id)
        state = store.get(shipment_id)
        ds = dataset(state['shipment']['dataset_id'])
        return {'id': shipment_id, 'batch_id': result.get('batch_id'), 'request': result['request'], 'settings': result['settings'],
                'view': shipment_view(ds, result, state), 'state': state, 'result': result}

    def shipment_payload(shipment_id):
        it = shipment_item(shipment_id)
        r = it['result']
        return {'id': shipment_id, 'batch_id': it['batch_id'], 'request': it['request'], 'settings': it['settings'],
                'commodity': r['commodity'], 'conditions': r['conditions'], 'plan_buyer_id': r['plan_buyer_id'],
                'initial_rsl_hours': r['initial_rsl_hours'], 'conservative_buffer_hours': r['conservative_buffer_hours'],
                'dataset_id': it['state']['shipment']['dataset_id'], **it['view'], 'state': it['state']}

    @app.exception_handler(KeyError)
    async def missing(request, exc):
        return JSONResponse(status_code=404, content={'detail': 'Resource not found'})

    @app.exception_handler(ValueError)
    async def conflict(request, exc):
        return JSONResponse(status_code=409, content={'detail': str(exc)})

    @app.get('/health', response_model=Health)
    @app.get('/api/v1/health', response_model=Health)
    def health():
        with store.connect() as db:
            db.execute('SELECT 1').fetchone()
        return {'status': 'ok', 'version': '1.4.0', 'database': 'postgresql' if store.postgres else 'sqlite',
                'live_agent_configured': live_configured(), 'llm_provider': llm_provider(), 'llm_model': live_model()}

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
        if request.mode == 'live':
            check_llm_budget()
        try:
            investigate(state, request.mode)
            store.record_llm_usage([t for t in state['trace'] if t['tool'] == 'llm_usage'])
        except (*LLM_ERRORS, ValueError) as exc:
            trace(state, 'investigation_failed', {'mode': request.mode}, {'error_type': type(exc).__name__})
            state['proposal'] = None
            state['status'] = 'event_detected'
            store.mutate(batch_id, lambda s: s.update(state), version)
            raise HTTPException(502 if isinstance(exc, LLM_ERRORS) else 409,
                                'Investigation failed; inspect trace and configuration; no action executed') from exc
        return store.mutate(batch_id, lambda s: s.update(state), version)

    @app.post('/api/v1/batches/{batch_id}/approval', response_model=BatchState, dependencies=[Depends(operator)])
    def approval(batch_id: str, request: ApprovalRequest):
        return store.mutate(batch_id, lambda s: approve(s, request.approve), request.expected_version)

    @app.post('/api/v1/batches/{batch_id}/reset', response_model=BatchState, dependencies=[Depends(operator)])
    def reset(batch_id: str):
        return store.reset(batch_id)

    @app.get('/api/v1/llm-usage')
    def llm_usage():
        return store.llm_usage()

    @app.get('/api/v1/network')
    def network():
        net = catalogue.load_network()
        ds = default_ds
        return {**net, 'commodities': list(ds['commodities'].values()), 'buyer_terms': ds['buyers'], 'channels': catalogue.CHANNELS,
                'disruptions': catalogue.DISRUPTIONS, 'settings': ds['settings'], 'setting_bounds': catalogue.SETTING_BOUNDS,
                'evidence_category': 'SYNTHETIC'}

    @app.post('/api/v1/shipments', dependencies=[Depends(operator)])
    def create_shipment(request: ShipmentRequest):
        return run_shipment(request)

    @app.get('/api/v1/shipments/{shipment_id}')
    def get_shipment(shipment_id: str):
        return shipment_payload(shipment_id)

    @app.post('/api/v1/shipments/{shipment_id}/approval', dependencies=[Depends(operator)])
    def shipment_approval(shipment_id: str, request: ShipmentApproval):
        state = store.get(shipment_id)
        dataset(state['shipment']['dataset_id'])
        store.mutate(shipment_id, lambda s: approve(s, request.approve), request.expected_version)
        return shipment_payload(shipment_id)

    @app.get('/api/v1/shipments/{shipment_id}/export.xlsx')
    def shipment_xlsx(shipment_id: str):
        content = excel_io.shipment_export([shipment_item(shipment_id)], f'FreshFlow shipment {shipment_id}')
        return Response(content, media_type=XLSX, headers={'Content-Disposition': f'attachment; filename="freshflow-{shipment_id}.xlsx"'})

    @app.post('/api/v1/exports/comparison')
    def comparison_xlsx(request: ComparisonExport):
        content = excel_io.shipment_export([shipment_item(i) for i in request.shipment_ids], 'FreshFlow scenario comparison')
        return Response(content, media_type=XLSX, headers={'Content-Disposition': 'attachment; filename="freshflow-comparison.xlsx"'})

    @app.get('/api/v1/excel/template')
    def excel_template():
        return Response(excel_io.template(default_ds), media_type=XLSX,
                        headers={'Content-Disposition': 'attachment; filename="freshflow-input-template.xlsx"'})

    @app.post('/api/v1/excel/upload', dependencies=[Depends(operator)])
    def excel_upload(request: WorkbookUpload):
        dataset_id = 'U-' + uuid4().hex[:10]
        try:
            ds, batches = excel_io.parse_upload(request.content_base64, default_ds, dataset_id)
        except excel_io.WorkbookErrors as exc:
            return JSONResponse(status_code=422, content={'detail': {'message': 'The workbook has problems. Fix the rows below and upload again.',
                                                                      'errors': exc.errors[:200]}})
        if len(batches) > 200:
            raise HTTPException(422, 'Upload at most 200 batches at a time')
        store.put_run('dataset:' + dataset_id, ds)
        datasets[dataset_id] = ds
        register_dataset(ds)
        mode = request.mode if request.mode in ('deterministic', 'live') else 'deterministic'
        shipments = []
        for b in batches:
            req = ShipmentRequest(commodity_id=b['commodity_id'], origin_id=b['origin_id'], buyer_id=b['buyer_id'], quantity_kg=b['quantity_kg'],
                                  quality_grade=b['quality_grade'], disruptions=b['disruptions'], mode=mode, dataset_id=dataset_id)
            shipments.append(run_shipment(req, batch_id=b['batch_id']))
        run_id = 'W-' + uuid4().hex[:10]
        store.put_run('workbook:' + run_id, {'dataset_id': dataset_id, 'filename': request.filename, 'shipment_ids': [x['id'] for x in shipments]})
        return workbook_payload(run_id)

    def workbook_payload(run_id):
        meta = store.get_run('workbook:' + run_id)
        rows = []
        for sid in meta['shipment_ids']:
            p = shipment_payload(sid)
            st = p['strategies']
            rows.append({'shipment_id': sid, 'batch_id': p['batch_id'], 'commodity': p['commodity']['name'], 'request': p['request'],
                         'decision_status': p['decision_status'], 'A': {k: st['A'][k] for k in ['buyer_name', 'accepted', 'operating_profit_inr', 'arrival_rsl_hours', 'lead_time_hours']},
                         'D': {k: st['D'][k] for k in ['buyer_name', 'accepted', 'operating_profit_inr', 'arrival_rsl_hours', 'lead_time_hours', 'status']}})
        return {'id': run_id, 'dataset_id': meta['dataset_id'], 'filename': meta['filename'], 'shipments': rows,
                'totals': {'A_profit_inr': sum(r['A']['operating_profit_inr'] for r in rows), 'D_profit_inr': sum(r['D']['operating_profit_inr'] for r in rows),
                           'A_accepted': sum(r['A']['accepted'] for r in rows), 'D_accepted': sum(r['D']['accepted'] for r in rows), 'batches': len(rows)},
                'evidence_category': 'SIMULATED RESULT'}

    @app.get('/api/v1/workbook-runs/{run_id}')
    def workbook_run(run_id: str):
        return workbook_payload(run_id)

    @app.get('/api/v1/workbook-runs/{run_id}/export.xlsx')
    def workbook_xlsx(run_id: str):
        meta = store.get_run('workbook:' + run_id)
        content = excel_io.shipment_export([shipment_item(i) for i in meta['shipment_ids']], f'FreshFlow workbook run {run_id} ({meta["filename"]})')
        return Response(content, media_type=XLSX, headers={'Content-Disposition': f'attachment; filename="freshflow-{run_id}.xlsx"'})

    @app.get('/api/v1/simulations/{run_id}/export.xlsx')
    def simulation_xlsx(run_id: str):
        return Response(excel_io.fleet_export(run_id, store.get_run(run_id)), media_type=XLSX,
                        headers={'Content-Disposition': f'attachment; filename="freshflow-fleet-{run_id}.xlsx"'})

    @app.post('/api/v1/simulations', response_model=CreatedSimulation, dependencies=[Depends(operator)])
    def simulation(request: SimulationRequest):
        import hashlib
        cache_key = 'simcache:' + hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        try:  # same inputs + seed => identical outputs, so a stored run is reused instead of recomputed
            cached_id = store.get_run(cache_key)['run_id']
            return {'id': cached_id, 'result': store.get_run(cached_id)}
        except KeyError:
            pass
        result = SimulationResult.model_validate(simulate(request)).model_dump()
        id = str(uuid4())
        result['metadata'] = {'run_id': id, 'status': 'completed', 'currency': 'INR',
                              'created_at': datetime.now(timezone.utc).isoformat(),
                              'batch_audit_repetition': 0, 'decision_scope': 'interactive replay of first repetition'}
        artifact = build_artifact(request)
        store.put_run_bundle(id, result, artifact)
        store.put_run(cache_key, {'run_id': id})
        return {'id': id, 'result': result}

    @app.get('/api/v1/simulations/{run_id}', response_model=SimulationResult)
    @app.get('/api/v1/simulations/{run_id}/results', response_model=SimulationResult)
    def run(run_id: str):
        return store.get_run(run_id)

    @app.get('/api/v1/scenarios/defaults')
    def defaults():
        return {'parameters': SimulationRequest().model_dump(), 'currency': 'INR',
                'evidence_category': 'SYNTHETIC', 'schema_version': '1.1.0'}

    @app.get('/api/v1/scenarios/sensitivity')
    def sensitivity():
        path = Path(__file__).resolve().parents[2] / 'data/results/sensitivity.json'
        if not path.exists():
            raise HTTPException(404, 'Run backend/run_risk_study.py to generate the prespecified study')
        return json.loads(path.read_text(encoding='utf-8'))

    study_dir = Path(__file__).resolve().parents[2] / 'data/results/study'

    @app.get('/api/v1/studies')
    def studies():
        """The stored 30-seed validation study (same numbers as evidence/FreshFlow_Scenario_Validation.xlsx)."""
        path = study_dir / 'index.json'
        if not path.exists():
            raise HTTPException(404, 'Run python -m validation.export_study to publish the validation study')
        return json.loads(path.read_text(encoding='utf-8'))

    @app.get('/api/v1/studies/{study_id}', response_model=SimulationResult)
    def study(study_id: str):
        if not re.fullmatch(r'[SX]\d{2}', study_id) or not (study_dir / f'{study_id}.json').exists():
            raise HTTPException(404, f'No stored study scenario {study_id}')
        return json.loads((study_dir / f'{study_id}.json').read_text(encoding='utf-8'))

    @app.get('/api/v1/simulations/{run_id}/batches', response_model=BatchPage)
    def run_batches(run_id: str, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
                    rescue_only: bool = Query(False, description='Only batches where the simulated M3 policy attempted a rescue')):
        artifact = store.get_run(run_id + ':artifact')
        outcomes = {r['batch_id']: r for r in artifact['outcomes']['M3']}
        records = [{**b, 'simulated_m3': m3_summary(outcomes.get(b['id']))} for b in artifact['batches']]
        if rescue_only:
            records = [r for r in records if r['simulated_m3'] and r['simulated_m3']['rescue_attempt']]
        return {'run_id': run_id, 'repetition': 0, 'offset': offset, 'limit': limit,
                'total': len(records), 'batches': records[offset:offset + limit]}

    @app.get('/api/v1/simulations/{run_id}/decisions/{batch_id}', response_model=RunDecision)
    def run_decision(run_id: str, batch_id: str):
        config = SimulationRequest(**store.get_run(run_id)['config'])
        return decision(store.get_run(run_id + ':artifact'), batch_id, config, run_id)

    @app.post('/api/v1/simulations/{run_id}/decisions/{batch_id}/approve', response_model=RunDecision, dependencies=[Depends(operator)])
    def approve_decision(run_id: str, batch_id: str, request: VersionRequest):
        config = SimulationRequest(**store.get_run(run_id)['config'])
        return store.mutate_run(run_id + ':artifact', lambda a: decide(a, batch_id, config, run_id, request.expected_version, True))

    @app.post('/api/v1/simulations/{run_id}/decisions/{batch_id}/reject', response_model=RunDecision, dependencies=[Depends(operator)])
    def reject_decision(run_id: str, batch_id: str, request: VersionRequest):
        config = SimulationRequest(**store.get_run(run_id)['config'])
        return store.mutate_run(run_id + ':artifact', lambda a: decide(a, batch_id, config, run_id, request.expected_version, False))

    @app.get('/api/v1/evidence', response_model=EvidenceRegister)
    def evidence():
        import csv
        root = Path(__file__).resolve().parents[2] / 'research'
        return {name: list(csv.DictReader((root / f'{name}.csv').open(encoding='utf-8')))
                for name in ['assumptions', 'sources']}

    @app.get('/api/v1/assumptions', response_model=list[dict[str, str]])
    def assumptions():
        return evidence()['assumptions']

    @app.get('/api/v1/sources', response_model=list[dict[str, str]])
    def sources():
        return evidence()['sources']

    static_dir = os.getenv('FRESHFLOW_STATIC_DIR')
    if static_dir and Path(static_dir).is_dir():
        from fastapi.responses import FileResponse
        root_dir = Path(static_dir).resolve()

        @app.get('/{full_path:path}', include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith('api/'):
                raise HTTPException(404, 'Resource not found')
            candidate = (root_dir / full_path).resolve()
            if full_path and candidate.is_file() and root_dir in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(root_dir / 'index.html')

    return app


app = create_app()
