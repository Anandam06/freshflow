/** Backend routes — shared/api-contract.yaml v1.1.0. Change paths here only. */
const v1 = "/api/v1";
const e = encodeURIComponent;

export const endpoints = {
  health: () => `${v1}/health`,
  scenarioDefaults: () => `${v1}/scenarios/defaults`,
  sensitivity: () => `${v1}/scenarios/sensitivity`,
  simulations: () => `${v1}/simulations`,
  simulation: (runId: string) => `${v1}/simulations/${e(runId)}`,
  runBatches: (runId: string, offset: number, limit: number, rescueOnly = false) =>
    `${v1}/simulations/${e(runId)}/batches?offset=${offset}&limit=${limit}${rescueOnly ? "&rescue_only=true" : ""}`,
  runDecision: (runId: string, batchId: string) => `${v1}/simulations/${e(runId)}/decisions/${e(batchId)}`,
  runDecisionApprove: (runId: string, batchId: string) => `${v1}/simulations/${e(runId)}/decisions/${e(batchId)}/approve`,
  runDecisionReject: (runId: string, batchId: string) => `${v1}/simulations/${e(runId)}/decisions/${e(batchId)}/reject`,
  batches: () => `${v1}/batches`,
  batch: (id: string) => `${v1}/batches/${e(id)}`,
  batchEvent: (id: string) => `${v1}/batches/${e(id)}/events`,
  batchInvestigate: (id: string) => `${v1}/batches/${e(id)}/investigate`,
  batchApproval: (id: string) => `${v1}/batches/${e(id)}/approval`,
  batchReset: (id: string) => `${v1}/batches/${e(id)}/reset`,
  evidence: () => `${v1}/evidence`,
  network: () => `${v1}/network`,
  shipments: () => `${v1}/shipments`,
  shipment: (id: string) => `${v1}/shipments/${e(id)}`,
  shipmentApproval: (id: string) => `${v1}/shipments/${e(id)}/approval`,
  shipmentExport: (id: string) => `${v1}/shipments/${e(id)}/export.xlsx`,
  comparisonExport: () => `${v1}/exports/comparison`,
  excelTemplate: () => `${v1}/excel/template`,
  excelUpload: () => `${v1}/excel/upload`,
  workbookRun: (id: string) => `${v1}/workbook-runs/${e(id)}`,
  workbookExport: (id: string) => `${v1}/workbook-runs/${e(id)}/export.xlsx`,
  fleetExport: (id: string) => `${v1}/simulations/${e(id)}/export.xlsx`,
} as const;
