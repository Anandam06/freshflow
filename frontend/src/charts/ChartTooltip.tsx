import type { ReactNode } from "react";

export interface TooltipRow {
  color?: string;
  name: string;
  value: ReactNode;
}

/** Plain HTML tooltip body shared by all charts. */
export function TooltipCard({ title, rows, note }: { title: ReactNode; rows: TooltipRow[]; note?: ReactNode }) {
  return (
    <div className="min-w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-forest">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              {r.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />}
              {r.name}
            </span>
            <span className="num font-medium text-slate-900">{r.value}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
