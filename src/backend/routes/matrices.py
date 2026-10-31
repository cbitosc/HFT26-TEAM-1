"""
VERITAS — Phase 8: Evidence Comparison Matrix & Context Routes
Exposes endpoints for generating comparison matrices, fetching adjacent passage context,
and granting validated signed PDF access.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from supabase_client import supabase

try:
    from ..models.matrix import (
        ComparisonMatrixResponse,
        GenerateMatrixRequest,
        PassageContextResponse,
        PdfAccessResponse
    )
    from ..services.matrix_service import MatrixService
except (ImportError, ValueError):
    from models.matrix import (
        ComparisonMatrixResponse,
        GenerateMatrixRequest,
        PassageContextResponse,
        PdfAccessResponse
    )
    from services.matrix_service import MatrixService

router = APIRouter(tags=["Evidence Explorer & Matrices"])


@router.post("/api/matrices/generate", response_model=ComparisonMatrixResponse, status_code=status.HTTP_201_CREATED)
def generate_matrix(payload: GenerateMatrixRequest):
    """
    Generates a source-linked comparison matrix across selected papers and research dimensions.
    Each cell links to a verified passage reference, page number, and exact quote.
    """
    try:
        return MatrixService.generate_matrix(
            project_id=payload.project_id,
            paper_ids=payload.paper_ids,
            dimensions=payload.dimensions,
            title=payload.title
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Matrix generation failed: {str(exc)}")


@router.get("/api/matrices/{matrix_id}", response_model=ComparisonMatrixResponse)
def get_matrix(matrix_id: str):
    """
    Retrieves a saved source-linked comparison matrix by ID.
    """
    matrix = MatrixService.get_matrix(matrix_id)
    if not matrix:
        raise HTTPException(status_code=404, detail=f"Comparison matrix '{matrix_id}' not found.")
    return matrix


@router.get("/api/projects/{project_id}/matrices", response_model=List[ComparisonMatrixResponse])
def get_project_matrices(project_id: str):
    """
    Retrieves all comparison matrices created for a research workspace project.
    """
    # Verify project exists
    ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
    if not ws_res.data:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    return MatrixService.get_project_matrices(project_id)


@router.get("/api/evidence/{passage_id}", response_model=PassageContextResponse)
def get_passage_context(passage_id: str):
    """
    Retrieves an evidence passage along with adjacent preceding and succeeding passages
    to inspect surrounding academic context and prevent out-of-context misinterpretation.
    """
    try:
        return MatrixService.get_passage_context(passage_id)
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching passage context: {str(exc)}")


@router.get("/api/papers/{paper_id}/pdf-access", response_model=PdfAccessResponse)
def get_paper_pdf_access(
    paper_id: str,
    project_id: Optional[str] = Query(None, description="Optional workspace project ID to enforce scope"),
    expires_in: int = Query(3600, ge=60, le=86400)
):
    """
    Validates paper ownership and project scope before generating a temporary signed URL.
    Never exposes permanent or public access to private research storage.
    """
    try:
        return MatrixService.get_pdf_access(
            paper_id=paper_id,
            project_id=project_id,
            expires_in=expires_in
        )
    except PermissionError as perm_err:
        raise HTTPException(status_code=403, detail=str(perm_err))
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF access error: {str(exc)}")
