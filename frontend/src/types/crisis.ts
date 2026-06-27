export type CrisisType = "conflict" | "unrest" | "biosecurity" | "humanitarian";

export type CategoryFilter = "all" | CrisisType;

export type DecayStage = "fresh" | "recent" | "archived";

export interface CrisisEvent {
  id: string;
  type: CrisisType;
  title: string;
  description: string;
  timestamp: string;
  sourceCoords: [number, number];
  targetCoords?: [number, number];
  confidence_score: number;
  corroborating_sources: string[];
}

export interface CategoryMeta {
  key: CategoryFilter;
  label: string;
  color: string;
}

export const CATEGORY_COLORS: Record<CrisisType, string> = {
  conflict: "#FF3333",
  unrest: "#FF8C00",
  biosecurity: "#33FF33",
  humanitarian: "#00D7FF",
};

export const CATEGORY_META: CategoryMeta[] = [
  { key: "all", label: "All Vectors", color: "#FFFFFF" },
  { key: "conflict", label: "Active Conflict", color: CATEGORY_COLORS.conflict },
  { key: "unrest", label: "Civil Unrest", color: CATEGORY_COLORS.unrest },
  { key: "biosecurity", label: "Biosecurity", color: CATEGORY_COLORS.biosecurity },
  { key: "humanitarian", label: "Humanitarian", color: CATEGORY_COLORS.humanitarian },
];

/**
 * Fixed context "now" anchor for the GeoPulse simulation. The product brief pins
 * the operational window to June 27, 2026. We anchor the decay clock just after
 * the two freshest staged alerts so the staggering resolves deterministically
 * regardless of the host machine's wall clock.
 */
export const CONTEXT_ANCHOR_ISO = "2026-06-27T11:30:00.000Z";

/**
 * Classify an event into a time-decay stage relative to the simulated clock.
 * Future-dated events (negative age) are treated as fresh.
 */
export function getDecayStage(timestamp: string, nowMs: number): DecayStage {
  const ageHours = (nowMs - new Date(timestamp).getTime()) / 3_600_000;
  if (ageHours < 2) return "fresh";
  if (ageHours < 12) return "recent";
  return "archived";
}

export function getDecayOpacity(stage: DecayStage): number {
  if (stage === "fresh") return 1;
  if (stage === "recent") return 0.4;
  return 0;
}
