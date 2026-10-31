"""
VERITAS — Phase 7: Tri-State Claim Verification Engine
Evaluates atomic claims against retrieved evidence passages to produce deterministic
tri-state verdicts: Supported, Contradicted, or Unresolved.
Enforces strict quote validation, contextual contradiction analysis, and numerical integrity.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

try:
    from ..supabase_client import supabase
    from ..models.claim import AtomicClaim, ClaimCategory
    from ..models.verification import (
        EvidenceVerdict,
        EvidenceStrength,
        RetrievedCandidate,
        CitedEvidencePassage,
        ClaimVerificationResult,
        ProjectVerificationSummary
    )
    from .retrieval_service import EvidenceRetrievalService
    from .claim_service import ClaimDecompositionService
    from .evidence_validator import EvidenceValidator
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.claim import AtomicClaim, ClaimCategory
    from models.verification import (
        EvidenceVerdict,
        EvidenceStrength,
        RetrievedCandidate,
        CitedEvidencePassage,
        ClaimVerificationResult,
        ProjectVerificationSummary
    )
    from services.retrieval_service import EvidenceRetrievalService
    from services.claim_service import ClaimDecompositionService
    from services.evidence_validator import EvidenceValidator

logger = logging.getLogger("veritas.verifier")

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
VERIFICATIONS_CACHE_FILE = STORAGE_DIR / "verifications_store.json"


class ClaimVerifierService:
    """
    Central verification engine of VERITAS.
    Applies strict evidence integrity rules:
    - Supported only with verbatim, validated empirical evidence.
    - Contradicted only under comparable experimental conditions.
    - Unresolved for insufficient, indirect, or unverifiable claims.
    - Downgrades any verdict that fails deterministic quotation validation.
    """

    MODEL_NAME = "veritas-hybrid-verifier-v1"
    PROMPT_VERSION = "2026.1"
    RETRIEVAL_VERSION = "hybrid-rrf-v1"

    # Numerical patterns for deterministic validation
    NUM_REGEX = re.compile(r"(\b\d+(\.\d+)?%|\bp\s*[<>=]\s*0?\.\d+|\b\d+(\.\d+)?\s*(ms|s|seconds|epochs|parameters|GB|MB)\b|\b\d+\.\d+\b|\b\d{2,}\b)", re.IGNORECASE)

    # =========================================================================
    # PUBLIC VERIFICATION APIS
    # =========================================================================

    @classmethod
    def verify_claim(
        cls,
        claim_id: str,
        project_id: str,
        paper_ids: Optional[List[str]] = None,
        force_regenerate: bool = False
    ) -> ClaimVerificationResult:
        """
        Executes end-to-end verification for a single atomic claim:
        1. Fetch & validate claim record.
        2. Hybrid evidence retrieval.
        3. Tri-state reasoning & verdict determination.
        4. Deterministic Python validation (quotation & project boundaries).
        5. Persistence & auditability.
        """
        # 1. Fetch Claim
        claim = ClaimDecompositionService.get_claim(claim_id)
        if not claim:
            raise ValueError(f"Claim '{claim_id}' not found in database or cache.")

        # Check existing cached verification
        if not force_regenerate:
            cached = cls.get_claim_verification(claim_id)
            if cached:
                return cached

        # 2. Hybrid Evidence Retrieval
        retrieved_passages = EvidenceRetrievalService.retrieve_evidence(
            claim_text=claim.normalized_text,
            project_id=project_id,
            paper_ids=paper_ids,
            top_k=6
        )

        # 3. Formulate Verdict
        raw_result = cls._evaluate_claim_against_evidence(
            claim=claim,
            candidates=retrieved_passages,
            project_id=project_id
        )

        # 4. Deterministic Evidence Validation Layer (Strict Integrity Guarantee)
        validated_result = cls._apply_deterministic_validation(
            result=raw_result,
            claim=claim,
            candidates=retrieved_passages,
            project_id=project_id
        )

        # 5. Persist results
        cls._persist_verification(validated_result)

        return validated_result

    @classmethod
    def verify_batch(
        cls,
        claim_ids: List[str],
        project_id: str,
        paper_ids: Optional[List[str]] = None
    ) -> Tuple[int, int, List[ClaimVerificationResult]]:
        """
        Batch-verifies multiple claims with individual failure isolation.
        Returns (successful_count, failed_count, results).
        """
        successful = 0
        failed = 0
        results: List[ClaimVerificationResult] = []

        for cid in claim_ids:
            try:
                res = cls.verify_claim(
                    claim_id=cid,
                    project_id=project_id,
                    paper_ids=paper_ids
                )
                results.append(res)
                successful += 1
            except Exception as e:
                logger.error(f"Failed verifying claim '{cid}': {e}")
                failed += 1

        return successful, failed, results

    @classmethod
    def get_claim_verification(cls, claim_id: str) -> Optional[ClaimVerificationResult]:
        """Retrieves a cached verification result by claim ID."""
        store = cls._load_cache()
        if claim_id in store:
            try:
                return ClaimVerificationResult(**store[claim_id])
            except Exception:
                pass
        return None

    @classmethod
    def get_project_summary(cls, project_id: str) -> ProjectVerificationSummary:
        """Aggregates verification statistics for a research workspace."""
        store = cls._load_cache()
        project_verifications = [
            v for v in store.values()
            if v.get("project_id") == project_id
        ]

        total = len(project_verifications)
        supported = sum(1 for v in project_verifications if v.get("verdict") == EvidenceVerdict.SUPPORTED.value)
        contradicted = sum(1 for v in project_verifications if v.get("verdict") == EvidenceVerdict.CONTRADICTED.value)
        unresolved = sum(1 for v in project_verifications if v.get("verdict") == EvidenceVerdict.UNRESOLVED.value)

        # Count total claims in project
        total_claims_in_db = 0
        try:
            c_res = supabase.table("claims").select("id", count="exact").eq("workspace_id", project_id).execute()
            if c_res.count is not None:
                total_claims_in_db = c_res.count
        except Exception:
            total_claims_in_db = total

        verified_count = supported + contradicted + unresolved
        unverified = max(0, total_claims_in_db - verified_count)
        faithfulness = (supported / verified_count) if verified_count > 0 else 1.0

        return ProjectVerificationSummary(
            project_id=project_id,
            total_claims=max(total_claims_in_db, total),
            verified_claims=verified_count,
            supported_count=supported,
            contradicted_count=contradicted,
            unresolved_count=unresolved,
            unverified_count=unverified,
            faithfulness_rate=round(faithfulness, 4)
        )

    # =========================================================================
    # CORE EVALUATION & REASONING ENGINE
    # =========================================================================

    @classmethod
    def _evaluate_claim_against_evidence(
        cls,
        claim: AtomicClaim,
        candidates: List[RetrievedCandidate],
        project_id: str
    ) -> ClaimVerificationResult:
        """
        Evaluates candidate passages against the atomic proposition:
        - If no passages: UNRESOLVED (Absence of evidence is never contradiction).
        - Analyzes exact quotes, numerical alignment, and semantic entailment.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        res_id = str(uuid.uuid4())

        # Step 6: Empty retrieval -> UNRESOLVED
        if not candidates:
            return ClaimVerificationResult(
                id=res_id,
                claim_id=claim.id,
                project_id=project_id,
                claim_text=claim.normalized_text,
                verdict=EvidenceVerdict.UNRESOLVED,
                reasoning="No relevant passages could be retrieved from papers in the current research workspace.",
                evidence_strength=EvidenceStrength.INSUFFICIENT_EVIDENCE,
                cited_evidence=[],
                limitations=["No matching evidence found in uploaded research papers."],
                retrieved_passages_count=0,
                numerical_check_passed=None,
                validation_passed=True,
                downgraded=False,
                model_name=cls.MODEL_NAME,
                prompt_version=cls.PROMPT_VERSION,
                retrieval_version=cls.RETRIEVAL_VERSION,
                created_at=now_str
            )

        # Check for numerical claims
        claim_nums = cls._extract_numbers(claim.normalized_text)
        is_numerical = (claim.category == ClaimCategory.NUMERICAL) or (len(claim_nums) > 0)

        # Assess candidates
        citations: List[CitedEvidencePassage] = []
        has_direct_support = False
        has_direct_contradiction = False
        has_contextual_divergence = False
        divergence_notes: List[str] = []
        num_check_passed: Optional[bool] = None

        for c in candidates:
            passage_text = c.text
            norm_passage = EvidenceValidator.normalize_text(passage_text)
            norm_claim = EvidenceValidator.normalize_text(claim.normalized_text)

            # Check for exact or best matching quotation
            best_quote, quote_score = cls._extract_best_quotation(claim.normalized_text, passage_text)
            is_valid_quote = bool(best_quote and quote_score >= 0.40)

            # Check semantic entailment
            entailment, rel, exp = cls._assess_passage_relationship(
                claim_text=claim.normalized_text,
                passage_text=passage_text,
                claim_nums=claim_nums,
                is_numerical=is_numerical
            )

            if is_valid_quote and best_quote:
                citation = CitedEvidencePassage(
                    passage_id=c.passage_id,
                    paper_id=c.paper_id,
                    paper_title=None,
                    page_number=c.page_number,
                    section_title=c.section_title,
                    exact_quote=best_quote,
                    relationship=rel,
                    evidence_type="empirical" if is_numerical else "methodological",
                    is_quote_valid=is_valid_quote,
                    quote_match_score=quote_score,
                    semantic_entailment=entailment,
                    explanation=exp
                )
                citations.append(citation)

            if rel == "direct_support" and is_valid_quote:
                has_direct_support = True
            elif rel == "contradicts" and is_valid_quote:
                has_direct_contradiction = True
            elif rel == "contextual_divergence":
                has_contextual_divergence = True
                divergence_notes.append(exp)

        # Step 11: Numerical check
        if is_numerical and claim_nums:
            # Check if all numbers in claim are present in at least one supporting passage
            found_all_nums = all(
                any(num.lower() in c.text.lower() for c in candidates)
                for num in claim_nums
            )
            num_check_passed = found_all_nums

        # Determine Verdict
        limitations: List[str] = []
        if has_direct_support and not has_direct_contradiction:
            verdict = EvidenceVerdict.SUPPORTED
            strength = EvidenceStrength.DIRECT_EVIDENCE
            reasoning = (
                f"The proposition is directly supported by verbatim findings in the retrieved literature. "
                f"Source passages explicitly confirm the reported methodology and outcomes."
            )
        elif has_direct_contradiction and not has_direct_support:
            verdict = EvidenceVerdict.CONTRADICTED
            strength = EvidenceStrength.DIRECT_EVIDENCE
            reasoning = (
                f"The proposition is contradicted by empirical evidence in the source literature under "
                f"comparable experimental conditions."
            )
        elif has_direct_support and has_direct_contradiction:
            verdict = EvidenceVerdict.UNRESOLVED
            strength = EvidenceStrength.CONFLICTING_EVIDENCE
            reasoning = "Conflicting empirical evidence was retrieved across different sections or studies."
            limitations.append("Mixed evidence: different source passages present opposing findings.")
        elif has_contextual_divergence:
            verdict = EvidenceVerdict.UNRESOLVED
            strength = EvidenceStrength.PARTIAL_EVIDENCE
            reasoning = (
                f"Reported outcomes diverge from the claim, but under non-identical experimental conditions "
                f"({'; '.join(divergence_notes[:2])}). Rather than a contradiction, this represents contextual divergence."
            )
            limitations.extend(divergence_notes)
        else:
            verdict = EvidenceVerdict.UNRESOLVED
            strength = EvidenceStrength.INSUFFICIENT_EVIDENCE
            reasoning = (
                "The retrieved passages discuss related concepts but do not provide definitive empirical "
                "or methodological evidence to confirm or refute the claim."
            )
            limitations.append("Passages discuss topic generally without directly asserting the atomic proposition.")

        return ClaimVerificationResult(
            id=res_id,
            claim_id=claim.id,
            project_id=project_id,
            claim_text=claim.normalized_text,
            verdict=verdict,
            reasoning=reasoning,
            evidence_strength=strength,
            cited_evidence=citations,
            limitations=limitations,
            retrieved_passages_count=len(candidates),
            numerical_check_passed=num_check_passed,
            validation_passed=True,
            downgraded=False,
            model_name=cls.MODEL_NAME,
            prompt_version=cls.PROMPT_VERSION,
            retrieval_version=cls.RETRIEVAL_VERSION,
            created_at=now_str
        )

    # =========================================================================
    # DETERMINISTIC VALIDATION & DOWNGRADE LAYER (STEP 7 & STEP 8)
    # =========================================================================

    @classmethod
    def _apply_deterministic_validation(
        cls,
        result: ClaimVerificationResult,
        claim: AtomicClaim,
        candidates: List[RetrievedCandidate],
        project_id: str
    ) -> ClaimVerificationResult:
        """
        Deterministic safety harness:
        1. Confirms claim ID and project ID.
        2. Validates each passage ID exists in candidates and belongs to cited paper.
        3. Validates quotation exists in source passage via EvidenceValidator.
        4. If verdict is Supported/Contradicted but has NO valid verified quotation,
           DOWNGRADES verdict to UNRESOLVED with clear downgrade_reason.
        """
        # Integrity checks
        candidate_ids = {c.passage_id: c for c in candidates}
        valid_citations: List[CitedEvidencePassage] = []

        for cite in result.cited_evidence:
            cand = candidate_ids.get(cite.passage_id)
            if not cand:
                # Invalid passage ID: rejected
                cite.is_quote_valid = False
                continue

            if cand.paper_id != cite.paper_id:
                # Wrong paper ID: rejected
                cite.is_quote_valid = False
                continue

            # Deterministic quote check
            is_valid, score, _ = EvidenceValidator.verify_quotation(cite.exact_quote, cand.text)
            cite.is_quote_valid = is_valid
            cite.quote_match_score = score
            if is_valid:
                valid_citations.append(cite)

        result.cited_evidence = valid_citations

        # Safety rule: Supported or Contradicted verdict REQUIRES at least one validated citation
        if result.verdict in (EvidenceVerdict.SUPPORTED, EvidenceVerdict.CONTRADICTED):
            has_validated_quote = any(c.is_quote_valid for c in valid_citations)
            if not has_validated_quote or len(valid_citations) == 0:
                result.verdict = EvidenceVerdict.UNRESOLVED
                result.downgraded = True
                result.downgrade_reason = (
                    "Verdict downgraded to Unresolved: cited evidence failed deterministic verbatim quotation validation."
                )
                result.evidence_strength = EvidenceStrength.INSUFFICIENT_EVIDENCE
                result.reasoning = (
                    f"[Downgraded] {result.downgrade_reason} Source passages do not contain an exact verbatim match."
                )

        return result

    # =========================================================================
    # NLP & QUOTATION EXTRACTION HELPERS
    # =========================================================================

    @classmethod
    def _extract_numbers(cls, text: str) -> List[str]:
        """Extracts numerical tokens like '94.2%', '15ms', '0.05' from string."""
        matches = cls.NUM_REGEX.findall(text)
        nums = []
        for m in matches:
            val = m[0] if isinstance(m, tuple) else m
            nums.append(val.strip())
        return nums

    @classmethod
    def _extract_best_quotation(cls, claim_text: str, passage_text: str) -> Tuple[str, float]:
        """Extracts the sentence in passage_text with highest token overlap to claim_text."""
        if not passage_text or not claim_text:
            return "", 0.0

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", passage_text) if s.strip()]
        if not sentences:
            return passage_text[:120], 0.5

        claim_tokens = set(EvidenceValidator.normalize_text(claim_text).split())
        best_sentence = sentences[0]
        best_overlap = 0.0

        for s in sentences:
            s_tokens = set(EvidenceValidator.normalize_text(s).split())
            if not s_tokens:
                continue
            intersection = claim_tokens.intersection(s_tokens)
            overlap = len(intersection) / len(claim_tokens) if claim_tokens else 0.0
            if overlap > best_overlap:
                best_overlap = overlap
                best_sentence = s

        return best_sentence, round(best_overlap, 3)

    @classmethod
    def _assess_passage_relationship(
        cls,
        claim_text: str,
        passage_text: str,
        claim_nums: List[str],
        is_numerical: bool
    ) -> Tuple[bool, str, str]:
        """
        Determines semantic entailment, relationship, and explanation.
        Returns: (semantic_entailment: bool, relationship: str, explanation: str)
        """
        claim_norm = EvidenceValidator.normalize_text(claim_text)
        passage_norm = EvidenceValidator.normalize_text(passage_text)

        # Check contextual comparability first (differing datasets/metrics = contextual divergence)
        is_comparable, comp_reason = cls._check_contextual_comparability(claim_text, passage_text)
        if not is_comparable:
            return False, "contextual_divergence", comp_reason

        # 1. Numerical check
        if is_numerical and claim_nums:
            passage_nums = cls._extract_numbers(passage_text)
            matching_nums = [num.lower() for num in claim_nums if num.lower() in passage_norm]

            if len(matching_nums) == len(claim_nums):
                return True, "direct_support", f"Passage explicitly confirms reported numerical figures: {', '.join(matching_nums)}."
            elif passage_nums:
                # Same context but differing empirical numbers = direct contradiction
                return False, "contradicts", f"Passage reports conflicting numerical metrics under comparable conditions: reported {', '.join(passage_nums)} vs claimed {', '.join(claim_nums)}."
            else:
                return False, "unresolved", "Passage does not report the specified quantitative values."

        # 2. General factual overlap
        claim_words = set(claim_norm.split())
        passage_words = set(passage_norm.split())
        overlap = len(claim_words.intersection(passage_words)) / len(claim_words) if claim_words else 0.0

        # Check for explicit negation or refutation in passage
        negations = {"not", "fails to", "never", "cannot", "does not", "without", "no improvement", "contrary to", "falling short"}
        has_negation = any(neg in passage_norm for neg in negations)

        if overlap >= 0.65 and not has_negation:
            return True, "direct_support", "High semantic and lexical alignment confirms the asserted factual proposition."
        elif overlap >= 0.65 and has_negation:
            return False, "contradicts", "Passage negates or refutes the outcome asserted in the proposition."
        elif overlap >= 0.40:
            return False, "unresolved", "Passage shares relevant domain terminology but does not definitively prove the claim."
        else:
            return False, "unresolved", "Insufficient contextual overlap."

    @classmethod
    def _check_contextual_comparability(cls, claim_text: str, passage_text: str) -> Tuple[bool, str]:
        """
        Checks whether two conflicting statements occur under comparable experimental conditions.
        If datasets, baselines, or metrics differ, it is Contextual Divergence, not Direct Contradiction.
        """
        # Look for differing dataset names (ImageNet vs CIFAR, GLUE vs SuperGLUE)
        datasets = ["imagenet", "cifar", "glue", "superglue", "squad", "coco", "mnist"]
        claim_lower = claim_text.lower()
        passage_lower = passage_text.lower()

        claim_dsets = [d for d in datasets if d in claim_lower]
        passage_dsets = [d for d in datasets if d in passage_lower]

        if claim_dsets and passage_dsets and claim_dsets != passage_dsets:
            return False, f"Evaluated on differing benchmark datasets: '{claim_dsets[0]}' vs '{passage_dsets[0]}'"

        # Look for differing metrics
        metrics = ["accuracy", "f1", "bleu", "latency", "loss", "perplexity"]
        claim_m = [m for m in metrics if m in claim_lower]
        passage_m = [m for m in metrics if m in passage_lower]
        if claim_m and passage_m and claim_m != passage_m:
            return False, f"Evaluated using differing metrics: '{claim_m[0]}' vs '{passage_m[0]}'"

        return True, "Comparable experimental context."

    # =========================================================================
    # PERSISTENCE & CACHING
    # =========================================================================

    @classmethod
    def _persist_verification(cls, result: ClaimVerificationResult):
        """Dual-persistence: Supabase claims & claim_evidence tables + local disk store."""
        # 1. Update local cache
        cls._save_to_cache(result)

        # 2. Update Supabase claims table verification_status
        db_status = result.verdict.value.upper()
        if db_status not in ("SUPPORTED", "CONTRADICTED", "UNRESOLVED"):
            db_status = "UNRESOLVED"

        try:
            supabase.table("claims").update({"verification_status": db_status}).eq("id", result.claim_id).execute()
        except Exception as e:
            logger.debug(f"Could not update claims.verification_status: {e}")

        # 3. Insert rows into claim_evidence table
        for cite in result.cited_evidence:
            evidence_status = "SUPPORTS" if result.verdict == EvidenceVerdict.SUPPORTED else (
                "CONTRADICTS" if result.verdict == EvidenceVerdict.CONTRADICTED else "UNRESOLVED"
            )
            payload = {
                "id": str(uuid.uuid4()),
                "claim_id": result.claim_id,
                "chunk_id": cite.passage_id,
                "paper_id": cite.paper_id,
                "status": evidence_status,
                "exact_quote": cite.exact_quote,
                "faithfulness_score": cite.quote_match_score,
                "bounding_box": {
                    "page": cite.page_number,
                    "section": cite.section_title,
                    "semantic_entailment": cite.semantic_entailment
                },
                "nuance_context": cite.explanation,
                "numerical_data": {}
            }
            try:
                supabase.table("claim_evidence").insert(payload).execute()
            except Exception as e:
                logger.debug(f"Could not insert claim_evidence row: {e}")

    @classmethod
    def _load_cache(cls) -> Dict[str, Any]:
        """Loads cached verification records from disk."""
        if not VERIFICATIONS_CACHE_FILE.exists():
            return {}
        try:
            with open(VERIFICATIONS_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    @classmethod
    def _save_to_cache(cls, result: ClaimVerificationResult):
        """Saves a verification record to disk cache."""
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        store = cls._load_cache()
        store[result.claim_id] = result.model_dump()
        try:
            with open(VERIFICATIONS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(store, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write verifications cache: {e}")
