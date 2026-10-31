"""
VERITAS — Phase 7 Automated Test Suite
Tests hybrid retrieval, tri-state verification (Supported, Contradicted, Unresolved),
deterministic quotation validation, contextual contradiction analysis, and API routes.
"""

import sys
import unittest
import uuid
from pathlib import Path

# Add backend to sys.path
backend_path = Path(__file__).resolve().parent.parent.parent / "src" / "backend"
sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from main import app
from services.claim_service import ClaimDecompositionService
from services.retrieval_service import EvidenceRetrievalService
from services.verifier_service import ClaimVerifierService
from models.claim import AtomicClaim, ClaimCategory
from models.verification import (
    EvidenceVerdict,
    EvidenceStrength,
    RetrievedCandidate,
    CitedEvidencePassage,
    ClaimVerificationResult
)


class TestPhase7ClaimVerification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_project_id = str(uuid.uuid4())
        cls.test_paper_id = str(uuid.uuid4())

    def _create_mock_claim(self, text: str, category: ClaimCategory = ClaimCategory.RESULT) -> AtomicClaim:
        return AtomicClaim(
            id=str(uuid.uuid4()),
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            source_paper_id=self.test_paper_id,
            original_text=text,
            normalized_text=text,
            paragraph_index=0,
            sentence_index=0,
            claim_index=0,
            original_position={"paragraph_index": 0, "sentence_index": 0, "claim_index": 0},
            is_atomic=True,
            category=category,
            decomposition_notes="Test claim",
            verification_status="UNVERIFIED",
            confidence_score=1.0,
            created_at="2026-10-31T00:00:00Z"
        )

    def test_01_directly_supported_claim(self):
        """A claim directly matching verbatim passage findings must receive Supported verdict."""
        claim = self._create_mock_claim("The transformer model achieved 94.2% accuracy on ImageNet.")
        candidates = [
            RetrievedCandidate(
                passage_id=str(uuid.uuid4()),
                paper_id=self.test_paper_id,
                page_number=4,
                section_title="Results",
                text="In our final evaluation, the transformer model achieved 94.2% accuracy on ImageNet with standard augmentation.",
                lexical_score=5.0,
                semantic_score=4.0,
                rrf_score=0.032,
                rank=1
            )
        ]

        result = ClaimVerifierService._evaluate_claim_against_evidence(
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        validated = ClaimVerifierService._apply_deterministic_validation(
            result=result,
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        self.assertEqual(validated.verdict, EvidenceVerdict.SUPPORTED)
        self.assertEqual(validated.evidence_strength, EvidenceStrength.DIRECT_EVIDENCE)
        self.assertFalse(validated.downgraded)
        self.assertGreater(len(validated.cited_evidence), 0)
        self.assertTrue(validated.cited_evidence[0].is_quote_valid)

    def test_02_directly_contradicted_claim(self):
        """A claim with opposing empirical findings under comparable conditions must receive Contradicted verdict."""
        claim = self._create_mock_claim("Model A achieved 94.2% accuracy on ImageNet.")
        candidates = [
            RetrievedCandidate(
                passage_id=str(uuid.uuid4()),
                paper_id=self.test_paper_id,
                page_number=5,
                section_title="Results",
                text="Contrary to earlier assumptions, Model A achieved 78.4% accuracy on ImageNet, falling short of baseline performance.",
                lexical_score=5.0,
                semantic_score=4.0,
                rrf_score=0.032,
                rank=1
            )
        ]

        result = ClaimVerifierService._evaluate_claim_against_evidence(
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        validated = ClaimVerifierService._apply_deterministic_validation(
            result=result,
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        self.assertEqual(validated.verdict, EvidenceVerdict.CONTRADICTED)
        self.assertFalse(validated.downgraded)

    def test_03_unresolved_claim_due_to_empty_retrieval(self):
        """Absence of evidence is NEVER contradiction; must be Unresolved."""
        claim = self._create_mock_claim("Model X reduces energy consumption by 40% on TPU v4 clusters.")
        candidates = []

        result = ClaimVerifierService._evaluate_claim_against_evidence(
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        self.assertEqual(result.verdict, EvidenceVerdict.UNRESOLVED)
        self.assertEqual(result.evidence_strength, EvidenceStrength.INSUFFICIENT_EVIDENCE)
        self.assertEqual(len(result.cited_evidence), 0)

    def test_04_contextual_disagreement_not_contradiction(self):
        """Differing findings on DIFFERENT datasets must yield Unresolved/Contextual Divergence, not Contradiction."""
        claim = self._create_mock_claim("Model A achieved 92.5% accuracy on ImageNet.")
        # Evidence discusses CIFAR, not ImageNet
        candidates = [
            RetrievedCandidate(
                passage_id=str(uuid.uuid4()),
                paper_id=self.test_paper_id,
                page_number=6,
                section_title="Experiments",
                text="Model A achieved 84.1% accuracy on CIFAR when trained under limited compute.",
                lexical_score=3.0,
                semantic_score=2.5,
                rrf_score=0.02,
                rank=1
            )
        ]

        result = ClaimVerifierService._evaluate_claim_against_evidence(
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        # Must NOT be Contradicted because datasets differ
        self.assertNotEqual(result.verdict, EvidenceVerdict.CONTRADICTED)
        self.assertEqual(result.verdict, EvidenceVerdict.UNRESOLVED)
        self.assertTrue(any("benchmark dataset" in lim.lower() for lim in result.limitations))

    def test_05_deterministic_validation_downgrades_on_quote_failure(self):
        """If a citation quotes text not in the source passage, Supported MUST be downgraded to Unresolved."""
        claim = self._create_mock_claim("The framework achieves 2x speedup.")
        pid = str(uuid.uuid4())
        candidates = [
            RetrievedCandidate(
                passage_id=pid,
                paper_id=self.test_paper_id,
                page_number=2,
                section_title="Methodology",
                text="We introduce a caching mechanism that optimizes vector store indexing.",
                lexical_score=2.0,
                semantic_score=2.0,
                rrf_score=0.02,
                rank=1
            )
        ]

        # Artificially create a Supported result with a fabricated quotation
        fake_result = ClaimVerificationResult(
            id=str(uuid.uuid4()),
            claim_id=claim.id,
            project_id=self.test_project_id,
            claim_text=claim.normalized_text,
            verdict=EvidenceVerdict.SUPPORTED,
            reasoning="Looks good.",
            evidence_strength=EvidenceStrength.DIRECT_EVIDENCE,
            cited_evidence=[
                CitedEvidencePassage(
                    passage_id=pid,
                    paper_id=self.test_paper_id,
                    exact_quote="The framework achieves 2x speedup and was measured accurately.",  # NOT in passage
                    relationship="direct_support",
                    evidence_type="empirical",
                    is_quote_valid=True,
                    quote_match_score=1.0,
                    semantic_entailment=True,
                    explanation="Hallucinated citation."
                )
            ],
            limitations=[],
            retrieved_passages_count=1,
            created_at="2026-10-31T00:00:00Z"
        )

        validated = ClaimVerifierService._apply_deterministic_validation(
            result=fake_result,
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        # Must be DOWNGRADED
        self.assertEqual(validated.verdict, EvidenceVerdict.UNRESOLVED)
        self.assertTrue(validated.downgraded)
        self.assertIn("downgraded to Unresolved", validated.downgrade_reason)

    def test_06_reject_invalid_passage_id(self):
        """Citations referencing non-existent passage IDs are filtered out."""
        claim = self._create_mock_claim("ResNet-50 was trained using SGD.")
        candidates = []  # No candidate matching the fake passage ID

        fake_result = ClaimVerificationResult(
            id=str(uuid.uuid4()),
            claim_id=claim.id,
            project_id=self.test_project_id,
            claim_text=claim.normalized_text,
            verdict=EvidenceVerdict.SUPPORTED,
            reasoning="Supported.",
            evidence_strength=EvidenceStrength.DIRECT_EVIDENCE,
            cited_evidence=[
                CitedEvidencePassage(
                    passage_id=str(uuid.uuid4()),  # Not in candidates
                    paper_id=self.test_paper_id,
                    exact_quote="ResNet-50 was trained using SGD.",
                    relationship="direct_support",
                    evidence_type="empirical",
                    is_quote_valid=True,
                    quote_match_score=1.0,
                    semantic_entailment=True,
                    explanation="Non-existent passage citation."
                )
            ],
            limitations=[],
            retrieved_passages_count=0,
            created_at="2026-10-31T00:00:00Z"
        )

        validated = ClaimVerifierService._apply_deterministic_validation(
            result=fake_result,
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        self.assertEqual(len(validated.cited_evidence), 0)
        self.assertEqual(validated.verdict, EvidenceVerdict.UNRESOLVED)
        self.assertTrue(validated.downgraded)

    def test_07_numerical_inconsistency_detection(self):
        """Numerical claims with conflicting percentages or values are marked with numerical_check_passed=False."""
        claim = self._create_mock_claim("The method achieves 98.5% accuracy.")
        candidates = [
            RetrievedCandidate(
                passage_id=str(uuid.uuid4()),
                paper_id=self.test_paper_id,
                page_number=3,
                section_title="Results",
                text="The method achieves 82.1% accuracy across all validation splits.",
                lexical_score=4.0,
                semantic_score=3.5,
                rrf_score=0.03,
                rank=1
            )
        ]

        result = ClaimVerifierService._evaluate_claim_against_evidence(
            claim=claim,
            candidates=candidates,
            project_id=self.test_project_id
        )

        self.assertFalse(result.numerical_check_passed)

    def test_08_api_batch_verification(self):
        """Tests the POST /api/claims/verify-batch endpoint."""
        # Decompose a test sentence first to generate genuine claims
        decomp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text="BERT utilizes masked language modeling. GPT uses autoregressive decoding."
        )

        claim_ids = [c.id for c in decomp.claims[:2]]
        self.assertGreaterEqual(len(claim_ids), 2)

        resp = self.client.post("/api/claims/verify-batch", json={
            "claim_ids": claim_ids,
            "project_id": self.test_project_id
        })

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_claims"], len(claim_ids))
        self.assertEqual(data["successful"], len(claim_ids))
        self.assertEqual(len(data["results"]), len(claim_ids))
        for r in data["results"]:
            self.assertIn(r["verdict"], ["Supported", "Contradicted", "Unresolved"])

    def test_09_api_verification_summary(self):
        """Tests the GET /api/projects/{project_id}/verification-summary endpoint."""
        resp = self.client.get(f"/api/projects/{self.test_project_id}/verification-summary")
        # If project is not in DB, should return 404
        # But if we create a project, returns 200
        # Let's check status code is either 200 or 404 depending on DB record
        self.assertIn(resp.status_code, [200, 404])


if __name__ == "__main__":
    unittest.main()
