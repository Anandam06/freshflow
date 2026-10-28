import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BatchPageSchema,
  BatchStateSchema,
  CreatedSimulationSchema,
  RunDecisionSchema,
  ScenarioDefaultsSchema,
  SensitivityStudySchema,
  EvidenceSchema,
  ModelMetricsSchema,
  ModelSummarySchema,
  SimulationRequestSchema,
  SimulationResultSchema,
  DEFAULT_SIMULATION_REQUEST,
} from "@/types/api";
import run from "@/services/mock/fixtures/run.json";
import sensitivity from "@/services/mock/fixtures/sensitivity.json";
import decisions from "@/services/mock/fixtures/run-decisions.json";
import runBatches from "@/services/mock/fixtures/run-batches.json";
import defaults from "@/services/mock/fixtures/scenario-defaults.json";
import evidence from "@/services/mock/fixtures/evidence.json";
import initial from "@/services/mock/fixtures/batch-initial.json";
import disrupted from "@/services/mock/fixtures/batch-disrupted.json";
import awaiting from "@/services/mock/fixtures/batch-awaiting-approval.json";
import executed from "@/services/mock/fixtures/batch-executed.json";

const CONTRACT = resolve(__dirname, "../../shared/api-contract.yaml");

/** Minimal reader for components.schemas.<name>.properties keys in the OpenAPI YAML. */
function contractProperties(yaml: string, schema: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `    ${schema}:`);
  if (start < 0) throw new Error(`schema ${schema} not in contract`);
  const props: string[] = [];
  let inProps = false;
  for (const line of lines.slice(start + 1)) {
    if (/^ {4}\S/.test(line)) break; // next schema
    if (line === "      properties:") {
      inProps = true;
      continue;
    }
    if (inProps && /^ {6}\S/.test(line)) break; // end of properties block
    const m = inProps && /^ {8}([a-z_0-9]+):/.exec(line);
    if (m) props.push(m[1]);
  }
  return props;
}

const keysOf = (s: z.ZodTypeAny): string[] => {
  let t: z.ZodTypeAny = s;
  while (t instanceof z.ZodEffects) t = t.innerType();
  return Object.keys((t as z.AnyZodObject).shape);
};

describe("TypeScript schemas match shared/api-contract.yaml", () => {
  const yaml = readFileSync(CONTRACT, "utf8");
  it.each([
    ["Metrics", ModelMetricsSchema],
    ["ModelSummary", ModelSummarySchema],
    ["BatchState", BatchStateSchema],
    ["SimulationRequest", SimulationRequestSchema],
  ] as const)("%s has exactly the contract's fields", (name, schema) => {
    expect(new Set(keysOf(schema))).toEqual(new Set(contractProperties(yaml, name)));
  });

  it("SimulationResult covers the contract's fields", () => {
    expect(keysOf(SimulationResultSchema).sort()).toEqual(contractProperties(yaml, "SimulationResult").sort());
  });

  it("default request matches contract defaults", () => {
    expect(yaml).toContain("default: 60000");
    expect(SimulationRequestSchema.parse(ScenarioDefaultsSchema.parse(defaults).parameters)).toEqual(DEFAULT_SIMULATION_REQUEST);
  });
});

describe("demo fixtures conform to the contract", () => {
  it.each([
    ["initial", initial],
    ["disrupted", disrupted],
    ["awaiting", awaiting],
    ["executed", executed],
  ])("batch fixture %s parses as BatchState", (_n, f) => {
    expect(() => BatchStateSchema.parse(f)).not.toThrow();
  });

  it("captured run, stored study, batch page and decisions parse", () => {
    expect(CreatedSimulationSchema.parse(run).result.runs.length).toBeGreaterThan(0);
    const study = SensitivityStudySchema.parse(sensitivity);
    expect(Object.keys(study)).toContain("baseline");
    for (const r of Object.values(study)) SimulationResultSchema.parse(r);
    expect(BatchPageSchema.parse(runBatches).batches.length).toBeGreaterThan(0);
    for (const d of Object.values(decisions as Record<string, Record<string, unknown>>)) {
      RunDecisionSchema.parse(d.pending);
      RunDecisionSchema.parse(d.approved);
    }
  });

  it("evidence fixture parses", () => {
    const e = EvidenceSchema.parse(evidence);
    expect(e.assumptions.length).toBeGreaterThan(0);
    expect(e.sources.length).toBeGreaterThan(0);
  });

  it("rejects payloads that drift from the contract", () => {
    const bad = structuredClone(initial) as Record<string, unknown>;
    delete bad.version;
    expect(BatchStateSchema.safeParse(bad).success).toBe(false);
  });
});
