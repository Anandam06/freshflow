from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class SimulationRequest(StrictModel):
    seed: int = Field(default=2026, ge=0, le=2**31-1)
    batches: int = Field(default=2000, ge=1, le=10000)
    days: int = Field(default=30, ge=1, le=365)
    repetitions: int = Field(default=3, ge=1, le=30)
    disruption_probability: float = Field(default=0.3, ge=0, le=1)
    price_multiplier: float = Field(default=1, ge=0.1, le=3)
    capacity_multiplier: float = Field(default=1, ge=0.1, le=3)
    setup_cost_inr: float = Field(default=50000, ge=0, le=1e8)

    @model_validator(mode='after')
    def limit_work(self):
        if self.batches * self.repetitions > 100000:
            raise ValueError('Maximum 100000 batch-repetitions per request')
        return self


class EventRequest(StrictModel):
    temperature_c: float = Field(default=35, ge=5, le=50)
    duration_hours: float = Field(default=6, gt=0, le=72)
    delay_hours: float = Field(default=12, ge=0, le=72)
    safety_hold: bool = False


class InvestigateRequest(StrictModel):
    mode: Literal['deterministic', 'live'] = 'deterministic'


class ApprovalRequest(StrictModel):
    approve: bool
    expected_version: int = Field(ge=0)


class Metrics(StrictModel):
    model: Literal['M0', 'M1', 'M2', 'M3']
    input_kg: float
    sellable_kg: float
    spoiled_kg: float
    spoilage_rate: float
    gross_sales_revenue_inr: float
    procurement_inr: float
    transport_inr: float
    handling_inr: float
    rescue_inr: float
    agent_sensor_inr: float
    net_realization_per_input_kg_inr: float
    net_batch_realization_margin: float | None
    operating_profit_inr: float
    operating_profit_margin: float | None
    buyer_rejection_rate: float | None
    on_time_fulfilment_rate: float
    successful_rescue_rate: float | None
    food_safety_violations: int
    setup_cost_inr: float
    incremental_profit_vs_m0_inr: float
    margin_relative_uplift_vs_m0: float | None
    margin_percentage_point_change_vs_m0: float | None
    roi_over_simulated_period: float | None
    payback_days: float | None
    meets_spoilage_target: bool
    meets_margin_target: bool
    incremental_agentic_policy_profit_vs_m2_inr: float | None = None


class SimulationRun(StrictModel):
    seed: int
    dataset_sha256: str
    metrics: list[Metrics]


class ModelSummary(StrictModel):
    mean_operating_profit_inr: float
    mean_spoilage_rate: float
    probability_meeting_both_targets: float
    runs_meeting_both_targets: int
    repetitions: int


class SimulationResult(StrictModel):
    evidence_category: Literal['SIMULATED RESULT'] = 'SIMULATED RESULT'
    agent_mode: str
    assumptions_version: str
    config: SimulationRequest
    runs: list[SimulationRun]
    summary: dict[str, ModelSummary]
    limitations: list[str]


class CreatedSimulation(StrictModel):
    id: str
    result: SimulationResult


class TraceEntry(StrictModel):
    sequence: int
    timestamp: str
    tool: str
    inputs: dict
    result: dict


class BatchState(StrictModel):
    id: str
    version: int
    status: str
    evidence_category: Literal['SYNTHETIC'] = 'SYNTHETIC'
    quantity_kg: float
    initial_rsl_hours: float
    rsl_hours: float
    rsl_lower_hours: float
    destination: str
    delay_hours: float
    safety_hold: bool
    event: dict | None
    proposal: dict | None
    agent_mode: str | None
    monitoring: bool
    trace: list[TraceEntry]
