"""
VERITAS — Phase 10: Research Audit Export API Routes
Exposes endpoints for downloading comprehensive scientific research dossiers
in PDF, JSON, CSV, and Markdown academic formats.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import PlainTextResponse, Response

try:
    from ..services.export_service import ExportService
    from ..auth import get_optional_user, verify_project_ownership, AuthUser
except (ImportError, ValueError):
    from services.export_service import ExportService
    from auth import get_optional_user, verify_project_ownership, AuthUser

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["Audit Report Exports"])


@router.get("/dossier")
def get_project_audit_dossier(project_id: str, user: Optional[AuthUser] = Depends(get_optional_user)):
    """Retrieves full structured project audit dossier for in-app inspection."""
    verify_project_ownership(project_id, user)
    try:
        return ExportService.compile_project_dossier(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile audit dossier: {str(e)}")


@router.get("/json")
def download_project_audit_json(project_id: str, user: Optional[AuthUser] = Depends(get_optional_user)):
    """Downloads full research audit report as formatted JSON."""
    verify_project_ownership(project_id, user)
    try:
        content = ExportService.export_json(project_id)
        filename = f"veritas_audit_report_{project_id[:8]}.json"
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate JSON export: {str(e)}")


@router.get("/csv")
def download_project_audit_csv(project_id: str, user: Optional[AuthUser] = Depends(get_optional_user)):
    """Downloads atomic claims and verification verdicts table as CSV spreadsheet."""
    verify_project_ownership(project_id, user)
    try:
        content = ExportService.export_csv(project_id)
        filename = f"veritas_claims_verification_{project_id[:8]}.csv"
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate CSV export: {str(e)}")


@router.get("/markdown")
def download_project_audit_markdown(project_id: str, user: Optional[AuthUser] = Depends(get_optional_user)):
    """Downloads academic peer-review ready research audit dossier in Markdown."""
    verify_project_ownership(project_id, user)
    try:
        content = ExportService.export_markdown(project_id)
        filename = f"veritas_audit_dossier_{project_id[:8]}.md"
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Markdown export: {str(e)}")


@router.get("/pdf")
def download_project_audit_pdf(project_id: str, user: Optional[AuthUser] = Depends(get_optional_user)):
    """Downloads publication-ready PDF audit dossier."""
    verify_project_ownership(project_id, user)
    try:
        pdf_bytes = ExportService.export_pdf(project_id)
        filename = f"veritas_audit_report_{project_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF export: {str(e)}")

