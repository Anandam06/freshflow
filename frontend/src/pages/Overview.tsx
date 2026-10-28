import { Link } from "react-router-dom";
import { ArrowRight, Bot, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorPanel, KpiCard, LoadingBlock, PageHeader, ProvenanceTag, SectionTitle } from "@/components/common";
import { Limitations, ModelChips, RunContextBar, TargetPanel, useCurrentRun } from "@/components/results";
import { ModelMetricBar, ProfitBridgeChart } from "@/charts/ModelCharts";
import { agenticShare, deltaPP, profitBridge } from "@/lib/derive";
import { formatFraction, formatINR, formatINRPerKg, formatKg, formatPP } from "@/lib/format";
import { MODEL_ORDER } from "@/lib/models";

export default function Overview() {
  const { result, current: run, byModel, loading, error, request, run: rerun } = useCurrentRun();

  return (
    <>
      <PageHeader
        eyebrow="Executive overview"
        title="Does agentic rescue pay for itself?"
        description={
          <>
            FreshFlow compares four ways of moving the same tomato batches through the same disruptions. Each step adds one capability, so the value of
            freshness data, of optimization, and of <strong className="text-forest">agentic intervention</strong> is shown separately.
          </>
        }
        actions={
          <Button asChild variant="fresh" size="lg">
            <Link to="/advanced/agent-demo">
              <Bot /> Watch the agent rescue batch T17 <ArrowRight />
            </Link>
          </Button>
        }
      />

      <ModelChips />

      {error && !loading ? <ErrorPanel className="mt-6" error={error} onRetry={() => void rerun(request)} /> : null}
      {loading && !result ? <LoadingBlock className="mt-6" label="Running simulation" /> : null}

      {result && run && byModel && (
        <div aria-busy={loading}>
          <div className="mt-6">
            <RunContextBar result={result} />
          </div>
          <Headline metrics={byModel} bridge={profitBridge(run)} />

          <div className="mt-6 grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Where the profit comes from</CardTitle>
                  <ProvenanceTag category="SIMULATED RESULT" />
                </div>
                <CardDescription>Operating profit bridge, A → D. Only the last step (D − C) is the incremental effect of agentic intervention — teal if positive, red if negative.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfitBridgeChart bridge={profitBridge(run)} />
                {!profitBridge(run).reconciles && (
                  <p className="mt-2 text-sm text-unsafe">Contract check: A + steps does not equal D operating profit. Report to backend.</p>
                )}
              </CardContent>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Spoilage rate by model</CardTitle>
                  <ProvenanceTag category="SIMULATED RESULT" />
                </div>
                <CardDescription>Share of input kilograms not sold, including commercial write-offs. Dashed line: case target.</CardDescription>
              </CardHeader>
              <CardContent>
                <ModelMetricBar
                  ariaLabel="Spoilage rate by model"
                  data={MODEL_ORDER.map((id) => ({ model: id, value: byModel[id].spoilage_rate }))}
                  format={(v) => formatFraction(v)}
                  axisFormat={(v) => formatFraction(v, 0)}
                  target={{ value: 0.1, label: "Case target < 10%" }}
                />
              </CardContent>
            </Card>
          </div>

          <SectionTitle aside={<ProvenanceTag category="SIMULATED RESULT" />}>Key results · D versus A</SectionTitle>
          <KpiGrid m={byModel} />

          <SectionTitle>How confident should you be?</SectionTitle>
          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <TargetPanel result={result} metrics={MODEL_ORDER.map((id) => byModel[id])} />
            </div>
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-fresh" aria-hidden /> Read these results as
                </CardTitle>
                <CardDescription>
                  A controlled comparison on synthetic data — {result.runs.length} seeded repetition{result.runs.length === 1 ? "" : "s"}, identical batches and
                  disruptions for every model. Backend-declared limitations:
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.risk?.probability_m3_worse_than_m2 != null && (
                  <div className="mb-3 rounded-md border border-border bg-slate-50 p-3 text-sm" data-testid="agentic-risk">
                    <p className="font-semibold text-forest">Downside check: is the agentic layer worth its cost here?</p>
                    <p className="mt-1 text-slate-700">
                      D earned less than C in <strong>{formatFraction(result.risk.probability_m3_worse_than_m2, 0)}</strong> of repetitions (mean D − C:{" "}
                      {formatINR(result.risk.mean_incremental_m3_vs_m2_inr ?? null, { compact: true, signed: true })}). See Risk &amp; sensitivity for when it pays.
                    </p>
                  </div>
                )}
                <Limitations items={result.limitations} />
                <Button asChild variant="link" className="mt-2 h-auto px-0">
                  <Link to="/advanced/evidence">
                    Inspect every assumption <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Headline({ metrics, bridge }: { metrics: ReturnType<typeof useCurrentRun>["byModel"] & object; bridge: ReturnType<typeof profitBridge> }) {
  const m0 = metrics.M0;
  const m3 = metrics.M3;
  const share = agenticShare(bridge);
  const agentic = bridge.steps[2].delta;
  const spoilPP = deltaPP(m0.spoilage_rate, m3.spoilage_rate);
  return (
    <section aria-label="Headline" className="mt-6 grid gap-4 lg:grid-cols-3">
      <div className="rounded-lg bg-forest p-5 text-white lg:col-span-1">
        <p className="text-sm text-emerald-50/80">Operating profit, D vs A</p>
        <p className="num mt-1 text-3xl font-semibold tracking-tight" data-testid="headline-profit">
          {formatINR(m3.incremental_profit_vs_m0_inr, { compact: true, signed: true })}
        </p>
        <p className="mt-1 text-sm text-emerald-50/80">
          {formatINR(m0.operating_profit_inr, { compact: true })} → {formatINR(m3.operating_profit_inr, { compact: true })} over the simulated period
        </p>
      </div>
      <div className={agentic < 0 ? "rounded-lg border border-unsafe-100 bg-unsafe-50 p-5" : "rounded-lg border border-fresh/30 bg-fresh-50 p-5"} data-testid="headline-agentic-tile">
        <p className={`flex items-center gap-1.5 text-sm font-medium ${agentic < 0 ? "text-unsafe-dark" : "text-fresh"}`}>
          <Bot className="h-4 w-4" aria-hidden /> From agentic intervention (D − C)
        </p>
        <p className="num mt-1 text-3xl font-semibold tracking-tight text-forest" data-testid="headline-agentic">
          {formatINR(agentic, { compact: true, signed: true })}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          {agentic < 0
            ? "In this repetition the agentic layer cost more than it rescued; the A→D gain comes from freshness data and optimization. See Risk & sensitivity for when it pays."
            : share == null
              ? "Share of total gain undefined (total gain not positive)."
              : `${formatFraction(share, 0)} of the total A→D profit gain. The rest comes from freshness data and optimization.`}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-white p-5">
        <p className="text-sm font-medium text-slate-600">Spoilage reduction, A → D</p>
        <p className="num mt-1 text-3xl font-semibold tracking-tight text-forest">{spoilPP == null ? "—" : formatPP(spoilPP, 1, { signed: false })}</p>
        <p className="mt-1 text-sm text-slate-700">
          {formatFraction(m0.spoilage_rate)} → {formatFraction(m3.spoilage_rate)} of input kg ·{" "}
          {m3.meets_spoilage_target ? <span className="font-medium text-fresh">below the 10% case target in this run</span> : <span className="font-medium text-unsafe">case target (&lt;10%) not met in this run</span>}
        </p>
      </div>
    </section>
  );
}

function KpiGrid({ m }: { m: NonNullable<ReturnType<typeof useCurrentRun>["byModel"]> }) {
  const m0 = m.M0;
  const m3 = m.M3;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard label="Total produce processed" value={formatKg(m3.input_kg, { compact: true })} sub="Same input for all four models" />
      <KpiCard label="Spoilage reduction" value={formatPP(deltaPP(m0.spoilage_rate, m3.spoilage_rate), 1, { signed: false })} sub={`${formatFraction(m0.spoilage_rate)} → ${formatFraction(m3.spoilage_rate)}`} tone="fresh" tip="Percentage-point fall in the share of input kilograms not sold, A minus D." />
      <KpiCard label="Sellable kilograms" value={formatKg(m3.sellable_kg, { compact: true })} sub={`A: ${formatKg(m0.sellable_kg, { compact: true })}`} />
      <KpiCard label="Gross sales revenue" value={formatINR(m3.gross_sales_revenue_inr, { compact: true })} sub={`A: ${formatINR(m0.gross_sales_revenue_inr, { compact: true })}`} />
      <KpiCard label="Operating profit" value={formatINR(m3.operating_profit_inr, { compact: true })} sub={`A: ${formatINR(m0.operating_profit_inr, { compact: true })}`} tone={m3.operating_profit_inr < 0 ? "unsafe" : "neutral"} />
      <KpiCard label="Profit uplift vs A" value={formatINR(m3.incremental_profit_vs_m0_inr, { compact: true, signed: true })} tone="fresh" sub="Backend: incremental_profit_vs_m0" />
      <KpiCard label="Net realization per input kg" value={formatINRPerKg(m3.net_realization_per_input_kg_inr)} sub={`A: ${formatINRPerKg(m0.net_realization_per_input_kg_inr)}`} tip="Gross revenue minus transport, handling, rescue and technology costs, per input kilogram (excludes procurement)." />
      <KpiCard
        label="Net batch realization margin"
        value={formatFraction(m3.net_batch_realization_margin)}
        sub={
          <>
            {formatPP(m3.margin_percentage_point_change_vs_m0)} vs A ·{" "}
            {m3.margin_relative_uplift_vs_m0 == null ? "relative uplift undefined" : `${formatFraction(m3.margin_relative_uplift_vs_m0, 1, { signed: true })} relative`}
          </>
        }
        tip="pp = percentage-point difference. Relative uplift = (D margin ÷ A margin) − 1; the 12% case target uses the relative definition."
      />
      <KpiCard
        label="Rescued batches (D)"
        value={m3.rescued_batches != null ? String(m3.rescued_batches) : "—"}
        sub={`Rescue success rate ${formatFraction(m3.successful_rescue_rate)} of attempts`}
        tip="Batches whose plan became infeasible after a disruption and were sold through an alternative channel. Salvage sales are a subset of revenue."
      />
      <KpiCard label="Food-safety violations" value={String(m3.food_safety_violations)} sub="Held lots are quarantined in every model" tone={m3.food_safety_violations > 0 ? "unsafe" : "fresh"} />
    </div>
  );
}
