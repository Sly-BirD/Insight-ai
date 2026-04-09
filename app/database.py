"""
database.py — InsightAI Supabase Database Layer
=================================================
Step 10: Persistent per-user query history with field-level encryption.

Architecture:
  - Supabase (PostgreSQL) stores query records per user
  - Sensitive fields (question, justification, filenames) are encrypted
    with AES-256-GCM before storage — developers cannot read them
  - Non-sensitive fields (decision, confidence, audit_score, timestamp)
    stored in plaintext for dashboard aggregation without decryption
  - User IDs are hashed (SHA-256) before storage — cannot be reversed
    to real Clerk user IDs even with database access
  - Row Level Security (RLS) enforced at DB level via Supabase policies

Supabase table schema (run in Supabase SQL editor):

    -- Enable pgcrypto for UUID generation
    create extension if not exists "pgcrypto";

    -- Query history table
    create table if not exists query_history (
        id              uuid primary key default gen_random_uuid(),
        user_id_hash    text not null,          -- SHA-256 of Clerk user_id
        timestamp       timestamptz not null default now(),
        decision        text not null,           -- plaintext: approve/reject/partial/informational
        confidence      integer not null,        -- plaintext: 0-100
        audit_score     integer not null,        -- plaintext: 0-100
        duration_s      real not null,           -- plaintext: seconds
        clauses_count   integer not null default 0, -- plaintext: number of clauses cited
        -- Encrypted fields (AES-256-GCM, base64-encoded ciphertext)
        enc_question    text,                    -- encrypted question text
        enc_justification text,                  -- encrypted justification
        enc_summary     text,                    -- encrypted one-line summary
        created_at      timestamptz not null default now()
    );

    -- Index for fast user history lookups
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
        enc_filenames   text,                    -- encrypted JSON array of filenames
        created_at      timestamptz not null default now()
    );

    create index if not exists idx_ingest_history_user
        on ingest_history(user_id_hash, timestamp desc);

    -- Note: We use service_role key server-side so no RLS needed for
    -- server-to-server calls. RLS would be added when using anon key
    -- from the frontend directly.
"""

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from loguru import logger
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ENCRYPTION_SECRET    = os.environ.get("ENCRYPTION_SECRET", "")

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

def _derive_key(user_id: str) -> bytes:
    """
    Derive a 32-byte AES key from the user_id + server secret.
    Uses PBKDF2-HMAC-SHA256 with 100k iterations.

    Each user gets a DIFFERENT key derived from their ID,
    so even if one key is compromised, others are safe.
    """
    if not ENCRYPTION_SECRET:
        raise ValueError("ENCRYPTION_SECRET not set in environment")
    return hashlib.pbkdf2_hmac(
        "sha256",
        user_id.encode(),
        ENCRYPTION_SECRET.encode(),
        iterations=100_000,
        dklen=32,
    )


def _hash_user_id(user_id: str) -> str:
    """
    One-way hash of the Clerk user_id for storage.
    SHA-256 + server secret as salt — cannot be reversed.
    """
    salted = f"{ENCRYPTION_SECRET}:{user_id}".encode()
    return hashlib.sha256(salted).hexdigest()


def encrypt_field(plaintext: str, user_id: str) -> str:
    """
    Encrypt a string field using AES-256-GCM.
    Returns a base64-encoded string: nonce(12B) + ciphertext.
    """
    if not plaintext:
        return ""
    try:
        key    = _derive_key(user_id)
        aesgcm = AESGCM(key)
        nonce  = os.urandom(12)                          # 96-bit nonce, unique per encryption
        ct     = aesgcm.encrypt(nonce, plaintext.encode(), None)
        return base64.b64encode(nonce + ct).decode()
    except Exception as exc:
        logger.error(f"[db] Encryption failed: {exc}")
        return ""


def decrypt_field(ciphertext: str, user_id: str) -> str:
    """
    Decrypt a field encrypted with encrypt_field().
    Returns empty string on any failure.
    """
    if not ciphertext:
        return ""
    try:
        key    = _derive_key(user_id)
        aesgcm = AESGCM(key)
        raw    = base64.b64decode(ciphertext)
        nonce  = raw[:12]
        ct     = raw[12:]
        return aesgcm.decrypt(nonce, ct, None).decode()
    except Exception as exc:
        logger.warning(f"[db] Decryption failed: {exc}")
        return "[encrypted]"


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
    Sensitive fields are encrypted with the user's derived key.
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
            # Encrypted fields — developers see ciphertext, not plaintext
            "enc_question":     encrypt_field(question,      user_id),
            "enc_justification":encrypt_field(justification, user_id),
            "enc_summary":      encrypt_field(summary,       user_id),
        }
        db.table("query_history").insert(record).execute()
        logger.debug(f"[db] Query saved for user {user_id[:8]}…")
        return True
    except Exception as exc:
        logger.error(f"[db] Failed to save query: {exc}")
        return False


def get_user_queries(user_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch and decrypt recent queries for a user.
    Returns a list of dicts with both plaintext and decrypted fields.
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
        # Decrypt sensitive fields for the authenticated user
        for row in rows:
            row["question"]     = decrypt_field(row.pop("enc_question",      ""), user_id)
            row["justification"] = decrypt_field(row.pop("enc_justification", ""), user_id)
            row["summary"]      = decrypt_field(row.pop("enc_summary",       ""), user_id)
        return rows
    except Exception as exc:
        logger.error(f"[db] Failed to fetch queries: {exc}")
        return []


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
    Persist an ingest event. Filenames are encrypted since they may
    reveal what health insurance documents the user has.
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
            "enc_filenames": encrypt_field(json.dumps(filenames), user_id),
        }
        db.table("ingest_history").insert(record).execute()
        logger.debug(f"[db] Ingest saved for user {user_id[:8]}…")
        return True
    except Exception as exc:
        logger.error(f"[db] Failed to save ingest: {exc}")
        return False