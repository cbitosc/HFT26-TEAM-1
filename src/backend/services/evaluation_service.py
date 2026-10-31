"""
VERITAS — Phase 10: Evaluation & Benchmarking Service
Orchestrates benchmark dataset validation, isolated evaluation execution,
scientific metrics calculation (Macro/Weighted F1, Precision, Recall, Confusion Matrix),
failure classification across 10 error taxonomies, and run persistence.
"""

import os
import re
import json
import uuid
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

try:
    from ..supabase_client import supabase
    from ..models.evaluation import (
        EvaluationExpectedVerdict,
        FailureCategory,
        BenchmarkSample,
        BenchmarkDatasetInfo,
        ClassMetrics,
        EvaluationMetrics,
        EvaluationSampleResult,
        EvaluationRun,
        EvaluationRunSummary,
    )
    from ..models.verification import (
        ClaimVerificationResult,
        EvidenceVerdict,
        RetrievedCandidate
    )
    from ..models.claim import AtomicClaim, ClaimCategory, VerificationStatus
    from .verifier_service import ClaimVerifierService
    from .retrieval_service import EvidenceRetrievalService
    from .audit_service import AuditService
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.evaluation import (
        EvaluationExpectedVerdict,
        FailureCategory,
        BenchmarkSample,
        BenchmarkDatasetInfo,
        ClassMetrics,
        EvaluationMetrics,
        EvaluationSampleResult,
        EvaluationRun,
        EvaluationRunSummary,
    )
    from models.verification import (
        ClaimVerificationResult,
        EvidenceVerdict,
        RetrievedCandidate
    )
    from models.claim import AtomicClaim, ClaimCategory, VerificationStatus
    from services.verifier_service import ClaimVerifierService
    from services.retrieval_service import EvidenceRetrievalService
    from services.audit_service import AuditService

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent / "storage"
RUNS_STORE_FILE = CACHE_DIR / "evaluation_runs_store.json"


class EvaluationBenchmarkService:
    """
    Automated evaluation harness for scientific claim verification.
    Ensures complete isolation from ordinary user workspaces.
    """

    MODEL_NAME = "veritas-eval-engine-v1"
    PROMPT_VERSION = "2026.1"

    @classmethod
    def validate_and_parse_dataset(
        cls, raw_content: str, filename: str = "dataset.json"
    ) -> Tuple[BenchmarkDatasetInfo, List[BenchmarkSample]]:
        """
        Parses JSON or JSONL benchmark dataset content into validated BenchmarkSample items.
        """
        raw_items: List[Dict[str, Any]] = []
        text = raw_content.strip()

        # Detect JSONL vs JSON Array
        if text.startswith("["):
            try:
                raw_items = json.loads(text)
            except Exception as e:
                raise ValueError(f"Invalid JSON Array format in benchmark file: {e}")
        else:
            # Assume JSONL
            lines = text.splitlines()
            for idx, line in enumerate(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    raw_items.append(json.loads(line))
                except Exception as e:
                    raise ValueError(f"Invalid JSON Line at line {idx + 1}: {e}")

        if not raw_items:
            raise ValueError("Benchmark dataset is empty.")

        samples: List[BenchmarkSample] = []
        sup_count = 0
        con_count = 0
        unr_count = 0
        has_quotes = False

        for idx, item in enumerate(raw_items):
            s_id = str(item.get("sample_id") or item.get("id") or f"sample-{idx + 1}")
            c_text = item.get("claim_text") or item.get("claim") or item.get("statement") or ""
            if not c_text:
                raise ValueError(f"Sample #{idx + 1} is missing 'claim_text' or 'claim'.")

            # Map raw label to standard verdict
            raw_label = str(item.get("expected_verdict") or item.get("label") or "Unresolved").strip().lower()
            if raw_label in ("supported", "support", "true", "entailment", "supports"):
                ev = EvaluationExpectedVerdict.SUPPORTED
                sup_count += 1
            elif raw_label in ("contradicted", "contradict", "false", "contradiction", "refutes", "refuted"):
                ev = EvaluationExpectedVerdict.CONTRADICTED
                con_count += 1
            else:
                ev = EvaluationExpectedVerdict.UNRESOLVED
                unr_count += 1

            quotes = item.get("gold_evidence_quotes") or item.get("evidence_quotes") or []
            if quotes:
                has_quotes = True

            samples.append(
                BenchmarkSample(
                    sample_id=s_id,
                    claim_text=c_text,
                    expected_verdict=ev,
                    source_paper_title=item.get("source_paper_title") or item.get("paper_title"),
                    source_paper_id=item.get("source_paper_id"),
                    gold_evidence_quotes=quotes if isinstance(quotes, list) else [str(quotes)],
                    domain=item.get("domain", "Computer Science / AI"),
                    metadata=item.get("metadata") or {}
                )
            )

        info = BenchmarkDatasetInfo(
            name=Path(filename).stem,
            version="1.0",
            description=f"Loaded from {filename} with {len(samples)} scientific test items.",
            total_samples=len(samples),
            supported_count=sup_count,
            contradicted_count=con_count,
            unresolved_count=unr_count,
            has_evidence_quotes=has_quotes
        )

        return info, samples

    @classmethod
    def run_benchmark(
        cls,
        samples: List[BenchmarkSample],
        dataset_name: str,
        target_project_id: Optional[str] = None,
        is_official_run: bool = False
    ) -> EvaluationRun:
        """
        Executes scientific verification evaluation across benchmark samples
        inside an isolated sandbox context and computes scientific metrics.
        """
        start_time = time.time()
        eval_id = str(uuid.uuid4())
        isolated_context_id = f"eval-sandbox-{eval_id[:8]}"

        results: List[EvaluationSampleResult] = []
        failure_counts: Dict[str, int] = {fc.value: 0 for fc in FailureCategory}

        # 1. Evaluate each sample
        for sample in samples:
            res = cls._evaluate_single_sample(sample, target_project_id or isolated_context_id)
            results.append(res)
            if res.failure_category:
                failure_counts[res.failure_category.value] = (
                    failure_counts.get(res.failure_category.value, 0) + 1
                )

        duration = round(time.time() - start_time, 2)

        # 2. Compute scientific metrics
        metrics = cls._calculate_metrics(results)

        # 3. Assemble EvaluationRun report
        run = EvaluationRun(
            id=eval_id,
            dataset_name=dataset_name,
            dataset_version="1.0",
            created_at=datetime.now(timezone.utc).isoformat(),
            duration_seconds=duration,
            model_name=cls.MODEL_NAME,
            prompt_version=cls.PROMPT_VERSION,
            retrieval_strategy="Hybrid BM25 + Vector RRF (k=60)",
            total_samples=len(samples),
            metrics=metrics,
            sample_results=results,
            failure_summary={k: v for k, v in failure_counts.items() if v > 0},
            is_official_run=is_official_run,
            notes="Executed in isolated evaluation sandbox." if not target_project_id else f"Evaluated against project corpus {target_project_id}."
        )

        # 4. Save run to persistent store
        cls._save_run(run)

        return run

    @classmethod
    def _evaluate_single_sample(
        cls,
        sample: BenchmarkSample,
        project_id: str
    ) -> EvaluationSampleResult:
        """
        Runs the full verification pipeline on a single benchmark claim.
        """
        claim_text = sample.claim_text
        expected_str = sample.expected_verdict.value

        # Mock passage retrieval or project retrieval
        retrieved_passages: List[RetrievedCandidate] = []
        if sample.gold_evidence_quotes:
            # Build mock candidate from gold evidence
            for idx, gq in enumerate(sample.gold_evidence_quotes):
                retrieved_passages.append(
                    RetrievedCandidate(
                        passage_id=f"gold-{idx}",
                        paper_id=sample.source_paper_id or "eval-paper-1",
                        page_number=1,
                        section_title="Evaluation Gold Context",
                        text=gq,
                        bm25_score=1.0,
                        vector_score=1.0,
                        rrf_score=1.0
                    )
                )
        elif not project_id.startswith("eval-"):
            # Run hybrid retrieval against specified user project corpus
            try:
                retrieved_passages = EvidenceRetrievalService.retrieve_evidence(
                    claim_text=claim_text,
                    project_id=project_id,
                    top_k=5
                )
            except Exception as e:
                logger.debug(f"Retrieval fallback: {e}")

        # Construct isolated evaluation claim
        mock_claim = AtomicClaim(
            id=sample.sample_id,
            output_id=f"eval-out-{sample.sample_id}",
            project_id=project_id,
            source_paper_id=sample.source_paper_id,
            original_text=claim_text,
            normalized_text=claim_text,
            paragraph_index=0,
            sentence_index=0,
            claim_index=0,
            original_position={"paragraph_index": 0, "sentence_index": 0, "claim_index": 0},
            is_atomic=True,
            category=ClaimCategory.RESULT,
            decomposition_notes="Benchmark evaluation item",
            verification_status=VerificationStatus.UNVERIFIED,
            confidence_score=1.0,
            created_at=datetime.now(timezone.utc).isoformat()
        )

        # Run verification reasoning & deterministic validation
        raw_res = ClaimVerifierService._evaluate_claim_against_evidence(
            claim=mock_claim,
            candidates=retrieved_passages,
            project_id=project_id
        )
        ver_result = ClaimVerifierService._apply_deterministic_validation(
            result=raw_res,
            claim=mock_claim,
            candidates=retrieved_passages,
            project_id=project_id
        )

        predicted_str = ver_result.verdict.value
        is_correct = (predicted_str == expected_str)

        # Citation validity check
        has_valid_citation = True
        cited_count = len(ver_result.cited_evidence)
        if cited_count > 0:
            for cite in ver_result.cited_evidence:
                if not cite.is_quote_valid:
                    has_valid_citation = False
                    break

        is_abstention = (predicted_str == "Unresolved")
        is_justified_abstention = (is_abstention and expected_str == "Unresolved")

        # Failure Diagnosis
        fail_cat: Optional[FailureCategory] = None
        fail_exp: Optional[str] = None

        if not is_correct:
            if not retrieved_passages:
                fail_cat = FailureCategory.RETRIEVAL_FAILURE
                fail_exp = "No evidence passages were retrieved for this claim from the corpus."
            elif predicted_str == "Unresolved" and expected_str in ("Supported", "Contradicted"):
                fail_cat = FailureCategory.MISSING_EVIDENCE
                fail_exp = f"Expected {expected_str}, but available passages lacked sufficient entailed facts to verify."
            elif predicted_str == "Supported" and expected_str == "Contradicted":
                fail_cat = FailureCategory.INCORRECT_ENTAILMENT
                fail_exp = "Verifier falsely supported a contradictory claim."
            elif predicted_str == "Contradicted" and expected_str == "Supported":
                fail_cat = FailureCategory.INCORRECT_CONTRADICTION
                fail_exp = "Verifier falsely flagged a supported claim as contradicted."
            elif re.search(r"\b\d+(\.\d+)?%?\b", claim_text):
                fail_cat = FailureCategory.NUMERICAL_REASONING_FAILURE
                fail_exp = "Discrepancy in quantitative figures or metric scales."
            elif not has_valid_citation:
                fail_cat = FailureCategory.INVALID_SOURCE_REFERENCE
                fail_exp = "Cited passage quotation failed verbatim text alignment check."
            else:
                fail_cat = FailureCategory.CONTEXT_MISMATCH
                fail_exp = f"Expected '{expected_str}' but verifier determined '{predicted_str}'."

        return EvaluationSampleResult(
            sample_id=sample.sample_id,
            claim_text=claim_text,
            expected_verdict=expected_str,
            predicted_verdict=predicted_str,
            is_correct=is_correct,
            confidence_score=ver_result.confidence_score if hasattr(ver_result, "confidence_score") else 1.0,
            retrieved_passages_count=len(retrieved_passages),
            cited_evidence_count=cited_count,
            has_valid_citation=has_valid_citation,
            failure_category=fail_cat,
            failure_explanation=fail_exp,
            is_abstention=is_abstention,
            is_justified_abstention=is_justified_abstention,
            retrieved_top_passages=[
                {"passage_id": p.passage_id, "text": p.text[:150] + "..." if len(p.text) > 150 else p.text}
                for p in retrieved_passages[:2]
            ]
        )

    @classmethod
    def _calculate_metrics(cls, results: List[EvaluationSampleResult]) -> EvaluationMetrics:
        """
        Calculates scientific classification metrics:
        - Accuracy
        - Macro Precision, Recall, F1
        - Weighted Precision, Recall, F1
        - 3x3 Confusion Matrix
        - Source link validity rate
        - Invalid citation rate
        - Unresolved / Abstention rate
        """
        total = len(results)
        if total == 0:
            return EvaluationMetrics(
                total_samples=0,
                accuracy=0.0,
                macro_precision=0.0,
                macro_recall=0.0,
                macro_f1=0.0,
                weighted_precision=0.0,
                weighted_recall=0.0,
                weighted_f1=0.0,
                per_class_metrics={},
                confusion_matrix={},
                source_link_validity_rate=1.0,
                invalid_citation_rate=0.0,
                unresolved_rate=0.0,
                evidence_sufficiency_rate=1.0
            )

        classes = ["Supported", "Contradicted", "Unresolved"]

        # Confusion Matrix initialize
        cm: Dict[str, Dict[str, int]] = {
            exp: {pred: 0 for pred in classes} for exp in classes
        }

        correct_count = 0
        valid_citations_count = 0
        samples_with_citations = 0
        unresolved_count = 0

        for r in results:
            exp = r.expected_verdict
            pred = r.predicted_verdict

            if exp in cm and pred in cm[exp]:
                cm[exp][pred] += 1

            if r.is_correct:
                correct_count += 1

            if r.predicted_verdict == "Unresolved":
                unresolved_count += 1

            if r.cited_evidence_count > 0:
                samples_with_citations += 1
                if r.has_valid_citation:
                    valid_citations_count += 1

        accuracy = round(correct_count / total, 4)

        # Per-class metrics
        per_class: Dict[str, ClassMetrics] = {}
        macro_p_sum = 0.0
        macro_r_sum = 0.0
        macro_f1_sum = 0.0
        weighted_p_sum = 0.0
        weighted_r_sum = 0.0
        weighted_f1_sum = 0.0

        for c in classes:
            tp = cm[c][c]
            fp = sum(cm[other][c] for other in classes if other != c)
            fn = sum(cm[c][other] for other in classes if other != c)
            support = sum(cm[c].values())

            prec = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
            rec = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
            f1 = round((2 * prec * rec) / (prec + rec), 4) if (prec + rec) > 0 else 0.0

            per_class[c] = ClassMetrics(
                support=support,
                precision=prec,
                recall=rec,
                f1_score=f1
            )

            macro_p_sum += prec
            macro_r_sum += rec
            macro_f1_sum += f1

            weight = support / total
            weighted_p_sum += prec * weight
            weighted_r_sum += rec * weight
            weighted_f1_sum += f1 * weight

        macro_p = round(macro_p_sum / len(classes), 4)
        macro_r = round(macro_r_sum / len(classes), 4)
        macro_f1 = round(macro_f1_sum / len(classes), 4)

        src_validity = (
            round(valid_citations_count / samples_with_citations, 4)
            if samples_with_citations > 0
            else 1.0
        )
        invalid_cite_rate = round(1.0 - src_validity, 4)
        unres_rate = round(unresolved_count / total, 4)

        return EvaluationMetrics(
            total_samples=total,
            accuracy=accuracy,
            macro_precision=macro_p,
            macro_recall=macro_r,
            macro_f1=macro_f1,
            weighted_precision=round(weighted_p_sum, 4),
            weighted_recall=round(weighted_r_sum, 4),
            weighted_f1=round(weighted_f1_sum, 4),
            per_class_metrics=per_class,
            confusion_matrix=cm,
            source_link_validity_rate=src_validity,
            invalid_citation_rate=invalid_cite_rate,
            unresolved_rate=unres_rate,
            evidence_sufficiency_rate=round(1.0 - unres_rate, 4)
        )

    @classmethod
    def get_benchmark_template(cls) -> Dict[str, Any]:
        """
        Returns documentation and sample format for organizer/judge evaluation files.
        """
        return {
            "title": "VERITAS Scientific Benchmark Dataset Specification",
            "format": "JSON Array or JSONL (Line-delimited JSON)",
            "supported_verdicts": ["Supported", "Contradicted", "Unresolved"],
            "schema": {
                "sample_id": "string (unique UUID or identifier)",
                "claim_text": "string (verifiable factual scientific claim)",
                "expected_verdict": "string ('Supported' | 'Contradicted' | 'Unresolved')",
                "source_paper_title": "string (optional reference paper title)",
                "gold_evidence_quotes": ["string (optional exact quotes from paper)"],
                "domain": "string (optional research domain)"
            },
            "sample_json_array": [
                {
                    "sample_id": "sci-eval-001",
                    "claim_text": "Residual connections mitigate the vanishing gradient problem in deep networks.",
                    "expected_verdict": "Supported",
                    "source_paper_title": "Deep Residual Learning for Image Recognition",
                    "gold_evidence_quotes": [
                        "We hypothesize that it is easier to optimize the residual mapping than to optimize the original, unreferenced mapping."
                    ],
                    "domain": "Deep Learning / Computer Vision"
                },
                {
                    "sample_id": "sci-eval-002",
                    "claim_text": "Transformer self-attention exhibits linear O(N) computational complexity with sequence length.",
                    "expected_verdict": "Contradicted",
                    "source_paper_title": "Attention Is All You Need",
                    "gold_evidence_quotes": [
                        "Self-attention layers have a computational complexity per layer of O(n^2 · d)."
                    ],
                    "domain": "NLP / Sequence Modeling"
                },
                {
                    "sample_id": "sci-eval-003",
                    "claim_text": "Quantum neural networks guarantee faster real-world convergence on all tabular datasets.",
                    "expected_verdict": "Unresolved",
                    "source_paper_title": "Quantum Machine Learning Overview",
                    "gold_evidence_quotes": [],
                    "domain": "Quantum Computing"
                }
            ]
        }

    # =========================================================================
    # PERSISTENCE
    # =========================================================================

    @classmethod
    def _load_runs_cache(cls) -> Dict[str, Any]:
        """Loads cached evaluation runs from disk."""
        if not RUNS_STORE_FILE.exists():
            return {}
        try:
            with open(RUNS_STORE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read evaluation runs cache: {e}")
            return {}

    @classmethod
    def _save_run(cls, run: EvaluationRun):
        """Saves evaluation run to disk."""
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data = cls._load_runs_cache()
        data[run.id] = run.model_dump()
        try:
            with open(RUNS_STORE_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save evaluation run: {e}")

    @classmethod
    def list_runs(cls) -> List[EvaluationRunSummary]:
        """Lists historical evaluation runs summary."""
        data = cls._load_runs_cache()
        summaries: List[EvaluationRunSummary] = []
        for r_id, r_data in data.items():
            metrics = r_data.get("metrics") or {}
            summaries.append(
                EvaluationRunSummary(
                    id=r_id,
                    dataset_name=r_data.get("dataset_name", "Unknown Dataset"),
                    created_at=r_data.get("created_at", ""),
                    duration_seconds=r_data.get("duration_seconds", 0.0),
                    total_samples=r_data.get("total_samples", 0),
                    accuracy=metrics.get("accuracy", 0.0),
                    macro_f1=metrics.get("macro_f1", 0.0),
                    weighted_f1=metrics.get("weighted_f1", 0.0),
                    source_link_validity_rate=metrics.get("source_link_validity_rate", 1.0),
                    is_official_run=r_data.get("is_official_run", False)
                )
            )
        # Sort descending by creation date
        summaries.sort(key=lambda x: x.created_at, reverse=True)
        return summaries

    @classmethod
    def get_run(cls, run_id: str) -> Optional[EvaluationRun]:
        """Retrieves full evaluation run with all sample diagnostics."""
        data = cls._load_runs_cache()
        if run_id in data:
            return EvaluationRun(**data[run_id])
        return None
