import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, FileJson, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DemoDataBadge, EmptyState, ErrorPanel, InfoTip, LoadingBlock, PageHeader, ProvenanceTag, SectionTitle } from "@/components/common";
import { KpiTable, RunContextBar, useCurrentRun } from "@/components/results";
import { ProfitBridgeChart } from "@/charts/ModelCharts";
import { useClient } from "@/services/ClientContext";
import { SIMULATION_LIMITS, SimulationRequestSchema, type SimulationRequest } from "@/types/api";
import type { SavedScenario } from "@/state/SimulationContext";
import { profitBridge } from "@/lib/derive";
import { download, resultToCsv } from "@/lib/export";
import { formatFraction, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ParamSpec {
  key: keyof SimulationRequest;
  label: string;
  help: string;
  unit?: string;
  step: number;
  integer?: boolean;
  format: (v: number) => string;
}

/** Every control maps 1:1 to a SimulationRequest field in shared/api-contract.yaml v1.1.0. */
const RISK_PARAMS: ParamSpec[] = [
  { key: "temperature_shift_c", label: "Heat events (temperature shift)", help: "Shifts every exposure temperature. Positive = hotter transit, faster quality loss.", unit: "°C", step: 0.5, format: (v) => `${v > 0 ? "+" : ""}${v} °C` },
  { key: "traffic_multiplier", label: "Traffic disruptions", help: "Scales route delays on the synthetic road graph. 1 = base traffic.", unit: "× base", step: 0.1, format: (v) => `${v.toFixed(2)}×` },
  { key: "disruption_probability", label: "Additional disruption shocks", help: "Probability per batch of an extra heat-and-delay shock. The frozen calibration default is 0; stress scenarios add shocks explicitly.", unit: "probability per batch", step: 0.05, format: (v) => formatFraction(v, 0) },
  { key: "cancellation_probability", label: "Buyer cancellations", help: "Probability that a committed buyer cancels.", unit: "probability", step: 0.01, format: (v) => formatFraction(v, 0) },
  { key: "buyer_availability", label: "Rescue-channel availability", help: "Probability that each buyer, including wholesale and processor rescue channels, is available that day.", unit: "probability", step: 0.05, format: (v) => formatFraction(v, 0) },
  { key: "prediction_error_hours", label: "Prediction uncertainty", help: "Standard deviation of the RSL sensor/prediction error.", unit: "hours (SD)", step: 0.5, format: (v) => `${v} h` },
  { key: "approval_delay_hours", label: "Agent response / approval delay", help: "Time between the agent's proposal and execution, including human approval.", unit: "hours", step: 0.25, format: (v) => `${v} h` },
  { key: "ai_cost_multiplier", label: "Agent operating cost", help: "Scales per-kg agent and sensor operating cost.", unit: "× base", step: 0.5, format: (v) => `${v.toFixed(1)}×` },
  { key: "price_multiplier", label: "Market price level", help: "Scales all buyer prices. Below 1 = weak market.", unit: "× base", step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: "capacity_multiplier", label: "Buyer & fleet capacity", help: "Scales buyer daily capacity and fleet capacity.", unit: "× base", step: 0.1, format: (v) => `${v.toFixed(2)}×` },
  { key: "initial_rsl_scale", label: "Initial shelf-life scale", help: "Calibration parameter: scales shelf life at dispatch. The default is the documented case-calibration boundary fit.", unit: "× base", step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: "setup_cost_inr", label: "FreshFlow one-off setup cost", help: "Used for ROI and payback only; excluded from operating profit.", unit: "INR", step: 10000, format: (v) => formatINR(v) },
];

const RUN_PARAMS: ParamSpec[] = [
  { key: "batches", label: "Batch count", help: "Synthetic tomato batches per repetition.", step: 100, integer: true, format: String },
  { key: "days", label: "Simulated days", help: "Batches are spread evenly across days.", step: 1, integer: true, format: String },
  { key: "repetitions", label: "Repetitions", help: "Independent seeded datasets. More repetitions = better view of variability (and longer runs).", step: 1, integer: true, format: String },
  { key: "seed", label: "Simulation seed", help: "Same seed + same parameters = identical results.", step: 1, integer: true, format: String },
];

export default function ScenarioStudio() {
  const client = useClient();
  const sim = useCurrentRun();
  const [draft, setDraft] = useState<SimulationRequest>(sim.request);
  const [name, setName] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const presets = client.capabilities.simulationPresets;
  const locked = Boolean(presets);

  // Follow the applied request only while the user has not edited the form.
  const applied = useRef(sim.request);
  useEffect(() => {
    setDraft((d) => (JSON.stringify(d) === JSON.stringify(applied.current) ? sim.request : d));
    applied.current = sim.request;
  }, [sim.request]);

  const validation = SimulationRequestSchema.safeParse(draft);
  const errors = useMemo(() => {
    const out: Partial<Record<keyof SimulationRequest, string>> = {};
    if (!validation.success) for (const i of validation.error.issues) out[i.path[0] as keyof SimulationRequest] ??= i.message;
    return out;
  }, [validation]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(sim.request);

  const field = (p: ParamSpec) => {
    const id = `param-${p.key}`;
    const lim = SIMULATION_LIMITS[p.key as keyof typeof SIMULATION_LIMITS] as { min: number; max: number };
    return (
      <div key={p.key} className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id}>{p.label}</Label>
          <InfoTip label={`About ${p.label}`}>{p.help}</InfoTip>
        </div>
        <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={lim.min}
            max={lim.max}
            step={p.step}
            value={Number.isNaN(draft[p.key]) ? "" : draft[p.key]}
            disabled={locked}
            aria-invalid={Boolean(errors[p.key])}
            aria-describedby={errors[p.key] ? `${id}-err` : undefined}
            onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value === "" ? NaN : Number(e.target.value) })}
          />
        <p className="text-xs text-slate-500">
          {locked ? p.format(draft[p.key]) : `${p.unit ? `${p.unit} · ` : ""}range ${lim.min}–${lim.max.toLocaleString("en-IN")}`}
        </p>
        {errors[p.key] && (
          <p id={`${id}-err`} className="text-sm text-unsafe">
            {errors[p.key]}
          </p>
        )}
      </div>
    );
  };

  const exportCsv = () => sim.result && download(`freshflow-scenario-${Date.now()}.csv`, resultToCsv(sim.result, sim.request), "text/csv");
  const exportJson = () =>
    sim.result && download(`freshflow-scenario-${Date.now()}.json`, JSON.stringify({ id: sim.runId, request: sim.request, result: sim.result }, null, 2), "application/json");

  return (
    <>
      <PageHeader
        eyebrow="Scenario studio"
        title="Stress-test the business case"
        description="Change a risk assumption, run the backend simulation, and see whether the agentic advantage survives. Every control maps to a field of the API's SimulationRequest."
        actions={<DemoDataBadge />}
      />

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle>Scenario parameters</CardTitle>
            <CardDescription>Risk assumptions first; run settings below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (validation.success) void sim.run(validation.data);
              }}
            >
              {presets && (
                <div className="space-y-1.5 rounded-md border border-risk-100 bg-risk-50 p-3">
                  <Label htmlFor="preset">Captured scenario (demo data)</Label>
                  <Select
                    id="preset"
                    value={presets.find((x) => JSON.stringify(x.request) === JSON.stringify(draft))?.key ?? ""}
                    onChange={(e) => {
                      const preset = presets.find((x) => x.key === e.target.value);
                      if (preset) setDraft(preset.request);
                    }}
                  >
                    <option value="" disabled>
                      Choose a captured scenario
                    </option>
                    {presets.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-risk-dark">Demo data replays backend runs captured for these scenarios only. Connect the backend to edit parameters freely.</p>
                </div>
              )}
              <fieldset className="space-y-4">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-forest">Risk assumptions</legend>
                {RISK_PARAMS.map(field)}
              </fieldset>
              <fieldset className="grid grid-cols-2 gap-4">
                <legend className="col-span-2 mb-2 text-xs font-semibold uppercase tracking-wide text-forest">Run settings</legend>
                {RUN_PARAMS.map(field)}
              </fieldset>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" variant="fresh" disabled={!validation.success || sim.loading} className="flex-1">
                  <Play /> {sim.loading ? "Running…" : "Run scenario"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(sim.defaults);
                    void sim.run(sim.defaults);
                  }}
                  disabled={sim.loading}
                >
                  <RotateCcw /> Reset
                </Button>
              </div>
              {dirty && <p className="text-sm text-risk-dark">Parameters changed — results below still show the previous run.</p>}
              {sim.loading && client.mode === "live" && <p className="text-sm text-slate-600">The backend engine runs every batch through all four models; a 2,000-batch × 3-repetition run takes roughly 30 seconds.</p>}
            </form>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {sim.error && !sim.loading ? <ErrorPanel error={sim.error} /> : null}
          {sim.loading && !sim.result ? <LoadingBlock label="Running simulation" /> : null}
          {sim.result && sim.current && sim.byModel && (
            <div className={cn("space-y-6 transition-opacity", sim.loading && "opacity-60")} aria-busy={sim.loading}>
              <RunContextBar result={sim.result} />
              <ScenarioHeadline m={sim.byModel} bridge={profitBridge(sim.current)} />
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>Profit bridge for this scenario</CardTitle>
                    <ProvenanceTag category="SIMULATED RESULT" />
                  </div>
                </CardHeader>
                <CardContent>
                  <ProfitBridgeChart bridge={profitBridge(sim.current)} height={260} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Save, export & compare</CardTitle>
                  <CardDescription>Saved scenarios keep the backend response verbatim in this browser, so comparisons never recompute anything.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const s = sim.save(name);
                      if (s) {
                        setSavedMsg(`Saved “${s.name}”.`);
                        setName("");
                      }
                    }}
                  >
                    <div className="min-w-[200px] flex-1 space-y-1">
                      <Label htmlFor="scenario-name">Scenario name</Label>
                      <Input id="scenario-name" placeholder="e.g. Pessimistic — heavy disruption" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                    </div>
                    <Button type="submit" variant="outline" disabled={sim.loading}>
                      <Save /> Save scenario
                    </Button>
                    <Button type="button" variant="outline" onClick={exportCsv}>
                      <Download /> Export CSV
                    </Button>
                    <Button type="button" variant="outline" onClick={exportJson}>
                      <FileJson /> Export JSON
                    </Button>
                  </form>
                  {savedMsg && (
                    <p role="status" className="text-sm text-fresh">
                      {savedMsg}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <SectionTitle aside={<ProvenanceTag category="SIMULATED RESULT" />}>Compare saved scenarios</SectionTitle>
          <SavedComparison saved={sim.saved} onRemove={sim.remove} />

          {sim.result && sim.current && (
            <>
              <SectionTitle>Full KPI table for the current scenario</SectionTitle>
              <Card>
                <CardContent className="pt-4">
                  <KpiTable metrics={sim.current.metrics} />
                </CardContent>
              </Card>
              <Button asChild variant="link" className="px-0">
                <Link to="/playground">
                  Next: see how the agent handles one disrupted batch <ArrowRight />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ScenarioHeadline({ m, bridge }: { m: NonNullable<ReturnType<typeof useCurrentRun>["byModel"]>; bridge: ReturnType<typeof profitBridge> }) {
  const tiles = [
    { label: "M3 profit vs A", value: formatINR(m.M3.incremental_profit_vs_m0_inr, { compact: true, signed: true }) },
    { label: "Extra value from FreshFlow's actions (D − C)", value: formatINR(bridge.steps[2].delta, { compact: true, signed: true }), accent: true },
    { label: "M3 spoilage", value: formatFraction(m.M3.spoilage_rate), sub: `M0 ${formatFraction(m.M0.spoilage_rate)}` },
    { label: "M3 margin uplift vs A", value: m.M3.margin_relative_uplift_vs_m0 == null ? "undefined" : formatFraction(m.M3.margin_relative_uplift_vs_m0, 1, { signed: true }), sub: "relative; case target +12%" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className={cn("rounded-lg border p-4", t.accent ? "border-fresh/30 bg-fresh-50" : "border-border bg-white")}>
          <p className="text-sm text-slate-600">{t.label}</p>
          <p className="num mt-1 text-2xl font-semibold text-forest">{t.value}</p>
          {t.sub && <p className="text-sm text-slate-500">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function SavedComparison({ saved, onRemove }: { saved: SavedScenario[]; onRemove: (id: string) => void }) {
  if (!saved.length) {
    return (
      <EmptyState title="No saved scenarios yet" icon={Save}>
        Run a scenario, give it a name and press “Save scenario”. Save a pessimistic and an optimistic case to compare them here.
      </EmptyState>
    );
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <THead>
            <TR>
              <TH>Scenario</TH>
              <TH className="text-right">Disruption</TH>
              <TH className="text-right">Capacity ×</TH>
              <TH className="text-right">Price ×</TH>
              <TH className="text-right">Mean A profit</TH>
              <TH className="text-right">Mean D profit</TH>
              <TH className="text-right">FreshFlow actions (D − C)</TH>
              <TH className="text-right">Mean D spoilage</TH>
              <TH className="text-right">P(both targets) D</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {saved.map((s) => {
              const sum = s.result.summary;
              return (
                <TR key={s.id}>
                  <TD>
                    <p className="font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      seed {s.request.seed} · {s.request.batches} batches × {s.request.repetitions} reps
                    </p>
                  </TD>
                  <TD className="num text-right">{formatFraction(s.request.disruption_probability, 0)}</TD>
                  <TD className="num text-right">{s.request.capacity_multiplier.toFixed(2)}</TD>
                  <TD className="num text-right">{s.request.price_multiplier.toFixed(2)}</TD>
                  <TD className="num text-right">{formatINR(sum.M0.mean_operating_profit_inr, { compact: true })}</TD>
                  <TD className="num text-right font-semibold text-forest">{formatINR(sum.M3.mean_operating_profit_inr, { compact: true })}</TD>
                  <TD className="num text-right text-fresh">{formatINR(sum.M3.mean_operating_profit_inr - sum.M2.mean_operating_profit_inr, { compact: true, signed: true })}</TD>
                  <TD className="num text-right">{formatFraction(sum.M3.mean_spoilage_rate)}</TD>
                  <TD className="num text-right">
                    <Badge variant={sum.M3.probability_meeting_both_targets >= 0.5 ? "fresh" : "unsafe"}>{formatFraction(sum.M3.probability_meeting_both_targets, 0)}</Badge>
                  </TD>
                  <TD>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => onRemove(s.id)}>
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-slate-500">Means are the backend's summary across repetitions. Agentic column = difference of the D and C backend means.</p>
      </CardContent>
    </Card>
  );
}
