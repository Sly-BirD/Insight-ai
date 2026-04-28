"""
router.py — API Routes Definition
==================================
Houses all the endpoints for the InsightAI application.
"""

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from fastapi import APIRouter, File, HTTPException, UploadFile, Depends, Request
from fastapi.concurrency import run_in_threadpool
import json
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

from app.core.config import settings
from app.core.security import require_auth, get_user_id
import app.database as db
from app.schemas.api_models import (
    HealthResponse, StatusResponse, AnalyticsResponse, IngestResponse,
    QueryRequest, QueryResponse, AnswerDetail, AuditInfo, RetrievalInfo,
    SourceChunk, DecisionBreakdown, DailyCount
)
from app.services.vector_store import (
    get_node_count, get_user_documents,
    delete_user_document, delete_all_user_documents,
)
from app.services.ingest_service import ingest_docs
from app.services.query_service import run_query
from app.services.compare_service import compare_policies

router = APIRouter()

ALLOWED_EXT    = {".pdf"}
ALLOWED_MIME   = {"application/pdf", "application/octet-stream"}
MAX_FILE_SIZE  = 25 * 1024 * 1024  # 25MB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _is_pdf(file: UploadFile) -> bool:
    ext  = Path(file.filename or "").suffix.lower()
    mime = file.content_type or ""
    return ext in ALLOWED_EXT or mime in ALLOWED_MIME

def _cleanup_temp(paths: List[Path]) -> None:
    for p in paths:
        try:
            if p.exists():
                p.unlink()
        except Exception as exc:
            logger.warning(f"Could not delete {p.name}: {exc}")

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    return HealthResponse()

@router.get("/status", response_model=StatusResponse, tags=["System"])
async def index_status(_claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    count = get_node_count(user_id)
    return StatusResponse(has_documents=count > 0, node_count=count, index_name="InsuranceDocs")

@router.get("/analytics", tags=["Analytics"])
async def analytics(_claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    db_analytics = db.get_user_analytics(user_id)
    if db_analytics.get("total_queries", 0) > 0:
        recent = db.get_user_queries(user_id, limit=50)
        db_analytics["recent_queries"] = recent
        return db_analytics
    
    # Return empty defaults if no queries yet
    return AnalyticsResponse(
        total_queries=0, avg_confidence=0.0, avg_audit_score=0.0,
        avg_duration_s=0.0, decisions=DecisionBreakdown(),
        recent_queries=[], daily_counts=[],
    )

@router.get("/documents", tags=["Workspace"])
async def list_documents(_claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    docs = get_user_documents(user_id)
    return {"documents": docs}

@router.get("/history", tags=["Analytics"])
async def history_endpoint(limit: int = 50, _claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    rows = db.get_user_queries(user_id, limit=min(limit, 200))
    return {"queries": rows, "count": len(rows)}

@router.delete("/documents/{doc_name}", tags=["Workspace"])
async def delete_document(doc_name: str, _claims: dict = Depends(require_auth)):
    """Remove a specific document from the user's Weaviate data."""
    user_id = get_user_id(_claims)
    
    # Check document exists
    docs = get_user_documents(user_id)
    if doc_name not in docs:
        raise HTTPException(status_code=404, detail=f"Document '{doc_name}' not found.")
    
    try:
        deleted = delete_user_document(user_id, doc_name)
        remaining = len(docs) - 1
        return {"status": "deleted", "document": doc_name, "remaining": remaining}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.delete("/documents", tags=["Workspace"])
async def delete_all_documents(_claims: dict = Depends(require_auth)):
    """Clear all documents belonging to this user."""
    user_id = get_user_id(_claims)
    try:
        deleted = delete_all_user_documents(user_id)
        return {"status": "cleared", "message": f"Removed {deleted} chunks."}
    except Exception as exc:
        logger.error(f"[router] Failed to delete documents: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

@router.delete("/history", tags=["Analytics"])
async def clear_history(_claims: dict = Depends(require_auth)):
    """Clear query history for the user."""
    user_id = get_user_id(_claims)
    cleared = db.clear_user_queries(user_id)
    return {"status": "cleared" if cleared else "no_action", "message": "Query history cleared."}

@router.post("/ingest", response_model=IngestResponse, tags=["Ingestion"])
async def ingest_endpoint(files: List[UploadFile] = File(...), _claims: dict = Depends(require_auth)):
    start = time.perf_counter()
    settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    saved_paths, errors = [], []

    for upload in files:
        filename = upload.filename or "unknown.pdf"
        if not _is_pdf(upload):
            errors.append(f"'{filename}' rejected — not a PDF")
            continue
        dest = settings.TEMP_DIR / filename
        try:
            content = await upload.read()
            if not content:
                errors.append(f"'{filename}' is empty — skipped")
                continue
            if len(content) > MAX_FILE_SIZE:
                errors.append(f"'{filename}' exceeds 25MB limit")
                continue
            dest.write_bytes(content)
            saved_paths.append(dest)
        except Exception as exc:
            errors.append(f"Failed to save '{filename}': {exc}")

    if not saved_paths:
        _cleanup_temp(saved_paths)
        raise HTTPException(status_code=400, detail="No valid PDF files provided.")

    saved_filenames = [p.name for p in saved_paths]
    user_id = get_user_id(_claims)
    
    try:
        result = await run_in_threadpool(ingest_docs, str(settings.TEMP_DIR), user_id=user_id)
        nodes_created = result.get("nodes", 0)
        processed = result.get("documents", len(saved_paths))
    except Exception as exc:
        _cleanup_temp(saved_paths)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _cleanup_temp(saved_paths)

    duration = round(time.perf_counter() - start, 2)
    db.save_ingest(
        user_id=user_id, files_count=processed, nodes_created=nodes_created or 0,
        duration_s=duration, filenames=saved_filenames,
    )

    return IngestResponse(
        status="success", processed=processed, errors=errors,
        nodes_created=nodes_created, duration_seconds=duration,
    )

@router.post("/query", response_model=QueryResponse, tags=["Query"])
@limiter.limit("10/minute")
async def query_endpoint(request: Request, payload: QueryRequest, _claims: dict = Depends(require_auth)):
    q = payload.question
    user_id = get_user_id(_claims)
    start = time.perf_counter()

    try:
        hist_dicts = [m.model_dump() for m in payload.history]
        raw = await run_in_threadpool(run_query, q, history=hist_dicts, user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    duration = round(time.perf_counter() - start, 2)
    ans = raw.get("answer", {})
    aud = raw.get("audit", {})
    info = raw.get("retrieval_info", {})

    db.save_query(
        user_id=user_id, question=q, decision=ans.get("decision", "informational"),
        confidence=ans.get("confidence", 0), audit_score=aud.get("score", 0),
        duration_s=duration, justification=ans.get("justification", ""),
        summary=ans.get("summary", ""), clauses_count=len(ans.get("clauses", [])),
    )

    try:
        source_chunks = [SourceChunk(**sc) for sc in raw.get("source_chunks", [])]
        return QueryResponse(
            query=raw.get("query", q),
            answer=AnswerDetail(**ans),
            audit=AuditInfo(**aud),
            retrieval_info=RetrievalInfo(**info),
            source_chunks=source_chunks,
            warning=raw.get("warning"),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline unexpected structure: {exc}")

@router.post("/compare", tags=["Compare"])
async def compare_endpoint(files: List[UploadFile] = File(...), _claims: dict = Depends(require_auth)):
    if len(files) != 2:
        raise HTTPException(status_code=400, detail=f"Exactly 2 PDF files required. Got {len(files)}.")
    for f in files:
        if not _is_pdf(f):
            raise HTTPException(status_code=400, detail=f"'{f.filename}' is not a PDF file.")

    settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    saved = []

    try:
        for upload in files:
            content = await upload.read()
            if not content:
                raise HTTPException(status_code=400, detail=f"'{upload.filename}' is empty.")
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail=f"'{upload.filename}' exceeds 25MB limit.")
            dest = settings.TEMP_DIR / f"compare_{upload.filename}"
            dest.write_bytes(content)
            saved.append(dest)

        result = await run_in_threadpool(
            compare_policies,
            pdf_a_path=saved[0], pdf_a_name=files[0].filename,
            pdf_b_path=saved[1], pdf_b_name=files[1].filename,
        )
        return result.model_dump()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _cleanup_temp(saved)
