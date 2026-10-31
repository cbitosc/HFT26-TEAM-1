from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

SectionType = Literal[
    'ABSTRACT', 'INTRODUCTION', 'METHODOLOGY', 
    'RESULTS', 'DISCUSSION', 'LIMITATIONS', 
    'CONCLUSION', 'REFERENCES', 'BODY'
]

class BoundingBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float
    width: float
    height: float
    page: int

class PaperSectionSchema(BaseModel):
    id: Optional[str] = None
    paper_id: Optional[str] = None
    title: str
    section_type: SectionType = 'BODY'
    page_start: int
    page_end: int
    order_index: int

class DocumentChunkSchema(BaseModel):
    id: Optional[str] = None
    paper_id: Optional[str] = None
    section_id: Optional[str] = None
    chunk_index: int
    content: str
    clean_text: str
    page_number: int
    bounding_box: BoundingBox
    token_count: int

class PaperDetailResponse(BaseModel):
    id: str
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    title: str
    original_filename: Optional[str] = None
    authors: List[str] = Field(default_factory=list)
    publication_year: Optional[int] = None
    venue: Optional[str] = None
    abstract: Optional[str] = None
    file_path: str
    storage_path: Optional[str] = None
    file_hash: str
    file_size_bytes: int
    file_size: Optional[int] = None
    mime_type: str = "application/pdf"
    total_pages: int
    page_count: Optional[int] = None
    processing_status: str
    status: Optional[str] = None
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    sections: List[PaperSectionSchema] = Field(default_factory=list)
    chunk_count: Optional[int] = 0
    created_at: str
    updated_at: str

class PaperUploadResponse(BaseModel):
    paper_id: str
    title: str
    original_filename: Optional[str] = None
    file_hash: str
    total_pages: int
    page_count: Optional[int] = None
    total_chunks: int
    total_sections: int
    processing_status: str
    status: Optional[str] = None
    message: str
    is_duplicate: bool = False

class SignedUrlResponse(BaseModel):
    paper_id: str
    signed_url: str
    expires_in_seconds: int
