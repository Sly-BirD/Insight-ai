"""
ingest.py — InsightAI Ingestion Pipeline v2
============================================
Upgraded ingestion with fine-grained chunking, section/clause
metadata extraction, and hi_res PDF strategy for better table
and form handling.

Changes from v1:
  - strategy="hi_res" for Unstructured PDF loading
  - SentenceSplitter: chunk_size=512, overlap=128
  - Regex-based section_title and clause_ref metadata extraction
  - Deletes old Weaviate collection before re-indexing
  - Prints sample node metadata after ingestion for verification

Usage:
    python ingest.py [--data-dir data/]

Dependencies:
    pip install llama-index llama-index-vector-stores-weaviate \
                llama-index-embeddings-huggingface \
                llama-index-readers-file \
                "unstructured[pdf]" weaviate-client loguru \
                python-dotenv
"""

import os
import re
import sys
from pathlib import Path
from typing import Optional

import weaviate
from dotenv import load_dotenv
from loguru import logger

from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import Document, TextNode
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.readers.file import UnstructuredReader
from llama_index.vector_stores.weaviate import WeaviateVectorStore

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

EMBED_MODEL_NAME    = "BAAI/bge-base-en-v1.5"
CHUNK_SIZE          = 512      # tokens — smaller = more precise clause retrieval
CHUNK_OVERLAP       = 128      # ~25% overlap to preserve cross-sentence context
WEAVIATE_HOST       = "localhost"
WEAVIATE_PORT       = 8080
WEAVIATE_INDEX_NAME = "InsurancePolicies"
# PERSIST_DIR         = "./storage"
from pathlib import Path
PERSIST_DIR = str(Path(__file__).parent.parent / "storage")

# Unstructured strategy:
#   "hi_res"  — layout model + OCR; best for scanned/tabular PDFs (slower)
#   "auto"    — auto-detects; use if hi_res is too slow on your machine
UNSTRUCTURED_STRATEGY = "hi_res"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

os.makedirs("logs", exist_ok=True)
logger.remove()
logger.add(
    sys.stderr, level="INFO", colorize=True,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}"
)
logger.add(
    "logs/ingest.log", level="DEBUG", rotation="10 MB",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}"
)

# ---------------------------------------------------------------------------
# Section & Clause Regex Patterns
# ---------------------------------------------------------------------------

# Matches headings like:
#   "PART F", "PART A - SCHEDULE", "SECTION 3", "2. EXCLUSIONS",
#   "7.1 WAITING PERIOD", "GENERAL TERMS & CONDITIONS"
SECTION_HEADING_PATTERNS = [
    # Numbered section: "2. Exclusions" / "7.1 Waiting Period"
    re.compile(r"^(\d+\.(?:\d+\.?)?)\s+([A-Z][A-Za-z &\-/]{3,60})$", re.MULTILINE),
    # PART X or SECTION X (with optional subtitle)
    re.compile(r"^(PART\s+[A-Z]|SECTION\s+\d+)[:\-–\s]*([A-Z][A-Za-z &\-/]{0,60})$", re.MULTILINE),
    # ALL CAPS line (5+ chars) used as heading
    re.compile(r"^([A-Z][A-Z\s&\-/]{5,60})$", re.MULTILINE),
    # Title Case heading line (standalone, not a sentence)
    re.compile(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,6})$", re.MULTILINE),
]

# Matches clause references like:
#   "7.1.3", "Section 4", "Clause A", "Part F", "Schedule I"
CLAUSE_REF_PATTERNS = [
    re.compile(r"\b(\d+\.\d+(?:\.\d+)?)\b"),           # e.g. 7.1.3
    re.compile(r"\bSection\s+([A-Z0-9]+)\b"),           # e.g. Section 4
    re.compile(r"\bClause\s+([A-Z0-9]+)\b"),            # e.g. Clause A
    re.compile(r"\bPart\s+([A-Z])\b"),                  # e.g. Part F
    re.compile(r"\bSchedule\s+([A-Z0-9]+)\b"),          # e.g. Schedule I
]

# Known section keywords for fallback matching
SECTION_KEYWORDS = [
    "exclusions", "coverage", "waiting period", "sum insured",
    "premium", "benefits", "definitions", "claim procedure",
    "pre-existing", "network hospital", "co-payment", "sub-limit",
    "renewal", "portability", "schedule of benefits", "general terms",
    "conditions", "eligibility", "commencement", "termination",
    "maternity", "hospitalization", "day care", "domiciliary",
]

# ---------------------------------------------------------------------------
# Metadata Helpers
# ---------------------------------------------------------------------------

def extract_insurer(filename: str) -> str:
    """Infer insurer name from PDF filename."""
    stem = Path(filename).stem.upper()
    known = [
        ("HDFC", "HDFC Life"), ("SBI", "SBI General"),
        ("ICICI", "ICICI Lombard"), ("STAR", "Star Health"),
        ("NIVA", "Niva Bupa"), ("BAJAJ", "Bajaj Allianz"),
        ("RELIANCE", "Reliance General"), ("TATA", "Tata AIG"),
        ("IRDAI", "IRDAI"), ("MAX", "Max Bupa"),
        ("UNITED", "United India"), ("UIICL", "United India"),
        ("ORIENTAL", "Oriental Insurance"),
        ("NATIONAL", "National Insurance"),
    ]
    for key, label in known:
        if key in stem:
            return label
    return "Unknown"


def extract_section_title(text: str) -> str:
    """
    Scan the first 400 characters of a chunk for heading-like patterns.
    Returns the best matched section title or keyword, else 'General'.
    """
    head = text[:400]

    # Try regex heading patterns in priority order
    for pattern in SECTION_HEADING_PATTERNS:
        match = pattern.search(head)
        if match:
            # Use the last capture group as the title text
            title = match.group(len(match.groups())).strip()
            if len(title) >= 4:  # skip single-char matches
                return title.title()  # normalise to Title Case

    # Fallback: keyword scan across full chunk text
    lower = text.lower()
    for kw in SECTION_KEYWORDS:
        if kw in lower:
            return kw.title()

    return "General"


def extract_clause_ref(text: str) -> str:
    """
    Find the first clause/section reference in the text.
    Returns a string like "7.1.3" or "Section 4", else empty string.
    """
    for pattern in CLAUSE_REF_PATTERNS:
        match = pattern.search(text[:600])  # scan first 600 chars
        if match:
            return match.group(0).strip()
    return ""


# ---------------------------------------------------------------------------
# PDF Loading
# ---------------------------------------------------------------------------

def load_documents(data_dir: str) -> list[Document]:
    """
    Load all PDFs from data_dir using UnstructuredReader with hi_res strategy.
    Attaches base metadata (filename, insurer) to each Document.
    Skips files that fail to parse.
    """
    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    pdf_files = sorted(data_path.glob("*.pdf"))
    if not pdf_files:
        logger.warning(f"No PDF files found in '{data_dir}'.")
        return []

    logger.info(f"Found {len(pdf_files)} PDF file(s) in '{data_dir}'.")
    logger.info(f"Using Unstructured strategy: '{UNSTRUCTURED_STRATEGY}' (this may be slow for hi_res)")

    reader = UnstructuredReader()
    all_documents: list[Document] = []

    for pdf_path in pdf_files:
        filename = pdf_path.name
        logger.info(f"Loading: {filename}")

        try:
            docs = reader.load_data(
                file=pdf_path,
                extra_info={
                    "filename": filename,
                    "strategy": UNSTRUCTURED_STRATEGY,
                    "languages": ["eng"],
                    # split_pdf_page=True processes each page individually —
                    # improves element detection for multi-page PDFs
                    "split_pdf_page": True,
                },
            )

            if not docs:
                logger.warning(f"  No content extracted from '{filename}' — skipping.")
                continue

            insurer = extract_insurer(filename)

            for doc in docs:
                doc.metadata.setdefault("filename", filename)
                doc.metadata.setdefault("insurer", insurer)
                doc.metadata.setdefault(
                    "page_label",
                    str(doc.metadata.get("page_number", "unknown"))
                )
                # Clean up raw Unstructured keys not needed in the index
                for key in ["filetype", "languages", "orig_elements"]:
                    doc.metadata.pop(key, None)

            all_documents.extend(docs)
            logger.success(f"  ✓ Loaded {len(docs)} element(s) from '{filename}'.")

        except Exception as exc:
            logger.error(f"  ✗ Failed to load '{filename}': {exc}")
            continue

    logger.info(f"Total raw documents loaded: {len(all_documents)}")
    return all_documents


# ---------------------------------------------------------------------------
# Node Parsing & Metadata Enrichment
# ---------------------------------------------------------------------------

def build_nodes(documents: list[Document]) -> list[TextNode]:
    """
    Split Documents into fine-grained TextNodes using SentenceSplitter,
    then enrich each node with section_title and clause_ref metadata.

    Chunking strategy:
      chunk_size=512     : captures individual clauses/sub-clauses
      chunk_overlap=128  : ~25% overlap preserves cross-sentence context
      paragraph_separator: keeps paragraphs together when possible
      secondary_chunking_regex: further splits on sentence boundaries
    """
    splitter = SentenceSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        paragraph_separator="\n\n",
        secondary_chunking_regex=r"(?<=[\.\!\?])\s+",
    )

    logger.info(
        f"Splitting into nodes "
        f"(chunk_size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})…"
    )
    nodes = splitter.get_nodes_from_documents(documents, show_progress=True)

    # Enrich each node with section + clause metadata
    section_assigned = 0
    clause_assigned  = 0

    for node in nodes:
        text = node.get_content()

        section = extract_section_title(text)
        node.metadata["section_title"] = section
        node.metadata["section"] = section  # backwards compat with query_graph.py
        if section != "General":
            section_assigned += 1

        clause_ref = extract_clause_ref(text)
        node.metadata["clause_ref"] = clause_ref
        if clause_ref:
            clause_assigned += 1

    logger.info(
        f"Created {len(nodes)} node(s) | "
        f"{section_assigned} with section_title | "
        f"{clause_assigned} with clause_ref"
    )
    return nodes  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Weaviate Helpers
# ---------------------------------------------------------------------------

def connect_weaviate() -> weaviate.WeaviateClient:
    """Connect to local Weaviate (no auth)."""
    logger.info(f"Connecting to Weaviate at http://{WEAVIATE_HOST}:{WEAVIATE_PORT}…")
    try:
        client = weaviate.connect_to_local(host=WEAVIATE_HOST, port=WEAVIATE_PORT)
        logger.success("Connected to Weaviate.")
        return client
    except Exception as exc:
        logger.error(f"Could not connect to Weaviate: {exc}")
        logger.error(
            "Start Weaviate with:\n"
            "  docker run -d --name weaviate -p 8080:8080 -p 50051:50051 "
            "cr.weaviate.io/semitechnologies/weaviate:latest"
        )
        raise


def delete_existing_index(client: weaviate.WeaviateClient) -> None:
    """
    Delete existing Weaviate collection to start fresh.
    Safely skips if the collection doesn't exist.
    """
    try:
        if client.collections.exists(WEAVIATE_INDEX_NAME):
            client.collections.delete(WEAVIATE_INDEX_NAME)
            logger.success(f"Deleted existing collection '{WEAVIATE_INDEX_NAME}'.")
        else:
            logger.info(
                f"Collection '{WEAVIATE_INDEX_NAME}' not found — skipping delete."
            )
    except Exception as exc:
        logger.warning(f"Could not delete collection: {exc} — continuing anyway.")


# ---------------------------------------------------------------------------
# Sample Node Printer
# ---------------------------------------------------------------------------

def print_sample_nodes(nodes: list[TextNode], n: int = 3) -> None:
    """Print metadata + text preview of the first n nodes for verification."""
    print("\n" + "=" * 60)
    print(f"  SAMPLE NODE METADATA (first {n} nodes)")
    print("=" * 60)
    for i, node in enumerate(nodes[:n], 1):
        m = node.metadata
        preview = node.get_content()[:220].replace("\n", " ").strip()
        print(f"\n[Node {i}]")
        print(f"  filename     : {m.get('filename', '?')}")
        print(f"  insurer      : {m.get('insurer', '?')}")
        print(f"  page_label   : {m.get('page_label', '?')}")
        print(f"  section_title: {m.get('section_title', '?')}")
        print(f"  clause_ref   : {m.get('clause_ref') or '(none)'}")
        print(f"  text preview : {preview}…")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# Main Ingestion Function
# ---------------------------------------------------------------------------

def ingest_docs(data_dir: str = "data/") -> dict:
    """
    Full v2 ingestion pipeline:
      1. Configure embedding model
      2. Load PDFs with hi_res strategy
      3. Split into fine-grained nodes (512 tokens)
      4. Enrich nodes with section_title + clause_ref metadata
      5. Delete old Weaviate collection
      6. Embed and index all nodes
      7. Persist index metadata locally

    Returns:
        Summary dict with document and node counts.
    """
    logger.info("=" * 60)
    logger.info("InsightAI — Ingestion Pipeline v2 Starting")
    logger.info("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: Configure LlamaIndex global settings
    # ------------------------------------------------------------------
    logger.info(f"Loading embedding model: {EMBED_MODEL_NAME}")
    Settings.embed_model = HuggingFaceEmbedding(
        model_name=EMBED_MODEL_NAME,
        device="cpu",
    )
    Settings.llm          = None
    Settings.chunk_size   = CHUNK_SIZE
    Settings.chunk_overlap = CHUNK_OVERLAP

    # ------------------------------------------------------------------
    # Step 2: Load documents
    # ------------------------------------------------------------------
    documents = load_documents(data_dir)
    if not documents:
        logger.error("No documents loaded. Aborting.")
        return {"documents": 0, "nodes": 0}

    # ------------------------------------------------------------------
    # Steps 3 & 4: Build and enrich nodes
    # ------------------------------------------------------------------
    nodes = build_nodes(documents)
    if not nodes:
        logger.error("No nodes created. Aborting.")
        return {"documents": len(documents), "nodes": 0}

    # Print sample metadata for quick verification
    print_sample_nodes(nodes, n=3)

    # ------------------------------------------------------------------
    # Step 5: Connect to Weaviate and wipe old index
    # ------------------------------------------------------------------
    weaviate_client = connect_weaviate()

    try:
        delete_existing_index(weaviate_client)

        # ------------------------------------------------------------------
        # Step 6: Create vector store and index nodes
        # ------------------------------------------------------------------
        vector_store = WeaviateVectorStore(
            weaviate_client=weaviate_client,
            index_name=WEAVIATE_INDEX_NAME,
            text_key="content",
        )

        os.makedirs(PERSIST_DIR, exist_ok=True)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        logger.info(f"Embedding and indexing {len(nodes)} nodes into Weaviate…")
        logger.info("This may take several minutes on CPU.")

        index = VectorStoreIndex(
            nodes=nodes,
            storage_context=storage_context,
            show_progress=True,
        )

        # ------------------------------------------------------------------
        # Step 7: Persist index metadata locally
        # ------------------------------------------------------------------
        logger.info(f"Persisting index metadata to '{PERSIST_DIR}/'…")
        index.storage_context.persist(persist_dir=PERSIST_DIR)
        logger.success(f"Index metadata saved to '{PERSIST_DIR}/'.")

    finally:
        weaviate_client.close()
        logger.info("Weaviate connection closed.")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    summary = {"documents": len(documents), "nodes": len(nodes)}

    logger.info("=" * 60)
    logger.success("Ingestion v2 complete!")
    logger.info(f"  Documents loaded : {summary['documents']}")
    logger.info(f"  Nodes indexed    : {summary['nodes']}")
    logger.info(f"  Chunk size       : {CHUNK_SIZE} tokens")
    logger.info(f"  Chunk overlap    : {CHUNK_OVERLAP} tokens")
    logger.info(f"  Weaviate class   : {WEAVIATE_INDEX_NAME}")
    logger.info(f"  Persisted to     : {PERSIST_DIR}/")
    logger.info("=" * 60)

    return summary


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="InsightAI v2 — Fine-grained insurance PDF ingestion."
    )
    parser.add_argument(
        "--data-dir", type=str, default="data/",
        help="Folder containing PDF files (default: data/)"
    )
    args = parser.parse_args()

    result = ingest_docs(data_dir=args.data_dir)

    print("\n" + "=" * 40)
    print("  INGESTION SUMMARY")
    print("=" * 40)
    print(f"  PDFs processed   : {result['documents']}")
    print(f"  Nodes created    : {result['nodes']}")
    print(f"  Avg nodes / doc  : {result['nodes'] / max(result['documents'], 1):.1f}")
    print(f"  Chunk size       : {CHUNK_SIZE} tokens")
    print("=" * 40)

    if result["nodes"] == 0:
        print("\n⚠  No nodes created. Check logs/ingest.log for details.")
        sys.exit(1)
    else:
        print(f"\n✓ Index ready. Query with Weaviate class '{WEAVIATE_INDEX_NAME}'.")
        sys.exit(0)