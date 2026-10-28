import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Radar, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DemoDataBadge, EmptyState, ErrorPanel, InfoTip, LoadingBlock, PageHeader, ProvenanceTag, SectionTitle } from "@/components/common";
import { useSimulation } from "@/state/SimulationContext";
import { useClient } from "@/services/ClientContext";
import { useAsync } from "@/services/useAsync";
import { ChannelOptionSchema, type BatchState } from "@/types/api";
import { formatHours, formatKg } from "@/lib/format";
import { OPTIMIZER_TOOLS, latestOf, statusStyle } from "@/lib/trace";
import { cn } from "@/lib/utils";

/** Arrival RSL for the current destination, as computed by the backend's latest rank_options call. */
function arrivalRsl(b: BatchState): { hours: number; minimum: number } | null {
  const rank = latestOf(b.trace, OPTIMIZER_TOOLS);
  const parsed = ChannelOptionSchema.array().safeParse(rank?.result.options);
  const opt = parsed.success ? parsed.data.find((o) => o.id === b.destination) : undefined;
  return opt ? { hours: opt.arrival_rsl_lower_hours, minimum: opt.minimum_rsl_hours } : null;
}

function decision(b: BatchState): string {
  const p = ChannelOptionSchema.safeParse(b.proposal);
  if (b.status === "awaiting_approval" && p.success) return `Proposed: switch to ${p.data.id}`;
  if (b.status === "event_detected") return "Investigation pending";
  if (b.status === "manual_review") return "Manual review";
  return "Continue on plan";
}

export default function ControlTower() {
  const client = useClient();
  const batches = useAsync(() => client.listBatches(), [client]);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (batches.data ?? []).filter((b) => !s || [b.id, b.destination, b.status].some((v) => v.toLowerCase().includes(s)));
  }, [batches.data, q]);

  return (
    <>
      <PageHeader
        eyebrow="Freshness control tower"
        title="Batches, freshness and decisions"
        description="The live exception batch the agent is monitoring, plus every batch of the current simulation run. Open any batch to inspect the agent's tool calls and act on its decision."
        actions={
          <>
            <DemoDataBadge />
            <ProvenanceTag category="SYNTHETIC" />
          </>
        }
      />
      <SectionTitle>Live exception workflow</SectionTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search batches" placeholder="Search batch, destination or status" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={batches.reload}>
          Refresh
        </Button>
      </div>

      {batches.error ? <ErrorPanel error={batches.error} onRetry={batches.reload} /> : null}
      {batches.loading && !batches.data ? <LoadingBlock /> : null}
      {batches.data && (
        <Card>
          <CardContent className="pt-4">
            {rows.length === 0 ? (
              <EmptyState title="No matching batches" icon={Radar}>
                {q ? "Clear the search to see all batches." : "The backend is not monitoring any batch."}
              </EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Batch</TH>
                    <TH className="text-right">Quantity</TH>
                    <TH>Destination</TH>
                    <TH className="text-right">RSL (lower)</TH>
                    <TH className="text-right">
                      <span className="inline-flex items-center gap-1">
                        Arrival RSL
                        <InfoTip>Conservative shelf life on arrival at the current destination, from the agent's latest optimizer call.</InfoTip>
                      </span>
                    </TH>
                    <TH>Risk status</TH>
                    <TH>Current decision</TH>
                    <TH className="text-right">Interventions</TH>
                    <TH>
                      <span className="sr-only">Open</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((b) => {
                    const st = statusStyle(b.status);
                    const arr = arrivalRsl(b);
                    const interventions = b.trace.filter((t) => t.tool === "execute_destination_change").length;
                    return (
                      <TR key={b.id} className="hover:bg-slate-50">
                        <TD className="font-semibold text-forest">{b.id}</TD>
                        <TD className="num text-right">{formatKg(b.quantity_kg)}</TD>
                        <TD>{b.destination}</TD>
                        <TD className="num text-right">
                          {formatHours(b.rsl_hours)} <span className="text-slate-500">({formatHours(b.rsl_lower_hours)})</span>
                        </TD>
                        <TD className={cn("num text-right", arr && arr.hours < arr.minimum && "font-semibold text-unsafe")}>
                          {arr ? `${formatHours(arr.hours)} / min ${formatHours(arr.minimum, 0)}` : "—"}
                        </TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {b.safety_hold && <Badge variant="unsafe">Safety hold</Badge>}
                          </div>
                        </TD>
                        <TD className="text-slate-700">{decision(b)}</TD>
                        <TD className="num text-right">{interventions}</TD>
                        <TD>
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/replay/${encodeURIComponent(b.id)}`}>
                              Open <ArrowRight />
                            </Link>
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-slate-500">The live workflow uses the dedicated demo batch T17 (inject events, run the agent, approve).</p>
          </CardContent>
        </Card>
      )}
      <RunBatches />
    </>
  );
}

const PAGE = 25;

/** Audited repetition of the current simulation run: GET /api/v1/simulations/{run_id}/batches. */
function RunBatches() {
  const client = useClient();
  const { runId } = useSimulation();
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [rescueOnly, setRescueOnly] = useState(false);
  const page = useAsync(
    () => (runId ? client.listRunBatches(runId, offset, PAGE, rescueOnly) : Promise.resolve(null)),
    [client, runId, offset, rescueOnly],
  );
  const rows = (page.data?.batches ?? []).filter((b) => {
    const s = q.trim().toLowerCase();
    return !s || [b.id, b.morning_buyer ?? "", b.quality_grade ?? "", b.collection_location ?? ""].some((v) => v.toLowerCase().includes(s));
  });
  const total = page.data?.total ?? 0;

  return (
    <>
      <SectionTitle aside={<ProvenanceTag category="SYNTHETIC" />}>Batches in the current simulation run</SectionTitle>
      {!runId && <EmptyState title="No simulation run loaded yet" icon={Radar} />}
      {page.error ? <ErrorPanel error={page.error} onRetry={page.reload} /> : null}
      {runId && page.loading && !page.data ? <LoadingBlock /> : null}
      {page.data && (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <Input aria-label="Search run batches" placeholder="Search this page" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0f8a7e]"
                  checked={rescueOnly}
                  onChange={(e) => {
                    setRescueOnly(e.target.checked);
                    setOffset(0);
                  }}
                />
                D rescue attempts only
              </label>
              <p className="text-sm text-slate-600">
                Repetition {page.data.repetition + 1} · batches {total ? offset + 1 : 0}–{Math.min(offset + PAGE, total)} of {total.toLocaleString("en-IN")}
              </p>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0 || page.loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={offset + PAGE >= total || page.loading} onClick={() => setOffset(offset + PAGE)}>
                  Next
                </Button>
              </div>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH className="text-right">Day</TH>
                  <TH>Origin</TH>
                  <TH>Grade</TH>
                  <TH>Maturity</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH>Morning buyer</TH>
                  <TH className="text-right">Initial RSL</TH>
                  <TH>
                    <span className="inline-flex items-center gap-1">
                      Simulated D outcome
                      <InfoTip>What happened to this batch in the stored D simulation (SIMULATED RESULT). The decision page replays the agent on the observed state.</InfoTip>
                    </span>
                  </TH>
                  <TH>
                    <span className="sr-only">Open</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((b) => (
                  <TR key={b.id} className="hover:bg-slate-50">
                    <TD className="font-semibold text-forest">{b.id}</TD>
                    <TD className="num text-right">{b.day ?? "—"}</TD>
                    <TD className="whitespace-nowrap">{b.collection_location?.replace(/_/g, " ") ?? "—"}</TD>
                    <TD>{b.quality_grade ? <Badge variant="outline">{b.quality_grade}</Badge> : "—"}</TD>
                    <TD className="whitespace-nowrap capitalize">{b.maturity?.replace(/_/g, " ") ?? "—"}</TD>
                    <TD className="num text-right">{formatKg(b.quantity_kg)}</TD>
                    <TD>{b.morning_buyer ?? "—"}</TD>
                    <TD className="num text-right">{formatHours(b.initial_rsl_hours)}</TD>
                    <TD>
                      {b.simulated_m3 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={b.simulated_m3.buyer_acceptance ? "fresh" : "unsafe"}>{b.simulated_m3.buyer_acceptance ? "Sold" : "Not sold"}</Badge>
                          {b.simulated_m3.rescue_attempt && <Badge variant={b.simulated_m3.rescued ? "fresh" : "risk"}>{b.simulated_m3.rescued ? "Rescued" : "Rescue tried"}</Badge>}
                          <span className="text-xs text-slate-600">→ {b.simulated_m3.final_destination ?? "none"}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/advanced/agent-demo/run/${encodeURIComponent(page.data!.run_id)}/${encodeURIComponent(b.id)}`}>
                          Decision <ArrowRight />
                        </Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="mt-3 text-xs text-slate-500">
              Batch records from the run's audited repetition, with each batch's simulated M3 outcome. Tick “D rescue attempts only” to find
              batches where the agentic policy intervened, then open the decision to replay the agent's tool calls.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
