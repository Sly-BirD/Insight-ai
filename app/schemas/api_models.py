"""
api_models.py — API Request/Response Schemas
=============================================
Pydantic schemas used for FastAPI routes.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# ---------------------------------------------------------
# System Endpoints
# ---------------------------------------------------------
class HealthResponse(BaseModel):
    status:  str = "ok"
    version: str = "1.0.0"

class StatusResponse(BaseModel):
    has_documents: bool
    node_count:    int
    index_name:    str

class ErrorResponse(BaseModel):
    error:  str
    detail: Optional[str] = None

# ---------------------------------------------------------
# Analytics Endpoints
# ---------------------------------------------------------
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
    total_queries:      int
    avg_confidence:     float
    avg_audit_score:    float
    avg_duration_s:     float
    decisions:          DecisionBreakdown
    recent_queries:     List[Dict[str, Any]]
    daily_counts:       List[DailyCount]

# ---------------------------------------------------------
# Ingestion Endpoints
# ---------------------------------------------------------
class IngestResponse(BaseModel):
    status:           str
    processed:        int
    errors:           List[str]
    nodes_created:    Optional[int]   = None
    duration_seconds: Optional[float] = None

# ---------------------------------------------------------
# Query Endpoints
# ---------------------------------------------------------
class Message(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)
    history: List[Message] = []

class AuditInfo(BaseModel):
    score:   int
    flags:   List[str]
    summary: str

class RetrievalInfo(BaseModel):
    chunks_used:   int
    rewrites_done: int
    final_query:   str

class AnswerDetail(BaseModel):
    decision:      str
    justification: str
    clauses:       List[str]
    confidence:    int
    conditions:    List[str] = []
    summary:       str       = ""

class QueryResponse(BaseModel):
    query:          str
    answer:         AnswerDetail
    audit:          AuditInfo
    retrieval_info: RetrievalInfo
    warning:        Optional[str] = None
