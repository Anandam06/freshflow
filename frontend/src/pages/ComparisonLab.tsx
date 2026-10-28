import { useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorPanel, LoadingBlock, PageHeader, ProvenanceTag, SectionTitle } from "@/components/common";
import { KpiTable, ModelChips, RunContextBar, reportingBasis, useCurrentRun, type CompareMode } from "@/components/results";
import { CostBreakdownChart, ModelMetricBar, ProfitBridgeChart, RevenueProfitChart, RepetitionStrip } from "@/charts/ModelCharts";
import { profitBridge, relativeChange } from "@/lib/derive";
import { formatFraction, formatINR, formatINRAxis, formatINRPerKg, formatPP } from "@/lib/format";
import { MODEL_COLOR } from "@/charts/theme";
import { MODEL_META, MODEL_ORDER } from "@/lib/models";
import type { ModelId, ModelMetrics } from "@/types/api";

function ChartCard({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <ProvenanceTag category="SIMULATED RESULT" />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const pctChange = (m: Record<ModelId, ModelMetrics>, key: keyof ModelMetrics) =>
  MODEL_ORDER.map((id) => ({ model: id, value: relativeChange(m[id][key] as number, m.M0[key] as number) }));

export default function ComparisonLab() {
  const { result, current: run, byModel, loading, error, request, run: rerun, runIndex } = useCurrentRun();
  const basis = result ? reportingBasis(result, runIndex) : null;
  const [mode, setMode] = useState<CompareMode>("absolute");
  const rel = mode === "relative";

  return (
    <>
      <PageHeader
        eyebrow="Comparison lab"
        title="A · B · C · D side by side"
        description="Identical batches and identical disruptions for every model. Hover a model for a plain-English description; switch to the relative view to compare each model against traditional planning (A)."
        actions={
          <Tabs value={mode} onValueChange={(v) => setMode(v as CompareMode)}>
            <TabsList aria-label="Comparison mode">
              <TabsTrigger value="absolute">Absolute values</TabsTrigger>
              <TabsTrigger value="relative">Change vs A</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <ModelChips compact />
      {error && !loading ? <ErrorPanel className="mt-6" error={error} onRetry={() => void rerun(request)} /> : null}
      {loading && !result ? <LoadingBlock className="mt-6" /> : null}

      {result && run && byModel && (
        <div aria-busy={loading}>
          <div className="mt-6">
            <RunContextBar result={result} />
          </div>
          {rel && (
            <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Relative view: amounts as % change versus A; rates as percentage-point (pp) change. When M0's value is zero or negative, % change is shown as “—”
              because it is not meaningful.
            </p>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <ChartCard title="Spoilage" description={rel ? "Change in spoilage rate versus A, percentage points." : `Share of input kilograms not sold (incl. commercial write-offs). ${basis?.spoilage ?? ""}`}>
              {rel ? (
                <ModelMetricBar
                  ariaLabel="Spoilage change versus A in percentage points"
                  data={MODEL_ORDER.map((id) => ({ model: id, value: (byModel[id].spoilage_rate - byModel.M0.spoilage_rate) * 100 }))}
                  format={(v) => formatPP(v)}
                />
              ) : (
                <ModelMetricBar
                  ariaLabel="Spoilage rate by model"
                  data={MODEL_ORDER.map((id) => ({ model: id, value: byModel[id].spoilage_rate }))}
                  format={(v) => formatFraction(v)}
                  axisFormat={(v) => formatFraction(v, 0)}
                  target={{ value: 0.1, label: "Case target < 10%" }}
                />
              )}
            </ChartCard>

            <ChartCard title={rel ? "Operating profit change" : "Revenue and operating profit"} description={rel ? "Operating profit, % change versus A." : `Gross sales revenue and operating profit ${basis?.perPeriod ?? "per simulated period"}.`}>
              {rel ? (
                <ModelMetricBar
                  ariaLabel="Operating profit change versus A"
                  data={pctChange(byModel, "operating_profit_inr")}
                  format={(v) => formatFraction(v, 1, { signed: true })}
                  axisFormat={(v) => formatFraction(v, 0)}
                />
              ) : (
                <RevenueProfitChart metrics={run.metrics} />
              )}
            </ChartCard>

            <ChartCard title="Incremental value waterfall" description={`Operating profit bridge ${basis?.perPeriod ?? ""}. Each step isolates one capability; only D − C is the agentic contribution.`}>
              <ProfitBridgeChart bridge={profitBridge(run)} />
            </ChartCard>

            <ChartCard
              title="Net realization"
              description={rel ? "Net realization per input kg, % change versus A." : "Revenue less logistics, rescue and technology costs, per input kilogram (procurement excluded)."}
            >
              {rel ? (
                <ModelMetricBar
                  ariaLabel="Net realization per kg change versus A"
                  data={pctChange(byModel, "net_realization_per_input_kg_inr")}
                  format={(v) => formatFraction(v, 1, { signed: true })}
                  axisFormat={(v) => formatFraction(v, 0)}
                />
              ) : (
                <ModelMetricBar
                  ariaLabel="Net realization per input kg by model"
                  data={MODEL_ORDER.map((id) => ({ model: id, value: byModel[id].net_realization_per_input_kg_inr }))}
                  format={(v) => formatINRPerKg(v)}
                  axisFormat={(v) => `₹${v.toFixed(0)}`}
                />
              )}
            </ChartCard>

            <ChartCard title="Logistics, rescue and technology costs" description={`Cost lines ${basis?.perPeriod ?? "per simulated period"}. D adds rescue (diversion) and higher agent/sensor cost.`}>
              <CostBreakdownChart metrics={run.metrics} />
            </ChartCard>

            <ChartCard title="Spread across repetitions" description="Each dot is one seeded repetition (one simulated period); the tick is the mean across repetitions — an average, not a total.">
              <div className="space-y-6">
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Operating profit</p>
                  <RepetitionStrip
                    format={(v) => formatINR(v, { compact: true })}
                    rows={MODEL_ORDER.map((id, i) => ({
                      label: `${MODEL_META[id].letter} · ${MODEL_META[id].name}`,
                      color: MODEL_COLOR[id],
                      values: result.runs.map((r) => r.metrics[i].operating_profit_inr),
                      mean: result.summary[id].mean_operating_profit_inr,
                    }))}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Spoilage rate</p>
                  <RepetitionStrip
                    format={(v) => formatFraction(v)}
                    rows={MODEL_ORDER.map((id, i) => ({
                      label: `${MODEL_META[id].letter} · ${MODEL_META[id].name}`,
                      color: MODEL_COLOR[id],
                      values: result.runs.map((r) => r.metrics[i].spoilage_rate),
                      mean: result.summary[id].mean_spoilage_rate,
                    }))}
                  />
                </div>
              </div>
            </ChartCard>
          </div>

          <SectionTitle aside={<ProvenanceTag category="SIMULATED RESULT" />}>KPI table</SectionTitle>
          <Card>
            <CardContent className="pt-4">
              <KpiTable metrics={run.metrics} mode={mode} />
            </CardContent>
          </Card>
          <p className="mt-3 text-xs text-slate-500">Axis values: {formatINRAxis(1e5)} = ₹1 lakh, {formatINRAxis(1e7)} = ₹1 crore.</p>
        </div>
      )}
    </>
  );
}
