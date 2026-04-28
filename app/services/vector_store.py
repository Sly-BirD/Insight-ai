"""
vector_store.py — Weaviate Database Manager
============================================
Direct Weaviate client for ingestion AND retrieval.
Single collection with user_id metadata filter (no per-user collections).
Supports Hybrid Search (Vector + BM25 via Reciprocal Rank Fusion).
"""

from typing import Optional, List, Dict, Any

import weaviate
from weaviate.classes.init import Auth
from weaviate.classes.config import Configure, Property, DataType
from weaviate.classes.query import MetadataQuery, Filter

from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from loguru import logger

from app.core.config import settings

_weaviate_client: Optional[weaviate.WeaviateClient] = None
_embed_model: Optional[HuggingFaceEmbedding] = None

COLLECTION_NAME = "InsuranceDocs"
TOP_K = 12
HYBRID_ALPHA = 0.65  # 0.65 = 65% semantic + 35% keyword


# ---------------------------------------------------------------------------
# Client + Embedding singletons
# ---------------------------------------------------------------------------

def get_weaviate_client() -> weaviate.WeaviateClient:
    """Singleton pattern for Weaviate Client."""
    global _weaviate_client
    if _weaviate_client is None or not _weaviate_client.is_ready():
        try:
            if settings.WEAVIATE_CLUSTER_URL and settings.WEAVIATE_API_KEY:
                logger.info(f"Connecting to Weaviate Cloud Sandbox at {settings.WEAVIATE_CLUSTER_URL}…")
                _weaviate_client = weaviate.connect_to_weaviate_cloud(
                    cluster_url=settings.WEAVIATE_CLUSTER_URL,
                    auth_credentials=Auth.api_key(settings.WEAVIATE_API_KEY),
                )
            else:
                logger.info(f"Connecting to Local Weaviate at http://{settings.WEAVIATE_HOST}:{settings.WEAVIATE_PORT}…")
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


def get_embed_model() -> HuggingFaceEmbedding:
    """Get or initialize the embedding model singleton."""
    global _embed_model
    if _embed_model is None:
        _embed_model = HuggingFaceEmbedding(
            model_name=settings.EMBED_MODEL_NAME, device="cpu"
        )
    return _embed_model


def init_global_retriever() -> None:
    """Initialize embedding model and ensure Weaviate collection exists."""
    logger.info("Initialising embedding model…")
    get_embed_model()
    client = get_weaviate_client()
    ensure_collection(client)


# ---------------------------------------------------------------------------
# Collection management
# ---------------------------------------------------------------------------

def ensure_collection(client: weaviate.WeaviateClient) -> None:
    """Create the shared collection if it doesn't exist."""
    if client.collections.exists(COLLECTION_NAME):
        logger.info(f"Collection '{COLLECTION_NAME}' already exists.")
        return

    client.collections.create(
        name=COLLECTION_NAME,
        vectorizer_config=Configure.Vectorizer.none(),
        properties=[
            Property(name="content", data_type=DataType.TEXT),
            Property(name="user_id", data_type=DataType.TEXT),
            Property(name="filename", data_type=DataType.TEXT),
            Property(name="file_hash", data_type=DataType.TEXT),
            Property(name="page_label", data_type=DataType.TEXT),
            Property(name="section_title", data_type=DataType.TEXT),
            Property(name="clause_ref", data_type=DataType.TEXT),
            Property(name="insurer", data_type=DataType.TEXT),
        ],
    )
    logger.success(f"Created collection '{COLLECTION_NAME}'.")


# ---------------------------------------------------------------------------
# Ingestion (direct writes)
# ---------------------------------------------------------------------------

def insert_chunks(
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    user_id: str,
) -> int:
    """
    Insert pre-embedded chunks directly into Weaviate.
    Each chunk dict must have: content, filename, file_hash, page_label,
    section_title, clause_ref, insurer.
    Returns the number of chunks inserted.
    """
    client = get_weaviate_client()
    collection = client.collections.get(COLLECTION_NAME)

    objects = []
    for chunk, embedding in zip(chunks, embeddings):
        objects.append(
            weaviate.classes.data.DataObject(
                properties={
                    "content":       chunk["content"],
                    "user_id":       user_id,
                    "filename":      chunk["filename"],
                    "file_hash":     chunk["file_hash"],
                    "page_label":    chunk.get("page_label", "?"),
                    "section_title": chunk.get("section_title", "General"),
                    "clause_ref":    chunk.get("clause_ref", ""),
                    "insurer":       chunk.get("insurer", "Unknown"),
                },
                vector=embedding,
            )
        )

    # Batch insert
    result = collection.data.insert_many(objects)
    if result.has_errors:
        for err in result.errors[:5]:
            logger.error(f"[ingest] Weaviate insert error: {err}")

    inserted = len(objects) - len(result.errors) if result.errors else len(objects)
    logger.info(f"[ingest] Inserted {inserted}/{len(objects)} chunks for user {user_id[:8]}…")
    return inserted


def is_file_cached(user_id: str, file_hash: str) -> bool:
    """Check if a file with this hash already exists for this user."""
    client = get_weaviate_client()
    try:
        if not client.collections.exists(COLLECTION_NAME):
            return False
        collection = client.collections.get(COLLECTION_NAME)
        response = collection.query.fetch_objects(
            filters=(
                Filter.by_property("user_id").equal(user_id)
                & Filter.by_property("file_hash").equal(file_hash)
            ),
            limit=1,
        )
        return len(response.objects) > 0
    except Exception as e:
        logger.warning(f"[cache] Check failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Retrieval (Hybrid Search scoped to user)
# ---------------------------------------------------------------------------

class HybridChunk:
    """Lightweight container matching the interface used by query_service."""
    def __init__(self, text: str, score: float, metadata: dict):
        self.text = text
        self.score = score
        self.metadata = metadata


def hybrid_retrieve(query: str, user_id: str) -> List[HybridChunk]:
    """
    Execute hybrid search (vector + BM25 via RRF) scoped to a user.
    Falls back to pure vector search if hybrid fails.
    """
    client = get_weaviate_client()
    if not client.collections.exists(COLLECTION_NAME):
        raise ValueError("No documents indexed yet. Upload PDFs first.")

    collection = client.collections.get(COLLECTION_NAME)
    embed_model = get_embed_model()
    query_vector = embed_model.get_query_embedding(query)
    user_filter = Filter.by_property("user_id").equal(user_id)

    try:
        response = collection.query.hybrid(
            query=query,
            vector=query_vector,
            alpha=HYBRID_ALPHA,
            limit=TOP_K,
            filters=user_filter,
            return_metadata=MetadataQuery(score=True),
        )
    except Exception as exc:
        logger.warning(f"[hybrid] Hybrid search failed, falling back to vector: {exc}")
        return _fallback_vector_retrieve(collection, query_vector, user_filter)

    return _parse_results(response, "hybrid")


def _fallback_vector_retrieve(collection, query_vector, user_filter) -> List[HybridChunk]:
    """Pure vector fallback if hybrid fails."""
    response = collection.query.near_vector(
        near_vector=query_vector,
        limit=TOP_K,
        filters=user_filter,
        return_metadata=MetadataQuery(distance=True),
    )

    results = []
    for obj in response.objects:
        props = obj.properties or {}
        dist = obj.metadata.distance if obj.metadata and obj.metadata.distance is not None else 1.0
        score = max(0, 1.0 - float(dist))
        results.append(HybridChunk(
            text=props.get("content", ""),
            score=round(score, 4),
            metadata=_extract_metadata(props),
        ))

    logger.info(f"[vector-fallback] Retrieved {len(results)} chunks")
    return results


def _parse_results(response, label: str) -> List[HybridChunk]:
    """Parse Weaviate response objects into HybridChunk list."""
    results = []
    for obj in response.objects:
        props = obj.properties or {}
        score = obj.metadata.score if obj.metadata and obj.metadata.score is not None else 0.0
        results.append(HybridChunk(
            text=props.get("content", ""),
            score=round(float(score), 4),
            metadata=_extract_metadata(props),
        ))

    logger.info(f"[{label}] Retrieved {len(results)} chunks (alpha={HYBRID_ALPHA}, top_k={TOP_K})")
    return results


def _extract_metadata(props: dict) -> dict:
    return {
        "filename":      props.get("filename", "unknown"),
        "page_label":    props.get("page_label", "?"),
        "section_title": props.get("section_title", "General"),
        "clause_ref":    props.get("clause_ref", ""),
        "insurer":       props.get("insurer", "Unknown"),
    }


# ---------------------------------------------------------------------------
# Node counting & document management
# ---------------------------------------------------------------------------

def get_node_count(user_id: str) -> int:
    """Count nodes belonging to a specific user."""
    try:
        client = get_weaviate_client()
        if not client.collections.exists(COLLECTION_NAME):
            return 0
        collection = client.collections.get(COLLECTION_NAME)
        result = collection.aggregate.over_all(
            total_count=True,
            filters=Filter.by_property("user_id").equal(user_id),
        )
        return result.total_count or 0
    except Exception as exc:
        logger.warning(f"[status] Could not count nodes: {exc}")
        return 0


def get_user_documents(user_id: str) -> List[str]:
    """Get unique filenames for a user from Weaviate."""
    try:
        client = get_weaviate_client()
        if not client.collections.exists(COLLECTION_NAME):
            return []
        collection = client.collections.get(COLLECTION_NAME)

        # Fetch all filenames for this user (deduplicate in Python)
        response = collection.query.fetch_objects(
            filters=Filter.by_property("user_id").equal(user_id),
            limit=1000,
            return_properties=["filename"],
        )
        filenames = set()
        for obj in response.objects:
            fname = obj.properties.get("filename", "")
            if fname:
                filenames.add(fname)
        return sorted(filenames)
    except Exception as exc:
        logger.warning(f"[docs] Could not list documents: {exc}")
        return []


def delete_user_document(user_id: str, doc_name: str) -> int:
    """Delete all chunks for a specific document belonging to a user."""
    client = get_weaviate_client()
    if not client.collections.exists(COLLECTION_NAME):
        return 0
    collection = client.collections.get(COLLECTION_NAME)
    result = collection.data.delete_many(
        where=(
            Filter.by_property("user_id").equal(user_id)
            & Filter.by_property("filename").equal(doc_name)
        )
    )
    deleted = result.successful if result else 0
    logger.info(f"[docs] Deleted {deleted} chunks of '{doc_name}' for user {user_id[:8]}…")
    return deleted


def delete_all_user_documents(user_id: str) -> int:
    """Delete all chunks belonging to a user."""
    client = get_weaviate_client()
    if not client.collections.exists(COLLECTION_NAME):
        return 0
    collection = client.collections.get(COLLECTION_NAME)
    result = collection.data.delete_many(
        where=Filter.by_property("user_id").equal(user_id)
    )
    deleted = result.successful if result else 0
    logger.info(f"[docs] Deleted all {deleted} chunks for user {user_id[:8]}…")
    return deleted


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def chunks_to_dicts(chunks: List[HybridChunk]) -> List[Dict[str, Any]]:
    """Convert HybridChunk objects to plain dicts."""
    return [
        {
            "text":       c.text,
            "score":      c.score,
            "filename":   c.metadata.get("filename", "unknown"),
            "page":       c.metadata.get("page_label", "?"),
            "section":    c.metadata.get("section_title", "General"),
            "clause_ref": c.metadata.get("clause_ref", ""),
            "insurer":    c.metadata.get("insurer", "Unknown"),
        }
        for c in chunks
    ]


def chunks_to_context(chunks: List[Dict[str, Any]]) -> str:
    """Format chunks into a rich context block for the LLM."""
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
    return ("\n\n" + "─" * 60 + "\n\n").join(parts)
