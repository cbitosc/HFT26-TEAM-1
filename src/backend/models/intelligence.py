from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

ExtractionCategory = Literal[
    'OBJECTIVE', 'METHODOLOGY', 'DATASET', 
    'METRIC', 'KEY_FINDING', 'LIMITATION', 'GENERAL'
]

class EvidenceReference(BaseModel):
    id: Optional[str] = None
    paper_id: str = Field(..., description="Target Paper UUID")
    passage_id: str = Field(..., description="Deterministic Passage UUID")
    supporting_quote: str = Field(..., description="Exact quoted excerpt from the passage")
    page_number: int = Field(..., description="Page number where the quote occurs")
    extraction_category: ExtractionCategory = Field('GENERAL', description="Dimension category")
    is_verified: bool = Field(True, description="Whether exact substring match was verified against passage text")
    match_score: float = Field(1.0, description="Faithfulness confidence (1.0 = exact match)")
    rejection_reason: Optional[str] = Field(None, description="Explanation if verification failed")

class ResearchObjective(BaseModel):
    problem_statement: str = Field(..., description="What problem is being investigated?")
    research_question: str = Field(..., description="What is the primary research question?")
    hypothesis: Optional[str] = Field("Not reported", description="Hypothesis tested, if any")
    evidence: List[EvidenceReference] = Field(default_factory=list)

class Methodology(BaseModel):
    research_design: str = Field(..., description="Research design or architectural paradigm")
    experimental_approach: str = Field(..., description="Experimental or analytical approach")
    models_and_techniques: List[str] = Field(default_factory=list, description="Models, algorithms, or techniques used")
    baselines_and_comparisons: List[str] = Field(default_factory=list, description="Baselines and comparison methods")
    procedural_details: str = Field(..., description="Key procedural and training/setup details")
    evidence: List[EvidenceReference] = Field(default_factory=list)

class DatasetInformation(BaseModel):
    dataset_name: str = Field(..., description="Name of the dataset(s) or benchmark(s)")
    dataset_source: Optional[str] = Field("Not reported", description="Source or collection origin")
    sample_size: Optional[str] = Field("Not reported", description="Sample size or token/instance count")
    population_or_domain: str = Field(..., description="Population, language, or domain")
    collection_conditions: Optional[str] = Field("Not reported", description="Data collection conditions")
    train_val_test_split: Optional[str] = Field("Not reported", description="Train/val/test splits")
    evidence: List[EvidenceReference] = Field(default_factory=list)

class MetricItem(BaseModel):
    metric_name: str = Field(..., description="Evaluation metric name (e.g., BLEU, Accuracy, F1)")
    reported_value: str = Field(..., description="Reported empirical value")
    unit: Optional[str] = Field(None, description="Unit of measurement, if applicable")
    baseline_comparison: Optional[str] = Field("Not reported", description="Comparison baseline value or delta")
    experimental_condition: Optional[str] = Field(None, description="Condition or task under which metric was measured")
    evidence: List[EvidenceReference] = Field(default_factory=list)

class KeyFindingItem(BaseModel):
    finding: str = Field(..., description="Core substantive result or takeaway")
    finding_type: Literal['quantitative', 'qualitative'] = Field('qualitative')
    answers_research_question: bool = Field(True, description="Whether this finding directly answers the core question")
    evidence: List[EvidenceReference] = Field(default_factory=list)

class Limitations(BaseModel):
    author_reported_limitations: List[str] = Field(default_factory=list, description="Limitations explicitly stated by authors")
    methodological_limitations: List[str] = Field(default_factory=list, description="Methodological or algorithmic constraints")
    dataset_limitations: List[str] = Field(default_factory=list, description="Data volume, bias, or domain constraints")
    generalizability_constraints: List[str] = Field(default_factory=list, description="Generalizability boundaries")
    future_work: List[str] = Field(default_factory=list, description="Author-suggested future directions")
    evidence: List[EvidenceReference] = Field(default_factory=list)

class AdditionalContext(BaseModel):
    abstract_summary: str = Field(..., description="High-level synthesized summary of the abstract")
    keywords: List[str] = Field(default_factory=list, description="Extracted domain keywords")
    domain: str = Field(..., description="Scientific discipline or subfield")
    important_terminology: List[str] = Field(default_factory=list, description="Key technical terms defined in paper")

class VerificationSummary(BaseModel):
    total_cited: int = 0
    total_verified: int = 0
    total_rejected: int = 0
    faithfulness_rate: float = 1.0

class PaperIntelligenceResponse(BaseModel):
    id: str
    paper_id: str
    project_id: Optional[str] = None
    extraction_version: int = 1
    model_name: str = "veritas-intelligence-engine-v1"
    prompt_version: str = "v1.0.0"
    research_objective: ResearchObjective
    methodology: Methodology
    dataset_information: DatasetInformation
    metrics: List[MetricItem] = Field(default_factory=list)
    key_findings: List[KeyFindingItem] = Field(default_factory=list)
    limitations: Limitations
    additional_context: AdditionalContext
    evidence_references: List[EvidenceReference] = Field(default_factory=list)
    verification_summary: VerificationSummary = Field(default_factory=VerificationSummary)
    created_at: str
    updated_at: str

class ProjectIntelligenceSummary(BaseModel):
    project_id: str
    total_papers: int
    extracted_papers: int
    papers: List[PaperIntelligenceResponse]

