"""
ingest_service.py — Document Ingestion Service
===============================================
PDF parsing, chunking, embedding, and direct Weaviate insertion.
No LlamaIndex VectorStoreIndex — writes directly to Weaviate.
"""

import hashlib
import re
import concurrent.futures
from pathlib import Path
from typing import List, Dict, Any

from loguru import logger
from llama_index.core.node_parser import MarkdownNodeParser
from llama_index.core.schema import Document
import pymupdf4llm
import pymupdf  # fitz — for page count

from app.services.vector_store import (
    get_embed_model, insert_chunks, is_file_cached,
)
from app.utils.text_helpers import extract_insurer, extract_section_title, extract_clause_ref


# ---------------------------------------------------------------------------
# Page-break marker that pymupdf4llm inserts between pages
# ---------------------------------------------------------------------------
PAGE_BREAK_MARKER = "-----"  # pymupdf4llm uses horizontal rules between pages


# ---------------------------------------------------------------------------
# PDF → Markdown → Documents (with per-page metadata)
# ---------------------------------------------------------------------------

def _estimate_page_for_position(md_text: str, char_pos: int) -> str:
    """
    Estimate which page a chunk falls on by counting page-break markers
    (horizontal rules) that pymupdf4llm inserts between pages.
    """
    prefix = md_text[:char_pos]
    # pymupdf4llm separates pages with "---" / "-----" lines
    page_breaks = len(re.findall(r"^-{3,}\s*$", prefix, re.MULTILINE))
    return str(page_breaks + 1)


def _get_page_count(pdf_path: Path) -> int:
    """Get the total page count from the PDF."""
    try:
        doc = pymupdf.open(str(pdf_path))
        count = len(doc)
        doc.close()
        return count
    except Exception:
        return 0


def load_documents(data_dir: str, user_id: str = "shared") -> dict:
    """Parse PDFs into LlamaIndex Documents, skipping already-cached files."""
    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    pdf_files = sorted(data_path.glob("*.pdf"))
    if not pdf_files:
        return {"documents": [], "files_count": 0, "errors": [], "md_texts": {}}

    all_documents: List[Document] = []
    md_texts: Dict[str, str] = {}  # filename -> full markdown text (for page estimation)
    processed_count = 0
    errors: List[str] = []

    def _parse(path: Path) -> dict:
        filename = path.name
        fhash = hashlib.sha256(path.read_bytes()).hexdigest()

        if is_file_cached(user_id, fhash):
            logger.info(f"Skipping '{filename}' (already in Weaviate)")
            return {"status": "cached", "hash": fhash, "name": filename}

        try:
            md_text = pymupdf4llm.to_markdown(str(path), page_chunks=False)
            if not md_text or len(md_text.strip()) < 50:
                return {"status": "empty", "name": filename}

            page_count = _get_page_count(path)
            insurer = extract_insurer(filename)
            doc = Document(text=md_text, metadata={
                "file_hash": fhash,
                "filename": filename,
                "insurer": insurer,
                "total_pages": page_count,
            })
            return {"status": "parsed", "hash": fhash, "name": filename, "docs": [doc], "md_text": md_text}
        except Exception as exc:
            return {"status": "error", "name": filename, "error": str(exc)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(_parse, p) for p in pdf_files]
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res["status"] == "cached":
                processed_count += 1
            elif res["status"] == "parsed":
                all_documents.extend(res["docs"])
                md_texts[res["name"]] = res["md_text"]
                processed_count += 1
            elif res["status"] == "empty":
                errors.append(f"'{res['name']}' appears to be empty or scanned — skipped")
            elif res["status"] == "error":
                logger.error(f"Failed to load '{res['name']}': {res['error']}")
                errors.append(f"{res['name']} error: {res['error']}")

    return {"documents": all_documents, "files_count": processed_count, "errors": errors, "md_texts": md_texts}


# ---------------------------------------------------------------------------
# Documents → Chunks with page-level metadata
# ---------------------------------------------------------------------------

def build_chunks(documents: List[Document], md_texts: Dict[str, str] = None) -> List[Dict[str, Any]]:
    """
    Parse documents into chunks using MarkdownNodeParser,
    then enrich each chunk with section/clause/page metadata.
    Returns a list of dicts ready for Weaviate insertion.
    """
    md_texts = md_texts or {}
    parser = MarkdownNodeParser()
    nodes = parser.get_nodes_from_documents(documents)

    chunks = []
    for node in nodes:
        text = node.get_content()
        if not text or len(text.strip()) < 20:
            continue  # skip trivially small chunks

        # Inherit metadata from the parent document
        filename = node.metadata.get("filename", "unknown")
        file_hash = node.metadata.get("file_hash", "")
        insurer = node.metadata.get("insurer", "Unknown")

        # Estimate page number from the chunk's position in the original markdown
        page_label = "?"
        if filename in md_texts:
            full_md = md_texts[filename]
            # Find where this chunk's text appears in the full markdown
            chunk_pos = full_md.find(text[:100])  # match first 100 chars
            if chunk_pos >= 0:
                page_label = _estimate_page_for_position(full_md, chunk_pos)

        chunks.append({
            "content":       text,
            "filename":      filename,
            "file_hash":     file_hash,
            "page_label":    page_label,
            "section_title": extract_section_title(text),
            "clause_ref":    extract_clause_ref(text),
            "insurer":       insurer,
        })

    return chunks


# ---------------------------------------------------------------------------
# Main ingestion entry point
# ---------------------------------------------------------------------------

def ingest_docs(data_dir: str, user_id: str = "shared") -> Dict[str, int]:
    """
    Full ingestion pipeline:
      1. Parse PDFs → Markdown (with page tracking)
      2. Chunk with MarkdownNodeParser
      3. Embed with HuggingFace
      4. Write directly to Weaviate (single collection, user_id filter)
    """
    result = load_documents(data_dir, user_id)
    documents = result["documents"]
    files_count = result["files_count"]
    errors = result.get("errors", [])
    md_texts = result.get("md_texts", {})

    if errors and files_count == 0:
        raise RuntimeError(f"Ingestion failed for all files: {errors}")

    if not documents:
        return {"documents": files_count, "nodes": 0}

    # Step 1: Chunk (with page metadata)
    chunks = build_chunks(documents, md_texts)
    if not chunks:
        return {"documents": files_count, "nodes": 0}

    # Step 2: Embed all chunks in batch
    embed_model = get_embed_model()
    texts = [c["content"] for c in chunks]
    logger.info(f"[ingest] Embedding {len(texts)} chunks…")
    embeddings = embed_model.get_text_embedding_batch(texts)

    # Step 3: Write to Weaviate
    inserted = insert_chunks(chunks, embeddings, user_id)

    return {"documents": files_count, "nodes": inserted}
