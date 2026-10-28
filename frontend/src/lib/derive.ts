/**
 * Display-only derivations from backend values.
 *
 * Each function is a single difference or ratio of backend-authoritative numbers — no financial
 * model logic. They live in this one module so they can be deleted once the backend returns the
 * values directly (requested in INTEGRATION.md §Requested fields).
 */
import type { SimulationRun } from "@/types/api";

export interface ProfitBridge {
  m0: number;
  m3: number;
  steps: { key: "freshness" | "optimization" | "agentic"; delta: number }[];
  /** True when M0 + steps equals M3 within ₹1 — a contract consistency check. */
  reconciles: boolean;
}

/** Stepwise operating-profit bridge M0 → M1 → M2 → M3 from backend incremental fields. */
export function profitBridge(run: SimulationRun): ProfitBridge {
  const [m0, m1, m2, m3] = run.metrics;
  const freshness = m1.incremental_profit_vs_m0_inr;
  const optimization = m2.incremental_profit_vs_m0_inr - m1.incremental_profit_vs_m0_inr;
  const agentic = m3.incremental_agentic_policy_profit_vs_m2_inr ?? m3.incremental_profit_vs_m0_inr - m2.incremental_profit_vs_m0_inr;
  const total = m0.operating_profit_inr + freshness + optimization + agentic;
  return {
    m0: m0.operating_profit_inr,
    m3: m3.operating_profit_inr,
    steps: [
      { key: "freshness", delta: freshness },
      { key: "optimization", delta: optimization },
      { key: "agentic", delta: agentic },
    ],
    reconciles: Math.abs(total - m3.operating_profit_inr) < 1,
  };
}

/** Share of the M0→M3 profit gain attributable to the agentic step; null when the total gain is not positive. */
export function agenticShare(bridge: ProfitBridge): number | null {
  const total = bridge.m3 - bridge.m0;
  if (!(total > 0)) return null;
  return bridge.steps[2].delta / total;
}

/** Difference of two backend fractions, in percentage points. */
export function deltaPP(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return (a - b) * 100;
}

/** Relative change of a backend value versus a baseline (fraction). Null when the baseline is 0 or missing. */
export function relativeChange(value: number | null | undefined, base: number | null | undefined): number | null {
  if (value == null || base == null || base === 0) return null;
  return (value - base) / Math.abs(base);
}
