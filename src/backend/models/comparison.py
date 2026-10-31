from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

DisagreementClassification = Literal[
    'DIRECT_CONTRADICTION',
    'CONTEXTUAL_DISAGREEMENT',
    'NON_COMPARABLE',
    'INSUFFICIENT_EVIDENCE',
    'CONSENSUS'
]

ConsensusStrength = Literal['STRONG', 'MODERATE', 'PRELIMINARY']

class PaperEvidence(BaseModel):
    paper_id: str = Field(..., description="UUID of source paper")
    paper_title: str = Field(..., description="Title of source paper")
    passage_id: Optional[str] = Field(None, description="UUID of source passage")
    exact_quote: Optional[str] = Field(None, description="Exact verbatim quotation from passage")
    page_number: Optional[int] = Field(None, description="Page number in source PDF")
    claim_summary: str = Field(..., description="Substantive scientific finding or claim")
    is_verified: bool = Field(True, description="Whether quotation was verified in source text")
    match_score: float = Field(1.0, description="Faithfulness confidence score")

class ComparisonDimensionItem(BaseModel):
    dimension_name: str = Field(..., description="Comparison dimension name")
    paper_values: Dict[str, str] = Field(..., description="Mapping of paper_id to value or summary")
    evidence: List[PaperEvidence] = Field(default_factory=list, description="Grounding evidence citations")
    synthesis_notes: str = Field(..., description="Synthesis commentary on similarities and divergences")

class DisagreementItem(BaseModel):
    id: str = Field(..., description="Unique identifier for this disagreement item")
    topic: str = Field(..., description="Topic of contention or divergence")
    classification: DisagreementClassification = Field(..., description="VERITAS four-state relationship verdict")
    description: str = Field(..., description="Concise statement of the difference")
    paper_a_claim: PaperEvidence = Field(..., description="Claim from first paper")
    paper_b_claim: PaperEvidence = Field(..., description="Claim from second paper")
    contextual_factors: List[str] = Field(default_factory=list, description="Explaining contextual factors (differing datasets, baselines, conditions)")
    explanation: str = Field(..., description="Detailed analytical justification of classification")
    uncertainty_notes: Optional[str] = Field(None, description="Remaining uncertainty or missing evidence")

class ConsensusItem(BaseModel):
    id: str = Field(..., description="Unique identifier for consensus item")
    topic: str = Field(..., description="Topic of agreement")
    consensus_statement: str = Field(..., description="Synthesized finding agreed upon across papers")
    supporting_papers: List[PaperEvidence] = Field(..., description="Evidence citations from agreeing papers")
    strength: ConsensusStrength = Field('MODERATE', description="Strength of agreement across corpus")

class SideBySidePaperProfile(BaseModel):
    paper_id: str
    title: str
    authors: List[str] = Field(default_factory=list)
    year: Optional[int] = None
    objective: str
    methodology: str
    models: List[str] = Field(default_factory=list)
    datasets: List[str] = Field(default_factory=list)
    metrics: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)

class ComparisonGenerateRequest(BaseModel):
    project_id: str = Field(..., description="Workspace ID containing the papers")
    paper_ids: List[str] = Field(..., min_length=2, description="At least two paper IDs to compare")
    research_question: Optional[str] = Field(None, description="Optional custom comparative research question")

class ComparisonResponse(BaseModel):
    id: str
    project_id: str
    paper_ids: List[str]
    topic: str
    paper_profiles: List[SideBySidePaperProfile] = Field(default_factory=list)
    dimension_matrix: List[ComparisonDimensionItem] = Field(default_factory=list)
    disagreements: List[DisagreementItem] = Field(default_factory=list)
    consensus_points: List[ConsensusItem] = Field(default_factory=list)
    all_evidence: List[PaperEvidence] = Field(default_factory=list)
    total_citations: int = 0
    verified_citations: int = 0
    faithfulness_rate: float = 1.0
    model_name: str = "veritas-synthesis-engine-v1"
    prompt_version: str = "v1.0.0"
    created_at: str
    updated_at: str

class ProjectComparisonsListResponse(BaseModel):
    project_id: str
    total_comparisons: int
    comparisons: List[ComparisonResponse]

