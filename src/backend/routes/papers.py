from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from supabase_client import supabase
from models.paper import PaperDetailResponse, PaperUploadResponse, SignedUrlResponse
from services.ingestion_service import IngestionService

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
        # Validate MIME and extension
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
def get_paper_pdf_url(paper_id: str, expires_in: int = Query(3600, ge=60, le=86400)):
    try:
        p_res = supabase.table("papers").select("file_path").eq("id", paper_id).execute()
        if not p_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")

        file_path = p_res.data[0]["file_path"]
        
        # Generate time-limited signed URL from private storage bucket
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

@router.delete("/{paper_id}", status_code=status.HTTP_200_OK)
def delete_paper(paper_id: str):
    try:
        p_res = supabase.table("papers").select("file_path").eq("id", paper_id).execute()
        if not p_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")
        
        file_path = p_res.data[0]["file_path"]

        # Delete database record (cascades to chunks, sections, workspace links, evidence)
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
