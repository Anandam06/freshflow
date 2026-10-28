import type {
  ApprovalRequest,
  BatchPage,
  BatchState,
  CreatedSimulation,
  EventRequest,
  Evidence,
  Health,
  InvestigateRequest,
  RunDecision,
  SensitivityStudy,
  SimulationRequest,
  SimulationResult,
  StudyEntry,
  VersionRequest,
} from "@/types/api";

import type { Network, ShipmentPayload, ShipmentRequest, WorkbookRun } from "@/types/shipment";

export type DataMode = "live" | "demo";

export interface SimulationPreset {
  key: string;
  label: string;
  request: SimulationRequest;
}

export interface ClientCapabilities {
  /** Arbitrary EventRequest values (the demo adapter replays only the recorded default event). */
  customEvents: boolean;
  /** Demo only: the captured backend runs that can be replayed. Null = any valid request. */
  simulationPresets: SimulationPreset[] | null;
}

export interface ApiClient {
  readonly mode: DataMode;
  readonly label: string;
  readonly capabilities: ClientCapabilities;
  health(): Promise<Health>;
  getScenarioDefaults(): Promise<SimulationRequest>;
  getSensitivity(): Promise<SensitivityStudy | null>;
  /** The stored 30-seed validation study behind the Excel workbook; null when not published. */
  getStudies(): Promise<StudyEntry[] | null>;
  getStudy(id: string): Promise<SimulationResult>;
  runSimulation(req: SimulationRequest): Promise<CreatedSimulation>;
  getSimulation(id: string): Promise<SimulationResult>;
  listRunBatches(runId: string, offset: number, limit: number, rescueOnly?: boolean): Promise<BatchPage>;
  getRunDecision(runId: string, batchId: string): Promise<RunDecision>;
  approveRunDecision(runId: string, batchId: string, req: VersionRequest): Promise<RunDecision>;
  rejectRunDecision(runId: string, batchId: string, req: VersionRequest): Promise<RunDecision>;
  listBatches(): Promise<BatchState[]>;
  getBatch(id: string): Promise<BatchState>;
  injectEvent(id: string, req: EventRequest): Promise<BatchState>;
  investigate(id: string, req: InvestigateRequest): Promise<BatchState>;
  decide(id: string, req: ApprovalRequest): Promise<BatchState>;
  getEvidence(): Promise<Evidence>;
  // ---- shipment playground, Excel (API v1.3.0)
  getNetwork(): Promise<Network>;
  createShipment(req: ShipmentRequest): Promise<ShipmentPayload>;
  getShipment(id: string): Promise<ShipmentPayload>;
  decideShipment(id: string, req: ApprovalRequest): Promise<ShipmentPayload>;
  uploadWorkbook(filename: string, contentBase64: string): Promise<WorkbookRun>;
  getWorkbookRun(id: string): Promise<WorkbookRun>;
  /** Binary downloads (xlsx). */
  download(kind: DownloadKind): Promise<Blob>;
  /** Re-seed the dedicated demo batch T17 (POST /api/v1/batches/T17/reset; demo adapter restores its fixture). */
  resetDemo?: () => Promise<BatchState>;
}

export type DownloadKind =
  | { type: "template" }
  | { type: "shipment"; id: string }
  | { type: "comparison"; ids: string[] }
  | { type: "workbook"; id: string }
  | { type: "fleet"; id: string };

/** Dedicated interactive demo batch (research/assumptions.csv A26) — not row T17 of a random dataset. */
export const HERO_BATCH_ID = "T17";
