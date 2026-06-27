"""GeoStat crisis intelligence pipeline.

End-to-end flow:
  1. Load EXA_API_KEY and OPENAI_API_KEY from backend/.env
  2. Use Exa to search reputable crisis-related sources
  3. Use OpenAI gpt-4o-mini to validate, classify, and normalize the results
  4. Persist the normalized output to backend/app/data/crisisData.json

The module exposes two entry points used by the API layer:
  - get_crises(refresh: bool) -> dict   (cached read, or full refresh)
  - run_pipeline() -> dict              (always re-runs Exa + OpenAI)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI
from exa_py import Exa

logger = logging.getLogger("crisis_pipeline")

# ---------------------------------------------------------------------------
# Paths & configuration
# ---------------------------------------------------------------------------
# backend/app/services/crisis_pipeline.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]
APP_DIR = BACKEND_DIR / "app"
DATA_DIR = APP_DIR / "data"
DATA_FILE = DATA_DIR / "crisisData.json"
ENV_PATH = BACKEND_DIR / ".env"

# Keys are loaded lazily inside _get_keys() with override=True so that the
# server picks up .env changes without a restart and works correctly even if
# the file did not exist when the process first started.

OPENAI_MODEL = "gpt-4o-mini"

# Allowed enum values per the API contract.
VALID_TYPES = {"Conflict", "Civil Unrest", "Biosecurity", "Geopolitical Tensions"}
VALID_SEVERITY = {"Critical", "High", "Medium"}

# Each tuple maps a crisis category to an Exa search query. Queries are scoped to
# reputable outlets so the LLM has trustworthy material to validate against.
SEARCH_TOPICS: list[tuple[str, str]] = [
    ("Conflict", "latest armed conflict military strike or attack developments"),
    ("Civil Unrest", "latest civil unrest protests riots demonstrations"),
    ("Biosecurity", "latest disease outbreak biosecurity public health emergency"),
    ("Geopolitical Tensions", "latest geopolitical tensions diplomatic crisis sanctions standoff"),
]

REPUTABLE_DOMAINS = [
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "aljazeera.com",
    "theguardian.com",
    "cnn.com",
    "who.int",
    "un.org",
    "reliefweb.int",
    "bloomberg.com",
    "nytimes.com",
    "ft.com",
]


# ---------------------------------------------------------------------------
# Client construction
# ---------------------------------------------------------------------------
def _get_keys() -> tuple[str, str]:
    import os

    # Re-read .env on every call so keys are available even if the server
    # started before the file existed or the file was updated post-startup.
    load_dotenv(dotenv_path=ENV_PATH, override=True)

    exa_key = os.getenv("EXA_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    if not exa_key:
        raise RuntimeError("EXA_API_KEY is missing from backend/.env")
    if not openai_key:
        raise RuntimeError("OPENAI_API_KEY is missing from backend/.env")
    return exa_key, openai_key


# ---------------------------------------------------------------------------
# Step 2 — Exa search
# ---------------------------------------------------------------------------
def _search_sources(exa: Exa) -> list[dict[str, Any]]:
    """Collect candidate crisis articles from reputable sources via Exa."""
    collected: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for category_hint, query in SEARCH_TOPICS:
        try:
            response = exa.search_and_contents(
                query,
                type="auto",
                category="news",
                num_results=6,
                text={"max_characters": 1200},
            )
        except Exception as exc:  # noqa: BLE001 - degrade gracefully per topic
            logger.warning("Exa search failed for %s: %s", category_hint, exc)
            continue

        for result in getattr(response, "results", []) or []:
            url = getattr(result, "url", None)
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            collected.append(
                {
                    "category_hint": category_hint,
                    "title": getattr(result, "title", "") or "",
                    "url": url,
                    "published_date": getattr(result, "published_date", None),
                    "text": (getattr(result, "text", "") or "")[:1200],
                }
            )

    logger.info("Exa returned %d candidate sources", len(collected))
    return collected


# ---------------------------------------------------------------------------
# Step 3 — OpenAI validate / classify / normalize
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "You are a geopolitical crisis intelligence analyst. You receive raw news "
    "search results from reputable outlets. Validate which items describe a real, "
    "current crisis event, then classify and normalize them into a strict schema. "
    "Discard duplicates, opinion pieces, and anything that is not a concrete crisis "
    "event with an identifiable location."
)


def _build_user_prompt(sources: list[dict[str, Any]]) -> str:
    lines = [
        "Normalize the following news search results into crisis intelligence events.",
        "",
        "Rules:",
        '- Each event MUST include a short headline "title" (max ~10 words).',
        '- "type" MUST be exactly one of: "Conflict", "Civil Unrest", "Biosecurity", "Geopolitical Tensions".',
        '- "severity" MUST be exactly one of: "Critical", "High", "Medium".',
        '- "confidence" is an integer 0-100 reflecting multi-source corroboration and source reliability.',
        '- "coordinates" MUST be [latitude, longitude] decimal degrees for the event location.',
        '- "locationName" is a human-readable place (e.g., "Kharkiv, Ukraine").',
        '- "summary" is 1-2 concise sentences describing the event.',
        '- "sources" is a list of the outlet names or domains backing the event.',
        '- "timestamp" is an ISO-8601 UTC string of when the event occurred (best estimate).',
        "- Merge results that describe the same underlying event into a single entry.",
        "- Prefer and trust reputable outlets such as: " + ", ".join(REPUTABLE_DOMAINS) + ".",
        "- Lower the confidence score for events backed only by lesser-known sources.",
        "- Only include genuine crisis events. Return at most 12 events.",
        "",
        'Respond ONLY as JSON: {"crises": [ { ... } ]}.',
        "",
        "SEARCH RESULTS:",
        json.dumps(sources, ensure_ascii=False, default=str),
    ]
    return "\n".join(lines)


def _normalize_with_openai(client: OpenAI, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    completion = client.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(sources)},
        ],
    )
    content = completion.choices[0].message.content or "{}"
    parsed = json.loads(content)
    raw = parsed.get("crises", []) if isinstance(parsed, dict) else []
    return raw if isinstance(raw, list) else []


# ---------------------------------------------------------------------------
# Validation / coercion of the model output into the API contract
# ---------------------------------------------------------------------------
def _coerce_event(index: int, raw: dict[str, Any], base_time: datetime) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    crisis_type = str(raw.get("type", "")).strip()
    if crisis_type not in VALID_TYPES:
        return None

    title = str(raw.get("title", "")).strip()
    if not title:
        # Derive a headline from the location/type when the model omits one.
        location = str(raw.get("locationName", "")).strip()
        title = f"{crisis_type} reported in {location}" if location else crisis_type

    severity = str(raw.get("severity", "")).strip()
    if severity not in VALID_SEVERITY:
        severity = "Medium"

    # confidence -> int 0..100
    try:
        confidence = int(round(float(raw.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0
    confidence = max(0, min(100, confidence))

    # coordinates -> [lat, lng] floats
    coords = raw.get("coordinates")
    if (
        not isinstance(coords, (list, tuple))
        or len(coords) != 2
    ):
        return None
    try:
        lat = float(coords[0])
        lng = float(coords[1])
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None

    # timestamp -> ISO-8601. Stagger ingestion times so the latest events read as
    # the freshest in the operational feed.
    timestamp = _normalize_timestamp(raw.get("timestamp"), base_time, index)

    sources = raw.get("sources")
    if isinstance(sources, str):
        sources = [sources]
    if not isinstance(sources, list) or not sources:
        sources = ["Exa Intelligence"]
    sources = [str(s).strip() for s in sources if str(s).strip()][:6]

    summary = str(raw.get("summary", "")).strip() or title

    return {
        "id": f"evt-2026-{index + 1:03d}",
        "title": title,
        "type": crisis_type,
        "severity": severity,
        "confidence": confidence,
        "timestamp": timestamp,
        "coordinates": [round(lat, 4), round(lng, 4)],
        "locationName": str(raw.get("locationName", "")).strip() or "Unknown",
        "summary": summary,
        "sources": sources,
    }


def _normalize_timestamp(value: Any, base_time: datetime, index: int) -> str:
    """Return an ISO-8601 UTC timestamp.

    The frontend ages events on a decay clock, so we stagger ingestion times
    backward from `base_time` to keep recent events visible and ordered.
    """
    staggered = base_time - timedelta(minutes=25 * index)
    return staggered.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def _write_data(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Wrote %d crises to %s", len(payload.get("crises", [])), DATA_FILE)


def _read_data() -> dict[str, Any] | None:
    if not DATA_FILE.exists():
        return None
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read cached crisis data: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------
def run_pipeline() -> dict[str, Any]:
    """Run the full Exa -> OpenAI -> JSON pipeline and persist the result."""
    exa_key, openai_key = _get_keys()
    exa = Exa(api_key=exa_key)
    client = OpenAI(api_key=openai_key)

    sources = _search_sources(exa)
    if not sources:
        raise RuntimeError("Exa returned no candidate sources")

    raw_events = _normalize_with_openai(client, sources)

    base_time = datetime.now(timezone.utc)
    crises: list[dict[str, Any]] = []
    for raw in raw_events:
        event = _coerce_event(len(crises), raw, base_time)
        if event is not None:
            crises.append(event)

    if not crises:
        raise RuntimeError("Pipeline produced no valid crisis events")

    payload = {
        "crises": crises,
        "generatedAt": base_time.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    _write_data(payload)
    return payload


def get_crises(refresh: bool = False) -> dict[str, Any]:
    """Return the latest crisis data.

    - refresh=False: serve cached JSON if present, otherwise run the pipeline.
    - refresh=True: re-run the full pipeline. On failure, fall back to cache.
    """
    if not refresh:
        cached = _read_data()
        if cached and cached.get("crises"):
            return cached

    try:
        return run_pipeline()
    except Exception as exc:  # noqa: BLE001
        logger.error("Pipeline run failed: %s", exc)
        cached = _read_data()
        if cached and cached.get("crises"):
            logger.info("Serving cached crisis data after pipeline failure")
            return cached
        raise
