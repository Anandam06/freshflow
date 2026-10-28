import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "@/services/http";
import { ApiError, ContractError, describeError } from "@/services/errors";
import { setOperatorKey } from "@/services/operatorKey";
import initial from "@/services/mock/fixtures/batch-initial.json";
import { DEFAULT_SIMULATION_REQUEST } from "@/types/api";

function stubFetch(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

describe("http client", () => {
  it("uses /api/v1 paths and strips trailing slashes from the base URL", async () => {
    const f = stubFetch(200, initial);
    await createHttpClient("https://api.example.com/", f).getBatch("T17");
    expect(f.mock.calls[0][0]).toBe("https://api.example.com/api/v1/batches/T17");
  });

  it("sends X-Operator-Key on POST only, never on GET", async () => {
    setOperatorKey("secret-key");
    const f = stubFetch(200, initial);
    const c = createHttpClient("http://x", f);
    await c.getBatch("T17");
    await c.injectEvent("T17", { temperature_c: 35, duration_hours: 6, delay_hours: 12, safety_hold: false });
    const getHeaders = f.mock.calls[0][1]?.headers as Record<string, string>;
    const postHeaders = f.mock.calls[1][1]?.headers as Record<string, string>;
    expect(getHeaders["X-Operator-Key"]).toBeUndefined();
    expect(postHeaders["X-Operator-Key"]).toBe("secret-key");
    expect(f.mock.calls[1][1]?.method).toBe("POST");
  });

  it("surfaces FastAPI 422 validation details", async () => {
    const f = stubFetch(422, { detail: [{ loc: ["body", "batches"], msg: "Input should be less than or equal to 10000", type: "x" }] });
    const err = await createHttpClient("http://x", f)
      .runSimulation(DEFAULT_SIMULATION_REQUEST)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("batches: Input should be less than or equal to 10000");
  });

  it("builds run-scoped paths", async () => {
    const f = stubFetch(404, { detail: "Resource not found" });
    const c = createHttpClient("http://x", f);
    await c.listRunBatches("run 1", 25, 25).catch(() => undefined);
    expect(f.mock.calls[0][0]).toBe("http://x/api/v1/simulations/run%201/batches?offset=25&limit=25");
    expect(await c.getSensitivity()).toBeNull(); // study not generated → null, not an error
  });

  it("maps 409 to a reload instruction", async () => {
    const err = await createHttpClient("http://x", stubFetch(409, { detail: "Version conflict" }))
      .decide("T17", { approve: true, expected_version: 1 })
      .catch((e) => e);
    expect(describeError(err).title).toBe("Batch state changed");
  });

  it("raises ContractError when a response drifts from the contract", async () => {
    const err = await createHttpClient("http://x", stubFetch(200, { ...initial, version: "three" }))
      .getBatch("T17")
      .catch((e) => e);
    expect(err).toBeInstanceOf(ContractError);
    expect(err.message).toContain("version");
  });
});
