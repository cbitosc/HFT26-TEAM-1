"""
VERITAS — Phase 9: Advanced Research Audit Models
Defines Pydantic schemas for the Numerical Truth Detector, Overgeneralization Detector,
Research Gap Explorer, and Evidence Provenance Ledger.
"""

from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


# =============================================================================
# FEATURE A: NUMERICAL TRUTH DETECTOR MODELS
# =============================================================================

class NumericalVerdict(str, Enum):
    NUMERICALLY_CONSISTENT = "Numerically consistent"
    NUMERICAL_DISCREPANCY = "Numerical discrepancy"
    CONTEXT_MISMATCH = "Context mismatch"
    INSUFFICIENT_NUMERICAL_EVIDENCE = "Insufficient numerical evidence"


class NumericalExpression(BaseModel):
    value: float = Field(..., description="Parsed float or Decimal value")
    raw_str: str = Field(..., description="Exact textual expression in prose")
    unit: Optional[str] = Field(None, description="e.g. %, ms, epochs, parameters, GB")
    metric: Optional[str] = Field(None, description="e.g. accuracy, F1, latency, throughput")
    dataset: Optional[str] = Field(None, description="e.g. ImageNet, GLUE, SQuAD")
    baseline_value: Optional[float] = Field(None, description="Reported comparison baseline if present")
    direction: Optional[str] = Field(None, description="higher_better | lower_better | parity")
    is_percentage: bool = False
    is_percentage_points: bool = False


class NumericalAuditResult(BaseModel):
    claim_id: str
    claim_text: str
    verdict: NumericalVerdict
    claimed_expression: Optional[NumericalExpression] = None
    source_reported_expression: Optional[NumericalExpression] = None
    calculation_explanation: str
    relative_change_calc: Optional[str] = None
    percentage_point_calc: Optional[str] = None
    unit_match: bool = True
    metric_match: bool = True
    dataset_match: bool = True
    direction_match: bool = True
    passage_id: Optional[str] = None
    exact_quote: Optional[str] = None


# =============================================================================
# FEATURE B: OVERGENERALIZATION DETECTOR MODELS
# =============================================================================

class OvergeneralizationType(str, Enum):
    DATASET_OVERREACH = "Dataset overreach (single benchmark generalized to all datasets)"
    SAMPLE_SIZE_OVERREACH = "Sample size overreach (small sample generalized to large population)"
    CORRELATION_AS_CAUSATION = "Correlation presented as definitive causation"
    CONDITIONAL_AS_UNIVERSAL = "Conditional/synthetic finding presented as universal fact"
    BENCHMARK_AS_REAL_WORLD = "Benchmark metric proxy treated as real-world proof"
    OMISSION_OF_LIMITATIONS = "Narrow finding stated without author's explicit limitations"
    NONE_DETECTED = "Appropriately scoped (no overgeneralization detected)"


class OvergeneralizationAuditResult(BaseModel):
    claim_id: str
    claim_text: str
    is_overgeneralized: bool
    flagged_type: OvergeneralizationType
    evidence_supported_scope: str
    explanation: str
    suggested_narrower_wording: str
    requires_human_review: bool
    passage_id: Optional[str] = None
    exact_quote: Optional[str] = None


# =============================================================================
# FEATURE C: RESEARCH GAP EXPLORER MODELS
# =============================================================================

class GapOriginType(str, Enum):
    AUTHOR_IDENTIFIED = "Author-identified future work"
    VERITAS_SYNTHESIZED = "VERITAS-synthesized research direction"


class ResearchGapItem(BaseModel):
    id: str = Field(..., description="Unique UUID for research gap")
    project_id: str
    suggested_research_question: str
    supporting_limitations: List[str] = Field(default_factory=list)
    source_paper_ids: List[str] = Field(default_factory=list)
    source_paper_titles: List[str] = Field(default_factory=list)
    source_passage_ids: List[str] = Field(default_factory=list)
    explanation: str
    origin_type: GapOriginType
    important_uncertainties: List[str] = Field(default_factory=list)
    feasibility_notes: str = ""
    created_at: str


class GenerateGapsRequest(BaseModel):
    project_id: str
    paper_ids: Optional[List[str]] = None
    focus_area: Optional[str] = None


class ProjectGapsResponse(BaseModel):
    project_id: str
    total_gaps: int
    author_identified_count: int
    veritas_synthesized_count: int
    gaps: List[ResearchGapItem]


# =============================================================================
# FEATURE D: EVIDENCE PROVENANCE LEDGER MODELS
# =============================================================================

class LedgerEventType(str, Enum):
    PAPER_UPLOAD = "PAPER_UPLOAD"
    PAPER_PROCESSING = "PAPER_PROCESSING"
    INTELLIGENCE_EXTRACTION = "INTELLIGENCE_EXTRACTION"
    SUMMARY_GENERATION = "SUMMARY_GENERATION"
    SYNTHESIS_GENERATION = "SYNTHESIS_GENERATION"
    CLAIM_DECOMPOSITION = "CLAIM_DECOMPOSITION"
    EVIDENCE_RETRIEVAL = "EVIDENCE_RETRIEVAL"
    CLAIM_VERIFICATION = "CLAIM_VERIFICATION"
    NUMERICAL_AUDIT = "NUMERICAL_AUDIT"
    OVERGENERALIZATION_AUDIT = "OVERGENERALIZATION_AUDIT"
    RESEARCH_GAP_GENERATION = "RESEARCH_GAP_GENERATION"
    USER_REGENERATION = "USER_REGENERATION"


class ProvenanceLedgerEntry(BaseModel):
    id: str = Field(..., description="Unique event UUID")
    project_id: str
    event_type: LedgerEventType
    entity_id: str
    title: str
    description: str
    actor: str = "veritas-engine"
    model_name: Optional[str] = None
    prompt_version: Optional[str] = None
    retrieval_version: Optional[str] = None
    validation_outcome: str = "SUCCESS"  # SUCCESS | DOWNGRADED | FLAGGED | FAILED
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    created_at: str


class ProjectLedgerResponse(BaseModel):
    project_id: str
    total_events: int
    events: List[ProvenanceLedgerEntry]
