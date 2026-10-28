from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class SimulationRequest(StrictModel):
    seed: int = Field(default=60000, ge=0, le=2**31-1)
    batches: int = Field(default=2000, ge=1, le=10000)
    days: int = Field(default=30, ge=1, le=365)
    repetitions: int = Field(default=3, ge=1, le=30)
    disruption_probability: float = Field(default=0.0, ge=0, le=1)
    price_multiplier: float = Field(default=1, ge=0.1, le=3)
    capacity_multiplier: float = Field(default=1, ge=0.1, le=3)
    setup_cost_inr: float = Field(default=50000, ge=0, le=1e8)
    buyer_availability: float = Field(default=0.95, ge=0, le=1)
    temperature_shift_c: float = Field(default=0, ge=-5, le=10)
    traffic_multiplier: float = Field(default=1, ge=0, le=3)
    prediction_error_hours: float = Field(default=3, ge=0, le=24)
    approval_delay_hours: float = Field(default=0.5, ge=0, le=24)
    ai_cost_multiplier: float = Field(default=1, ge=0, le=20)
    initial_rsl_scale: float = Field(default=1.4, ge=0.3, le=2)
    cancellation_probability: float = Field(default=0.03, ge=0, le=1)

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
    sold_kg: float = 0
    salvage_value_inr: float = 0
    rescued_batches: int = 0
    financial_waterfall: list[dict] = Field(default_factory=list)


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
    median_operating_profit_inr: float = 0
    profit_p05_inr: float = 0
    profit_p95_inr: float = 0
    spoilage_p05: float = 0
    spoilage_p95: float = 0
    profit_distribution_inr: list[float] = Field(default_factory=list)
    spoilage_distribution: list[float] = Field(default_factory=list)


class SimulationResult(StrictModel):
    evidence_category: Literal['SIMULATED RESULT'] = 'SIMULATED RESULT'
    agent_mode: str
    assumptions_version: str
    config: SimulationRequest
    runs: list[SimulationRun]
    summary: dict[str, ModelSummary]
    limitations: list[str]
    metadata: dict = Field(default_factory=dict)
    risk: dict = Field(default_factory=dict)


class CreatedSimulation(StrictModel):
    id: str
    result: SimulationResult


class Health(StrictModel):
    status: Literal['ok'] = 'ok'
    version: str
    database: Literal['sqlite', 'postgresql']
    live_agent_configured: bool
    llm_provider: str | None = None
    llm_model: str | None = None


class EvidenceRegister(StrictModel):
    assumptions: list[dict[str, str]]
    sources: list[dict[str, str]]


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
    current_location: str = 'junction'
    elapsed_hours: float = 6
    buyer_capacities: dict[str, float] = Field(default_factory=dict)
    unavailable_buyers: list[str] = Field(default_factory=list)
    price_factors: dict[str, float] = Field(default_factory=dict)
    quality_grade: str = 'A'


class VersionRequest(StrictModel):
    expected_version: int = Field(ge=0)


class BatchRecord(StrictModel):
    id: str
    day: int
    quantity_kg: float
    morning_buyer: str
    maturity: str
    quality_grade: str
    harvest_timestamp: str
    dispatch_timestamp: str
    collection_location: str
    dispatch_location: str
    initial_rsl_hours: float
    procurement_inr_kg: float
    physical_condition: dict
    sensor_observation: dict
    buyer_snapshot: list[dict]
    future_event: dict


class BatchPage(StrictModel):
    run_id: str
    repetition: int
    offset: int
    limit: int
    total: int
    batches: list[dict]


class RunDecision(StrictModel):
    run_id: str
    batch_id: str
    scope: str = 'Interactive replay; immutable experiment metrics are not rewritten'
    state: BatchState
    simulated_outcome: dict
