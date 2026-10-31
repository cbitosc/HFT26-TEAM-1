from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
from supabase_client import supabase
from models.summary import (
    SummaryGenerateRequest,
    SummaryResponse,
    ProjectSummariesListResponse
)
from services.summary_service import SummaryService

router = APIRouter(tags=["Summaries"])

@router.post("/api/summaries/generate", response_model=SummaryResponse, status_code=status.HTTP_201_CREATED)
def generate_summary(payload: SummaryGenerateRequest):
    """
    Generates an evidence-grounded academic summary for a paper.
    Every substantive factual statement is linked to an exact source passage quotation.
    """
    try:
        return SummaryService.generate_summary(
            paper_id=payload.paper_id,
            summary_type=payload.summary_type,
            project_id=payload.project_id,
            custom_focus=payload.custom_focus
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(exc)}")

@router.get("/api/summaries/{summary_id}", response_model=SummaryResponse)
def get_summary(summary_id: str):
    """
    Retrieves a saved summary by ID with all statement-level citations.
    """
    summary = SummaryService.get_summary(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found.")
    return summary

@router.get("/api/projects/{project_id}/summaries", response_model=ProjectSummariesListResponse)
def get_project_summaries(project_id: str):
    """
    Retrieves all saved summaries for papers in a research workspace.
    """
    # Verify project exists
    ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
    if not ws_res.data:
        raise HTTPException(status_code=404, detail="Project not found.")

    return SummaryService.get_project_summaries(project_id)

@router.delete("/api/summaries/{summary_id}", status_code=status.HTTP_200_OK)
def delete_summary(summary_id: str):
    """
    Deletes a saved summary output.
    """
    success = SummaryService.delete_summary(summary_id)
    if not success:
        raise HTTPException(status_code=404, detail="Summary not found or already deleted.")
    return {"message": "Summary deleted successfully", "id": summary_id}

