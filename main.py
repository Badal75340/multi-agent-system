"""
main.py — FastAPI backend for the NEXUS AI multi-agent research pipeline.

Wraps agents.py / pipeline.py / tools.py behind a small HTTP API so a
frontend (e.g. the NEXUS AI dashboard) can trigger a research run and
get back the search results, scraped content, final report, and critic
feedback as JSON.

Run with:
    uvicorn main:app --reload --port 2200
"""

import os
import time
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from pipeline import run_research_pipeline

# -------------------------------------------------------------------
# Setup
# -------------------------------------------------------------------
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nexus-ai")

REQUIRED_ENV_VARS = ["OPENAI_API_KEY", "TAVILY_API_KEY"]

app = FastAPI(
    title="NEXUS AI Research API",
    description="API wrapper around a multi-agent LangChain research pipeline "
                 "(search agent -> reader agent -> writer chain -> critic chain).",
    version="1.0.0",
)

# Allow the frontend (opened via file://, localhost, or 127.0.0.1 on any port)
# to call this API during local development. Tighten this for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------------
# Schemas
# -------------------------------------------------------------------
class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=300, description="The research topic to investigate.")


class ResearchResponse(BaseModel):
    topic: str
    search_results: str
    scraped_content: str
    report: str
    feedback: str
    duration_seconds: float


class HealthResponse(BaseModel):
    status: str
    missing_env_vars: list[str]


# -------------------------------------------------------------------
# Routes
# -------------------------------------------------------------------
@app.get("/", tags=["meta"])
def root():
    return {
        "service": "NEXUS AI Research API",
        "docs": "/docs",
        "endpoints": ["/api/health", "/api/research"],
    }


@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
def health():
    """Report service status and whether required API keys are configured."""
    missing = [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]
    return HealthResponse(
        status="ok" if not missing else "degraded",
        missing_env_vars=missing,
    )


@app.post("/api/research", response_model=ResearchResponse, tags=["research"])
async def research(payload: ResearchRequest):
    """
    Run the full multi-agent research pipeline for a topic.

    This call is blocking (it makes several LLM + web calls in sequence),
    so it's executed in a background thread and awaited here to avoid
    blocking the FastAPI event loop. Expect this to take anywhere from
    ~15 seconds to a couple of minutes depending on the topic and depth.
    """
    missing = [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Missing required environment variable(s): {', '.join(missing)}. "
                   f"Set them in your .env file before running research.",
        )

    topic = payload.topic.strip()
    logger.info(f"Starting research pipeline for topic: {topic!r}")

    start = time.perf_counter()
    try:
        result = await run_in_threadpool(run_research_pipeline, topic)
    except Exception as exc:  # noqa: BLE001 — surface the real error to the caller
        logger.exception("Research pipeline failed")
        raise HTTPException(status_code=500, detail=f"Research pipeline failed: {exc}") from exc
    duration = time.perf_counter() - start

    logger.info(f"Finished research pipeline for topic: {topic!r} in {duration:.1f}s")

    return ResearchResponse(
        topic=topic,
        search_results=result.get("search_results", ""),
        scraped_content=result.get("scraped_content", ""),
        report=result.get("report", ""),
        feedback=result.get("feedback", ""),
        duration_seconds=round(duration, 2),
    )


# -------------------------------------------------------------------
# Local dev entrypoint
# -------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=2200, reload=True)
