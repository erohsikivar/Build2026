"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  Biohazard,
  CheckCircle2,
  Clock,
  Globe2,
  HeartHandshake,
  Megaphone,
  Radio,
  SatelliteDish,
  ShieldCheck,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCrisis, useDecayCounts } from "@/context/CrisisContext";
import {
  CATEGORY_COLORS,
  CATEGORY_META,
  getDecayStage,
  type CategoryFilter,
  type CrisisEvent,
  type CrisisType,
  type DecayStage,
} from "@/types/crisis";

const GeoPulseMap = dynamic(() => import("@/components/GeoPulseMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-base-700 text-sm text-slate-500">
      <span className="gp-blink tracking-widest">CALIBRATING SATELLITE UPLINK…</span>
    </div>
  ),
});

const CATEGORY_ICONS: Record<CategoryFilter, LucideIcon> = {
  all: Globe2,
  conflict: Swords,
  unrest: Megaphone,
  biosecurity: Biohazard,
  humanitarian: HeartHandshake,
};

const STAGE_LABEL: Record<DecayStage, string> = {
  fresh: "LIVE",
  recent: "RECENT",
  archived: "ARCHIVED",
};

// Local wall-clock formatters so the displayed time matches the operator's clock.
const localDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const localTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return `${localDate.format(d).toUpperCase()} · ${localTime.format(d)}`;
}

function relativeAge(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  if (diff < 0) return "incoming";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

export default function Page() {
  const {
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
    retryLoad,
  } = useCrisis();
  const counts = useDecayCounts();

  const perCategory = useMemo(() => {
    const init: Record<
      CrisisType,
      { visible: number; archived: number; total: number }
    > = {
      conflict: { visible: 0, archived: 0, total: 0 },
      unrest: { visible: 0, archived: 0, total: 0 },
      biosecurity: { visible: 0, archived: 0, total: 0 },
      humanitarian: { visible: 0, archived: 0, total: 0 },
    };
    for (const event of activeEvents) {
      const bucket = init[event.type];
      bucket.total += 1;
      if (getDecayStage(event.timestamp, nowMs) === "archived") bucket.archived += 1;
      else bucket.visible += 1;
    }
    return init;
  }, [activeEvents, nowMs]);

  const feed = useMemo(() => {
    return activeEvents
      .filter(
        (event) =>
          selectedCategoryFilter === "all" || event.type === selectedCategoryFilter,
      )
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activeEvents, selectedCategoryFilter]);

  const avgConfidence = useMemo(() => {
    if (activeEvents.length === 0) return 0;
    const sum = activeEvents.reduce((acc, e) => acc + e.confidence_score, 0);
    return Math.round((sum / activeEvents.length) * 100);
  }, [activeEvents]);

  return (
    <div className="flex h-screen w-screen flex-col bg-base-900 text-slate-900">
      {/* ===================== HEADER ===================== */}
      <header className="z-20 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-neon-humanitarian/20 to-neon-conflict/15 ring-1 ring-slate-200">
            <SatelliteDish className="h-5 w-5 text-neon-humanitarian" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-neon-biosecurity gp-blink" />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-[0.18em] text-slate-900">
              GeoStat<span className="text-neon-humanitarian"> AI</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
              Verifiable Crisis Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 rounded-lg border border-slate-200/80 bg-base-800 px-4 py-1.5 sm:flex">
            <Clock className="h-4 w-4 text-neon-humanitarian" />
            <div className="text-right leading-tight">
              <div className="font-semibold tabular-nums tracking-wider text-slate-900">
                {hydrated ? localTime.format(new Date(nowMs)) : "--:--:--"}
                <span className="ml-1 text-[10px] text-slate-500">LCL</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                {hydrated ? localDate.format(new Date(nowMs)).toUpperCase() : "27 JUN 2026"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={simulateIngestion}
            disabled={loading}
            className="group flex items-center gap-2 rounded-lg border border-neon-conflict/50 bg-neon-conflict/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-neon-conflict transition hover:bg-neon-conflict/20 hover:shadow-[0_0_18px_rgba(255,51,51,0.25)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Zap className={`h-4 w-4 transition group-hover:scale-110 ${loading ? "gp-blink" : ""}`} />
            {loading ? "Ingesting…" : "Simulate Real-Time Ingestion"}
          </button>
        </div>
      </header>

      {/* ===================== BODY ===================== */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr_360px]">
        {/* -------- LEFT: Tactical Index -------- */}
        <aside className="gp-glass gp-scroll z-10 hidden flex-col gap-4 overflow-y-auto border-r border-slate-200/80 p-4 lg:flex">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-700">
              <Activity className="h-4 w-4 text-neon-humanitarian" />
              Tactical Index
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="On Map" value={counts.visible} accent="#0097A7" />
              <Metric label="Archived" value={counts.archived} accent="#64748B" />
              <Metric label="Total Logs" value={counts.total} accent="#16A34A" />
              <Metric label="Avg Conf." value={`${avgConfidence}%`} accent="#E67E22" />
            </div>
          </div>

          <div className="h-px bg-slate-200" />

          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700">
              Threat Vector Filters
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {CATEGORY_META.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.key];
                const active = selectedCategoryFilter === cat.key;
                const stats =
                  cat.key === "all"
                    ? { visible: counts.visible, archived: counts.archived }
                    : perCategory[cat.key];
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.key)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-slate-300 bg-slate-100 shadow-sm"
                        : "border-slate-200/70 bg-white/60 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    style={
                      active
                        ? { boxShadow: `inset 3px 0 0 0 ${cat.color}` }
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" style={{ color: cat.color }} />
                      <span className="text-sm font-medium text-slate-800">
                        {cat.label}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums">
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: `${cat.color}1f`,
                          color: cat.color,
                        }}
                      >
                        {stats.visible}
                      </span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-500">
                        {stats.archived}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-relaxed text-slate-500">
              <span className="h-2 w-2 rounded-sm bg-neon-humanitarian/70" /> live
              on map
              <span className="ml-2 h-2 w-2 rounded-sm bg-slate-300" /> archived
              (12h+)
            </p>
          </div>

          <div className="h-px bg-slate-200" />

          <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-neon-biosecurity" />
              Decay Protocol
            </h3>
            <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-neon-biosecurity gp-blink" />
                0–2h · solid neon, kinetic
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-neon-unrest/60" />
                2–12h · static, 40% opacity
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                12h+ · hidden from canvas
              </li>
            </ul>
          </div>
        </aside>

        {/* -------- CENTER: Map -------- */}
        <main className="relative min-h-0 bg-base-700">
          <GeoPulseMap />
          <div className="pointer-events-none absolute left-4 top-4 z-[400] flex items-center gap-2 rounded-md border border-slate-200/80 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <Radio className="h-3.5 w-3.5 text-neon-conflict gp-blink" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-700">
              Kinetic Viewport · Live
            </span>
          </div>
        </main>

        {/* -------- RIGHT: Intelligence Feed -------- */}
        <aside className="gp-glass gp-scroll z-10 flex min-h-0 flex-col overflow-y-auto border-l border-slate-200/80">
          <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-900">
              <SatelliteDish className="h-4 w-4 text-neon-humanitarian" />
              Regional Intelligence Feed
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {loading
                ? "syncing intelligence uplink…"
                : error
                  ? "uplink error · see feed"
                  : `${feed.length} verified logs · newest first`}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 p-3">
            {loading && activeEvents.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                <span className="gp-blink tracking-widest">
                  ESTABLISHING SECURE UPLINK…
                </span>
              </div>
            )}
            {!loading && error && (
              <div className="rounded-lg border border-dashed border-neon-conflict/50 bg-neon-conflict/5 p-6 text-center text-xs text-neon-conflict">
                <div className="font-bold uppercase tracking-[0.18em]">
                  Backend Unreachable
                </div>
                <p className="mt-2 leading-relaxed text-slate-500">{error}</p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="mt-3 rounded border border-neon-conflict/50 px-3 py-1.5 font-bold uppercase tracking-[0.16em] text-neon-conflict transition hover:bg-neon-conflict/10"
                >
                  Retry Uplink
                </button>
              </div>
            )}
            {feed.map((event) => (
              <FeedCard
                key={event.id}
                event={event}
                stage={getDecayStage(event.timestamp, nowMs)}
                nowMs={nowMs}
                selected={event.id === selectedEventId}
                onSelect={() => setSelectedEventId(event.id)}
              />
            ))}
            {!loading && !error && feed.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                {activeEvents.length === 0
                  ? "No crisis intelligence available."
                  : "No logs match the active vector filter."}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2">
      <div
        className="text-xl font-bold tabular-nums leading-none"
        style={{ color: accent }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function FeedCard({
  event,
  stage,
  nowMs,
  selected,
  onSelect,
}: {
  event: CrisisEvent;
  stage: DecayStage;
  nowMs: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = CATEGORY_COLORS[event.type];
  const confidence = Math.round(event.confidence_score * 100);
  const stageStyles: Record<DecayStage, string> = {
    fresh: "bg-neon-biosecurity/15 text-emerald-700",
    recent: "bg-neon-unrest/15 text-orange-700",
    archived: "bg-slate-200/80 text-slate-500",
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative w-full overflow-hidden rounded-lg border p-3 text-left transition ${
        selected
          ? "border-slate-300 bg-slate-100 shadow-sm"
          : "border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-slate-50"
      }`}
      style={{ boxShadow: `inset 3px 0 0 0 ${color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          {event.type}
        </span>
        <span
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${stageStyles[stage]}`}
        >
          {stage === "fresh" && (
            <span className="h-1.5 w-1.5 rounded-full bg-current gp-blink" />
          )}
          {STAGE_LABEL[stage]}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900">
        {event.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
        {event.description}
      </p>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-slate-500">
          {formatStamp(event.timestamp)}
        </span>
        <span className="text-[10px] text-slate-500">
          {relativeAge(event.timestamp, nowMs)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {confidence}%
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full"
            style={{
              width: `${confidence}%`,
              background: "linear-gradient(90deg, #2ECC71, #0097A7)",
            }}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {event.corroborating_sources.map((src) => (
          <span
            key={src}
            className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-600"
          >
            {src}
          </span>
        ))}
      </div>
    </button>
  );
}
