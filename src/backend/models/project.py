from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    topic: Optional[str] = Field(None, max_length=255, description="Research topic domain")
    research_question: Optional[str] = Field(None, max_length=1000, description="Core research question or objective")
    description: Optional[str] = Field(None, max_length=2000, description="Detailed project description")

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    topic: Optional[str] = Field(None, max_length=255)
    research_question: Optional[str] = Field(None, max_length=1000)
    description: Optional[str] = Field(None, max_length=2000)

class ProjectResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    name: str
    topic: Optional[str] = None
    research_question: Optional[str] = None
    description: Optional[str] = None
    paper_count: int = 0
    created_at: str
    updated_at: str

class ProjectDetailResponse(ProjectResponse):
    papers: List[Dict[str, Any]] = Field(default_factory=list, description="List of research papers in this project")

