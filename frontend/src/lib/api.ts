import type { CrisisEvent, CrisisType } from "@/types/crisis";

/**
 * Base URL of the GeoStat FastAPI backend. The frontend ONLY talks to this
 * backend — it never calls Exa or OpenAI directly and never reads API keys.
 * Override with NEXT_PUBLIC_API_BASE_URL if the backend runs elsewhere.
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

/** Shape of a single crisis object returned by GET /api/crises. */
export interface BackendCrisis {
  id: string;
  title: string;
  type: "Conflict" | "Civil Unrest" | "Biosecurity" | "Geopolitical Tensions";
  severity: "Critical" | "High" | "Medium";
  confidence: number;
  timestamp: string;
  coordinates: [number, number];
  locationName: string;
  summary: string;
  sources: string[];
}

interface CrisesResponse {
  crises: BackendCrisis[];
  error?: string;
}

/** Map the backend crisis taxonomy onto the frontend's threat-vector types. */
const TYPE_MAP: Record<BackendCrisis["type"], CrisisType> = {
  Conflict: "conflict",
  "Civil Unrest": "unrest",
  Biosecurity: "biosecurity",
  // Geopolitical tensions render on the conflict vector layer.
  "Geopolitical Tensions": "conflict",
};

function toCrisisEvent(item: BackendCrisis): CrisisEvent {
  const confidence =
    typeof item.confidence === "number" ? item.confidence : 0;
  const coords = item.coordinates ?? [0, 0];

  return {
    id: item.id,
    type: TYPE_MAP[item.type] ?? "conflict",
    title: item.title,
    description: item.summary,
    timestamp: item.timestamp,
    sourceCoords: [coords[0], coords[1]],
    confidence_score: Math.max(0, Math.min(1, confidence / 100)),
    corroborating_sources: Array.isArray(item.sources) ? item.sources : [],
  };
}

/**
 * Fetch crisis intelligence from the backend.
 *
 * @param refresh When true, calls /api/crises?refresh=true to force the
 *   backend to re-run the Exa + OpenAI pipeline. Otherwise serves cached data.
 */
export async function fetchCrises(refresh = false): Promise<CrisisEvent[]> {
  const url = `${API_BASE_URL}/api/crises${refresh ? "?refresh=true" : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Backend returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as CrisesResponse;

  if (data.error) {
    throw new Error(data.error);
  }

  if (!Array.isArray(data.crises)) {
    throw new Error("Malformed response: missing 'crises' array");
  }

  return data.crises.map(toCrisisEvent);
}
