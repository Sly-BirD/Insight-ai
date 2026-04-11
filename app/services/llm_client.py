"""
llm_client.py — LLM Orchestrator
=================================
Centralised LLM model configuration.
"""

from typing import Optional
from langchain_groq import ChatGroq
from app.core.config import settings

from loguru import logger

class FallbackLLM:
    def __init__(self, primary, fallback=None):
        self.primary = primary
        self.fallback = fallback

    def invoke(self, *args, **kwargs):
        try:
            return self.primary.invoke(*args, **kwargs)
        except Exception as e:
            if self.fallback:
                logger.warning(f"Primary LLM failed: {e}. Switching to FALLBACK LLM.")
                try:
                    return self.fallback.invoke(*args, **kwargs)
                except Exception as fb_e:
                    logger.error(f"Fallback LLM also failed: {fb_e}")
                    raise fb_e
            else:
                raise e

_llm: Optional[FallbackLLM] = None

def init_llm():
    """Initialize and retrieve the ChatGroq LLM instance with fallback logic."""
    global _llm
    if _llm is None:
        primary = ChatGroq(
            model=settings.LLM_MODEL_NAME,
            api_key=settings.GROQ_API_KEY,
            temperature=0.15,
            max_retries=0, # Fail fast to trigger fallback
            max_tokens=2500,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        
        fallback = None
        if settings.GROQ_API_KEY_FALLBACK:
            fallback = ChatGroq(
                model=settings.LLM_FALLBACK_MODEL,
                api_key=settings.GROQ_API_KEY_FALLBACK,
                temperature=0.15,
                max_retries=0,
                max_tokens=2500,
                model_kwargs={"response_format": {"type": "json_object"}},
            )
            logger.info(f"[llm] Primary: {settings.LLM_MODEL_NAME} | Fallback: {settings.LLM_FALLBACK_MODEL}")
            
        _llm = FallbackLLM(primary, fallback)
            
    return _llm
