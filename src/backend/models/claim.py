"""
VERITAS — Phase 6: Atomic Claim Decomposition Models
Defines Pydantic schemas for decomposed factual claims, propositions,
structural positions, and decomposition responses.
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class ClaimCategory(str, Enum):
    NUMERICAL = "numerical"
    COMPARATIVE = "comparative"
    METHODOLOGICAL = "methodological"
    DATASET = "dataset"
    RESULT = "result"
    GENERALIZATION = "generalization"
    LIMITATION = "limitation"
    DESCRIPTIVE_FACTUAL = "descriptive_factual"
    MIXED = "mixed"


class ClaimTypeDb(str, Enum):
    """Mapped to the Supabase claims.claim_type check constraint."""
    EMPIRICAL = "EMPIRICAL"
    METHODOLOGICAL = "METHODOLOGICAL"
    THEORETICAL = "THEORETICAL"
    BENCHMARK_RESULT = "BENCHMARK_RESULT"
    LIMITATION = "LIMITATION"


class VerificationStatus(str, Enum):
    """Tri-state + unverified status."""
    UNVERIFIED = "UNVERIFIED"
    SUPPORTED = "SUPPORTED"
    CONTRADICTED = "CONTRADICTED"
    UNRESOLVED = "UNRESOLVED"


class OriginalPosition(BaseModel):
    paragraph_index: int = Field(..., ge=0, description="0-indexed paragraph number")
    sentence_index: int = Field(..., ge=0, description="0-indexed sentence number within paragraph")
    claim_index: int = Field(..., ge=0, description="0-indexed claim index within sentence")
    start_char: Optional[int] = Field(None, ge=0, description="Character start offset in original text")
    end_char: Optional[int] = Field(None, ge=0, description="Character end offset in original text")


class AtomicClaim(BaseModel):
    id: str = Field(..., description="Unique UUID for this claim")
    output_id: str = Field(..., description="UUID of source summary or synthesis output")
    project_id: str = Field(..., description="UUID of research workspace project")
    source_paper_id: Optional[str] = Field(None, description="Primary source paper UUID if known")
    original_text: str = Field(..., description="Original full sentence or clause")
    normalized_text: str = Field(..., description="Cleaned, self-contained atomic claim proposition")
    paragraph_index: int = Field(..., ge=0)
    sentence_index: int = Field(..., ge=0)
    claim_index: int = Field(..., ge=0)
    original_position: Dict[str, Any] = Field(
        default_factory=dict,
        description="Position dictionary: paragraph_index, sentence_index, claim_index, start_char, end_char"
    )
    is_atomic: bool = Field(True, description="True if atomic proposition, False if compound or ambiguous")
    category: ClaimCategory = Field(ClaimCategory.DESCRIPTIVE_FACTUAL, description="Claim semantic category")
    decomposition_notes: str = Field("", description="Explanation of decomposition method or atomicity caveats")
    verification_status: VerificationStatus = Field(VerificationStatus.UNVERIFIED, description="Current verification verdict")
    confidence_score: float = Field(1.0, ge=0.0, le=1.0, description="Confidence in decomposition quality")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")


class SentenceDecomposition(BaseModel):
    sentence_index: int = Field(..., ge=0)
    original_sentence: str = Field(..., description="The raw sentence text")
    start_char: int = Field(0, ge=0)
    end_char: int = Field(0, ge=0)
    claims: List[AtomicClaim] = Field(default_factory=list, description="Atomic claims extracted from this sentence")


class ParagraphDecomposition(BaseModel):
    paragraph_index: int = Field(..., ge=0)
    original_paragraph: str = Field(..., description="The full paragraph text")
    sentences: List[SentenceDecomposition] = Field(default_factory=list)


class DecomposeClaimsRequest(BaseModel):
    output_id: str = Field(..., description="UUID of the summary or synthesis to decompose")
    project_id: str = Field(..., description="UUID of the research workspace")
    original_text: Optional[str] = Field(None, description="Optional raw text override; if omitted, retrieved from output")
    paper_ids: Optional[List[str]] = Field(None, description="Optional paper UUIDs associated with output")
    force_regenerate: bool = Field(False, description="Whether to re-run decomposition even if previously cached")


class OutputClaimsResponse(BaseModel):
    output_id: str
    project_id: str
    original_text: str
    paragraphs: List[ParagraphDecomposition]
    claims: List[AtomicClaim]
    total_paragraphs: int
    total_sentences: int
    total_claims: int
    atomic_claims_count: int
    compound_claims_count: int
    categories_breakdown: Dict[str, int]
    created_at: str

