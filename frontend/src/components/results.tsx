import { CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import type { ModelId, ModelMetrics, SimulationResult } from "@/types/api";
import { MODEL_META, MODEL_ORDER } from "@/lib/models";
import { meanRun, relativeChange } from "@/lib/derive";
import { formatCount, formatDays, formatFraction, formatINR, formatINRPerKg, formatKg, formatPP, formatRatio } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSimulation } from "@/state/SimulationContext";
import { cn } from "@/lib/utils";
import { DemoDataBadge, ProvenanceTag } from "./common";

/* ---------------------------------------------------------------- current run */

export function useCurrentRun() {
  const sim = useSimulation();
  const runs = sim.result?.runs;
  const run = !runs ? undefined : sim.runIndex < 0 && runs.length > 1 ? meanRun(runs) : runs[Math.min(Math.max(sim.runIndex, 0), runs.length - 1)];
  const byModel = run ? (Object.fromEntries(run.metrics.map((m) => [m.model, m])) as Record<ModelId, ModelMetrics>) : undefined;
  return { ...sim, current: run, byModel };
}

/** Scenario parameters, provenance and the repetition selector. */
export function RunContextBar({ result }: { result: SimulationResult }) {
  const { runIndex, setRunIndex, runId, studies, loadStudy, loading } = useSimulation();
  const c = result.config as Record<string, number>;
  const items: [string, string | undefined][] = [
    ["Batches", formatCount(c.batches)],
    ["Days", formatCount(c.days)],
    ["Repetitions", formatCount(c.repetitions)],
    ["Disruption prob.", formatFraction(c.disruption_probability, 0)],
    ["Price ×", c.price_multiplier?.toFixed(2)],
    ["Capacity ×", c.capacity_multiplier?.toFixed(2)],
    ["Buyer availability", c.buyer_availability == null ? undefined : formatFraction(c.buyer_availability, 0)],
    ["Temp. shift", c.temperature_shift_c == null ? undefined : `${c.temperature_shift_c} °C`],
    ["Traffic ×", c.traffic_multiplier?.toFixed(2)],
    ["Cancellations", c.cancellation_probability == null ? undefined : formatFraction(c.cancellation_probability, 0)],
    ["Agent cost ×", c.ai_cost_multiplier?.toFixed(1)],
    ["Setup cost", formatINR(c.setup_cost_inr)],
  ];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 xl:flex-row xl:flex-wrap xl:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceTag category={result.evidence_category ?? "SIMULATED RESULT"} />
        <DemoDataBadge />
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-help" tabIndex={0}>
              D policy: {result.agent_mode.replace(/_/g, " ")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            The simulation emulates the M3 intervention policy deterministically. It does not measure language-model effectiveness; the live agent is
            demonstrated separately in the rescue replay.
          </TooltipContent>
        </Tooltip>
        <Badge variant="outline">Assumptions {result.assumptions_version}</Badge>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm xl:ml-auto">
        {items.filter(([, v]) => v != null).map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className="num font-medium text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      {result.study && studies && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="whitespace-nowrap">Scenario</span>
          <Select value={result.study.id} disabled={loading} onChange={(e) => void loadStudy(e.target.value)} className="h-9 w-auto max-w-[260px]" aria-label="Study scenario">
            {studies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span className="whitespace-nowrap">Showing</span>
        <Select value={result.runs.length > 1 ? runIndex : 0} onChange={(e) => setRunIndex(Number(e.target.value))} className="h-9 w-auto" aria-label="Repetition shown">
          {result.runs.length > 1 && <option value={-1}>Mean of all {result.runs.length} repetitions</option>}
          {result.runs.map((r, i) => (
            <option key={r.seed} value={i}>
              Repetition {i + 1} · seed {r.seed}
            </option>
          ))}
        </Select>
      </label>
      {runId && <span className="sr-only">Simulation id {runId}</span>}
      {result.study && (
        <p className="basis-full text-sm text-slate-600 xl:order-last" data-testid="study-note">
          <strong className="text-forest">Validation study {result.study.id}</strong> — {result.study.description} Seeds {result.runs[0].seed}–
          {result.runs[result.runs.length - 1].seed}. These are the same numbers as the Excel evidence workbook (FreshFlow_Scenario_Validation.xlsx).
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- model explainer */

export function ModelChips({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={cn("grid gap-3", compact ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-4")}>
      {MODEL_ORDER.map((id) => {
        const m = MODEL_META[id];
        return (
          <li key={id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className={cn(
                    "h-full cursor-help rounded-lg border bg-white p-3 transition-colors hover:border-slate-300",
                    id === "M3" ? "border-fresh/40 bg-fresh-50/60" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold text-white" style={{ background: id === "M3" ? "#0f8a7e" : "#4f5b6b" }}>
                      {MODEL_META[id].letter}
                    </span>
                    <span className="font-semibold text-forest">{m.name}</span>
                  </div>
                  {!compact && <p className="mt-1.5 text-sm text-slate-600">{m.oneLiner}</p>}
                </div>
              </TooltipTrigger>
              <TooltipContent>{m.tooltip}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- KPI table */

type Fmt = (v: number | null) => string;
interface MetricRow {
  key: keyof ModelMetrics;
  label: string;
  fmt: Fmt;
  better: "higher" | "lower" | null;
  /** Fractions compare in percentage points in relative mode; amounts compare in %. */
  kind: "amount" | "fraction";
  group: string;
}

export const METRIC_ROWS: MetricRow[] = [
  { group: "Volume", key: "input_kg", label: "Input processed", fmt: (v) => formatKg(v), better: null, kind: "amount" },
  { group: "Volume", key: "sellable_kg", label: "Sellable quantity", fmt: (v) => formatKg(v), better: "higher", kind: "amount" },
  { group: "Volume", key: "spoiled_kg", label: "Spoiled / written off", fmt: (v) => formatKg(v), better: "lower", kind: "amount" },
  { group: "Volume", key: "spoilage_rate", label: "Spoilage rate", fmt: (v) => formatFraction(v), better: "lower", kind: "fraction" },
  { group: "Revenue & profit", key: "gross_sales_revenue_inr", label: "Gross sales revenue", fmt: (v) => formatINR(v), better: "higher", kind: "amount" },
  { group: "Revenue & profit", key: "salvage_value_inr", label: "of which salvage sales", fmt: (v) => formatINR(v), better: null, kind: "amount" },
  { group: "Revenue & profit", key: "operating_profit_inr", label: "Operating profit", fmt: (v) => formatINR(v), better: "higher", kind: "amount" },
  { group: "Revenue & profit", key: "operating_profit_margin", label: "Operating profit margin", fmt: (v) => formatFraction(v), better: "higher", kind: "fraction" },
  { group: "Revenue & profit", key: "net_realization_per_input_kg_inr", label: "Net realization per input kg", fmt: (v) => formatINRPerKg(v), better: "higher", kind: "amount" },
  { group: "Revenue & profit", key: "net_batch_realization_margin", label: "Net batch realization margin", fmt: (v) => formatFraction(v), better: "higher", kind: "fraction" },
  { group: "Costs", key: "procurement_inr", label: "Procurement", fmt: (v) => formatINR(v), better: null, kind: "amount" },
  { group: "Costs", key: "transport_inr", label: "Transport", fmt: (v) => formatINR(v), better: "lower", kind: "amount" },
  { group: "Costs", key: "handling_inr", label: "Handling / storage", fmt: (v) => formatINR(v), better: "lower", kind: "amount" },
  { group: "Costs", key: "rescue_inr", label: "Rescue / diversion", fmt: (v) => formatINR(v), better: null, kind: "amount" },
  { group: "Costs", key: "agent_sensor_inr", label: "Agent & sensor operating", fmt: (v) => formatINR(v), better: null, kind: "amount" },
  { group: "Service & safety", key: "buyer_rejection_rate", label: "Buyer rejection rate", fmt: (v) => formatFraction(v), better: "lower", kind: "fraction" },
  { group: "Service & safety", key: "on_time_fulfilment_rate", label: "On-time fulfilment", fmt: (v) => formatFraction(v), better: "higher", kind: "fraction" },
  { group: "Service & safety", key: "rescued_batches", label: "Rescued batches", fmt: (v) => formatCount(v), better: "higher", kind: "amount" },
  { group: "Service & safety", key: "successful_rescue_rate", label: "Successful rescue rate", fmt: (v) => formatFraction(v), better: "higher", kind: "fraction" },
  { group: "Service & safety", key: "food_safety_violations", label: "Food-safety violations", fmt: (v) => formatCount(v), better: "lower", kind: "amount" },
  { group: "Versus A (backend)", key: "incremental_profit_vs_m0_inr", label: "Incremental profit vs A", fmt: (v) => formatINR(v, { signed: true }), better: "higher", kind: "amount" },
  { group: "Versus A (backend)", key: "margin_percentage_point_change_vs_m0", label: "Margin change vs A", fmt: (v) => formatPP(v), better: "higher", kind: "amount" },
  { group: "Versus A (backend)", key: "margin_relative_uplift_vs_m0", label: "Margin relative uplift vs A", fmt: (v) => formatFraction(v, 1, { signed: true }), better: "higher", kind: "amount" },
  { group: "Versus A (backend)", key: "roi_over_simulated_period", label: "ROI over simulated period", fmt: (v) => formatRatio(v), better: "higher", kind: "amount" },
  { group: "Versus A (backend)", key: "payback_days", label: "Payback", fmt: (v) => formatDays(v), better: "lower", kind: "amount" },
];

export type CompareMode = "absolute" | "relative";

/** Relative mode is a display transform of backend values versus A: % for amounts, pp for fractions. */
function relativeCell(row: MetricRow, m: ModelMetrics, base: ModelMetrics): string {
  const v = m[row.key] as number | null;
  const b = base[row.key] as number | null;
  if (m.model === "M0") return "baseline";
  if (row.group.startsWith("Versus")) return row.fmt(v);
  if (v == null || b == null) return "—";
  if (row.kind === "fraction") return formatPP((v - b) * 100);
  const r = relativeChange(v, b);
  return r == null ? "—" : formatFraction(r, 1, { signed: true });
}

export function KpiTable({ metrics, mode = "absolute" }: { metrics: ModelMetrics[]; mode?: CompareMode }) {
  const base = metrics[0];
  let lastGroup = "";
  return (
    <Table>
      <caption className="mt-3 text-left text-xs text-slate-500">
        {mode === "absolute"
          ? "All values from the backend simulation (selected repetition). — means undefined (e.g. no baseline margin), not zero."
          : "Relative view: percentage change versus A for amounts; percentage-point (pp) change for rates. Display transform of backend values."}
      </caption>
      <THead>
        <TR>
          <TH className="min-w-[220px]">Metric</TH>
          {metrics.map((m) => (
            <TH key={m.model} className={cn("text-right", m.model === "M3" && "text-fresh")}>
              {MODEL_META[m.model].letter} · {MODEL_META[m.model].name}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {METRIC_ROWS.map((row) => {
          const header = row.group !== lastGroup;
          lastGroup = row.group;
          return [
            header && (
              <TR key={`g-${row.group}`} className="border-0">
                <TD colSpan={metrics.length + 1} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-forest">
                  {row.group}
                </TD>
              </TR>
            ),
            <TR key={row.key} className="hover:bg-slate-50">
              <TD className="text-slate-700">{row.label}</TD>
              {metrics.map((m) => (
                <TD key={m.model} className={cn("num whitespace-nowrap text-right", m.model === "M3" && "bg-fresh-50/50 font-semibold text-forest")}>
                  {mode === "absolute" ? row.fmt(m[row.key] as number | null) : relativeCell(row, m, base)}
                </TD>
              ))}
            </TR>,
          ];
        })}
      </TBody>
    </Table>
  );
}

/* ---------------------------------------------------------------- case targets */

function TargetIcon({ met }: { met: boolean | null }) {
  if (met == null) return <CircleSlash className="h-4 w-4 text-slate-400" aria-label="Not defined" />;
  return met ? <CheckCircle2 className="h-4 w-4 text-fresh" aria-label="Met" /> : <XCircle className="h-4 w-4 text-unsafe" aria-label="Not met" />;
}

export function TargetPanel({ result, metrics }: { result: SimulationResult; metrics: ModelMetrics[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: "Spoilage below 10% of input", key: "meets_spoilage_target" as const, value: (m: ModelMetrics) => formatFraction(m.spoilage_rate) },
          {
            title: "Net realization margin +12% (relative to A)",
            key: "meets_margin_target" as const,
            value: (m: ModelMetrics) => (m.margin_relative_uplift_vs_m0 == null ? "undefined" : formatFraction(m.margin_relative_uplift_vs_m0, 1, { signed: true })),
          },
        ].map((t) => (
          <div key={t.key} className="rounded-lg border border-border bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-forest">{t.title}</p>
              <ProvenanceTag category="CASE" />
            </div>
            <ul className="space-y-1">
              {metrics.map((m) => (
                <li key={m.model} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <TargetIcon met={t.key === "meets_margin_target" && m.margin_relative_uplift_vs_m0 == null && m.model !== "M0" ? null : m[t.key]} />
                    <span className="font-medium text-slate-700">{MODEL_META[m.model].letter}</span>
                  </span>
                  <span className="num text-slate-700">{m.model === "M0" && t.key === "meets_margin_target" ? "baseline" : t.value(m)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-forest">Share of repetitions meeting both targets</p>
          <ProvenanceTag category="SIMULATED RESULT" />
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODEL_ORDER.map((id) => {
            const s = result.summary[id];
            return (
              <li key={id} className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">{MODEL_META[id].letter} · {MODEL_META[id].name}</p>
                <p className="num text-lg font-semibold text-forest">{formatFraction(s.probability_meeting_both_targets, 0)}</p>
                <p className="num text-xs text-slate-500">
                  {s.runs_meeting_both_targets} of {s.repetitions} runs
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Empirical share over seeded synthetic repetitions — not a statistical confidence level.</p>
      </div>
    </div>
  );
}

export function Limitations({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
      {items.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
