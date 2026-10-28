import { describe, expect, it } from "vitest";
import { createMockClient } from "@/services/mock/mockClient";
import { ApiError, DemoUnsupportedError } from "@/services/errors";
import { DEFAULT_EVENT_REQUEST } from "@/types/api";

describe("demo adapter: T17 journey replays recorded backend states", () => {
  it("walks event → investigate → approve and changes the destination", async () => {
    const c = createMockClient({ latencyMs: 0 });
    const s0 = await c.getBatch("T17");
    expect(s0.destination).toBe("Retailer A");
    expect(s0.status).toBe("monitoring");

    const s1 = await c.injectEvent("T17", DEFAULT_EVENT_REQUEST);
    expect(s1.status).toBe("event_detected");

    const s2 = await c.investigate("T17", { mode: "deterministic" });
    expect(s2.status).toBe("awaiting_approval");
    expect(s2.proposal?.id).toBe("Wholesale B");
    expect(s2.trace.map((t) => t.tool)).toEqual(
      expect.arrayContaining(["get_batch_state", "predict_remaining_shelf_life", "get_buyer_options", "calculate_route_eta", "optimize_destination", "validate_constraints", "request_human_approval"]),
    );

    const s3 = await c.decide("T17", { approve: true, expected_version: s2.version });
    expect(s3.destination).toBe("Wholesale B");
    expect(s3.trace.at(-1)?.tool).toBe("verify_execution");
  });

  it("refuses a stale approval with 409 and does not execute", async () => {
    const c = createMockClient({ latencyMs: 0, startState: "awaiting" });
    const s = await c.getBatch("T17");
    await expect(c.decide("T17", { approve: true, expected_version: s.version - 1 })).rejects.toMatchObject({ status: 409 });
    expect((await c.getBatch("T17")).destination).toBe("Retailer A");
  });

  it("rejection keeps the destination and moves to manual review", async () => {
    const c = createMockClient({ latencyMs: 0, startState: "awaiting" });
    const s = await c.getBatch("T17");
    const r = await c.decide("T17", { approve: false, expected_version: s.version });
    expect(r.status).toBe("manual_review");
    expect(r.destination).toBe("Retailer A");
    expect(r.proposal).toBeNull();
    expect(r.trace.at(-1)?.tool).toBe("human_rejected");
  });

  it("does not pretend to run the live LLM agent", async () => {
    const c = createMockClient({ latencyMs: 0, startState: "disrupted" });
    await expect(c.investigate("T17", { mode: "live" })).rejects.toBeInstanceOf(DemoUnsupportedError);
  });

  it("investigation requires a detected event", async () => {
    const c = createMockClient({ latencyMs: 0 });
    await expect(c.investigate("T17", { mode: "deterministic" })).rejects.toBeInstanceOf(ApiError);
  });

  it("refuses custom events it has no recording for", async () => {
    const c = createMockClient({ latencyMs: 0 });
    await expect(c.injectEvent("T17", { ...DEFAULT_EVENT_REQUEST, temperature_c: 40 })).rejects.toBeInstanceOf(DemoUnsupportedError);
  });

  it("returns 404 for unknown batches", async () => {
    await expect(createMockClient({ latencyMs: 0 }).getBatch("T99")).rejects.toMatchObject({ status: 404 });
  });

  it("reset restores the initial recorded state", async () => {
    const c = createMockClient({ latencyMs: 0, startState: "executed" });
    const s = await c.resetDemo!();
    expect(s.destination).toBe("Retailer A");
    expect(s.version).toBe(0);
  });
});

describe("demo adapter: simulations replay captured backend runs", () => {
  it("serves the captured run for the backend's scenario defaults", async () => {
    const c = createMockClient({ latencyMs: 0 });
    const defaults = await c.getScenarioDefaults();
    const { id, result } = await c.runSimulation(defaults);
    expect(result.evidence_category).toBe("SIMULATED RESULT");
    expect(result.config).toMatchObject(defaults);
    expect(await c.getSimulation(id)).toEqual(result);
  });

  it("offers the stored sensitivity study as presets", async () => {
    const c = createMockClient({ latencyMs: 0 });
    const study = await c.getSensitivity();
    expect(study && Object.keys(study)).toContain("pessimistic");
    const preset = c.capabilities.simulationPresets!.find((p) => p.key === "pessimistic")!;
    expect((await c.runSimulation(preset.request)).result.config).toMatchObject(preset.request);
  });

  it("refuses uncaptured parameters instead of approximating", async () => {
    const c = createMockClient({ latencyMs: 0 });
    const defaults = await c.getScenarioDefaults();
    await expect(c.runSimulation({ ...defaults, traffic_multiplier: 1.7 })).rejects.toBeInstanceOf(DemoUnsupportedError);
  });
});

describe("demo adapter: stored-run decisions", () => {
  it("pages run batches and replays approve with version checks", async () => {
    const c = createMockClient({ latencyMs: 0 });
    const { id } = await c.runSimulation(await c.getScenarioDefaults());
    const page = await c.listRunBatches(id, 0, 10);
    expect(page.batches).toHaveLength(10);
    const d = await c.getRunDecision(id, "T1");
    expect(d.state.status).toBe("awaiting_approval");
    await expect(c.approveRunDecision(id, "T1", { expected_version: d.state.version + 1 })).rejects.toMatchObject({ status: 409 });
    const approved = await c.approveRunDecision(id, "T1", { expected_version: d.state.version });
    expect(approved.state.trace.map((t) => t.tool)).toContain("execute_reroute");
    await expect(c.rejectRunDecision(id, "T1", { expected_version: approved.state.version })).rejects.toMatchObject({ status: 409 });
  });

  it("rejection branch is a recorded backend response", async () => {
    const c = createMockClient({ latencyMs: 0 });
    const { id } = await c.runSimulation(await c.getScenarioDefaults());
    const d = await c.getRunDecision(id, "T2");
    const r = await c.rejectRunDecision(id, "T2", { expected_version: d.state.version });
    expect(r.state.status).toBe("manual_review");
  });
});
