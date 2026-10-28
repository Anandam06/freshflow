import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, Loader2, Play, RotateCcw, Save, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Skeleton } from "@/components/ui/input";
import { ErrorPanel } from "@/components/common";
import { MumbaiMap, routeGeometry, type MapRoute } from "@/components/map/MumbaiMap";
import {
  AgentTimeline,
  BuyerProfitChart,
  DecisionCard,
  DetailsTable,
  FreshnessChart,
  HeadlineResults,
  ProduceImage,
  RiskPill,
  agentOptions,
  hoursText,
} from "@/components/shipment";
import { useClient } from "@/services/ClientContext";
import { useAsync } from "@/services/useAsync";
import { usePlayground, useResultIsCurrent } from "@/state/PlaygroundContext";
import { DISRUPTION_TYPES, type DisruptionType, type Network, type Severity } from "@/types/shipment";
import { formatINR, formatKg } from "@/lib/format";
import { saveBlob } from "@/lib/download";
import { cn } from "@/lib/utils";
import { clockAfter } from "@/pages/home/HomePage";

const STEPS = ["Choose produce", "Choose route", "Choose disruption", "Run simulation", "See what happened"];

export default function PlaygroundPage() {
  const [params, setParams] = useSearchParams();
  const pg = usePlayground();
  const step = Math.min(5, Math.max(1, Number(params.get("step")) || 1));
  const go = (n: number) => {
    setParams(n === 5 && pg.current ? { step: "5", shipment: pg.current.id } : { step: String(n) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const shared = params.get("shipment");
  const [loadingShared, setLoadingShared] = useState(Boolean(shared));
  useEffect(() => {
    if (!shared || pg.current?.id === shared) {
      setLoadingShared(false);
      return;
    }
    setLoadingShared(true);
    void pg.load(shared).finally(() => setLoadingShared(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);
  const canSeeResults = Boolean(pg.current);
  useEffect(() => {
    if (loadingShared) return;
    if (step === 5 && !canSeeResults) go(4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canSeeResults, loadingShared]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-fresh">Scenario playground</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-forest">Test a shipment in five steps</h1>
      </header>
      <Stepper step={step} onGo={go} canSeeResults={canSeeResults} />
      {pg.networkError ? <ErrorPanel error={pg.networkError} /> : null}
      {!pg.network || loadingShared ? (
        <Skeleton className="h-[480px] rounded-2xl" />
      ) : (
        <div className={cn("grid gap-6", step < 5 && "xl:grid-cols-[1fr_340px]")}>
          <div className="min-w-0">
            {step === 1 && <StepProduce network={pg.network} />}
            {step === 2 && <StepRoute network={pg.network} />}
            {step === 3 && <StepDisruption network={pg.network} />}
            {step === 4 && <StepRun network={pg.network} onDone={() => go(5)} />}
            {step === 5 && <StepResults network={pg.network} onRetry={() => go(3)} />}
          </div>
          {step < 5 && <Summary network={pg.network} step={step} onGo={go} />}
        </div>
      )}
    </div>
  );
}

function Stepper({ step, onGo, canSeeResults }: { step: number; onGo: (n: number) => void; canSeeResults: boolean }) {
  return (
    <nav aria-label="Progress">
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          const disabled = n === 5 && !canSeeResults;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => !disabled && onGo(n)}
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:flex-row sm:items-center",
                  active ? "border-fresh bg-fresh-50" : done ? "border-fresh/30 bg-white" : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold", active ? "bg-fresh text-white" : done ? "bg-fresh/15 text-fresh" : "bg-slate-100 text-slate-500")}>
                  {done ? <Check className="h-5 w-5" /> : n}
                </span>
                <span className={cn("hidden text-[15px] font-semibold md:block", active ? "text-forest" : "text-slate-600")}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ================================================================ step 1 */

function StepProduce({ network }: { network: Network }) {
  const { selection, setSelection } = usePlayground();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "fruit" | "vegetable">("all");
  const list = network.commodities.filter((c) => (cat === "all" || c.category === cat) && c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Panel title="Which produce are you shipping?" subtitle="Each item loses freshness at its own speed.">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search produce" placeholder="Search produce" className="h-12 pl-10 text-base" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="group" aria-label="Category" className="flex gap-2">
          {(["all", "fruit", "vegetable"] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cn("h-12 rounded-full border-2 px-5 text-base font-semibold capitalize", cat === c ? "border-forest bg-forest text-white" : "border-slate-200 bg-white text-slate-700")}>
              {c === "all" ? "All" : c === "fruit" ? "Fruits" : "Vegetables"}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-base text-slate-600">No produce matches “{q}”.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {list.map((c) => {
            const selected = selection.commodity_id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelection({ commodity_id: c.id })}
                className={cn("group flex flex-col items-center gap-2 rounded-2xl border-2 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md", selected ? "border-fresh shadow-md ring-4 ring-fresh/15" : "border-slate-200")}
              >
                <ProduceImage id={c.id} name={c.name} size={88} className="transition-transform group-hover:scale-105" />
                <span className="text-lg font-semibold text-forest">{c.name}</span>
                <RiskPill shelfLifeHours={c.shelf_life_hours_20c} />
                <span className="text-sm text-slate-500">Lasts ~{Math.max(1, Math.round(c.shelf_life_hours_20c / 24))} {Math.round(c.shelf_life_hours_20c / 24) <= 1 ? "day" : "days"} at 20 °C</span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ================================================================ step 2 */

function StepRoute({ network }: { network: Network }) {
  const { selection, setSelection } = usePlayground();
  const commodity = network.commodities.find((c) => c.id === selection.commodity_id)!;
  const key = `${selection.origin_id}>${selection.buyer_id}`;
  const route = network.routes[key];
  const traffic = selection.settings.traffic_multiplier ?? network.settings.traffic_multiplier;
  const channels = ["retail", "horeca", "wholesale", "processor"];
  return (
    <Panel title="Where does it start, and who is buying?" subtitle="Pick a collection hub and the buyer you promised this shipment to. You can also click a buyer on the map.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-base font-semibold text-forest">Collection hub</legend>
            <div className="grid gap-2">
              {network.hubs.map((h) => (
                <ChoiceCard key={h.id} selected={selection.origin_id === h.id} onClick={() => setSelection({ origin_id: h.id })} title={h.name} subtitle="APMC market" />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-base font-semibold text-forest">Buyer</legend>
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {channels.map((ch) => (
                <div key={ch}>
                  <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{String(network.channels[ch]?.label ?? ch)}</p>
                  <div className="grid gap-2">
                    {network.buyers
                      .filter((b) => b.channel === ch)
                      .map((b) => {
                        const t = network.buyer_terms[b.id];
                        const needs = Math.max(2, t.min_rsl_fraction * commodity.shelf_life_hours_20c);
                        return (
                          <ChoiceCard
                            key={b.id}
                            selected={selection.buyer_id === b.id}
                            onClick={() => setSelection({ buyer_id: b.id })}
                            title={b.name}
                            subtitle={`Needs ≥ ${hoursText(needs)} shelf life · takes up to ${formatKg(t.capacity_kg)} · grades ${t.accepted_grades}`}
                          />
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qty" className="text-base">
                Quantity (kg)
              </Label>
              <Input id="qty" type="number" min={50} max={10000} step={50} className="mt-1 h-12 text-base" value={selection.quantity_kg} onChange={(e) => setSelection({ quantity_kg: Math.max(1, Math.min(10000, Number(e.target.value) || 0)) })} />
            </div>
            <div>
              <Label htmlFor="grade" className="text-base">
                Quality grade
              </Label>
              <Select id="grade" className="mt-1 h-12 text-base" value={selection.quality_grade} onChange={(e) => setSelection({ quality_grade: e.target.value as "A" | "B" | "C" })}>
                <option value="A">A — best</option>
                <option value="B">B — good</option>
                <option value="C">C — processing grade</option>
              </Select>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <MumbaiMap
            network={network}
            height={560}
            originId={selection.origin_id}
            committedBuyerId={selection.buyer_id}
            onSelectBuyer={(id) => setSelection({ buyer_id: id })}
            onSelectHub={(id) => setSelection({ origin_id: id })}
            routes={route ? [{ key, kind: "preview", positions: routeGeometry(network, key), label: "Selected route" }] : []}
          />
          {route && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Road distance" value={`${route.distance_km.toFixed(1)} km`} note="OpenStreetMap" />
              <Stat label="Empty-road time" value={hoursText(route.freeflow_minutes / 60)} note="OSRM estimate" />
              <Stat label="Usual travel time" value={hoursText((route.freeflow_minutes / 60) * traffic)} note={`× ${traffic} simulated city traffic`} />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ChoiceCard({ selected, onClick, title, subtitle }: { selected: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-left transition-colors", selected ? "border-fresh bg-fresh-50" : "border-slate-200 hover:border-slate-300")}>
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-fresh bg-fresh text-white" : "border-slate-300")}>{selected && <Check className="h-4 w-4" />}</span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-forest">{title}</span>
        <span className="block text-sm text-slate-600">{subtitle}</span>
      </span>
    </button>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-forest/10 bg-white p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="num text-xl font-bold text-forest">{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

/* ================================================================ step 3 */

const SETTING_LABELS: Record<string, { label: string; unit: string; step: number; help: string }> = {
  traffic_multiplier: { label: "Normal city traffic", unit: "× empty-road time", step: 0.1, help: "Base congestion before any Heavy Traffic event (simulated)." },
  temperature_shift_c: { label: "Weather temperature shift", unit: "°C", step: 0.5, help: "Added to the 20 °C reference before any heat event." },
  humidity_rh_percent: { label: "Humidity", unit: "% RH", step: 1, help: "Far from ~90% speeds up quality loss for sensitive produce." },
  buyer_availability: { label: "Buyer availability", unit: "probability", step: 0.05, help: "Chance each alternative buyer is open today." },
  market_price_factor: { label: "Market price level", unit: "× reference", step: 0.05, help: "Scales every buyer offer." },
  approval_delay_hours: { label: "Approval delay", unit: "hours", step: 0.25, help: "Time the truck waits while a person approves a diversion." },
  agent_cost_multiplier: { label: "Agent operating cost", unit: "× base", step: 0.5, help: "Scales FreshFlow's per-kg software and sensor cost." },
  initial_shelf_life_multiplier: { label: "Starting freshness", unit: "× normal", step: 0.05, help: "Shelf life left when produce reaches the hub." },
  prediction_error_hours: { label: "Prediction error", unit: "hours", step: 0.5, help: "Sensor/forecast uncertainty. FreshFlow plans on a safe (conservative) estimate." },
  seed: { label: "Random seed", unit: "", step: 1, help: "Same seed + same inputs = identical results." },
};

function StepDisruption({ network }: { network: Network }) {
  const { selection, setSelection } = usePlayground();
  const client = useClient();
  const health = useAsync(() => client.health(), [client]);
  const [advanced, setAdvanced] = useState(false);
  const toggle = (t: DisruptionType) => {
    const next = { ...selection.disruptions };
    if (next[t]) delete next[t];
    else next[t] = "medium";
    setSelection({ disruptions: next });
  };
  const setSeverity = (t: DisruptionType, s: Severity) => setSelection({ disruptions: { ...selection.disruptions, [t]: s } });
  return (
    <Panel title="What goes wrong on the way?" subtitle="Pick one or more problems and how bad they are. Pick none to see a normal day.">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {DISRUPTION_TYPES.map((t) => {
          const d = network.disruptions[t];
          const sev = selection.disruptions[t];
          const selected = Boolean(sev);
          return (
            <div key={t} className={cn("flex flex-col rounded-2xl border-2 bg-white p-4 transition-all", selected ? "border-amber-400 bg-amber-50/60 shadow-md" : "border-slate-200")}>
              <button type="button" aria-pressed={selected} onClick={() => toggle(t)} className="flex items-start gap-3 text-left">
                <img src={`/icons/${t}.png`} alt="" width={52} height={52} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold text-forest">{d.label}</span>
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", selected ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300")}>{selected && <Check className="h-4 w-4" />}</span>
                  </span>
                  <span className="mt-1 block text-[15px] text-slate-600">{d.explain}</span>
                </span>
              </button>
              {selected && (
                <div role="radiogroup" aria-label={`${d.label} severity`} className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-amber-200">
                  {(["low", "medium", "high"] as Severity[]).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={sev === s} onClick={() => setSeverity(t, s)} className={cn("h-10 rounded-lg text-sm font-semibold capitalize", sev === s ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-amber-50")}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
          <SlidersHorizontal className="h-5 w-5 text-forest" />
          <span className="flex-1 text-base font-semibold text-forest">Advanced settings</span>
          <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", advanced && "rotate-180")} />
        </button>
        {advanced && (
          <div className="border-t border-slate-100 p-5">
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {Object.entries(SETTING_LABELS).map(([key, meta]) => {
                const [lo, hi] = network.setting_bounds[key] ?? [0, 1];
                const value = selection.settings[key] ?? network.settings[key];
                return (
                  <div key={key}>
                    <Label htmlFor={`set-${key}`} className="text-[15px]">
                      {meta.label} <span className="font-normal text-slate-500">{meta.unit && `(${meta.unit})`}</span>
                    </Label>
                    <div className="mt-1 flex items-center gap-3">
                      {key !== "seed" && (
                        <input aria-hidden tabIndex={-1} type="range" min={lo} max={hi} step={meta.step} value={value} onChange={(e) => setSelection({ settings: { ...selection.settings, [key]: Number(e.target.value) } })} className="flex-1 accent-[#0f8a7e]" />
                      )}
                      <Input
                        id={`set-${key}`}
                        type="number"
                        min={lo}
                        max={hi}
                        step={meta.step}
                        value={value}
                        className={cn("h-10", key === "seed" ? "w-full" : "w-24")}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setSelection({ settings: { ...selection.settings, [key]: Math.min(hi, Math.max(lo, v)) } });
                        }}
                      />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{meta.help}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
              <Label htmlFor="agent-mode" className="text-[15px]">
                Agent
              </Label>
              <Select id="agent-mode" className="h-10 w-auto" value={selection.mode} onChange={(e) => setSelection({ mode: e.target.value as "deterministic" | "live" })}>
                <option value="live" disabled={!health.data?.live_agent_configured}>
                  Live AI agent{health.data?.llm_model ? ` (${health.data.llm_model})` : ""} {health.data?.live_agent_configured ? "" : "— not configured"}
                </option>
                <option value="deterministic">Deterministic agent (fixed tool sequence, no AI cost)</option>
              </Select>
              <Button variant="ghost" onClick={() => setSelection({ settings: {} })}>
                <RotateCcw /> Reset settings
              </Button>
            </div>
            <p className="mt-3 text-sm text-slate-500">Batches, days and repetitions belong to the 2,000-shipment fleet simulation — see Advanced Analysis → Fleet scenarios.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ================================================================ step 4 */

function StepRun({ network, onDone }: { network: Network; onDone: () => void }) {
  const pg = usePlayground();
  const s = pg.selection;
  const commodity = network.commodities.find((c) => c.id === s.commodity_id)!;
  const names = useNames(network);
  const disruptions = Object.entries(s.disruptions);
  return (
    <Panel title="Ready to test?" subtitle="FreshFlow will simulate this shipment four ways and let its agent react to the problems.">
      <div className="flex flex-col items-center gap-6 py-6 text-center">
        <ProduceImage id={commodity.id} name={commodity.name} size={120} />
        <p className="max-w-2xl text-xl text-slate-700">
          <strong className="text-forest">{formatKg(s.quantity_kg)} of {commodity.name}</strong> from <strong className="text-forest">{names[s.origin_id]}</strong> to{" "}
          <strong className="text-forest">{names[s.buyer_id]}</strong>
          {disruptions.length ? (
            <>
              , with <strong className="text-amber-700">{disruptions.map(([t, sev]) => `${network.disruptions[t].label.toLowerCase()} (${sev})`).join(", ")}</strong>.
            </>
          ) : (
            ", on a normal day."
          )}
        </p>
        <Button
          size="lg"
          variant="fresh"
          className="h-16 px-10 text-xl shadow-lg shadow-fresh/25"
          disabled={pg.running}
          onClick={async () => {
            if (await pg.run()) onDone();
          }}
        >
          {pg.running ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />}
          {pg.running ? "Running on the FreshFlow backend…" : "Run FreshFlow Simulation"}
        </Button>
        {pg.running && <p className="text-base text-slate-600" role="status">Simulating the trip, then the agent checks buyers and routes. This usually takes about a second.</p>}
        {pg.runError ? <ErrorPanel className="w-full max-w-2xl text-left" error={pg.runError} /> : null}
      </div>
    </Panel>
  );
}

/* ================================================================ step 5 */

function useNames(network: Network) {
  return useMemo(() => Object.fromEntries([...network.hubs, ...network.buyers].map((l) => [l.id, l.name])), [network]);
}

function StepResults({ network, onRetry }: { network: Network; onRetry: () => void }) {
  const pg = usePlayground();
  const client = useClient();
  const isCurrent = useResultIsCurrent();
  const [compareAll, setCompareAll] = useState(false);
  const [details, setDetails] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const names = useNames(network);
  const p = pg.current!;
  const a = p.strategies.A;
  const d = p.strategies.D;
  const options = agentOptions(p);
  const disruptionIcon = p.request.disruptions[0]?.type;
  const planKey = p.state.shipment.plan_route_key;
  const checkpoint = network.routes[planKey]?.checkpoint as [number, number] | undefined;
  const recommended = d.diverted ? d.buyer_id : null;

  const routes: MapRoute[] = [{ key: a.route_key, kind: "original", positions: routeGeometry(network, a.route_key), label: `Original route to ${a.buyer_name} · ${a.distance_km.toFixed(1)} km` }];
  if (d.diverted && d.leg) routes.push({ key: `${d.leg[0]}~${d.leg[1]}`, kind: "recommended", positions: routeGeometry(network, d.leg[0], d.leg[1]), label: `FreshFlow route to ${d.buyer_name} · ${d.distance_km.toFixed(1)} km` });
  else if (d.route_key !== a.route_key) routes.push({ key: d.route_key, kind: "planned", positions: routeGeometry(network, d.route_key), label: `Planned route to ${d.buyer_name}` });

  const buyerPopup = (id: string) => {
    const o = options.find((x) => x.id === id);
    const loc = network.buyers.find((b) => b.id === id)!;
    const terms = network.buyer_terms[id];
    if (!o) return <div className="text-sm">{loc.name}</div>;
    return (
      <div className="space-y-1 text-[13px] leading-snug">
        <p className="text-sm font-semibold text-forest">
          {loc.name} <span className="font-normal text-slate-500">· {id}</span>
        </p>
        <p className="text-slate-600">{loc.area} · synthetic buyer</p>
        <p>Can take: {formatKg(o.available_capacity_kg ?? terms.capacity_kg)} · grades {terms.accepted_grades}</p>
        <p>Needs ≥ {hoursText(o.minimum_rsl_hours)} shelf life · arrives with ≥ {hoursText(o.arrival_rsl_lower_hours)} (safe estimate)</p>
        <p>Arrival: {clockAfter((p.state.elapsed_hours ?? 0) + o.travel_hours)} ({hoursText(o.travel_hours)} from checkpoint)</p>
        <p>Offer: ₹{o.price_inr_kg.toFixed(1)}/kg · Expected value {formatINR(o.net_proceeds_inr)}</p>
        <p className={o.feasible ? "font-semibold text-fresh" : "font-semibold text-unsafe"}>{o.feasible ? "✓ Can accept this shipment" : `✗ ${o.reasons.join("; ")}`}</p>
      </div>
    );
  };

  const exportXlsx = async () => {
    setBusy("export");
    setActionError(null);
    try {
      saveBlob(await client.download({ type: "shipment", id: p.id }), `freshflow-${p.id}.xlsx`);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {!isCurrent && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-base text-amber-900" role="status">
          You changed the inputs. These results are from your previous run.
          <Button size="sm" variant="outline" onClick={onRetry}>
            Go back and run again
          </Button>
        </div>
      )}

      <section className="grid gap-6 rounded-2xl border border-forest/10 bg-white p-6 lg:grid-cols-[auto_1fr]">
        <ProduceImage id={p.commodity.id} name={p.commodity.name} size={96} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Shipment {p.id} · {formatKg(p.request.quantity_kg)} {p.commodity.name} · {names[p.request.origin_id]} → {names[p.request.buyer_id]}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-forest">What happened</h2>
          <ul className="mt-3 space-y-2 text-[17px] leading-relaxed text-slate-700" data-testid="narrative">
            {p.narrative.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-fresh" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <DecisionCard payload={p} onDecide={(approve) => void pg.decide(approve)} deciding={pg.deciding} />
      {pg.decideError ? <ErrorPanel error={pg.decideError} /> : null}

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <MumbaiMap network={network} height={520} routes={routes} originId={p.request.origin_id} committedBuyerId={p.request.buyer_id} recommendedBuyerId={recommended} checkpoint={checkpoint} checkpointIcons={disruptionIcon ? [`/icons/${disruptionIcon}.png`] : []} buyerPopup={buyerPopup} />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate-700">
            <span className="flex items-center gap-2">
              <span className="inline-block w-8 border-t-[5px] border-slate-500" /> Original: {a.buyer_name} · {a.distance_km.toFixed(1)} km · {hoursText(a.lead_time_hours)}
            </span>
            {d.diverted && (
              <span className="flex items-center gap-2">
                <span className="inline-block w-8 border-t-[5px] border-dotted border-fresh" /> FreshFlow: {d.buyer_name} · {d.distance_km.toFixed(1)} km · {hoursText(d.lead_time_hours)}
              </span>
            )}
            {p.request.disruptions.length > 0 && <span className="text-slate-500">Problem detected at the checkpoint ({Math.round(network.checkpoint_fraction * 100)}% of the planned route). Click a buyer for details.</span>}
          </div>
        </div>
        <div className="rounded-2xl border border-forest/10 bg-white p-5">
          <h3 className="text-lg font-semibold text-forest">Freshness remaining over time</h3>
          <p className="mb-3 text-sm text-slate-600">Rerouting cannot restore freshness already lost — it only changes how long the produce stays on the road.</p>
          <FreshnessChart payload={p} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-forest">Business results</h2>
          <Button variant="outline" onClick={() => setCompareAll((c) => !c)} aria-pressed={compareAll}>
            {compareAll ? "Show A vs D only" : "Compare all four"}
          </Button>
        </div>
        <HeadlineResults payload={p} compareAll={compareAll} />
        <p className="mt-2 text-sm text-slate-500">Synthetic simulation for this one shipment — not observed business results.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-forest/10 bg-white p-5">
          <h3 className="text-lg font-semibold text-forest">Expected value by buyer</h3>
          <p className="mb-3 text-sm text-slate-600">From the agent's optimizer at the checkpoint.</p>
          <BuyerProfitChart payload={p} />
        </div>
        <div className="rounded-2xl border border-forest/10 bg-white p-5">
          <h3 className="text-lg font-semibold text-forest">What FreshFlow did, step by step</h3>
          <p className="mb-4 text-sm text-slate-600">Every step is a real backend tool call recorded in the trace. Click a step for its inputs and outputs.</p>
          <AgentTimeline trace={p.state.trace} names={names} />
        </div>
      </section>

      <section className="rounded-2xl border border-forest/10 bg-white">
        <button type="button" aria-expanded={details} onClick={() => setDetails((x) => !x)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
          <span className="flex-1 text-lg font-semibold text-forest">More details: revenue, costs and acceptance for A, B, C, D</span>
          <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", details && "rotate-180")} />
        </button>
        {details && (
          <div className="border-t border-slate-100 p-5">
            <DetailsTable payload={p} />
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-forest/10 bg-white p-5">
        <Button variant="fresh" size="lg" onClick={() => void exportXlsx()} disabled={busy === "export"}>
          {busy === "export" ? <Loader2 className="animate-spin" /> : <Download />} Export to Excel
        </Button>
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="save-label">Name this test</Label>
            <Input id="save-label" className="mt-1 h-11" placeholder={`${p.commodity.name} · ${p.request.disruptions.map((x) => x.type.replace(/_/g, " ")).join(", ") || "normal day"}`} value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} />
          </div>
          <Button
            size="lg"
            variant="outline"
            disabled={pg.saved.some((s) => s.id === p.id)}
            onClick={() => pg.save(saveLabel.trim() || `${p.commodity.name} · ${p.request.disruptions.map((x) => x.type.replace(/_/g, " ")).join(", ") || "normal day"}`)}
          >
            <Save /> {pg.saved.some((s) => s.id === p.id) ? "Saved for comparison" : "Save for comparison"}
          </Button>
        </div>
        <Button size="lg" variant="ghost" onClick={onRetry}>
          <ArrowLeft /> Try another disruption
        </Button>
        {actionError ? <ErrorPanel className="w-full" error={actionError} /> : null}
      </section>
    </div>
  );
}

/* ================================================================ shared */

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-forest">{title}</h2>
      <p className="mb-5 mt-1 text-base text-slate-600">{subtitle}</p>
      {children}
    </section>
  );
}

function Summary({ network, step, onGo }: { network: Network; step: number; onGo: (n: number) => void }) {
  const { selection } = usePlayground();
  const names = useNames(network);
  const commodity = network.commodities.find((c) => c.id === selection.commodity_id);
  const disruptions = Object.entries(selection.disruptions);
  return (
    <aside className="h-fit space-y-4 rounded-2xl border border-forest/10 bg-white p-5 shadow-sm xl:sticky xl:top-24" aria-label="Your test">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your test</p>
      {commodity && (
        <div className="flex items-center gap-3">
          <ProduceImage id={commodity.id} name={commodity.name} size={56} />
          <div>
            <p className="text-lg font-semibold text-forest">{commodity.name}</p>
            <p className="text-sm text-slate-600">
              {formatKg(selection.quantity_kg)} · grade {selection.quality_grade}
            </p>
          </div>
        </div>
      )}
      <div className="text-[15px]">
        <p className="text-slate-500">Route</p>
        <p className="font-semibold text-slate-800">
          {names[selection.origin_id]} → {names[selection.buyer_id]}
        </p>
      </div>
      <div className="text-[15px]">
        <p className="text-slate-500">Problems</p>
        {disruptions.length ? (
          <ul className="mt-1 space-y-1">
            {disruptions.map(([t, s]) => (
              <li key={t} className="flex items-center gap-2 font-semibold text-amber-800">
                <img src={`/icons/${t}.png`} alt="" width={22} height={22} /> {network.disruptions[t].label} · {s}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-semibold text-slate-800">None — a normal day</p>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        {step > 1 && (
          <Button variant="outline" size="lg" className="flex-1" onClick={() => onGo(step - 1)}>
            <ArrowLeft /> Back
          </Button>
        )}
        {step < 4 && (
          <Button variant="fresh" size="lg" className="flex-1" onClick={() => onGo(step + 1)}>
            Next <ArrowRight />
          </Button>
        )}
      </div>
    </aside>
  );
}
