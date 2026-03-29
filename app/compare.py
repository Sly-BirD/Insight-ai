"""
compare.py — InsightAI Policy Comparison Engine
================================================
Extracts text from two uploaded PDFs and uses the LLM to produce
a structured side-by-side diff of key insurance policy fields.

No Weaviate involved — this is direct document-to-document comparison.
The LLM receives both documents as context and returns a structured
JSON diff covering: coverage, waiting periods, exclusions, premiums,
sub-limits, co-payments, network hospitals, claim procedures, etc.
"""

import re
import json
import tempfile
from pathlib import Path
from typing import Optional

try:
    from json_repair import repair_json
    _HAS_JSON_REPAIR = True
except ImportError:
    _HAS_JSON_REPAIR = False

from loguru import logger
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from llama_index.readers.file import UnstructuredReader

# ---------------------------------------------------------------------------
# Pydantic models for the compare response
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class DiffRow(BaseModel):
    """One row in the comparison table."""
    field:    str  = Field(description="Policy aspect being compared")
    value_a:  str  = Field(description="Value from document A")
    value_b:  str  = Field(description="Value from document B")
    changed:  bool = Field(description="True if values differ meaningfully")
    category: str  = Field(default="General", description="Section category for grouping")
    note:     str  = Field(default="", description="Optional analyst note about the difference")


class CompareResponse(BaseModel):
    """Full structured comparison result."""
    doc_a_name:   str
    doc_b_name:   str
    doc_a_insurer: str
    doc_b_insurer: str
    rows:         list[DiffRow]
    summary:      str  = Field(description="2-3 sentence plain-English summary of key differences")
    key_changes:  list[str] = Field(description="Top 3-5 most important differences as bullet points")


# ---------------------------------------------------------------------------
# Known insurance field categories to extract
# ---------------------------------------------------------------------------

COMPARISON_FIELDS = """
COVERAGE & BENEFITS
- Policy type / product name
- Type of coverage (individual / family floater / group)
- Sum insured options (minimum, maximum)
- In-patient hospitalisation coverage
- Pre and post hospitalisation coverage (days)
- Day care procedures covered
- Domiciliary hospitalisation
- AYUSH treatment coverage
- Maternity benefit
- Newborn baby cover
- Organ donor expenses
- Mental illness coverage
- Critical illness coverage

WAITING PERIODS
- Initial waiting period
- Pre-existing disease (PED) waiting period
- Specific disease waiting period
- Maternity waiting period

EXCLUSIONS
- Permanent exclusions (conditions never covered)
- First-year exclusions
- Pre-existing disease exclusions
- Cosmetic/aesthetic treatment
- Self-inflicted injuries
- War/terrorism exclusions

FINANCIAL TERMS
- Premium payment frequency
- Premium loading conditions
- Co-payment clause (percentage, conditions)
- Deductible / compulsory excess
- Room rent sub-limit
- ICU rent sub-limit
- Other sub-limits (ambulance, specialist fees, etc.)

CLAIM PROCESS
- Cashless claim process
- Reimbursement claim process
- Claim intimation time limit
- Documents required for claims
- TPA (Third Party Administrator)

NETWORK & RENEWAL
- Network hospital availability
- Renewal conditions
- Lifetime renewability
- Portability provisions
- No-claim bonus / cumulative bonus
- Policy tenure options
"""

# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(pdf_path: Path) -> str:
    """
    Extract text content from a PDF using UnstructuredReader.
    Returns the full text as a single string.
    Falls back to a truncated version if text is very long.
    """
    reader = UnstructuredReader()
    try:
        docs = reader.load_data(
            file=pdf_path,
            extra_info={
                "strategy": "auto",
                "languages": ["eng"],
            }
        )
        text = "\n\n".join(d.get_content() for d in docs)
        # Truncate to ~8000 chars per doc to stay within context limits
        # while keeping the most important parts (usually the beginning)
        if len(text) > 8000:
            text = text[:8000] + "\n\n[... document truncated for comparison ...]"
        return text.strip()
    except Exception as exc:
        logger.error(f"Failed to extract text from {pdf_path.name}: {exc}")
        return f"[Could not extract text from {pdf_path.name}: {exc}]"


def extract_insurer_from_filename(filename: str) -> str:
    """Infer insurer from filename — same logic as ingest.py."""
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


# ---------------------------------------------------------------------------
# JSON parser (same robust approach as query.py)
# ---------------------------------------------------------------------------

def _parse_llm_json(raw: str) -> dict:
    """
    Robust multi-layer JSON parser:
    1. Strip markdown fences
    2. Try json_repair (handles truncated / malformed JSON)
    3. Fall back to strict json.loads on the extracted object
    4. Last resort: regex-extract individual rows and rebuild the dict
    """
    text = raw.strip()

    # --- Step 1: strip markdown code fences ---
    if "```" in text:
        text = re.sub(r"```(?:json)?", "", text).strip().replace("```", "").strip()

    # --- Step 2: try json_repair first (handles truncation & bad escapes) ---
    if _HAS_JSON_REPAIR:
        try:
            repaired = repair_json(text, return_objects=True)
            if isinstance(repaired, dict) and "rows" in repaired:
                logger.debug("[compare] JSON parsed via json_repair")
                return repaired
        except Exception as exc:
            logger.debug(f"[compare] json_repair failed: {exc}")

    # --- Step 3: extract the outermost { ... } block and try strict parse ---
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        candidate = brace_match.group(0)
        # Drop anything after the last complete top-level object
        candidate = re.split(r"\}\s*\{", candidate)[0] + "}"
        try:
            result = json.loads(candidate)
            logger.debug("[compare] JSON parsed via strict json.loads")
            return result
        except json.JSONDecodeError as exc:
            logger.warning(f"[compare] Strict json.loads failed: {exc}")

    # --- Step 4: last resort — regex-mine individual row objects ---
    logger.warning("[compare] Falling back to regex row extraction")
    rows = []
    # Match individual row objects even if the outer array is truncated
    row_pattern = re.compile(
        r'\{\s*"field"\s*:\s*"(.*?)"\s*,\s*'
        r'"value_a"\s*:\s*"(.*?)"\s*,\s*'
        r'"value_b"\s*:\s*"(.*?)"\s*,\s*'
        r'"changed"\s*:\s*(true|false)',
        re.DOTALL,
    )
    for m in row_pattern.finditer(text):
        rows.append({
            "field":   m.group(1),
            "value_a": m.group(2),
            "value_b": m.group(3),
            "changed": m.group(4) == "true",
            "category": "General",
            "note": "",
        })

    # Try to pull summary from text
    summary_match = re.search(r'"summary"\s*:\s*"(.*?)"', text, re.DOTALL)
    summary = summary_match.group(1) if summary_match else "Partial comparison (JSON was malformed)."

    return {"rows": rows, "summary": summary, "key_changes": []}


# ---------------------------------------------------------------------------
# Core comparison function
# ---------------------------------------------------------------------------

def compare_policies(
    pdf_a_path: Path,
    pdf_a_name: str,
    pdf_b_path: Path,
    pdf_b_name: str,
    llm: ChatGroq,
) -> CompareResponse:
    """
    Extract text from both PDFs and use the LLM to produce a structured diff.

    Args:
        pdf_a_path: Path to first PDF file
        pdf_a_name: Original filename of first PDF
        pdf_b_path: Path to second PDF file
        pdf_b_name: Original filename of second PDF
        llm:        Initialised ChatGroq client from query.py

    Returns:
        CompareResponse with rows, summary, and key_changes
    """
    logger.info(f"[compare] Extracting text from '{pdf_a_name}'…")
    text_a = extract_text_from_pdf(pdf_a_path)

    logger.info(f"[compare] Extracting text from '{pdf_b_name}'…")
    text_b = extract_text_from_pdf(pdf_b_path)

    insurer_a = extract_insurer_from_filename(pdf_a_name)
    insurer_b = extract_insurer_from_filename(pdf_b_name)

    logger.info(f"[compare] Running LLM comparison: {insurer_a} vs {insurer_b}")

    system_prompt = f"""You are an expert Indian health insurance policy analyst specialising in policy comparisons.
You have been given two insurance policy documents. Your task is to produce a thorough,
accurate side-by-side comparison covering all key policy aspects.

DOCUMENT A: {pdf_a_name} ({insurer_a})
DOCUMENT B: {pdf_b_name} ({insurer_b})

Extract and compare the following fields where present in the documents:

{COMPARISON_FIELDS}

RULES:
- Only extract information actually present in the text — do NOT infer or invent values
- If a field is not mentioned in a document, use "Not specified"
- Mark changed=true only when the values are meaningfully different (not just wording differences)
- Be precise — include actual numbers, percentages, and durations where available
- Group rows by category for clarity

Respond with ONLY valid JSON matching this exact schema:
{{
  "rows": [
    {{
      "field": "<policy aspect name>",
      "value_a": "<value from Document A>",
      "value_b": "<value from Document B>",
      "changed": true or false,
      "category": "<one of: Coverage, Waiting Periods, Exclusions, Financial Terms, Claims, Network & Renewal, General>",
      "note": "<optional analyst note about why this difference matters, or empty string>"
    }},
    ...
  ],
  "summary": "<2-3 sentence plain-English summary of the most important differences>",
  "key_changes": [
    "<most important difference 1>",
    "<most important difference 2>",
    "<most important difference 3>"
  ]
}}

Include 10-15 rows covering the most important policy aspects.
Keep all string values concise (under 80 characters each).
Focus on differences that would matter most to a policyholder or underwriter.
IMPORTANT: Output ONLY the JSON object — no preamble, no explanation, no markdown fences."""

    user_prompt = (
        f"DOCUMENT A — {pdf_a_name}:\n"
        f"{'─' * 60}\n"
        f"{text_a}\n\n"
        f"DOCUMENT B — {pdf_b_name}:\n"
        f"{'─' * 60}\n"
        f"{text_b}\n\n"
        "Produce the structured comparison JSON."
    )

    resp = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    data = _parse_llm_json(resp.content)

    # Parse rows into DiffRow objects
    rows = []
    for r in data.get("rows", []):
        try:
            rows.append(DiffRow(**r))
        except Exception as exc:
            logger.warning(f"[compare] Skipping malformed row: {r} — {exc}")

    if not rows:
        # Fallback if LLM returned nothing useful
        rows = [DiffRow(
            field="Comparison",
            value_a="Could not extract structured data",
            value_b="Could not extract structured data",
            changed=False,
            category="General",
            note="Please try with clearer PDF files.",
        )]

    return CompareResponse(
        doc_a_name=pdf_a_name,
        doc_b_name=pdf_b_name,
        doc_a_insurer=insurer_a,
        doc_b_insurer=insurer_b,
        rows=rows,
        summary=data.get("summary", "Comparison complete."),
        key_changes=data.get("key_changes", []),
    )