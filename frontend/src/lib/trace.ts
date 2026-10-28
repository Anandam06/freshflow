import type { TraceEntry } from "@/types/api";

/**
 * Presentation semantics for backend trace entries. The backend trace records observable tool
 * inputs/results (backend/app/agent.py, storage.trace()); this module only decides how each tool
 * is labelled and coloured. Unknown tools render as generic tool calls.
 */

export const PHASES = ["SENSE", "PREDICT", "DETECT", "DECIDE", "ACT", "VERIFY", "REPLAN"] as const;
export type Phase = (typeof PHASES)[number];

export type StepKind =
  | "plan"
  | "event"
  | "prediction"
  | "tool"
  | "optimization"
  | "policy"
  | "proposal"
  | "human"
  | "execution"
  | "verification"
  | "escalation"
  | "error";

export interface StepMeta {
  kind: StepKind;
  label: string;
  phases: Phase[];
  /** Who performed the step. "agent" means chosen by the orchestrator (deterministic or live LLM). */
  actor: "system" | "sensor feed" | "agent" | "RSL model" | "optimizer" | "policy engine" | "operator";
  explain: string;
}

const TOOLS: Record<string, StepMeta> = {
  seed: { kind: "plan", label: "Initial shipment plan", phases: ["SENSE"], actor: "system", explain: "Static morning plan loaded for the batch." },
  sense_event: {
    kind: "event",
    label: "Disruption sensed · RSL re-predicted",
    phases: ["SENSE", "PREDICT", "DETECT"],
    actor: "sensor feed",
    explain: "Temperature/delay event ingested; the RSL model re-estimates shelf life and the detector flags the plan for investigation.",
  },
  // v1.1.0 tool names
  get_batch_state: { kind: "tool", label: "get_batch_state", phases: ["SENSE"], actor: "agent", explain: "Agent reads the latest batch state, event, location and safety hold." },
  predict_remaining_shelf_life: { kind: "prediction", label: "predict_remaining_shelf_life", phases: ["PREDICT"], actor: "RSL model", explain: "Remaining shelf life and its conservative lower bound." },
  get_buyer_options: { kind: "tool", label: "get_buyer_options", phases: ["DECIDE"], actor: "agent", explain: "Agent reads buyer quotes, price factors and unavailable buyers." },
  check_buyer_capacity: { kind: "tool", label: "check_buyer_capacity", phases: ["DECIDE"], actor: "agent", explain: "Agent reads remaining capacity per buyer." },
  calculate_route_eta: { kind: "tool", label: "calculate_route_eta", phases: ["DECIDE"], actor: "agent", explain: "Agent computes reachability and travel time from the current location (synthetic route graph)." },
  optimize_destination: { kind: "optimization", label: "optimize_destination", phases: ["DECIDE"], actor: "optimizer", explain: "Every channel is checked for arrival shelf life, capacity, payload and route, then ranked by net proceeds." },
  validate_constraints: { kind: "policy", label: "validate_constraints", phases: ["DECIDE"], actor: "policy engine", explain: "Deterministic policy validates the selected destination and decides whether a human must approve." },
  request_human_approval: { kind: "proposal", label: "request_human_approval", phases: ["DECIDE"], actor: "agent", explain: "A policy-checked proposal is persisted for approval. The agent cannot execute on its own." },
  execute_reroute: { kind: "execution", label: "execute_reroute", phases: ["ACT"], actor: "agent", explain: "Reroute command issued from the current location with approval enforced. Not confirmed buyer acceptance." },
  verify_execution: { kind: "verification", label: "verify_execution", phases: ["VERIFY", "REPLAN"], actor: "agent", explain: "Confirms the committed state. Buyer acceptance is not verified in the MVP." },
  // v1.0.0 tool names (kept so older traces still render)
  inspect_batch: { kind: "tool", label: "inspect_batch", phases: ["SENSE"], actor: "agent", explain: "Agent reads the latest batch state, event and safety hold." },
  predict_freshness: { kind: "prediction", label: "predict_freshness", phases: ["PREDICT"], actor: "RSL model", explain: "Remaining shelf life and its conservative lower bound." },
  check_buyers_routes: { kind: "tool", label: "check_buyers_routes", phases: ["DECIDE"], actor: "agent", explain: "Agent reads buyer capacities, prices and route delays." },
  rank_options: { kind: "optimization", label: "rank_options", phases: ["DECIDE"], actor: "optimizer", explain: "Every channel is checked for arrival shelf life, capacity and payload, then ranked by net proceeds." },
  check_policy: { kind: "policy", label: "check_policy", phases: ["DECIDE"], actor: "policy engine", explain: "Deterministic policy validates the selected destination and decides whether a human must approve." },
  propose_action: { kind: "proposal", label: "propose_action", phases: ["DECIDE"], actor: "agent", explain: "A policy-checked proposal is persisted for approval. The agent cannot execute on its own." },
  human_approved: { kind: "human", label: "Operator approved", phases: ["ACT"], actor: "operator", explain: "Human approval gate passed." },
  human_rejected: { kind: "human", label: "Operator rejected", phases: ["ACT"], actor: "operator", explain: "Human rejected the proposal; destination unchanged, batch moves to manual review." },
  execute_destination_change: {
    kind: "execution",
    label: "execute_destination_change",
    phases: ["ACT"],
    actor: "agent",
    explain: "Destination committed to FreshFlow's persistent state. No real transport order is placed in the MVP.",
  },
  verify: { kind: "verification", label: "verify", phases: ["VERIFY", "REPLAN"], actor: "agent", explain: "Checks the committed state and resumes monitoring. Physical delivery is not verified." },
  no_intervention_required: {
    kind: "verification",
    label: "No intervention required",
    phases: ["DECIDE", "REPLAN"],
    actor: "agent",
    explain: "The best feasible option is the current plan, so nothing changes and no approval is requested. Monitoring continues.",
  },
  agent_explanation: { kind: "verification", label: "Agent's explanation", phases: ["DECIDE"], actor: "agent", explain: "Written by the language model; every number comes from the tool results." },
  llm_usage: { kind: "plan", label: "AI usage", phases: [], actor: "system", explain: "Tokens and estimated cost of the language-model calls for this decision." },
  demo_reset: { kind: "plan", label: "Demo reset", phases: ["SENSE"], actor: "system", explain: "The dedicated demo batch was re-seeded for another demonstration." },
  dispatch_blocked: { kind: "escalation", label: "Dispatch blocked", phases: ["DETECT"], actor: "system", explain: "No morning vehicle/buyer allocation, so an undispatched load cannot be rerouted." },
  escalate: { kind: "escalation", label: "Escalated to human review", phases: ["REPLAN"], actor: "policy engine", explain: "No compliant proposal; destination unchanged." },
  tool_rejected: { kind: "error", label: "Tool call rejected", phases: ["DECIDE"], actor: "policy engine", explain: "The runtime refused an out-of-order or invalid tool call from the agent." },
  investigation_failed: { kind: "error", label: "Investigation failed", phases: ["DECIDE"], actor: "system", explain: "No action was executed." },
};

/** Tools whose result carries the ranked channel options / the policy verdict (v1.1.0 name first). */
export const OPTIMIZER_TOOLS = ["optimize_destination", "rank_options"];
export const POLICY_TOOLS = ["validate_constraints", "check_policy"];

export function latestOf(trace: TraceEntry[], tools: string[]): TraceEntry | undefined {
  return [...trace].reverse().find((t) => tools.includes(t.tool));
}

export function stepMeta(entry: TraceEntry): StepMeta {
  return TOOLS[entry.tool] ?? { kind: "tool", label: entry.tool, phases: [], actor: "agent", explain: "Tool call recorded by the backend." };
}

/** Steps whose outcome is a simulated estimate rather than a measured fact. */
export function isSimulatedOutcome(entry: TraceEntry): boolean {
  const r = entry.result as Record<string, unknown>;
  return r?.evidence_category === "SIMULATED RESULT" || r?.physical_delivery_verified === false || r?.buyer_acceptance_verified === false;
}

export interface KindStyle {
  name: string;
  /** Tailwind classes for the step's icon chip. */
  chip: string;
  /** Left border accent on the step card. */
  accent: string;
}

export const KIND_STYLE: Record<StepKind, KindStyle> = {
  plan: { name: "Plan", chip: "bg-slate-100 text-slate-700", accent: "border-l-slate-300" },
  event: { name: "Disruption", chip: "bg-risk-50 text-risk-dark", accent: "border-l-risk" },
  prediction: { name: "Prediction", chip: "bg-violet-50 text-violet-700", accent: "border-l-violet-400" },
  tool: { name: "Tool call", chip: "bg-sky-50 text-sky-700", accent: "border-l-sky-400" },
  optimization: { name: "Optimization", chip: "bg-indigo-50 text-indigo-700", accent: "border-l-indigo-400" },
  policy: { name: "Policy check", chip: "bg-forest-50 text-forest", accent: "border-l-forest" },
  proposal: { name: "Proposal", chip: "bg-sky-50 text-sky-700", accent: "border-l-sky-500" },
  human: { name: "Human approval", chip: "bg-amber-50 text-amber-800", accent: "border-l-amber-400" },
  execution: { name: "Executed action", chip: "bg-fresh-50 text-fresh", accent: "border-l-fresh" },
  verification: { name: "Verification", chip: "bg-fresh-50 text-fresh", accent: "border-l-fresh-light" },
  escalation: { name: "Escalation", chip: "bg-risk-50 text-risk-dark", accent: "border-l-risk" },
  error: { name: "Rejected / failed", chip: "bg-unsafe-50 text-unsafe-dark", accent: "border-l-unsafe" },
};

/** Status → badge presentation. */
export const STATUS_STYLE: Record<string, { label: string; variant: "fresh" | "risk" | "unsafe" | "info" | "neutral" | "forest" }> = {
  monitoring: { label: "Monitoring", variant: "fresh" },
  event_detected: { label: "Disruption detected", variant: "risk" },
  awaiting_approval: { label: "Awaiting approval", variant: "info" },
  manual_review: { label: "Manual review", variant: "unsafe" },
};

export function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? { label: status.replace(/_/g, " "), variant: "neutral" as const };
}
