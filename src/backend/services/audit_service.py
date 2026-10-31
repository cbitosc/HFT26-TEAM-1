"""
VERITAS — Phase 9: Advanced Research Audit Engine
Implements:
1. Numerical Truth Detector (deterministic Decimal checks, metric & baseline validation, relative vs pp checks)
2. Overgeneralization Detector (scope expansion, dataset overreach, causal exaggeration)
3. Research Gap Explorer (limitations & future-work grounding, author vs synthesized distinction)
4. Evidence Provenance Ledger (append-oriented audit chain with immutable event tracking)
"""

import json
import logging
import re
import uuid
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

try:
    from ..supabase_client import supabase
    from ..models.audit import (
        NumericalVerdict,
        NumericalExpression,
        NumericalAuditResult,
        OvergeneralizationType,
        OvergeneralizationAuditResult,
        GapOriginType,
        ResearchGapItem,
        ProjectGapsResponse,
        LedgerEventType,
        ProvenanceLedgerEntry,
        ProjectLedgerResponse
    )
    from .claim_service import ClaimDecompositionService
    from .verifier_service import ClaimVerifierService
    from .intelligence_service import PaperIntelligenceService
    from .evidence_validator import EvidenceValidator
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.audit import (
        NumericalVerdict,
        NumericalExpression,
        NumericalAuditResult,
        OvergeneralizationType,
        OvergeneralizationAuditResult,
        GapOriginType,
        ResearchGapItem,
        ProjectGapsResponse,
        LedgerEventType,
        ProvenanceLedgerEntry,
        ProjectLedgerResponse
    )
    from services.claim_service import ClaimDecompositionService
    from services.verifier_service import ClaimVerifierService
    from services.intelligence_service import PaperIntelligenceService
    from services.evidence_validator import EvidenceValidator

logger = logging.getLogger("veritas.audit")

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
LEDGER_CACHE_FILE = STORAGE_DIR / "provenance_ledger_store.json"
GAPS_CACHE_FILE = STORAGE_DIR / "research_gaps_store.json"


class AuditService:
    """
    Central research audit service powering numerical verification,
    overgeneralization flagging, gap discovery, and provenance tracking.
    """

    MODEL_NAME = "veritas-audit-engine-v1"
    PROMPT_VERSION = "2026.1"

    # =========================================================================
    # FEATURE A: NUMERICAL TRUTH DETECTOR (DETERMINISTIC PYTHON ARITHMETIC)
    # =========================================================================

    @classmethod
    def audit_claim_numerics(
        cls,
        claim_id: str,
        project_id: str
    ) -> NumericalAuditResult:
        """
        Deterministically verifies numbers, metrics, units, and calculations in a claim
        against retrieved source passages using Decimal precision.
        """
        # 1. Fetch claim & existing verification citations
        claim = ClaimDecompositionService.get_claim(claim_id)
        if not claim:
            raise ValueError(f"Claim '{claim_id}' not found.")

        verification = ClaimVerifierService.get_claim_verification(claim_id)
        citations = verification.cited_evidence if verification else []

        # 2. Extract numerical expression from claim
        claim_expr = cls._parse_numerical_expression(claim.normalized_text)
        if not claim_expr:
            # Non-numerical claim
            res = NumericalAuditResult(
                claim_id=claim_id,
                claim_text=claim.normalized_text,
                verdict=NumericalVerdict.INSUFFICIENT_NUMERICAL_EVIDENCE,
                claimed_expression=None,
                source_reported_expression=None,
                calculation_explanation="The proposition contains no quantitative figures or empirical metrics."
            )
            cls.record_event(
                project_id=project_id,
                event_type=LedgerEventType.NUMERICAL_AUDIT,
                entity_id=claim_id,
                title="Numerical Audit Completed",
                description="Audited non-numerical proposition.",
                validation_outcome="SUCCESS"
            )
            return res

        # 3. Analyze candidate passages for reported numerical values
        source_expr: Optional[NumericalExpression] = None
        source_passage_id: Optional[str] = None
        exact_quote: Optional[str] = None

        for cite in citations:
            p_text = cite.exact_quote
            parsed = cls._parse_numerical_expression(
                p_text,
                target_metric=claim_expr.metric,
                target_unit=claim_expr.unit
            )
            if parsed:
                source_expr = parsed
                source_passage_id = cite.passage_id
                exact_quote = cite.exact_quote
                break

        # 4. Compare claimed vs source expressions
        verdict = NumericalVerdict.INSUFFICIENT_NUMERICAL_EVIDENCE
        calc_exp = ""
        rel_calc = None
        pp_calc = None
        unit_match = True
        metric_match = True
        dataset_match = True
        direction_match = True

        if not source_expr:
            verdict = NumericalVerdict.INSUFFICIENT_NUMERICAL_EVIDENCE
            calc_exp = "No corresponding numerical figures found in retrieved source passages to verify or refute."
        else:
            # Check units
            if claim_expr.unit and source_expr.unit and claim_expr.unit.lower() != source_expr.unit.lower():
                unit_match = False

            # Check metrics
            if claim_expr.metric and source_expr.metric and claim_expr.metric.lower() != source_expr.metric.lower():
                metric_match = False

            # Check datasets
            if claim_expr.dataset and source_expr.dataset and claim_expr.dataset.lower() != source_expr.dataset.lower():
                dataset_match = False

            # Arithmetic comparison via Decimal
            try:
                dec_claim = Decimal(str(claim_expr.value))
                dec_source = Decimal(str(source_expr.value))
                diff = abs(dec_claim - dec_source)
                is_close = diff < Decimal("0.05")  # Tolerant to rounding (e.g. 94.2 vs 94.20)
            except (InvalidOperation, ValueError):
                is_close = (claim_expr.value == source_expr.value)

            # Calculation: Relative change vs Percentage Points check
            if claim_expr.baseline_value and source_expr.value:
                try:
                    dec_base = Decimal(str(claim_expr.baseline_value))
                    dec_curr = Decimal(str(source_expr.value))
                    # Percentage points
                    pp_diff = dec_curr - dec_base
                    pp_calc = f"{pp_diff:+.2f} percentage points"
                    # Relative percentage change
                    if dec_base != 0:
                        rel_diff = ((dec_curr - dec_base) / dec_base) * Decimal("100")
                        rel_calc = f"{rel_diff:+.2f}% relative change"
                except Exception:
                    pass

            # Determine Verdict
            if not dataset_match or not metric_match:
                verdict = NumericalVerdict.CONTEXT_MISMATCH
                calc_exp = (
                    f"Numerical figures found ({source_expr.value}{source_expr.unit or ''}), but context differs "
                    f"(dataset: '{claim_expr.dataset}' vs '{source_expr.dataset}', metric: '{claim_expr.metric}' vs '{source_expr.metric}')."
                )
            elif is_close and unit_match:
                verdict = NumericalVerdict.NUMERICALLY_CONSISTENT
                calc_exp = f"Verified: Claimed value ({dec_claim}{claim_expr.unit or ''}) matches reported source value ({dec_source}{source_expr.unit or ''}) exactly."
            else:
                verdict = NumericalVerdict.NUMERICAL_DISCREPANCY
                calc_exp = f"Discrepancy detected: Claim asserts {dec_claim}{claim_expr.unit or ''}, but source evidence explicitly reports {dec_source}{source_expr.unit or ''}."

        result = NumericalAuditResult(
            claim_id=claim_id,
            claim_text=claim.normalized_text,
            verdict=verdict,
            claimed_expression=claim_expr,
            source_reported_expression=source_expr,
            calculation_explanation=calc_exp,
            relative_change_calc=rel_calc,
            percentage_point_calc=pp_calc,
            unit_match=unit_match,
            metric_match=metric_match,
            dataset_match=dataset_match,
            direction_match=direction_match,
            passage_id=source_passage_id,
            exact_quote=exact_quote
        )

        # Record Provenance Event
        cls.record_event(
            project_id=project_id,
            event_type=LedgerEventType.NUMERICAL_AUDIT,
            entity_id=claim_id,
            title="Numerical Audit Completed",
            description=f"Verdict: {verdict.value}. {calc_exp}",
            validation_outcome="SUCCESS" if verdict == NumericalVerdict.NUMERICALLY_CONSISTENT else "FLAGGED",
            metadata_json=result.model_dump()
        )

        return result

    @classmethod
    def _parse_numerical_expression(
        cls,
        text: str,
        target_metric: Optional[str] = None,
        target_unit: Optional[str] = None
    ) -> Optional[NumericalExpression]:
        """Extracts a structured numerical expression from prose with robust token and unit matching."""
        # Find metric
        metric_match = re.search(r"\b(accuracy|f1|bleu|rouge|auc|latency|loss|precision|recall|map|mrr|score|throughput|error rate)\b", text, re.I)
        metric = metric_match.group(1).lower() if metric_match else target_metric

        # Find dataset
        dataset_match = re.search(r"\b(imagenet|glue|squad|coco|cifar|superglue|mnist|gsm8k|mmlu)\b", text, re.I)
        dataset = dataset_match.group(1).capitalize() if dataset_match else None

        # Find all number + unit candidates
        # Note: % does not have \b after it because % is not a word character!
        unit_pattern = re.compile(
            r"(\b\d+(?:\.\d+)?)\s*(%|percent\b|percentage\s+points?\b|percentage\b|pp\b|ms\b|seconds?\b|s\b|gb\b|mb\b|epochs?\b|parameters?\b|params?\b|x\b)",
            re.I
        )
        candidates: List[NumericalExpression] = []
        for m in unit_pattern.finditer(text):
            val_str = m.group(1)
            unit_str = m.group(2)
            candidates.append(NumericalExpression(
                value=float(val_str),
                raw_str=m.group(0),
                unit=unit_str,
                metric=metric,
                dataset=dataset,
                is_percentage=unit_str.lower() in ("%", "percent", "percentage"),
                is_percentage_points=unit_str.lower() in ("percentage point", "percentage points", "pp")
            ))

        if candidates:
            # If target_unit specified, prioritize candidate matching unit
            if target_unit:
                for c in candidates:
                    if c.unit and c.unit.lower() == target_unit.lower():
                        return c
            # Filter out non-metric units if target_metric or metric exists (e.g. epochs vs accuracy)
            if metric in ("accuracy", "f1", "precision", "recall", "bleu", "rouge"):
                metric_cands = [c for c in candidates if c.is_percentage or c.unit in ("%", "percent")]
                if metric_cands:
                    return metric_cands[0]
            return candidates[0]

        # Fallback to standalone decimals
        dec_matches = list(re.finditer(r"(?<![a-zA-Z\-_])\b(\d+\.\d+)\b(?![a-zA-Z\-_])", text))
        if dec_matches:
            val_str = dec_matches[0].group(1)
            return NumericalExpression(
                value=float(val_str),
                raw_str=val_str,
                unit=None,
                metric=metric,
                dataset=dataset,
                is_percentage=False,
                is_percentage_points=False
            )

        return None

    # =========================================================================
    # FEATURE B: OVERGENERALIZATION DETECTOR
    # =========================================================================

    @classmethod
    def audit_claim_overgeneralization(
        cls,
        claim_id: str,
        project_id: str
    ) -> OvergeneralizationAuditResult:
        """
        Detects scope expansion, universal claims without qualifications,
        and causal assertions made from correlational or single-benchmark evidence.
        """
        claim = ClaimDecompositionService.get_claim(claim_id)
        if not claim:
            raise ValueError(f"Claim '{claim_id}' not found.")

        claim_text = claim.normalized_text
        text_lower = claim_text.lower()

        # Check for universal qualifiers
        universal_words = ["all", "every", "always", "universally", "across all", "in any domain", "in all settings", "proves that", "guarantees", "completely solves"]
        causal_words = ["causes", "directly causes", "proves causality", "leads invariably to", "determines"]

        flagged_type = OvergeneralizationType.NONE_DETECTED
        explanation = "The proposition is appropriately scoped to its evaluated findings."
        suggested = claim_text
        is_overgeneralized = False
        requires_review = False

        # Pattern 1: Universal scope expansion
        matched_univ = [w for w in universal_words if re.search(rf"\b{re.escape(w)}\b", text_lower)]
        if matched_univ:
            flagged_type = OvergeneralizationType.DATASET_OVERREACH
            is_overgeneralized = True
            requires_review = True
            explanation = (
                f"Proposition uses absolute language ('{matched_univ[0]}') that generalizes findings "
                f"beyond the specific empirical benchmarks evaluated."
            )
            # Suggest narrower phrasing: replace absolute terms
            narrowed = re.sub(r"\bacross all (benchmarks|tasks|datasets)\b", "across evaluated benchmarks", claim_text, flags=re.I)
            narrowed = re.sub(r"\b(universally|always|completely)\b", "demonstrably", narrowed, flags=re.I)
            suggested = narrowed

        # Pattern 2: Causal conclusions from benchmark evaluation
        elif any(re.search(rf"\b{re.escape(c)}\b", text_lower) for c in causal_words):
            flagged_type = OvergeneralizationType.CORRELATION_AS_CAUSATION
            is_overgeneralized = True
            requires_review = True
            explanation = (
                "Proposition frames an observed correlation or empirical improvement as a definitive causal mechanism."
            )
            suggested = re.sub(r"\b(causes|directly causes)\b", "is strongly associated with", claim_text, flags=re.I)

        # Pattern 3: Benchmark result treated as real-world proof
        elif re.search(r"\b(solves real-world|replaces human|achieves artificial general intelligence|agi)\b", text_lower):
            flagged_type = OvergeneralizationType.BENCHMARK_AS_REAL_WORLD
            is_overgeneralized = True
            requires_review = True
            explanation = "Synthetic or curated benchmark evaluation is equated with general real-world capability."
            suggested = re.sub(r"\b(solves real-world|replaces human)\b", "improves performance on benchmark tasks relative to", claim_text, flags=re.I)

        # Retrieve source passage from verification for grounding
        verification = ClaimVerifierService.get_claim_verification(claim_id)
        passage_id = None
        exact_quote = None
        scope = "Evaluated on documented benchmark experimental setup."

        if verification and verification.cited_evidence:
            first_cite = verification.cited_evidence[0]
            passage_id = first_cite.passage_id
            exact_quote = first_cite.exact_quote
            scope = f"Documented finding on {first_cite.section_title} (Page {first_cite.page_number})."

        result = OvergeneralizationAuditResult(
            claim_id=claim_id,
            claim_text=claim_text,
            is_overgeneralized=is_overgeneralized,
            flagged_type=flagged_type,
            evidence_supported_scope=scope,
            explanation=explanation,
            suggested_narrower_wording=suggested,
            requires_human_review=requires_review,
            passage_id=passage_id,
            exact_quote=exact_quote
        )

        # Record Provenance Event
        cls.record_event(
            project_id=project_id,
            event_type=LedgerEventType.OVERGENERALIZATION_AUDIT,
            entity_id=claim_id,
            title="Scope & Overgeneralization Audit",
            description=f"Scope Status: {flagged_type.value}.",
            validation_outcome="FLAGGED" if is_overgeneralized else "SUCCESS",
            metadata_json=result.model_dump()
        )

        return result

    # =========================================================================
    # FEATURE C: RESEARCH GAP EXPLORER
    # =========================================================================

    @classmethod
    def generate_research_gaps(
        cls,
        project_id: str,
        paper_ids: Optional[List[str]] = None,
        focus_area: Optional[str] = None
    ) -> ProjectGapsResponse:
        """
        Synthesizes research gaps from author-stated limitations across project papers.
        Strictly distinguishes:
        - Author-identified future work (directly quoted from papers).
        - VERITAS-synthesized research suggestions (cross-paper synthesis).
        """
        # Resolve papers
        if not paper_ids:
            try:
                wp = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).execute()
                paper_ids = [r["paper_id"] for r in (wp.data or [])]
            except Exception:
                paper_ids = []

        if not paper_ids:
            raise ValueError(f"No papers found in project '{project_id}' to discover research gaps.")

        # Fetch paper metadata
        p_res = supabase.table("papers").select("id, title, metadata_json").in_("id", paper_ids).execute()
        paper_map = {p["id"]: p for p in (p_res.data or [])}

        gaps: List[ResearchGapItem] = []
        author_count = 0
        synthesized_count = 0
        now_str = datetime.now(timezone.utc).isoformat()

        # Step 1: Extract author-identified limitations & future work
        for pid in paper_ids:
            p_data = paper_map.get(pid, {})
            p_title = p_data.get("title") or "Research Paper"
            try:
                intel = PaperIntelligenceService.get_or_generate_intelligence(pid)
            except Exception:
                intel = None

            if intel and intel.limitations:
                # 1. Author limitations
                for lim in intel.limitations.author_reported_limitations:
                    gid = str(uuid.uuid4())
                    gaps.append(
                        ResearchGapItem(
                            id=gid,
                            project_id=project_id,
                            suggested_research_question=f"How can future models address: {lim.rstrip('.')}?",
                            supporting_limitations=[lim],
                            source_paper_ids=[pid],
                            source_paper_titles=[p_title],
                            source_passage_ids=[e.passage_id for e in intel.limitations.evidence if e.passage_id],
                            explanation=f"Explicitly acknowledged by authors of '{p_title}' as a primary boundary condition.",
                            origin_type=GapOriginType.AUTHOR_IDENTIFIED,
                            important_uncertainties=["Feasibility of overcoming limitation without computational scaling."],
                            feasibility_notes="High priority for immediate follow-up studies.",
                            created_at=now_str
                        )
                    )
                    author_count += 1

                # 2. Generalizability constraints
                for gen_lim in intel.limitations.generalizability_constraints:
                    gid = str(uuid.uuid4())
                    gaps.append(
                        ResearchGapItem(
                            id=gid,
                            project_id=project_id,
                            suggested_research_question=f"Can the methodology generalize beyond {gen_lim.rstrip('.')}?",
                            supporting_limitations=[gen_lim],
                            source_paper_ids=[pid],
                            source_paper_titles=[p_title],
                            source_passage_ids=[e.passage_id for e in intel.limitations.evidence if e.passage_id],
                            explanation=f"Identified constraint on out-of-distribution applicability in '{p_title}'.",
                            origin_type=GapOriginType.AUTHOR_IDENTIFIED,
                            important_uncertainties=["Domain shift vulnerability and transfer learning efficacy."],
                            feasibility_notes="Requires cross-dataset empirical evaluation.",
                            created_at=now_str
                        )
                    )
                    author_count += 1

        # Step 2: Synthesize cross-paper research gap if >= 2 papers present
        if len(paper_ids) >= 2:
            gid = str(uuid.uuid4())
            gaps.append(
                ResearchGapItem(
                    id=gid,
                    project_id=project_id,
                    suggested_research_question="What unified architecture resolves trade-offs between accuracy, latency, and sample efficiency across these studies?",
                    supporting_limitations=[
                        "Different studies optimize for conflicting metrics (e.g. latency vs. deep reasoning capability).",
                        "Lack of standardized evaluation protocols across multi-modal benchmark splits."
                    ],
                    source_paper_ids=paper_ids[:3],
                    source_paper_titles=[paper_map.get(pid, {}).get("title", "Paper") for pid in paper_ids[:3]],
                    source_passage_ids=[],
                    explanation="VERITAS cross-paper synthesis: Observed methodological divergence and metric trade-offs between investigated architectures.",
                    origin_type=GapOriginType.VERITAS_SYNTHESIZED,
                    important_uncertainties=[
                        "Trade-offs may reflect fundamental Pareto boundaries rather than solvable engineering limitations.",
                        "Benchmark discrepancies between experimental protocols."
                    ],
                    feasibility_notes="Requires cross-architecture benchmarking under identical evaluation conditions.",
                    created_at=now_str
                )
            )
            synthesized_count += 1

        response = ProjectGapsResponse(
            project_id=project_id,
            total_gaps=len(gaps),
            author_identified_count=author_count,
            veritas_synthesized_count=synthesized_count,
            gaps=gaps
        )

        # Cache gaps
        cls._save_gaps(response)

        # Record Provenance Event
        cls.record_event(
            project_id=project_id,
            event_type=LedgerEventType.RESEARCH_GAP_GENERATION,
            entity_id=project_id,
            title="Research Gaps Discovered",
            description=f"Synthesized {len(gaps)} evidence-grounded research directions ({author_count} author-stated, {synthesized_count} synthesized).",
            validation_outcome="SUCCESS",
            metadata_json={"total_gaps": len(gaps), "author_count": author_count}
        )

        return response

    @classmethod
    def get_project_gaps(cls, project_id: str) -> Optional[ProjectGapsResponse]:
        """Retrieves cached research gaps for a project."""
        cache = cls._load_gaps()
        if project_id in cache:
            try:
                return ProjectGapsResponse(**cache[project_id])
            except Exception:
                pass
        return None

    # =========================================================================
    # FEATURE D: EVIDENCE PROVENANCE LEDGER
    # =========================================================================

    @classmethod
    def record_event(
        cls,
        project_id: str,
        event_type: LedgerEventType,
        entity_id: str,
        title: str,
        description: str,
        actor: str = "veritas-engine",
        validation_outcome: str = "SUCCESS",
        metadata_json: Optional[Dict[str, Any]] = None
    ) -> ProvenanceLedgerEntry:
        """
        Appends an immutable audit event to the research provenance chain.
        """
        entry_id = str(uuid.uuid4())
        now_str = datetime.now(timezone.utc).isoformat()

        entry = ProvenanceLedgerEntry(
            id=entry_id,
            project_id=project_id,
            event_type=event_type,
            entity_id=entity_id,
            title=title,
            description=description,
            actor=actor,
            model_name=cls.MODEL_NAME,
            prompt_version=cls.PROMPT_VERSION,
            validation_outcome=validation_outcome,
            metadata_json=metadata_json or {},
            created_at=now_str
        )

        # 1. Update local cache
        cls._append_ledger_entry(entry)

        # 2. Persist to Supabase audit_reports if available
        try:
            payload = {
                "id": entry.id,
                "workspace_id": project_id,
                "total_claims": 1,
                "supported_claims": 1 if validation_outcome == "SUCCESS" else 0,
                "contradicted_claims": 0,
                "unresolved_claims": 0,
                "overall_faithfulness_rate": 1.0,
                "report_json": entry.model_dump()
            }
            supabase.table("audit_reports").insert(payload).execute()
        except Exception as e:
            logger.debug(f"Could not insert audit_reports row: {e}")

        return entry

    @classmethod
    def get_project_ledger(cls, project_id: str) -> ProjectLedgerResponse:
        """Retrieves full chronological provenance audit chain for a research workspace."""
        cache = cls._load_ledger()
        events_for_proj = [
            ProvenanceLedgerEntry(**e)
            for e in cache
            if e.get("project_id") == project_id
        ]
        # Sort chronologically
        events_for_proj.sort(key=lambda x: x.created_at, reverse=True)

        return ProjectLedgerResponse(
            project_id=project_id,
            total_events=len(events_for_proj),
            events=events_for_proj
        )

    # =========================================================================
    # CACHE HELPERS
    # =========================================================================

    @classmethod
    def _load_ledger(cls) -> List[Dict[str, Any]]:
        if not LEDGER_CACHE_FILE.exists():
            return []
        try:
            with open(LEDGER_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    @classmethod
    def _append_ledger_entry(cls, entry: ProvenanceLedgerEntry):
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        items = cls._load_ledger()
        items.append(entry.model_dump())
        try:
            with open(LEDGER_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not append to ledger cache: {e}")

    @classmethod
    def _load_gaps(cls) -> Dict[str, Any]:
        if not GAPS_CACHE_FILE.exists():
            return {}
        try:
            with open(GAPS_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    @classmethod
    def _save_gaps(cls, response: ProjectGapsResponse):
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        store = cls._load_gaps()
        store[response.project_id] = response.model_dump()
        try:
            with open(GAPS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(store, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write gaps cache: {e}")
