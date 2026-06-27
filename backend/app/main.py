"""GeoStat crisis intelligence API.

Serves normalized crisis data produced by the Exa + OpenAI pipeline.
All intelligence generation happens server-side; the frontend only reads
the JSON returned by these endpoints.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.services.crisis_pipeline import get_crises

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("geostat.api")

app = FastAPI(title="GeoStat Crisis Intelligence API", version="1.0.0")

# The Next.js frontend runs on http://localhost:3000.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://geostatbuild26.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"service": "GeoStat Crisis Intelligence API", "status": "ok"}


@app.get("/api/crises")
def read_crises(refresh: bool = Query(False, description="Re-run the Exa + OpenAI pipeline")):
    """Return the latest crisis intelligence.

    - GET /api/crises               -> serve cached data (runs pipeline if empty)
    - GET /api/crises?refresh=true  -> force a fresh pipeline run
    """
    try:
        data = get_crises(refresh=refresh)
        return data
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to produce crisis data")
        return JSONResponse(
            status_code=503,
            content={
                "crises": [],
                "error": "Crisis intelligence pipeline is unavailable.",
                "detail": str(exc),
            },
        )
