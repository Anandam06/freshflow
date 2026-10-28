import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes, Providers } from "@/app/App";
import { createMockClient } from "@/services/mock/mockClient";
import type { ApiClient } from "@/services/client";
import { formatINR } from "@/lib/format";
import { meanRun } from "@/lib/derive";
import { reportingBasis } from "@/components/results";

function renderAt(path: string, client: ApiClient = createMockClient({ latencyMs: 0 })) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers client={client}>
        <AppRoutes />
      </Providers>
    </MemoryRouter>,
  );
}

describe("Agentic decision replay", () => {
  it("runs disruption → investigation → approval and shows the changed shipment state", async () => {
    const user = userEvent.setup();
    renderAt("/advanced/agent-demo");

    await user.click(await screen.findByRole("button", { name: /inject disruption/i }, { timeout: 8000 }));
    await waitFor(() => expect(screen.getByTestId("batch-status")).toHaveTextContent("Disruption detected"));

    await user.click(screen.getByRole("button", { name: /run agent investigation/i }));
    await waitFor(() => expect(screen.getByTestId("batch-status")).toHaveTextContent("Awaiting approval"));
    expect(screen.getByText(/Proposal: move 500 kg/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /approve and execute/i }));

    await waitFor(() => expect(screen.getByTestId("destination")).toHaveTextContent("Wholesale B"));
    expect(screen.getByTestId("destination")).toHaveTextContent("Retailer A"); // struck-through original
    await user.click(screen.getByRole("button", { name: /show all steps/i }));
    const kinds = screen.getAllByTestId("trace-step").map((el) => el.dataset.kind);
    expect(kinds).toEqual(expect.arrayContaining(["prediction", "tool", "optimization", "policy", "human", "execution", "verification"]));
  });

  it("rejection keeps the original destination", async () => {
    const user = userEvent.setup();
    renderAt("/advanced/agent-demo", createMockClient({ latencyMs: 0, startState: "awaiting" }));
    await user.click(await screen.findByRole("button", { name: /^reject$/i }, { timeout: 8000 }));
    await user.click(within(await screen.findByRole("dialog", {}, { timeout: 8000 })).getByRole("button", { name: /reject proposal/i }));
    await waitFor(() => expect(screen.getByTestId("batch-status")).toHaveTextContent("Manual review"));
    expect(screen.getByTestId("destination")).toHaveTextContent("Retailer A");
  });

  it("disables approval until there is a proposal", async () => {
    renderAt("/advanced/agent-demo");
    expect(await screen.findByRole("button", { name: /^approve$/i }, { timeout: 8000 })).toBeDisabled();
    expect(screen.getByRole("button", { name: /run agent investigation/i })).toBeDisabled();
  });
});

describe("Executive overview", () => {
  it("shows backend values with provenance labels", async () => {
    const client = createMockClient({ latencyMs: 0 });
    const { result } = await client.runSimulation(await client.getScenarioDefaults());
    renderAt("/advanced", client);
    const headline = await screen.findByTestId("headline-profit", {}, { timeout: 8000 });
    // Default view: the mean over all repetitions (what the Excel workbook reports).
    expect(headline).toHaveTextContent(formatINR(meanRun(result.runs).metrics[3].incremental_profit_vs_m0_inr, { compact: true, signed: true }));
    expect(screen.getAllByTestId("reporting-basis")[0]).toHaveTextContent(
      /^Per simulated 30-day period of 2,000 batches \(~[\d,]+ tonnes\), averaged across 3 independent runs\.$/,
    );
    expect(screen.getAllByText("Synthetic simulation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Case target").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Demo data").length).toBeGreaterThan(0);
  });
});

describe("Scenario studio", () => {
  it("validates inputs against contract bounds before calling the backend", async () => {
    const base = createMockClient({ latencyMs: 0 });
    const runSimulation = vi.fn(base.runSimulation);
    const live: ApiClient = { ...base, mode: "live", capabilities: { customEvents: true, simulationPresets: null }, runSimulation };
    const user = userEvent.setup();
    renderAt("/advanced/scenarios", live);

    const batches = await screen.findByLabelText("Batch count", {}, { timeout: 8000 });
    await waitFor(() => expect(runSimulation).toHaveBeenCalledTimes(1)); // initial default run
    await user.clear(batches);
    await user.type(batches, "20000");
    expect(screen.getByRole("button", { name: /run scenario/i })).toBeDisabled();
    expect(screen.getByText(/less than or equal to 10000/i)).toBeInTheDocument();

    await user.clear(batches);
    await user.type(batches, "1000");
    await user.click(screen.getByRole("button", { name: /run scenario/i }));
    await waitFor(() => expect(runSimulation).toHaveBeenLastCalledWith(expect.objectContaining({ batches: 1000 })));
  });
});

describe("Risk & sensitivity", () => {
  it("reports scenarios where the agentic layer loses money, not only wins", async () => {
    renderAt("/advanced/risk");
    const baseline = await screen.findByTestId("scenario-baseline", {}, { timeout: 8000 });
    const pessimistic = await screen.findByTestId("scenario-pessimistic");
    expect(baseline).toHaveTextContent(/−₹/);
    expect(pessimistic).toHaveTextContent(/\+₹/);
  });
});

describe("Stored-run decision replay", () => {
  it("approves a captured run decision and records the trace", async () => {
    const client = createMockClient({ latencyMs: 0 });
    const { id } = await client.runSimulation(await client.getScenarioDefaults());
    const user = userEvent.setup();
    renderAt(`/advanced/agent-demo/run/${id}/T1`, client);
    await user.click(await screen.findByRole("button", { name: /^approve$/i }, { timeout: 8000 }));
    await user.click(within(await screen.findByRole("dialog", {}, { timeout: 8000 })).getByRole("button", { name: /^approve$/i }));
    await waitFor(() => expect(screen.getByTestId("batch-status")).toHaveTextContent("Monitoring"));
    expect(screen.getByText(/Simulated outcome in the run/)).toBeInTheDocument();
  });
});

describe("Reporting basis", () => {
  it("labels fleet amounts as per-period averages, never totals", async () => {
    const client = createMockClient({ latencyMs: 0 });
    const { result } = await client.runSimulation(await client.getScenarioDefaults());
    const thirty = { ...result, runs: Array.from({ length: 30 }, (_, i) => ({ ...result.runs[0], seed: 60000 + i })) };
    const avg = reportingBasis(thirty, -1);
    expect(avg.label).toBe(
      `Per simulated 30-day period of 2,000 batches (~${(Math.round(result.runs[0].metrics[0].input_kg / 10_000) * 10).toLocaleString("en-IN")} tonnes), averaged across 30 independent runs.`,
    );
    expect(avg.spoilage).toBe("Average of the 30 per-run spoilage rates.");
    const one = reportingBasis(thirty, 4);
    expect(one.averaged).toBe(false);
    expect(one.label).toContain("one run only (seed 60004), not an average");
  });
});
