import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModelId, ModelMetrics } from "@/types/api";
import { MODEL_META } from "@/lib/models";
import type { ProfitBridge } from "@/lib/derive";
import { formatINR, formatINRAxis } from "@/lib/format";
import { BAR_RADIUS, INK, MODEL_COLOR, SERIES, STATUS, axisLine, axisTick, gridProps } from "./theme";
import { Legend, TooltipCard } from "./ChartTooltip";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TooltipProps = { active?: boolean; payload?: any[]; label?: any };

const modelTick = (key: string) => {
  const meta = Object.values(MODEL_META).find((m) => m.id === key || m.letter === key);
  return meta ? `${meta.letter} · ${meta.name}` : key;
};

/* ------------------------------------------------------------------ single metric per model */

export interface ModelValue {
  model: ModelId;
  value: number | null;
}

export function ModelMetricBar({
  data,
  format,
  axisFormat = format,
  target,
  height = 260,
  ariaLabel,
}: {
  data: ModelValue[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  target?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
}) {
  const rows = data.map((d) => ({ ...d, name: MODEL_META[d.model].letter, plot: d.value ?? 0 }));
  return (
    <div>
      {target && (
        <p className="mb-1 flex items-center gap-2 text-sm text-slate-600">
          <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: STATUS.warning }} aria-hidden />
          {target.label}
        </p>
      )}
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 28, right: 12, bottom: 4, left: 8 }} barCategoryGap="28%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" tick={axisTick} axisLine={axisLine} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={axisFormat} width={72} />
          <Tooltip
            cursor={{ fill: "rgba(15,138,126,0.06)" }}
            content={({ active, payload }: TooltipProps) =>
              active && payload?.length ? (
                <TooltipCard
                  title={modelTick(payload[0].payload.model)}
                  rows={[{ name: "Value", value: payload[0].payload.value == null ? "Not defined" : format(payload[0].payload.value) }]}
                  note={MODEL_META[payload[0].payload.model as ModelId].oneLiner}
                />
              ) : null
            }
          />
          {target && (
            <ReferenceLine
              y={target.value}
              stroke={STATUS.warning}
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
          )}
          <ReferenceLine y={0} stroke={INK.axis} />
          <Bar dataKey="plot" radius={BAR_RADIUS} maxBarSize={72} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.model} fill={MODEL_COLOR[r.model]} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: number | null) => (v == null ? "n/a" : format(v))}
              style={{ fill: INK.primary, fontSize: 13, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

/* ------------------------------------------------------------------ profit bridge (waterfall) */

const STEP_LABEL = { freshness: "Freshness\n(B−A)", optimization: "Optimization\n(C−B)", agentic: "Agentic\n(D−C)" } as const;

export function ProfitBridgeChart({ bridge, height = 300 }: { bridge: ProfitBridge; height?: number }) {
  let running = bridge.m0;
  const rows: { name: string; base: number; bar: number; value: number; kind: "total" | "up" | "down" | "agentic" }[] = [
    { name: "A profit", base: Math.min(0, bridge.m0), bar: Math.abs(bridge.m0), value: bridge.m0, kind: "total" },
  ];
  for (const s of bridge.steps) {
    const start = running;
    running += s.delta;
    rows.push({
      name: STEP_LABEL[s.key],
      base: Math.min(start, running),
      bar: Math.abs(s.delta),
      value: s.delta,
      kind: s.key === "agentic" ? (s.delta >= 0 ? "agentic" : "down") : s.delta >= 0 ? "up" : "down",
    });
  }
  rows.push({ name: "D profit", base: Math.min(0, bridge.m3), bar: Math.abs(bridge.m3), value: bridge.m3, kind: "total" });
  const fill = { total: "#4f5b6b", up: "#8fb8ad", down: STATUS.critical, agentic: "#0f8a7e" };

  return (
    <div role="img" aria-label="Operating profit bridge from A to D" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 28, right: 12, bottom: 4, left: 8 }} barCategoryGap="22%">
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="name"
            interval={0}
            tickLine={false}
            axisLine={axisLine}
            height={44}
            tick={({ x, y, payload }: any) => (
              <text x={x} y={y + 14} textAnchor="middle" fill={INK.muted} fontSize={12.5}>
                {String(payload.value)
                  .split("\n")
                  .map((line: string, i: number) => (
                    <tspan key={i} x={x} dy={i === 0 ? 0 : 15}>
                      {line}
                    </tspan>
                  ))}
              </text>
            )}
          />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={formatINRAxis} width={72} />
          <Tooltip
            cursor={{ fill: "rgba(15,138,126,0.06)" }}
            content={({ active, payload }: TooltipProps) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload;
              return (
                <TooltipCard
                  title={String(r.name).replace("\n", " ")}
                  rows={[{ name: r.kind === "total" ? "Operating profit" : "Change", value: formatINR(r.value, { signed: r.kind !== "total" }) }]}
                />
              );
            }}
          />
          <ReferenceLine y={0} stroke={INK.axis} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={80} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={fill[r.kind]} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              content={({ x, y, width, index }: any) => {
                const r = rows[index];
                return (
                  <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={13} fontWeight={600} fill={INK.primary}>
                    {formatINR(r.value, { compact: true, signed: r.kind !== "total" })}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ revenue vs profit (grouped) */

export function RevenueProfitChart({ metrics, height = 280 }: { metrics: ModelMetrics[]; height?: number }) {
  const rows = metrics.map((m) => ({ name: MODEL_META[m.model].letter, revenue: m.gross_sales_revenue_inr, profit: m.operating_profit_inr }));
  return (
    <div>
      <Legend
        items={[
          { color: SERIES[0], label: "Gross sales revenue" },
          { color: SERIES[1], label: "Operating profit" },
        ]}
      />
      <div role="img" aria-label="Gross revenue and operating profit by model" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 8 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" tick={axisTick} axisLine={axisLine} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={formatINRAxis} width={72} />
            <Tooltip
              cursor={{ fill: "rgba(15,138,126,0.06)" }}
              content={({ active, payload, label }: TooltipProps) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={modelTick(label)}
                    rows={[
                      { color: SERIES[0], name: "Revenue", value: formatINR(payload[0].payload.revenue) },
                      { color: SERIES[1], name: "Operating profit", value: formatINR(payload[0].payload.profit) },
                    ]}
                  />
                ) : null
              }
            />
            <ReferenceLine y={0} stroke={INK.axis} />
            <Bar dataKey="revenue" fill={SERIES[0]} radius={BAR_RADIUS} maxBarSize={44} isAnimationActive={false} />
            <Bar dataKey="profit" fill={SERIES[1]} radius={BAR_RADIUS} maxBarSize={44} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ logistics & rescue costs (stacked) */

const COST_SERIES = [
  { key: "transport_inr", label: "Transport", color: SERIES[0] },
  { key: "handling_inr", label: "Handling", color: SERIES[1] },
  { key: "rescue_inr", label: "Rescue / diversion", color: SERIES[2] },
  { key: "agent_sensor_inr", label: "Agent & sensors", color: SERIES[3] },
] as const;

export function CostBreakdownChart({ metrics, height = 280 }: { metrics: ModelMetrics[]; height?: number }) {
  const rows = metrics.map((m) => ({
    name: MODEL_META[m.model].letter,
    transport_inr: m.transport_inr,
    handling_inr: m.handling_inr,
    rescue_inr: m.rescue_inr,
    agent_sensor_inr: m.agent_sensor_inr,
  }));
  return (
    <div>
      <Legend items={COST_SERIES.map((s) => ({ color: s.color, label: s.label }))} />
      <div role="img" aria-label="Logistics, rescue and technology costs by model" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 8 }} barCategoryGap="30%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" tick={axisTick} axisLine={axisLine} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={formatINRAxis} width={72} />
            <Tooltip
              cursor={{ fill: "rgba(15,138,126,0.06)" }}
              content={({ active, payload, label }: TooltipProps) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={modelTick(label)}
                    rows={COST_SERIES.map((s) => ({ color: s.color, name: s.label, value: formatINR(payload[0].payload[s.key]) }))}
                    note="Procurement cost is excluded here; see the KPI table."
                  />
                ) : null
              }
            />
            {COST_SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="c"
                fill={s.color}
                stroke="#ffffff"
                strokeWidth={2}
                radius={i === COST_SERIES.length - 1 ? BAR_RADIUS : undefined}
                maxBarSize={64}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parameter sweep (line) */

export function SweepChart({
  points,
  series,
  xLabel,
  xFormat,
  yFormat,
  yAxisFormat = yFormat,
  height = 260,
  target,
}: {
  points: Record<string, number | null>[];
  series: { key: string; label: string; color: string }[];
  xLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  yAxisFormat?: (v: number) => string;
  height?: number;
  target?: { value: number; label: string };
}) {
  return (
    <div>
      {series.length > 1 && <Legend items={series} />}
      <div role="img" aria-label={`${series.map((s) => s.label).join(", ")} versus ${xLabel}`} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 16, bottom: 20, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={points.map((p) => p.x as number)}
              tickFormatter={xFormat}
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              label={{ value: xLabel, position: "insideBottom", offset: -12, fill: INK.muted, fontSize: 13 }}
            />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={yAxisFormat} width={72} />
            <Tooltip
              cursor={{ stroke: INK.axis }}
              content={({ active, payload, label }: TooltipProps) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={`${xLabel}: ${xFormat(label)}`}
                    rows={series.map((s) => {
                      const v = payload[0].payload[s.key];
                      return { color: s.color, name: s.label, value: v == null ? "n/a" : yFormat(v) };
                    })}
                  />
                ) : null
              }
            />
            {target && (
              <ReferenceLine
                y={target.value}
                stroke={STATUS.warning}
                strokeDasharray="5 4"
                label={{ value: target.label, position: "insideTopRight", fill: STATUS.warning, fontSize: 12, fontWeight: 600 }}
              />
            )}
            <ReferenceLine y={0} stroke={INK.axis} />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ repetition spread (strip) */

/** One row per series (model or scenario): each dot is a repetition's backend value; the tick is the backend summary mean. */
export function RepetitionStrip({
  rows,
  format,
}: {
  rows: { label: string; color: string; values: number[]; mean: number | null }[];
  format: (v: number) => string;
}) {
  const all = rows.flatMap((r) => [...r.values, ...(r.mean != null ? [r.mean] : [])]);
  const lo = Math.min(...all, 0);
  const hi = Math.max(...all, 0);
  const span = hi - lo || 1;
  const pct = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="space-y-3" role="table" aria-label="Spread across repetitions">
      {rows.map((r) => (
        <div key={r.label} role="row" className="grid grid-cols-[8.5rem_1fr_6.5rem] sm:grid-cols-[11rem_1fr_7.5rem] items-center gap-3">
          <span role="rowheader" className="text-sm font-semibold text-slate-700">
            {r.label}
          </span>
          <div role="cell" className="relative h-6" aria-label={`${r.label}: ${r.values.map(format).join(", ")}`}>
            <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
            {lo < 0 && <div className="absolute top-0 h-full w-px bg-slate-300" style={{ left: pct(0) }} />}
            {r.values.length > 1 && (
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-40"
                style={{ left: pct(Math.min(...r.values)), width: `calc(${pct(Math.max(...r.values))} - ${pct(Math.min(...r.values))})`, background: r.color }}
              />
            )}
            {r.values.map((v, i) => (
              <span
                key={i}
                title={format(v)}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                style={{ left: pct(v), background: r.color }}
              />
            ))}
            {r.mean != null && <span className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-forest" style={{ left: pct(r.mean) }} title={`Mean ${format(r.mean)}`} />}
          </div>
          <span role="cell" className="num text-right text-sm text-slate-700">
            {r.mean != null ? format(r.mean) : "—"}
          </span>
        </div>
      ))}
      <p className="text-xs text-slate-500">Dots: individual repetitions (seeded runs). Dark tick and right column: backend summary mean.</p>
    </div>
  );
}
