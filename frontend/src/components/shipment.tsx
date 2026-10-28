import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  Gauge,
  Info,
  Leaf,
  Package,
  Route as RouteIcon,
  Scale,
  ShieldCheck,
  Truck,
  UserCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelLabel, StrategyBadge } from "@/components/ModelLabel";
import { formatINR, formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StrategyLetter } from "@/lib/models";
import type { TraceEntry } from "@/types/api";
import { OptionsSchema, type ShipmentPayload, type StrategyOutcome } from "@/types/shipment";

/* ---------------------------------------------------------------- produce */

export function ProduceImage({ id, name, size = 56, className }: { id: string; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cn("inline-flex items-center justify-center rounded-full bg-fresh-50 font-bold text-fresh", className)} style={{ width: size, height: size }} aria-hidden>
        {name.charAt(0)}
      </span>
    );
  }
  return <img src={`/produce/${id}.png`} alt="" width={size} height={size} onError={() => setFailed(true)} className={cn("select-none object-contain drop-shadow-sm", className)} />;
}

export function riskOf(shelfLifeHours: number): { label: string; tone: "high" | "medium" | "low" } {
  if (shelfLifeHours < 60) return { label: "Spoils fast", tone: "high" };
  if (shelfLifeHours < 150) return { label: "Spoils in days", tone: "medium" };
  return { label: "Keeps well", tone: "low" };
}

export function RiskPill({ shelfLifeHours }: { shelfLifeHours: number }) {
  const r = riskOf(shelfLifeHours);
  const style = { high: "bg-unsafe-50 text-unsafe-dark", medium: "bg-amber-50 text-amber-800", low: "bg-fresh-50 text-fresh" }[r.tone];
  const dots = { high: 3, medium: 2, low: 1 }[r.tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", style)}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < dots ? "bg-current" : "bg-current opacity-20")} />
        ))}
      </span>
      {r.label}
    </span>
  );
}

export function hoursText(h: number) {
  if (!Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} h`;
}

/* ---------------------------------------------------------------- headline results */

interface Metric {
  key: string;
  label: string;
  help: string;
  icon: typeof Clock;
  value: (s: StrategyOutcome) => number;
  fmt: (v: number) => string;
  better: "higher" | "lower";
}

const METRICS: Metric[] = [
  { key: "lead", label: "Delivery time", help: "Hours from the hub until the shipment reaches its final buyer (waiting, driving, approval).", icon: Clock, value: (s) => s.lead_time_hours, fmt: hoursText, better: "lower" },
  { key: "rsl", label: "Remaining shelf life at arrival", help: "Hours of freshness left when the buyer receives it. Rerouting cannot restore lost freshness — it only shortens the remaining trip.", icon: Leaf, value: (s) => s.arrival_rsl_hours, fmt: hoursText, better: "higher" },
  { key: "kg", label: "Sellable quantity", help: "Kilograms the buyer accepts. A rejected load sells 0 kg.", icon: Package, value: (s) => s.sellable_kg, fmt: (v) => formatKg(v), better: "higher" },
  { key: "price", label: "Selling price", help: "₹ per accepted kg: buyer offer after quality grade and freshness adjustments. ₹0 when the load is rejected.", icon: Scale, value: (s) => s.price_inr_kg, fmt: (v) => `₹${v.toFixed(1)}/kg`, better: "higher" },
  { key: "profit", label: "Operating profit", help: "Revenue minus procurement, transport, handling, diversion and technology costs for this shipment (its operating contribution).", icon: Wallet, value: (s) => s.operating_profit_inr, fmt: (v) => formatINR(v, { signed: false }), better: "higher" },
];

export function HeadlineResults({ payload, compareAll }: { payload: ShipmentPayload; compareAll: boolean }) {
  const letters: StrategyLetter[] = compareAll ? ["A", "B", "C", "D"] : ["A", "D"];
  const s = payload.strategies;
  return (
    <div className="overflow-x-auto rounded-2xl border border-forest/10 bg-white">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-4 text-sm font-semibold text-slate-500">Result</th>
            {letters.map((l) => (
              <th key={l} className={cn("px-5 py-4", l === "D" && "bg-fresh-50/70")}>
                <ModelLabel letter={l} />
              </th>
            ))}
            {!compareAll && <th className="px-5 py-4 text-sm font-semibold text-slate-500">Change</th>}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const a = m.value(s.A);
            const d = m.value(s.D);
            const improved = m.better === "higher" ? d > a + 1e-9 : d < a - 1e-9;
            const worse = m.better === "higher" ? d < a - 1e-9 : d > a + 1e-9;
            const Icon = m.icon;
            return (
              <tr key={m.key} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="px-5 py-4 font-medium text-slate-700">
                  <span className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-forest/70" aria-hidden />
                    {m.label}
                    <HelpTip text={m.help} />
                  </span>
                </th>
                {letters.map((l) => (
                  <td key={l} className={cn("num px-5 py-4 text-lg font-semibold", l === "D" ? "bg-fresh-50/70 text-forest" : "text-slate-700")}>
                    {m.fmt(m.value(s[l]))}
                    {l !== "D" && !s[l].accepted && m.key === "kg" && <span className="ml-2 text-sm font-medium text-unsafe">rejected</span>}
                  </td>
                ))}
                {!compareAll && (
                  <td className="px-5 py-4">
                    <span className={cn("num inline-flex items-center gap-1.5 text-base font-semibold", improved ? "text-fresh" : worse ? "text-unsafe" : "text-slate-500")}>
                      {m.fmt(a)} <ArrowRight className="h-4 w-4" aria-label="to" /> {m.fmt(d)}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="Explain" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} className="text-slate-400 hover:text-forest">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span role="tooltip" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl bg-forest px-3 py-2 text-sm font-normal leading-snug text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- decision */

export function DecisionCard({
  payload,
  onDecide,
  deciding,
}: {
  payload: ShipmentPayload;
  onDecide: (approve: boolean) => void;
  deciding: boolean;
}) {
  const st = payload.decision_status;
  const d = payload.strategies.D;
  const usage = payload.state.trace.find((t) => t.tool === "llm_usage") as { inputs: { model?: string }; result: { estimated_cost_usd?: number; input_tokens?: number; output_tokens?: number } } | undefined;
  const explanation = payload.state.trace.find((t) => t.tool === "agent_explanation")?.result as { text?: string } | undefined;
  const mode =
    payload.state.agent_mode === "live"
      ? `Live AI agent · ${usage?.inputs.model ?? "LLM"} chose the tools${usage ? ` · ${((usage.result.input_tokens ?? 0) + (usage.result.output_tokens ?? 0)).toLocaleString("en-IN")} tokens · ~$${Number(usage.result.estimated_cost_usd ?? 0).toFixed(4)}` : ""}`
      : "Deterministic agent (fixed tool sequence, labelled fallback)";
  const view = {
    proposed_awaiting_approval: { tone: "border-sky-200 bg-sky-50", icon: UserCheck, title: `FreshFlow recommends: send to ${d.buyer_name}`, body: "This changes the buyer, so it needs your approval before anything is executed." },
    executed: { tone: "border-fresh/30 bg-fresh-50", icon: BadgeCheck, title: `Redirected to ${d.buyer_name}`, body: "You approved. The destination was updated in FreshFlow's records (simulated shipment change — no real truck or buyer system is connected)." },
    no_intervention_needed: { tone: "border-fresh/30 bg-fresh-50", icon: CheckCircle2, title: "No action needed", body: "FreshFlow checked every buyer and route. Keeping the current plan was already the best option." },
    rejected_kept_plan: { tone: "border-amber-200 bg-amber-50", icon: XCircle, title: "You rejected the diversion", body: `The shipment continues to ${d.buyer_name}. Results below show what that means.` },
    no_feasible_alternative: { tone: "border-unsafe-100 bg-unsafe-50", icon: AlertTriangle, title: "FreshFlow could not rescue this shipment", body: "No buyer can accept it in time. The agent escalated to a person instead of forcing a diversion." },
    agent_failed: {
      tone: "border-unsafe-100 bg-unsafe-50",
      icon: XCircle,
      title: "The live AI agent could not run",
      body: `${String((payload.state.trace.find((t) => t.tool === "investigation_failed")?.result as { message?: string } | undefined)?.message ?? "Provider error")}. Nothing was executed. Choose the deterministic agent in Advanced settings and run again.`,
    },
  }[st];
  const Icon = view.icon;
  return (
    <div className={cn("rounded-2xl border p-5", view.tone)} data-testid="decision-card" data-status={st}>
      <div className="flex flex-wrap items-start gap-4">
        <Icon className="mt-0.5 h-7 w-7 shrink-0 text-forest" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-forest">{view.title}</p>
          <p className="mt-1 text-base text-slate-700">{view.body}</p>
          {explanation?.text && (
            <blockquote className="mt-3 border-l-4 border-fresh/40 bg-white/70 px-3 py-2 text-[15px] italic text-slate-700" data-testid="agent-explanation">
              “{explanation.text}”
            </blockquote>
          )}
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
            <Bot className="h-3.5 w-3.5" aria-hidden /> {mode}
          </p>
        </div>
        {st === "proposed_awaiting_approval" && (
          <div className="flex w-full gap-3 sm:w-auto">
            <Button variant="outline" size="lg" className="flex-1 sm:flex-none" disabled={deciding} onClick={() => onDecide(false)}>
              <XCircle /> Reject
            </Button>
            <Button variant="fresh" size="lg" className="flex-1 sm:flex-none" disabled={deciding} onClick={() => onDecide(true)}>
              <UserCheck /> {deciding ? "Recording…" : "Approve diversion"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- agent timeline */

type Kind = "alert" | "prediction" | "tool" | "optimization" | "policy" | "approval" | "executed" | "verify" | "blocked" | "plan" | "explain" | "usage";
const KIND: Record<Kind, { label: string; icon: typeof Clock; chip: string }> = {
  plan: { label: "Planning", icon: RouteIcon, chip: "bg-slate-100 text-slate-700" },
  alert: { label: "Alert", icon: AlertTriangle, chip: "bg-amber-100 text-amber-800" },
  prediction: { label: "Prediction", icon: Gauge, chip: "bg-violet-100 text-violet-800" },
  tool: { label: "Tool call", icon: Truck, chip: "bg-sky-100 text-sky-800" },
  optimization: { label: "Optimization", icon: Scale, chip: "bg-indigo-100 text-indigo-800" },
  policy: { label: "Safety & policy", icon: ShieldCheck, chip: "bg-forest-50 text-forest" },
  approval: { label: "Human approval", icon: UserCheck, chip: "bg-sky-100 text-sky-800" },
  executed: { label: "Executed (simulated shipment change)", icon: BadgeCheck, chip: "bg-fresh-50 text-fresh" },
  verify: { label: "Verified", icon: CheckCircle2, chip: "bg-fresh-50 text-fresh" },
  blocked: { label: "Blocked / escalated", icon: XCircle, chip: "bg-unsafe-50 text-unsafe-dark" },
  explain: { label: "AI explanation", icon: Bot, chip: "bg-fresh-50 text-fresh" },
  usage: { label: "AI usage", icon: Gauge, chip: "bg-slate-100 text-slate-700" },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function describe(t: TraceEntry, names: Record<string, string>): { kind: Kind; title: string; text: string } {
  const r = t.result as Record<string, any>;
  const i = t.inputs as Record<string, any>;
  const n = (id: string) => names[id] ?? id;
  switch (t.tool) {
    case "plan_shipment":
      return { kind: "plan", title: "Plan checked before dispatch", text: r.changed_at_planning ? `Forecast showed a problem, so the plan changed to ${n(r.planned_buyer)}.` : `Planned buyer: ${n(r.planned_buyer)}.` };
    case "sense_event": {
      const list = (i.disruptions ?? []).map((d: any) => `${String(d.type).replace(/_/g, " ")} (${d.severity})`).join(", ");
      return { kind: "alert", title: list ? "Alert detected" : "Routine check", text: list ? `At the checkpoint: ${list}.` : "Truck reached the checkpoint with no disruption reported." };
    }
    case "get_batch_state":
    case "inspect_batch":
      return { kind: "tool", title: "Shipment status read", text: `${formatKg(r.quantity_kg)} heading to ${n(r.destination)}.` };
    case "predict_remaining_shelf_life":
    case "predict_freshness":
      return { kind: "prediction", title: "Freshness checked", text: `Predicted shelf life ${hoursText(r.rsl_hours)}; safe estimate ${hoursText(r.rsl_lower_hours)}.` };
    case "get_buyer_options":
    case "check_buyers_routes": {
      const k = Array.isArray(r.buyers) ? r.buyers.length : 0;
      const u = Array.isArray(r.unavailable_buyers) ? r.unavailable_buyers.length : 0;
      return { kind: "tool", title: "Buyers checked", text: `${k} buyer offers read${u ? `; ${u} unavailable` : ""}.` };
    }
    case "check_buyer_capacity":
      return { kind: "tool", title: "Capacity checked", text: "Remaining space at every buyer read." };
    case "calculate_route_eta":
      return { kind: "tool", title: "Routes compared", text: `${Array.isArray(r.routes) ? r.routes.length : 0} routes timed from the truck's position (simulated traffic).` };
    case "optimize_destination":
    case "rank_options": {
      const opts = Array.isArray(r.options) ? r.options : [];
      const ok = opts.filter((o: any) => o.feasible);
      return { kind: "optimization", title: "Best option found", text: ok.length ? `${ok.length} of ${opts.length} buyers can accept it. Best: ${n(ok[0].id)} (${formatINR(ok[0].net_proceeds_inr)} expected).` : "No buyer can accept the shipment in time." };
    }
    case "validate_constraints":
    case "check_policy":
      return { kind: "policy", title: "Safety & policy check", text: `${n(r.destination)}: ${r.allowed ? "allowed" : "blocked"}${r.requires_human_approval ? "; needs human approval" : ""}.` };
    case "request_human_approval":
    case "propose_action":
      return { kind: "approval", title: "Approval requested", text: `Diversion to ${n(r.destination)} waits for your decision.` };
    case "no_intervention_required":
      return { kind: "verify", title: "No action needed", text: `Keeping ${n(r.destination)} is already the best option.` };
    case "human_approved":
      return { kind: "approval", title: "Approved by you", text: `Diversion to ${n(r.destination)} approved.` };
    case "human_rejected":
      return { kind: "approval", title: "Rejected by you", text: `Shipment stays with ${n(r.destination)}.` };
    case "execute_destination_change":
      return { kind: "executed", title: "Shipment redirected", text: `Destination changed from ${n(i.previous_destination)} to ${n(r.destination)}. Expected gain ${formatINR(r.estimated_incremental_net_proceeds_inr, { signed: true })} (estimate).` };
    case "execute_reroute":
      return { kind: "executed", title: "Reroute issued", text: `New route to ${n(r.destination)}; approval enforced.` };
    case "verify":
    case "verify_execution":
      return { kind: "verify", title: "Outcome verified", text: r.persistent_state_verified_on_commit || r.destination_persisted_on_commit ? "New destination saved. Buyer acceptance is not confirmed (no buyer system connected)." : "Checked." };
    case "escalate":
      return { kind: "blocked", title: "Escalated to a person", text: String(r.reason ?? "No safe option.") };
    case "agent_explanation":
      return { kind: "explain", title: "Agent's explanation", text: `“${String(r.text)}” — written by ${String(i.model)}; every number comes from the tool results above.` };
    case "llm_usage":
      return { kind: "usage", title: "AI usage for this decision", text: `${i.model}: ${r.requests} requests, ${(r.input_tokens + r.output_tokens).toLocaleString("en-IN")} tokens, ${r.tool_calls} tool calls, about $${Number(r.estimated_cost_usd ?? 0).toFixed(4)}.` };
    case "investigation_failed":
    case "tool_rejected":
      return { kind: "blocked", title: "Action blocked", text: String(r.message ?? r.error ?? "The runtime refused this step.") };
    default:
      return { kind: "tool", title: t.tool.replace(/_/g, " "), text: "Recorded by the backend." };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function AgentTimeline({ trace, names }: { trace: TraceEntry[]; names: Record<string, string> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="relative space-y-3" aria-label="What FreshFlow did">
      {trace.map((t, i) => {
        const d = describe(t, names);
        const k = KIND[d.kind];
        const Icon = k.icon;
        const expanded = open === t.sequence;
        return (
          <li key={t.sequence} className="relative pl-14" data-testid="agent-step" data-tool={t.tool}>
            {i < trace.length - 1 && <span className="absolute left-[22px] top-11 h-[calc(100%-1.5rem)] w-0.5 bg-slate-200" aria-hidden />}
            <span className={cn("absolute left-0 top-1 flex h-11 w-11 items-center justify-center rounded-full", k.chip)}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <button type="button" className="flex w-full items-start gap-3 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : t.sequence)}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-forest">
                      {i + 1}. {d.title}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", k.chip)}>{k.label}</span>
                  </div>
                  <p className="mt-1 text-[15px] text-slate-700">{d.text}</p>
                </div>
                <ChevronDown className={cn("mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} aria-hidden />
              </button>
              {expanded && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                  <p>
                    <span className="font-semibold text-slate-600">Tool:</span> <code className="font-mono">{t.tool}</code> ·{" "}
                    <span className="font-semibold text-slate-600">Time:</span> {new Date(t.timestamp).toLocaleTimeString()}
                  </p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{JSON.stringify({ inputs: t.inputs, result: t.result }, null, 2)}</pre>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- charts */

export function FreshnessChart({ payload }: { payload: ShipmentPayload }) {
  const a = payload.strategies.A;
  const d = payload.strategies.D;
  const data = [...a.timeline.map((p) => ({ t: p.hours, A: p.rsl_hours })), ...d.timeline.map((p) => ({ t: p.hours, D: p.rsl_hours }))].sort((x, y) => x.t - y.t);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-sm text-slate-600">
        <LegendDot color="#64748b" label={`A · to ${a.buyer_name}`} />
        <LegendDot color="#0f8a7e" label={`D · to ${d.buyer_name}`} />
        <LegendDot color="#64748b" dashed label={`A buyer needs ${hoursText(a.minimum_rsl_hours)}`} />
        {d.buyer_id !== a.buyer_id && <LegendDot color="#0f8a7e" dashed label={`D buyer needs ${hoursText(d.minimum_rsl_hours)}`} />}
      </div>
      <div style={{ height: 280 }} role="img" aria-label="Remaining shelf life over the trip">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
            <CartesianGrid stroke="#e7eaee" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Number(v).toFixed(1)}h`} tick={{ fontSize: 13, fill: "#667085" }} label={{ value: "Hours since leaving the hub", position: "insideBottom", offset: -12, fontSize: 13, fill: "#667085" }} />
            <YAxis tickFormatter={(v) => `${v}h`} tick={{ fontSize: 13, fill: "#667085" }} width={52} />
            <Tooltip formatter={(v: number, n: string) => [hoursText(v), `Shelf life (${n})`]} labelFormatter={(v) => `${Number(v).toFixed(1)} h after leaving`} />
            <ReferenceLine y={a.minimum_rsl_hours} stroke="#64748b" strokeDasharray="6 4" />
            {d.buyer_id !== a.buyer_id && <ReferenceLine y={d.minimum_rsl_hours} stroke="#0f8a7e" strokeDasharray="6 4" />}
            <Line dataKey="A" stroke="#64748b" strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
            <Line dataKey="D" stroke="#0f8a7e" strokeWidth={3} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block w-6" style={{ borderTop: `3px ${dashed ? "dashed" : "solid"} ${color}` }} aria-hidden />
      {label}
    </span>
  );
}

/** Agent's ranked options from its optimizer tool call (actual trace data). */
export function agentOptions(payload: ShipmentPayload) {
  const t = [...payload.state.trace].reverse().find((x) => x.tool === "optimize_destination" || x.tool === "rank_options");
  const parsed = OptionsSchema.safeParse(t?.result.options);
  return parsed.success ? parsed.data : [];
}

export function BuyerProfitChart({ payload }: { payload: ShipmentPayload }) {
  const options = agentOptions(payload);
  const feasible = options.filter((o) => o.feasible).slice(0, 6);
  const blocked = options.filter((o) => !o.feasible);
  if (!options.length) return <p className="text-sm text-slate-600">No buyer comparison was recorded for this run.</p>;
  const data = feasible.map((o) => ({ name: (o.name ?? o.id).replace(/^.*· /, ""), full: o.name ?? o.id, value: o.net_proceeds_inr, current: o.id === payload.state.destination || o.id === payload.state.proposal?.id }));
  return (
    <div>
      {feasible.length > 0 ? (
        <div style={{ height: Math.max(160, data.length * 44) }} role="img" aria-label="Expected value by eligible buyer">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 13, fill: "#344054" }} />
              <Tooltip formatter={(v: number) => [formatINR(v), "Expected value from checkpoint"]} labelFormatter={(_, p) => p?.[0]?.payload.full ?? ""} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={d.name} fill={i === 0 ? "#0f8a7e" : "#9fc9c1"} />
                ))}
                <LabelList dataKey="value" position="right" formatter={(v: number) => formatINR(v, { compact: true })} style={{ fontSize: 13, fontWeight: 600, fill: "#1d2a24" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-xl bg-unsafe-50 p-3 text-sm text-unsafe-dark">No buyer can accept this shipment in time.</p>
      )}
      <p className="mt-2 text-sm text-slate-600">
        Expected value = shipment × buyer offer − remaining transport − diversion cost. Only buyers that can accept the shipment are shown;{" "}
        {blocked.length} were excluded (late arrival, capacity, quality or unavailable).
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- details */

export function DetailsTable({ payload }: { payload: ShipmentPayload }) {
  const s = payload.strategies;
  const rows: [string, string, (x: StrategyOutcome) => ReactNode][] = [
    ["Revenue", "Money received from the buyer.", (x) => formatINR(x.revenue_inr)],
    ["Procurement cost", "What the produce cost at the hub.", (x) => formatINR(x.procurement_inr)],
    ["Logistics cost", "Truck cost: fixed per trip + per km driven.", (x) => formatINR(x.transport_inr)],
    ["Handling / storage", "Loading and handling at the hub.", (x) => formatINR(x.handling_inr)],
    ["Rescue / diversion cost", "Paperwork and receiving slot for a diversion.", (x) => formatINR(x.rescue_inr)],
    ["Agent & technology cost", "Sensors and software per kg (higher for B, C, D).", (x) => formatINR(x.agent_tech_inr)],
    ["Gross margin", "Revenue minus procurement only.", (x) => formatINR(x.gross_margin_inr)],
    ["Operating profit (contribution)", "Revenue minus every cost above. For one shipment this equals its operating contribution.", (x) => formatINR(x.operating_profit_inr)],
    ["Spoiled / written off", "Kilograms not sold (rejected or damaged).", (x) => `${formatKg(x.spoiled_kg)} (${((x.spoiled_kg / x.input_kg) * 100).toFixed(0)}%)`],
    ["Buyer", "Who receives the shipment.", (x) => x.buyer_name],
    ["Buyer accepted?", "Can this buyer accept the shipment?", (x) => (x.accepted ? "Yes" : `No — ${x.rejection_reasons.join("; ")}`)],
    ["Distance driven", "Road distance, including diversions and detours.", (x) => `${x.distance_km.toFixed(1)} km`],
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-forest/10 bg-white">
      <table className="w-full min-w-[760px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-4 py-3 text-sm font-semibold text-slate-500">Item</th>
            {(["A", "B", "C", "D"] as const).map((l) => (
              <th key={l} className={cn("px-4 py-3", l === "D" && "bg-fresh-50/70")}>
                <ModelLabel letter={l} compact />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, help, f]) => (
            <tr key={label} className="border-b border-slate-100 last:border-0 align-top">
              <th scope="row" className="px-4 py-3 font-medium text-slate-700">
                <span className="flex items-center gap-1.5">
                  {label} <HelpTip text={help} />
                </span>
              </th>
              {(["A", "B", "C", "D"] as const).map((l) => (
                <td key={l} className={cn("num px-4 py-3 text-slate-800", l === "D" && "bg-fresh-50/70 font-semibold")}>
                  {f(s[l])}
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-slate-50">
            <th scope="row" className="px-4 py-3 font-semibold text-forest">
              <span className="flex items-center gap-1.5">
                Extra value from FreshFlow's actions (D − C) <HelpTip text="What the agent's event-driven action added on top of smart planning. Can be zero or negative." />
              </span>
            </th>
            <td colSpan={4} className="num px-4 py-3 font-semibold text-forest">
              {formatINR(s.D.operating_profit_inr - s.C.operating_profit_inr, { signed: true })} · D vs A: {formatINR(s.D.operating_profit_inr - s.A.operating_profit_inr, { signed: true })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function StrategyChip({ letter }: { letter: StrategyLetter }) {
  return <StrategyBadge letter={letter} />;
}
