"""
vector_store.py — Weaviate Database Manager
============================================
Handles connection scaling, node fetching, and index operations.
"""

import hashlib
from typing import Optional, List, Dict, Any
import weaviate

from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.weaviate import WeaviateVectorStore
from loguru import logger

from app.core.config import settings

_weaviate_client: Optional[weaviate.WeaviateClient] = None
TOP_K = 15

def get_weaviate_client() -> weaviate.WeaviateClient:
    """Singleton pattern for Weaviate Client."""
    global _weaviate_client
    if _weaviate_client is None:
        logger.info(f"Connecting to Weaviate at http://{settings.WEAVIATE_HOST}:{settings.WEAVIATE_PORT}…")
        try:
            _weaviate_client = weaviate.connect_to_local(
                host=settings.WEAVIATE_HOST, port=settings.WEAVIATE_PORT
            )
            logger.success("Connected to Weaviate.")
        except Exception as exc:
            logger.error(f"Could not connect to Weaviate: {exc}")
            raise RuntimeError("Database connection failed") from exc
    return _weaviate_client

def close_weaviate_client() -> None:
    """Close the global Weaviate client connection."""
    global _weaviate_client
    if _weaviate_client:
        _weaviate_client.close()
        _weaviate_client = None

def init_global_retriever() -> None:
    """Initialize the embedding model globally."""
    logger.info("Initialising embedding model…")
    Settings.embed_model = HuggingFaceEmbedding(
        model_name=settings.EMBED_MODEL_NAME, device="cpu"
    )
    Settings.llm = None
    # Ensure client connects
    get_weaviate_client()

def collection_name_for_user(user_id: str) -> str:
    """Derive a stable per-user Weaviate collection name."""
    h = hashlib.sha256(user_id.encode()).hexdigest()[:16]
    return f"{settings.WEAVIATE_INDEX_BASE}_{h}"

def get_user_retriever(user_id: str) -> VectorIndexRetriever:
    """Build a retriever scoped to a specific user's Weaviate collection (Silo Pattern)."""
    col_name = collection_name_for_user(user_id)
    client = get_weaviate_client()
    logger.info(f"[query] Using collection: {col_name} for user {user_id[:8]}…")
    
    try:
        if not client.collections.exists(col_name):
            raise ValueError(f"No documents indexed yet. Upload PDFs first.")
    except Exception as exc:
        if isinstance(exc, ValueError):
            raise
        raise ValueError(f"User has no indexed documents: {exc}")
        
    vector_store = WeaviateVectorStore(
        weaviate_client=client,
        index_name=col_name,
        text_key="content",
    )
    index = VectorStoreIndex.from_vector_store(vector_store)
    return VectorIndexRetriever(index=index, similarity_top_k=TOP_K)

def get_node_count(col: str) -> int:
    """Count nodes in a Weaviate collection."""
    try:
        client = get_weaviate_client()
        if not client.collections.exists(col):
            return 0
        collection = client.collections.get(col)
        result = collection.aggregate.over_all(total_count=True)
        return result.total_count or 0
    except Exception as exc:
        logger.warning(f"[status] Could not count nodes in {col}: {exc}")
        return 0

def nodes_to_chunks(nodes) -> List[Dict[str, Any]]:
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

def chunks_to_context(chunks: List[Dict[str, Any]]) -> str:
    """Format chunks into a rich context block."""
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
