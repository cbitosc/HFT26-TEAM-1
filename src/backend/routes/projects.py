import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status
from supabase_client import supabase
from models.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectDetailResponse
from models.passage import ProjectProcessingStatusResponse
from services.passage_service import PassageService

router = APIRouter(prefix="/api/projects", tags=["Projects"])

def parse_project_row(row: Dict[str, Any], paper_count: int = 0) -> Dict[str, Any]:
    raw_desc = row.get("description") or ""
    topic = row.get("topic")
    rq = row.get("research_question")
    clean_desc = raw_desc

    if raw_desc.startswith('{"__veritas_meta__":'):
        try:
            meta = json.loads(raw_desc)
            clean_desc = meta.get("description") or ""
            if not topic:
                topic = meta.get("topic") or None
            if not rq:
                rq = meta.get("research_question") or None
        except Exception:
            pass

    return {
        "id": row["id"],
        "user_id": row.get("user_id"),
        "name": row["name"],
        "topic": topic,
        "research_question": rq,
        "description": clean_desc,
        "paper_count": paper_count,
        "created_at": str(row.get("created_at")),
        "updated_at": str(row.get("updated_at"))
    }

def serialize_project_meta(name: str, topic: Optional[str], rq: Optional[str], desc: Optional[str]) -> Dict[str, Any]:
    meta = {
        "__veritas_meta__": True,
        "description": desc or "",
        "topic": topic or "",
        "research_question": rq or ""
    }
    return {
        "name": name,
        "description": json.dumps(meta)
    }

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate):
    try:
        record = serialize_project_meta(
            name=payload.name,
            topic=payload.topic,
            rq=payload.research_question,
            desc=payload.description
        )
        res = supabase.table("research_workspaces").insert(record).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return parse_project_row(res.data[0], paper_count=0)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("", response_model=List[ProjectResponse])
def list_projects():
    try:
        # Fetch all projects
        p_res = supabase.table("research_workspaces").select("*").order("created_at", desc=True).execute()
        projects_data = p_res.data or []
        if not projects_data:
            return []

        # Count papers per project via workspace_papers
        counts_res = supabase.table("workspace_papers").select("workspace_id").execute()
        counts_map: Dict[str, int] = {}
        for item in (counts_res.data or []):
            ws_id = item["workspace_id"]
            counts_map[ws_id] = counts_map.get(ws_id, 0) + 1

        results = []
        for p in projects_data:
            cnt = counts_map.get(p["id"], 0)
            results.append(parse_project_row(p, paper_count=cnt))

        return results
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project(project_id: str):
    try:
        ws_res = supabase.table("research_workspaces").select("*").eq("id", project_id).execute()
        if not ws_res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        project = ws_res.data[0]

        # Fetch linked papers
        links_res = supabase.table("workspace_papers").select("paper_id, papers(*)").eq("workspace_id", project_id).execute()
        papers = []
        for item in (links_res.data or []):
            p = item.get("papers")
            if p:
                orig_fn = p.get("original_filename") or (p.get("metadata_json") or {}).get("original_filename") or f"{p.get('title')}.pdf"
                papers.append({
                    **p,
                    "project_id": project_id,
                    "original_filename": orig_fn,
                    "storage_path": p.get("file_path"),
                    "file_size": p.get("file_size_bytes"),
                    "status": p.get("processing_status"),
                    "page_count": p.get("total_pages"),
                    "mime_type": "application/pdf"
                })

        parsed = parse_project_row(project, paper_count=len(papers))
        return {
            **parsed,
            "papers": papers
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, payload: ProjectUpdate):
    try:
        # Fetch current project
        ws_res = supabase.table("research_workspaces").select("*").eq("id", project_id).execute()
        if not ws_res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        curr = parse_project_row(ws_res.data[0])
        new_name = payload.name if payload.name is not None else curr["name"]
        new_topic = payload.topic if payload.topic is not None else curr["topic"]
        new_rq = payload.research_question if payload.research_question is not None else curr["research_question"]
        new_desc = payload.description if payload.description is not None else curr["description"]

        record = serialize_project_meta(new_name, new_topic, new_rq, new_desc)
        upd_res = supabase.table("research_workspaces").update(record).eq("id", project_id).execute()
        if not upd_res.data:
            raise HTTPException(status_code=500, detail="Failed to update project")

        # Fetch paper count
        cnt_res = supabase.table("workspace_papers").select("paper_id", count="exact").eq("workspace_id", project_id).execute()
        cnt = cnt_res.count if cnt_res.count is not None else 0

        return parse_project_row(upd_res.data[0], paper_count=cnt)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
def delete_project(project_id: str):
    try:
        # Check project exists
        ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
        if not ws_res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        supabase.table("research_workspaces").delete().eq("id", project_id).execute()
        return {"message": "Project deleted successfully", "id": project_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("/{project_id}/papers")
def list_project_papers(project_id: str):
    try:
        # Validate project exists
        ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
        if not ws_res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        links_res = supabase.table("workspace_papers").select("paper_id, papers(*)").eq("workspace_id", project_id).execute()
        papers = []
        for item in (links_res.data or []):
            p = item.get("papers")
            if p:
                orig_fn = p.get("original_filename") or (p.get("metadata_json") or {}).get("original_filename") or f"{p.get('title')}.pdf"
                papers.append({
                    "id": p["id"],
                    "project_id": project_id,
                    "title": p.get("title"),
                    "original_filename": orig_fn,
                    "storage_path": p.get("file_path"),
                    "file_size": p.get("file_size_bytes"),
                    "status": p.get("processing_status"),
                    "page_count": p.get("total_pages"),
                    "mime_type": "application/pdf",
                    "created_at": p.get("created_at"),
                    "updated_at": p.get("updated_at")
                })
        return {
            "project_id": project_id,
            "total_papers": len(papers),
            "papers": papers
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("/{project_id}/processing-status", response_model=ProjectProcessingStatusResponse)
def get_project_processing_status(project_id: str):
    try:
        # Validate project exists
        ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
        if not ws_res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        res = PassageService.get_project_processing_status(project_id)
        return ProjectProcessingStatusResponse(**res)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")


