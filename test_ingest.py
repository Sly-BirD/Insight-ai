import asyncio
from pathlib import Path
from app.services.ingest_service import load_documents
from loguru import logger

# Try loading documents from temp dir
docs = load_documents("storage")
print(docs)
