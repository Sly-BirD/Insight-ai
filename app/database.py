"""
database.py — InsightAI Supabase Database Layer
=================================================
Persistent per-user query history stored in Supabase (PostgreSQL).

Architecture:
  - Supabase stores query records per user
  - User IDs are hashed (SHA-256) before storage — cannot be reversed
    to real Clerk user IDs even with database access
  - Supabase provides at-rest encryption for all stored data
  - Row Level Security (RLS) can be enforced via Supabase policies
  - Column names prefixed with 'enc_' are historical — the data is
    stored as-is and protected by Supabase's own encryption layer

Supabase table schema (run in Supabase SQL editor):

    -- Enable pgcrypto for UUID generation
    create extension if not exists "pgcrypto";

    -- Query history table
    create table if not exists query_history (
        id              uuid primary key default gen_random_uuid(),
        user_id_hash    text not null,
        timestamp       timestamptz not null default now(),
        decision        text not null,
        confidence      integer not null,
        audit_score     integer not null,
        duration_s      real not null,
        clauses_count   integer not null default 0,
        question        text,
        justification   text,
        summary         text,
        created_at      timestamptz not null default now()
    );

    create index if not exists idx_query_history_user
        on query_history(user_id_hash, timestamp desc);

    -- Ingest history table
    create table if not exists ingest_history (
        id              uuid primary key default gen_random_uuid(),
        user_id_hash    text not null,
        timestamp       timestamptz not null default now(),
        files_count     integer not null,
        nodes_created   integer not null,
        duration_s      real not null,
        filenames       text,
        created_at      timestamptz not null default now()
    );

    create index if not exists idx_ingest_history_user
        on ingest_history(user_id_hash, timestamp desc);
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ENCRYPTION_SECRET    = os.environ.get("ENCRYPTION_SECRET", "dummy_secret")

# ---------------------------------------------------------------------------
# Supabase client (singleton)
# ---------------------------------------------------------------------------

_supabase: Optional[Client] = None


def get_supabase() -> Optional[Client]:
    """
    Return the Supabase client singleton.
    Returns None if not configured — all DB functions handle this gracefully.
    """
    global _supabase
    if _supabase is not None:
        return _supabase
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.warning("[db] Supabase not configured — DB operations will be skipped.")
        return None
    try:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.success("[db] Supabase client initialised.")
        return _supabase
    except Exception as exc:
        logger.error(f"[db] Failed to initialise Supabase: {exc}")
        return None


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

def _hash_user_id(user_id: str) -> str:
    """
    One-way hash of the Clerk user_id for storage.
    SHA-256 + server secret as salt — cannot be reversed.
    """
    salted = f"{ENCRYPTION_SECRET}:{user_id}".encode()
    return hashlib.sha256(salted).hexdigest()

# ---------------------------------------------------------------------------
# Query history operations
# ---------------------------------------------------------------------------

def save_query(
    user_id:      str,
    question:     str,
    decision:     str,
    confidence:   int,
    audit_score:  int,
    duration_s:   float,
    justification: str = "",
    summary:      str  = "",
    clauses_count: int = 0,
) -> bool:
    """
    Persist a completed query to Supabase.
    Returns True on success, False on failure.
    """
    db = get_supabase()
    if not db:
        return False

    try:
        record = {
            "user_id_hash":     _hash_user_id(user_id),
            "timestamp":        datetime.now(timezone.utc).isoformat(),
            "decision":         decision.lower(),
            "confidence":       confidence,
            "audit_score":      audit_score,
            "duration_s":       round(duration_s, 2),
            "clauses_count":    clauses_count,
            "enc_question":     question,
            "enc_justification":justification,
            "enc_summary":      summary,
        }
        db.table("query_history").insert(record).execute()
        logger.debug(f"[db] Query saved for user {user_id[:8]}…")
        return True
    except Exception as exc:
        logger.error(f"[db] Failed to save query: {exc}")
        return False


def get_user_queries(user_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch recent queries for a user.
    Returns a list of dicts with both plaintext and historical enc_ fields renamed.
    """
    db = get_supabase()
    if not db:
        return []

    try:
        result = (
            db.table("query_history")
            .select("*")
            .eq("user_id_hash", _hash_user_id(user_id))
            .order("timestamp", desc=True)
            .limit(limit)
            .execute()
        )
        rows = result.data or []
        # Map existing database columns to frontend expectations
        for row in rows:
            if "enc_question" in row:
                row["question"] = row.pop("enc_question")
            if "enc_justification" in row:
                row["justification"] = row.pop("enc_justification")
            if "enc_summary" in row:
                row["summary"] = row.pop("enc_summary")
        return rows
    except Exception as exc:
        logger.error(f"[db] Failed to fetch queries: {exc}")
        return []


def clear_user_queries(user_id: str) -> bool:
    """Delete all query history for a user."""
    db = get_supabase()
    if not db:
        return False
    try:
        db.table("query_history").delete().eq(
            "user_id_hash", _hash_user_id(user_id)
        ).execute()
        logger.info(f"[db] Cleared query history for user {user_id[:8]}…")
        return True
    except Exception as exc:
        logger.error(f"[db] Failed to clear queries: {exc}")
        return False


def get_user_analytics(user_id: str) -> dict:
    """
    Compute dashboard analytics from plaintext fields only —
    no decryption needed for counts, averages, and decision breakdowns.
    """
    db = get_supabase()
    if not db:
        return _empty_analytics()

    try:
        result = (
            db.table("query_history")
            .select("decision, confidence, audit_score, duration_s, clauses_count, timestamp")
            .eq("user_id_hash", _hash_user_id(user_id))
            .order("timestamp", desc=True)
            .limit(500)
            .execute()
        )
        rows = result.data or []
        return _compute_analytics(rows)
    except Exception as exc:
        logger.error(f"[db] Failed to fetch analytics: {exc}")
        return _empty_analytics()


def _empty_analytics() -> dict:
    return {
        "total_queries": 0,
        "avg_confidence": 0.0,
        "avg_audit_score": 0.0,
        "avg_duration_s": 0.0,
        "decisions": {"approve": 0, "reject": 0, "partial": 0, "informational": 0},
        "daily_counts": [],
    }


def _compute_analytics(rows: list[dict]) -> dict:
    """Compute all analytics from plaintext DB fields — no decryption needed."""
    from collections import defaultdict

    if not rows:
        return _empty_analytics()

    total     = len(rows)
    decisions = {"approve": 0, "reject": 0, "partial": 0, "informational": 0}
    conf_sum  = 0.0
    audit_sum = 0.0
    dur_sum   = 0.0
    daily: dict[str, dict] = defaultdict(lambda: {"queries": 0, "approved": 0, "rejected": 0})

    for row in rows:
        d = row.get("decision", "informational").lower()
        if d in decisions:
            decisions[d] += 1
        else:
            decisions["informational"] += 1

        conf_sum  += row.get("confidence",  0)
        audit_sum += row.get("audit_score", 0)
        dur_sum   += row.get("duration_s",  0)

        ts       = row.get("timestamp", "")
        date_key = ts[:10] if ts else "unknown"
        daily[date_key]["queries"]  += 1
        if d == "approve": daily[date_key]["approved"] += 1
        if d == "reject":  daily[date_key]["rejected"] += 1

    daily_counts = [
        {"date": k, "queries": v["queries"], "approved": v["approved"], "rejected": v["rejected"]}
        for k, v in sorted(daily.items())[-14:]
    ]

    return {
        "total_queries":   total,
        "avg_confidence":  round(conf_sum  / total, 1),
        "avg_audit_score": round(audit_sum / total, 1),
        "avg_duration_s":  round(dur_sum   / total, 2),
        "decisions":       decisions,
        "daily_counts":    daily_counts,
    }


# ---------------------------------------------------------------------------
# Ingest history operations
# ---------------------------------------------------------------------------

def save_ingest(
    user_id:      str,
    files_count:  int,
    nodes_created: int,
    duration_s:   float,
    filenames:    list[str],
) -> bool:
    """
    Persist an ingest event to Supabase.
    """
    db = get_supabase()
    if not db:
        return False

    try:
        record = {
            "user_id_hash":  _hash_user_id(user_id),
            "timestamp":     datetime.now(timezone.utc).isoformat(),
            "files_count":   files_count,
            "nodes_created": nodes_created,
            "duration_s":    round(duration_s, 2),
            "enc_filenames": json.dumps(filenames),
        }
        db.table("ingest_history").insert(record).execute()
        logger.debug(f"[db] Ingest saved for user {user_id[:8]}…")
        return True
    except Exception as exc:
        logger.error(f"[db] Failed to save ingest: {exc}")
        return False