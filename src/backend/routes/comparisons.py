from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from supabase_client import supabase
from models.comparison import (
    ComparisonGenerateRequest,
    ComparisonResponse,
    ProjectComparisonsListResponse
)
from services.synthesis_service import SynthesisService

router = APIRouter(tags=["Cross-Paper Comparisons"])

@router.post("/api/comparisons/generate", response_model=ComparisonResponse, status_code=status.HTTP_201_CREATED)
def generate_comparison(payload: ComparisonGenerateRequest):
    """
    Generates a structured cross-paper synthesis across 12 research dimensions.
    Performs contextual disagreement analysis (Direct Contradiction vs Contextual Disagreement vs Non-comparable).
    All evidence claims are grounded in source passages with physical page citations.
    """
    try:
        return SynthesisService.generate_synthesis(
            project_id=payload.project_id,
            paper_ids=payload.paper_ids,
            custom_question=payload.research_question
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cross-paper synthesis failed: {str(exc)}")

@router.get("/api/comparisons/{comparison_id}", response_model=ComparisonResponse)
def get_comparison(comparison_id: str):
    """
    Retrieves a saved cross-paper synthesis matrix with all dimensional evidence links.
    """
    comparison = SynthesisService.get_comparison(comparison_id)
    if not comparison:
        raise HTTPException(status_code=404, detail="Comparison synthesis not found.")
    return comparison

@router.get("/api/projects/{project_id}/comparisons", response_model=ProjectComparisonsListResponse)
def get_project_comparisons(project_id: str):
    """
    Retrieves all synthesis matrices generated for a research workspace.
    """
    # Verify project exists
    ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
    if not ws_res.data:
        raise HTTPException(status_code=404, detail="Project not found.")

    return SynthesisService.get_project_comparisons(project_id)

