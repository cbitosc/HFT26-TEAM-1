from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

ExtractionMethod = Literal['text', 'ocr', 'ocr_unavailable']
ProcessingState = Literal['pending', 'processing', 'completed', 'failed']

class PassageSchema(BaseModel):
    id: str = Field(..., description="Stable deterministic UUID of the passage")
    paper_id: str
    project_id: Optional[str] = None
    page_start: int
    page_end: int
    section_title: Optional[str] = None
    text: str
    sequence_index: int
    extraction_method: ExtractionMethod = 'text'
    created_at: Optional[str] = None

class ProcessingStatusResponse(BaseModel):
    paper_id: str
    status: ProcessingState
    progress_pct: int
    phase: str
    total_pages: int
    pages_processed: int
    total_passages: int
    duration_seconds: Optional[float] = None
    extraction_method: Optional[str] = None
    error: Optional[str] = None
    is_scanned: bool = False

class ProjectProcessingStatusResponse(BaseModel):
    project_id: str
    total_papers: int
    completed: int
    processing: int
    pending: int
    failed: int
    papers: List[ProcessingStatusResponse]

class PassagesListResponse(BaseModel):
    paper_id: str
    total_passages: int
    limit: int
    offset: int
    passages: List[PassageSchema]

