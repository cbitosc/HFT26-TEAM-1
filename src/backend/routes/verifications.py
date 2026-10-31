"""
VERITAS — Phase 7: Verification API Routes
Exposes REST endpoints for single-claim and batch-claim evidence verification,
retrieving cited evidence, and aggregating workspace verification summaries.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from supabase_client import supabase

try:
    from ..models.verification import (
        ClaimVerificationResult,
        VerifyClaimRequest,
        VerifyBatchRequest,
        VerifyBatchResponse,
        ProjectVerificationSummary,
        CitedEvidencePassage
    )
    from ..services.verifier_service import ClaimVerifierService
except (ImportError, ValueError):
    from models.verification import (
        ClaimVerificationResult,
        VerifyClaimRequest,
        VerifyBatchRequest,
        VerifyBatchResponse,
        ProjectVerificationSummary,
        CitedEvidencePassage
    )
    from services.verifier_service import ClaimVerifierService

router = APIRouter(tags=["Evidence Verification Engine"])


@router.post("/api/claims/verify", response_model=ClaimVerificationResult, status_code=status.HTTP_200_OK)
def verify_claim(payload: VerifyClaimRequest):
    """
    Retrieves evidence passages via hybrid RRF search, validates citations deterministically,
    and returns a tri-state verdict: Supported, Contradicted, or Unresolved.
    """
    try:
        return ClaimVerifierService.verify_claim(
            claim_id=payload.claim_id,
            project_id=payload.project_id,
            paper_ids=payload.paper_ids,
            force_regenerate=payload.force_regenerate
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Claim verification failed: {str(exc)}")


@router.post("/api/claims/verify-batch", response_model=VerifyBatchResponse, status_code=status.HTTP_200_OK)
def verify_batch(payload: VerifyBatchRequest):
    """
    Executes batch verification across multiple atomic claims with individual failure isolation.
    """
    try:
        successful, failed, results = ClaimVerifierService.verify_batch(
            claim_ids=payload.claim_ids,
            project_id=payload.project_id,
            paper_ids=payload.paper_ids
        )
        return VerifyBatchResponse(
            total_claims=len(payload.claim_ids),
            successful=successful,
            failed=failed,
            results=results
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch verification failed: {str(exc)}")


@router.get("/api/claims/{claim_id}/verification", response_model=ClaimVerificationResult)
def get_claim_verification(claim_id: str):
    """
    Retrieves the persisted verification verdict, reasoning, and evidence strength for a claim.
    """
    res = ClaimVerifierService.get_claim_verification(claim_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"No verification record found for claim '{claim_id}'.")
    return res


@router.get("/api/claims/{claim_id}/evidence", response_model=List[CitedEvidencePassage])
def get_claim_evidence(claim_id: str):
    """
    Retrieves all validated evidence citations, verbatim quotes, and passage links for a claim.
    """
    res = ClaimVerifierService.get_claim_verification(claim_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"No verification record found for claim '{claim_id}'.")
    return res.cited_evidence


@router.get("/api/projects/{project_id}/verification-summary", response_model=ProjectVerificationSummary)
def get_project_verification_summary(project_id: str):
    """
    Aggregates project-wide verification metrics: total claims, verified, supported,
    contradicted, unresolved, and overall faithfulness rate.
    """
    # Verify project exists
    ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
    if not ws_res.data:
        raise HTTPException(status_code=404, detail=f"Research project '{project_id}' not found.")

    return ClaimVerifierService.get_project_summary(project_id)
