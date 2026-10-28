/**
 * Demo-data adapter. Replays verbatim API responses captured from Codex's backend
 * (scripts/sync_fixtures.py drives the real FastAPI app) and never computes metrics itself:
 *  - simulations: the captured default run plus the stored sensitivity study, offered as presets;
 *    any other parameter combination is refused, not approximated;
 *  - run batches/decisions: the captured first page and the captured pending/approved/rejected
 *    responses for a handful of batches;
 *  - T17: shared/fixtures/batch-*.json executed API examples.
 * Every screen shows a "Demo data" label while this adapter is active.
 */
import { z } from "zod";
import {
  BatchPageSchema,
  BatchStateSchema,
  CreatedSimulationSchema,
  DEFAULT_EVENT_REQUEST,
  EvidenceSchema,
  HealthSchema,
  RunDecisionSchema,
  ScenarioDefaultsSchema,
  SensitivityStudySchema,
  SimulationRequestSchema,
  type BatchState,
  type RunDecision,
  type SimulationRequest,
  type SimulationResult,
} from "@/types/api";
import type { ApiClient, SimulationPreset } from "../client";
import { NetworkSchema } from "@/types/shipment";
import { HERO_BATCH_ID } from "../client";
import { ApiError, DemoUnsupportedError } from "../errors";
import awaitingFixture from "./fixtures/batch-awaiting-approval.json";
import disruptedFixture from "./fixtures/batch-disrupted.json";
import executedFixture from "./fixtures/batch-executed.json";
import initialFixture from "./fixtures/batch-initial.json";
import evidenceFixture from "./fixtures/evidence.json";
import healthFixture from "./fixtures/health.json";
import defaultsFixture from "./fixtures/scenario-defaults.json";
import runFixture from "./fixtures/run.json";

export type DemoStartState = "initial" | "disrupted" | "awaiting" | "executed";

export interface MockOptions {
  latencyMs?: number;
  /** Recorded fixture to start from (presenter deep link: ?demoState=executed). */
  startState?: DemoStartState;
}

const SCENARIO_LABELS: Record<string, string> = {
  baseline: "Stored study · baseline (10 repetitions)",
  optimistic: "Stored study · optimistic",
  pessimistic: "Stored study · pessimistic",
  lower_buyer_availability: "Stored study · lower buyer availability",
  higher_temperature: "Stored study · higher temperature",
};

/** Canonical key for exact request matching (key order independent). */
export function requestKey(req: SimulationRequest): string {
  return JSON.stringify(Object.fromEntries(Object.entries(req).sort(([a], [b]) => a.localeCompare(b))));
}

const DecisionSetSchema = z.record(z.object({ pending: RunDecisionSchema, approved: RunDecisionSchema, rejected: RunDecisionSchema.optional() }));

let sensitivityPromise: Promise<Record<string, SimulationResult> | null> | null = null;
function loadSensitivity() {
  sensitivityPromise ??= import("./fixtures/sensitivity.json").then((m) => {
    const raw = (m.default ?? m) as unknown;
    return raw ? SensitivityStudySchema.parse(raw) : null;
  });
  return sensitivityPromise;
}

export function createMockClient(opts: MockOptions = {}): ApiClient {
  const latency = opts.latencyMs ?? 350;
  const hero = {
    initial: BatchStateSchema.parse(initialFixture),
    disrupted: BatchStateSchema.parse(disruptedFixture),
    awaiting: BatchStateSchema.parse(awaitingFixture),
    executed: BatchStateSchema.parse(executedFixture),
  };
  const evidence = EvidenceSchema.parse(evidenceFixture);
  const defaults = SimulationRequestSchema.parse(ScenarioDefaultsSchema.parse(defaultsFixture).parameters);
  const baseRun = CreatedSimulationSchema.parse(runFixture);
  const baseRequest = SimulationRequestSchema.parse(baseRun.result.config);
  // Large captures load on first use so they never weigh on the main bundle.
  const runFixtures = Promise.all([import("./fixtures/run-batches.json"), import("./fixtures/run-decisions.json")]).then(([b, d]) => {
    const decisionSet = DecisionSetSchema.parse(d.default ?? d);
    for (const [id, x] of Object.entries(decisionSet)) if (!decisions.has(id)) decisions.set(id, x.pending);
    return { page: BatchPageSchema.parse(b.default ?? b), decisionSet };
  });

  const presets: SimulationPreset[] = [{ key: "default-run", label: "Calibrated defaults (3 repetitions)", request: baseRequest }];
  const runs = new Map<string, SimulationResult>([[baseRun.id, baseRun.result]]);
  const decisions = new Map<string, RunDecision>();
  let state: BatchState = structuredClone(hero[opts.startState ?? "initial"]);

  // Stored-study presets become available once the lazily loaded study resolves.
  const studyReady = loadSensitivity().then((study) => {
    for (const [key, result] of Object.entries(study ?? {})) {
      const request = SimulationRequestSchema.safeParse(result.config);
      if (!request.success) continue;
      presets.push({ key, label: SCENARIO_LABELS[key] ?? `Stored study · ${key.replace(/_/g, " ")}`, request: request.data });
      runs.set(`study:${key}`, result);
    }
    return study;
  });

  const wait = <T>(value: T): Promise<T> =>
    latency > 0 ? new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), latency)) : Promise.resolve(structuredClone(value));
  const setHero = (next: BatchState) => {
    state = structuredClone(next);
    return wait(state);
  };
  const requireHero = (id: string, path: string) => {
    if (id !== HERO_BATCH_ID) throw new ApiError(404, "Resource not found", path);
  };
  const requireDecision = async (runId: string, batchId: string) => {
    await runFixtures;
    if (runId !== baseRun.id) throw new DemoUnsupportedError("Demo data contains batch decisions for the captured default run only.");
    const d = decisions.get(batchId);
    if (!d) throw new DemoUnsupportedError(`Demo data captured interactive decisions for ${[...decisions.keys()].join(", ")} only. Connect the backend for others.`);
    return d;
  };

  return {
    mode: "demo",
    label: "Demo data · replayed backend responses",
    capabilities: { customEvents: false, simulationPresets: presets },

    health: () => wait(HealthSchema.parse(healthFixture)),
    getScenarioDefaults: () => wait(defaults),
    getSensitivity: () => studyReady.then(wait),

    async runSimulation(req) {
      await studyReady;
      const key = requestKey(SimulationRequestSchema.parse(req));
      const preset = presets.find((p) => requestKey(p.request) === key);
      if (!preset) throw new DemoUnsupportedError("Demo data can replay only the captured scenarios listed in the preset menu. Connect the backend to run other parameters.");
      const id = preset.key === "default-run" ? baseRun.id : `study:${preset.key}`;
      return wait({ id, result: runs.get(id)! });
    },

    async getSimulation(id) {
      await studyReady;
      const r = runs.get(id);
      if (!r) throw new ApiError(404, "Resource not found", `/api/v1/simulations/${id}`);
      return wait(r);
    },

    async listRunBatches(runId, offset, limit, rescueOnly) {
      if (runId !== baseRun.id) throw new DemoUnsupportedError("Demo data contains the batch audit for the captured default run only.");
      const { page } = await runFixtures;
      const records = rescueOnly ? page.batches.filter((b) => b.simulated_m3?.rescue_attempt) : page.batches;
      return wait({ ...page, offset, limit, total: records.length, batches: records.slice(offset, offset + limit) });
    },

    getRunDecision: async (runId, batchId) => wait(await requireDecision(runId, batchId)),

    async approveRunDecision(runId, batchId, req) {
      const d = await requireDecision(runId, batchId);
      const { decisionSet } = await runFixtures;
      const path = `/api/v1/simulations/${runId}/decisions/${batchId}/approve`;
      if (req.expected_version !== d.state.version) throw new ApiError(409, "Version conflict", path);
      if (d.state.status !== "awaiting_approval") throw new ApiError(409, "No pending proposal", path);
      const next = decisionSet[batchId].approved;
      decisions.set(batchId, next);
      return wait(next);
    },

    async rejectRunDecision(runId, batchId, req) {
      const d = await requireDecision(runId, batchId);
      const { decisionSet } = await runFixtures;
      const path = `/api/v1/simulations/${runId}/decisions/${batchId}/reject`;
      if (req.expected_version !== d.state.version) throw new ApiError(409, "Version conflict", path);
      if (d.state.status !== "awaiting_approval") throw new ApiError(409, "No pending proposal", path);
      const next = decisionSet[batchId].rejected;
      if (!next) throw new DemoUnsupportedError("No recorded rejection for this batch.");
      decisions.set(batchId, next);
      return wait(next);
    },

    listBatches: () => wait([state]),

    async getBatch(id) {
      requireHero(id, `/api/v1/batches/${id}`);
      return wait(state);
    },

    async injectEvent(id, req) {
      requireHero(id, `/api/v1/batches/${id}/events`);
      if (JSON.stringify(req) !== JSON.stringify(DEFAULT_EVENT_REQUEST)) {
        throw new DemoUnsupportedError("Demo data replays only the recorded default disruption (35 °C for 6 h, 12 h delay, no safety hold).");
      }
      if (state.version !== hero.initial.version) throw new DemoUnsupportedError("Demo data contains one recorded disruption. Reset the demo to replay it.");
      return setHero(hero.disrupted);
    },

    async investigate(id, req) {
      requireHero(id, `/api/v1/batches/${id}/investigate`);
      if (req.mode === "live") throw new DemoUnsupportedError("The live LLM agent runs only on the backend. Demo data contains the deterministic investigation.");
      if (state.status !== "event_detected") throw new ApiError(409, "A new event is required before investigation", `/api/v1/batches/${id}/investigate`);
      return setHero(hero.awaiting);
    },

    async decide(id, req) {
      const path = `/api/v1/batches/${id}/approval`;
      requireHero(id, path);
      if (req.expected_version !== state.version) throw new ApiError(409, "Version conflict", path);
      if (state.status !== "awaiting_approval" || !state.proposal) throw new ApiError(409, "No pending proposal", path);
      if (req.approve) return setHero(hero.executed);
      // No recorded fixture for this branch; mirrors backend agent.approve(approved=False).
      return setHero({
        ...state,
        version: state.version + 1,
        status: "manual_review",
        proposal: null,
        trace: [
          ...state.trace,
          { sequence: state.trace.length + 1, timestamp: new Date().toISOString(), tool: "human_rejected", inputs: {}, result: { destination: state.destination } },
        ],
      });
    },

    getEvidence: () => wait(evidence),
    getNetwork: async () => wait(NetworkSchema.parse((await import("./fixtures/network.json")).default)),
    createShipment: async () => {
      throw new DemoUnsupportedError("The shipment playground runs on the backend. Start the API (see README) to run a scenario.");
    },
    getShipment: async () => {
      throw new DemoUnsupportedError("Shipment results come from the backend.");
    },
    decideShipment: async () => {
      throw new DemoUnsupportedError("Approvals are recorded by the backend.");
    },
    uploadWorkbook: async () => {
      throw new DemoUnsupportedError("Workbook upload needs the backend.");
    },
    getWorkbookRun: async () => {
      throw new DemoUnsupportedError("Workbook runs live on the backend.");
    },
    download: async () => {
      throw new DemoUnsupportedError("Excel files are generated by the backend.");
    },
    resetDemo: () => setHero(hero.initial),
  };
}
