"""
VERITAS — Phase 6: Claim Decomposition Routes
Exposes REST endpoints for decomposing summary and synthesis outputs into atomic claims,
querying claims by output ID, and retrieving individual claim records.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
try:
    from ..supabase_client import supabase
    from ..models.claim import (
        AtomicClaim,
        DecomposeClaimsRequest,
        OutputClaimsResponse,
    )
    from ..services.claim_service import ClaimDecompositionService
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.claim import (
        AtomicClaim,
        DecomposeClaimsRequest,
        OutputClaimsResponse,
    )
    from services.claim_service import ClaimDecompositionService

router = APIRouter(tags=["Claim Verification Center"])


@router.post("/api/claims/decompose", response_model=OutputClaimsResponse, status_code=status.HTTP_201_CREATED)
def decompose_claims(payload: DecomposeClaimsRequest):
    """
    Transforms a research summary or cross-paper synthesis output into atomic,
    individually verifiable propositions while strictly preserving original paragraph
    and sentence order.
    """
    try:
        return ClaimDecompositionService.decompose_output(
            output_id=payload.output_id,
            project_id=payload.project_id,
            original_text=payload.original_text,
            paper_ids=payload.paper_ids,
            force_regenerate=payload.force_regenerate
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Claim decomposition failed: {str(exc)}")


@router.get("/api/outputs/{output_id}/claims", response_model=OutputClaimsResponse)
def get_output_claims(output_id: str):
    """
    Retrieves all decomposed atomic claims for a specific output ID,
    including paragraph and sentence structures.
    """
    result = ClaimDecompositionService.get_output_claims(output_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"No claims found for output '{output_id}'. Please decompose first.")
    return result


@router.get("/api/claims/{claim_id}", response_model=AtomicClaim)
def get_claim(claim_id: str):
    """
    Retrieves a single atomic claim proposition by its unique UUID.
    """
    claim = ClaimDecompositionService.get_claim(claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail=f"Claim '{claim_id}' not found.")
    return claim
