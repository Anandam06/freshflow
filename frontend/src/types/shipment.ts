import { z } from "zod";
import { BatchStateSchema, ChannelOptionSchema } from "./api";

/**
 * Shipment playground + Excel endpoints (API v1.3.0, backend/app/shipment.py, excel_io.py).
 * Values are backend outputs; the frontend only formats them.
 */

const num = z.number();
const LatLng = z.tuple([z.number(), z.number()]);

export const RouteSchema = z.object({
  distance_km: num,
  freeflow_minutes: num,
  geometry: z.array(LatLng),
  checkpoint: LatLng.optional(),
  checkpoint_index: num.optional(),
});
export type Route = z.infer<typeof RouteSchema>;

export const LocationSchema = z.object({ id: z.string(), name: z.string(), lat: num, lon: num, area: z.string().optional(), channel: z.string().optional() }).passthrough();
export type MapLocation = z.infer<typeof LocationSchema>;

export const CommoditySchema = z
  .object({ id: z.string(), name: z.string(), category: z.string(), shelf_life_hours_20c: num, q10: num, humidity_sensitivity: num, reference_price_inr_kg: num })
  .passthrough();
export type Commodity = z.infer<typeof CommoditySchema>;

export const NetworkSchema = z
  .object({
    source: z.string(),
    traffic: z.string(),
    attribution: z.string(),
    checkpoint_fraction: num,
    hubs: z.array(LocationSchema),
    buyers: z.array(LocationSchema),
    routes: z.record(RouteSchema),
    diversion_legs: z.record(z.record(RouteSchema)),
    commodities: z.array(CommoditySchema),
    buyer_terms: z.record(z.object({ channel: z.string(), price_factor: num, min_rsl_fraction: num, accepted_grades: z.string(), capacity_kg: num }).passthrough()),
    channels: z.record(z.object({ label: z.string() }).passthrough()),
    disruptions: z.record(z.object({ label: z.string(), explain: z.string() }).passthrough()),
    settings: z.record(num),
    setting_bounds: z.record(z.tuple([num, num])),
  })
  .passthrough();
export type Network = z.infer<typeof NetworkSchema>;

export const DISRUPTION_TYPES = [
  "heavy_traffic",
  "road_closure",
  "temperature_rise",
  "refrigeration_failure",
  "humidity_problem",
  "buyer_cancellation",
  "price_drop",
  "product_damage",
] as const;
export type DisruptionType = (typeof DISRUPTION_TYPES)[number];
export type Severity = "low" | "medium" | "high";

export interface ShipmentRequest {
  commodity_id: string;
  origin_id: string;
  buyer_id: string;
  quantity_kg: number;
  quality_grade: "A" | "B" | "C";
  disruptions: { type: DisruptionType; severity: Severity }[];
  settings: Record<string, number>;
  mode: "deterministic" | "live";
  dataset_id?: string;
}

const TimelinePoint = z.object({ hours: num, rsl_hours: num, label: z.string() });

export const StrategyOutcomeSchema = z
  .object({
    strategy: z.enum(["A", "B", "C", "D"]),
    model: z.enum(["M0", "M1", "M2", "M3"]),
    label: z.string(),
    status: z.string(),
    buyer_id: z.string(),
    buyer_name: z.string(),
    channel: z.string(),
    diverted: z.boolean(),
    lead_time_hours: num,
    arrival_rsl_hours: num,
    minimum_rsl_hours: num,
    accepted: z.boolean(),
    rejection_reasons: z.array(z.string()),
    input_kg: num,
    sellable_kg: num,
    spoiled_kg: num,
    price_inr_kg: num,
    offer_inr_kg: num,
    revenue_inr: num,
    procurement_inr: num,
    transport_inr: num,
    handling_inr: num,
    rescue_inr: num,
    agent_tech_inr: num,
    gross_margin_inr: num,
    operating_profit_inr: num,
    distance_km: num,
    timeline: z.array(TimelinePoint),
    route_key: z.string(),
    leg: z.tuple([z.string(), z.string()]).nullable(),
  })
  .passthrough();
export type StrategyOutcome = z.infer<typeof StrategyOutcomeSchema>;

export const ShipmentStateSchema = BatchStateSchema.and(
  z.object({ network: z.literal("mumbai"), shipment: z.object({ plan_buyer_id: z.string(), committed_buyer_id: z.string(), plan_route_key: z.string() }).passthrough() }).passthrough(),
);

export const ShipmentPayloadSchema = z
  .object({
    id: z.string(),
    batch_id: z.string().nullable().optional(),
    request: z.object({ commodity_id: z.string(), origin_id: z.string(), buyer_id: z.string(), quantity_kg: num, quality_grade: z.string().optional(), settings: z.record(num).optional(), mode: z.string().optional(), disruptions: z.array(z.object({ type: z.string(), severity: z.string() })) }).passthrough(),
    settings: z.record(num),
    commodity: CommoditySchema,
    conditions: z.record(z.unknown()),
    plan_buyer_id: z.string(),
    initial_rsl_hours: num,
    conservative_buffer_hours: num,
    dataset_id: z.string(),
    strategies: z.object({ A: StrategyOutcomeSchema, B: StrategyOutcomeSchema, C: StrategyOutcomeSchema, D: StrategyOutcomeSchema }),
    narrative: z.array(z.string()),
    decision_status: z.enum(["no_intervention_needed", "proposed_awaiting_approval", "executed", "rejected_kept_plan", "no_feasible_alternative", "agent_failed"]),
    state: ShipmentStateSchema,
    evidence_category: z.literal("SIMULATED RESULT"),
  })
  .passthrough();
export type ShipmentPayload = z.infer<typeof ShipmentPayloadSchema>;
export type DecisionStatus = ShipmentPayload["decision_status"];

export const WorkbookRunSchema = z
  .object({
    id: z.string(),
    dataset_id: z.string(),
    filename: z.string(),
    shipments: z.array(
      z
        .object({
          shipment_id: z.string(),
          batch_id: z.string().nullable(),
          commodity: z.string(),
          decision_status: z.string(),
          A: z.object({ buyer_name: z.string(), accepted: z.boolean(), operating_profit_inr: num, arrival_rsl_hours: num, lead_time_hours: num }),
          D: z.object({ buyer_name: z.string(), accepted: z.boolean(), operating_profit_inr: num, arrival_rsl_hours: num, lead_time_hours: num, status: z.string() }),
        })
        .passthrough(),
    ),
    totals: z.object({ A_profit_inr: num, D_profit_inr: num, A_accepted: num, D_accepted: num, batches: num }),
  })
  .passthrough();
export type WorkbookRun = z.infer<typeof WorkbookRunSchema>;

export interface WorkbookError {
  sheet: string | null;
  row: number | null;
  column: string | null;
  message: string;
}

export const OptionsSchema = z.array(ChannelOptionSchema.and(z.object({ name: z.string().optional(), channel: z.string().optional(), distance_km: num.optional() }).passthrough()));
