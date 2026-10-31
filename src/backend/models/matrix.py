"""
VERITAS — Phase 8: Evidence Explorer & Comparison Matrix Models
Defines Pydantic schemas for source-linked comparison matrices, matrix cells,
adjacent passage context, and secure PDF access.
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class CellStatus(str, Enum):
    EVIDENCE_PRESENT = "evidence_present"
    EVIDENCE_CONFLICTING = "evidence_conflicting"
    EVIDENCE_UNAVAILABLE = "evidence_unavailable"
    NOT_REPORTED = "not_reported"


class MatrixCell(BaseModel):
    paper_id: str = Field(..., description="UUID of research paper")
    paper_title: str = Field(..., description="Title of research paper")
    content: str = Field(..., description="Extracted finding, method, or metric value")
    passage_id: Optional[str] = Field(None, description="UUID of source evidence passage")
    page_number: Optional[int] = Field(None, description="Physical PDF page number")
    section_title: Optional[str] = Field(None, description="Section heading in source paper")
    exact_quote: Optional[str] = Field(None, description="Verbatim citation from passage")
    status: CellStatus = Field(CellStatus.EVIDENCE_PRESENT, description="Evidence availability flag")
    relationship: Optional[str] = Field(None, description="direct_support | contradicts | contextual_divergence")


class MatrixRow(BaseModel):
    dimension: str = Field(..., description="Research dimension name (e.g. Methodology, Dataset, Latency)")
    claim_label: str = Field(..., description="Short synthesized prompt or finding description")
    cells: Dict[str, MatrixCell] = Field(default_factory=dict, description="Mapping of paper_id -> MatrixCell")


class ComparisonMatrixResponse(BaseModel):
    id: str = Field(..., description="Unique UUID of matrix")
    project_id: str = Field(..., description="UUID of research workspace project")
    title: str = Field(..., description="Matrix title or focus question")
    paper_ids: List[str] = Field(..., description="List of paper UUIDs in matrix columns")
    paper_meta: List[Dict[str, Any]] = Field(default_factory=list, description="Bibliographic headers for columns")
    dimensions: List[str] = Field(default_factory=list, description="List of comparison dimensions")
    rows: List[MatrixRow] = Field(default_factory=list, description="Ordered matrix rows")
    total_cells: int = Field(0)
    evidence_present_count: int = Field(0)
    not_reported_count: int = Field(0)
    created_at: str = Field(..., description="ISO 8601 creation timestamp")


class GenerateMatrixRequest(BaseModel):
    project_id: str = Field(..., description="UUID of research workspace project")
    paper_ids: List[str] = Field(..., min_length=2, description="At least two paper UUIDs to compare")
    dimensions: Optional[List[str]] = Field(None, description="Optional custom list of dimensions")
    title: Optional[str] = Field(None, description="Optional custom matrix title")


class PassageContextResponse(BaseModel):
    passage_id: str
    paper_id: str
    paper_title: str
    page_number: int
    section_title: str
    text: str
    previous_context: Optional[str] = None
    next_context: Optional[str] = None
    bounding_box: Dict[str, Any] = Field(default_factory=dict)
    sequence_index: int = 0
    created_at: str


class PdfAccessResponse(BaseModel):
    paper_id: str
    signed_url: str
    expires_in_seconds: int
    file_name: str
    total_pages: int
    file_size_bytes: int

