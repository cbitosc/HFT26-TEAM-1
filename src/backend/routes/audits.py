"""
VERITAS — Phase 9: Advanced Research Audit Routes
Exposes endpoints for the Numerical Truth Detector, Overgeneralization Detector,
Research Gap Explorer, and Evidence Provenance Ledger.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from supabase_client import supabase

try:
    from ..models.audit import (
        NumericalAuditResult,
        OvergeneralizationAuditResult,
        ProjectGapsResponse,
        GenerateGapsRequest,
        ProjectLedgerResponse
    )
    from ..services.audit_service import AuditService
except (ImportError, ValueError):
    from models.audit import (
        NumericalAuditResult,
        OvergeneralizationAuditResult,
        ProjectGapsResponse,
        GenerateGapsRequest,
        ProjectLedgerResponse
    )
    from services.audit_service import AuditService

router = APIRouter(tags=["Research Audit & Provenance Ledger"])


class AuditClaimRequest(BaseModel):
    claim_id: str
    project_id: str


@router.post("/api/audit/numerical", response_model=NumericalAuditResult)
def audit_claim_numerical(payload: AuditClaimRequest):
    """
    Executes the Numerical Truth Detector: deterministically parses numbers, units,
    metrics, baselines, and relative vs. percentage-point differences using Decimal precision.
    """
    try:
        return AuditService.audit_claim_numerics(
            claim_id=payload.claim_id,
            project_id=payload.project_id
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Numerical audit failed: {str(exc)}")


@router.post("/api/audit/overgeneralization", response_model=OvergeneralizationAuditResult)
def audit_claim_overgeneralization(payload: AuditClaimRequest):
    """
    Executes the Overgeneralization Detector: flags universal scope overreach,
    benchmark-to-real-world inflation, or correlation-as-causation fallacies.
    """
    try:
        return AuditService.audit_claim_overgeneralization(
            claim_id=payload.claim_id,
            project_id=payload.project_id
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Overgeneralization audit failed: {str(exc)}")


@router.post("/api/gaps/generate", response_model=ProjectGapsResponse, status_code=status.HTTP_201_CREATED)
def generate_research_gaps(payload: GenerateGapsRequest):
    """
    Discovers evidence-backed research gaps and suggested future questions grounded
    strictly in author-stated limitations across project papers.
    """
    try:
        return AuditService.generate_research_gaps(
            project_id=payload.project_id,
            paper_ids=payload.paper_ids,
            focus_area=payload.focus_area
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research gap generation failed: {str(exc)}")


@router.get("/api/projects/{project_id}/gaps", response_model=ProjectGapsResponse)
def get_project_gaps(project_id: str):
    """
    Retrieves previously discovered research gaps for a project workspace.
    """
    gaps = AuditService.get_project_gaps(project_id)
    if not gaps:
        # Generate on the fly if papers exist
        try:
            return AuditService.generate_research_gaps(project_id)
        except Exception:
            raise HTTPException(status_code=404, detail=f"No research gaps found for project '{project_id}'.")
    return gaps


@router.get("/api/projects/{project_id}/ledger", response_model=ProjectLedgerResponse)
def get_project_ledger(project_id: str):
    """
    Retrieves the complete append-only Provenance Ledger for a research workspace,
    tracing: Paper -> Passage -> Output -> Claim -> Retrieval -> Verification -> Audit.
    """
    # Verify project exists
    ws_res = supabase.table("research_workspaces").select("id").eq("id", project_id).execute()
    if not ws_res.data:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    return AuditService.get_project_ledger(project_id)

