import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes, Providers } from "@/app/App";
import { createMockClient } from "@/services/mock/mockClient";
import { WorkbookValidationError } from "@/services/errors";
import type { ApiClient } from "@/services/client";
import network from "@/services/mock/fixtures/network.json";
import proposed from "./fixtures/shipment-proposed.json";
import executed from "./fixtures/shipment-executed.json";
import escalated from "./fixtures/shipment-escalated.json";
import { NetworkSchema, ShipmentPayloadSchema } from "@/types/shipment";

// Leaflet needs a real layout engine; the map is replaced by a probe that exposes what it was asked to draw.
vi.mock("@/components/map/MumbaiMap", () => ({
  MumbaiMap: (p: { routes?: { kind: string; label: string }[]; recommendedBuyerId?: string | null }) => (
    <div data-testid="map-probe" data-recommended={p.recommendedBuyerId ?? ""}>
      {(p.routes ?? []).map((r) => (
        <span key={r.kind + r.label} data-kind={r.kind}>
          {r.label}
        </span>
      ))}
    </div>
  ),
  routeGeometry: () => [],
}));

function stubClient(overrides: Partial<ApiClient> = {}) {
  const base = createMockClient({ latencyMs: 0 });
  const createShipment = vi.fn(async () => ShipmentPayloadSchema.parse(proposed));
  const decideShipment = vi.fn(async () => ShipmentPayloadSchema.parse(executed));
  const client: ApiClient = {
    ...base,
    mode: "live",
    getNetwork: async () => NetworkSchema.parse(network),
    createShipment,
    decideShipment,
    getShipment: async () => ShipmentPayloadSchema.parse(proposed),
    ...overrides,
  };
  return { client, createShipment, decideShipment };
}

function renderAt(path: string, client: ApiClient) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers client={client}>
        <AppRoutes />
      </Providers>
    </MemoryRouter>,
  );
}

const T = { timeout: 8000 };

describe("Scenario playground — the main journey", () => {
  it("tomato · Turbhe → buyer · heavy traffic + temperature rise → run → see what happened → approve", async () => {
    const { client, createShipment, decideShipment } = stubClient();
    const user = userEvent.setup();
    renderAt("/playground?step=1", client);

    // Step 1: produce
    const tomato = await screen.findByRole("button", { name: /tomato/i, pressed: true }, T);
    expect(tomato).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^next/i }));
    // Step 2: route (defaults: Turbhe APMC vegetable market → Supermarket Andheri West)
    expect(await screen.findByRole("button", { name: /Turbhe APMC – Vegetable Market/, pressed: true }, T)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^next/i }));
    // Step 3: disruptions
    await user.click(await screen.findByRole("button", { name: /Heavy Traffic/ }, T));
    await user.click(screen.getByRole("radio", { name: /high/i }));
    await user.click(screen.getByRole("button", { name: /Temperature Rise/ }));
    const tempGroup = screen.getByRole("radiogroup", { name: /Temperature Rise severity/ });
    await user.click(within(tempGroup).getByRole("radio", { name: /high/i }));
    await user.click(screen.getByRole("button", { name: /^next/i }));
    // Step 4: run
    await user.click(await screen.findByRole("button", { name: /Run FreshFlow Simulation/ }, T));
    await waitFor(() => expect(createShipment).toHaveBeenCalledTimes(2)); // home baseline + this run
    expect(createShipment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commodity_id: "tomato",
        origin_id: "H1",
        buyer_id: "B02",
        disruptions: [
          { type: "heavy_traffic", severity: "high" },
          { type: "temperature_rise", severity: "high" },
        ],
      }),
    );

    // Step 5: results come from the backend payload
    const narrative = await screen.findByTestId("narrative", {}, T);
    for (const line of proposed.narrative) expect(narrative).toHaveTextContent(line);
    expect(screen.getByTestId("decision-card")).toHaveAttribute("data-status", "proposed_awaiting_approval");
    const probe = screen.getByTestId("map-probe");
    expect(within(probe).getByText(/Original route/)).toHaveAttribute("data-kind", "original");
    expect(probe).toHaveAttribute("data-recommended", proposed.strategies.D.buyer_id);
    expect(screen.getAllByTestId("agent-step").map((e) => e.dataset.tool)).toEqual(proposed.state.trace.map((t) => t.tool));

    // A vs D by default, all four on request
    expect(screen.queryByText("Freshness-Aware")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Compare all four/ }));
    expect(screen.getAllByText("Freshness-Aware").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Smart Optimization").length).toBeGreaterThan(0);

    // Approve → backend decision recorded
    await user.click(screen.getByRole("button", { name: /Approve diversion/ }));
    await waitFor(() => expect(decideShipment).toHaveBeenCalledWith(proposed.id, { approve: true, expected_version: proposed.state.version }));
    await waitFor(() => expect(screen.getByTestId("decision-card")).toHaveAttribute("data-status", "executed"));
  }, 30000);

  it("explains strategies B and C on hover and on tap", async () => {
    const { client } = stubClient();
    const user = userEvent.setup();
    renderAt("/playground?step=5&shipment=x", client);
    await screen.findByTestId("narrative", {}, T);
    await user.click(screen.getByRole("button", { name: /Compare all four/ }));
    const c = screen.getAllByRole("button", { name: /Smart Optimization/ })[0];
    fireEvent.mouseEnter(c.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/cannot react after the truck leaves/i);
    fireEvent.mouseLeave(c.parentElement!);
    const b = screen.getAllByRole("button", { name: /Freshness-Aware/ })[0];
    await user.click(b);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/first-expiring stock first/i);
  });

  it("shows an honest failure when FreshFlow cannot rescue the shipment", async () => {
    const { client } = stubClient({ getShipment: async () => ShipmentPayloadSchema.parse(escalated) });
    renderAt("/playground?step=5&shipment=x", client);
    const card = await screen.findByTestId("decision-card", {}, T);
    expect(card).toHaveAttribute("data-status", "no_feasible_alternative");
    expect(card).toHaveTextContent(/could not rescue/i);
    expect(screen.queryByRole("button", { name: /Approve diversion/ })).not.toBeInTheDocument();
  });

  it("flags results as stale when inputs change after a run", async () => {
    const { client } = stubClient();
    const user = userEvent.setup();
    renderAt("/playground?step=5&shipment=x", client);
    await screen.findByTestId("narrative", {}, T);
    await user.click(screen.getByRole("button", { name: /Choose produce/ }));
    await user.click(await screen.findByRole("button", { name: /Mango/ }, T));
    await user.click(screen.getByRole("button", { name: /See what happened/ }));
    expect(await screen.findByText(/You changed the inputs/, {}, T)).toBeInTheDocument();
  });
});

describe("Home", () => {
  it("shows the backend's baseline shipment and one primary action", async () => {
    const { client } = stubClient();
    renderAt("/", client);
    expect(await screen.findByRole("heading", { name: "See how FreshFlow saves your produce." }, T)).toBeInTheDocument();
    const aside = await screen.findByRole("complementary", { name: "Selected shipment" }, T);
    await waitFor(() => expect(aside).toHaveTextContent(proposed.strategies.A.buyer_name));
    expect(screen.getAllByRole("link", { name: /Test a Disruption/ })[0]).toHaveAttribute("href", "/playground?step=3");
  });
});

describe("Data & reports", () => {
  it("lists row-level problems for an invalid workbook", async () => {
    const { client } = stubClient({
      uploadWorkbook: async () => {
        throw new WorkbookValidationError("The workbook has problems. Fix the rows below and upload again.", [
          { sheet: "Batch_Inventory", row: 5, column: "quantity_kg", message: "-5.0 must be greater than 0" },
          { sheet: "Buyer_Capacity", row: null, column: null, message: "Required sheet is missing" },
        ]);
      },
    });
    const user = userEvent.setup();
    renderAt("/data", client);
    const input = await screen.findByLabelText(/Choose a file/, {}, T);
    await user.upload(input, new File(["x"], "bad.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const table = await screen.findByTestId("upload-errors", {}, T);
    expect(table).toHaveTextContent("Batch_Inventory");
    expect(table).toHaveTextContent("-5.0 must be greater than 0");
    expect(table).toHaveTextContent("Required sheet is missing");
  });
});
