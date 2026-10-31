"""
VERITAS — Phase 9 Automated Test Suite
Tests Numerical Truth Detector, Overgeneralization Detector,
Research Gap Explorer, and Evidence Provenance Ledger.
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
from services.audit_service import AuditService
from services.claim_service import ClaimDecompositionService
from services.verifier_service import ClaimVerifierService
from models.audit import (
    NumericalVerdict,
    OvergeneralizationType,
    GapOriginType,
    LedgerEventType
)
from models.claim import AtomicClaim, ClaimCategory, VerificationStatus
from models.verification import (
    ClaimVerificationResult,
    EvidenceVerdict,
    EvidenceStrength,
    CitedEvidencePassage
)


class TestPhase9AdvancedAudits(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_project_id = str(uuid.uuid4())
        cls.test_paper_id = str(uuid.uuid4())

    def _create_mock_claim_and_verification(
        self,
        claim_text: str,
        passage_text: str,
        verdict: EvidenceVerdict = EvidenceVerdict.SUPPORTED
    ) -> str:
        """Helper to create and cache a mock claim and verification result."""
        dummy_out_id = str(uuid.uuid4())
        decomp = ClaimDecompositionService.decompose_output(
            output_id=dummy_out_id,
            project_id=self.test_project_id,
            original_text=claim_text
        )
        claim_id = decomp.claims[0].id

        # Store verification result
        ver_res = ClaimVerificationResult(
            id=str(uuid.uuid4()),
            claim_id=claim_id,
            project_id=self.test_project_id,
            claim_text=claim_text,
            verdict=verdict,
            reasoning="Test verification reasoning",
            evidence_strength=EvidenceStrength.DIRECT_EVIDENCE,
            cited_evidence=[
                CitedEvidencePassage(
                    passage_id=str(uuid.uuid4()),
                    paper_id=self.test_paper_id,
                    exact_quote=passage_text,
                    relationship="direct_support",
                    evidence_type="empirical",
                    is_quote_valid=True,
                    quote_match_score=1.0,
                    semantic_entailment=True,
                    explanation="Direct evidence"
                )
            ],
            limitations=[],
            retrieved_passages_count=1,
            created_at="2026-10-31T00:00:00Z"
        )
        ClaimVerifierService._save_to_cache(ver_res)
        return claim_id

    def test_01_numerical_consistent_check(self):
        """Values, metric, and unit matching exactly must produce NUMERICALLY_CONSISTENT."""
        claim_id = self._create_mock_claim_and_verification(
            claim_text="The model achieved 94.2% accuracy on ImageNet.",
            passage_text="Our model achieved 94.2% accuracy on ImageNet after 100 epochs."
        )

        res = AuditService.audit_claim_numerics(claim_id, self.test_project_id)
        self.assertEqual(res.verdict, NumericalVerdict.NUMERICALLY_CONSISTENT)
        self.assertTrue(res.unit_match)
        self.assertTrue(res.metric_match)
        self.assertIn("94.2", res.calculation_explanation)

    def test_02_numerical_discrepancy_check(self):
        """Mismatched reported values must produce NUMERICAL_DISCREPANCY."""
        claim_id = self._create_mock_claim_and_verification(
            claim_text="The model achieved 94.2% accuracy on ImageNet.",
            passage_text="Our model achieved 81.5% accuracy on ImageNet after 100 epochs."
        )

        res = AuditService.audit_claim_numerics(claim_id, self.test_project_id)
        self.assertEqual(res.verdict, NumericalVerdict.NUMERICAL_DISCREPANCY)
        self.assertIn("Discrepancy detected", res.calculation_explanation)

    def test_03_numerical_context_mismatch(self):
        """Same numbers but evaluated on different datasets must produce CONTEXT_MISMATCH."""
        claim_id = self._create_mock_claim_and_verification(
            claim_text="The model achieved 94.2% accuracy on ImageNet.",
            passage_text="The model achieved 94.2% accuracy on CIFAR."
        )

        res = AuditService.audit_claim_numerics(claim_id, self.test_project_id)
        self.assertEqual(res.verdict, NumericalVerdict.CONTEXT_MISMATCH)

    def test_04_overgeneralization_scope_expansion(self):
        """Claims with universal absolute quantifiers must be flagged with DATASET_OVERREACH."""
        claim_id = self._create_mock_claim_and_verification(
            claim_text="The model outperforms all baseline architectures across all datasets.",
            passage_text="The model outperforms baselines on ImageNet."
        )

        res = AuditService.audit_claim_overgeneralization(claim_id, self.test_project_id)
        self.assertTrue(res.is_overgeneralized)
        self.assertEqual(res.flagged_type, OvergeneralizationType.DATASET_OVERREACH)
        self.assertTrue(res.requires_human_review)
        self.assertNotEqual(res.suggested_narrower_wording, res.claim_text)

    def test_05_overgeneralization_causal_claim(self):
        """Claims asserting causality from correlational findings must be flagged."""
        claim_id = self._create_mock_claim_and_verification(
            claim_text="Attention depth directly causes improved generalization.",
            passage_text="We observe higher empirical accuracy with increased layer depth."
        )

        res = AuditService.audit_claim_overgeneralization(claim_id, self.test_project_id)
        self.assertTrue(res.is_overgeneralized)
        self.assertEqual(res.flagged_type, OvergeneralizationType.CORRELATION_AS_CAUSATION)

    def test_06_appropriately_scoped_claim_passes(self):
        """Appropriately scoped claims must NOT be falsely flagged."""
        claim_id = self._create_mock_claim_and_verification(
            claim_text="The model achieved 89.2% accuracy on the GLUE benchmark.",
            passage_text="The model achieved 89.2% accuracy on the GLUE benchmark."
        )

        res = AuditService.audit_claim_overgeneralization(claim_id, self.test_project_id)
        self.assertFalse(res.is_overgeneralized)
        self.assertEqual(res.flagged_type, OvergeneralizationType.NONE_DETECTED)

    def test_07_provenance_ledger_record_and_query(self):
        """Verifies immutable recording and retrieval in the Provenance Ledger."""
        entry = AuditService.record_event(
            project_id=self.test_project_id,
            event_type=LedgerEventType.PAPER_UPLOAD,
            entity_id=self.test_paper_id,
            title="PDF Upload Verified",
            description="Private document uploaded with SHA-256 integrity hash.",
            validation_outcome="SUCCESS"
        )
        self.assertIsNotNone(entry.id)

        # Retrieve ledger
        ledger = AuditService.get_project_ledger(self.test_project_id)
        self.assertGreater(ledger.total_events, 0)
        event_types = [e.event_type for e in ledger.events]
        self.assertIn(LedgerEventType.PAPER_UPLOAD, event_types)


if __name__ == "__main__":
    unittest.main()
