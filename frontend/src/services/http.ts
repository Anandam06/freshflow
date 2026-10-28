import { z } from "zod";
import {
  BatchPageSchema,
  BatchStateSchema,
  CreatedSimulationSchema,
  EvidenceSchema,
  HealthSchema,
  RunDecisionSchema,
  ScenarioDefaultsSchema,
  SensitivityStudySchema,
  SimulationRequestSchema,
  SimulationResultSchema,
  StudyEntrySchema,
  type ApprovalRequest,
  type EventRequest,
  type InvestigateRequest,
  type SimulationRequest,
  type VersionRequest,
} from "@/types/api";
import { HERO_BATCH_ID, type ApiClient, type DownloadKind } from "./client";
import { NetworkSchema, ShipmentPayloadSchema, WorkbookRunSchema } from "@/types/shipment";
import { endpoints } from "./endpoints";
import { ApiError, ContractError, WorkbookValidationError } from "./errors";
import { getOperatorKey } from "./operatorKey";

type Fetch = typeof fetch;

/** Live adapter: every number shown in live mode comes from these responses, validated against the contract. */
export function createHttpClient(baseUrl: string, fetchImpl: Fetch = (input, init) => fetch(input, init)): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function request<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init?.body) headers["Content-Type"] = "application/json";
    const key = init?.method === "POST" ? getOperatorKey() : null;
    if (key) headers["X-Operator-Key"] = key;
    const res = await fetchImpl(base + path, { ...init, headers });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError(res.status, "Response was not valid JSON", path);
      }
    }
    if (!res.ok) throw new ApiError(res.status, extractDetail(body) ?? (res.statusText || "Request failed"), path, body);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ContractError(path, parsed.error.issues);
    return parsed.data;
  }

  const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

  return {
    mode: "live",
    label: `Live API · ${base.replace(/^https?:\/\//, "")}`,
    capabilities: { customEvents: true, simulationPresets: null },
    health: () => request(HealthSchema, endpoints.health()),
    async getScenarioDefaults() {
      const d = await request(ScenarioDefaultsSchema, endpoints.scenarioDefaults());
      const parsed = SimulationRequestSchema.safeParse(d.parameters);
      if (!parsed.success) throw new ContractError(endpoints.scenarioDefaults(), parsed.error.issues);
      return parsed.data;
    },
    async getSensitivity() {
      try {
        return await request(SensitivityStudySchema, endpoints.sensitivity());
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null; // study not generated on this deployment
        throw e;
      }
    },
    async getStudies() {
      try {
        return await request(z.array(StudyEntrySchema), endpoints.studies());
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null; // study not published on this deployment
        throw e;
      }
    },
    getStudy: (id) => request(SimulationResultSchema, endpoints.study(id)),
    runSimulation: (req: SimulationRequest) => request(CreatedSimulationSchema, endpoints.simulations(), post(req)),
    getSimulation: (id) => request(SimulationResultSchema, endpoints.simulation(id)),
    listRunBatches: (runId, offset, limit, rescueOnly) => request(BatchPageSchema, endpoints.runBatches(runId, offset, limit, rescueOnly)),
    getRunDecision: (runId, batchId) => request(RunDecisionSchema, endpoints.runDecision(runId, batchId)),
    approveRunDecision: (runId, batchId, req: VersionRequest) => request(RunDecisionSchema, endpoints.runDecisionApprove(runId, batchId), post(req)),
    rejectRunDecision: (runId, batchId, req: VersionRequest) => request(RunDecisionSchema, endpoints.runDecisionReject(runId, batchId), post(req)),
    listBatches: () => request(z.array(BatchStateSchema), endpoints.batches()),
    getBatch: (id) => request(BatchStateSchema, endpoints.batch(id)),
    injectEvent: (id, req: EventRequest) => request(BatchStateSchema, endpoints.batchEvent(id), post(req)),
    investigate: (id, req: InvestigateRequest) => request(BatchStateSchema, endpoints.batchInvestigate(id), post(req)),
    decide: (id, req: ApprovalRequest) => request(BatchStateSchema, endpoints.batchApproval(id), post(req)),
    getEvidence: () => request(EvidenceSchema, endpoints.evidence()),
    resetDemo: () => request(BatchStateSchema, endpoints.batchReset(HERO_BATCH_ID), post({})),
    getNetwork: () => request(NetworkSchema, endpoints.network()),
    createShipment: (req) => request(ShipmentPayloadSchema, endpoints.shipments(), post(req)),
    getShipment: (id) => request(ShipmentPayloadSchema, endpoints.shipment(id)),
    decideShipment: (id, req) => request(ShipmentPayloadSchema, endpoints.shipmentApproval(id), post(req)),
    async uploadWorkbook(filename, contentBase64) {
      try {
        return await request(WorkbookRunSchema, endpoints.excelUpload(), post({ filename, content_base64: contentBase64 }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 422 && e.payload && typeof e.payload === "object") {
          const d = (e.payload as { detail?: { message?: string; errors?: never[] } }).detail;
          if (d && Array.isArray(d.errors)) throw new WorkbookValidationError(d.message ?? "Workbook needs fixes", d.errors);
        }
        throw e;
      }
    },
    getWorkbookRun: (id) => request(WorkbookRunSchema, endpoints.workbookRun(id)),
    async download(kind: DownloadKind) {
      const path =
        kind.type === "template"
          ? endpoints.excelTemplate()
          : kind.type === "shipment"
            ? endpoints.shipmentExport(kind.id)
            : kind.type === "comparison"
              ? endpoints.comparisonExport()
              : kind.type === "workbook"
                ? endpoints.workbookExport(kind.id)
                : endpoints.fleetExport(kind.id);
      const init: RequestInit = kind.type === "comparison" ? post({ shipment_ids: kind.ids }) : {};
      const headers: Record<string, string> = {};
      if (init.body) headers["Content-Type"] = "application/json";
      const res = await fetchImpl(base + path, { ...init, headers });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, extractDetail(body) ?? res.statusText, path, body);
      }
      return res.blob();
    },
  };
}

/** FastAPI errors: {"detail": "..."} or {"detail": [{loc, msg}, ...]}. */
export function extractDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string };
        const loc = (item.loc ?? []).filter((l) => l !== "body").join(".");
        return loc ? `${loc}: ${item.msg ?? "invalid"}` : (item.msg ?? "invalid");
      })
      .join("; ");
  }
  return null;
}
