import re
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from supabase_client import supabase
from services.passage_service import PassageService
from services.intelligence_service import PaperIntelligenceService
from services.evidence_validator import EvidenceValidator
from models.comparison import (
    DisagreementClassification,
    PaperEvidence,
    ComparisonDimensionItem,
    DisagreementItem,
    ConsensusItem,
    SideBySidePaperProfile,
    ComparisonResponse,
    ProjectComparisonsListResponse
)

logger = logging.getLogger("veritas.synthesis")

class SynthesisService:
    MODEL_NAME = "veritas-synthesis-engine-v1"
    PROMPT_VERSION = "v1.0.0"

    @classmethod
    def generate_synthesis(
        cls,
        project_id: str,
        paper_ids: List[str],
        custom_question: Optional[str] = None
    ) -> ComparisonResponse:
        """
        Executes cross-paper synthesis and contextual disagreement analysis:
        1. Validates project membership for all papers.
        2. Retrieves passages & intelligence profiles for each paper.
        3. Builds side-by-side dimensional matrices across 12 research dimensions.
        4. Identifies shared objectives and consensus points.
        5. Performs contextual disagreement analysis (Direct Contradiction vs Contextual Disagreement vs Non-comparable).
        6. Verifies all citations using EvidenceValidator.
        7. Persists synthesis to synthesis_matrices and outputs tables.
        """
        # Step 1: Validate input
        if len(paper_ids) < 2:
            raise ValueError("Cross-paper synthesis requires at least 2 papers.")

        # Verify project exists
        ws_res = supabase.table("research_workspaces").select("*").eq("id", project_id).execute()
        if not ws_res.data:
            raise ValueError(f"Research project '{project_id}' does not exist.")
        project = ws_res.data[0]

        # Verify paper ownership in project
        links_res = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).execute()
        project_paper_ids = {r["paper_id"] for r in (links_res.data or [])}

        for pid in paper_ids:
            if pid not in project_paper_ids:
                raise ValueError(f"Paper '{pid}' does not belong to project '{project_id}'.")

        # Step 2: Fetch Paper Metadata, Passages, and Intelligence
        papers_data: List[Dict[str, Any]] = []
        intelligence_profiles: Dict[str, Any] = {}
        passages_by_paper: Dict[str, Dict[str, Any]] = {}

        for pid in paper_ids:
            p_res = supabase.table("papers").select("*").eq("id", pid).execute()
            if not p_res.data:
                raise ValueError(f"Paper '{pid}' not found.")
            paper = p_res.data[0]
            papers_data.append(paper)

            # Ensure passages exist (process if needed)
            p_pass = PassageService.get_passages_for_paper(paper_id=pid, limit=100)
            if not p_pass.get("passages"):
                logger.info(f"Auto-processing passages for paper {pid} during synthesis...")
                PassageService.process_paper_pipeline(pid)
                p_pass = PassageService.get_passages_for_paper(paper_id=pid, limit=100)

            pass_list = p_pass.get("passages", [])
            passages_by_paper[pid] = {p["id"]: p for p in pass_list}

            # Fetch or generate Paper Intelligence
            intel = PaperIntelligenceService.get_or_generate_intelligence(paper_id=pid, project_id=project_id)
            intelligence_profiles[pid] = intel

        # Step 3: Build Side-by-Side Paper Profiles
        profiles: List[SideBySidePaperProfile] = []
        for paper in papers_data:
            pid = paper["id"]
            intel = intelligence_profiles[pid]
            prof = SideBySidePaperProfile(
                paper_id=pid,
                title=paper.get("title") or "Untitled Paper",
                authors=paper.get("authors") or [],
                year=paper.get("publication_year"),
                objective=intel.research_objective.problem_statement,
                methodology=f"{intel.methodology.research_design} ({', '.join(intel.methodology.models_and_techniques[:3])})",
                models=intel.methodology.models_and_techniques,
                datasets=[intel.dataset_information.dataset_name],
                metrics=[f"{m.metric_name}: {m.reported_value} {m.unit or ''}".strip() for m in intel.metrics[:4]],
                limitations=intel.limitations.author_reported_limitations[:3]
            )
            profiles.append(prof)

        # Step 4: Build 12-Dimension Comparison Matrix
        all_evidence: List[PaperEvidence] = []
        matrix = cls._build_dimension_matrix(papers_data, intelligence_profiles, passages_by_paper, all_evidence)

        # Step 5: Perform Contextual Disagreement Analysis
        disagreements = cls._analyze_contextual_disagreements(papers_data, intelligence_profiles, passages_by_paper, all_evidence)

        # Step 6: Identify Consensus Points
        consensus = cls._identify_consensus_points(papers_data, intelligence_profiles, all_evidence)

        # Step 7: Deterministic Citation Validation
        verified_count = 0
        for ev in all_evidence:
            if ev.passage_id and ev.exact_quote:
                p_store = passages_by_paper.get(ev.paper_id, {})
                target_p = p_store.get(ev.passage_id)
                if target_p:
                    p_text = target_p.get("text") or target_p.get("content") or ""
                    is_valid, score, _ = EvidenceValidator.verify_quotation(ev.exact_quote, p_text)
                    ev.is_verified = is_valid
                    ev.match_score = score
                    if is_valid:
                        verified_count += 1
                else:
                    ev.is_verified = False
                    ev.match_score = 0.0
            else:
                ev.is_verified = False
                ev.match_score = 0.0

        total_citations = len(all_evidence)
        faithfulness = (verified_count / total_citations) if total_citations > 0 else 1.0

        # Synthesis Topic Title
        paper_titles = [p.get("title", "Paper")[:30] for p in papers_data]
        topic = custom_question or f"Comparative Synthesis: {' vs '.join(paper_titles[:2])}"

        now_str = datetime.now(timezone.utc).isoformat()
        comparison_id = str(uuid.uuid4())

        response = ComparisonResponse(
            id=comparison_id,
            project_id=project_id,
            paper_ids=paper_ids,
            topic=topic,
            paper_profiles=profiles,
            dimension_matrix=matrix,
            disagreements=disagreements,
            consensus_points=consensus,
            all_evidence=all_evidence,
            total_citations=total_citations,
            verified_citations=verified_count,
            faithfulness_rate=round(faithfulness, 4),
            model_name=cls.MODEL_NAME,
            prompt_version=cls.PROMPT_VERSION,
            created_at=now_str,
            updated_at=now_str
        )

        # Step 8: Persistence
        cls._persist_synthesis(response, project_id)
        return response

    @classmethod
    def get_comparison(cls, comparison_id: str) -> Optional[ComparisonResponse]:
        """Fetches a saved comparison from synthesis_matrices or outputs."""
        # 1. Try synthesis_matrices table
        try:
            res = supabase.table("synthesis_matrices").select("*").eq("id", comparison_id).execute()
            if res.data and len(res.data) > 0:
                row = res.data[0]
                cells = row.get("matrix_cells") or {}
                if cells.get("dimension_matrix"):
                    return ComparisonResponse(**cells)
        except Exception:
            pass

        # 2. Try outputs table
        try:
            out_res = supabase.table("outputs").select("*").eq("id", comparison_id).execute()
            if out_res.data and len(out_res.data) > 0:
                raw_sec = out_res.data[0].get("sections")
                if isinstance(raw_sec, dict):
                    return ComparisonResponse(**raw_sec)
        except Exception:
            pass

        return None

    @classmethod
    def get_project_comparisons(cls, project_id: str) -> ProjectComparisonsListResponse:
        """Retrieves all comparisons created for a project."""
        comparisons: List[ComparisonResponse] = []

        # 1. Try synthesis_matrices
        try:
            res = supabase.table("synthesis_matrices").select("*").eq("workspace_id", project_id).order("created_at", desc=True).execute()
            if res.data:
                for row in res.data:
                    cells = row.get("matrix_cells") or {}
                    if cells.get("dimension_matrix"):
                        try:
                            comparisons.append(ComparisonResponse(**cells))
                        except Exception:
                            pass
                if comparisons:
                    return ProjectComparisonsListResponse(
                        project_id=project_id,
                        total_comparisons=len(comparisons),
                        comparisons=comparisons
                    )
        except Exception as e:
            logger.warning(f"Error reading synthesis_matrices: {e}")

        # 2. Try outputs table fallback
        try:
            out_res = supabase.table("outputs").select("*").eq("project_id", project_id).eq("output_type", "SYNTHESIS_MATRIX").execute()
            if out_res.data:
                for row in out_res.data:
                    raw_sec = row.get("sections")
                    if isinstance(raw_sec, dict):
                        comparisons.append(ComparisonResponse(**raw_sec))
        except Exception:
            pass

        return ProjectComparisonsListResponse(
            project_id=project_id,
            total_comparisons=len(comparisons),
            comparisons=comparisons
        )

    # =========================================================================
    # MATRIX BUILDER ACROSS 12 DIMENSIONS
    # =========================================================================

    @classmethod
    def _build_dimension_matrix(
        cls,
        papers: List[Dict[str, Any]],
        intels: Dict[str, Any],
        passages_map: Dict[str, Dict[str, Any]],
        all_evidence: List[PaperEvidence]
    ) -> List[ComparisonDimensionItem]:
        matrix: List[ComparisonDimensionItem] = []

        dimensions_spec = [
            ("1. Research Objectives", "objective", "problem_statement"),
            ("2. Research Questions", "objective", "research_question"),
            ("3. Methodologies & Designs", "methodology", "research_design"),
            ("4. Models & Techniques", "methodology", "models_and_techniques"),
            ("5. Benchmark Datasets", "dataset", "dataset_name"),
            ("6. Sample Sizes & Compute", "dataset", "sample_size"),
            ("7. Evaluation Metrics", "metrics", "metric_names"),
            ("8. Reported Quantitative Results", "metrics", "metric_values"),
            ("9. Key Empirical Findings", "findings", "key_findings"),
            ("10. Author-Reported Limitations", "limitations", "author_limitations"),
            ("11. Experimental Conditions", "methodology", "procedural_details"),
            ("12. Synthesis & Consensus Verdict", "general", "synthesis_verdict")
        ]

        for dim_name, cat, field in dimensions_spec:
            paper_values: Dict[str, str] = {}
            dim_evidence: List[PaperEvidence] = []

            for paper in papers:
                pid = paper["id"]
                intel = intels[pid]
                title = paper.get("title") or "Untitled"

                if cat == "objective":
                    val = getattr(intel.research_objective, field)
                    paper_values[pid] = val
                    if intel.research_objective.evidence:
                        ref = intel.research_objective.evidence[0]
                        ev = PaperEvidence(
                            paper_id=pid,
                            paper_title=title,
                            passage_id=ref.passage_id,
                            exact_quote=ref.supporting_quote,
                            page_number=ref.page_number,
                            claim_summary=val
                        )
                        dim_evidence.append(ev)
                        all_evidence.append(ev)

                elif cat == "methodology":
                    if field == "models_and_techniques":
                        val = ", ".join(intel.methodology.models_and_techniques)
                    elif field == "procedural_details":
                        val = intel.methodology.procedural_details
                    else:
                        val = intel.methodology.research_design
                    paper_values[pid] = val
                    if intel.methodology.evidence:
                        ref = intel.methodology.evidence[0]
                        ev = PaperEvidence(
                            paper_id=pid,
                            paper_title=title,
                            passage_id=ref.passage_id,
                            exact_quote=ref.supporting_quote,
                            page_number=ref.page_number,
                            claim_summary=val
                        )
                        dim_evidence.append(ev)
                        all_evidence.append(ev)

                elif cat == "dataset":
                    val = getattr(intel.dataset_information, field) or "Not reported"
                    paper_values[pid] = val
                    if intel.dataset_information.evidence:
                        ref = intel.dataset_information.evidence[0]
                        ev = PaperEvidence(
                            paper_id=pid,
                            paper_title=title,
                            passage_id=ref.passage_id,
                            exact_quote=ref.supporting_quote,
                            page_number=ref.page_number,
                            claim_summary=f"Dataset: {val}"
                        )
                        dim_evidence.append(ev)
                        all_evidence.append(ev)

                elif cat == "metrics":
                    if field == "metric_names":
                        val = ", ".join([m.metric_name for m in intel.metrics]) or "Not reported"
                    else:
                        val = "; ".join([f"{m.metric_name}: {m.reported_value} {m.unit or ''}".strip() for m in intel.metrics]) or "Not reported"
                    paper_values[pid] = val
                    if intel.metrics and intel.metrics[0].evidence:
                        ref = intel.metrics[0].evidence[0]
                        ev = PaperEvidence(
                            paper_id=pid,
                            paper_title=title,
                            passage_id=ref.passage_id,
                            exact_quote=ref.supporting_quote,
                            page_number=ref.page_number,
                            claim_summary=val
                        )
                        dim_evidence.append(ev)
                        all_evidence.append(ev)

                elif cat == "findings":
                    val = "; ".join([f.finding for f in intel.key_findings[:2]]) or "Not reported"
                    paper_values[pid] = val
                    if intel.key_findings and intel.key_findings[0].evidence:
                        ref = intel.key_findings[0].evidence[0]
                        ev = PaperEvidence(
                            paper_id=pid,
                            paper_title=title,
                            passage_id=ref.passage_id,
                            exact_quote=ref.supporting_quote,
                            page_number=ref.page_number,
                            claim_summary=val
                        )
                        dim_evidence.append(ev)
                        all_evidence.append(ev)

                elif cat == "limitations":
                    val = "; ".join(intel.limitations.author_reported_limitations[:2]) or "Not reported"
                    paper_values[pid] = val
                    if intel.limitations.evidence:
                        ref = intel.limitations.evidence[0]
                        ev = PaperEvidence(
                            paper_id=pid,
                            paper_title=title,
                            passage_id=ref.passage_id,
                            exact_quote=ref.supporting_quote,
                            page_number=ref.page_number,
                            claim_summary=val
                        )
                        dim_evidence.append(ev)
                        all_evidence.append(ev)

                else:  # general
                    val = f"Synthesized across {len(papers)} papers"
                    paper_values[pid] = val

            # Formulate synthesis note
            notes = cls._synthesize_dimension_notes(dim_name, paper_values)

            matrix.append(ComparisonDimensionItem(
                dimension_name=dim_name,
                paper_values=paper_values,
                evidence=dim_evidence,
                synthesis_notes=notes
            ))

        return matrix

    @classmethod
    def _synthesize_dimension_notes(cls, dimension_name: str, values: Dict[str, str]) -> str:
        vals = list(values.values())
        if all(v == "Not reported" for v in vals):
            return "Insufficient reporting across all selected papers for comparative evaluation."
        if len(set(v.lower().strip() for v in vals)) == 1:
            return "Complete cross-paper alignment observed across evaluated publications."
        return "Distinct methodological choices and empirical conditions observed across evaluated papers."

    # =========================================================================
    # CONTEXTUAL DISAGREEMENT & DIVERGENCE ANALYSIS
    # =========================================================================

    @classmethod
    def _analyze_contextual_disagreements(
        cls,
        papers: List[Dict[str, Any]],
        intels: Dict[str, Any],
        passages_map: Dict[str, Dict[str, Any]],
        all_evidence: List[PaperEvidence]
    ) -> List[DisagreementItem]:
        """
        Crucial VERITAS Engine:
        Investigates differences in reported findings and classifies them into:
        - DIRECT_CONTRADICTION: Opposing findings under identical benchmark & metric conditions.
        - CONTEXTUAL_DISAGREEMENT: Apparent divergence explained by differing datasets, models, or metrics.
        - NON_COMPARABLE: Entirely different evaluation targets or tasks.
        - INSUFFICIENT_EVIDENCE: Missing baseline or protocol details.
        """
        disagreements: List[DisagreementItem] = []

        # Analyze pairwise differences between paper 0 and paper 1
        p0 = papers[0]
        p1 = papers[1]
        intel0 = intels[p0["id"]]
        intel1 = intels[p1["id"]]

        # 1. Dataset comparison
        data0 = (intel0.dataset_information.dataset_name or "").lower()
        data1 = (intel1.dataset_information.dataset_name or "").lower()
        same_dataset = bool(data0 and data1 and (data0 in data1 or data1 in data0) and data0 != "not reported")

        # 2. Metric comparison
        metrics0 = {m.metric_name.upper(): m for m in intel0.metrics}
        metrics1 = {m.metric_name.upper(): m for m in intel1.metrics}
        shared_metric_names = set(metrics0.keys()).intersection(set(metrics1.keys()))

        # Determine evidence references
        ref0 = intel0.key_findings[0].evidence[0] if (intel0.key_findings and intel0.key_findings[0].evidence) else None
        ref1 = intel1.key_findings[0].evidence[0] if (intel1.key_findings and intel1.key_findings[0].evidence) else None

        ev_a = PaperEvidence(
            paper_id=p0["id"],
            paper_title=p0.get("title", "Paper A"),
            passage_id=ref0.passage_id if ref0 else None,
            exact_quote=ref0.supporting_quote if ref0 else None,
            page_number=ref0.page_number if ref0 else 1,
            claim_summary=intel0.key_findings[0].finding if intel0.key_findings else "Reported empirical findings"
        )
        ev_b = PaperEvidence(
            paper_id=p1["id"],
            paper_title=p1.get("title", "Paper B"),
            passage_id=ref1.passage_id if ref1 else None,
            exact_quote=ref1.supporting_quote if ref1 else None,
            page_number=ref1.page_number if ref1 else 1,
            claim_summary=intel1.key_findings[0].finding if intel1.key_findings else "Reported empirical findings"
        )

        all_evidence.extend([ev_a, ev_b])

        # Classification Logic
        contextual_factors = []
        if not same_dataset:
            contextual_factors.append(f"Differing evaluation benchmarks: '{intel0.dataset_information.dataset_name}' vs '{intel1.dataset_information.dataset_name}'")

        if not shared_metric_names:
            contextual_factors.append(f"Different metrics measured: [{', '.join(metrics0.keys()) or 'None'}] vs [{', '.join(metrics1.keys()) or 'None'}]")

        models0 = set(m.lower() for m in intel0.methodology.models_and_techniques)
        models1 = set(m.lower() for m in intel1.methodology.models_and_techniques)
        if not models0.intersection(models1):
            contextual_factors.append(f"Distinct architectural paradigms: [{', '.join(intel0.methodology.models_and_techniques)}] vs [{', '.join(intel1.methodology.models_and_techniques)}]")

        # Evaluate Relationship Classification
        if same_dataset and shared_metric_names:
            # Under identical benchmark and metric
            shared_m = list(shared_metric_names)[0]
            val0 = metrics0[shared_m].reported_value
            val1 = metrics1[shared_m].reported_value
            if val0 != val1:
                classification: DisagreementClassification = "DIRECT_CONTRADICTION"
                desc = f"Direct empirical variance on shared benchmark '{intel0.dataset_information.dataset_name}' using metric '{shared_m}'."
                explanation = f"Paper A reports {shared_m} of {val0}, whereas Paper B reports {shared_m} of {val1} on the same benchmark dataset."
            else:
                classification = "CONSENSUS"
                desc = f"Empirical consensus on benchmark '{intel0.dataset_information.dataset_name}'."
                explanation = f"Both papers report identical {shared_m} performance of {val0}."
        elif contextual_factors and len(contextual_factors) >= 1:
            classification = "CONTEXTUAL_DISAGREEMENT"
            desc = "Apparent performance divergence is contextualized by differing experimental setups."
            explanation = (
                f"The observed divergence between '{p0.get('title')[:30]}' and '{p1.get('title')[:30]}' does not constitute a direct theoretical contradiction. "
                f"Rather, it is explained by key contextual variances: {'; '.join(contextual_factors)}."
            )
        elif not intel0.metrics or not intel1.metrics:
            classification = "INSUFFICIENT_EVIDENCE"
            desc = "Insufficient quantitative metric data to evaluate direct agreement or contradiction."
            explanation = "One or more papers did not report numerical metric values in extracted passages, precluding formal verification."
        else:
            classification = "NON_COMPARABLE"
            desc = "Independent research domains with non-comparable tasks."
            explanation = "Papers address non-overlapping task objectives and evaluation dimensions."

        disagreements.append(DisagreementItem(
            id=str(uuid.uuid4()),
            topic="Core Empirical Findings & Metric Comparability",
            classification=classification,
            description=desc,
            paper_a_claim=ev_a,
            paper_b_claim=ev_b,
            contextual_factors=contextual_factors,
            explanation=explanation,
            uncertainty_notes="Environmental compute resources, seed variance, and tokenization differences may also contribute to observed variance."
        ))

        return disagreements

    # =========================================================================
    # CONSENSUS POINTS SYNTHESIS
    # =========================================================================

    @classmethod
    def _identify_consensus_points(
        cls,
        papers: List[Dict[str, Any]],
        intels: Dict[str, Any],
        all_evidence: List[PaperEvidence]
    ) -> List[ConsensusItem]:
        consensus_items: List[ConsensusItem] = []

        # 1. Architectural consensus (e.g. Transformers / Attention)
        all_models = [set(m.lower() for m in intels[p["id"]].methodology.models_and_techniques) for p in papers]
        shared_models = set.intersection(*all_models) if all_models else set()

        if shared_models:
            supporting: List[PaperEvidence] = []
            for p in papers:
                pid = p["id"]
                ref = intels[pid].methodology.evidence[0] if intels[pid].methodology.evidence else None
                ev = PaperEvidence(
                    paper_id=pid,
                    paper_title=p.get("title", "Paper"),
                    passage_id=ref.passage_id if ref else None,
                    exact_quote=ref.supporting_quote if ref else None,
                    page_number=ref.page_number if ref else 1,
                    claim_summary=f"Employs {', '.join(shared_models).title()} architecture"
                )
                supporting.append(ev)
                all_evidence.append(ev)

            consensus_items.append(ConsensusItem(
                id=str(uuid.uuid4()),
                topic="Shared Architectural Foundation",
                consensus_statement=f"Cross-paper consensus establishes that {', '.join(shared_models).title()} serves as the core foundation across evaluated studies.",
                supporting_papers=supporting,
                strength="STRONG"
            ))

        # 2. Limitations consensus
        lim_supporting: List[PaperEvidence] = []
        for p in papers:
            pid = p["id"]
            ref = intels[pid].limitations.evidence[0] if intels[pid].limitations.evidence else None
            ev = PaperEvidence(
                paper_id=pid,
                paper_title=p.get("title", "Paper"),
                passage_id=ref.passage_id if ref else None,
                exact_quote=ref.supporting_quote if ref else None,
                page_number=ref.page_number if ref else 2,
                claim_summary="Acknowledges explicit empirical limitations and constraints"
            )
            lim_supporting.append(ev)
            all_evidence.append(ev)

        consensus_items.append(ConsensusItem(
            id=str(uuid.uuid4()),
            topic="Empirical Constraints & Generalizability",
            consensus_statement="All evaluated studies acknowledge structural computational boundaries, requiring targeted future extensions.",
            supporting_papers=lim_supporting,
            strength="MODERATE"
        ))

        return consensus_items

    # =========================================================================
    # PERSISTENCE (SYNTHESIS_MATRICES TABLE + OUTPUTS FALLBACK)
    # =========================================================================

    @classmethod
    def _persist_synthesis(cls, response: ComparisonResponse, project_id: str):
        payload = response.model_dump()

        # 1. Primary: synthesis_matrices table
        try:
            dim_names = [d.dimension_name for d in response.dimension_matrix]
            record = {
                "id": response.id,
                "workspace_id": project_id,
                "topic": response.topic,
                "dimensions": dim_names,
                "matrix_cells": payload
            }
            supabase.table("synthesis_matrices").insert(record).execute()
            logger.info(f"Persisted cross-paper synthesis {response.id} into synthesis_matrices.")
            return
        except Exception as e:
            logger.warning(f"Could not persist into synthesis_matrices table ({e}). Trying outputs table.")

        # 2. Secondary fallback: outputs table
        try:
            out_record = {
                "id": response.id,
                "project_id": project_id,
                "paper_id": response.paper_ids[0] if response.paper_ids else None,
                "output_type": "SYNTHESIS_MATRIX",
                "title": response.topic,
                "content": f"Cross-paper synthesis comparing {len(response.paper_ids)} papers.",
                "sections": payload,
                "statements": [d.model_dump() for d in response.disagreements],
                "model_name": response.model_name,
                "prompt_version": response.prompt_version,
                "source_references": [e.model_dump() for e in response.all_evidence],
                "verification_summary": {
                    "total_citations": response.total_citations,
                    "verified_citations": response.verified_citations,
                    "faithfulness_rate": response.faithfulness_rate
                }
            }
            supabase.table("outputs").insert(out_record).execute()
            logger.info(f"Persisted cross-paper synthesis {response.id} into outputs table fallback.")
        except Exception as e2:
            logger.error(f"Failed to persist synthesis: {e2}")

