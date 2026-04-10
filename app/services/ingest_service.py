"""
ingest_service.py — Document Ingestion Service
===============================================
Encapsulates PDF parsing, segmenting, and vector indexing into Weaviate.
"""

import hashlib
import json
import os
from pathlib import Path
from loguru import logger
from typing import List, Dict

from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import Document, TextNode
from llama_index.readers.file import UnstructuredReader
from llama_index.vector_stores.weaviate import WeaviateVectorStore

from app.core.config import settings
from app.utils.text_helpers import extract_insurer, extract_section_title, extract_clause_ref
from app.services.vector_store import get_weaviate_client, collection_name_for_user

CHUNK_SIZE = 512
CHUNK_OVERLAP = 128
UNSTRUCTURED_STRATEGY = "fast"

def get_cache_path(user_id: str) -> Path:
    cache_dir = Path(settings.PERSIST_DIR) / "dedup"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{user_id}_dedup.json"

def is_cached(user_id: str, file_hash: str) -> bool:
    path = get_cache_path(user_id)
    if not path.exists():
        return False
    data = json.loads(path.read_text(encoding="utf-8"))
    return file_hash in data

def add_to_cache(user_id: str, file_hash: str, filename: str):
    path = get_cache_path(user_id)
    data = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except:
            data = {}
    data[file_hash] = filename
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_documents(data_dir: str, user_id: str = "shared") -> dict:
    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    pdf_files = sorted(data_path.glob("*.pdf"))
    if not pdf_files:
        return {"documents": [], "files_count": 0}

    reader = UnstructuredReader()
    all_documents = []
    processed_count = 0
    errors = []

    for pdf_path in pdf_files:
        filename = pdf_path.name
        file_hash = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        
        if is_cached(user_id, file_hash):
            logger.info(f"Skipping heavily parsed file (already cached): {filename}")
            processed_count += 1
            continue

        try:
            docs = reader.load_data(
                file=pdf_path,
                unstructured_kwargs={
                    "strategy": UNSTRUCTURED_STRATEGY,
                    "languages": ["eng"],
                    "split_pdf_page": True,
                },
                extra_info={"filename": filename},
            )
            if not docs:
                continue

            insurer = extract_insurer(filename)
            for doc in docs:
                doc.metadata["file_hash"] = file_hash
                doc.metadata.setdefault("filename", filename)
                doc.metadata.setdefault("insurer", insurer)
                doc.metadata.setdefault("page_label", str(doc.metadata.get("page_number", "unknown")))
                for key in ["filetype", "languages", "orig_elements"]:
                    doc.metadata.pop(key, None)

            all_documents.extend(docs)
            add_to_cache(user_id, file_hash, filename)
            processed_count += 1
        except Exception as exc:
            logger.error(f"Failed to load '{filename}': {exc}")
            errors.append(f"{filename} error: {exc}")
            continue

    return {"documents": all_documents, "files_count": processed_count, "errors": errors}


def build_nodes(documents: List[Document]) -> List[TextNode]:
    splitter = SentenceSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        paragraph_separator="\n\n",
        secondary_chunking_regex=r"(?<=[\.\!\?])\s+",
    )
    nodes = splitter.get_nodes_from_documents(documents)
    
    for node in nodes:
        text = node.get_content()
        section = extract_section_title(text)
        node.metadata["section_title"] = section
        node.metadata["section"] = section
        node.metadata["clause_ref"] = extract_clause_ref(text)

    return nodes


def ingest_docs(data_dir: str, user_id: str = "shared") -> Dict[str, int]:
    """Ingest documents bounded to the specified user."""
    result = load_documents(data_dir, user_id)
    documents = result["documents"]
    files_count = result["files_count"]
    errors = result.get("errors", [])

    if errors and files_count == 0:
        raise RuntimeError(f"Ingestion failed for all files: {errors}")

    if not documents:
        return {"documents": files_count, "nodes": 0}

    nodes = build_nodes(documents)
    if not nodes:
        return {"documents": files_count, "nodes": 0}

    client = get_weaviate_client()
    col_name = collection_name_for_user(user_id) if user_id != "shared" else settings.WEAVIATE_INDEX_BASE

    vector_store = WeaviateVectorStore(
        weaviate_client=client,
        index_name=col_name,
        text_key="content",
    )
    

    index = VectorStoreIndex.from_vector_store(vector_store)
    for node in nodes:
        index.insert_nodes([node])

    return {"documents": files_count, "nodes": len(nodes)}
