"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchCrises } from "@/lib/api";
import {
  CONTEXT_ANCHOR_ISO,
  getDecayStage,
  type CategoryFilter,
  type CrisisEvent,
} from "@/types/crisis";

interface CrisisContextValue {
  activeEvents: CrisisEvent[];
  selectedEventId: string | null;
  selectedCategoryFilter: CategoryFilter;
  /** Simulated operational clock anchored at June 27, 2026, ticking in real time. */
  nowMs: number;
  hydrated: boolean;
  /** True while a backend fetch/refresh is in flight. */
  loading: boolean;
  /** Human-readable error message when the backend call fails, else null. */
  error: string | null;
  setSelectedEventId: (id: string | null) => void;
  setSelectedCategoryFilter: (filter: CategoryFilter) => void;
  /** Triggers GET /api/crises?refresh=true and replaces the live feed. */
  simulateIngestion: () => void;
}

const CrisisContext = createContext<CrisisContextValue | null>(null);

const ANCHOR_MS = new Date(CONTEXT_ANCHOR_ISO).getTime();

export function CrisisProvider({ children }: { children: ReactNode }) {
  const [activeEvents, setActiveEvents] = useState<CrisisEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<CategoryFilter>("all");
  const [nowMs, setNowMs] = useState<number>(ANCHOR_MS);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountWallClock = useRef<number>(0);

  // Operational clock: anchored at the simulated "now", ticking in real time.
  useEffect(() => {
    mountWallClock.current = Date.now();
    setHydrated(true);
    const tick = () => {
      const elapsed = Date.now() - mountWallClock.current;
      setNowMs(ANCHOR_MS + elapsed);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const loadCrises = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const events = await fetchCrises(refresh);
      setActiveEvents(events);
      // Highlight the freshest headline after a successful load/refresh.
      if (events.length > 0) {
        const newest = events
          .slice()
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )[0];
        setSelectedEventId(newest.id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to reach crisis intelligence backend.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load from the backend on mount.
  useEffect(() => {
    void loadCrises(false);
  }, [loadCrises]);

  // The "Simulate Real-Time Ingestion" button forces a backend refresh.
  const simulateIngestion = useCallback(() => {
    void loadCrises(true);
  }, [loadCrises]);

  const value = useMemo<CrisisContextValue>(
    () => ({
      activeEvents,
      selectedEventId,
      selectedCategoryFilter,
      nowMs,
      hydrated,
      loading,
      error,
      setSelectedEventId,
      setSelectedCategoryFilter,
      simulateIngestion,
    }),
    [
      activeEvents,
      selectedEventId,
      selectedCategoryFilter,
      nowMs,
      hydrated,
      loading,
      error,
      simulateIngestion,
    ],
  );

  return (
    <CrisisContext.Provider value={value}>{children}</CrisisContext.Provider>
  );
}

export function useCrisis(): CrisisContextValue {
  const ctx = useContext(CrisisContext);
  if (!ctx) {
    throw new Error("useCrisis must be used within a CrisisProvider");
  }
  return ctx;
}

/** Derived helper: counts of visible (fresh+recent) vs archived per current data. */
export function useDecayCounts() {
  const { activeEvents, nowMs } = useCrisis();
  return useMemo(() => {
    let visible = 0;
    let archived = 0;
    for (const event of activeEvents) {
      if (getDecayStage(event.timestamp, nowMs) === "archived") archived += 1;
      else visible += 1;
    }
    return { visible, archived, total: activeEvents.length };
  }, [activeEvents, nowMs]);
}
