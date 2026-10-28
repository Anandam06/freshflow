import { describe, expect, it } from "vitest";
import { formatFraction, formatINR, formatINRPerKg, formatKg, formatPP, formatDays } from "@/lib/format";
import { agenticShare, profitBridge } from "@/lib/derive";
import { SimulationResultSchema } from "@/types/api";
import { resultToCsv } from "@/lib/export";
import { stepMeta } from "@/lib/trace";
import run from "@/services/mock/fixtures/run.json";
import { DEFAULT_SIMULATION_REQUEST } from "@/types/api";

const result = SimulationResultSchema.parse((run as { result: unknown }).result);

describe("formatters", () => {
  it("uses Indian grouping and compact lakh/crore", () => {
    expect(formatINR(1234567)).toBe("₹12,34,567");
    expect(formatINR(4313000, { compact: true, signed: true })).toBe("+₹43.13 L");
    expect(formatINR(-25000000, { compact: true })).toBe("−₹2.50 Cr");
  });
  it("distinguishes percent of a fraction from percentage points", () => {
    expect(formatFraction(0.223)).toBe("22.3%");
    expect(formatPP(13.4)).toBe("+13.4 pp");
    expect(formatFraction(0.587, 1, { signed: true })).toBe("+58.7%");
  });
  it("renders null and non-finite values as an em dash, never as zero", () => {
    expect(formatINR(null)).toBe("—");
    expect(formatFraction(undefined)).toBe("—");
    expect(formatPP(NaN)).toBe("—");
  });
  it("formats units", () => {
    expect(formatINRPerKg(21.784)).toBe("₹21.78/kg");
    expect(formatKg(989632, { compact: true })).toBe("989.6 t");
    expect(formatDays(0.35)).toBe("8.4 h");
  });
});

describe("display derivations", () => {
  it("profit bridge reconciles M0 + steps = M3 on backend output", () => {
    for (const run of result.runs) {
      const b = profitBridge(run);
      expect(b.reconciles).toBe(true);
      expect(b.steps[2].delta).toBeCloseTo(run.metrics[3].incremental_agentic_policy_profit_vs_m2_inr!, 2);
      expect(b.m0 + b.steps.reduce((t, x) => t + x.delta, 0)).toBeCloseTo(b.m3, 0);
    }
  });
  it("agentic share is undefined when the total gain is not positive", () => {
    expect(agenticShare({ m0: 10, m3: 5, steps: [], reconciles: true } as never)).toBeNull();
  });
});

describe("export", () => {
  it("writes one CSV row per repetition × model with backend fields verbatim", () => {
    const csv = resultToCsv(result, DEFAULT_SIMULATION_REQUEST).split("\n");
    expect(csv).toHaveLength(1 + result.runs.length * 4);
    expect(csv[0]).toContain("operating_profit_inr");
    expect(csv[1]).toContain(String(result.runs[0].metrics[0].operating_profit_inr));
  });
});

describe("trace semantics", () => {
  it("distinguishes prediction, optimization, human approval and execution", () => {
    const k = (tool: string) => stepMeta({ sequence: 1, timestamp: "", tool, inputs: {}, result: {} }).kind;
    expect(k("predict_freshness")).toBe("prediction");
    expect(k("rank_options")).toBe("optimization");
    expect(k("human_approved")).toBe("human");
    expect(k("execute_destination_change")).toBe("execution");
    expect(k("predict_remaining_shelf_life")).toBe("prediction");
    expect(k("optimize_destination")).toBe("optimization");
    expect(k("validate_constraints")).toBe("policy");
    expect(k("something_new")).toBe("tool");
  });
});
