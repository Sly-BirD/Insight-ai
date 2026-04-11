"""
vector_store.py — Weaviate Database Manager
============================================
Handles connection scaling, node fetching, and index operations.
Supports Hybrid Search (Vector + BM25 Keyword via Reciprocal Rank Fusion).
"""

import hashlib
from typing import Optional, List, Dict, Any
import weaviate
from weaviate.classes.query import MetadataQuery

from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.weaviate import WeaviateVectorStore
from loguru import logger

from app.core.config import settings

_weaviate_client: Optional[weaviate.WeaviateClient] = None
_embed_model: Optional[HuggingFaceEmbedding] = None
TOP_K = 15
HYBRID_ALPHA = 0.65  # 0.65 = 65% semantic + 35% keyword

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

def _get_embed_model() -> HuggingFaceEmbedding:
    """Get or initialize the embedding model singleton."""
    global _embed_model
    if _embed_model is None:
        _embed_model = HuggingFaceEmbedding(
            model_name=settings.EMBED_MODEL_NAME, device="cpu"
        )
    return _embed_model

def init_global_retriever() -> None:
    """Initialize the embedding model globally."""
    logger.info("Initialising embedding model…")
    Settings.embed_model = _get_embed_model()
    Settings.llm = None
    # Ensure client connects
    get_weaviate_client()

def collection_name_for_user(user_id: str) -> str:
    """Derive a stable per-user Weaviate collection name."""
    h = hashlib.sha256(user_id.encode()).hexdigest()[:16]
    return f"{settings.WEAVIATE_INDEX_BASE}_{h}"

# ---------------------------------------------------------------------------
# Hybrid Retriever (Vector + BM25 via Weaviate native)
# ---------------------------------------------------------------------------

class HybridChunk:
    """Mimics the LlamaIndex NodeWithScore interface for compatibility."""
    def __init__(self, text: str, score: float, metadata: dict):
        self._text = text
        self.score = score
        self.metadata = metadata

    class _Node:
        def __init__(self, text, metadata):
            self._text = text
            self.metadata = metadata
        def get_content(self):
            return self._text

    @property
    def node(self):
        return self._Node(self._text, self.metadata)

class HybridRetriever:
    """Weaviate Hybrid Search retriever (vector + BM25 keyword fusion)."""
    def __init__(self, user_id: str):
        self.col_name = collection_name_for_user(user_id)
        self.client = get_weaviate_client()
        self.embed_model = _get_embed_model()

        try:
            if not self.client.collections.exists(self.col_name):
                raise ValueError("No documents indexed yet. Upload PDFs first.")
        except Exception as exc:
            if isinstance(exc, ValueError):
                raise
            raise ValueError(f"User has no indexed documents: {exc}")

    def retrieve(self, query: str) -> List[HybridChunk]:
        """Execute hybrid search: vector + BM25 keyword, fused via RRF."""
        collection = self.client.collections.get(self.col_name)

        # Generate the query embedding
        query_vector = self.embed_model.get_query_embedding(query)

        try:
            response = collection.query.hybrid(
                query=query,
                vector=query_vector,
                alpha=HYBRID_ALPHA,
                limit=TOP_K,
                return_metadata=MetadataQuery(score=True),
            )
        except Exception as exc:
            logger.warning(f"[hybrid] Hybrid search failed, falling back to pure vector: {exc}")
            return self._fallback_vector_retrieve(query)

        results = []
        for obj in response.objects:
            props = obj.properties or {}
            text = props.get("content", props.get("text", ""))
            metadata = {
                "filename": props.get("filename", props.get("file_name", "unknown")),
                "page_label": props.get("page_label", props.get("page", "?")),
                "section_title": props.get("section_title", props.get("section", "General")),
                "clause_ref": props.get("clause_ref", ""),
                "insurer": props.get("insurer", "Unknown"),
            }
            score = obj.metadata.score if obj.metadata and obj.metadata.score is not None else 0.0
            results.append(HybridChunk(text=text, score=round(float(score), 4), metadata=metadata))

        logger.info(f"[hybrid] Retrieved {len(results)} chunks (alpha={HYBRID_ALPHA}, top_k={TOP_K})")
        return results

    def _fallback_vector_retrieve(self, query: str) -> List[HybridChunk]:
        """Pure vector fallback if hybrid fails."""
        collection = self.client.collections.get(self.col_name)
        query_vector = self.embed_model.get_query_embedding(query)

        response = collection.query.near_vector(
            near_vector=query_vector,
            limit=TOP_K,
            return_metadata=MetadataQuery(distance=True),
        )

        results = []
        for obj in response.objects:
            props = obj.properties or {}
            text = props.get("content", props.get("text", ""))
            metadata = {
                "filename": props.get("filename", props.get("file_name", "unknown")),
                "page_label": props.get("page_label", props.get("page", "?")),
                "section_title": props.get("section_title", props.get("section", "General")),
                "clause_ref": props.get("clause_ref", ""),
                "insurer": props.get("insurer", "Unknown"),
            }
            dist = obj.metadata.distance if obj.metadata and obj.metadata.distance is not None else 1.0
            score = max(0, 1.0 - float(dist))
            results.append(HybridChunk(text=text, score=round(score, 4), metadata=metadata))

        logger.info(f"[vector-fallback] Retrieved {len(results)} chunks")
        return results

def get_user_retriever(user_id: str) -> HybridRetriever:
    """Build a hybrid retriever scoped to a specific user's Weaviate collection."""
    return HybridRetriever(user_id)

# ---------------------------------------------------------------------------
# LlamaIndex retriever (still used for ingestion)
# ---------------------------------------------------------------------------

def get_user_index(user_id: str) -> VectorStoreIndex:
    """Get a LlamaIndex VectorStoreIndex for ingestion purposes."""
    col_name = collection_name_for_user(user_id)
    client = get_weaviate_client()
    vector_store = WeaviateVectorStore(
        weaviate_client=client,
        index_name=col_name,
        text_key="content",
    )
    return VectorStoreIndex.from_vector_store(vector_store)

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
