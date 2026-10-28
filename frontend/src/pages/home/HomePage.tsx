import { Link } from "react-router-dom";
import { ArrowRight, Clock, Leaf, MapPin, Store, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/common";
import { MumbaiMap, routeGeometry } from "@/components/map/MumbaiMap";
import { ProduceImage, hoursText } from "@/components/shipment";
import { Skeleton } from "@/components/ui/input";
import { usePlayground } from "@/state/PlaygroundContext";
import { formatINR, formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Departure clock time for display: dispatch is modelled at 06:00. */
export function clockAfter(hours: number) {
  const t = new Date(2026, 0, 1, 6, 0);
  t.setMinutes(t.getMinutes() + Math.round(hours * 60));
  return t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function HomePage() {
  const { network, networkError, baseline, baselineError } = usePlayground();
  const a = baseline?.strategies.A;
  const hub = network?.hubs.find((h) => h.id === baseline?.request.origin_id);
  const fresh = a ? a.arrival_rsl_hours - a.minimum_rsl_hours : 0;
  const status = !a ? null : fresh > 8 ? { label: "Fresh", tone: "bg-fresh-50 text-fresh" } : fresh >= 0 ? { label: "Watch closely", tone: "bg-amber-50 text-amber-800" } : { label: "At risk", tone: "bg-unsafe-50 text-unsafe-dark" };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-fresh">Save Freshness. Protect Profit.</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-forest sm:text-4xl">See how FreshFlow saves your produce.</h1>
          <p className="mt-2 max-w-2xl text-lg text-slate-600">A tomato shipment is leaving Turbhe APMC for a Mumbai supermarket. Throw a problem at it and watch what FreshFlow does.</p>
        </div>
        <Button asChild size="lg" variant="fresh" className="h-14 px-8 text-lg shadow-lg shadow-fresh/20">
          <Link to="/playground?step=3">
            <Zap className="h-5 w-5" /> Test a Disruption <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </section>

      {networkError || baselineError ? <ErrorPanel error={networkError ?? baselineError} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        {network && baseline ? (
          <MumbaiMap
            network={network}
            height={600}
            originId={baseline.request.origin_id}
            committedBuyerId={baseline.request.buyer_id}
            routes={[{ key: a!.route_key, kind: "planned", positions: routeGeometry(network, a!.route_key), label: `Planned route · ${a!.distance_km.toFixed(1)} km` }]}
          />
        ) : (
          <Skeleton className="h-[600px] rounded-2xl" />
        )}

        <aside className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm" aria-label="Selected shipment">
          {!baseline || !a ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ProduceImage id={baseline.commodity.id} name={baseline.commodity.name} size={84} />
                <div>
                  <p className="text-sm font-medium text-slate-500">Selected shipment</p>
                  <p className="text-2xl font-bold text-forest">{baseline.commodity.name}</p>
                  <p className="text-base text-slate-600">{formatKg(baseline.request.quantity_kg)} · Grade A</p>
                </div>
              </div>
              {status && <span className={cn("mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold", status.tone)}>{status.label}</span>}
              <dl className="mt-5 space-y-4">
                <Fact icon={MapPin} label="From" value={hub?.name ?? baseline.request.origin_id} />
                <Fact icon={Store} label="Current buyer" value={a.buyer_name} />
                <Fact icon={Clock} label="Expected arrival" value={`${clockAfter(a.lead_time_hours)} · ${hoursText(a.lead_time_hours)} trip`} />
                <Fact icon={Leaf} label="Shelf life on arrival" value={`${hoursText(a.arrival_rsl_hours)} (buyer needs ${hoursText(a.minimum_rsl_hours)})`} />
                <Fact icon={Wallet} label="Shipment price" value={`₹${a.offer_inr_kg.toFixed(1)}/kg · ${formatINR(a.revenue_inr, { compact: true })}`} />
              </dl>
              <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Calculated by the FreshFlow backend for a normal day (no disruptions), dispatch at 6:00 AM. Synthetic data; simulated traffic.
              </p>
              <Button asChild size="lg" variant="fresh" className="mt-5 w-full">
                <Link to="/playground?step=3">
                  Test a Disruption <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="link" className="mt-1 w-full">
                <Link to="/playground">Choose a different produce or route</Link>
              </Button>
            </>
          )}
        </aside>
      </div>

      <section className="grid gap-4 md:grid-cols-3" aria-label="How it works">
        {[
          ["1", "Something goes wrong", "Traffic, heat, a broken cooler or a cancelled order."],
          ["2", "FreshFlow investigates", "It re-checks freshness, buyers, routes and safety rules — with real tool calls."],
          ["3", "You approve, it acts", "It proposes the best move and only redirects the truck after your approval."],
        ].map(([n, t, d]) => (
          <div key={n} className="flex gap-4 rounded-2xl border border-forest/10 bg-white p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-lg font-bold text-white">{n}</span>
            <div>
              <p className="text-lg font-semibold text-forest">{t}</p>
              <p className="text-base text-slate-600">{d}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-fresh" aria-hidden />
      <div>
        <dt className="text-sm text-slate-500">{label}</dt>
        <dd className="text-base font-semibold text-slate-800">{value}</dd>
      </div>
    </div>
  );
}
