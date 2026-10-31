"""
VERITAS — Phase 7: Evidence Retrieval & Claim Verification Models
Defines Pydantic schemas for hybrid retrieval candidates, tri-state verdicts,
evidence citations, and verification summaries.
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class EvidenceVerdict(str, Enum):
    SUPPORTED = "Supported"
    CONTRADICTED = "Contradicted"
    UNRESOLVED = "Unresolved"


class EvidenceStrength(str, Enum):
    DIRECT_EVIDENCE = "Direct evidence"
    PARTIAL_EVIDENCE = "Partial evidence"
    CONFLICTING_EVIDENCE = "Conflicting evidence"
    INSUFFICIENT_EVIDENCE = "Insufficient evidence"


class RetrievedCandidate(BaseModel):
    passage_id: str
    paper_id: str
    page_number: int
    section_title: str
    text: str
    lexical_score: float = 0.0
    semantic_score: float = 0.0
    rrf_score: float = 0.0
    rank: int = 0


class CitedEvidencePassage(BaseModel):
    passage_id: str = Field(..., description="UUID of source passage")
    paper_id: str = Field(..., description="UUID of parent research paper")
    paper_title: Optional[str] = Field(None, description="Title of parent research paper")
    page_number: int = Field(1, description="Physical page number in PDF")
    section_title: str = Field("Body", description="Section title in PDF")
    exact_quote: str = Field(..., description="Verbatim quotation cited from passage")
    relationship: str = Field(..., description="direct_support | contradicts | unresolved | contextual_divergence")
    evidence_type: str = Field("empirical", description="empirical | benchmark_result | methodological | theoretical")
    is_quote_valid: bool = Field(False, description="Deterministic check: quotation exists verbatim in passage")
    quote_match_score: float = Field(0.0, ge=0.0, le=1.0, description="1.0 for exact substring match")
    semantic_entailment: bool = Field(False, description="Whether passage logically supports the proposition")
    explanation: str = Field("", description="Why this evidence supports, contradicts, or leaves claim unresolved")


class ClaimVerificationResult(BaseModel):
    id: str = Field(..., description="Unique UUID for this verification record")
    claim_id: str = Field(..., description="UUID of verified atomic claim")
    project_id: str = Field(..., description="UUID of research workspace project")
    claim_text: str = Field(..., description="Normalized text of proposition")
    verdict: EvidenceVerdict = Field(..., description="Supported | Contradicted | Unresolved")
    reasoning: str = Field(..., description="Concise explanation grounded in retrieved evidence")
    evidence_strength: EvidenceStrength = Field(..., description="Direct | Partial | Conflicting | Insufficient")
    cited_evidence: List[CitedEvidencePassage] = Field(default_factory=list, description="Citations used in verdict")
    limitations: List[str] = Field(default_factory=list, description="Uncertainties, caveats, contextual assumptions")
    retrieved_passages_count: int = Field(0, description="Total passages retrieved by hybrid pipeline")
    numerical_check_passed: Optional[bool] = Field(None, description="True if numeric figures and units match")
    validation_passed: bool = Field(True, description="True if all deterministic integrity checks passed")
    downgraded: bool = Field(False, description="True if verdict was downgraded to Unresolved due to validation failure")
    downgrade_reason: Optional[str] = Field(None, description="Explanation if verdict was downgraded")
    model_name: str = Field("veritas-hybrid-verifier-v1")
    prompt_version: str = Field("2026.1")
    retrieval_version: str = Field("hybrid-rrf-v1")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")


class VerifyClaimRequest(BaseModel):
    claim_id: str = Field(..., description="UUID of claim to verify")
    project_id: str = Field(..., description="UUID of research workspace project")
    paper_ids: Optional[List[str]] = Field(None, description="Optional subset of paper UUIDs to constrain retrieval")
    force_regenerate: bool = Field(False, description="Force re-verification ignoring cache")


class VerifyBatchRequest(BaseModel):
    claim_ids: List[str] = Field(..., min_length=1, description="List of claim UUIDs to verify")
    project_id: str = Field(..., description="UUID of research workspace project")
    paper_ids: Optional[List[str]] = Field(None, description="Optional paper UUIDs to constrain retrieval")


class VerifyBatchResponse(BaseModel):
    total_claims: int
    successful: int
    failed: int
    results: List[ClaimVerificationResult]


class ProjectVerificationSummary(BaseModel):
    project_id: str
    total_claims: int
    verified_claims: int
    supported_count: int
    contradicted_count: int
    unresolved_count: int
    unverified_count: int
    faithfulness_rate: float
