/**
 * UI → real backend journey. Skipped unless E2E_API is set, e.g.
 *   E2E_API=http://localhost:8000 npx vitest run tests/live.e2e.test.tsx
 * Requires a backend in development mode (no operator key) with the T17 demo batch.
 */
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes, Providers } from "@/app/App";
import { createHttpClient } from "@/services/http";

const API = process.env.E2E_API;

describe.skipIf(!API)("live backend journey", () => {
  it("drives the T17 rescue through the UI and the backend persists the change", { timeout: 120_000 }, async () => {
    const client = createHttpClient(API!);
    await client.resetDemo!();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/advanced/agent-demo"]}>
        <Providers client={client}>
          <AppRoutes />
        </Providers>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /inject disruption/i }, { timeout: 60_000 }));
    await waitFor(() => expect(screen.getByTestId("batch-status")).toHaveTextContent("Disruption detected"), { timeout: 20_000 });
    await user.click(screen.getByRole("button", { name: /run agent investigation/i }));
    await waitFor(() => expect(screen.getByTestId("batch-status")).toHaveTextContent("Awaiting approval"), { timeout: 20_000 });
    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /approve and execute/i }));
    await waitFor(() => expect(screen.getByTestId("destination")).toHaveTextContent("Wholesale B"), { timeout: 20_000 });

    const persisted = await client.getBatch("T17");
    expect(persisted.destination).toBe("Wholesale B");
    expect(persisted.trace.map((t) => t.tool)).toEqual(expect.arrayContaining(["optimize_destination", "validate_constraints", "human_approved", "execute_destination_change", "verify_execution"]));
    await client.resetDemo!();
  });

  it("runs a changed scenario from the Scenario studio on the backend and shows its results", { timeout: 240_000 }, async () => {
    const base = createHttpClient(API!);
    const calls: { id: string; batches: number; disruption: number }[] = [];
    const client = {
      ...base,
      runSimulation: async (req: Parameters<typeof base.runSimulation>[0]) => {
        const created = await base.runSimulation(req);
        calls.push({ id: created.id, batches: req.batches, disruption: req.disruption_probability });
        return created;
      },
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/advanced/scenarios"]}>
        <Providers client={client}>
          <AppRoutes />
        </Providers>
      </MemoryRouter>,
    );
    await waitFor(() => expect(calls.length).toBe(1), { timeout: 120_000 }); // initial default run
    const set = async (label: string, value: string) => {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    };
    await set("Batch count", "500");
    await set("Repetitions", "1");
    await set("Additional disruption shocks", "0.5");
    await user.click(screen.getByRole("button", { name: /run scenario/i }));
    await waitFor(() => expect(calls.length).toBe(2), { timeout: 120_000 });
    expect(calls[1]).toMatchObject({ batches: 500, disruption: 0.5 });
    const stored = await base.getSimulation(calls[1].id);
    expect(stored.config).toMatchObject({ batches: 500, repetitions: 1, disruption_probability: 0.5 });
    await waitFor(() => expect(screen.getAllByText(/Batches/).length).toBeGreaterThan(0));
    await waitFor(() => expect(document.body.textContent).toContain("Disruption prob.50%"), { timeout: 20_000 });
  });
});
