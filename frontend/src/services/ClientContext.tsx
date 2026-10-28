import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ApiClient } from "./client";
import { createHttpClient } from "./http";
import { createMockClient } from "./mock/mockClient";

export function createDefaultClient(): ApiClient {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const forceMock = import.meta.env.VITE_USE_MOCK === "true";
  if (!forceMock && base) return createHttpClient(base);
  const requested = new URLSearchParams(window.location.search).get("demoState");
  const startState = (["initial", "disrupted", "awaiting", "executed"] as const).find((s) => s === requested);
  return createMockClient({ startState });
}

const ClientContext = createContext<ApiClient | null>(null);

export function ClientProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  const value = useMemo(() => client ?? createDefaultClient(), [client]);
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ApiClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error("useClient must be used inside <ClientProvider>");
  return c;
}
