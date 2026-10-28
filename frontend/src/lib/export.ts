import type { SimulationRequest, SimulationResult } from "@/types/api";

/** Serialises backend results verbatim for download. No values are computed here. */
export function resultToCsv(result: SimulationResult, request: SimulationRequest, label = "current"): string {
  const metricKeys = Array.from(new Set(result.runs.flatMap((r) => r.metrics.flatMap((m) => Object.keys(m)))));
  const paramKeys = Object.keys(request) as (keyof SimulationRequest)[];
  const header = ["scenario", ...paramKeys, "evidence_category", "assumptions_version", "agent_mode", "repetition_seed", "dataset_sha256", ...metricKeys];
  const rows = result.runs.flatMap((r) =>
    r.metrics.map((m) => [
      label,
      ...paramKeys.map((k) => request[k]),
      result.evidence_category,
      result.assumptions_version,
      result.agent_mode,
      r.seed,
      r.dataset_sha256,
      ...metricKeys.map((k) => (m as Record<string, unknown>)[k]),
    ]),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
