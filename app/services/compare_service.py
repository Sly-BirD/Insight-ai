"""
compare_service.py — Document Comparison Pipeline
==================================================
Direct LLM context ingestion to spot differences between two policies.
"""

from pathlib import Path
from loguru import logger
from llama_index.readers.file import UnstructuredReader
from langchain_core.messages import HumanMessage, SystemMessage

from app.schemas.domain import CompareResult, DiffRow
from app.utils.text_helpers import extract_insurer, parse_llm_json
from app.services.llm_client import init_llm

COMPARISON_FIELDS = """
COVERAGE & BENEFITS
- Policy type / product name
- Type of coverage (individual / family floater / group)
- Sum insured options (minimum, maximum)
- In-patient hospitalisation coverage
- Pre and post hospitalisation coverage (days)
- Day care procedures covered

WAITING PERIODS
- Initial waiting period
- Pre-existing disease (PED) waiting period
- Specific disease waiting period

EXCLUSIONS
- Permanent exclusions
- First-year exclusions

FINANCIAL TERMS
- Premium payment frequency
- Co-payment clause
- Room rent sub-limit

CLAIM PROCESS
- Cashless claim process
- Claim intimation time limit

NETWORK & RENEWAL
- Network hospital availability
- Renewal conditions
"""

def extract_text_from_pdf(pdf_path: Path) -> str:
    reader = UnstructuredReader()
    try:
        docs = reader.load_data(
            file=pdf_path,
            unstructured_kwargs={"strategy": "fast", "languages": ["eng"]},
            extra_info={},
        )
        text = "\n\n".join(d.get_content() for d in docs)
        if len(text) > 8000:
            text = text[:8000] + "\n\n[... document truncated for comparison ...]"
        return text.strip()
    except Exception as exc:
        return f"[Could not extract text from {pdf_path.name}: {exc}]"

def compare_policies(pdf_a_path: Path, pdf_a_name: str, pdf_b_path: Path, pdf_b_name: str) -> CompareResult:
    text_a = extract_text_from_pdf(pdf_a_path)
    text_b = extract_text_from_pdf(pdf_b_path)

    insurer_a = extract_insurer(pdf_a_name)
    insurer_b = extract_insurer(pdf_b_name)

    llm = init_llm()

    system_prompt = f"""You are an expert Indian health insurance policy analyst. Compare the provided documents deeply and thoroughly.
Documents: Set A ({insurer_a}), Set B ({insurer_b}).
Fields:
{COMPARISON_FIELDS}

Analyze exact differences, provide precise details, and highlight major financial or coverage gaps.
Respond with ONLY valid JSON:
{{
  "rows": [
    {{"field": "aspect", "value_a": "Exact detailed value in A", "value_b": "Exact detailed value in B", "changed": true|false, "category": "General", "note": "Clear explanation of the difference and its impact"}}
  ],
  "summary": "Provide a comprehensive 3-4 sentence summary of the exact major differences between these two policies, specifically highlighting which is better for which scenario.",
  "key_changes": ["Detailed, precise change 1", "Detailed, precise change 2"]
}}"""

    user_prompt = f"DOCUMENT A:\n{text_a}\n\nDOCUMENT B:\n{text_b}\n\nProcess exact JSON."
    
    try:
        resp = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
        data = parse_llm_json(resp.content, expect_compare=True)

        rows = []
        for r in data.get("rows", []):
            try:
                rows.append(DiffRow(**r))
            except Exception:
                pass

        if not rows:
            rows = [DiffRow(field="Comparison", value_a="N/A", value_b="N/A", changed=False, category="General", note="N/A")]

        return CompareResult(
            doc_a_name=pdf_a_name, doc_b_name=pdf_b_name,
            doc_a_insurer=insurer_a, doc_b_insurer=insurer_b,
            rows=rows, summary=data.get("summary", "Complete."),
            key_changes=data.get("key_changes", [])
        )
    except Exception as exc:
        logger.error(f"[compare] LLM failure: {exc}")
        raise
