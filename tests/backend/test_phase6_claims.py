"""
VERITAS — Phase 6 Automated Test Suite
Tests atomic claim decomposition, compound splitting with subject propagation,
category classification, position preservation, and API routes.
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
from models.claim import ClaimCategory, VerificationStatus


class TestPhase6ClaimDecomposition(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_project_id = str(uuid.uuid4())
        cls.test_output_id = str(uuid.uuid4())

    def test_01_single_factual_statement(self):
        """A single factual statement should produce exactly 1 atomic claim."""
        text = "ResNet-50 was trained on ImageNet using stochastic gradient descent."
        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=text
        )

        self.assertEqual(resp.total_paragraphs, 1)
        self.assertEqual(resp.total_sentences, 1)
        self.assertEqual(resp.total_claims, 1)
        self.assertTrue(resp.claims[0].is_atomic)
        self.assertEqual(resp.claims[0].category, ClaimCategory.METHODOLOGICAL)
        self.assertIn("ResNet-50", resp.claims[0].normalized_text)

    def test_02_compound_statement_decomposition(self):
        """
        Original statement from Master Engineering Directive:
        'Model A outperformed Model B on Dataset X and generalized better to Dataset Y.'
        Must be decomposed into:
        - Claim 1: Model A outperformed Model B on Dataset X.
        - Claim 2: Model A generalized better to Dataset Y.
        """
        text = "Model A outperformed Model B on Dataset X and generalized better to Dataset Y."
        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=text
        )

        self.assertEqual(resp.total_sentences, 1)
        self.assertEqual(resp.total_claims, 2, "Compound statement must split into 2 atomic claims")
        self.assertEqual(resp.atomic_claims_count, 2)

        claim1 = resp.claims[0]
        claim2 = resp.claims[1]

        self.assertIn("outperformed Model B on Dataset X", claim1.normalized_text)
        self.assertIn("Model A", claim1.normalized_text)
        self.assertIn("generalized better to Dataset Y", claim2.normalized_text)
        self.assertIn("Model A", claim2.normalized_text, "Subject 'Model A' must be propagated to claim 2")

        # Category check
        self.assertEqual(claim1.category, ClaimCategory.COMPARATIVE)
        self.assertEqual(claim2.category, ClaimCategory.GENERALIZATION)

    def test_03_multi_sentence_paragraph_order_preservation(self):
        """Verify multi-sentence paragraphs preserve exact paragraph and sentence ordering."""
        para1 = "The architecture uses 12 self-attention heads. It was evaluated on the GLUE benchmark suite."
        para2 = "The system achieved 89.4% accuracy. However, memory consumption scales quadratically."
        full_text = f"{para1}\n\n{para2}"

        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=full_text
        )

        self.assertEqual(resp.total_paragraphs, 2)
        self.assertEqual(resp.total_sentences, 4)
        self.assertGreaterEqual(resp.total_claims, 4)

        # Paragraph 0 check
        p0_claims = [c for c in resp.claims if c.paragraph_index == 0]
        self.assertTrue(all(c.paragraph_index == 0 for c in p0_claims))
        self.assertEqual(p0_claims[0].sentence_index, 0)
        self.assertEqual(p0_claims[-1].sentence_index, 1)

        # Paragraph 1 check
        p1_claims = [c for c in resp.claims if c.paragraph_index == 1]
        self.assertTrue(all(c.paragraph_index == 1 for c in p1_claims))
        self.assertEqual(p1_claims[0].sentence_index, 0)

        # Verify claim indices are strictly monotonic within each sentence
        for s_idx in range(2):
            s_claims = [c for c in p0_claims if c.sentence_index == s_idx]
            for idx, c in enumerate(s_claims):
                self.assertEqual(c.claim_index, idx)

    def test_04_numerical_claim_classification(self):
        """Detects percentages, p-values, latency, and assigns NUMERICAL category."""
        text = "The proposed optimizer reduces convergence latency to 14.5ms and achieves an F1 score of 93.8%."
        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=text
        )

        self.assertGreaterEqual(resp.total_claims, 1)
        categories = [c.category for c in resp.claims]
        self.assertIn(ClaimCategory.NUMERICAL, categories)

    def test_05_mixed_factual_and_interpretive_statement(self):
        """Statements with speculative framing must be flagged with is_atomic=False or MIXED."""
        text = "We speculate that this approach might indicate a broader shift toward neurosymbolic reasoning."
        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=text
        )

        self.assertEqual(resp.total_claims, 1)
        claim = resp.claims[0]
        self.assertFalse(claim.is_atomic)
        self.assertEqual(claim.category, ClaimCategory.MIXED)
        self.assertIn("speculative", claim.decomposition_notes.lower())

    def test_06_ambiguous_or_semicolon_clauses(self):
        """Semicolons separate distinct propositions."""
        text = "The encoder computes token embeddings; the decoder generates sequential predictions."
        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=text
        )

        self.assertEqual(resp.total_claims, 2)
        self.assertTrue(all(c.is_atomic for c in resp.claims))
        self.assertIn("encoder computes", resp.claims[0].normalized_text)
        self.assertIn("decoder generates", resp.claims[1].normalized_text)

    def test_07_empty_or_malformed_input_validation(self):
        """Empty or missing IDs must raise ValueError / 400 Bad Request."""
        # Empty output_id
        with self.assertRaises(ValueError):
            ClaimDecompositionService.decompose_output(
                output_id="",
                project_id=self.test_project_id,
                original_text="Valid text."
            )

        # Empty project_id
        with self.assertRaises(ValueError):
            ClaimDecompositionService.decompose_output(
                output_id=str(uuid.uuid4()),
                project_id="",
                original_text="Valid text."
            )

        # API endpoint rejects empty payload
        api_resp = self.client.post("/api/claims/decompose", json={
            "output_id": "",
            "project_id": self.test_project_id,
            "original_text": "Sample text"
        })
        self.assertEqual(api_resp.status_code, 400)

    def test_08_original_position_preservation(self):
        """Character offsets and paragraph/sentence indices must be properly recorded."""
        text = "First paragraph here.\n\nSecond paragraph starts with sentence one. Then comes sentence two."
        resp = ClaimDecompositionService.decompose_output(
            output_id=str(uuid.uuid4()),
            project_id=self.test_project_id,
            original_text=text
        )

        for claim in resp.claims:
            pos = claim.original_position
            self.assertIn("paragraph_index", pos)
            self.assertIn("sentence_index", pos)
            self.assertIn("claim_index", pos)
            self.assertIn("start_char", pos)
            self.assertIn("end_char", pos)
            self.assertGreaterEqual(pos["start_char"], 0)
            self.assertGreaterEqual(pos["end_char"], pos["start_char"])

    def test_09_e2e_api_lifecycle(self):
        """Tests POST /api/claims/decompose, GET /api/outputs/{output_id}/claims, GET /api/claims/{claim_id}."""
        output_id = str(uuid.uuid4())
        sample_text = (
            "VERITAS decomposes academic syntheses into verifiable propositions. "
            "It extracts numerical figures such as 95.4% accuracy, and isolates comparative baselines."
        )

        # 1. POST decompose
        post_resp = self.client.post("/api/claims/decompose", json={
            "output_id": output_id,
            "project_id": self.test_project_id,
            "original_text": sample_text,
            "force_regenerate": True
        })
        self.assertEqual(post_resp.status_code, 201)
        data = post_resp.json()
        self.assertEqual(data["output_id"], output_id)
        self.assertGreaterEqual(len(data["claims"]), 2)

        first_claim_id = data["claims"][0]["id"]

        # 2. GET by output_id
        get_out_resp = self.client.get(f"/api/outputs/{output_id}/claims")
        self.assertEqual(get_out_resp.status_code, 200)
        out_data = get_out_resp.json()
        self.assertEqual(out_data["output_id"], output_id)
        self.assertEqual(len(out_data["claims"]), len(data["claims"]))

        # 3. GET by claim_id
        get_claim_resp = self.client.get(f"/api/claims/{first_claim_id}")
        self.assertEqual(get_claim_resp.status_code, 200)
        claim_data = get_claim_resp.json()
        self.assertEqual(claim_data["id"], first_claim_id)
        self.assertEqual(claim_data["output_id"], output_id)


if __name__ == "__main__":
    unittest.main()

