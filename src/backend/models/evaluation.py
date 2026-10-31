"""
VERITAS — Phase 10: Evaluation & Benchmarking Models
Defines Pydantic schemas for the evaluation dataset samples, metrics calculation,
confusion matrices, failure categorizations, and evaluation run reports.
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class EvaluationExpectedVerdict(str, Enum):
    SUPPORTED = "Supported"
    CONTRADICTED = "Contradicted"
    UNRESOLVED = "Unresolved"


class FailureCategory(str, Enum):
    RETRIEVAL_FAILURE = "Retrieval failure (evidence passage not in top-K)"
    MISSING_EVIDENCE = "Missing evidence (source paper lacks necessary details)"
    INCORRECT_ENTAILMENT = "Incorrect entailment (false positive support)"
    INCORRECT_CONTRADICTION = "Incorrect contradiction (false positive contradiction)"
    CONTEXT_MISMATCH = "Context mismatch (conflicting metric or dataset)"
    NUMERICAL_REASONING_FAILURE = "Numerical reasoning failure (calculation or scale error)"
    INVALID_SOURCE_REFERENCE = "Invalid source reference (hallucinated or invalid citation)"
    COMPOUND_CLAIM = "Compound claim (multiple propositions mixed)"
    AMBIGUOUS_CLAIM = "Ambiguous claim (unresolvable without additional context)"
    PROVIDER_PROCESSING_ERROR = "Provider or processing error"


class BenchmarkSample(BaseModel):
    """Schema for a single benchmark evaluation item."""
    sample_id: str = Field(..., description="Unique sample identifier")
    claim_text: str = Field(..., description="Factual scientific claim to evaluate")
    expected_verdict: EvaluationExpectedVerdict = Field(..., description="Ground-truth verdict")
    source_paper_title: Optional[str] = Field(None, description="Title of relevant paper if known")
    source_paper_id: Optional[str] = Field(None, description="Paper UUID if mapped")
    gold_evidence_quotes: List[str] = Field(default_factory=list, description="Authoritative gold quotes if known")
    domain: Optional[str] = Field("Computer Science / AI", description="Research field")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BenchmarkDatasetInfo(BaseModel):
    name: str
    version: str = "1.0"
    description: str = ""
    total_samples: int = 0
    supported_count: int = 0
    contradicted_count: int = 0
    unresolved_count: int = 0
    has_evidence_quotes: bool = False


class ClassMetrics(BaseModel):
    support: int
    precision: float
    recall: float
    f1_score: float


class EvaluationMetrics(BaseModel):
    """Rigorous scientific fact-checking metrics."""
    total_samples: int
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    weighted_precision: float
    weighted_recall: float
    weighted_f1: float
    per_class_metrics: Dict[str, ClassMetrics]
    confusion_matrix: Dict[str, Dict[str, int]]  # expected -> {predicted: count}
    source_link_validity_rate: float
    invalid_citation_rate: float
    unresolved_rate: float
    evidence_sufficiency_rate: float


class EvaluationSampleResult(BaseModel):
    sample_id: str
    claim_text: str
    expected_verdict: str
    predicted_verdict: str
    is_correct: bool
    confidence_score: float = 1.0
    retrieved_passages_count: int = 0
    cited_evidence_count: int = 0
    has_valid_citation: bool = True
    failure_category: Optional[FailureCategory] = None
    failure_explanation: Optional[str] = None
    is_abstention: bool = False
    is_justified_abstention: bool = False
    retrieved_top_passages: List[Dict[str, Any]] = Field(default_factory=list)


class EvaluationRun(BaseModel):
    id: str
    dataset_name: str
    dataset_version: str = "1.0"
    created_at: str
    duration_seconds: float
    model_name: str
    prompt_version: str
    retrieval_strategy: str = "Hybrid BM25 + Vector RRF"
    total_samples: int
    metrics: EvaluationMetrics
    sample_results: List[EvaluationSampleResult]
    failure_summary: Dict[str, int]
    is_official_run: bool = False
    notes: str = ""


class EvaluationRunSummary(BaseModel):
    id: str
    dataset_name: str
    created_at: str
    duration_seconds: float
    total_samples: int
    accuracy: float
    macro_f1: float
    weighted_f1: float
    source_link_validity_rate: float
    is_official_run: bool


class EvaluationRunResponse(BaseModel):
    run: EvaluationRun


class ListEvaluationRunsResponse(BaseModel):
    total_runs: int
    runs: List[EvaluationRunSummary]
