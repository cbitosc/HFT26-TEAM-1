from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

SummaryType = Literal['short', 'detailed', 'structured_academic']
StatementRelationship = Literal['direct_support', 'cautious_inference', 'unresolved']

class SummaryStatement(BaseModel):
    id: str = Field(..., description="Unique ID of this factual statement")
    statement_text: str = Field(..., description="The substantive statement in the summary")
    source_paper_id: str = Field(..., description="Paper ID from which this statement originates")
    supporting_passage_id: Optional[str] = Field(None, description="Passage ID supporting the claim")
    exact_quote: Optional[str] = Field(None, description="Exact quotation from the passage")
    page_number: Optional[int] = Field(None, description="Page in PDF where quotation occurs")
    relationship: StatementRelationship = Field('direct_support', description="Epistemic status of statement")
    is_verified: bool = Field(True, description="Whether exact substring was verified against passage text")
    match_score: float = Field(1.0, description="Faithfulness confidence score")

class SummarySection(BaseModel):
    heading: str
    content: str
    statements: List[SummaryStatement] = Field(default_factory=list)

class SummaryGenerateRequest(BaseModel):
    paper_id: str
    project_id: Optional[str] = None
    summary_type: SummaryType = 'detailed'
    custom_focus: Optional[str] = None

class SummaryResponse(BaseModel):
    id: str
    paper_id: str
    project_id: Optional[str] = None
    title: str
    summary_type: SummaryType
    content: str
    sections: List[SummarySection] = Field(default_factory=list)
    statements: List[SummaryStatement] = Field(default_factory=list)
    model_name: str = "veritas-grounded-summary-v1"
    prompt_version: str = "v1.0.0"
    source_references: List[Dict[str, Any]] = Field(default_factory=list)
    total_statements: int = 0
    verified_statements: int = 0
    faithfulness_rate: float = 1.0
    created_at: str
    updated_at: str

class ProjectSummariesListResponse(BaseModel):
    project_id: str
    total_summaries: int
    summaries: List[SummaryResponse]

