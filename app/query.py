"""
query.py — InsightAI Adaptive RAG Query Pipeline
=================================================
Self-reflective RAG loop using LangGraph + LlamaIndex.

Step 6 improvements:
  - Upgraded to llama-3.3-70b-versatile (free on Groq, far better reasoning)
  - max_tokens: 1500 → 2500 for richer justifications
  - generate_answer prompt: demands multi-paragraph justification, exact
    clause numbers, conditions/exceptions, and practical implications
  - audit prompt: stricter, checks for missing waiting periods/exclusions
  - TOP_K: 5 → 7 to give the LLM more source material
  - chunks_to_context: now includes full chunk text (was truncated)
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional
from typing_extensions import TypedDict
from dotenv import load_dotenv

import weaviate
from loguru import logger
from pydantic import BaseModel, Field

from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

from llama_index.core import Settings, StorageContext, load_index_from_storage
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.weaviate import WeaviateVectorStore

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WEAVIATE_HOST       = "localhost"
WEAVIATE_PORT       = 8080
WEAVIATE_INDEX_NAME = "InsurancePolicies"
EMBED_MODEL_NAME    = "BAAI/bge-base-en-v1.5"
PERSIST_DIR         = str(Path(__file__).parent.parent / "storage")

TOP_K           = 7    # ↑ more chunks = richer context for the LLM
MAX_REWRITES    = 2
AUDIT_THRESHOLD = 80

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

os.makedirs("logs", exist_ok=True)
logger.remove()
logger.add(sys.stderr, level="INFO", colorize=True,
           format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}")
logger.add("logs/query.log", level="DEBUG", rotation="10 MB",
           format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}")

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class RelevanceGrade(BaseModel):
    relevant: bool = Field(description="True if chunks are relevant enough")
    score: int     = Field(description="Relevance score 0-10", ge=0, le=10)
    reason: str    = Field(description="Brief explanation")


class InsuranceAnswer(BaseModel):
    decision:      str       = Field(description="approve | reject | partial | informational")
    justification: str       = Field(description="Detailed multi-paragraph explanation")
    clauses:       list[str] = Field(description="Cited clauses as 'filename:section:clause_text'")
    confidence:    int       = Field(description="0-100", ge=0, le=100)
    conditions:    list[str] = Field(default_factory=list, description="Key conditions, waiting periods, or exclusions that apply")
    summary:       str       = Field(default="", description="One-sentence plain-English summary for non-experts")


class AuditResult(BaseModel):
    score:   int       = Field(description="Faithfulness score 0-100", ge=0, le=100)
    flags:   list[str] = Field(description="Specific issues found")
    summary: str       = Field(description="One-sentence audit verdict")

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class RAGState(TypedDict):
    query:            str
    rewrite_count:    int
    current_query:    str
    retrieved_chunks: list[dict[str, Any]]
    relevance:        Optional[RelevanceGrade]
    answer:           Optional[InsuranceAnswer]
    raw_answer_text:  str
    audit:            Optional[AuditResult]
    final_response:   Optional[dict[str, Any]]
    error:            Optional[str]

# ---------------------------------------------------------------------------
# Global singletons
# ---------------------------------------------------------------------------

_retriever:       Optional[VectorIndexRetriever]    = None
_llm:             Optional[ChatGroq]                = None
_weaviate_client: Optional[weaviate.WeaviateClient] = None


def init_retriever() -> VectorIndexRetriever:
    global _weaviate_client
    logger.info("Initialising retriever…")
    Settings.embed_model = HuggingFaceEmbedding(model_name=EMBED_MODEL_NAME, device="cpu")
    Settings.llm = None
    _weaviate_client = weaviate.connect_to_local(host=WEAVIATE_HOST, port=WEAVIATE_PORT)
    logger.success("Connected to Weaviate.")
    vector_store = WeaviateVectorStore(
        weaviate_client=_weaviate_client,
        index_name=WEAVIATE_INDEX_NAME,
        text_key="content",
    )
    storage_context = StorageContext.from_defaults(
        vector_store=vector_store,
        persist_dir=PERSIST_DIR,
    )
    index = load_index_from_storage(storage_context)
    logger.success("Index loaded from storage.")
    return VectorIndexRetriever(index=index, similarity_top_k=TOP_K)


def init_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = ChatGroq(
            # Step 6: upgraded from 8b-instant → 70b-versatile
            # llama-3.3-70b-versatile is free on Groq and dramatically
            # better at multi-step insurance policy reasoning
            model="llama-3.3-70b-versatile",
            api_key=os.environ.get("GROQ_API_KEY"),
            temperature=0.15,
            max_tokens=2500,  # ↑ was 1500 — needed for rich justifications
        )
    return _llm

# ---------------------------------------------------------------------------
# JSON parser
# ---------------------------------------------------------------------------

def _parse_llm_json(raw: str) -> dict:
    text = raw.strip()
    if "```" in text:
        text = re.sub(r"```(?:json)?", "", text).strip().replace("```", "").strip()
    candidates = re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}", text, re.DOTALL)
    candidates = [text] + candidates
    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate:
            continue
        try:
            result = json.loads(candidate)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            continue
    match = re.search(r"\{.*?\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError(f"No valid JSON found in: {text[:300]}")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def nodes_to_chunks(nodes) -> list[dict[str, Any]]:
    chunks = []
    for n in nodes:
        chunks.append({
            "text":       n.node.get_content(),
            "score":      round(float(n.score or 0), 4),
            "filename":   n.node.metadata.get("filename", "unknown"),
            "page":       n.node.metadata.get("page_label", "?"),
            "section":    n.node.metadata.get("section_title",
                          n.node.metadata.get("section", "General")),
            "clause_ref": n.node.metadata.get("clause_ref", ""),
            "insurer":    n.node.metadata.get("insurer", "Unknown"),
        })
    return chunks


def chunks_to_context(chunks: list[dict]) -> str:
    """
    Format chunks into a rich context block.
    Step 6: no longer truncates chunk text — gives LLM full content.
    """
    parts = []
    for i, c in enumerate(chunks, 1):
        clause_info = f" | Clause ref: {c['clause_ref']}" if c.get("clause_ref") else ""
        header = (
            f"[SOURCE {i}]\n"
            f"  File    : {c['filename']}\n"
            f"  Insurer : {c['insurer']}\n"
            f"  Section : {c['section']}{clause_info}\n"
            f"  Page    : {c['page']}\n"
            f"  Score   : {c['score']}\n"
        )
        parts.append(f"{header}\n{c['text']}")
    return "\n\n{'─'*60}\n\n".join(parts)

# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------

def node_retrieve(state: RAGState) -> RAGState:
    query = state["current_query"]
    logger.info(f"[retrieve] Query: '{query[:90]}'" if len(query) > 90 else f"[retrieve] Query: '{query}'")
    try:
        nodes  = _retriever.retrieve(query)
        chunks = nodes_to_chunks(nodes)
        logger.info(f"[retrieve] Got {len(chunks)} chunks. Top score: {chunks[0]['score'] if chunks else 'N/A'}")
        return {**state, "retrieved_chunks": chunks, "error": None}
    except Exception as exc:
        logger.error(f"[retrieve] Failed: {exc}")
        return {**state, "retrieved_chunks": [], "error": str(exc)}


def node_grade_relevance(state: RAGState) -> RAGState:
    query  = state["query"]
    chunks = state["retrieved_chunks"]
    if not chunks:
        return {**state, "relevance": RelevanceGrade(relevant=False, score=0, reason="No chunks retrieved.")}

    # Only use top-3 for grading (saves tokens)
    context = chunks_to_context(chunks[:3])

    system_prompt = """You are a relevance grader for an Indian health insurance RAG system.
Decide if the retrieved policy chunks are relevant and sufficient to answer the query.

Respond with ONLY valid JSON:
{
  "relevant": true or false,
  "score": <integer 0-10>,
  "reason": "<one concise sentence>"
}

Score guide:
  8-10 → chunks directly answer with specific policy clauses
  5-7  → partially relevant, some useful info but gaps exist
  0-4  → off-topic or too vague

Set relevant=true only when score >= 7."""

    logger.info("[grade_relevance] Grading retrieved chunks…")
    try:
        resp  = _llm.invoke([SystemMessage(content=system_prompt),
                              HumanMessage(content=f"Query: {query}\n\nChunks:\n{context}\n\nGrade.")])
        data  = _parse_llm_json(resp.content)
        grade = RelevanceGrade(**data)
        logger.info(f"[grade_relevance] Score={grade.score} | Relevant={grade.relevant} | {grade.reason}")
        return {**state, "relevance": grade}
    except Exception as exc:
        logger.error(f"[grade_relevance] Parse error: {exc}. Defaulting to relevant=True.")
        return {**state, "relevance": RelevanceGrade(relevant=True, score=7, reason=f"Grade error (defaulted): {exc}")}


def node_rewrite_query(state: RAGState) -> RAGState:
    original      = state["query"]
    current       = state["current_query"]
    rewrite_count = state["rewrite_count"]

    system_prompt = """You are an expert at reformulating search queries for Indian health insurance documents.
Rewrite the query using precise insurance terminology:
waiting period, exclusions, sum insured, cashless hospitalisation, pre-existing disease (PED),
network hospital, sub-limit, co-payment, deductible, room rent, day care procedure, AYUSH, etc.

Respond with ONLY the rewritten query — no explanation, no quotes."""

    logger.info(f"[rewrite_query] Rewriting (attempt {rewrite_count + 1}/{MAX_REWRITES})…")
    try:
        resp      = _llm.invoke([SystemMessage(content=system_prompt),
                                  HumanMessage(content=f"Original: {original}\nCurrent: {current}\n\nRewrite:")])
        new_query = resp.content.strip().strip('"\'')
        logger.info(f"[rewrite_query] → '{new_query}'")
        return {**state, "current_query": new_query, "rewrite_count": rewrite_count + 1}
    except Exception as exc:
        logger.error(f"[rewrite_query] Failed: {exc}")
        return {**state, "current_query": original, "rewrite_count": rewrite_count + 1}


def node_generate_answer(state: RAGState) -> RAGState:
    """
    Step 6: Completely rewritten prompt demanding:
    - Multi-paragraph justification with explicit clause references
    - Conditions array listing waiting periods, sub-limits, exclusions
    - Plain-English summary for non-experts
    - Honest confidence calibration
    """
    query   = state["query"]
    chunks  = state["retrieved_chunks"]
    context = chunks_to_context(chunks)

    system_prompt = """You are InsightAI — a senior Indian health insurance policy analyst with 15+ years of experience.
A user has asked a question about an insurance policy. You have retrieved relevant chunks from the policy documents.

Your task is to provide a thorough, expert-level analysis. You MUST:

1. DECISION — Choose ONE of:
   • approve       : policy clearly and explicitly covers the scenario
   • reject        : policy clearly and explicitly excludes the scenario
   • partial       : covered BUT with conditions (waiting periods, sub-limits, co-payments, exclusions)
   • informational : factual/definitional question — no coverage decision applicable

2. JUSTIFICATION — Write 2-4 paragraphs that:
   • Open with the direct answer (e.g. "Under Section 4.2 of the HDFC Easy Health policy, pre-existing diseases have a waiting period of…")
   • Cite specific clause numbers, section names, and exact policy language
   • Explain WHY — the reasoning behind the clause, not just what it says
   • Address any nuances, exceptions, or edge cases visible in the text
   • If information is missing from the chunks, explicitly state what is unknown

3. CLAUSES — List every supporting excerpt as:
   "filename | Section: <section> | <exact quoted text from the chunk>"
   Include at least 2-3 clauses. Quote actual text, not paraphrases.

4. CONDITIONS — List ALL applicable conditions as separate items:
   • Waiting periods (e.g. "4-year waiting period for pre-existing diseases")
   • Sub-limits (e.g. "Room rent capped at 1% of sum insured per day")
   • Co-payments (e.g. "20% co-payment for claims in non-network hospitals")
   • Exclusions (e.g. "Self-inflicted injuries excluded under clause 7.1.5")
   • Age restrictions, policy tenure requirements, etc.
   Leave empty [] only if genuinely no conditions apply.

5. SUMMARY — One plain-English sentence a non-expert can understand immediately.

6. CONFIDENCE — Rate 0-100:
   • 90-100 : Answer is explicitly stated in the retrieved text
   • 70-89  : Strong evidence but some inference required
   • 50-69  : Partial evidence, significant gaps in retrieved text
   • 0-49   : Insufficient evidence — answer is mostly inference

IMPORTANT RULES:
- Base ONLY on the provided source chunks — never use outside knowledge
- If a specific number (e.g. waiting period duration) is NOT in the chunks, say "not specified in retrieved sections"
- Do NOT give definitive legal or financial advice
- Respond with ONLY valid JSON — absolutely no text before or after the JSON

JSON schema:
{
  "decision": "<approve|reject|partial|informational>",
  "justification": "<2-4 paragraph detailed analysis>",
  "clauses": ["<filename> | Section: <section> | <exact clause text>", ...],
  "conditions": ["<condition 1>", "<condition 2>", ...],
  "summary": "<one plain-English sentence>",
  "confidence": <integer 0-100>
}"""

    user_prompt = (
        f"USER QUESTION:\n{query}\n\n"
        f"RETRIEVED POLICY SOURCES:\n{context}\n\n"
        "Provide your expert analysis as JSON."
    )

    logger.info("[generate_answer] Generating rich structured answer…")
    try:
        resp   = _llm.invoke([SystemMessage(content=system_prompt),
                               HumanMessage(content=user_prompt)])
        raw    = resp.content
        data   = _parse_llm_json(raw)

        # Ensure new fields have defaults if missing (backwards compat)
        data.setdefault("conditions", [])
        data.setdefault("summary", "")

        answer = InsuranceAnswer(**data)
        logger.info(f"[generate_answer] Decision={answer.decision} | Confidence={answer.confidence}% | Conditions={len(answer.conditions)}")
        return {**state, "answer": answer, "raw_answer_text": raw}

    except Exception as exc:
        logger.error(f"[generate_answer] Failed: {exc}")
        answer = InsuranceAnswer(
            decision="informational",
            justification=(
                f"The query could not be fully analysed due to a processing error: {exc}. "
                "The retrieved chunks may still contain relevant information — "
                "please review the source documents directly."
            ),
            clauses=[f"{c['filename']} | Section: {c['section']} | {c['text'][:200]}…" for c in chunks[:3]],
            conditions=[],
            summary="Unable to generate a structured answer — please check source documents.",
            confidence=10,
        )
        return {**state, "answer": answer, "raw_answer_text": ""}


def node_audit_answer(state: RAGState) -> RAGState:
    """
    Step 6: Stricter audit prompt — specifically checks for
    missing waiting periods, missing exclusions, and overconfident
    claims that aren't backed by the retrieved text.
    """
    answer  = state["answer"]
    chunks  = state["retrieved_chunks"]
    query   = state["query"]
    context = chunks_to_context(chunks[:5])

    if answer is None:
        audit = AuditResult(score=0, flags=["No answer generated."], summary="Audit failed.")
        return {**state, "audit": audit, "final_response": _build_final_response(state, audit)}

    system_prompt = """You are a compliance auditor reviewing an AI-generated Indian health insurance policy answer.

Check the answer against the source chunks for:

1. FAITHFULNESS — Every claim must trace to a source chunk. Flag any statement not supported.
2. COMPLETENESS — Are these commonly omitted but critical items mentioned if present in sources?
   • Waiting periods (initial, specific, PED)
   • Exclusions (permanent, temporary)
   • Sub-limits and co-payment requirements
   • Age limits or eligibility conditions
3. ACCURACY — Are insurance terms used correctly?
4. CALIBRATION — Is the confidence score appropriate given the evidence?
5. HALLUCINATION — Any invented clause numbers, amounts, or conditions?

Respond with ONLY valid JSON:
{
  "score": <integer 0-100>,
  "flags": ["<specific issue with enough detail to act on>", ...],
  "summary": "<one sentence verdict>"
}

Score: 90-100=excellent, 75-89=good, 60-74=needs review, <60=unreliable
Use [] for flags only if the answer is genuinely complete and faithful."""

    user_prompt = (
        f"ORIGINAL QUESTION: {query}\n\n"
        f"GENERATED ANSWER:\n{json.dumps(answer.model_dump(), indent=2)}\n\n"
        f"SOURCE CHUNKS:\n{context}\n\n"
        "Audit this answer."
    )

    logger.info("[audit_answer] Auditing answer…")
    try:
        resp  = _llm.invoke([SystemMessage(content=system_prompt),
                              HumanMessage(content=user_prompt)])
        data  = _parse_llm_json(resp.content)
        audit = AuditResult(**data)
        logger.info(f"[audit_answer] Score={audit.score}/100 | Flags={len(audit.flags)}")
    except Exception as exc:
        logger.error(f"[audit_answer] Parse error: {exc}")
        audit = AuditResult(score=70, flags=[f"Audit parse error: {exc}"], summary="Audit completed with a warning.")

    final = _build_final_response(state, audit)
    return {**state, "audit": audit, "final_response": final}


def _build_final_response(state: RAGState, audit: AuditResult) -> dict[str, Any]:
    answer   = state["answer"]
    ans_dict = answer.model_dump() if answer else {}

    response: dict[str, Any] = {
        "query":  state["query"],
        "answer": ans_dict,
        "audit": {
            "score":   audit.score,
            "flags":   audit.flags,
            "summary": audit.summary,
        },
        "retrieval_info": {
            "chunks_used":   len(state["retrieved_chunks"]),
            "rewrites_done": state["rewrite_count"],
            "final_query":   state["current_query"],
        },
    }

    if audit.score < AUDIT_THRESHOLD:
        response["warning"] = (
            f"This answer scored {audit.score}/100 on faithfulness audit. "
            f"Issues: {'; '.join(audit.flags) if audit.flags else 'none specified'}. "
            "Verify against the original policy document before acting on this."
        )

    return response

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def route_after_grading(state: RAGState) -> str:
    grade         = state.get("relevance")
    rewrite_count = state.get("rewrite_count", 0)
    if grade and grade.relevant:
        logger.info("[router] Chunks relevant → generate_answer")
        return "generate_answer"
    elif rewrite_count < MAX_REWRITES:
        logger.info(f"[router] Score={grade.score if grade else '?'} → rewrite_query (attempt {rewrite_count + 1}/{MAX_REWRITES})")
        return "rewrite_query"
    else:
        logger.warning("[router] Max rewrites reached → generate_answer (best-effort)")
        return "generate_answer"

# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def build_graph():
    g = StateGraph(RAGState)
    g.add_node("retrieve",        node_retrieve)
    g.add_node("grade_relevance", node_grade_relevance)
    g.add_node("rewrite_query",   node_rewrite_query)
    g.add_node("generate_answer", node_generate_answer)
    g.add_node("audit_answer",    node_audit_answer)
    g.set_entry_point("retrieve")
    g.add_edge("retrieve",        "grade_relevance")
    g.add_edge("rewrite_query",   "retrieve")
    g.add_edge("generate_answer", "audit_answer")
    g.add_edge("audit_answer",    END)
    g.add_conditional_edges("grade_relevance", route_after_grading,
                             {"generate_answer": "generate_answer", "rewrite_query": "rewrite_query"})
    return g.compile()

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_query(user_query: str) -> dict[str, Any]:
    initial_state: RAGState = {
        "query":            user_query,
        "current_query":    user_query,
        "rewrite_count":    0,
        "retrieved_chunks": [],
        "relevance":        None,
        "answer":           None,
        "raw_answer_text":  "",
        "audit":            None,
        "final_response":   None,
        "error":            None,
    }
    logger.info(f"\n{'='*60}\nQuery: {user_query}\n{'='*60}")
    graph  = build_graph()
    result = graph.invoke(initial_state)
    return result.get("final_response", {"error": "Pipeline returned no response."})


# ---------------------------------------------------------------------------
# Standalone test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        _retriever = init_retriever()
        _llm       = init_llm()
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        sys.exit(1)

    queries = [
        "What is the waiting period for pre-existing diseases in HDFC Easy Health policy?",
        "What are the major exclusions under HDFC Life Cardiac Care policy?",
    ]

    for q in queries:
        print(f"\n{'#'*60}\nQ: {q}\n{'#'*60}")
        result = run_query(q)
        ans = result.get("answer", {})
        print(f"Decision    : {ans.get('decision','').upper()}")
        print(f"Summary     : {ans.get('summary','')}")
        print(f"Confidence  : {ans.get('confidence')}%")
        print(f"Conditions  : {len(ans.get('conditions',[]))} item(s)")
        for c in ans.get("conditions", []):
            print(f"  • {c}")
        print(f"Clauses     : {len(ans.get('clauses',[]))} cited")
        print(f"Audit       : {result.get('audit',{}).get('score')}/100")
        print(f"\nJustification:\n{ans.get('justification','')[:600]}…")

    if _weaviate_client:
        _weaviate_client.close()