"""
config.py — Application Configuration
======================================
Centralised configuration loading for InsightAI.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env variables
load_dotenv()

class Settings:
    # Weaviate Settings
    WEAVIATE_HOST = os.getenv("WEAVIATE_HOST", "localhost")
    WEAVIATE_PORT = int(os.getenv("WEAVIATE_PORT", 8080))
    WEAVIATE_INDEX_BASE = os.getenv("WEAVIATE_INDEX_BASE", "InsurancePolicies")
    
    # Models
    EMBED_MODEL_NAME = os.getenv("EMBED_MODEL_NAME", "BAAI/bge-base-en-v1.5")
    LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "llama-3.3-70b-versatile")
    
    # Storage Paths
    BASE_DIR = Path(__file__).parent.parent.parent
    PERSIST_DIR = str(BASE_DIR / "storage")
    TEMP_DIR = BASE_DIR / "temp"
    
    # Clerk Authentication
    CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY", "")
    CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
    
    # APIs
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GROQ_API_KEY_FALLBACK = os.getenv("GROQ_API_KEY_FALLBACK", "")

settings = Settings()
