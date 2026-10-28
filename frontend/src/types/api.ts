import { z } from "zod";

/**
 * Frontend view of the FreshFlow API — shared/api-contract.yaml v1.1.0 (owned by Codex).
 *
 * Schemas mirror the contract field-for-field. Two contract responses are untyped (`schema: {}`):
 * GET /health and GET /api/v1/evidence; their shapes below follow backend/app/main.py and are
 * listed in INTEGRATION.md as "please type in the contract". Trace entries are
 * `additionalProperties: true`; the shape below follows backend/app/storage.py trace().
 *
 * Unknown extra fields are tolerated (passthrough). Missing or mistyped required fields raise a
 * ContractError so drift is loud rather than silently rendered as zeros.
 * Units: INR, kg, hours. Ratios are fractions (0–1) unless the name says percentage_point.
 */

export const MODEL_IDS = ["M0", "M1", "M2", "M3"] as const;
export const ModelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof ModelIdSchema>;

const num = z.number();
const nnum = z.number().nullable();

/* ------------------------------------------------------------------ health */

export const HealthSchema = z
  .object({ status: z.string(), version: z.string().optional(), database: z.string().optional(), live_agent_configured: z.boolean().optional(), llm_provider: z.string().nullable().optional(), llm_model: z.string().nullable().optional() })
  .passthrough();
export type Health = z.infer<typeof HealthSchema>;

/* ------------------------------------------------------------------ simulation */

export const SIMULATION_LIMITS = {
  seed: { min: 0, max: 2147483647 },
  batches: { min: 1, max: 10000 },
  days: { min: 1, max: 365 },
  repetitions: { min: 1, max: 30 },
  disruption_probability: { min: 0, max: 1 },
  price_multiplier: { min: 0.1, max: 3 },
  capacity_multiplier: { min: 0.1, max: 3 },
  setup_cost_inr: { min: 0, max: 1e8 },
  buyer_availability: { min: 0, max: 1 },
  temperature_shift_c: { min: -5, max: 10 },
  traffic_multiplier: { min: 0, max: 3 },
  prediction_error_hours: { min: 0, max: 24 },
  approval_delay_hours: { min: 0, max: 24 },
  ai_cost_multiplier: { min: 0, max: 20 },
  initial_rsl_scale: { min: 0.3, max: 2 },
  cancellation_probability: { min: 0, max: 1 },
  max_batch_repetitions: 100000,
} as const;

const L = SIMULATION_LIMITS;
/** Contract SimulationRequest bounds (client-side validation only; the backend re-validates). */
export const SimulationRequestSchema = z
  .object({
    seed: z.number().int().min(L.seed.min).max(L.seed.max),
    batches: z.number().int().min(L.batches.min).max(L.batches.max),
    days: z.number().int().min(L.days.min).max(L.days.max),
    repetitions: z.number().int().min(L.repetitions.min).max(L.repetitions.max),
    disruption_probability: z.number().min(L.disruption_probability.min).max(L.disruption_probability.max),
    price_multiplier: z.number().min(L.price_multiplier.min).max(L.price_multiplier.max),
    capacity_multiplier: z.number().min(L.capacity_multiplier.min).max(L.capacity_multiplier.max),
    setup_cost_inr: z.number().min(L.setup_cost_inr.min).max(L.setup_cost_inr.max),
    buyer_availability: z.number().min(L.buyer_availability.min).max(L.buyer_availability.max),
    temperature_shift_c: z.number().min(L.temperature_shift_c.min).max(L.temperature_shift_c.max),
    traffic_multiplier: z.number().min(L.traffic_multiplier.min).max(L.traffic_multiplier.max),
    prediction_error_hours: z.number().min(L.prediction_error_hours.min).max(L.prediction_error_hours.max),
    approval_delay_hours: z.number().min(L.approval_delay_hours.min).max(L.approval_delay_hours.max),
    ai_cost_multiplier: z.number().min(L.ai_cost_multiplier.min).max(L.ai_cost_multiplier.max),
    initial_rsl_scale: z.number().min(L.initial_rsl_scale.min).max(L.initial_rsl_scale.max),
    cancellation_probability: z.number().min(L.cancellation_probability.min).max(L.cancellation_probability.max),
  })
  .strict()
  .refine((r) => r.batches * r.repetitions <= L.max_batch_repetitions, {
    message: "Maximum 100,000 batch-repetitions per request (batches × repetitions)",
    path: ["batches"],
  });
export type SimulationRequest = z.infer<typeof SimulationRequestSchema>;

/**
 * Contract v1.1.0 defaults — a fallback only. The app fetches GET /api/v1/scenarios/defaults
 * (frozen case-calibration defaults) instead of trusting these.
 */
export const DEFAULT_SIMULATION_REQUEST: SimulationRequest = {
  seed: 60000,
  batches: 2000,
  days: 30,
  repetitions: 3,
  disruption_probability: 0,
  price_multiplier: 1,
  capacity_multiplier: 1,
  setup_cost_inr: 50000,
  buyer_availability: 0.95,
  temperature_shift_c: 0,
  traffic_multiplier: 1,
  prediction_error_hours: 3,
  approval_delay_hours: 0.5,
  ai_cost_multiplier: 1,
  initial_rsl_scale: 1.4,
  cancellation_probability: 0.03,
};

/** GET /api/v1/scenarios/defaults (untyped in contract; shape from shared/fixtures/scenario-defaults.json). */
export const ScenarioDefaultsSchema = z.object({ parameters: z.record(z.unknown()) }).passthrough();

/** Contract `Metrics`: one model, one repetition. */
export const ModelMetricsSchema = z
  .object({
    model: ModelIdSchema,
    input_kg: num,
    sellable_kg: num,
    spoiled_kg: num,
    spoilage_rate: num,
    gross_sales_revenue_inr: num,
    procurement_inr: num,
    transport_inr: num,
    handling_inr: num,
    rescue_inr: num,
    agent_sensor_inr: num,
    net_realization_per_input_kg_inr: num,
    net_batch_realization_margin: nnum,
    operating_profit_inr: num,
    operating_profit_margin: nnum,
    buyer_rejection_rate: nnum,
    on_time_fulfilment_rate: num,
    successful_rescue_rate: nnum,
    food_safety_violations: num,
    setup_cost_inr: num,
    incremental_profit_vs_m0_inr: num,
    margin_relative_uplift_vs_m0: nnum, // fraction (0.12 = 12 % relative)
    margin_percentage_point_change_vs_m0: nnum, // already percentage points
    roi_over_simulated_period: nnum,
    payback_days: nnum,
    meets_spoilage_target: z.boolean(),
    meets_margin_target: z.boolean(),
    incremental_agentic_policy_profit_vs_m2_inr: nnum.optional(), // M3 only
    sold_kg: num.optional(),
    salvage_value_inr: num.optional(), // subset of gross revenue
    rescued_batches: num.optional(),
    financial_waterfall: z.array(z.object({ account: z.string(), amount_inr: num }).passthrough()).optional(), // signed
  })
  .passthrough();
export type ModelMetrics = z.infer<typeof ModelMetricsSchema>;

export const RunSchema = z
  .object({
    seed: z.number().int(),
    dataset_sha256: z.string(),
    metrics: z.array(ModelMetricsSchema).length(4),
  })
  .passthrough()
  .refine((r) => MODEL_IDS.every((id, i) => r.metrics[i]?.model === id), { message: "metrics must be ordered M0, M1, M2, M3" });
export type SimulationRun = z.infer<typeof RunSchema>;

export const ModelSummarySchema = z
  .object({
    mean_operating_profit_inr: num,
    mean_spoilage_rate: num,
    probability_meeting_both_targets: num,
    runs_meeting_both_targets: num,
    repetitions: num,
    median_operating_profit_inr: num.optional(),
    profit_p05_inr: num.optional(),
    profit_p95_inr: num.optional(),
    spoilage_p05: num.optional(),
    spoilage_p95: num.optional(),
    profit_distribution_inr: z.array(num).optional(),
    spoilage_distribution: z.array(num).optional(),
  })
  .passthrough();
export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const SimulationResultSchema = z
  .object({
    evidence_category: z.literal("SIMULATED RESULT").default("SIMULATED RESULT"),
    agent_mode: z.string(),
    assumptions_version: z.string(),
    config: z.record(z.unknown()),
    runs: z.array(RunSchema).min(1),
    summary: z.object({ M0: ModelSummarySchema, M1: ModelSummarySchema, M2: ModelSummarySchema, M3: ModelSummarySchema }).passthrough(),
    limitations: z.array(z.string()),
    metadata: z.record(z.unknown()).optional(),
    risk: z
      .object({
        incremental_m3_vs_m2_distribution_inr: z.array(num).optional(),
        mean_incremental_m3_vs_m2_inr: num.optional(),
        probability_m3_worse_than_m2: num.optional(),
        range_definition: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type SimulationResult = z.infer<typeof SimulationResultSchema>;

export const CreatedSimulationSchema = z.object({ id: z.string(), result: SimulationResultSchema }).passthrough();
export type CreatedSimulation = z.infer<typeof CreatedSimulationSchema>;

/* ------------------------------------------------------------------ batches & agent */

export const EventRequestSchema = z
  .object({
    temperature_c: z.number().min(5).max(50),
    duration_hours: z.number().gt(0).max(72),
    delay_hours: z.number().min(0).max(72),
    safety_hold: z.boolean(),
  })
  .strict();
export type EventRequest = z.infer<typeof EventRequestSchema>;
export const DEFAULT_EVENT_REQUEST: EventRequest = { temperature_c: 35, duration_hours: 6, delay_hours: 12, safety_hold: false };

export type AgentInvestigationMode = "deterministic" | "live";
export interface InvestigateRequest {
  mode: AgentInvestigationMode;
}
export interface ApprovalRequest {
  approve: boolean;
  expected_version: number;
}

/** A channel option as produced by backend/app/optimization.py alternatives(). */
export const ChannelOptionSchema = z
  .object({
    id: z.string(),
    price_inr_kg: num,
    travel_hours: num,
    minimum_rsl_hours: num,
    capacity_kg: num.optional(),
    transport_inr_kg: num,
    arrival_rsl_lower_hours: num,
    feasible: z.boolean(),
    reasons: z.array(z.string()),
    available_capacity_kg: num.optional(),
    net_proceeds_inr: num,
    rescue_cost_inr_kg: num.optional(),
  })
  .passthrough();
export type ChannelOption = z.infer<typeof ChannelOptionSchema>;

/** Append-only trace entry (backend/app/storage.py trace()). Observable tool I/O, not model reasoning. */
export const TraceEntrySchema = z
  .object({
    sequence: z.number(),
    timestamp: z.string(),
    tool: z.string(),
    inputs: z.record(z.unknown()).default({}),
    result: z.record(z.unknown()).default({}),
  })
  .passthrough();
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

/** Known BatchState.status values (backend/app/agent.py). Unknown values still render. */
export type BatchStatus = "monitoring" | "event_detected" | "awaiting_approval" | "manual_review" | (string & {});

/** Contract BatchState. */
export const BatchStateSchema = z
  .object({
    id: z.string(),
    version: z.number().int(),
    status: z.string(),
    evidence_category: z.literal("SYNTHETIC").default("SYNTHETIC"),
    quantity_kg: num,
    initial_rsl_hours: num,
    rsl_hours: num,
    rsl_lower_hours: num,
    destination: z.string(),
    delay_hours: num,
    safety_hold: z.boolean(),
    event: z.record(z.unknown()).nullable(),
    proposal: z.record(z.unknown()).nullable(),
    agent_mode: z.string().nullable(),
    monitoring: z.boolean(),
    trace: z.array(TraceEntrySchema),
    current_location: z.string().optional(),
    elapsed_hours: num.optional(),
    buyer_capacities: z.record(num).optional(),
    unavailable_buyers: z.array(z.string()).optional(),
    price_factors: z.record(num).optional(),
    quality_grade: z.string().optional(),
  })
  .passthrough();
export type BatchState = z.infer<typeof BatchStateSchema>;

/** Batch record from a run's audited repetition (shared/schema/BatchRecord.json); extra keys pass through. */
export const BatchRecordSchema = z
  .object({
    id: z.string(),
    day: num.optional(),
    quantity_kg: num,
    morning_buyer: z.string().optional(),
    maturity: z.string().optional(),
    quality_grade: z.string().optional(),
    collection_location: z.string().optional(),
    dispatch_location: z.string().optional(),
    initial_rsl_hours: num.optional(),
    /** v1.2.0: compact SIMULATED RESULT summary of the batch's M3 outcome. */
    simulated_m3: z
      .object({
        morning_destination: z.string().nullable(),
        final_destination: z.string().nullable(),
        rescue_attempt: z.boolean(),
        rescued: z.boolean(),
        buyer_acceptance: z.boolean(),
        sold_kg: num,
        spoiled_kg: num,
        revenue_inr: num,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
export type BatchRecord = z.infer<typeof BatchRecordSchema>;

export const BatchPageSchema = z
  .object({ run_id: z.string(), repetition: num, offset: num, limit: num, total: num, batches: z.array(BatchRecordSchema) })
  .passthrough();
export type BatchPage = z.infer<typeof BatchPageSchema>;

/** Interactive replay of one batch inside a stored run. simulated_outcome is the immutable experiment record. */
export const RunDecisionSchema = z
  .object({
    run_id: z.string(),
    batch_id: z.string(),
    scope: z.string().optional(),
    state: BatchStateSchema,
    simulated_outcome: z.record(z.unknown()),
  })
  .passthrough();
export type RunDecision = z.infer<typeof RunDecisionSchema>;

export interface VersionRequest {
  expected_version: number;
}

/* ------------------------------------------------------------------ evidence */

export const EVIDENCE_CATEGORIES = ["CASE", "RESEARCH", "SYNTHETIC", "SIMULATED RESULT"] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

/** research/assumptions.csv row. */
export const AssumptionSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    parameter: z.string(),
    value: z.string(),
    unit: z.string(),
    basis: z.string(),
    limitation: z.string(),
    source_url: z.string().optional(),
    explanation: z.string().optional(),
    sensitivity_bounds: z.string().optional(),
    validation_status: z.string().optional(),
  })
  .passthrough();
export type Assumption = z.infer<typeof AssumptionSchema>;

/** research/sources.csv row. */
export const SourceSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    title: z.string(),
    authors: z.string(),
    publication_date: z.string(),
    url: z.string(),
    accessed_date: z.string(),
    limitations: z.string(),
  })
  .passthrough();
export type Source = z.infer<typeof SourceSchema>;

/** GET /api/v1/evidence (untyped in contract; shape from backend/app/main.py). */
export const EvidenceSchema = z.object({ assumptions: z.array(AssumptionSchema), sources: z.array(SourceSchema) }).passthrough();
export type Evidence = z.infer<typeof EvidenceSchema>;

/** GET /api/v1/scenarios/sensitivity: stored study, scenario name → SimulationResult. */
export const SensitivityStudySchema = z.record(SimulationResultSchema);
export type SensitivityStudy = z.infer<typeof SensitivityStudySchema>;
