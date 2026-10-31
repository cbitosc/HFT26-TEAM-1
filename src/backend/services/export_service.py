"""
VERITAS — Phase 10: Research Audit Report Export Service
Compiles complete multi-document research audit dossiers and generates
standardized exports in PDF, JSON, CSV, and Markdown academic formats.
"""

import io
import csv
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from ..supabase_client import supabase
    from .claim_service import ClaimDecompositionService
    from .verifier_service import ClaimVerifierService
    from .audit_service import AuditService
    from .matrix_service import MatrixService
except (ImportError, ValueError):
    from supabase_client import supabase
    from services.claim_service import ClaimDecompositionService
    from services.verifier_service import ClaimVerifierService
    from services.audit_service import AuditService
    from services.matrix_service import MatrixService

logger = logging.getLogger(__name__)


class ExportService:
    """
    Assembles evidence-grounded research audit reports across all VERITAS intelligence layers.
    """

    REPORT_VERSION = "2026.1"
    PLATFORM_NAME = "VERITAS — Evidence-First Scientific Research Assistant"

    @classmethod
    def compile_project_dossier(cls, project_id: str) -> Dict[str, Any]:
        """
        Assembles all research assets for the specified project:
        - Project metadata & research question
        - Papers & bibliographic metadata
        - Paper Intelligence structured profiles
        - Summaries & Cross-Paper Syntheses
        - Decomposed Claims & Verification Verdicts
        - Numerical Audits & Scope Overgeneralization Findings
        - Research Gaps (Author-Identified & VERITAS-Synthesized)
        - Provenance Ledger audit trail
        """
        # 1. Fetch Project Metadata
        proj_name = "VERITAS Research Project"
        res_question = "Scientific evidence evaluation and cross-paper synthesis"
        proj_created = datetime.now(timezone.utc).isoformat()

        if not project_id.startswith("test-") and not project_id.startswith("eval-"):
            try:
                p_res = supabase.table("workspaces").select("*").eq("id", project_id).execute()
                if p_res.data and len(p_res.data) > 0:
                    p_row = p_res.data[0]
                    proj_name = p_row.get("name") or proj_name
                    res_question = p_row.get("research_question") or p_row.get("topic") or res_question
                    proj_created = p_row.get("created_at") or proj_created
            except Exception as e:
                logger.debug(f"Workspace fetch skipped: {e}")

        # 2. Fetch Papers
        papers: List[Dict[str, Any]] = []
        if not project_id.startswith("test-") and not project_id.startswith("eval-"):
            try:
                wp_res = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).execute()
                paper_ids = [wp["paper_id"] for wp in (wp_res.data or [])]
                if paper_ids:
                    p_query = supabase.table("papers").select("*").in_("id", paper_ids).execute()
                    papers = p_query.data or []
            except Exception as e:
                logger.debug(f"Papers fetch skipped: {e}")

        # 3. Gather Claims & Verifications
        all_claims: List[Dict[str, Any]] = []
        claims_cache = ClaimDecompositionService._load_cache()
        for out_id, out_data in claims_cache.items():
            if out_data.get("project_id") == project_id:
                all_claims.extend(out_data.get("claims", []))

        # Check DB claims table as fallback
        if not all_claims and not project_id.startswith("test-") and not project_id.startswith("eval-"):
            try:
                db_c = supabase.table("claims").select("*").eq("workspace_id", project_id).execute()
                all_claims = db_c.data or []
            except Exception:
                pass

        # Attach verification & audit details to each claim
        claims_dossier: List[Dict[str, Any]] = []
        supported_count = 0
        contradicted_count = 0
        unresolved_count = 0

        for c in all_claims:
            c_id = c.get("id") or ""
            c_text = c.get("normalized_text") or c.get("claim_text") or c.get("original_text") or ""
            ver = ClaimVerifierService.get_claim_verification(c_id)

            verdict = ver.verdict.value if ver else c.get("verification_status", "Unverified")
            if verdict == "Supported":
                supported_count += 1
            elif verdict == "Contradicted":
                contradicted_count += 1
            else:
                unresolved_count += 1

            # Check for numerical & scope audits
            num_audit = None
            try:
                num_audit = AuditService.audit_claim_numerics(c_id, project_id).model_dump()
            except Exception:
                pass

            overgen_audit = None
            try:
                overgen_audit = AuditService.audit_claim_overgeneralization(c_id, project_id).model_dump()
            except Exception:
                pass

            cited_list: List[Dict[str, Any]] = []
            if ver and ver.cited_evidence:
                for cite in ver.cited_evidence:
                    cited_list.append({
                        "passage_id": cite.passage_id,
                        "paper_id": cite.paper_id,
                        "page_number": cite.page_number,
                        "section_title": cite.section_title,
                        "exact_quote": cite.exact_quote,
                        "is_quote_valid": cite.is_quote_valid,
                        "match_score": cite.quote_match_score,
                        "explanation": cite.explanation
                    })

            claims_dossier.append({
                "claim_id": c_id,
                "category": c.get("category") or "result",
                "text": c_text,
                "is_atomic": c.get("is_atomic", True),
                "verdict": verdict,
                "confidence_score": ver.confidence_score if ver and hasattr(ver, "confidence_score") else 1.0,
                "reasoning": ver.reasoning if ver else "Pending verification.",
                "cited_evidence": cited_list,
                "limitations": ver.limitations if ver else [],
                "numerical_audit": num_audit,
                "overgeneralization_audit": overgen_audit
            })

        # 4. Fetch Research Gaps
        raw_gaps = AuditService.get_project_gaps(project_id)
        gaps_data = raw_gaps.model_dump() if raw_gaps else {"total_gaps": 0, "gaps": []}

        # 5. Fetch Provenance Ledger
        raw_ledger = AuditService.get_project_ledger(project_id, limit=100)
        ledger_data = raw_ledger.model_dump() if raw_ledger else {"total_events": 0, "events": []}

        total_claims = len(claims_dossier)
        faithfulness_rate = (
            round((supported_count) / (total_claims), 4) if total_claims > 0 else 0.0
        )

        return {
            "meta": {
                "platform": cls.PLATFORM_NAME,
                "report_version": cls.REPORT_VERSION,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "project_id": project_id,
                "project_name": proj_name,
                "research_question": res_question,
                "project_created_at": proj_created,
            },
            "statistics": {
                "total_papers": len(papers),
                "total_claims": total_claims,
                "supported_claims": supported_count,
                "contradicted_claims": contradicted_count,
                "unresolved_claims": unresolved_count,
                "faithfulness_rate": faithfulness_rate,
                "total_gaps": gaps_data.get("total_gaps", 0),
                "total_ledger_events": ledger_data.get("total_events", 0)
            },
            "papers": [
                {
                    "id": p.get("id"),
                    "title": p.get("title") or "Untitled Paper",
                    "authors": p.get("authors") or [],
                    "publication_year": p.get("publication_year"),
                    "venue": p.get("venue") or "Academic Conference / Journal",
                    "total_pages": p.get("total_pages") or p.get("page_count") or 1,
                    "abstract": p.get("abstract") or "No abstract extracted."
                }
                for p in papers
            ],
            "claims": claims_dossier,
            "research_gaps": gaps_data.get("gaps", []),
            "provenance_ledger": ledger_data.get("events", [])
        }

    # =========================================================================
    # EXPORT FORMATS
    # =========================================================================

    @classmethod
    def export_json(cls, project_id: str) -> str:
        """Returns JSON audit dossier formatted with indentation."""
        dossier = cls.compile_project_dossier(project_id)
        return json.dumps(dossier, indent=2)

    @classmethod
    def export_csv(cls, project_id: str) -> str:
        """Generates tabular CSV of claims, evidence citations, and audit outcomes."""
        dossier = cls.compile_project_dossier(project_id)
        claims = dossier.get("claims", [])

        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        writer.writerow([
            "Claim ID",
            "Category",
            "Is Atomic",
            "Proposition Text",
            "Verification Verdict",
            "Confidence Score",
            "Reasoning",
            "Cited Paper Title",
            "Page Number",
            "Section Title",
            "Exact Supporting Quote",
            "Verbatim Verified",
            "Numerical Verdict",
            "Calculated Math",
            "Scope Flag",
            "Suggested Narrower Wording"
        ])

        for c in claims:
            num = c.get("numerical_audit") or {}
            over = c.get("overgeneralization_audit") or {}
            cites = c.get("cited_evidence") or []

            num_verdict = num.get("verdict", "")
            calc_math = num.get("calculation_explanation", "")
            scope_flag = over.get("flagged_type", "") if over.get("is_overgeneralized") else "Appropriately Scoped"
            narrow_wording = over.get("suggested_narrower_wording", "")

            if not cites:
                writer.writerow([
                    c.get("claim_id"),
                    c.get("category"),
                    c.get("is_atomic"),
                    c.get("text"),
                    c.get("verdict"),
                    c.get("confidence_score"),
                    c.get("reasoning"),
                    "None cited",
                    "",
                    "",
                    "",
                    "False",
                    num_verdict,
                    calc_math,
                    scope_flag,
                    narrow_wording
                ])
            else:
                for cite in cites:
                    writer.writerow([
                        c.get("claim_id"),
                        c.get("category"),
                        c.get("is_atomic"),
                        c.get("text"),
                        c.get("verdict"),
                        c.get("confidence_score"),
                        c.get("reasoning"),
                        cite.get("paper_id"),
                        cite.get("page_number"),
                        cite.get("section_title"),
                        cite.get("exact_quote"),
                        cite.get("is_quote_valid"),
                        num_verdict,
                        calc_math,
                        scope_flag,
                        narrow_wording
                    ])

        return output.getvalue()

    @classmethod
    def export_markdown(cls, project_id: str) -> str:
        """Generates academic peer-review ready Markdown audit dossier."""
        dossier = cls.compile_project_dossier(project_id)
        meta = dossier["meta"]
        stats = dossier["statistics"]
        papers = dossier["papers"]
        claims = dossier["claims"]
        gaps = dossier["research_gaps"]
        ledger = dossier["provenance_ledger"]

        lines: List[str] = []
        lines.append(f"# VERITAS Scientific Research Audit Dossier")
        lines.append(f"**Project:** {meta['project_name']}  ")
        lines.append(f"**Research Question:** {meta['research_question']}  ")
        lines.append(f"**Audit Generated:** {meta['generated_at']}  ")
        lines.append(f"**Report Specification:** VERITAS v{meta['report_version']}\n")
        lines.append("---\n")

        # Executive Summary
        lines.append("## 1. Executive Summary")
        lines.append(f"This document provides an evidence-first scientific audit for **{meta['project_name']}**.")
        lines.append(f"Across **{stats['total_papers']}** academic research papers, **{stats['total_claims']}** atomic propositions were decomposed and verified against source evidence.")
        lines.append(f"- **Supported Claims:** {stats['supported_claims']} ({round((stats['supported_claims'] / max(stats['total_claims'], 1)) * 100, 1)}%)")
        lines.append(f"- **Contradicted Claims:** {stats['contradicted_claims']} ({round((stats['contradicted_claims'] / max(stats['total_claims'], 1)) * 100, 1)}%)")
        lines.append(f"- **Unresolved Claims (Scientific Abstention):** {stats['unresolved_claims']} ({round((stats['unresolved_claims'] / max(stats['total_claims'], 1)) * 100, 1)}%)\n")

        # Ingested Paper Corpus
        lines.append("## 2. Ingested Research Paper Corpus")
        if not papers:
            lines.append("*No papers recorded in project corpus.*")
        else:
            for p in papers:
                authors_str = ", ".join(p['authors']) if p['authors'] else "Authors not parsed"
                lines.append(f"### {p['title']}")
                lines.append(f"- **Authors:** {authors_str}")
                lines.append(f"- **Venue & Year:** {p['venue']} ({p['publication_year'] or 'Year N/A'})")
                lines.append(f"- **Length:** {p['total_pages']} pages")
                lines.append(f"> **Abstract:** {p['abstract'][:350]}...\n")

        # Claim Verification Table
        lines.append("## 3. Atomic Proposition Verification Table")
        lines.append("| ID | Category | Verdict | Proposition | Exact Source Citation |")
        lines.append("| :--- | :--- | :--- | :--- | :--- |")
        for idx, c in enumerate(claims):
            cid = f"CLM-{idx + 1:02d}"
            cites = c.get("cited_evidence") or []
            quote_str = cites[0]["exact_quote"][:80] + "..." if cites else "No citation"
            lines.append(f"| `{cid}` | {c['category']} | **{c['verdict']}** | {c['text']} | *\"{quote_str}\"* |")
        lines.append("\n")

        # Research Gaps
        lines.append("## 4. Grounded Research Gaps & Future Directions")
        if not gaps:
            lines.append("*No research gaps synthesized.*")
        else:
            for g in gaps:
                lines.append(f"### Gap: {g.get('suggested_research_question')}")
                lines.append(f"- **Origin:** `{g.get('origin_type')}`")
                lines.append(f"- **Grounded Author Limitations:**")
                for lim in g.get("supporting_limitations", []):
                    lines.append(f"  - *\"{lim}\"*")
                if g.get("important_uncertainties"):
                    lines.append(f"- **Critical Uncertainties:** {', '.join(g.get('important_uncertainties'))}")
                lines.append("\n")

        # Provenance Ledger
        lines.append("## 5. Immutable Provenance Ledger (Audit Trail)")
        lines.append("| Timestamp | Event Type | Title | Outcome |")
        lines.append("| :--- | :--- | :--- | :--- |")
        for ev in ledger[:25]:
            lines.append(f"| {ev.get('created_at', '')[:19]} | `{ev.get('event_type')}` | {ev.get('title')} | **{ev.get('validation_outcome')}** |")
        lines.append("\n")

        lines.append("---\n*VERITAS Scientific Audit Report completed with integrity verification.*")
        return "\n".join(lines)

    @classmethod
    def export_pdf(cls, project_id: str) -> bytes:
        """
        Generates a publication-quality PDF audit dossier using PyMuPDF.
        """
        dossier = cls.compile_project_dossier(project_id)
        meta = dossier["meta"]
        stats = dossier["statistics"]
        papers = dossier["papers"]
        claims = dossier["claims"]
        gaps = dossier["research_gaps"]

        doc = fitz.open()

        # Page 1: Academic Cover Page & Executive Summary
        page = doc.new_page(width=595, height=842)  # A4 size in points

        # Title Block
        y = 50
        page.insert_text((50, y), "VERITAS RESEARCH AUDIT REPORT", fontsize=18, fontname="helv", color=(0.07, 0.42, 0.92))
        y += 20
        page.insert_text((50, y), "Evidence-First Scientific Verification Dossier", fontsize=12, fontname="helv", color=(0.2, 0.2, 0.2))
        y += 30
        page.draw_line((50, y), (545, y), color=(0.8, 0.8, 0.8), width=1)
        y += 25

        # Metadata
        page.insert_text((50, y), f"Project Title: {meta['project_name']}", fontsize=11, fontname="helv", color=(0.1, 0.1, 0.1))
        y += 18
        page.insert_text((50, y), f"Research Question: {meta['research_question'][:75]}...", fontsize=10, fontname="helv", color=(0.3, 0.3, 0.3))
        y += 18
        page.insert_text((50, y), f"Generated: {meta['generated_at'][:19]} UTC  |  Platform: VERITAS v{meta['report_version']}", fontsize=9, fontname="helv", color=(0.4, 0.4, 0.4))
        y += 35

        # Executive Summary Box
        page.draw_rect(fitz.Rect(50, y, 545, y + 110), color=(0.85, 0.9, 0.98), fill=(0.95, 0.97, 1.0))
        page.insert_text((65, y + 25), "EXECUTIVE AUDIT SUMMARY", fontsize=11, fontname="helv", color=(0.07, 0.42, 0.92))
        page.insert_text((65, y + 45), f"• Ingested Research Papers: {stats['total_papers']}", fontsize=10, fontname="helv")
        page.insert_text((65, y + 62), f"• Decomposed Atomic Claims: {stats['total_claims']}", fontsize=10, fontname="helv")
        page.insert_text((65, y + 79), f"• Supported: {stats['supported_claims']}  |  Contradicted: {stats['contradicted_claims']}  |  Unresolved (Abstention): {stats['unresolved_claims']}", fontsize=10, fontname="helv")
        page.insert_text((65, y + 96), f"• Overall Evidence Faithfulness Rate: {stats['faithfulness_rate'] * 100:.1f}%", fontsize=10, fontname="helv")
        y += 135

        # Ingested Papers Section
        page.insert_text((50, y), "1. Ingested Research Papers", fontsize=13, fontname="helv", color=(0.1, 0.1, 0.1))
        y += 20

        for p in papers[:4]:
            page.insert_text((55, y), f"• {p['title'][:65]} ({p['publication_year'] or 'Year N/A'})", fontsize=10, fontname="helv", color=(0.15, 0.15, 0.15))
            y += 14
            authors_txt = ", ".join(p['authors'][:3]) if p['authors'] else "Authors N/A"
            page.insert_text((68, y), f"Authors: {authors_txt} | Venue: {p['venue']}", fontsize=8, fontname="helv", color=(0.45, 0.45, 0.45))
            y += 18

        y += 20
        # Claims Section Teaser
        page.insert_text((50, y), "2. Claim Verification & Evidence Grounding", fontsize=13, fontname="helv", color=(0.1, 0.1, 0.1))
        y += 20

        for c in claims[:8]:
            v_color = (0.1, 0.6, 0.3) if c['verdict'] == "Supported" else (0.8, 0.2, 0.2) if c['verdict'] == "Contradicted" else (0.7, 0.5, 0.1)
            page.insert_text((55, y), f"[{c['verdict'].upper()}]", fontsize=8, fontname="helv", color=v_color)
            page.insert_text((130, y), f"{c['text'][:70]}...", fontsize=9, fontname="helv", color=(0.1, 0.1, 0.1))
            y += 16
            cites = c.get("cited_evidence") or []
            if cites:
                page.insert_text((130, y), f"Evidence: \"{cites[0]['exact_quote'][:65]}...\" (p. {cites[0]['page_number']})", fontsize=7.5, fontname="helv", color=(0.4, 0.4, 0.4))
                y += 14

        # Page 2: Advanced Research Audits & Gaps
        page2 = doc.new_page(width=595, height=842)
        y2 = 50
        page2.insert_text((50, y2), "3. Advanced Research Audits & Grounded Gaps", fontsize=13, fontname="helv", color=(0.1, 0.1, 0.1))
        y2 += 25

        page2.insert_text((50, y2), "Synthesized Research Gaps (Strictly Grounded in Author Limitations):", fontsize=10, fontname="helv", color=(0.3, 0.3, 0.3))
        y2 += 20

        for g in gaps[:5]:
            badge = "[AUTHOR]" if g.get("origin_type") == "Author-identified future work" else "[VERITAS]"
            page2.insert_text((55, y2), f"{badge} {g.get('suggested_research_question')[:70]}", fontsize=9.5, fontname="helv", color=(0.07, 0.42, 0.92))
            y2 += 15
            for lim in (g.get("supporting_limitations") or [])[:1]:
                page2.insert_text((68, y2), f"Limitation: \"{lim[:75]}...\"", fontsize=8, fontname="helv", color=(0.35, 0.35, 0.35))
                y2 += 14
            y2 += 8

        y2 += 25
        page2.insert_text((50, y2), "4. Provenance Ledger & Audit Trail", fontsize=13, fontname="helv", color=(0.1, 0.1, 0.1))
        y2 += 20

        for ev in dossier.get("provenance_ledger", [])[:10]:
            page2.insert_text((55, y2), f"{ev.get('created_at', '')[:10]} | {ev.get('event_type')}: {ev.get('title')[:45]} [{ev.get('validation_outcome')}]", fontsize=8, fontname="helv", color=(0.3, 0.3, 0.3))
            y2 += 14

        # Footer
        page2.insert_text((50, 800), "VERITAS Evidence-First Research Audit — Generated automatically with full provenance.", fontsize=8, fontname="helv", color=(0.6, 0.6, 0.6))

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes
