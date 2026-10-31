from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Name of the research workspace")
    description: Optional[str] = Field(None, max_length=1000, description="Optional description of the research goals")

class WorkspaceResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    created_at: str
    updated_at: str

class WorkspaceWithPapers(WorkspaceResponse):
    papers: List[Dict[str, Any]] = Field(default_factory=list, description="Papers associated with this workspace")
    paper_count: int = 0

