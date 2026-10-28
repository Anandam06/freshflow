import type { ZodIssue } from "zod";

/** Non-2xx HTTP response from the backend. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path: string,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Backend responded, but the payload does not match the agreed contract. */
export class ContractError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: ZodIssue[],
  ) {
    super(
      `Response from ${path} does not match the API contract: ` +
        issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`)
          .join("; "),
    );
    this.name = "ContractError";
  }
}

/** Uploaded workbook failed validation; errors are row-level. */
export class WorkbookValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: { sheet: string | null; row: number | null; column: string | null; message: string }[],
  ) {
    super(message);
    this.name = "WorkbookValidationError";
  }
}

/** Demo adapter cannot serve this request (it only replays captured backend output). */
export class DemoUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoUnsupportedError";
  }
}

/** Status codes per docs/integration.md. */
export function describeError(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return { title: "Operator key required", detail: "This action changes state. Enter the demo operator key (top bar) and try again." };
      case 404:
        return { title: "Not found", detail: `${err.path}: ${err.message}` };
      case 409:
        return { title: "Batch state changed", detail: `${err.message}. Reload the batch before acting again.` };
      case 422:
        return { title: "Input rejected by backend", detail: err.message };
      case 502:
        return { title: "Live agent provider failed", detail: `${err.message}. No action was executed; the trace records the failure.` };
      case 503:
        return { title: "Backend not configured", detail: err.message };
      default:
        return { title: `Backend error (${err.status})`, detail: err.message };
    }
  }
  if (err instanceof WorkbookValidationError) return { title: "Workbook needs fixes", detail: err.message };
  if (err instanceof ContractError) return { title: "Contract mismatch", detail: err.message };
  if (err instanceof DemoUnsupportedError) return { title: "Not available in demo data", detail: err.message };
  if (err instanceof TypeError) return { title: "Cannot reach backend", detail: "Network request failed. Check VITE_API_BASE_URL and the backend CORS_ORIGINS setting." };
  return { title: "Unexpected error", detail: err instanceof Error ? err.message : String(err) };
}
