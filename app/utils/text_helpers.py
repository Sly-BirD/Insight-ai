"""
text_helpers.py — Parser, Regex and Text Utils
===============================================
Methods used to format text, perform regex, or parse LLM JSON output.
"""

import re
import json
from pathlib import Path
from typing import Dict, Any, List

try:
    from json_repair import repair_json
    _HAS_JSON_REPAIR = True
except ImportError:
    _HAS_JSON_REPAIR = False

from loguru import logger

# Matches headings like:
#   "PART F", "PART A - SCHEDULE", "SECTION 3", "2. EXCLUSIONS",
SECTION_HEADING_PATTERNS = [
    re.compile(r"^(\d+\.(?:\d+\.?)?)\s+([A-Z][A-Za-z &\-/]{3,60})$", re.MULTILINE),
    re.compile(r"^(PART\s+[A-Z]|SECTION\s+\d+)[:\-–\s]*([A-Z][A-Za-z &\-/]{0,60})$", re.MULTILINE),
    re.compile(r"^([A-Z][A-Z\s&\-/]{5,60})$", re.MULTILINE),
    re.compile(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,6})$", re.MULTILINE),
]

# Matches clause references like:
#   "7.1.3", "Section 4", "Clause A"
CLAUSE_REF_PATTERNS = [
    re.compile(r"\b(\d+\.\d+(?:\.\d+)?)\b"),
    re.compile(r"\bSection\s+([A-Z0-9]+)\b"),
    re.compile(r"\bClause\s+([A-Z0-9]+)\b"),
    re.compile(r"\bPart\s+([A-Z])\b"),
    re.compile(r"\bSchedule\s+([A-Z0-9]+)\b"),
]

SECTION_KEYWORDS = [
    "exclusions", "coverage", "waiting period", "sum insured",
    "premium", "benefits", "definitions", "claim procedure",
    "pre-existing", "network hospital", "co-payment", "sub-limit",
    "renewal", "portability", "schedule of benefits", "general terms",
    "conditions", "eligibility", "commencement", "termination",
    "maternity", "hospitalization", "day care", "domiciliary",
]

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
    return "Unknown Insurer"

def extract_section_title(text: str) -> str:
    """Scan the first 400 characters of a chunk for heading-like patterns."""
    head = text[:400]
    for pattern in SECTION_HEADING_PATTERNS:
        match = pattern.search(head)
        if match:
            title = match.group(len(match.groups())).strip()
            if len(title) >= 4:
                return title.title()
    lower = text.lower()
    for kw in SECTION_KEYWORDS:
        if kw in lower:
            return kw.title()
    return "General"

def extract_clause_ref(text: str) -> str:
    """Find the first clause/section reference in the text."""
    for pattern in CLAUSE_REF_PATTERNS:
        match = pattern.search(text[:600])
        if match:
            return match.group(0).strip()
    return ""

def parse_llm_json(raw: str, expect_compare: bool = False) -> Dict[str, Any]:
    """
    Robust multi-layer JSON parser.
    Handles standard LLM blocks, code fences, truncations, and fallbacks.
    """
    text = raw.strip()
    if "```" in text:
        text = re.sub(r"```(?:json)?", "", text).strip().replace("```", "").strip()

    if _HAS_JSON_REPAIR:
        try:
            repaired = repair_json(text, return_objects=True)
            if isinstance(repaired, dict):
                return repaired
        except Exception:
            pass

    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        candidate = brace_match.group(0)
        candidate = re.split(r"\}\s*\{", candidate)[0] + "}"
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    if expect_compare:
        logger.warning("[compare] Falling back to regex row extraction")
        rows = []
        row_pattern = re.compile(
            r'\{\s*"field"\s*:\s*"(.*?)"\s*,\s*'
            r'"value_a"\s*:\s*"(.*?)"\s*,\s*'
            r'"value_b"\s*:\s*"(.*?)"\s*,\s*'
            r'"changed"\s*:\s*(true|false)',
            re.DOTALL,
        )
        for m in row_pattern.finditer(text):
            rows.append({
                "field":   m.group(1), "value_a": m.group(2), "value_b": m.group(3),
                "changed": m.group(4) == "true", "category": "General", "note": "",
            })
        summary_match = re.search(r'"summary"\s*:\s*"(.*?)"', text, re.DOTALL)
        summary = summary_match.group(1) if summary_match else "Partial comparison (JSON was malformed)."
        return {"rows": rows, "summary": summary, "key_changes": []}

    raise ValueError(f"No valid JSON found in: {text[:300]}")
