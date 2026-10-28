import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel, EmptyState } from "@/components/common";
import { useClient } from "@/services/ClientContext";
import { WorkbookValidationError } from "@/services/errors";
import { usePlayground } from "@/state/PlaygroundContext";
import { useSimulation } from "@/state/SimulationContext";
import { fileToBase64, saveBlob } from "@/lib/download";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkbookRun } from "@/types/shipment";
import type { DownloadKind } from "@/services/client";

export default function DataReportsPage() {
  const client = useClient();
  const pg = usePlayground();
  const sim = useSimulation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [run, setRun] = useState<WorkbookRun | null>(null);
  const [rowErrors, setRowErrors] = useState<WorkbookValidationError | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async (label: string, kind: DownloadKind, filename: string) => {
    setBusy(label);
    setError(null);
    try {
      saveBlob(await client.download(kind), filename);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy("upload");
    setError(null);
    setRowErrors(null);
    setRun(null);
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new WorkbookValidationError("Please upload an .xlsx file.", [{ sheet: null, row: null, column: null, message: `${file.name} is not an .xlsx workbook` }]);
      setRun(await client.uploadWorkbook(file.name, await fileToBase64(file)));
    } catch (e) {
      if (e instanceof WorkbookValidationError) setRowErrors(e);
      else setError(e);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-fresh">Data & reports</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-forest">Work with your own data in Excel</h1>
        <p className="mt-2 max-w-3xl text-lg text-slate-600">Download the input template, edit it, upload it to run every batch through FreshFlow, and export real results — with run ids and seeds so anyone can reproduce them.</p>
      </header>
      {error ? <ErrorPanel error={error} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card step="1" title="Download the input template" body="11 sheets: locations, road routes, commodities, batches, buyer offers and capacity, freshness parameters, disruptions, costs, scenario settings and sources. Green tabs are inputs.">
          <Button size="lg" variant="fresh" disabled={busy === "template"} onClick={() => void download("template", { type: "template" }, "freshflow-input-template.xlsx")}>
            {busy === "template" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Download input template (.xlsx)
          </Button>
        </Card>

        <Card step="2" title="Upload your edited workbook" body="FreshFlow checks every sheet, column, unit and id. If something is wrong you get the exact sheet, row and column to fix. Valid files run straight away.">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void upload(f);
            }}
            className={cn("flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors", dragging ? "border-fresh bg-fresh-50" : "border-slate-300 bg-slate-50")}
          >
            <Upload className="h-8 w-8 text-forest" aria-hidden />
            <p className="text-base text-slate-700">Drag an .xlsx file here, or</p>
            <input ref={fileRef} id="workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button asChild size="lg" variant="outline">
              <label htmlFor="workbook" className="cursor-pointer">
                {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} {busy === "upload" ? "Checking and running…" : "Choose a file"}
              </label>
            </Button>
          </div>
        </Card>
      </div>

      {rowErrors && (
        <section className="rounded-2xl border border-unsafe-100 bg-white p-6" role="alert">
          <h2 className="flex items-center gap-2 text-xl font-bold text-unsafe-dark">
            <AlertTriangle className="h-6 w-6" /> {rowErrors.message}
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]" data-testid="upload-errors">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-500">
                  <th className="py-2 pr-4">Sheet</th>
                  <th className="py-2 pr-4">Row</th>
                  <th className="py-2 pr-4">Column</th>
                  <th className="py-2">Problem</th>
                </tr>
              </thead>
              <tbody>
                {rowErrors.errors.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">{e.sheet ?? "—"}</td>
                    <td className="num py-2 pr-4">{e.row ?? "—"}</td>
                    <td className="py-2 pr-4">{e.column ?? "—"}</td>
                    <td className="py-2 text-slate-800">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {run && (
        <section className="rounded-2xl border border-fresh/30 bg-white p-6" data-testid="workbook-run">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-forest">
              <CheckCircle2 className="h-6 w-6 text-fresh" /> {run.filename}: {run.totals.batches} batches simulated
            </h2>
            <Button size="lg" variant="fresh" disabled={busy === "wb"} onClick={() => void download("wb", { type: "workbook", id: run.id }, `freshflow-${run.id}.xlsx`)}>
              <Download /> Export results (.xlsx)
            </Button>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Run {run.id} · dataset {run.dataset_id} · totals — A: {formatINR(run.totals.A_profit_inr, { compact: true })} ({run.totals.A_accepted} accepted) · D: {formatINR(run.totals.D_profit_inr, { compact: true })} ({run.totals.D_accepted} accepted). Synthetic simulation.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-500">
                  <th className="py-2 pr-3">Batch</th>
                  <th className="py-2 pr-3">Produce</th>
                  <th className="py-2 pr-3">A · Traditional</th>
                  <th className="py-2 pr-3">D · FreshFlow</th>
                  <th className="py-2 pr-3 text-right">A profit</th>
                  <th className="py-2 pr-3 text-right">D profit</th>
                  <th className="py-2">Agent</th>
                </tr>
              </thead>
              <tbody>
                {run.shipments.map((s) => (
                  <tr key={s.shipment_id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold">{s.batch_id}</td>
                    <td className="py-2 pr-3">{s.commodity}</td>
                    <td className="py-2 pr-3">
                      {s.A.buyer_name} {s.A.accepted ? "" : <span className="text-unsafe">· rejected</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {s.D.buyer_name} {s.D.accepted ? "" : <span className="text-unsafe">· rejected</span>}
                    </td>
                    <td className="num py-2 pr-3 text-right">{formatINR(s.A.operating_profit_inr)}</td>
                    <td className="num py-2 pr-3 text-right font-semibold text-forest">{formatINR(s.D.operating_profit_inr)}</td>
                    <td className="py-2 text-sm">{s.decision_status.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card step="3" title="Export your latest playground test" body="Every sheet holds actual backend outputs: A/B/C/D comparison, route and ETA changes, freshness, pricing, the financial ledger and the agent's action log.">
          {pg.current ? (
            <Button size="lg" variant="outline" disabled={busy === "ship"} onClick={() => void download("ship", { type: "shipment", id: pg.current!.id }, `freshflow-${pg.current!.id}.xlsx`)}>
              <Download /> Export shipment {pg.current.id}
            </Button>
          ) : (
            <p className="text-base text-slate-600">
              No test yet. <Link to="/playground" className="font-semibold text-fresh hover:underline">Run one in the Scenario Playground</Link>.
            </p>
          )}
          {sim.runId && (
            <Button className="mt-3" size="lg" variant="outline" disabled={busy === "fleet"} onClick={() => void download("fleet", { type: "fleet", id: sim.runId! }, `freshflow-fleet-${sim.runId}.xlsx`)}>
              <Download /> Export fleet simulation ({sim.runId.slice(0, 8)})
            </Button>
          )}
        </Card>

        <Card step="4" title="Compare saved tests" body="Save tests from the playground results page, then export them side by side.">
          {pg.saved.length === 0 ? (
            <EmptyState title="No saved tests yet">Use “Save for comparison” on a playground result.</EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {pg.saved.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-[15px]">
                    <span className="flex-1">
                      <span className="font-semibold text-forest">{s.label}</span> <span className="text-slate-500">· {s.id}</span>
                    </span>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${s.label}`} onClick={() => pg.removeSaved(s.id)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button className="mt-3" size="lg" variant="fresh" disabled={busy === "cmp"} onClick={() => void download("cmp", { type: "comparison", ids: pg.saved.map((s) => s.id) }, "freshflow-comparison.xlsx")}>
                <Download /> Export comparison (.xlsx)
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ step, title, body, children }: { step: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm">
      <div className="flex gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-lg font-bold text-white">{step}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-forest">{title}</h2>
          <p className="mb-4 mt-1 text-base text-slate-600">{body}</p>
          {children}
        </div>
      </div>
    </section>
  );
}
