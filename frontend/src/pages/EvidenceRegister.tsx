import { useMemo, useState } from "react";
import { ExternalLink, FileSearch, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DemoDataBadge, EmptyState, ErrorPanel, LoadingBlock, PageHeader, ProvenanceTag, SectionTitle } from "@/components/common";
import { useClient } from "@/services/ClientContext";
import { useAsync } from "@/services/useAsync";
import { SIMULATION_LIMITS, type Assumption } from "@/types/api";
import { cn } from "@/lib/utils";

const CATEGORIES = ["ALL", "CASE", "RESEARCH", "SYNTHETIC"] as const;
type Filter = (typeof CATEGORIES)[number];

const L = SIMULATION_LIMITS;
/** Which assumptions the Scenario studio can vary, with the API's allowed range. */
const SENSITIVITY: Record<string, string> = {
  default_batches: `${L.batches.min}–${L.batches.max.toLocaleString("en-IN")} batches (Scenario studio)`,
  default_duration: `${L.days.min}–${L.days.max} days (Scenario studio)`,
  disruption_probability: `${L.disruption_probability.min}–${L.disruption_probability.max} (Scenario studio; swept 0.1–0.6 in Risk)`,
  buyer_prices: `×${L.price_multiplier.min}–${L.price_multiplier.max} price multiplier`,
  buyer_daily_capacity: `×${L.capacity_multiplier.min}–${L.capacity_multiplier.max} capacity multiplier`,
  fleet_daily_capacity: `×${L.capacity_multiplier.min}–${L.capacity_multiplier.max} capacity multiplier`,
  setup_cost: `₹0–₹10 Cr (Scenario studio; swept in Risk)`,
};

function validationStatus(category: string, backend?: string): { label: string; variant: "risk" | "info" | "neutral" } {
  if (backend) return { label: backend, variant: category === "CASE" ? "risk" : category === "RESEARCH" ? "info" : "neutral" };
  if (category === "CASE") return { label: "Case-given; not independently verified", variant: "risk" };
  if (category === "RESEARCH") return { label: "Published source", variant: "info" };
  return { label: "Unvalidated synthetic assumption", variant: "neutral" };
}

export default function EvidenceRegister() {
  const client = useClient();
  const ev = useAsync(() => client.getEvidence(), [client]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");

  const assumptions = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (ev.data?.assumptions ?? []).filter(
      (a: Assumption) =>
        (filter === "ALL" || a.category === filter) && (!s || [a.id, a.parameter, a.value, a.basis, a.limitation].some((v) => v.toLowerCase().includes(s))),
    );
  }, [ev.data, filter, q]);
  const sources = (ev.data?.sources ?? []).filter((s) => filter === "ALL" || s.category === filter);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of ev.data?.assumptions ?? []) c[a.category] = (c[a.category] ?? 0) + 1;
    for (const s of ev.data?.sources ?? []) c[s.category] = (c[s.category] ?? 0) + 1;
    return c;
  }, [ev.data]);

  return (
    <>
      <PageHeader
        eyebrow="Evidence register"
        title="Every number, traced to its source"
        description="Assumptions and sources served by the backend from research/assumptions.csv and research/sources.csv. Categories tell you what kind of claim each value is."
        actions={<DemoDataBadge />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { c: "CASE", text: "Stated by the competition case. Targets are goals, never displayed as achieved." },
          { c: "RESEARCH", text: "Externally published source with URL, date and limitations." },
          { c: "SYNTHETIC", text: "Generated assumption driving the prototype; not calibrated to real operations." },
          { c: "SIMULATED RESULT", text: "Output of a backend simulation run on synthetic data (dashboards, not this register)." },
        ].map((x) => (
          <div key={x.c} className="rounded-lg border border-border bg-white p-3">
            <ProvenanceTag category={x.c} />
            <p className="mt-2 text-sm text-slate-600">{x.text}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                filter === c ? "border-forest bg-forest text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {c === "ALL" ? "All" : c.charAt(0) + c.slice(1).toLowerCase()} {c !== "ALL" && <span className="num opacity-70">({counts[c] ?? 0})</span>}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Search assumptions" placeholder="Search parameters" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {ev.error ? <ErrorPanel error={ev.error} onRetry={ev.reload} /> : null}
      {ev.loading && !ev.data ? <LoadingBlock /> : null}
      {ev.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Input parameters & assumptions</CardTitle>
              <CardDescription>{assumptions.length} shown. Sensitivity range lists what the scenario controls can vary within the API's bounds.</CardDescription>
            </CardHeader>
            <CardContent>
              {assumptions.length === 0 ? (
                <EmptyState title="No matching assumptions" icon={FileSearch} />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>ID</TH>
                      <TH>Parameter</TH>
                      <TH>Value</TH>
                      <TH>Category</TH>
                      <TH>Basis / citation</TH>
                      <TH>Sensitivity range</TH>
                      <TH>Validation status</TH>
                      <TH>Limitation</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {assumptions.map((a) => {
                      const v = validationStatus(a.category, a.validation_status);
                      return (
                        <TR key={a.id} className="align-top hover:bg-slate-50">
                          <TD className="num font-mono text-xs text-slate-500">{a.id}</TD>
                          <TD className="font-medium text-slate-800">{a.parameter.replace(/_/g, " ")}</TD>
                          <TD className="num whitespace-nowrap">
                            {a.value} <span className="text-slate-500">{a.unit}</span>
                          </TD>
                          <TD>
                            <ProvenanceTag category={a.category} />
                          </TD>
                          <TD className="min-w-[180px] text-slate-700">{a.basis}{a.source_url ? <a href={a.source_url} target="_blank" rel="noreferrer noopener" className="ml-1 text-fresh hover:underline">source</a> : null}</TD>
                          <TD className="min-w-[160px] text-slate-700">{a.sensitivity_bounds || SENSITIVITY[a.parameter] || <span className="text-slate-400">Fixed in backend</span>}</TD>
                          <TD>
                            <Badge variant={v.variant} className="whitespace-normal">
                              {v.label}
                            </Badge>
                          </TD>
                          <TD className="min-w-[200px] text-slate-600">{a.limitation}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <SectionTitle>Sources</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {sources.length === 0 && <EmptyState title="No sources in this category" />}
            {sources.map((s) => {
              const isUrl = /^https?:\/\//.test(s.url);
              return (
                <Card key={s.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-mono text-xs text-slate-500">{s.id}</span>
                      <ProvenanceTag category={s.category} />
                    </div>
                    <CardTitle className="mt-1">{s.title}</CardTitle>
                    <CardDescription>
                      {s.authors} · {s.publication_date} · accessed {s.accessed_date}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {isUrl ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all font-medium text-fresh hover:underline">
                        {s.url} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <p className="text-slate-600">{s.url}</p>
                    )}
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-700">Limitations: </span>
                      {s.limitations}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
