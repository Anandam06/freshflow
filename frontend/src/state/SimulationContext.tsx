import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClient } from "@/services/ClientContext";
import { DEFAULT_SIMULATION_REQUEST, SimulationRequestSchema, type SimulationRequest, type SimulationResult, type StudyEntry } from "@/types/api";

export interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  dataMode: "live" | "demo";
  request: SimulationRequest;
  /** Backend response stored verbatim so comparisons never require recomputation. */
  result: SimulationResult;
}

interface SimulationState {
  request: SimulationRequest;
  /** GET /api/v1/scenarios/defaults (falls back to the contract defaults until loaded). */
  defaults: SimulationRequest;
  result: SimulationResult | undefined;
  /** Backend id of the current result (GET /api/v1/simulations/{id}); for the stored study, the seed-60000 replay run once requested. */
  runId: string | null;
  loading: boolean;
  error: unknown;
  /** Index into result.runs shown on the dashboards; -1 = mean of all repetitions (the default). */
  runIndex: number;
  setRunIndex: (i: number) => void;
  run: (req: SimulationRequest) => Promise<SimulationResult | undefined>;
  /** The stored 30-seed validation study (same numbers as the Excel workbook); null when not published. */
  studies: StudyEntry[] | null;
  loadStudy: (id: string) => Promise<void>;
  /** Pages that need batch-level data (control tower, fleet export) call this; it creates the seed-60000 run of the shown scenario. */
  ensureReplayRun: () => void;
  saved: SavedScenario[];
  save: (name: string) => SavedScenario | null;
  remove: (id: string) => void;
}

const STORAGE_KEY = "freshflow.savedScenarios.v1";
const Ctx = createContext<SimulationState | null>(null);

function readSaved(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedScenario[]) : [];
  } catch {
    return [];
  }
}
function writeSaved(items: SavedScenario[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable (private mode / quota) — saved scenarios stay in memory for this session */
  }
}

export function SimulationProvider({ children, initialRequest }: { children: ReactNode; initialRequest?: SimulationRequest }) {
  const client = useClient();
  const [request, setRequest] = useState<SimulationRequest>(initialRequest ?? DEFAULT_SIMULATION_REQUEST);
  const [result, setResult] = useState<SimulationResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [runIndex, setRunIndex] = useState(-1);
  const [studies, setStudies] = useState<StudyEntry[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<SimulationRequest>(DEFAULT_SIMULATION_REQUEST);
  const [saved, setSaved] = useState<SavedScenario[]>(() => readSaved().filter((s) => s.dataMode === client.mode));
  const latest = useRef(0);

  const run = useCallback(
    async (req: SimulationRequest) => {
      const id = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const created = await client.runSimulation(req);
        if (id !== latest.current) return undefined;
        setRequest(req);
        setResult(created.result);
        setRunId(created.id);
        setRunIndex(-1);
        return created.result;
      } catch (e) {
        if (id === latest.current) setError(e);
        return undefined;
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [client],
  );

  const loadStudy = useCallback(
    async (studyId: string) => {
      const id = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const res = await client.getStudy(studyId);
        if (id !== latest.current) return;
        const parsed = SimulationRequestSchema.safeParse(res.config);
        // The form keeps the scenario's parameters; a re-run from the studio uses the faster default repetition count.
        if (parsed.success) setRequest({ ...parsed.data, repetitions: DEFAULT_SIMULATION_REQUEST.repetitions });
        setResult(res);
        setRunId(null);
        setRunIndex(-1);
      } catch (e) {
        if (id === latest.current) setError(e);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [client],
  );

  const replayFor = useRef<string | null>(null);
  const ensureReplayRun = useCallback(() => {
    if (runId || !result?.study) return;
    const req = SimulationRequestSchema.parse({ ...result.config, repetitions: 1 });
    const key = JSON.stringify(req);
    if (replayFor.current === key) return;
    replayFor.current = key;
    client.runSimulation(req).then(
      (created) => {
        if (replayFor.current === key) setRunId(created.id);
      },
      () => {
        replayFor.current = null;
      },
    );
  }, [client, result, runId]);

  // Public visitors cannot POST (operator key), so a deployment can pin a stored baseline run
  // that loads through the public GET /api/v1/simulations/{id}.
  const baselineId = client.mode === "live" ? (import.meta.env.VITE_BASELINE_SIMULATION_ID as string | undefined)?.trim() : undefined;
  useEffect(() => {
    // Backend-owned defaults (frozen case calibration) — the frontend constant is only a fallback.
    client.getScenarioDefaults().then(setDefaults, () => undefined);
  }, [client]);

  useEffect(() => {
    if (initialRequest) {
      void run(initialRequest);
      return;
    }
    const fallback = () => {
      if (!baselineId) {
        client.getScenarioDefaults().then(
          (d) => void run(d),
          (e) => {
            setError(e);
            setLoading(false);
          },
        );
        return;
      }
      const id = ++latest.current;
      setLoading(true);
      client.getSimulation(baselineId).then(
        (res) => {
          if (id !== latest.current) return;
          const parsed = SimulationRequestSchema.safeParse(res.config);
          if (parsed.success) setRequest(parsed.data);
          setResult(res);
          setRunId(baselineId);
          setLoading(false);
        },
        (e) => {
          if (id !== latest.current) return;
          setError(e);
          setLoading(false);
        },
      );
    };
    // Default view: the stored 30-seed study, so every page and the Excel workbook show the same numbers.
    // A pinned baseline run or the live default run is used only where the study is not published.
    client.getStudies().then(
      (list) => {
        setStudies(list);
        if (list?.some((s) => s.id === "S01")) void loadStudy("S01");
        else fallback();
      },
      fallback,
    );
  }, [run, loadStudy, initialRequest, baselineId, client]);

  const save = useCallback(
    (name: string) => {
      if (!result) return null;
      const item: SavedScenario = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim() || `Scenario ${saved.length + 1}`,
        savedAt: new Date().toISOString(),
        dataMode: client.mode,
        // A stored study entry records the parameters it was actually computed with (30 repetitions).
        request: result.study ? (SimulationRequestSchema.safeParse(result.config).data ?? request) : request,
        result,
      };
      const next = [...saved, item];
      setSaved(next);
      writeSaved([...readSaved().filter((s) => s.dataMode !== client.mode), ...next]);
      return item;
    },
    [result, request, saved, client.mode],
  );

  const remove = useCallback(
    (id: string) => {
      const next = saved.filter((s) => s.id !== id);
      setSaved(next);
      writeSaved([...readSaved().filter((s) => s.dataMode !== client.mode), ...next]);
    },
    [saved, client.mode],
  );

  const value = useMemo(
    () => ({ request, defaults, result, runId, loading, error, runIndex, setRunIndex, run, studies, loadStudy, ensureReplayRun, saved, save, remove }),
    [request, defaults, result, runId, loading, error, runIndex, run, studies, loadStudy, ensureReplayRun, saved, save, remove],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** For pages outside Advanced Analysis: null when no fleet simulation has been loaded. */
export function useOptionalSimulation(): SimulationState | null {
  return useContext(Ctx);
}

export function useSimulation(): SimulationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSimulation must be used inside <SimulationProvider>");
  return v;
}
