"""
domain.py — Internal Domain Models
===================================
Pydantic schemas used internally by the AI pipelines.
"""

from pydantic import BaseModel, Field
from typing import List

# ---------------------------------------------------------
# Query Pipeline Models
# ---------------------------------------------------------
class InsuranceAnswer(BaseModel):
    decision:      str       = Field(description="approve | reject | partial | informational")
    justification: str       = Field(description="Detailed multi-paragraph explanation")
    clauses:       List[str] = Field(description="Cited clauses as 'filename:section:clause_text'")
    confidence:    int       = Field(description="0-100", ge=0, le=100)
    conditions:    List[str] = Field(default_factory=list, description="Key conditions, waiting periods, or exclusions that apply")
    summary:       str       = Field(default="", description="One-sentence plain-English summary for non-experts")

# ---------------------------------------------------------
# Compare Pipeline Models
# ---------------------------------------------------------
class DiffRow(BaseModel):
    field:    str  = Field(description="Policy aspect being compared")
    value_a:  str  = Field(description="Value from document A")
    value_b:  str  = Field(description="Value from document B")
    changed:  bool = Field(description="True if values differ meaningfully")
    category: str  = Field(default="General", description="Section category for grouping")
    note:     str  = Field(default="", description="Optional analyst note about the difference")

class CompareResult(BaseModel):
    doc_a_name:   str
    doc_b_name:   str
    doc_a_insurer: str
    doc_b_insurer: str
    rows:         List[DiffRow]
    summary:      str  = Field(description="2-3 sentence plain-English summary of key differences")
    key_changes:  List[str] = Field(description="Top 3-5 most important differences as bullet points")
