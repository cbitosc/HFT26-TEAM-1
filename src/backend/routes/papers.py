from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, Query, BackgroundTasks
from supabase_client import supabase
from models.paper import PaperDetailResponse, PaperUploadResponse, SignedUrlResponse
from models.passage import ProcessingStatusResponse, PassagesListResponse
from models.intelligence import PaperIntelligenceResponse
from services.ingestion_service import IngestionService
from services.passage_service import PassageService
from services.processing_tracker import ProcessingTracker
from services.intelligence_service import PaperIntelligenceService
try:
    from ..auth import get_optional_user, verify_project_ownership, AuthUser
except (ImportError, ValueError):
    from auth import get_optional_user, verify_project_ownership, AuthUser

router = APIRouter(prefix="/api/papers", tags=["Papers"])

@router.post("/upload", response_model=List[PaperUploadResponse], status_code=status.HTTP_201_CREATED)
async def upload_papers(
    files: List[UploadFile] = File(..., description="One or more academic PDF documents"),
    project_id: Optional[str] = Form(None, description="Target research project ID"),
    workspace_id: Optional[str] = Form(None, description="Alias for project_id")
):
    target_project_id = project_id or workspace_id

    # Strict Validation: If project ID is provided, verify it actually exists in database
    if target_project_id:
        ws_check = supabase.table("research_workspaces").select("id").eq("id", target_project_id).execute()
        if not ws_check.data:
            raise HTTPException(
                status_code=404,
                detail=f"Target project '{target_project_id}' does not exist. Cannot upload papers to a nonexistent project."
            )

    if not files:
        raise HTTPException(status_code=400, detail="No files provided for upload")

    results: List[PaperUploadResponse] = []
    
    for file in files:
        filename_lower = (file.filename or "").lower()
        if not filename_lower.endswith(".pdf"):
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file format for '{file.filename}'. VERITAS strictly requires academic PDF documents."
            )

        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail=f"File '{file.filename}' is empty (0 bytes).")
        if len(content) > 52428800:
            raise HTTPException(status_code=413, detail=f"File '{file.filename}' exceeds maximum allowed size (50MB).")

        try:
            ingestion_res = await IngestionService.ingest_pdf(
                file_bytes=content,
                filename=file.filename,
                workspace_id=target_project_id
            )
            results.append(PaperUploadResponse(**ingestion_res))
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process '{file.filename}': {str(exc)}"
            )

    return results

@router.post("/{paper_id}/process", status_code=status.HTTP_202_ACCEPTED)
def process_paper(
    paper_id: str,
    background_tasks: BackgroundTasks,
    force_retry: bool = Query(False, description="Force re-processing if already completed or failed")
):
    """
    Triggers background PDF processing, layout extraction, and sentence-bounded passage segmentation.
    Includes concurrency lock protection against duplicate concurrent processing.
    """
    # Check paper exists
    p_res = supabase.table("papers").select("id, total_pages").eq("id", paper_id).execute()
    if not p_res.data:
        raise HTTPException(status_code=404, detail="Paper not found")

    total_pages = p_res.data[0].get("total_pages") or 1

    # Try acquiring processing lock
    acquired = ProcessingTracker.start_job(paper_id, total_pages=total_pages)
    if not acquired:
        if not force_retry:
            raise HTTPException(
                status_code=409,
                detail="Paper is currently being processed by another worker. Please wait."
            )
        else:
            # Force reset job state
            ProcessingTracker.fail_job(paper_id, "Aborted by forced retry request")
            ProcessingTracker.start_job(paper_id, total_pages=total_pages)

    # Spawn background worker
    background_tasks.add_task(PassageService.process_paper_pipeline, paper_id)

    return {
        "paper_id": paper_id,
        "status": "processing",
        "message": "Background PDF processing pipeline initiated.",
        "polling_endpoint": f"/api/papers/{paper_id}/processing-status"
    }

@router.get("/{paper_id}/processing-status", response_model=ProcessingStatusResponse)
def get_paper_processing_status(paper_id: str):
    """
    Polls real-time progress and phase of paper processing.
    """
    status_data = ProcessingTracker.get_status(paper_id)
    return ProcessingStatusResponse(**status_data)

@router.get("/{paper_id}/passages", response_model=PassagesListResponse)
def get_paper_passages(
    paper_id: str,
    page: Optional[int] = Query(None, description="Filter by page number"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """
    Returns segmented passages for a paper with pagination, section headings, and extraction method.
    """
    # Verify paper exists
    p_check = supabase.table("papers").select("id").eq("id", paper_id).execute()
    if not p_check.data:
        raise HTTPException(status_code=404, detail="Paper not found")

    res = PassageService.get_passages_for_paper(paper_id=paper_id, page=page, limit=limit, offset=offset)
    return PassagesListResponse(**res)

@router.get("/{paper_id}", response_model=PaperDetailResponse)
def get_paper(paper_id: str):
    try:
        p_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
        if not p_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")
        
        paper = p_res.data[0]

        # Fetch sections
        sec_res = supabase.table("paper_sections").select("*").eq("paper_id", paper_id).order("order_index").execute()
        sections = sec_res.data or []

        # Count chunks
        count_res = supabase.table("document_chunks").select("id", count="exact").eq("paper_id", paper_id).execute()
        chunk_count = count_res.count if count_res.count is not None else 0

        orig_fn = paper.get("original_filename") or (paper.get("metadata_json") or {}).get("original_filename") or f"{paper.get('title')}.pdf"

        return {
            **paper,
            "original_filename": orig_fn,
            "storage_path": paper.get("file_path"),
            "file_size": paper.get("file_size_bytes"),
            "status": paper.get("processing_status"),
            "page_count": paper.get("total_pages"),
            "mime_type": "application/pdf",
            "sections": sections,
            "chunk_count": chunk_count
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("/{paper_id}/chunks")
def get_paper_chunks(
    paper_id: str,
    page: Optional[int] = Query(None, description="Filter by page number"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    try:
        query = supabase.table("document_chunks").select("id, chunk_index, content, clean_text, page_number, bounding_box, token_count, section_id").eq("paper_id", paper_id)
        if page is not None:
            query = query.eq("page_number", page)
        
        res = query.order("chunk_index").range(offset, offset + limit - 1).execute()
        return {
            "paper_id": paper_id,
            "count": len(res.data or []),
            "limit": limit,
            "offset": offset,
            "chunks": res.data or []
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

@router.get("/{paper_id}/pdf-url", response_model=SignedUrlResponse)
def get_paper_pdf_url(
    paper_id: str,
    expires_in: int = Query(3600, ge=60, le=86400),
    user: Optional[AuthUser] = Depends(get_optional_user)
):
    try:
        # Check workspace ownership if paper is associated with a user-scoped project
        try:
            wp_res = supabase.table("workspace_papers").select("workspace_id").eq("paper_id", paper_id).execute()
            for row in (wp_res.data or []):
                verify_project_ownership(row["workspace_id"], user)
        except HTTPException:
            raise
        except Exception:
            pass

        p_res = supabase.table("papers").select("file_path").eq("id", paper_id).execute()
        if not p_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")

        file_path = p_res.data[0]["file_path"]
        
        signed_res = supabase.storage.from_("papers").create_signed_url(file_path, expires_in)
        signed_url = signed_res.get("signedURL") or signed_res.get("signedUrl")
        if not signed_url:
            raise HTTPException(status_code=500, detail="Failed to generate signed URL for PDF")

        return {
            "paper_id": paper_id,
            "signed_url": signed_url,
            "expires_in_seconds": expires_in
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Storage error: {str(exc)}")

@router.post("/{paper_id}/intelligence", response_model=PaperIntelligenceResponse)
def generate_paper_intelligence(
    paper_id: str,
    force_regenerate: bool = Query(False, description="Force re-extraction of paper intelligence")
):
    """
    Triggers structured Paper Intelligence extraction across 7 core research dimensions.
    All evidence references are verified against source passages.
    """
    try:
        return PaperIntelligenceService.get_or_generate_intelligence(
            paper_id=paper_id,
            force_regenerate=force_regenerate
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Intelligence extraction failed: {str(exc)}")

@router.get("/{paper_id}/intelligence", response_model=PaperIntelligenceResponse)
def get_paper_intelligence(paper_id: str):
    """
    Retrieves the structured intelligence profile for a paper with verified evidence citations.
    """
    intel = PaperIntelligenceService.get_paper_intelligence(paper_id)
    if not intel:
        try:
            return PaperIntelligenceService.generate_paper_intelligence(paper_id=paper_id)
        except ValueError as val_err:
            raise HTTPException(status_code=404, detail=str(val_err))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to generate intelligence: {str(exc)}")
    return intel

@router.delete("/{paper_id}", status_code=status.HTTP_200_OK)
def delete_paper(paper_id: str):
    try:
        p_res = supabase.table("papers").select("file_path").eq("id", paper_id).execute()
        if not p_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")
        
        file_path = p_res.data[0]["file_path"]

        # Delete database record (cascades to chunks, sections, passages, workspace links)
        supabase.table("papers").delete().eq("id", paper_id).execute()

        # Delete storage object
        try:
            supabase.storage.from_("papers").remove([file_path])
        except Exception:
            pass

        return {"message": "Paper deleted successfully", "id": paper_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Deletion error: {str(exc)}")
