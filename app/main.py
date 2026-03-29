"""
main.py — InsightAI FastAPI Application
========================================
Endpoints:
  GET  /health    → liveness check
  GET  /status    → Weaviate node count + has_documents flag
  GET  /analytics → aggregated stats for Dashboard (from in-memory log)
  POST /ingest    → upload PDFs and ingest into Weaviate
  POST /query     → query the RAG pipeline (guarded if index empty)
  POST /compare   → upload 2 PDFs and get a structured side-by-side diff
"""

import os
import shutil
import sys
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
import jwt as pyjwt
from jwt.algorithms import RSAAlgorithm
import weaviate
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Security, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger
from pydantic import BaseModel, Field

try:
    from ingest import ingest_docs
    import query as query_module
    from compare import compare_policies, CompareResponse as ComparePydantic
except ImportError:
    from app.ingest import ingest_docs
    import app.query as query_module
    from app.compare import compare_policies, CompareResponse as ComparePydantic

load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

os.makedirs("logs", exist_ok=True)
logger.remove()
logger.add(sys.stderr, level="INFO", colorize=True,
           format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}")
logger.add("logs/api.log", level="DEBUG", rotation="10 MB",
           format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEMP_DIR       = Path("./temp")
ALLOWED_EXT    = {".pdf"}
ALLOWED_MIME   = {"application/pdf", "application/octet-stream"}
WEAVIATE_HOST  = "localhost"
WEAVIATE_PORT  = 8080
WEAVIATE_INDEX = "InsurancePolicies"

# ---------------------------------------------------------------------------
# Clerk JWT verification
# ---------------------------------------------------------------------------
# Clerk session tokens are RS256-signed JWTs. The correct approach is to
# fetch Clerk's public JWKS and verify locally — NOT to call a Clerk API
# endpoint (which doesn't exist for session tokens).
# ---------------------------------------------------------------------------

_http_bearer = HTTPBearer(auto_error=False)

# In-memory JWKS cache so we don't fetch on every request
_jwks_cache: dict = {}


async def _get_clerk_public_key(kid: str) -> Any:
    """
    Fetch Clerk's JWKS and return the RSA public key matching the given kid.
    Results are cached per kid so the JWKS URL is only hit once per key rotation.
    """
    global _jwks_cache
    if kid in _jwks_cache:
        return _jwks_cache[kid]

    # Derive the JWKS URL from the publishable key's domain.
    # pk_test_<base64(frontend-api-host)> → decode to get hostname.
    publishable_key = os.environ.get("CLERK_PUBLISHABLE_KEY", "")
    if publishable_key:
        try:
            # pk_test_ or pk_live_ prefix: strip it, base64-decode the rest
            b64 = publishable_key.split("_", 2)[-1]
            # Add padding so base64 decoding doesn't fail
            b64 += "=" * (-len(b64) % 4)
            import base64 as _b64
            # Clerk appends a trailing '$' to the decoded host — strip it
            frontend_api = _b64.b64decode(b64).decode("utf-8").rstrip("$\x00")
            jwks_url = f"https://{frontend_api}/.well-known/jwks.json"
        except Exception:
            jwks_url = "https://clerk.accounts.dev/.well-known/jwks.json"
    else:
        # Fallback: derive from secret key domain
        jwks_url = "https://clerk.accounts.dev/.well-known/jwks.json"

    logger.debug(f"[auth] Fetching JWKS from {jwks_url}")
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=5.0)
        resp.raise_for_status()
        jwks = resp.json()

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            public_key = RSAAlgorithm.from_jwk(key_data)
            _jwks_cache[kid] = public_key
            return public_key

    raise ValueError(f"No JWKS key found for kid={kid!r}")


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(_http_bearer),
) -> dict:
    """
    FastAPI dependency that verifies a Clerk session JWT.
    - Extracts the Bearer token from the Authorization header
    - Fetches Clerk's JWKS public key (cached after first fetch)
    - Verifies the RS256 signature and expiry locally via PyJWT
    - Returns the decoded claims dict on success

    The frontend sends the token via:
      headers: { Authorization: `Bearer ${await getToken()}` }
    """
    secret_key = os.environ.get("CLERK_SECRET_KEY", "")
    if not secret_key:
        logger.warning("[auth] CLERK_SECRET_KEY not set — skipping auth check")
        return {"sub": "dev"}

    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    token = credentials.credentials

    try:
        # Decode header only (no verification) to get the key id
        unverified_header = pyjwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="JWT is missing kid header.")

        # Get the matching RSA public key from Clerk's JWKS
        public_key = await _get_clerk_public_key(kid)

        # Verify signature, expiry, and audience
        claims = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},   # Clerk tokens have no aud by default
        )
        logger.debug(f"[auth] Verified token for sub={claims.get('sub')}")
        return claims

    except HTTPException:
        raise
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session token has expired.")
    except pyjwt.InvalidTokenError as exc:
        logger.warning(f"[auth] Invalid JWT: {exc}")
        raise HTTPException(status_code=401, detail="Invalid session token.")
    except Exception as exc:
        logger.error(f"[auth] Token verification error: {exc}")
        raise HTTPException(status_code=401, detail="Authentication error.")


# ---------------------------------------------------------------------------
# In-memory query log (Step 7)
# Stores every completed query for the /analytics endpoint.
# In a future version this will be a proper database.
# ---------------------------------------------------------------------------

_query_log: list[dict] = []   # list of query records appended after each /query


def _log_query(question: str, answer: dict, audit: dict, duration: float) -> None:
    """Append a completed query to the in-memory log."""
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
    # Keep last 500 queries in memory
    if len(_query_log) > 500:
        _query_log.pop(0)

# ---------------------------------------------------------------------------
# Weaviate node-count helper
# ---------------------------------------------------------------------------

def _get_node_count() -> int:
    try:
        client = weaviate.connect_to_local(host=WEAVIATE_HOST, port=WEAVIATE_PORT)
        try:
            if not client.collections.exists(WEAVIATE_INDEX):
                return 0
            collection = client.collections.get(WEAVIATE_INDEX)
            result = collection.aggregate.over_all(total_count=True)
            return result.total_count or 0
        finally:
            client.close()
    except Exception as exc:
        logger.warning(f"[status] Could not count nodes: {exc}")
        return 0

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Initialising RAG pipeline components…")
    try:
        query_module._retriever = query_module.init_retriever()
        query_module._llm       = query_module.init_llm()
        logger.success("Pipeline ready.")
        logger.success("InsightAI API started — http://0.0.0.0:8000")
        logger.info("  Swagger UI : http://localhost:8000/docs")
    except Exception as exc:
        logger.error(f"Startup failed: {exc}")
        raise RuntimeError(f"Pipeline startup failed: {exc}") from exc

    yield

    logger.info("Shutting down…")
    try:
        if query_module._weaviate_client:
            query_module._weaviate_client.close()
    except Exception as exc:
        logger.warning(f"Error closing Weaviate: {exc}")
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR, ignore_errors=True)
    logger.info("InsightAI API shut down.")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status:  str = "ok"
    version: str = "1.0.0"


class StatusResponse(BaseModel):
    has_documents: bool
    node_count:    int
    index_name:    str


class DecisionBreakdown(BaseModel):
    approve:       int = 0
    reject:        int = 0
    partial:       int = 0
    informational: int = 0


class DailyCount(BaseModel):
    date:     str
    queries:  int
    approved: int
    rejected: int


class AnalyticsResponse(BaseModel):
    """Step 7: Full analytics payload for the Dashboard page."""
    total_queries:      int
    avg_confidence:     float
    avg_audit_score:    float
    avg_duration_s:     float
    decisions:          DecisionBreakdown
    recent_queries:     list[dict]    # last 20, for the Audit page
    daily_counts:       list[DailyCount]  # last 14 days, for the trend chart


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=1000)


class AuditInfo(BaseModel):
    score:   int
    flags:   list[str]
    summary: str


class RetrievalInfo(BaseModel):
    chunks_used:   int
    rewrites_done: int
    final_query:   str


class AnswerDetail(BaseModel):
    decision:      str
    justification: str
    clauses:       list[str]
    confidence:    int
    conditions:    list[str] = []
    summary:       str       = ""


class QueryResponse(BaseModel):
    query:          str
    answer:         AnswerDetail
    audit:          AuditInfo
    retrieval_info: RetrievalInfo
    warning:        Optional[str] = None


class IngestResponse(BaseModel):
    status:           str
    processed:        int
    errors:           list[str]
    nodes_created:    Optional[int]   = None
    duration_seconds: Optional[float] = None


class ErrorResponse(BaseModel):
    error:  str
    detail: Optional[str] = None

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_pdf(file: UploadFile) -> bool:
    ext  = Path(file.filename or "").suffix.lower()
    mime = file.content_type or ""
    return ext in ALLOWED_EXT or mime in ALLOWED_MIME


def _cleanup_temp(paths: list[Path]) -> None:
    for p in paths:
        try:
            if p.exists():
                p.unlink()
        except Exception as exc:
            logger.warning(f"Could not delete {p.name}: {exc}")


def _build_analytics() -> AnalyticsResponse:
    """
    Compute analytics from the in-memory query log.
    Called by GET /analytics.
    """
    if not _query_log:
        return AnalyticsResponse(
            total_queries=0, avg_confidence=0.0, avg_audit_score=0.0,
            avg_duration_s=0.0, decisions=DecisionBreakdown(),
            recent_queries=[], daily_counts=[],
        )

    total     = len(_query_log)
    decisions = DecisionBreakdown()
    conf_sum  = 0.0
    audit_sum = 0.0
    dur_sum   = 0.0

    # Daily buckets — last 14 days
    daily: dict[str, dict] = defaultdict(lambda: {"queries": 0, "approved": 0, "rejected": 0})

    for entry in _query_log:
        d = entry["decision"].lower()
        if   d == "approve":       decisions.approve       += 1
        elif d == "reject":        decisions.reject        += 1
        elif d == "partial":       decisions.partial       += 1
        else:                      decisions.informational += 1

        conf_sum  += entry.get("confidence", 0)
        audit_sum += entry.get("audit_score", 0)
        dur_sum   += entry.get("duration_s", 0)

        # Extract date part from ISO timestamp
        ts = entry.get("timestamp", "")
        date_key = ts[:10] if ts else "unknown"
        daily[date_key]["queries"]  += 1
        if d == "approve": daily[date_key]["approved"] += 1
        if d == "reject":  daily[date_key]["rejected"] += 1

    # Build daily_counts sorted chronologically, last 14 days
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
        recent_queries=list(reversed(_query_log))[:20],  # newest first
        daily_counts=daily_counts,
    )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    logger.debug("GET /health")
    return HealthResponse()


@app.get("/status", response_model=StatusResponse, tags=["System"],
         summary="Index status — node count and has_documents flag")
async def index_status():
    """Tells the frontend whether there are indexed documents."""
    logger.debug("GET /status")
    count = _get_node_count()
    return StatusResponse(has_documents=count > 0, node_count=count, index_name=WEAVIATE_INDEX)


@app.get(
    "/analytics",
    response_model=AnalyticsResponse,
    tags=["Analytics"],
    summary="Aggregated query statistics for Dashboard and Audit pages",
)
async def analytics(_claims: dict = Depends(require_auth)):
    """
    Step 7: Returns aggregated stats built from the in-memory query log.

    Used by:
      - Dashboard: total_queries, decisions breakdown, avg scores, daily_counts chart
      - Audit page: recent_queries list (newest first)

    Note: log resets on server restart. A persistent DB will be added
    in a future step (Step 10 — encrypted query history).
    """
    logger.debug("GET /analytics")
    return _build_analytics()


@app.post("/ingest", response_model=IngestResponse, tags=["Ingestion"],
          responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def ingest_endpoint(files: list[UploadFile] = File(...), _claims: dict = Depends(require_auth)):
    """Upload and ingest PDF policy documents into Weaviate."""
    logger.info(f"POST /ingest — {len(files)} file(s) received")
    start = time.perf_counter()

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    saved_paths: list[Path] = []
    errors:      list[str]  = []

    for upload in files:
        filename = upload.filename or "unknown.pdf"
        if not _is_pdf(upload):
            errors.append(f"'{filename}' rejected — not a PDF")
            continue
        dest = TEMP_DIR / filename
        try:
            content = await upload.read()
            if not content:
                errors.append(f"'{filename}' is empty — skipped")
                continue
            dest.write_bytes(content)
            saved_paths.append(dest)
            logger.info(f"  Saved: {filename} ({len(content)/1024:.1f} KB)")
        except Exception as exc:
            errors.append(f"Failed to save '{filename}': {exc}")

    if not saved_paths:
        _cleanup_temp(saved_paths)
        raise HTTPException(status_code=400, detail="No valid PDF files provided.")

    nodes_created: Optional[int] = None
    processed: int = 0

    try:
        result        = ingest_docs(str(TEMP_DIR))
        nodes_created = result.get("nodes", 0)
        processed     = result.get("documents", len(saved_paths))
        logger.success(f"Ingestion complete — {processed} doc(s), {nodes_created} nodes")
    except Exception as exc:
        logger.error(f"Ingestion failed: {exc}")
        _cleanup_temp(saved_paths)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _cleanup_temp(saved_paths)

    return IngestResponse(
        status="success", processed=processed, errors=errors,
        nodes_created=nodes_created,
        duration_seconds=round(time.perf_counter() - start, 2),
    )


@app.post("/query", response_model=QueryResponse, tags=["Query"],
          responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def query_endpoint(request: QueryRequest, _claims: dict = Depends(require_auth)):
    """
    Query the RAG pipeline.
    Guards against empty index and logs every completed query for analytics.
    """
    q = request.question
    logger.info(f"POST /query — '{q[:80]}'" if len(q) <= 80 else f"POST /query — '{q[:80]}…'")

    # Guard: reject if no documents indexed
    node_count = _get_node_count()
    if node_count == 0:
        logger.warning("[query] Rejected — Weaviate index is empty.")
        raise HTTPException(
            status_code=400,
            detail="No documents are indexed yet. Please upload at least one PDF before querying.",
        )

    start = time.perf_counter()

    try:
        raw = query_module.run_query(q)
    except Exception as exc:
        logger.error(f"Query pipeline error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    duration = round(time.perf_counter() - start, 2)
    ans      = raw.get("answer", {})
    aud      = raw.get("audit", {})
    info     = raw.get("retrieval_info", {})

    # Step 7: log for analytics
    _log_query(question=q, answer=ans, audit=aud, duration=duration)

    logger.info(
        f"  → decision={ans.get('decision')} | confidence={ans.get('confidence')} | "
        f"audit={aud.get('score')} | chunks={info.get('chunks_used')} | "
        f"rewrites={info.get('rewrites_done')} | {duration}s"
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
        logger.warning(f"Response schema error: {exc}")
        raise HTTPException(status_code=500, detail=f"Pipeline returned unexpected structure: {exc}")


# ---------------------------------------------------------------------------
# Compare endpoint
# ---------------------------------------------------------------------------

@app.post(
    "/compare",
    summary="Compare two insurance policy PDFs side-by-side",
    tags=["Compare"],
    responses={
        400: {"model": ErrorResponse, "description": "Need exactly 2 PDF files"},
        500: {"model": ErrorResponse, "description": "Comparison failed"},
    },
)
async def compare_endpoint(files: list[UploadFile] = File(...), _claims: dict = Depends(require_auth)):
    """
    Upload exactly 2 PDF files to get a structured side-by-side comparison.

    The LLM extracts and compares:
      - Coverage & benefits
      - Waiting periods (initial, PED, specific disease)
      - Exclusions (permanent and temporary)
      - Financial terms (co-payment, room rent limits, sub-limits)
      - Claim procedure differences
      - Network and renewal conditions

    Returns a structured diff table with a summary and key changes list.
    No Weaviate indexing needed — direct document-to-document comparison.
    """
    if len(files) != 2:
        raise HTTPException(
            status_code=400,
            detail=f"Exactly 2 PDF files required. Got {len(files)}.",
        )

    for f in files:
        if not _is_pdf(f):
            raise HTTPException(
                status_code=400,
                detail=f"'{f.filename}' is not a PDF file.",
            )

    logger.info(f"POST /compare — '{files[0].filename}' vs '{files[1].filename}'")
    start = time.perf_counter()

    # Save both files to temp dir
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []

    try:
        for upload in files:
            content = await upload.read()
            if not content:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{upload.filename}' is empty.",
                )
            dest = TEMP_DIR / f"compare_{upload.filename}"
            dest.write_bytes(content)
            saved.append(dest)
            logger.info(f"  Saved: {upload.filename} ({len(content)/1024:.1f} KB)")

        # Run comparison using the shared LLM from query_module
        result = compare_policies(
            pdf_a_path=saved[0],
            pdf_a_name=files[0].filename,
            pdf_b_path=saved[1],
            pdf_b_name=files[1].filename,
            llm=query_module._llm,
        )

        duration = round(time.perf_counter() - start, 2)
        logger.success(
            f"[compare] Done — {len(result.rows)} rows | "
            f"{sum(1 for r in result.rows if r.changed)} changed | {duration}s"
        )

        return result.model_dump()

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[compare] Failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _cleanup_temp(saved)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")