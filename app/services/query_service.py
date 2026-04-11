"""
query_service.py — Answer Generation Pipeline
==============================================
The LangGraph workflow to read chunks and retrieve answers.
"""

from typing import Any, Dict, Optional, List
from typing_extensions import TypedDict
from loguru import logger
import json

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, END

from app.schemas.domain import RelevanceGrade, InsuranceAnswer, AuditResult
from app.services.vector_store import get_user_retriever, nodes_to_chunks, chunks_to_context
from app.services.llm_client import init_llm
from app.utils.text_helpers import parse_llm_json

MAX_REWRITES = 2

class RAGState(TypedDict):
    query:            str
    rewrite_count:    int
    current_query:    str
    retrieved_chunks: List[Dict[str, Any]]
    relevance:        Optional[RelevanceGrade]
    answer:           Optional[InsuranceAnswer]
    raw_answer_text:  str
    audit:            Optional[AuditResult]
    final_response:   Optional[Dict[str, Any]]
    error:            Optional[str]
    user_id:          str
    history:          List[Dict[str, str]]

def node_retrieve(state: RAGState) -> RAGState:
    query = state["current_query"]
    user_id = state.get("user_id", "shared")
    try:
        retriever = get_user_retriever(user_id)
        nodes  = retriever.retrieve(query)
        chunks = nodes_to_chunks(nodes)
        return {**state, "retrieved_chunks": chunks, "error": None}
    except Exception as exc:
        return {**state, "retrieved_chunks": [], "error": str(exc)}

def node_grade_relevance(state: RAGState) -> RAGState:
    chunks = state["retrieved_chunks"]
    if not chunks:
        return {**state, "relevance": RelevanceGrade(relevant=False, score=0, reason="No chunks.")}

    context = chunks_to_context(chunks[:5])
    system_prompt = "Grade relevance 0-10. JSON: {\"relevant\": bool, \"score\": int, \"reason\": \"str\"}. score>=7 is true."
    llm = init_llm()
    try:
        resp = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=f"Query: {state['query']}\nChunks:\n{context}")])
        grade = RelevanceGrade(**parse_llm_json(resp.content))
        return {**state, "relevance": grade}
    except Exception:
        return {**state, "relevance": RelevanceGrade(relevant=True, score=7, reason="Parse err")}

def node_rewrite_query(state: RAGState) -> RAGState:
    original, current, c = state["query"], state["current_query"], state["rewrite_count"]
    hist = []
    for m in state.get("history", []):
        role_label = "User" if m["role"] == "user" else "Assistant"
        hist.append(f"{role_label}: {m['content']}")
    history_ctx = "\n".join(hist)
    
    llm = init_llm()
    try:
        sys = "Rewrite the user's latest query to be standalone taking the chat history into account. Output ONLY the rewritten query."
        prompt = f"Chat History:\n{history_ctx}\n\nOriginal Query: {original}\nCurrent Query: {current}"
        resp = llm.invoke([SystemMessage(content=sys), HumanMessage(content=prompt)])
        return {**state, "current_query": resp.content.strip().strip('"\''), "rewrite_count": c + 1}
    except Exception:
        return {**state, "current_query": original, "rewrite_count": c + 1}

def node_generate_answer(state: RAGState) -> RAGState:
    context = chunks_to_context(state["retrieved_chunks"])
    sys = """You are InsightAI, an expert Indian Health Insurance Assistant. Answer the user's question directly, comprehensively, and with precise details based ONLY on the provided [SOURCE] documents.
CRITICAL RULE: You MUST explicitly mention the exact document filename(s) you referenced in both your justification and summary (e.g. 'According to Star_Health_Policy.pdf...').
If the context does not contain the answer, say so clearly.
Make a decision: approve | reject | partial | informational.
Output strictly valid JSON: { "decision": "...", "justification": "Detailed, precise explanation citing the exact source filename...", "clauses": ["Exact quoted clause text..."], "conditions": ["Relevant condition..."], "summary": "Clear one-sentence summary mentioning the file name...", "confidence": int_0_to_100 }"""
    llm = init_llm()
    try:
        messages = [SystemMessage(content=sys)]
        for m in state.get("history", []):
            if m["role"] == "user":
                messages.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                messages.append(AIMessage(content=m["content"]))
        messages.append(HumanMessage(content=f"Q:{state['query']}\n\nSRC:{context}"))
        
        resp = llm.invoke(messages)
        data = parse_llm_json(resp.content)
        data.setdefault("conditions", [])
        data.setdefault("summary", "")
        return {**state, "answer": InsuranceAnswer(**data), "raw_answer_text": resp.content}
    except Exception as exc:
        ans = InsuranceAnswer(decision="informational", justification=f"Generation failed: {exc}", clauses=[], confidence=0, conditions=[], summary="Internal Error")
        return {**state, "answer": ans, "raw_answer_text": "", "error": str(exc)}

def node_audit_answer(state: RAGState) -> RAGState:
    if not state["answer"]:
        audit = AuditResult(score=0, flags=["None"], summary="Fail")
        return {**state, "audit": audit, "final_response": _build_final_response(state, audit)}
    
    context = chunks_to_context(state["retrieved_chunks"][:10])
    sys = "Audit the answer against sources. JSON: {\"score\": int, \"flags\": [], \"summary\": \"\"}"
    llm = init_llm()
    try:
        resp = llm.invoke([SystemMessage(content=sys), HumanMessage(content=f"Q:{state['query']}\nA:{json.dumps(state['answer'].model_dump())}\nSrc:{context}")])
        audit = AuditResult(**parse_llm_json(resp.content))
    except Exception as exc:
        audit = AuditResult(score=70, flags=[str(exc)], summary="Parse err")

    return {**state, "audit": audit, "final_response": _build_final_response(state, audit)}

def _build_final_response(state: RAGState, audit: AuditResult) -> Dict[str, Any]:
    ans = state["answer"]
    res = {
        "query": state["query"],
        "answer": ans.model_dump() if ans else {},
        "audit": audit.model_dump(),
        "retrieval_info": {"chunks_used": len(state["retrieved_chunks"]), "rewrites_done": state["rewrite_count"], "final_query": state["current_query"]}
    }
    if audit.score < 80:
        res["warning"] = "Low unfaithful score. Verifying manually."
    return res

def route_after_grading(state: RAGState) -> str:
    if state.get("relevance", RelevanceGrade(relevant=False, score=0, reason="")).relevant:
        return "generate_answer"
    elif state.get("rewrite_count", 0) < MAX_REWRITES:
        return "rewrite_query"
    return "generate_answer"

def build_graph():
    g = StateGraph(RAGState)
    g.add_node("retrieve", node_retrieve)
    g.add_node("grade_relevance", node_grade_relevance)
    g.add_node("rewrite_query", node_rewrite_query)
    g.add_node("generate_answer", node_generate_answer)
    g.add_node("audit_answer", node_audit_answer)
    g.set_entry_point("retrieve")
    g.add_edge("retrieve", "grade_relevance")
    g.add_edge("rewrite_query", "retrieve")
    g.add_edge("generate_answer", "audit_answer")
    g.add_edge("audit_answer", END)
    g.add_conditional_edges("grade_relevance", route_after_grading, {"generate_answer": "generate_answer", "rewrite_query": "rewrite_query"})
    return g.compile()

def run_query(user_query: str, history: List[Dict[str, str]] = None, user_id: str = "shared") -> Dict[str, Any]:
    initial_state: RAGState = {
        "query": user_query, "current_query": user_query, "rewrite_count": 0, "retrieved_chunks": [],
        "relevance": None, "answer": None, "raw_answer_text": "", "audit": None, "final_response": None, "error": None, "user_id": user_id,
        "history": history or []
    }
    graph = build_graph()
    result = graph.invoke(initial_state)
    return result.get("final_response", {"error": "No response"})
