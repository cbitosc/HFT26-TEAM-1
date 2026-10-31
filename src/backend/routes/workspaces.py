from typing import List
from fastapi import APIRouter, HTTPException, status
from supabase_client import supabase
from models.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceWithPapers

router = APIRouter(prefix="/api/v1/workspaces", tags=["Workspaces"])

@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate):
    try:
        record = {
            "name": payload.name,
            "description": payload.description
        }
        res = supabase.table("research_workspaces").insert(record).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create research workspace")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("", response_model=List[WorkspaceResponse])
def list_workspaces():
    try:
        res = supabase.table("research_workspaces").select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("/{workspace_id}", response_model=WorkspaceWithPapers)
def get_workspace(workspace_id: str):
    try:
        # Fetch workspace
        ws_res = supabase.table("research_workspaces").select("*").eq("id", workspace_id).execute()
        if not ws_res.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        ws = ws_res.data[0]

        # Fetch linked papers
        links_res = supabase.table("workspace_papers").select("paper_id, papers(*)").eq("workspace_id", workspace_id).execute()
        papers = []
        if links_res.data:
            for item in links_res.data:
                if item.get("papers"):
                    papers.append(item["papers"])

        return {
            **ws,
            "papers": papers,
            "paper_count": len(papers)
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.delete("/{workspace_id}", status_code=status.HTTP_200_OK)
def delete_workspace(workspace_id: str):
    try:
        res = supabase.table("research_workspaces").delete().eq("id", workspace_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"message": "Workspace deleted successfully", "id": workspace_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

