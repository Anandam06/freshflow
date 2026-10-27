"""Run from freshflow: python backend/export_contract.py"""
import json
from pathlib import Path
import yaml
from app.main import app

root = Path(__file__).resolve().parents[1]
(root / 'shared').mkdir(exist_ok=True)
(root / 'shared' / 'api-contract.yaml').write_text(yaml.safe_dump(app.openapi(), sort_keys=False), encoding='utf-8')
