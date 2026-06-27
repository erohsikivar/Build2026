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
import seed from "@/data/crisisData.json";
import {
  CONTEXT_ANCHOR_ISO,
  getDecayStage,
  type CategoryFilter,
  type CrisisEvent,
  type CrisisType,
} from "@/types/crisis";

interface SimTemplate {
  type: CrisisType;
  title: string;
  city: [number, number];
  sources: string[];
}

const SIM_TEMPLATES: SimTemplate[] = [
  {
    type: "conflict",
    title: "Airspace Incursion Flagged",
    city: [48.3794, 31.1656],
    sources: ["Reuters", "AP", "NATO Watch"],
  },
  {
    type: "unrest",
    title: "Capital Square Mobilization Surge",
    city: [40.4168, -3.7038],
    sources: ["EFE", "Bloomberg"],
  },
  {
    type: "biosecurity",
    title: "Contaminant Plume Advisory",
    city: [19.076, 72.8777],
    sources: ["WHO Intelligence", "Reuters"],
  },
  {
    type: "humanitarian",
    title: "Emergency Corridor Activation",
    city: [33.5138, 36.2765],
    sources: ["UNHCR", "UN ReliefWeb"],
  },
  {
    type: "conflict",
    title: "Border Skirmish Intensifies",
    city: [35.6895, 51.389],
    sources: ["AP", "Al Jazeera"],
  },
];

interface CrisisContextValue {
  activeEvents: CrisisEvent[];
  selectedEventId: string | null;
  selectedCategoryFilter: CategoryFilter;
  /** Simulated operational clock anchored at June 27, 2026, ticking in real time. */
  nowMs: number;
  hydrated: boolean;
  setSelectedEventId: (id: string | null) => void;
  setSelectedCategoryFilter: (filter: CategoryFilter) => void;
  simulateIngestion: () => void;
}

const CrisisContext = createContext<CrisisContextValue | null>(null);

const ANCHOR_MS = new Date(CONTEXT_ANCHOR_ISO).getTime();

export function CrisisProvider({ children }: { children: ReactNode }) {
  const [activeEvents, setActiveEvents] = useState<CrisisEvent[]>(
    seed as CrisisEvent[],
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<CategoryFilter>("all");
  const [nowMs, setNowMs] = useState<number>(ANCHOR_MS);
  const [hydrated, setHydrated] = useState(false);

  const mountWallClock = useRef<number>(0);
  const simCursor = useRef<number>(0);

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

  const simulateIngestion = useCallback(() => {
    const elapsed =
      mountWallClock.current === 0 ? 0 : Date.now() - mountWallClock.current;
    const stampMs = ANCHOR_MS + elapsed;
    const template = SIM_TEMPLATES[simCursor.current % SIM_TEMPLATES.length];
    simCursor.current += 1;

    const jitter = () => (Math.random() - 0.5) * 0.6;
    const sourceCoords: [number, number] = [
      template.city[0] + jitter(),
      template.city[1] + jitter(),
    ];
    const wantsVector = template.type !== "unrest";
    const targetCoords: [number, number] | undefined = wantsVector
      ? [template.city[0] + jitter() * 2.2, template.city[1] + jitter() * 2.2]
      : undefined;

    const fresh: CrisisEvent = {
      id: Math.random().toString(),
      type: template.type,
      title: template.title,
      description:
        "Live ingestion: cross-referenced against active streams; multi-source verification threshold met.",
      timestamp: new Date(stampMs).toISOString(),
      sourceCoords,
      targetCoords,
      confidence_score: 0.95,
      corroborating_sources: template.sources,
    };

    setActiveEvents((prev) => [fresh, ...prev]);
    setSelectedEventId(fresh.id);
  }, []);

  const value = useMemo<CrisisContextValue>(
    () => ({
      activeEvents,
      selectedEventId,
      selectedCategoryFilter,
      nowMs,
      hydrated,
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
