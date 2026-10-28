import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DemoDataBadge, EmptyState, ErrorPanel, InfoTip, LoadingBlock, PageHeader, ProvenanceTag, SectionTitle } from "@/components/common";
import { RepetitionStrip } from "@/charts/ModelCharts";
import { MODEL_COLOR, STATUS } from "@/charts/theme";
import { useClient } from "@/services/ClientContext";
import { MODEL_META } from "@/lib/models";
import { useAsync } from "@/services/useAsync";
import { MODEL_IDS, type SimulationResult } from "@/types/api";
import { formatFraction, formatINR, titleCase } from "@/lib/format";

const ORDER = ["optimistic", "baseline", "lower_buyer_availability", "higher_temperature", "pessimistic"];
const PARAM_LABEL: Record<string, string> = {
  disruption_probability: "Disruption shocks",
  price_multiplier: "Price ×",
  capacity_multiplier: "Capacity ×",
  buyer_availability: "Buyer availability",
  temperature_shift_c: "Temperature shift °C",
  traffic_multiplier: "Traffic ×",
  cancellation_probability: "Cancellations",
  prediction_error_hours: "Prediction error h",
  approval_delay_hours: "Approval delay h",
  ai_cost_multiplier: "Agent cost ×",
  initial_rsl_scale: "Initial RSL ×",
  repetitions: "Repetitions",
  seed: "Seed",
};

/** Stored-study entries are keyed by scenario id (S01, X01…); the older study used descriptive keys. */
const label = (key: string, r: SimulationResult) => (r.study ? `${r.study.id} · ${r.study.name}` : titleCase(key));

/** Parameters that differ from the study's baseline (display only). */
function changes(r: SimulationResult, base: SimulationResult | undefined): string {
  if (!base) return "";
  const diff = Object.entries(r.config).filter(([k, v]) => base.config[k] !== v && k in PARAM_LABEL);
  return diff.length ? diff.map(([k, v]) => `${PARAM_LABEL[k]} ${String(v)}`).join(" · ") : "Calibrated defaults";
}

export default function RiskSensitivity() {
  const client = useClient();
  const study = useAsync(() => client.getSensitivity(), [client]);
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  const entries = Object.entries(study.data ?? {}).sort(([a], [b]) => rank(a) - rank(b));
  const base = study.data?.baseline ?? study.data?.S01;
  const reps = base?.summary.M3.repetitions;

  return (
    <>
      <PageHeader
        eyebrow="Risk & sensitivity"
        title="When does agentic intervention actually pay?"
        description={`Backend sensitivity study: each scenario is a full simulation over ${reps ?? "repeated"} seeded datasets${base?.study ? " — the same validation study as the Excel workbook and the Fleet results tab" : ""}. Ranges are 5th–95th simulation percentiles, not confidence intervals.`}
        actions={<DemoDataBadge />}
      />
      {study.error ? <ErrorPanel error={study.error} onRetry={study.reload} /> : null}
      {study.loading && !study.data ? <LoadingBlock label="Loading sensitivity study" /> : null}
      {study.data === null && (
        <EmptyState title="No stored sensitivity study on this deployment" icon={ShieldAlert}>
          The backend has not published GET /api/v1/scenarios/sensitivity. Use the Scenario studio to run individual stress scenarios.
          <Button asChild variant="link" className="mt-2">
            <Link to="/advanced/scenarios">
              Open scenario studio <ArrowRight />
            </Link>
          </Button>
        </EmptyState>
      )}

      {entries.length > 0 && (
        <>
          <SectionTitle aside={<ProvenanceTag category="SIMULATED RESULT" />}>Extra value from FreshFlow's actions (D − C) by scenario</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {entries.map(([key, r]) => {
              const inc = r.risk?.mean_incremental_m3_vs_m2_inr ?? null;
              const pWorse = r.risk?.probability_m3_worse_than_m2 ?? null;
              const positive = inc != null && inc > 0;
              return (
                <Card key={key} className={positive ? "border-fresh/40" : "border-unsafe-100"} data-testid={`scenario-${key}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[15px]">{label(key, r)}</CardTitle>
                    <CardDescription className="text-xs">{changes(r, base)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className={`num text-2xl font-semibold ${positive ? "text-fresh" : "text-unsafe"}`}>{formatINR(inc, { compact: true, signed: true })}</p>
                    <p className="text-sm text-slate-600">mean D − C operating profit</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant={pWorse != null && pWorse >= 0.5 ? "unsafe" : "fresh"}>P(D worse than C) {formatFraction(pWorse, 0)}</Badge>
                      <Badge variant="outline">
                        M3 targets met {r.summary.M3.runs_meeting_both_targets}/{r.summary.M3.repetitions}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
            Reading: the agentic layer adds profit over plan-time optimization only where disruptions are frequent enough for rescues to matter. Where it
            does not, its extra operating cost makes M3 slightly worse than M2. This is reported as computed, not tuned.
          </p>

          <SectionTitle aside={<ProvenanceTag category="SIMULATED RESULT" />}>Spread of the agentic increment across repetitions</SectionTitle>
          <Card>
            <CardContent className="pt-5">
              <RepetitionStrip
                format={(v) => formatINR(v, { compact: true, signed: true })}
                rows={entries.map(([key, r]) => {
                  const mean = r.risk?.mean_incremental_m3_vs_m2_inr ?? null;
                  return {
                    label: label(key, r),
                    color: mean != null && mean > 0 ? STATUS.good : STATUS.critical,
                    values: r.risk?.incremental_m3_vs_m2_distribution_inr ?? [],
                    mean,
                  };
                })}
              />
            </CardContent>
          </Card>

          <SectionTitle aside={<ProvenanceTag category="SIMULATED RESULT" />}>Profit and spoilage ranges by scenario</SectionTitle>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1">
                Mean with 5th–95th simulation percentile range per model.
                <InfoTip>{base?.risk?.range_definition ?? "Backend percentile ranges across repetitions; not confidence intervals."}</InfoTip>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Scenario</TH>
                    <TH>Model</TH>
                    <TH className="text-right">Mean operating profit</TH>
                    <TH className="text-right">Profit p5 – p95</TH>
                    <TH className="text-right">Mean spoilage</TH>
                    <TH className="text-right">Spoilage p5 – p95</TH>
                    <TH className="text-right">Runs meeting both targets</TH>
                  </TR>
                </THead>
                <TBody>
                  {entries.flatMap(([key, r]) =>
                    MODEL_IDS.map((m, i) => {
                      const s = r.summary[m];
                      return (
                        <TR key={`${key}-${m}`} className={i === 0 ? "border-t-2 border-slate-200" : ""}>
                          <TD className="font-medium text-slate-800">{i === 0 ? label(key, r) : ""}</TD>
                          <TD>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MODEL_COLOR[m] }} aria-hidden />
                              {MODEL_META[m].letter} · {MODEL_META[m].name}
                            </span>
                          </TD>
                          <TD className={`num text-right ${m === "M3" ? "font-semibold text-forest" : ""}`}>{formatINR(s.mean_operating_profit_inr, { compact: true })}</TD>
                          <TD className="num whitespace-nowrap text-right text-slate-600">
                            {s.profit_p05_inr != null ? `${formatINR(s.profit_p05_inr, { compact: true })} to ${formatINR(s.profit_p95_inr, { compact: true })}` : "—"}
                          </TD>
                          <TD className="num text-right">{formatFraction(s.mean_spoilage_rate)}</TD>
                          <TD className="num whitespace-nowrap text-right text-slate-600">{s.spoilage_p05 != null ? `${formatFraction(s.spoilage_p05)} to ${formatFraction(s.spoilage_p95)}` : "—"}</TD>
                          <TD className="num text-right">
                            {s.runs_meeting_both_targets}/{s.repetitions}
                          </TD>
                        </TR>
                      );
                    }),
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <p className="mt-3 text-sm text-slate-600">
            Want a scenario that is not in the study?{" "}
            <Link to="/advanced/scenarios" className="font-medium text-fresh hover:underline">
              Run it in the Scenario studio
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}
