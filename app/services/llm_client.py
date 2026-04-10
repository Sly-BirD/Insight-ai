"""
llm_client.py — LLM Orchestrator
=================================
Centralised LLM model configuration.
"""

from typing import Optional
from langchain_groq import ChatGroq
from app.core.config import settings

_llm: Optional[ChatGroq] = None

def init_llm() -> ChatGroq:
    """Initialize and retrieve the ChatGroq LLM instance."""
    global _llm
    if _llm is None:
        _llm = ChatGroq(
            model=settings.LLM_MODEL_NAME,
            api_key=settings.GROQ_API_KEY,
            temperature=0.15,
            max_tokens=2500,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
    return _llm
