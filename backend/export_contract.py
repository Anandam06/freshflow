"""Run from freshflow: python backend/export_contract.py"""
import json
from pathlib import Path
import yaml
from app.main import app
from app.models import BatchRecord, SimulationRequest, SimulationResult, RunDecision

root = Path(__file__).resolve().parents[1]
(root / 'shared').mkdir(exist_ok=True)
(root / 'shared' / 'api-contract.yaml').write_text(yaml.safe_dump(app.openapi(), sort_keys=False), encoding='utf-8')
(root / 'shared/schema').mkdir(exist_ok=True)
for model in [BatchRecord, SimulationRequest, SimulationResult, RunDecision]:
    (root / 'shared/schema' / (model.__name__ + '.json')).write_text(json.dumps(model.model_json_schema(), indent=2), encoding='utf-8')
