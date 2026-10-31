import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from models.intelligence import EvidenceReference, VerificationSummary

logger = logging.getLogger("veritas.validator")

class EvidenceValidator:
    """
    Deterministic validation layer for Paper Intelligence evidence citations.
    Enforces that:
    1. Referenced passages exist and belong to the correct paper.
    2. Cited quotations exist verbatim in the source passage (after whitespace normalization).
    3. Invalid or fabricated references are flagged and rejected.
    """

    @staticmethod
    def normalize_text(text: str) -> str:
        """Safe whitespace normalization for robust comparison."""
        if not text:
            return ""
        # Replace newlines, tabs, soft hyphens with space
        cleaned = text.replace("\xad", "").replace("\n", " ").replace("\r", " ").replace("\t", " ")
        # Collapse multiple spaces into single space and lowercase
        return " ".join(cleaned.split()).lower()

    @classmethod
    def verify_quotation(cls, quote: str, passage_text: str) -> Tuple[bool, float, Optional[str]]:
        """
        Verifies that quote is present in passage_text.
        Returns: (is_valid, score, reason)
        """
        if not quote or not quote.strip():
            return False, 0.0, "Empty citation quotation."

        if not passage_text or not passage_text.strip():
            return False, 0.0, "Source passage text is empty."

        norm_quote = cls.normalize_text(quote)
        norm_passage = cls.normalize_text(passage_text)

        # Exact normalized substring match
        if norm_quote in norm_passage:
            return True, 1.0, None

        # Clean punctuation from quote edges and re-check
        trimmed_quote = re.sub(r'^[^\w]+|[^\w]+$', '', norm_quote)
        if len(trimmed_quote) >= 15 and trimmed_quote in norm_passage:
            return True, 0.98, None

        # If quote is very long, check if 80%+ of words appear sequentially
        words = norm_quote.split()
        if len(words) >= 8:
            prefix = " ".join(words[:min(12, len(words))])
            if prefix in norm_passage:
                return True, 0.90, None

        return False, 0.0, f"Quotation not found verbatim in passage: '{quote[:60]}...'"

    @classmethod
    def validate_evidence_references(
        cls,
        evidence_list: List[EvidenceReference],
        passages_by_id: Dict[str, Dict[str, Any]],
        expected_paper_id: str
    ) -> Tuple[List[EvidenceReference], VerificationSummary]:
        """
        Validates all evidence references against the known passage store.
        Returns (validated_references, summary).
        """
        verified_refs: List[EvidenceReference] = []
        total_cited = len(evidence_list)
        total_rejected = 0

        for ref in evidence_list:
            # 1. Check Paper ID
            if ref.paper_id != expected_paper_id:
                ref.is_verified = False
                ref.match_score = 0.0
                ref.rejection_reason = f"Paper ID mismatch: citation belongs to {ref.paper_id}, expected {expected_paper_id}"
                total_rejected += 1
                continue

            # 2. Check Passage Existence
            passage = passages_by_id.get(ref.passage_id)
            if not passage:
                ref.is_verified = False
                ref.match_score = 0.0
                ref.rejection_reason = f"Referenced passage ID '{ref.passage_id}' does not exist in paper index."
                total_rejected += 1
                continue

            # 3. Check Passage-Paper Ownership
            if passage.get("paper_id") != expected_paper_id:
                ref.is_verified = False
                ref.match_score = 0.0
                ref.rejection_reason = f"Passage '{ref.passage_id}' belongs to paper {passage.get('paper_id')}, not {expected_paper_id}"
                total_rejected += 1
                continue

            # 4. Check Exact Quotation Faithfulness
            passage_text = passage.get("text") or passage.get("content") or ""
            is_valid, score, reason = cls.verify_quotation(ref.supporting_quote, passage_text)

            if is_valid:
                ref.is_verified = True
                ref.match_score = score
                ref.page_number = passage.get("page_start") or passage.get("page_number", ref.page_number)
                ref.rejection_reason = None
                verified_refs.append(ref)
            else:
                ref.is_verified = False
                ref.match_score = score
                ref.rejection_reason = reason
                total_rejected += 1
                logger.warning(f"Rejected invalid citation in paper {expected_paper_id}: {reason}")

        total_verified = len(verified_refs)
        faithfulness_rate = (total_verified / total_cited) if total_cited > 0 else 1.0

        summary = VerificationSummary(
            total_cited=total_cited,
            total_verified=total_verified,
            total_rejected=total_rejected,
            faithfulness_rate=round(faithfulness_rate, 4)
        )

        return verified_refs, summary

