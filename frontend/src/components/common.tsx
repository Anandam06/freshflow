import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FlaskConical, Info, Inbox, RotateCw, ShieldCheck, Target, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useClient } from "@/services/ClientContext";
import { describeError } from "@/services/errors";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- provenance */

export type Provenance = "SIMULATED RESULT" | "CASE" | "RESEARCH" | "SYNTHETIC";

const PROVENANCE: Record<Provenance, { label: string; tip: string; variant: "fresh" | "risk" | "info" | "violet"; icon: typeof Info }> = {
  "SIMULATED RESULT": {
    label: "Synthetic simulation",
    tip: "Calculated by the FreshFlow backend simulation on synthetic data. Not observed business performance.",
    variant: "violet",
    icon: FlaskConical,
  },
  CASE: { label: "Case target", tip: "Baseline or target stated in the competition case. A goal, not an achieved result.", variant: "risk", icon: Target },
  RESEARCH: { label: "Verified reference", tip: "External published source with citation and limitations.", variant: "info", icon: BookOpen },
  SYNTHETIC: { label: "Synthetic assumption", tip: "Generated assumption used to drive the prototype. Not calibrated to real operations.", variant: "fresh", icon: ShieldCheck },
};

export function ProvenanceTag({ category, className }: { category: Provenance | string; className?: string }) {
  const p = PROVENANCE[category as Provenance];
  if (!p) return <Badge variant="neutral">{category}</Badge>;
  const Icon = p.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={p.variant} className={cn("cursor-help", className)} tabIndex={0}>
          <Icon className="h-3 w-3" aria-hidden />
          {p.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{p.tip}</TooltipContent>
    </Tooltip>
  );
}

/** Shown beside every data block while the demo adapter is active. */
export function DemoDataBadge({ className }: { className?: string }) {
  const client = useClient();
  if (client.mode !== "demo") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="risk" className={cn("cursor-help border-dashed", className)} tabIndex={0}>
          Demo data
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Replayed backend output (shared fixtures and captured simulate() runs). Connect the live API by setting VITE_API_BASE_URL.
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------------------------------------------------------------- page chrome */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-fresh">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-forest sm:text-[1.75rem]">{title}</h1>
        {description && <div className="mt-2 text-[15px] leading-relaxed text-slate-600">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-forest">{children}</h2>
      {aside}
    </div>
  );
}

export function InfoTip({ children, label = "More information" }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-forest">
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

/* ---------------------------------------------------------------- state views */

export function LoadingBlock({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ErrorPanel({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { title, detail } = describeError(error);
  return (
    <div role="alert" className={cn("flex flex-col gap-3 rounded-lg border border-unsafe-100 bg-unsafe-50 p-4 sm:flex-row sm:items-start", className)}>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-unsafe" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold text-unsafe-dark">{title}</p>
        <p className="mt-1 text-sm text-slate-700">{detail}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: typeof Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <Icon className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-600">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- KPI card */

export function KpiCard({
  label,
  value,
  sub,
  tip,
  tone = "neutral",
  provenance,
  testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tip?: ReactNode;
  tone?: "neutral" | "fresh" | "risk" | "unsafe";
  provenance?: Provenance;
  testId?: string;
}) {
  const valueColor = { neutral: "text-forest", fresh: "text-fresh", risk: "text-risk-dark", unsafe: "text-unsafe" }[tone];
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-white p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </div>
      <p className={cn("num mt-1.5 truncate text-2xl font-semibold tracking-tight", valueColor)}>{value}</p>
      {sub && <div className="mt-1 text-sm text-slate-600">{sub}</div>}
      {provenance && (
        <div className="mt-auto pt-3">
          <ProvenanceTag category={provenance} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- JSON */

export function JsonView({ value, label = "Raw data", defaultOpen = false }: { value: unknown; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-forest"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
