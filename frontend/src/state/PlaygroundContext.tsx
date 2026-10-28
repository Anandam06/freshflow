import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClient } from "@/services/ClientContext";
import type { DisruptionType, Network, Severity, ShipmentPayload, ShipmentRequest } from "@/types/shipment";

/** Wizard selections + the backend payload of the current run (the single source of truth for results). */
export interface PlaygroundSelection {
  commodity_id: string;
  origin_id: string;
  buyer_id: string;
  quantity_kg: number;
  quality_grade: "A" | "B" | "C";
  disruptions: Partial<Record<DisruptionType, Severity>>;
  settings: Record<string, number>;
  mode: "deterministic" | "live";
}

export const DEFAULT_SELECTION: PlaygroundSelection = {
  commodity_id: "tomato",
  origin_id: "H1",
  buyer_id: "B02",
  quantity_kg: 800,
  quality_grade: "A",
  disruptions: {},
  settings: {},
  mode: "deterministic",
};

interface PlaygroundState {
  network: Network | undefined;
  networkError: unknown;
  selection: PlaygroundSelection;
  setSelection: (update: Partial<PlaygroundSelection>) => void;
  /** Result of the last completed run; cleared when inputs change so old results are never reused silently. */
  current: ShipmentPayload | undefined;
  /** Selection the current result was produced from. */
  currentSelection: PlaygroundSelection | undefined;
  running: boolean;
  runError: unknown;
  run: () => Promise<ShipmentPayload | undefined>;
  /** Load a stored backend result (shareable link). Restores the matching inputs. */
  load: (id: string) => Promise<void>;
  decide: (approve: boolean) => Promise<void>;
  deciding: boolean;
  decideError: unknown;
  /** Baseline (no disruption) shipment for the Home page. */
  baseline: ShipmentPayload | undefined;
  baselineError: unknown;
  saved: { id: string; label: string; savedAt: string }[];
  save: (label: string) => void;
  removeSaved: (id: string) => void;
}

const Ctx = createContext<PlaygroundState | null>(null);
const SAVED_KEY = "freshflow.savedShipments.v1";

export function toRequest(s: PlaygroundSelection): ShipmentRequest {
  return {
    commodity_id: s.commodity_id,
    origin_id: s.origin_id,
    buyer_id: s.buyer_id,
    quantity_kg: s.quantity_kg,
    quality_grade: s.quality_grade,
    disruptions: Object.entries(s.disruptions).map(([type, severity]) => ({ type: type as DisruptionType, severity: severity as Severity })),
    settings: s.settings,
    mode: s.mode,
  };
}

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as { id: string; label: string; savedAt: string }[];
  } catch {
    return [];
  }
}

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const client = useClient();
  const [network, setNetwork] = useState<Network>();
  const [networkError, setNetworkError] = useState<unknown>(null);
  const [selection, setSel] = useState<PlaygroundSelection>(DEFAULT_SELECTION);
  const [current, setCurrent] = useState<ShipmentPayload>();
  const [currentSelection, setCurrentSelection] = useState<PlaygroundSelection>();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<unknown>(null);
  const [baseline, setBaseline] = useState<ShipmentPayload>();
  const [baselineError, setBaselineError] = useState<unknown>(null);
  const [saved, setSaved] = useState(readSaved);
  const baselineStarted = useRef(false);

  useEffect(() => {
    client.getNetwork().then(setNetwork, setNetworkError);
    // Use the live AI agent by default when the backend has one configured; otherwise the deterministic agent.
    client.health().then((h) => h.live_agent_configured && setSel((s) => (s.mode === "deterministic" ? { ...s, mode: "live" } : s)), () => undefined);
  }, [client]);

  useEffect(() => {
    if (baselineStarted.current) return;
    baselineStarted.current = true;
    client.createShipment(toRequest(DEFAULT_SELECTION)).then(setBaseline, setBaselineError);
  }, [client]);

  const setSelection = useCallback((update: Partial<PlaygroundSelection>) => {
    setSel((s) => ({ ...s, ...update }));
    setRunError(null);
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    const snapshot = selection;
    try {
      const payload = await client.createShipment(toRequest(snapshot));
      setCurrent(payload);
      setCurrentSelection(snapshot);
      return payload;
    } catch (e) {
      setRunError(e);
      return undefined;
    } finally {
      setRunning(false);
    }
  }, [client, selection]);

  const load = useCallback(
    async (id: string) => {
      setRunError(null);
      try {
        const p = await client.getShipment(id);
        const restored: PlaygroundSelection = {
          commodity_id: p.request.commodity_id,
          origin_id: p.request.origin_id,
          buyer_id: p.request.buyer_id,
          quantity_kg: p.request.quantity_kg,
          quality_grade: (p.request.quality_grade as PlaygroundSelection["quality_grade"]) ?? "A",
          disruptions: Object.fromEntries(p.request.disruptions.map((d) => [d.type, d.severity])) as PlaygroundSelection["disruptions"],
          settings: (p.request.settings as Record<string, number>) ?? {},
          mode: (p.request.mode as PlaygroundSelection["mode"]) ?? "deterministic",
        };
        setSel(restored);
        setCurrent(p);
        setCurrentSelection(restored);
      } catch (e) {
        setRunError(e);
      }
    },
    [client],
  );

  const decide = useCallback(
    async (approve: boolean) => {
      if (!current) return;
      setDeciding(true);
      setDecideError(null);
      try {
        setCurrent(await client.decideShipment(current.id, { approve, expected_version: current.state.version }));
      } catch (e) {
        setDecideError(e);
      } finally {
        setDeciding(false);
      }
    },
    [client, current],
  );

  const persist = (items: typeof saved) => {
    setSaved(items);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable: keep in memory */
    }
  };
  const save = useCallback(
    (label: string) => current && !saved.some((s) => s.id === current.id) && persist([...saved, { id: current.id, label, savedAt: new Date().toISOString() }]),
    [current, saved],
  );
  const removeSaved = useCallback((id: string) => persist(saved.filter((s) => s.id !== id)), [saved]);

  const value = useMemo(
    () => ({
      network,
      networkError,
      selection,
      setSelection,
      current,
      currentSelection,
      running,
      runError,
      run,
      load,
      decide,
      deciding,
      decideError,
      baseline,
      baselineError,
      saved,
      save,
      removeSaved,
    }),
    [network, networkError, selection, setSelection, current, currentSelection, running, runError, run, load, decide, deciding, decideError, baseline, baselineError, saved, save, removeSaved],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayground() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayground must be used inside <PlaygroundProvider>");
  return v;
}

/** True when the visible result was produced from the current inputs. */
export function useResultIsCurrent() {
  const { current, currentSelection, selection } = usePlayground();
  return Boolean(current && currentSelection && JSON.stringify(currentSelection) === JSON.stringify(selection));
}
