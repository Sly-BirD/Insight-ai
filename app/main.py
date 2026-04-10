"""
main.py — InsightAI FastAPI Application
========================================
Refactored Entrypoint loading routes, configurations, and lifecycle events.
"""

import os
import shutil
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.core.config import settings
from app.services.vector_store import init_global_retriever, close_weaviate_client
from app.api.router import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Initialising RAG pipeline components…")
    try:
        init_global_retriever()
        logger.success("Pipeline ready.")
        logger.success("InsightAI API started — http://0.0.0.0:8000")
        logger.info("  Swagger UI : http://localhost:8000/docs")
    except Exception as exc:
        logger.error(f"Startup failed: {exc}")
        raise RuntimeError(f"Pipeline startup failed: {exc}") from exc

    yield

    # Shutdown actions
    logger.info("Shutting down…")
    try:
        close_weaviate_client()
    except Exception as exc:
        logger.warning(f"Error closing Weaviate: {exc}")
        
    if settings.TEMP_DIR.exists():
        shutil.rmtree(settings.TEMP_DIR, ignore_errors=True)
    logger.info("InsightAI API shut down.")

app = FastAPI(
    title="InsightAI RAG API",
    description="Adaptive RAG pipeline for Indian health insurance policy documents.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
