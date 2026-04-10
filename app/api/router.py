"""
router.py — API Routes Definition
==================================
Houses all the endpoints for the InsightAI application.
"""

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from collections import defaultdict
from fastapi import APIRouter, File, HTTPException, UploadFile, Depends
import json
from loguru import logger

from app.core.config import settings
from app.core.security import require_auth, get_user_id
import app.database as db
from app.schemas.api_models import (
    HealthResponse, StatusResponse, AnalyticsResponse, IngestResponse,
    QueryRequest, QueryResponse, AnswerDetail, AuditInfo, RetrievalInfo,
    DecisionBreakdown, DailyCount
)
from app.services.vector_store import get_node_count, collection_name_for_user
from app.services.ingest_service import ingest_docs, get_cache_path
from app.services.query_service import run_query
from app.services.compare_service import compare_policies

router = APIRouter()

ALLOWED_EXT    = {".pdf"}
ALLOWED_MIME   = {"application/pdf", "application/octet-stream"}

# ---------------------------------------------------------------------------
# In-memory query log (Fallback Analytics)
# ---------------------------------------------------------------------------
_query_log: List[dict] = []

def _log_query(question: str, answer: dict, audit: dict, duration: float) -> None:
    _query_log.append({
        "id":         str(int(time.time() * 1000)),
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "question":   question,
        "decision":   answer.get("decision", "informational"),
        "confidence": answer.get("confidence", 0),
        "audit_score": audit.get("score", 0),
        "duration_s": duration,
        "clauses_count": len(answer.get("clauses", [])),
    })
    if len(_query_log) > 500:
        _query_log.pop(0)

def _build_analytics() -> AnalyticsResponse:
    if not _query_log:
        return AnalyticsResponse(
            total_queries=0, avg_confidence=0.0, avg_audit_score=0.0,
            avg_duration_s=0.0, decisions=DecisionBreakdown(),
            recent_queries=[], daily_counts=[],
        )

    total = len(_query_log)
    decisions = DecisionBreakdown()
    conf_sum, audit_sum, dur_sum = 0.0, 0.0, 0.0
    daily: dict = defaultdict(lambda: {"queries": 0, "approved": 0, "rejected": 0})

    for entry in _query_log:
        d = entry["decision"].lower()
        if   d == "approve":       decisions.approve       += 1
        elif d == "reject":        decisions.reject        += 1
        elif d == "partial":       decisions.partial       += 1
        else:                      decisions.informational += 1

        conf_sum  += entry.get("confidence", 0)
        audit_sum += entry.get("audit_score", 0)
        dur_sum   += entry.get("duration_s", 0)

        ts = entry.get("timestamp", "")
        date_key = ts[:10] if ts else "unknown"
        daily[date_key]["queries"]  += 1
        if d == "approve": daily[date_key]["approved"] += 1
        if d == "reject":  daily[date_key]["rejected"] += 1

    daily_counts = [
        DailyCount(date=k, queries=v["queries"], approved=v["approved"], rejected=v["rejected"])
        for k, v in sorted(daily.items())[-14:]
    ]

    return AnalyticsResponse(
        total_queries=total,
        avg_confidence=round(conf_sum / total, 1),
        avg_audit_score=round(audit_sum / total, 1),
        avg_duration_s=round(dur_sum / total, 2),
        decisions=decisions,
        recent_queries=list(reversed(_query_log))[:20],
        daily_counts=daily_counts,
    )

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
async def index_status(user_id: str = None):
    if user_id:
        try:
            col = collection_name_for_user(user_id)
        except Exception:
            col = settings.WEAVIATE_INDEX_BASE
    else:
        col = settings.WEAVIATE_INDEX_BASE
    count = get_node_count(col)
    return StatusResponse(has_documents=count > 0, node_count=count, index_name=col)

@router.get("/analytics", tags=["Analytics"])
async def analytics(_claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    db_analytics = db.get_user_analytics(user_id)
    if db_analytics.get("total_queries", 0) > 0:
        recent = db.get_user_queries(user_id, limit=50)
        db_analytics["recent_queries"] = recent
        return db_analytics
    return _build_analytics()

@router.get("/documents", tags=["Workspace"])
async def list_documents(_claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    path = get_cache_path(user_id)
    if not path.exists():
        return {"documents": []}
    
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        docs = list(set(data.values()))
        return {"documents": sorted(docs)}
    except Exception as exc:
        logger.error(f"[router] Failed to read dedup cache for user {user_id}: {exc}")
        return {"documents": []}

@router.get("/history", tags=["Analytics"])
async def history_endpoint(limit: int = 50, _claims: dict = Depends(require_auth)):
    user_id = get_user_id(_claims)
    rows = db.get_user_queries(user_id, limit=min(limit, 200))
    return {"queries": rows, "count": len(rows)}

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
        result = ingest_docs(str(settings.TEMP_DIR), user_id=user_id)
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
async def query_endpoint(request: QueryRequest, _claims: dict = Depends(require_auth)):
    q = request.question
    user_id = get_user_id(_claims)
    start = time.perf_counter()

    try:
        raw = run_query(q, user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    duration = round(time.perf_counter() - start, 2)
    ans = raw.get("answer", {})
    aud = raw.get("audit", {})
    info = raw.get("retrieval_info", {})

    _log_query(question=q, answer=ans, audit=aud, duration=duration)
    db.save_query(
        user_id=user_id, question=q, decision=ans.get("decision", "informational"),
        confidence=ans.get("confidence", 0), audit_score=aud.get("score", 0),
        duration_s=duration, justification=ans.get("justification", ""),
        summary=ans.get("summary", ""), clauses_count=len(ans.get("clauses", [])),
    )

    try:
        return QueryResponse(
            query=raw.get("query", q),
            answer=AnswerDetail(**ans),
            audit=AuditInfo(**aud),
            retrieval_info=RetrievalInfo(**info),
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
            dest = settings.TEMP_DIR / f"compare_{upload.filename}"
            dest.write_bytes(content)
            saved.append(dest)

        result = compare_policies(
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
