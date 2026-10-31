import re
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from supabase_client import supabase
from services.passage_service import PassageService
from services.intelligence_service import PaperIntelligenceService
from services.evidence_validator import EvidenceValidator
from models.summary import (
    SummaryType,
    StatementRelationship,
    SummaryStatement,
    SummarySection,
    SummaryResponse,
    ProjectSummariesListResponse
)

logger = logging.getLogger("veritas.summary")

class SummaryService:
    MODEL_NAME = "veritas-grounded-summary-v1"
    PROMPT_VERSION = "v1.0.0"

    @classmethod
    def generate_summary(
        cls,
        paper_id: str,
        summary_type: SummaryType = "detailed",
        project_id: Optional[str] = None,
        custom_focus: Optional[str] = None
    ) -> SummaryResponse:
        """
        Executes the evidence-grounded summary generation pipeline:
        1. Fetch paper metadata & passages.
        2. Fetch or generate structured Paper Intelligence.
        3. Synthesize claim-level factual statements with exact passage citations.
        4. Validate every citation using EvidenceValidator.
        5. Format full prose according to summary_type (short, detailed, structured_academic).
        6. Persist to outputs table (with dual-persistence fallback).
        """
        # 1. Fetch Paper
        p_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
        if not p_res.data:
            raise ValueError(f"Paper '{paper_id}' not found.")
        paper = p_res.data[0]

        # Resolve project_id
        if not project_id:
            link_res = supabase.table("workspace_papers").select("workspace_id").eq("paper_id", paper_id).limit(1).execute()
            if link_res.data:
                project_id = link_res.data[0]["workspace_id"]

        # 2. Fetch Passages
        passages_data = PassageService.get_passages_for_paper(paper_id=paper_id, limit=200)
        passages = passages_data.get("passages", [])
        if not passages:
            raise ValueError(f"No segmented passages found for paper '{paper_id}'. Process PDF first.")

        passages_by_id = {p["id"]: p for p in passages}

        # 3. Fetch Paper Intelligence
        intel = PaperIntelligenceService.get_or_generate_intelligence(paper_id=paper_id, project_id=project_id)

        # 4. Synthesize Statements & Format by Type
        if summary_type == "short":
            title = f"Concise Research Overview: {paper.get('title')}"
            sections, statements = cls._build_short_summary(paper, intel, passages_by_id)
        elif summary_type == "structured_academic":
            title = f"Structured Literature Review Summary: {paper.get('title')}"
            sections, statements = cls._build_academic_summary(paper, intel, passages_by_id)
        else:  # detailed
            title = f"Detailed Research Analysis: {paper.get('title')}"
            sections, statements = cls._build_detailed_summary(paper, intel, passages_by_id)

        # 5. Deterministic Validation of Statements
        verified_count = 0
        for s in statements:
            if s.supporting_passage_id and s.exact_quote:
                target_p = passages_by_id.get(s.supporting_passage_id)
                if target_p:
                    p_text = target_p.get("text") or target_p.get("content") or ""
                    is_valid, score, _ = EvidenceValidator.verify_quotation(s.exact_quote, p_text)
                    s.is_verified = is_valid
                    s.match_score = score
                    if is_valid:
                        verified_count += 1
                        s.relationship = "direct_support"
                    else:
                        s.relationship = "unresolved"
                else:
                    s.is_verified = False
                    s.match_score = 0.0
                    s.relationship = "unresolved"
            else:
                s.is_verified = False
                s.relationship = "cautious_inference"

        total_statements = len(statements)
        faithfulness = (verified_count / total_statements) if total_statements > 0 else 1.0

        # Build full markdown content string
        content_lines = [f"# {title}\n"]
        for sec in sections:
            content_lines.append(f"## {sec.heading}\n\n{sec.content}\n")
        full_content = "\n".join(content_lines)

        now_str = datetime.now(timezone.utc).isoformat()
        summary_id = str(uuid.uuid4())

        source_refs = [
            {
                "statement_id": s.id,
                "passage_id": s.supporting_passage_id,
                "page_number": s.page_number,
                "exact_quote": s.exact_quote,
                "relationship": s.relationship,
                "is_verified": s.is_verified
            }
            for s in statements if s.supporting_passage_id
        ]

        response = SummaryResponse(
            id=summary_id,
            paper_id=paper_id,
            project_id=project_id,
            title=title,
            summary_type=summary_type,
            content=full_content,
            sections=sections,
            statements=statements,
            model_name=cls.MODEL_NAME,
            prompt_version=cls.PROMPT_VERSION,
            source_references=source_refs,
            total_statements=total_statements,
            verified_statements=verified_count,
            faithfulness_rate=round(faithfulness, 4),
            created_at=now_str,
            updated_at=now_str
        )

        # 6. Dual-Persistence
        cls._persist_summary(response, paper)
        return response

    @classmethod
    def get_summary(cls, summary_id: str) -> Optional[SummaryResponse]:
        """Fetches a saved summary by ID from outputs table or paper metadata."""
        # Try outputs table
        try:
            res = supabase.table("outputs").select("*").eq("id", summary_id).execute()
            if res.data and len(res.data) > 0:
                row = res.data[0]
                return cls._row_to_response(row)
        except Exception:
            pass

        # Try paper metadata fallback
        try:
            p_res = supabase.table("papers").select("metadata_json").execute()
            for p in (p_res.data or []):
                meta = p.get("metadata_json") or {}
                saved = meta.get("saved_summaries") or []
                for s in saved:
                    if s.get("id") == summary_id:
                        return SummaryResponse(**s)
        except Exception:
            pass

        return None

    @classmethod
    def get_project_summaries(cls, project_id: str) -> ProjectSummariesListResponse:
        """Retrieves all saved summaries for a given research workspace."""
        summaries: List[SummaryResponse] = []

        # 1. Try outputs table
        try:
            res = supabase.table("outputs").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
            if res.data:
                for row in res.data:
                    summaries.append(cls._row_to_response(row))
                return ProjectSummariesListResponse(
                    project_id=project_id,
                    total_summaries=len(summaries),
                    summaries=summaries
                )
        except Exception:
            pass

        # 2. Resilient fallback: find papers in project and retrieve metadata saved_summaries
        try:
            links = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).execute()
            paper_ids = [l["paper_id"] for l in (links.data or [])]
            for pid in paper_ids:
                p_res = supabase.table("papers").select("metadata_json").eq("id", pid).execute()
                if p_res.data:
                    meta = p_res.data[0].get("metadata_json") or {}
                    for item in meta.get("saved_summaries", []):
                        summaries.append(SummaryResponse(**item))
        except Exception as e:
            logger.error(f"Error fetching project summaries fallback: {e}")

        return ProjectSummariesListResponse(
            project_id=project_id,
            total_summaries=len(summaries),
            summaries=summaries
        )

    @classmethod
    def delete_summary(cls, summary_id: str) -> bool:
        """Deletes a saved summary record from database and metadata."""
        deleted = False
        try:
            supabase.table("outputs").delete().eq("id", summary_id).execute()
            deleted = True
        except Exception:
            pass

        # Clean from paper metadata
        try:
            p_res = supabase.table("papers").select("id, metadata_json").execute()
            for p in (p_res.data or []):
                meta = p.get("metadata_json") or {}
                saved = meta.get("saved_summaries") or []
                updated = [s for s in saved if s.get("id") != summary_id]
                if len(updated) != len(saved):
                    meta["saved_summaries"] = updated
                    supabase.table("papers").update({"metadata_json": meta}).eq("id", p["id"]).execute()
                    deleted = True
        except Exception:
            pass

        return deleted

    # =========================================================================
    # SUMMARY BUILDERS WITH STATEMENT PROVENANCE
    # =========================================================================

    @classmethod
    def _build_short_summary(
        cls,
        paper: Dict[str, Any],
        intel: Any,
        passages_map: Dict[str, Dict[str, Any]]
    ) -> Tuple[List[SummarySection], List[SummaryStatement]]:
        statements: List[SummaryStatement] = []

        # Statement 1: Objective
        obj_ref = intel.research_objective.evidence[0] if intel.research_objective.evidence else None
        s1 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"The paper addresses the challenge of {intel.research_objective.problem_statement.rstrip('.')}, asking: {intel.research_objective.research_question}",
            source_paper_id=paper["id"],
            supporting_passage_id=obj_ref.passage_id if obj_ref else None,
            exact_quote=obj_ref.supporting_quote if obj_ref else None,
            page_number=obj_ref.page_number if obj_ref else 1,
            relationship="direct_support" if obj_ref else "cautious_inference"
        )
        statements.append(s1)

        # Statement 2: Methodology
        meth_ref = intel.methodology.evidence[0] if intel.methodology.evidence else None
        tech_str = ", ".join(intel.methodology.models_and_techniques[:3])
        s2 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"Methodologically, the study employs {intel.methodology.research_design.lower()} using {tech_str}.",
            source_paper_id=paper["id"],
            supporting_passage_id=meth_ref.passage_id if meth_ref else None,
            exact_quote=meth_ref.supporting_quote if meth_ref else None,
            page_number=meth_ref.page_number if meth_ref else 1,
            relationship="direct_support" if meth_ref else "cautious_inference"
        )
        statements.append(s2)

        # Statement 3: Empirical findings
        find_ref = intel.key_findings[0].evidence[0] if (intel.key_findings and intel.key_findings[0].evidence) else None
        finding_text = intel.key_findings[0].finding if intel.key_findings else "demonstrating empirical viability."
        s3 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"Empirical evaluation shows that {finding_text.rstrip('.')}.",
            source_paper_id=paper["id"],
            supporting_passage_id=find_ref.passage_id if find_ref else None,
            exact_quote=find_ref.supporting_quote if find_ref else None,
            page_number=find_ref.page_number if find_ref else 2,
            relationship="direct_support" if find_ref else "cautious_inference"
        )
        statements.append(s3)

        # Statement 4: Limitations
        lim_ref = intel.limitations.evidence[0] if intel.limitations.evidence else None
        lim_text = intel.limitations.author_reported_limitations[0] if intel.limitations.author_reported_limitations else "Constraints apply to scope."
        s4 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"A key reported limitation is that {lim_text.rstrip('.')}.",
            source_paper_id=paper["id"],
            supporting_passage_id=lim_ref.passage_id if lim_ref else None,
            exact_quote=lim_ref.supporting_quote if lim_ref else None,
            page_number=lim_ref.page_number if lim_ref else 2,
            relationship="direct_support" if lim_ref else "cautious_inference"
        )
        statements.append(s4)

        sec1 = SummarySection(
            heading="Executive Overview",
            content=f"{s1.statement_text} [1] {s2.statement_text} [2]\n\n{s3.statement_text} [3] {s4.statement_text} [4]",
            statements=[s1, s2, s3, s4]
        )

        return [sec1], statements

    @classmethod
    def _build_detailed_summary(
        cls,
        paper: Dict[str, Any],
        intel: Any,
        passages_map: Dict[str, Dict[str, Any]]
    ) -> Tuple[List[SummarySection], List[SummaryStatement]]:
        sections: List[SummarySection] = []
        all_statements: List[SummaryStatement] = []

        # 1. Research Problem & Objective
        obj_refs = intel.research_objective.evidence
        s_obj1 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"The primary problem investigated is: {intel.research_objective.problem_statement}",
            source_paper_id=paper["id"],
            supporting_passage_id=obj_refs[0].passage_id if len(obj_refs) > 0 else None,
            exact_quote=obj_refs[0].supporting_quote if len(obj_refs) > 0 else None,
            page_number=obj_refs[0].page_number if len(obj_refs) > 0 else 1,
            relationship="direct_support" if len(obj_refs) > 0 else "cautious_inference"
        )
        s_obj2 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"The authors formulate the central research question as follows: {intel.research_objective.research_question}",
            source_paper_id=paper["id"],
            supporting_passage_id=obj_refs[1].passage_id if len(obj_refs) > 1 else (obj_refs[0].passage_id if len(obj_refs) > 0 else None),
            exact_quote=obj_refs[1].supporting_quote if len(obj_refs) > 1 else (obj_refs[0].supporting_quote if len(obj_refs) > 0 else None),
            page_number=obj_refs[1].page_number if len(obj_refs) > 1 else 1,
            relationship="direct_support" if len(obj_refs) > 1 else "cautious_inference"
        )
        sec_obj = SummarySection(
            heading="1. Research Problem & Objective",
            content=f"{s_obj1.statement_text} [p.{s_obj1.page_number or 1}]\n\n{s_obj2.statement_text} [p.{s_obj2.page_number or 1}]",
            statements=[s_obj1, s_obj2]
        )
        sections.append(sec_obj)
        all_statements.extend([s_obj1, s_obj2])

        # 2. Methodology & Design
        meth_refs = intel.methodology.evidence
        s_meth1 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"The study uses an architectural framework classified as {intel.methodology.research_design}, incorporating models: {', '.join(intel.methodology.models_and_techniques[:4])}.",
            source_paper_id=paper["id"],
            supporting_passage_id=meth_refs[0].passage_id if len(meth_refs) > 0 else None,
            exact_quote=meth_refs[0].supporting_quote if len(meth_refs) > 0 else None,
            page_number=meth_refs[0].page_number if len(meth_refs) > 0 else 1,
            relationship="direct_support" if len(meth_refs) > 0 else "cautious_inference"
        )
        s_meth2 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"Procedural specifications and baseline comparisons: {intel.methodology.procedural_details}",
            source_paper_id=paper["id"],
            supporting_passage_id=meth_refs[1].passage_id if len(meth_refs) > 1 else (meth_refs[0].passage_id if len(meth_refs) > 0 else None),
            exact_quote=meth_refs[1].supporting_quote if len(meth_refs) > 1 else (meth_refs[0].supporting_quote if len(meth_refs) > 0 else None),
            page_number=meth_refs[1].page_number if len(meth_refs) > 1 else 1,
            relationship="direct_support" if len(meth_refs) > 1 else "cautious_inference"
        )
        sec_meth = SummarySection(
            heading="2. Methodology & Experimental Design",
            content=f"{s_meth1.statement_text} [p.{s_meth1.page_number or 1}]\n\n{s_meth2.statement_text} [p.{s_meth2.page_number or 1}]",
            statements=[s_meth1, s_meth2]
        )
        sections.append(sec_meth)
        all_statements.extend([s_meth1, s_meth2])

        # 3. Dataset & Empirical Setup
        data_refs = intel.dataset_information.evidence
        s_data1 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"Empirical experiments are conducted on benchmark dataset: {intel.dataset_information.dataset_name} (Sample size: {intel.dataset_information.sample_size}).",
            source_paper_id=paper["id"],
            supporting_passage_id=data_refs[0].passage_id if len(data_refs) > 0 else None,
            exact_quote=data_refs[0].supporting_quote if len(data_refs) > 0 else None,
            page_number=data_refs[0].page_number if len(data_refs) > 0 else 2,
            relationship="direct_support" if len(data_refs) > 0 else "cautious_inference"
        )
        sec_data = SummarySection(
            heading="3. Dataset & Evaluation Setup",
            content=f"{s_data1.statement_text} [p.{s_data1.page_number or 2}]",
            statements=[s_data1]
        )
        sections.append(sec_data)
        all_statements.append(s_data1)

        # 4. Key Findings & Reported Metrics
        sec_metrics_stmts: List[SummaryStatement] = []
        sec_metrics_lines: List[str] = []

        for m in intel.metrics[:3]:
            m_ref = m.evidence[0] if m.evidence else None
            sm = SummaryStatement(
                id=str(uuid.uuid4()),
                statement_text=f"Reported {m.metric_name}: {m.reported_value} {m.unit or ''} under condition: {m.experimental_condition or 'standard test'}.",
                source_paper_id=paper["id"],
                supporting_passage_id=m_ref.passage_id if m_ref else None,
                exact_quote=m_ref.supporting_quote if m_ref else None,
                page_number=m_ref.page_number if m_ref else 2,
                relationship="direct_support" if m_ref else "cautious_inference"
            )
            sec_metrics_stmts.append(sm)
            sec_metrics_lines.append(f"- {sm.statement_text} [p.{sm.page_number or 2}]")

        for f in intel.key_findings[:2]:
            f_ref = f.evidence[0] if f.evidence else None
            sf = SummaryStatement(
                id=str(uuid.uuid4()),
                statement_text=f"Principal takeaway ({f.finding_type}): {f.finding}",
                source_paper_id=paper["id"],
                supporting_passage_id=f_ref.passage_id if f_ref else None,
                exact_quote=f_ref.supporting_quote if f_ref else None,
                page_number=f_ref.page_number if f_ref else 2,
                relationship="direct_support" if f_ref else "cautious_inference"
            )
            sec_metrics_stmts.append(sf)
            sec_metrics_lines.append(f"- {sf.statement_text} [p.{sf.page_number or 2}]")

        sec_findings = SummarySection(
            heading="4. Empirical Findings & Metric Verification",
            content="\n".join(sec_metrics_lines) if sec_metrics_lines else "Findings demonstrate empirical baseline achievement.",
            statements=sec_metrics_stmts
        )
        sections.append(sec_findings)
        all_statements.extend(sec_metrics_stmts)

        # 5. Author Limitations & Future Work
        lim_refs = intel.limitations.evidence
        s_lim1 = SummaryStatement(
            id=str(uuid.uuid4()),
            statement_text=f"Author-reported limitation: {intel.limitations.author_reported_limitations[0] if intel.limitations.author_reported_limitations else 'Limitations not explicitly disclosed.'}",
            source_paper_id=paper["id"],
            supporting_passage_id=lim_refs[0].passage_id if len(lim_refs) > 0 else None,
            exact_quote=lim_refs[0].supporting_quote if len(lim_refs) > 0 else None,
            page_number=lim_refs[0].page_number if len(lim_refs) > 0 else 2,
            relationship="direct_support" if len(lim_refs) > 0 else "cautious_inference"
        )
        sec_lim = SummarySection(
            heading="5. Limitations & Future Research",
            content=f"{s_lim1.statement_text} [p.{s_lim1.page_number or 2}]\n\nFuture Work: {'; '.join(intel.limitations.future_work)}",
            statements=[s_lim1]
        )
        sections.append(sec_lim)
        all_statements.append(s_lim1)

        return sections, all_statements

    @classmethod
    def _build_academic_summary(
        cls,
        paper: Dict[str, Any],
        intel: Any,
        passages_map: Dict[str, Dict[str, Any]]
    ) -> Tuple[List[SummarySection], List[SummaryStatement]]:
        # Structured for literature review preparation
        detailed_sections, statements = cls._build_detailed_summary(paper, intel, passages_map)
        academic_sections = [
            SummarySection(
                heading="Literature Review Synthesis Matrix",
                content=f"**Citation:** {paper.get('title')} ({paper.get('publication_year') or 'n.d.'})\n**Subdiscipline:** {intel.additional_context.domain}\n**Key Descriptors:** {', '.join(intel.additional_context.keywords)}",
                statements=[]
            )
        ] + detailed_sections
        return academic_sections, statements

    # =========================================================================
    # PERSISTENCE & CONVERSION HELPERS
    # =========================================================================

    @classmethod
    def _persist_summary(cls, summary: SummaryResponse, paper: Dict[str, Any]):
        """Dual persistence into outputs table and paper metadata_json."""
        payload = summary.model_dump()

        # 1. Try outputs table
        try:
            db_record = {
                "id": summary.id,
                "project_id": summary.project_id,
                "paper_id": summary.paper_id,
                "output_type": f"SUMMARY_{summary.summary_type.upper()}",
                "title": summary.title,
                "content": summary.content,
                "sections": [s.model_dump() for s in summary.sections],
                "statements": [s.model_dump() for s in summary.statements],
                "model_name": summary.model_name,
                "prompt_version": summary.prompt_version,
                "source_references": summary.source_references,
                "verification_summary": {
                    "total_statements": summary.total_statements,
                    "verified_statements": summary.verified_statements,
                    "faithfulness_rate": summary.faithfulness_rate
                }
            }
            supabase.table("outputs").insert(db_record).execute()
        except Exception as e:
            logger.warning(f"Could not persist to outputs table ({e}). Storing into metadata_json.")

        # 2. Resilient backup to papers.metadata_json -> 'saved_summaries'
        try:
            meta = paper.get("metadata_json") or {}
            saved = meta.get("saved_summaries") or []
            # Keep up to 10 latest summaries per paper
            saved = [s for s in saved if s.get("id") != summary.id]
            saved.insert(0, payload)
            meta["saved_summaries"] = saved[:10]
            supabase.table("papers").update({"metadata_json": meta}).eq("id", summary.paper_id).execute()
        except Exception as e:
            logger.error(f"Failed to update metadata_json saved_summaries: {e}")

    @classmethod
    def _row_to_response(cls, row: Dict[str, Any]) -> SummaryResponse:
        v_sum = row.get("verification_summary") or {}
        stype = row.get("output_type", "").replace("SUMMARY_", "").lower()
        if stype not in ["short", "detailed", "structured_academic"]:
            stype = "detailed"

        return SummaryResponse(
            id=row["id"],
            paper_id=row.get("paper_id") or "",
            project_id=row.get("project_id"),
            title=row.get("title") or "Research Summary",
            summary_type=stype,
            content=row.get("content") or "",
            sections=[SummarySection(**s) for s in (row.get("sections") or [])],
            statements=[SummaryStatement(**s) for s in (row.get("statements") or [])],
            model_name=row.get("model_name") or cls.MODEL_NAME,
            prompt_version=row.get("prompt_version") or cls.PROMPT_VERSION,
            source_references=row.get("source_references") or [],
            total_statements=v_sum.get("total_statements", 0),
            verified_statements=v_sum.get("verified_statements", 0),
            faithfulness_rate=v_sum.get("faithfulness_rate", 1.0),
            created_at=row.get("created_at") or datetime.now(timezone.utc).isoformat(),
            updated_at=row.get("updated_at") or datetime.now(timezone.utc).isoformat()
        )

