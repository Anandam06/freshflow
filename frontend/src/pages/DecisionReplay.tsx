import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertOctagon,
  BadgeCheck,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  Cpu,
  FlaskConical,
  Gavel,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Route,
  Scale,
  SkipBack,
  SkipForward,
  ThermometerSun,
  UserCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DemoDataBadge, EmptyState, ErrorPanel, InfoTip, JsonView, LoadingBlock, PageHeader, ProvenanceTag } from "@/components/common";
import { useClient } from "@/services/ClientContext";
import { HERO_BATCH_ID } from "@/services/client";
import { useAsync } from "@/services/useAsync";
import {
  ChannelOptionSchema,
  DEFAULT_EVENT_REQUEST,
  EventRequestSchema,
  type AgentInvestigationMode,
  type BatchState,
  type ChannelOption,
  type EventRequest,
  type RunDecision,
  type TraceEntry,
} from "@/types/api";
import { formatHours, formatINR, formatKg } from "@/lib/format";
import { KIND_STYLE, OPTIMIZER_TOOLS, PHASES, POLICY_TOOLS, isSimulatedOutcome, latestOf, statusStyle, stepMeta, type StepKind } from "@/lib/trace";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<StepKind, typeof Bot> = {
  plan: CalendarClock,
  event: ThermometerSun,
  prediction: Brain,
  tool: Wrench,
  optimization: Scale,
  policy: Gavel,
  proposal: Route,
  human: UserCheck,
  execution: BadgeCheck,
  verification: CheckCircle2,
  escalation: AlertOctagon,
  error: XCircle,
};

const STEP_MS = 700;

/* ================================================================== page */

export default function DecisionReplay() {
  const { batchId = HERO_BATCH_ID, runId } = useParams();
  return runId ? <RunDecisionReplay key={`${runId}/${batchId}`} runId={runId} batchId={batchId} /> : <HeroReplay key={batchId} batchId={batchId} />;
}

/* ================================================================== T17: live exception workflow */

function HeroReplay({ batchId }: { batchId: string }) {
  const client = useClient();
  const health = useAsync(() => client.health(), [client]);
  const initial = useAsync(() => client.getBatch(batchId), [client, batchId]);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    if (initial.data) setBatch(initial.data);
  }, [initial.data]);

  const act = useCallback(
    async (label: string, fn: () => Promise<BatchState>) => {
      setBusy(label);
      setActionError(null);
      try {
        setBatch(await fn());
      } catch (e) {
        setActionError(e);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const reload = () => act("reload", () => client.getBatch(batchId));

  return (
    <>
      <PageHeader
        eyebrow="Signature workflow · Agentic AI"
        title={`Agentic decision replay · Batch ${batchId}`}
        description={
          <>
            Trigger a disruption, let the agent investigate with real tool calls, inspect its options and policy checks, then approve or reject. Every step
            below is the backend's append-only trace of observable tool inputs and results — not hidden model reasoning.
          </>
        }
        actions={
          <>
            <DemoDataBadge />
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={!!busy}>
              <RefreshCw /> Reload state
            </Button>
          </>
        }
      />

      {initial.error && !batch ? <ErrorPanel error={initial.error} onRetry={initial.reload} /> : null}
      {!batch && initial.loading ? <LoadingBlock label="Loading batch" /> : null}

      {batch && (
        <>
          <PhaseRail trace={batch.trace} status={batch.status} />
          {actionError ? <ErrorPanel className="mt-4" error={actionError} onRetry={() => void reload()} /> : null}
          <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
            <div className="space-y-6">
              <OperatorConsole
                batch={batch}
                busy={busy}
                liveAgentAvailable={client.mode === "live" && Boolean(health.data?.live_agent_configured)}
                customEvents={client.capabilities.customEvents}
                onEvent={(req) => act("event", () => client.injectEvent(batch.id, req))}
                onInvestigate={(mode) => act("investigate", () => client.investigate(batch.id, { mode }))}
                onDecide={(approve) => act(approve ? "approve" : "reject", () => client.decide(batch.id, { approve, expected_version: batch.version }))}
                onReset={client.resetDemo ? () => act("reset", () => client.resetDemo!()) : undefined}
              />
              <ShipmentState batch={batch} />
            </div>
            <div className="min-w-0 space-y-6">
              <DecisionPanel batch={batch} />
              <TraceTimeline batch={batch} demo={client.mode === "demo"} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ================================================================== phase rail */

function PhaseRail({ trace, status }: { trace: TraceEntry[]; status: string }) {
  const reached = new Set(trace.flatMap((t) => stepMeta(t).phases));
  // After a fresh event the latest step is the detection; highlight the active phase.
  const lastPhases = trace.length ? stepMeta(trace[trace.length - 1]).phases : [];
  const active = lastPhases[lastPhases.length - 1];
  return (
    <ol aria-label="Agent workflow phases" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {PHASES.map((p, i) => {
        const done = reached.has(p);
        const isActive = p === active && status !== "monitoring";
        return (
          <li
            key={p}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
              isActive ? "border-fresh bg-fresh text-white" : done ? "border-fresh/30 bg-fresh-50 text-fresh" : "border-border bg-white text-slate-400",
            )}
          >
            <span className="num text-xs opacity-70">{i + 1}</span>
            {p}
            {done && !isActive && <CheckCircle2 className="ml-auto h-4 w-4" aria-label="reached" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ================================================================== console */

function OperatorConsole({
  batch,
  busy,
  liveAgentAvailable,
  customEvents,
  onEvent,
  onInvestigate,
  onDecide,
  onReset,
}: {
  batch: BatchState;
  busy: string | null;
  liveAgentAvailable: boolean;
  customEvents: boolean;
  onEvent: (req: EventRequest) => void;
  onInvestigate: (mode: AgentInvestigationMode) => void;
  onDecide: (approve: boolean) => void;
  onReset?: () => void;
}) {
  const [event, setEvent] = useState<EventRequest>(DEFAULT_EVENT_REQUEST);
  const [mode, setMode] = useState<AgentInvestigationMode>("deterministic");
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);
  const parsedEvent = EventRequestSchema.safeParse(event);
  const proposal = ChannelOptionSchema.safeParse(batch.proposal);
  const st = statusStyle(batch.status);

  const canInvestigate = batch.status === "event_detected";
  const canDecide = batch.status === "awaiting_approval" && proposal.success;

  const numField = (key: "temperature_c" | "duration_hours" | "delay_hours", label: string, unit: string, min: number, max: number) => (
    <div className="space-y-1">
      <Label htmlFor={`ev-${key}`}>
        {label} <span className="font-normal text-slate-500">({unit})</span>
      </Label>
      <Input
        id={`ev-${key}`}
        type="number"
        min={min}
        max={max}
        step="any"
        value={Number.isNaN(event[key]) ? "" : event[key]}
        disabled={!customEvents}
        aria-invalid={!parsedEvent.success && parsedEvent.error.issues.some((i) => i.path[0] === key)}
        onChange={(e) => setEvent({ ...event, [key]: e.target.value === "" ? NaN : Number(e.target.value) })}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Operator console</CardTitle>
          <Badge variant={st.variant} data-testid="batch-status">
            {st.label}
          </Badge>
        </div>
        <CardDescription>Each button calls the backend; the response is the new persisted batch state.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 1. Event */}
        <section aria-labelledby="step-event">
          <h4 id="step-event" className="mb-2 flex items-center gap-2 text-sm font-semibold text-forest">
            <StepNo n={1} /> Inject disruption
            <InfoTip>Events are incremental exposures. A new event invalidates any pending proposal and restarts the exception workflow.</InfoTip>
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {numField("temperature_c", "Temp", "°C", 5, 50)}
            {numField("duration_hours", "Exposure", "h", 0.1, 72)}
            {numField("delay_hours", "Delay", "h", 0, 72)}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-[#b4483f]"
              checked={event.safety_hold}
              disabled={!customEvents}
              onChange={(e) => setEvent({ ...event, safety_hold: e.target.checked })}
            />
            Raise food-safety hold
          </label>
          {!customEvents && <p className="mt-1 text-xs text-slate-500">Demo data replays the recorded default event; connect the backend to edit it.</p>}
          {!parsedEvent.success && <p className="mt-1 text-sm text-unsafe">{parsedEvent.error.issues[0]?.message}</p>}
          <Button className="mt-3 w-full" variant="outline" disabled={!!busy || !parsedEvent.success} onClick={() => parsedEvent.success && onEvent(parsedEvent.data)}>
            <ThermometerSun /> {busy === "event" ? "Sending event…" : "Inject disruption"}
          </Button>
        </section>

        {/* 2. Investigate */}
        <section aria-labelledby="step-investigate">
          <h4 id="step-investigate" className="mb-2 flex items-center gap-2 text-sm font-semibold text-forest">
            <StepNo n={2} /> Agent investigation
          </h4>
          <Label htmlFor="agent-mode" className="sr-only">
            Agent mode
          </Label>
          <Select id="agent-mode" value={mode} onChange={(e) => setMode(e.target.value as AgentInvestigationMode)}>
            <option value="deterministic">Deterministic orchestrator (fallback)</option>
            <option value="live" disabled={!liveAgentAvailable}>
              Live LLM agent {liveAgentAvailable ? "" : "(not configured)"}
            </option>
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            {mode === "live"
              ? "The language model chooses which tools to call; the runtime enforces order, budget and policy. Failures never fall back silently."
              : "Fixed tool sequence for reliability and comparison. Same tools, same policy engine."}
          </p>
          <Button className="mt-3 w-full" variant="fresh" disabled={!!busy || !canInvestigate} onClick={() => onInvestigate(mode)}>
            <Bot /> {busy === "investigate" ? "Agent investigating…" : "Run agent investigation"}
          </Button>
          {!canInvestigate && batch.status !== "awaiting_approval" && <p className="mt-1 text-xs text-slate-500">Available after a disruption is detected.</p>}
        </section>

        {/* 3. Decide */}
        <section aria-labelledby="step-decide">
          <h4 id="step-decide" className="mb-2 flex items-center gap-2 text-sm font-semibold text-forest">
            <StepNo n={3} /> Human approval
          </h4>
          {canDecide && proposal.success ? (
            <p className="mb-3 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
              Proposal: move {formatKg(batch.quantity_kg)} from <strong>{batch.destination}</strong> to <strong>{proposal.data.id}</strong>.
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-500">Approval opens only when the agent has a policy-checked proposal.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!!busy || !canDecide} onClick={() => setConfirm("reject")}>
              <XCircle /> Reject
            </Button>
            <Button disabled={!!busy || !canDecide} onClick={() => setConfirm("approve")}>
              <UserCheck /> Approve
            </Button>
          </div>
        </section>

        {onReset && (
          <Button variant="ghost" className="w-full" disabled={!!busy} onClick={onReset}>
            <RotateCcw /> Reset demo journey
          </Button>
        )}
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "approve" ? "Approve destination change?" : "Reject the proposal?"}</DialogTitle>
            <DialogDescription>
              {confirm === "approve" && proposal.success
                ? `FreshFlow will re-check feasibility, change the destination from ${batch.destination} to ${proposal.data.id} in persistent state, and resume monitoring. No real transport order is placed in the MVP.`
                : "The destination stays unchanged and the batch moves to manual review."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Approving against batch version <span className="num font-semibold">{batch.version}</span>. If the batch changed meanwhile, the backend refuses (HTTP 409) and nothing executes.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === "approve" ? "default" : "danger"}
              onClick={() => {
                const approve = confirm === "approve";
                setConfirm(null);
                onDecide(approve);
              }}
            >
              {confirm === "approve" ? "Approve and execute" : "Reject proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StepNo({ n }: { n: number }) {
  return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest text-xs font-bold text-white">{n}</span>;
}

/* ================================================================== shipment state */

function ShipmentState({ batch }: { batch: BatchState }) {
  const exec = [...batch.trace].reverse().find((t) => t.tool === "execute_destination_change");
  const original = (exec?.inputs.previous_destination as string | undefined) ?? (batch.trace.length ? undefined : batch.destination);
  const changed = Boolean(exec);
  const rows: [string, React.ReactNode][] = [
    ["Quantity", formatKg(batch.quantity_kg)],
    ...(batch.quality_grade ? ([["Quality grade", batch.quality_grade]] as [string, React.ReactNode][]) : []),
    ...(batch.current_location ? ([["Current location", batch.current_location]] as [string, React.ReactNode][]) : []),
    ...(batch.elapsed_hours != null ? ([["Elapsed since dispatch", formatHours(batch.elapsed_hours)]] as [string, React.ReactNode][]) : []),
    ["RSL at plan", formatHours(batch.initial_rsl_hours)],
    ["Current RSL estimate", formatHours(batch.rsl_hours)],
    ["Conservative RSL (lower)", formatHours(batch.rsl_lower_hours)],
    ["Route delay", formatHours(batch.delay_hours)],
    ["Food-safety hold", batch.safety_hold ? <Badge variant="unsafe">Hold</Badge> : "None"],
    ["Monitoring", batch.monitoring ? "Active" : "Paused"],
    ["Agent mode (last run)", batch.agent_mode ?? "—"],
    ["State version", <span className="num">{batch.version}</span>],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Shipment state</CardTitle>
          <ProvenanceTag category={batch.evidence_category} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("mb-4 rounded-md p-3", changed ? "bg-fresh-50" : "bg-slate-50")} data-testid="destination">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
          {changed && original ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-base">
              <span className="text-slate-500 line-through">{original}</span>
              <ChevronsRight className="h-4 w-4 text-fresh" aria-label="changed to" />
              <span className="font-semibold text-forest">{batch.destination}</span>
            </p>
          ) : (
            <p className="mt-1 text-base font-semibold text-forest">{batch.destination}</p>
          )}
          {changed && <p className="mt-1 text-xs text-fresh">Changed in persistent state by an approved agent action.</p>}
        </div>
        <dl className="space-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-500">{k}</dt>
              <dd className="num text-right font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        {batch.event && (
          <div className="mt-4 rounded-md border border-risk-100 bg-risk-50 p-3 text-sm text-risk-dark">
            <p className="font-semibold">Latest event</p>
            <p>
              {num1(batch.event.temperature_c)} °C for {num1(batch.event.duration_hours)} h · {num1(batch.event.delay_hours)} h delay
              {batch.event.safety_hold ? " · safety hold" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================== options & policy */


function DecisionPanel({ batch }: { batch: BatchState }) {
  const rank = latestOf(batch.trace, OPTIMIZER_TOOLS);
  const policy = latestOf(batch.trace, POLICY_TOOLS);
  const exec = latestOf(batch.trace, ["execute_destination_change"]);
  const options: ChannelOption[] = useMemo(() => {
    const parsed = ChannelOptionSchema.array().safeParse(rank?.result.options);
    return parsed.success ? parsed.data : [];
  }, [rank]);
  const proposed = ChannelOptionSchema.safeParse(batch.proposal);
  const chosenId = proposed.success ? proposed.data.id : (policy?.result.destination as string | undefined);

  if (!rank) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alternatives & expected economics</CardTitle>
          <CardDescription>Appears once the agent has ranked the feasible buyers, routes and channels.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="No investigation yet" icon={Cpu}>
            Inject a disruption and run the agent investigation to see options, constraints and the proposal.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Alternatives & expected economics</CardTitle>
          <div className="flex gap-2">
            <ProvenanceTag category="SYNTHETIC" />
          </div>
        </div>
        <CardDescription>
          Output of <code className="font-mono text-[13px]">{rank.tool}</code> (trace #{rank.sequence}). Feasibility uses the conservative arrival shelf
          life; net proceeds = quantity × (price − transport − rescue cost).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Channel</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Travel</TH>
              <TH className="text-right">Arrival RSL / buyer min.</TH>
              <TH className="text-right">Net proceeds</TH>
              <TH>Constraints</TH>
            </TR>
          </THead>
          <TBody>
            {options.map((o) => {
              const isChosen = o.id === chosenId;
              return (
                <TR key={o.id} className={cn(isChosen && "bg-fresh-50/70")}>
                  <TD className="font-medium text-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      {o.id}
                      {o.id === (exec?.inputs.previous_destination ?? batch.destination) && !isChosen && <Badge variant="outline">current plan</Badge>}
                      {isChosen && <Badge variant="fresh">{exec ? "executed" : "proposed"}</Badge>}
                    </div>
                  </TD>
                  <TD className="num whitespace-nowrap text-right">₹{o.price_inr_kg.toFixed(0)}/kg</TD>
                  <TD className="num text-right">{formatHours(o.travel_hours)}</TD>
                  <TD className="num whitespace-nowrap text-right">
                    <span className={cn("font-medium", o.arrival_rsl_lower_hours < o.minimum_rsl_hours ? "text-unsafe" : "text-slate-800")}>
                      {formatHours(o.arrival_rsl_lower_hours)}
                    </span>
                    <span className="text-slate-500"> / {formatHours(o.minimum_rsl_hours, 0)}</span>
                  </TD>
                  <TD className="num text-right">
                    <span className={cn(!o.feasible && "text-slate-400 line-through")}>{formatINR(o.net_proceeds_inr)}</span>
                  </TD>
                  <TD>
                    {o.feasible ? (
                      <Badge variant="fresh">
                        <CheckCircle2 className="h-3 w-3" /> Feasible
                      </Badge>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {o.reasons.map((r) => (
                          <Badge key={r} variant="unsafe" className="whitespace-normal rounded-md leading-snug">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-slate-500">Struck-through proceeds are unattainable: the buyer would reject the lot. Prices and capacities are synthetic, not live quotes.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-forest">
              <Gavel className="h-4 w-4" aria-hidden /> Policy engine
            </p>
            {policy ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li>
                  Destination checked: <strong>{String(policy.result.destination)}</strong>
                </li>
                <li>Allowed: {policy.result.allowed ? <span className="font-medium text-fresh">yes</span> : <span className="font-medium text-unsafe">no</span>}</li>
                <li>Human approval required: {policy.result.requires_human_approval ? "yes" : "no"}</li>
                {Array.isArray(policy.result.reasons) && policy.result.reasons.length > 0 && <li>Reasons: {(policy.result.reasons as string[]).join("; ")}</li>}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No feasible destination reached the policy check.</p>
            )}
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-forest">
              <FlaskConical className="h-4 w-4" aria-hidden /> Economic impact
            </p>
            {exec ? (
              <>
                <p className="num mt-2 text-2xl font-semibold text-fresh">{formatINR(exec.result.estimated_incremental_net_proceeds_inr as number, { signed: true })}</p>
                <p className="text-sm text-slate-600">Estimated incremental net proceeds vs the original plan (backend).</p>
                <p className="mt-1 text-xs text-slate-500">{String(exec.result.scope ?? "")}</p>
                <div className="mt-2">
                  <ProvenanceTag category="SIMULATED RESULT" />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Reported by the backend once an approved action executes.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== timeline */

function TraceTimeline({ batch, demo }: { batch: BatchState; demo: boolean }) {
  const total = batch.trace.length;
  const [visible, setVisible] = useState(total);
  const [playing, setPlaying] = useState(false);
  const prevTotal = useRef(total);
  const prevId = useRef(batch.id);

  // New entries from an action animate in; a reset (shorter trace) shows everything.
  useEffect(() => {
    if (prevId.current !== batch.id || total < prevTotal.current) {
      setVisible(total);
      setPlaying(false);
    } else if (total > prevTotal.current) {
      setVisible(prevTotal.current);
      setPlaying(true);
    }
    prevTotal.current = total;
    prevId.current = batch.id;
  }, [total, batch.id]);

  useEffect(() => {
    if (!playing) return;
    if (visible >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setVisible((v) => Math.min(total, v + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, visible, total]);

  const kindsPresent = new Set(batch.trace.map((t) => stepMeta(t).kind));
  const shown = batch.trace.slice(0, visible);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Decision trace</CardTitle>
            <CardDescription>
              {demo ? "Recorded backend trace (shared fixture), replayed." : "Live backend trace."} Step {visible} of {total}.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Replay controls">
            <Button variant="outline" size="icon" aria-label="First step" onClick={() => { setPlaying(false); setVisible(Math.min(1, total)); }}>
              <SkipBack />
            </Button>
            <Button variant="outline" size="icon" aria-label="Previous step" onClick={() => { setPlaying(false); setVisible((v) => Math.max(1, v - 1)); }}>
              <ChevronsLeft />
            </Button>
            <Button
              variant="fresh"
              size="icon"
              aria-label={playing ? "Pause replay" : "Play replay"}
              onClick={() => {
                if (!playing && visible >= total) setVisible(Math.min(1, total));
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Next step" onClick={() => { setPlaying(false); setVisible((v) => Math.min(total, v + 1)); }}>
              <ChevronsRight />
            </Button>
            <Button variant="outline" size="icon" aria-label="Show all steps" onClick={() => { setPlaying(false); setVisible(total); }}>
              <SkipForward />
            </Button>
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Step type legend">
          {(Object.keys(KIND_STYLE) as StepKind[])
            .filter((k) => kindsPresent.has(k) || ["prediction", "tool", "optimization", "human", "execution"].includes(k))
            .map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <li key={k} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", KIND_STYLE[k].chip)}>
                  <Icon className="h-3 w-3" aria-hidden /> {KIND_STYLE[k].name}
                </li>
              );
            })}
          <li className="inline-flex items-center gap-1 rounded-full border border-dashed border-violet-300 px-2 py-0.5 text-xs font-medium text-violet-800">
            <FlaskConical className="h-3 w-3" aria-hidden /> Simulated outcome
          </li>
        </ul>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3" aria-live="polite" aria-label="Trace steps">
          {shown.map((entry, i) => (
            <TraceStep key={entry.sequence} entry={entry} latest={i === shown.length - 1 && playing} />
          ))}
        </ol>
        {visible < total && <p className="mt-3 text-center text-sm text-slate-500">{total - visible} more step(s) — press play or next.</p>}
      </CardContent>
    </Card>
  );
}

function TraceStep({ entry, latest }: { entry: TraceEntry; latest: boolean }) {
  const meta = stepMeta(entry);
  const style = KIND_STYLE[meta.kind];
  const Icon = KIND_ICON[meta.kind];
  const simulated = isSimulatedOutcome(entry);
  return (
    <li
      className={cn(
        "rounded-md border border-border border-l-4 bg-white p-3 transition-shadow animate-in fade-in-0 slide-in-from-bottom-1",
        style.accent,
        latest && "shadow-md ring-1 ring-fresh/30",
      )}
      data-testid="trace-step"
      data-kind={meta.kind}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", style.chip)} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-xs font-semibold text-slate-400">#{entry.sequence}</span>
            <span className={cn("text-sm font-semibold text-slate-900", meta.kind !== "plan" && meta.kind !== "event" && meta.kind !== "human" && "font-mono")}>{meta.label}</span>
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", style.chip)}>{style.name}</span>
            {simulated && (
              <span className="inline-flex items-center gap-1 rounded border border-dashed border-violet-300 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                <FlaskConical className="h-3 w-3" aria-hidden /> Simulated outcome
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {meta.actor} · {meta.phases.join(" → ") || "—"} · <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{summarize(entry)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{meta.explain}</p>
          <JsonView value={{ inputs: entry.inputs, result: entry.result }} label="Tool inputs & result" />
        </div>
      </div>
    </li>
  );
}

/** One-line human summary of a backend trace result (presentation only). */
function summarize(e: TraceEntry): string {
  const r = e.result as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const i = e.inputs as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const h = (v: unknown) => (typeof v === "number" ? formatHours(v) : "—");
  switch (e.tool) {
    case "seed":
      return String(r.scenario ?? "Batch seeded.");
    case "sense_event":
      return `${num1(i.temperature_c)} °C for ${num1(i.duration_hours)} h, ${num1(i.delay_hours)} h route delay${i.safety_hold ? ", safety hold" : ""} → RSL ${h(r.rsl_hours)} (conservative ${h(r.rsl_lower_hours)}).`;
    case "inspect_batch":
    case "get_batch_state":
      if (r.destination === undefined && r.morning_destination !== undefined) return `Morning plan loaded: ${r.morning_destination} (${r.scope ?? "batch state"}).`;
      return `Destination ${r.destination}, ${formatKg(r.quantity_kg)}${r.current_location ? `, at ${r.current_location}` : ""}, safety hold ${r.safety_hold ? "raised" : "none"}.`;
    case "predict_freshness":
    case "predict_remaining_shelf_life":
      return `RSL ${h(r.rsl_hours)}, conservative lower bound ${h(r.rsl_lower_hours)}. ${r.interpretation ?? ""}`;
    case "check_buyers_routes":
      return `${Array.isArray(r.buyers) ? r.buyers.length : 0} buyers/channels read; retailer route delay ${h(r.retailer_delay_hours)}. ${r.source ?? ""}`;
    case "get_buyer_options": {
      const unavailable = Array.isArray(r.unavailable_buyers) && r.unavailable_buyers.length ? ` Unavailable: ${r.unavailable_buyers.join(", ")}.` : "";
      return `${Array.isArray(r.buyers) ? r.buyers.length : 0} buyer quotes read; retailer delay ${h(r.retailer_delay_hours)}.${unavailable} ${r.source ?? ""}`;
    }
    case "check_buyer_capacity":
      return Object.entries((r.available_capacity_kg ?? {}) as Record<string, number>)
        .map(([k, v]) => `${k} ${formatKg(v)}`)
        .join(" · ");
    case "calculate_route_eta":
      return (Array.isArray(r.routes) ? r.routes : [])
        .map((x: { destination: string; reachable: boolean; travel_hours: number }) => `${x.destination}: ${x.reachable ? formatHours(x.travel_hours) : "unreachable"}`)
        .join(" · ");
    case "optimize_destination":
    case "rank_options": {
      const opts = Array.isArray(r.options) ? r.options : [];
      const feasible = opts.filter((o: ChannelOption) => o.feasible).map((o: ChannelOption) => `${o.id} (${formatINR(o.net_proceeds_inr)})`);
      const blocked = opts.filter((o: ChannelOption) => !o.feasible).map((o: ChannelOption) => o.id);
      return `Feasible: ${feasible.join(" > ") || "none"}. Blocked: ${blocked.join(", ") || "none"}.`;
    }
    case "check_policy":
    case "validate_constraints":
      return `${r.destination}: ${r.allowed ? "allowed" : "blocked"}${r.requires_human_approval ? ", human approval required" : ""}.`;
    case "propose_action":
    case "request_human_approval":
      return `Proposal persisted: switch to ${r.destination}. Status → ${r.status}.`;
    case "human_approved":
      return `Operator approved ${r.destination}.`;
    case "human_rejected":
      return `Operator rejected; destination stays ${r.destination}.`;
    case "execute_destination_change":
      return `Destination ${i.previous_destination} → ${r.destination}. Estimated incremental net proceeds ${formatINR(r.estimated_incremental_net_proceeds_inr, { signed: true })}.`;
    case "verify":
      return `Destination persisted: ${r.destination_persisted_on_commit}. Monitoring resumed: ${r.monitoring_resumed ? "yes" : "no"}. Physical delivery verified: ${r.physical_delivery_verified ? "yes" : "no"}.`;
    case "execute_reroute":
      return `Reroute command from ${i.origin ?? "current location"} to ${r.destination}; approval enforced: ${r.approval_enforced ? "yes" : "no"}.`;
    case "verify_execution":
      return `Persistent state verified: ${r.persistent_state_verified_on_commit ? "yes" : "no"}. Buyer acceptance verified: ${r.buyer_acceptance_verified ? "yes" : "no"}.`;
    case "no_intervention_required":
      return `Keep ${r.destination}: ${r.reason ?? "current plan is the best feasible option"} (net proceeds ${formatINR(r.net_proceeds_inr)}).`;
    case "demo_reset":
      return `Demo batch re-seeded (was version ${r.previous_version}, destination ${r.previous_destination}).`;
    case "dispatch_blocked":
      return String(r.reason ?? "No dispatch allocation.");
    case "escalate":
      return String(r.reason ?? "Escalated for human review.");
    case "tool_rejected":
      return `${i.name ?? "Tool"} rejected: ${r.error ?? "invalid call"}.`;
    case "investigation_failed":
      return `Mode ${i.mode ?? "?"} failed (${r.error_type ?? "error"}). No action executed.`;
    default:
      return Object.keys(r).length ? JSON.stringify(r).slice(0, 160) : "Recorded.";
  }
}


/* ================================================================== stored-run decision replay */

function RunDecisionReplay({ runId, batchId }: { runId: string; batchId: string }) {
  const client = useClient();
  const initial = useAsync(() => client.getRunDecision(runId, batchId), [client, runId, batchId]);
  const [decision, setDecision] = useState<RunDecision | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);

  useEffect(() => {
    if (initial.data) setDecision(initial.data);
  }, [initial.data]);

  const act = async (label: string, fn: () => Promise<RunDecision>) => {
    setBusy(label);
    setActionError(null);
    try {
      setDecision(await fn());
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const batch = decision?.state;
  const proposal = ChannelOptionSchema.safeParse(batch?.proposal);
  const canDecide = batch?.status === "awaiting_approval" && proposal.success;
  const noChange = proposal.success && batch && proposal.data.id === batch.destination;
  const st = batch ? statusStyle(batch.status) : null;

  return (
    <>
      <PageHeader
        eyebrow="Agentic decision replay · stored simulation run"
        title={`Batch ${batchId} · run decision`}
        description={
          <>
            Interactive replay of this batch inside simulation run <code className="font-mono text-[14px]">{runId.slice(0, 8)}</code>. {decision?.scope ?? ""}
          </>
        }
        actions={
          <>
            <DemoDataBadge />
            <Button asChild variant="outline" size="sm">
              <Link to="/advanced/tower">Back to control tower</Link>
            </Button>
          </>
        }
      />
      {initial.error && !decision ? <ErrorPanel error={initial.error} onRetry={initial.reload} /> : null}
      {!decision && initial.loading ? <LoadingBlock label="Loading decision" /> : null}
      {decision && batch && st && (
        <>
          <PhaseRail trace={batch.trace} status={batch.status} />
          {actionError ? <ErrorPanel className="mt-4" error={actionError} onRetry={initial.reload} /> : null}
          <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>Approval gate</CardTitle>
                    <Badge variant={st.variant} data-testid="batch-status">
                      {st.label}
                    </Badge>
                  </div>
                  <CardDescription>
                    The agent has already investigated this batch with tool calls. Approving or rejecting persists a decision for this replay only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canDecide && proposal.success ? (
                    <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">
                      {noChange ? (
                        <>
                          Proposal: <strong>keep {proposal.data.id}</strong> — no change to the current plan.
                        </>
                      ) : (
                        <>
                          Proposal: move {formatKg(batch.quantity_kg)} from <strong>{batch.destination}</strong> to <strong>{proposal.data.id}</strong>.
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      {batch.trace.at(-1)?.tool === "no_intervention_required"
                        ? `No intervention required — the agent checked the alternatives and keeping ${batch.destination} is the best feasible option.`
                        : "No proposal is awaiting approval."}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" disabled={!!busy || !canDecide} onClick={() => setConfirm("reject")}>
                      <XCircle /> Reject
                    </Button>
                    <Button disabled={!!busy || !canDecide} onClick={() => setConfirm("approve")}>
                      <UserCheck /> Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <ShipmentState batch={batch} />
            </div>
            <div className="min-w-0 space-y-6">
              <DecisionPanel batch={batch} />
              <SimulatedOutcome outcome={decision.simulated_outcome} />
              <TraceTimeline batch={batch} demo={client.mode === "demo"} />
            </div>
          </div>
          <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{confirm === "approve" ? "Approve the proposal?" : "Reject the proposal?"}</DialogTitle>
                <DialogDescription>
                  Recorded against state version {batch.version}. The run's experiment metrics are immutable and will not change.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant={confirm === "approve" ? "default" : "danger"}
                  onClick={() => {
                    const approve = confirm === "approve";
                    setConfirm(null);
                    void act(approve ? "approve" : "reject", () =>
                      approve
                        ? client.approveRunDecision(runId, batchId, { expected_version: batch.version })
                        : client.rejectRunDecision(runId, batchId, { expected_version: batch.version }),
                    );
                  }}
                >
                  {confirm === "approve" ? "Approve" : "Reject proposal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

/** The immutable experiment record for this batch (backend simulated_outcome). */
function SimulatedOutcome({ outcome }: { outcome: Record<string, unknown> }) {
  const n = (k: string) => (typeof outcome[k] === "number" ? (outcome[k] as number) : null);
  const yes = (k: string) => (outcome[k] === true ? "yes" : outcome[k] === false ? "no" : "—");
  const rows: [string, React.ReactNode][] = [
    ["Morning destination", String(outcome.morning_destination ?? "—")],
    ["Final destination", String(outcome.destination ?? "—")],
    ["Sold / spoiled", `${formatKg(n("sold_kg"))} / ${formatKg(n("spoiled_kg"))}`],
    ["Revenue", formatINR(n("revenue_inr"))],
    ["Realised price", n("realized_unit_price_inr") == null ? "—" : `₹${n("realized_unit_price_inr")!.toFixed(2)}/kg`],
    ["Arrival RSL (realised)", formatHours(n("realized_arrival_rsl_hours"))],
    ["Buyer accepted", yes("buyer_acceptance")],
    ["Rescue attempted / rescued", `${yes("rescue_attempt")} / ${yes("rescued")}`],
    ["On time", yes("on_time")],
    ["Solver status", String(outcome.solver_status ?? "—")],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Simulated outcome in the run</CardTitle>
          <ProvenanceTag category="SIMULATED RESULT" />
        </div>
        <CardDescription>What happened to this batch in the stored experiment. Approving here does not rewrite these numbers.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-500">{k}</dt>
              <dd className="num text-right font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <JsonView value={outcome} label="Full simulated outcome & ledger" />
      </CardContent>
    </Card>
  );
}

/** Event values arrive as raw floats from the simulator; show one decimal. */
function num1(v: unknown): string {
  return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v ?? "—");
}
