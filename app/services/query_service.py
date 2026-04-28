"""
query_service.py — Answer Generation Pipeline
==============================================
Lean RAG pipeline: Retrieve → (Optional Rewrite) → Generate.
No separate audit LLM call — uses heuristic scoring instead.
"""

from typing import Any, Dict, List
import json
from loguru import logger
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.schemas.domain import InsuranceAnswer
from app.services.vector_store import hybrid_retrieve, chunks_to_dicts, chunks_to_context
from app.services.llm_client import init_llm
from app.utils.text_helpers import parse_llm_json


# ---------------------------------------------------------------------------
# Query Rewrite (only when chat history exists)
# ---------------------------------------------------------------------------

def rewrite_query(user_query: str, history: List[Dict[str, str]]) -> str:
    """Rewrite query to be standalone using chat history. Skipped if no history."""
    if not history:
        return user_query

    hist_str = "\n".join(
        [f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in history[-6:]]
    )
    sys = (
        "Rewrite the user's latest query to be standalone taking the chat history into account. "
        'Output ONLY valid JSON: {"query": "rewritten question here"}.'
    )
    prompt = f"Chat History:\n{hist_str}\n\nOriginal Query: {user_query}"

    try:
        llm = init_llm()
        resp = llm.invoke([SystemMessage(content=sys), HumanMessage(content=prompt)])
        data = parse_llm_json(resp.content)
        return data.get("query", data.get("rewritten_query", user_query))
    except Exception as exc:
        logger.warning(f"Query rewrite failed: {exc}")
        return user_query


# ---------------------------------------------------------------------------
# Answer Generation
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are InsightAI, an expert Indian Health Insurance Assistant. Answer the user's question directly, comprehensively, and with precise details based ONLY on the provided [SOURCE] documents.

CRITICAL RULES:
1. You MUST explicitly mention the exact document filename(s) you referenced (e.g. 'According to Star_Health_Policy.pdf...').
2. If the context does not contain the answer, say so clearly and do NOT hallucinate.
3. Quote the exact clause text from the sources when relevant.

Make a decision: approve | reject | partial | informational.

Output strictly valid JSON:
{
  "decision": "approve|reject|partial|informational",
  "justification": "Detailed explanation citing the exact source filename and section...",
  "clauses": ["Exact quoted clause text from the source..."],
  "conditions": ["Relevant condition or waiting period..."],
  "summary": "Clear one-sentence summary mentioning the file name",
  "confidence": 0-100
}"""


def generate_answer(
    query: str,
    chunks: List[Dict[str, Any]],
    history: List[Dict[str, str]],
) -> InsuranceAnswer:
    """Generate a structured insurance answer from retrieved chunks."""
    if not chunks:
        return InsuranceAnswer(
            decision="informational",
            justification="No relevant documents were found for this query. Please upload the relevant policy PDF first.",
            clauses=[],
            confidence=0,
            conditions=[],
            summary="No documents matched this query.",
        )

    context = chunks_to_context(chunks)

    messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for m in history[-6:]:  # limit history to last 6 messages
        if m["role"] == "user":
            messages.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            messages.append(AIMessage(content=m["content"]))
    messages.append(HumanMessage(content=f"Q: {query}\n\nSOURCES:\n{context}"))

    try:
        llm = init_llm()
        resp = llm.invoke(messages)
        data = parse_llm_json(resp.content)
        data.setdefault("conditions", [])
        data.setdefault("summary", "")
        return InsuranceAnswer(**data)
    except Exception as exc:
        logger.error(f"Generate answer failed: {exc}")
        return InsuranceAnswer(
            decision="informational",
            justification=f"Answer generation failed: {exc}",
            clauses=[],
            confidence=0,
            conditions=[],
            summary="Internal Error",
        )


# ---------------------------------------------------------------------------
# Heuristic Audit (replaces LLM-based audit)
# ---------------------------------------------------------------------------

def heuristic_audit(
    answer: InsuranceAnswer,
    chunks_used: int,
) -> Dict[str, Any]:
    """
    Fast heuristic audit — no LLM call needed.
    Scores based on: confidence, chunk count, clause citations, and decision type.
    """
    score = answer.confidence  # start with model's self-reported confidence
    flags: List[str] = []

    # Boost if plenty of supporting chunks
    if chunks_used >= 5:
        score = min(100, score + 5)
    elif chunks_used <= 2:
        score = max(0, score - 15)
        flags.append(f"Only {chunks_used} source chunk(s) found — limited evidence")

    # Boost if clauses were cited
    if len(answer.clauses) >= 2:
        score = min(100, score + 5)
    elif len(answer.clauses) == 0:
        score = max(0, score - 10)
        flags.append("No specific clauses cited")

    # Penalize very low confidence
    if answer.confidence < 40:
        flags.append("Model reported low confidence")

    # Cap score at 100
    score = max(0, min(100, score))

    summary = "Answer appears well-supported." if score >= 80 else "Answer may need manual verification."

    return {"score": score, "flags": flags, "summary": summary}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_query(
    user_query: str,
    history: List[Dict[str, str]] = None,
    user_id: str = "shared",
) -> Dict[str, Any]:
    """
    Execute the full RAG pipeline:
      1. Rewrite query (only if history exists)
      2. Hybrid retrieve from Weaviate
      3. Generate structured answer
      4. Heuristic audit (no LLM call)
    """
    history = history or []

    # 1. Rewrite (skipped when no history — saves an LLM call)
    current_query = rewrite_query(user_query, history)

    # 2. Retrieve
    try:
        raw_chunks = hybrid_retrieve(current_query, user_id)
        chunks = chunks_to_dicts(raw_chunks)
    except Exception as exc:
        logger.error(f"Retrieval failed: {exc}")
        chunks = []

    # 2b. Filter out low-relevance chunks
    MIN_SCORE = 0.15
    filtered_chunks = [c for c in chunks if c["score"] >= MIN_SCORE]
    if not filtered_chunks and chunks:
        # If all chunks are below threshold, keep top 3 as fallback
        filtered_chunks = sorted(chunks, key=lambda c: c["score"], reverse=True)[:3]
    chunks = filtered_chunks

    # 3. Generate Answer (single LLM call)
    answer = generate_answer(current_query, chunks, history)

    # 4. Heuristic Audit (instant, no LLM call)
    audit = heuristic_audit(answer, len(chunks))

    # 5. Build source chunks for frontend display
    source_chunks = [
        {
            "filename": c["filename"],
            "page": c["page"],
            "section": c["section"],
            "clause_ref": c.get("clause_ref", ""),
            "insurer": c["insurer"],
            "score": c["score"],
            "text": c["text"][:300] + ("…" if len(c["text"]) > 300 else ""),
        }
        for c in chunks[:8]  # limit to top 8 for frontend
    ]

    # 6. Build Response
    res = {
        "query": user_query,
        "answer": answer.model_dump(),
        "audit": audit,
        "retrieval_info": {
            "chunks_used": len(chunks),
            "rewrites_done": 1 if current_query != user_query else 0,
            "final_query": current_query,
        },
        "source_chunks": source_chunks,
    }
    if audit["score"] < 70:
        res["warning"] = "Answer confidence is low. Please verify against the original policy document."

    return res

