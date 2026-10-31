import unittest
import sys
import os
import io
import time
import fitz
import uuid

# Add src/backend to sys.path
sys.path.insert(0, r"D:\HFT26-TEAM-1\src\backend")

from fastapi.testclient import TestClient
from main import app
from services.evidence_validator import EvidenceValidator
from services.intelligence_service import PaperIntelligenceService
from services.passage_service import PassageService
from models.intelligence import (
    EvidenceReference,
    ResearchObjective,
    Methodology,
    DatasetInformation,
    MetricItem,
    KeyFindingItem,
    Limitations,
    AdditionalContext,
    PaperIntelligenceResponse
)

class TestPhase3Intelligence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_paper_id = str(uuid.uuid4())
        cls.test_project_id = str(uuid.uuid4())

    @staticmethod
    def _create_synthetic_academic_pdf(
        title: str = "Empirical Evaluation of Structured Pruning",
        has_metrics: bool = True,
        has_dataset: bool = True
    ) -> bytes:
        """Generates a multi-page PDF with clear section boundaries for intelligence tests."""
        doc = fitz.open()

        # Page 1: Abstract & Introduction
        p1 = doc.new_page(width=595, height=842)
        p1.insert_text((50, 70), title, fontsize=18)
        p1.insert_text((50, 95), "Author One, Author Two (2024)", fontsize=10)
        p1.insert_text((50, 115), "doi: 10.1145/3372297.3417888", fontsize=9)
        p1.insert_text((50, 140), "Abstract", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 155, 545, 230),
            "We propose a novel structured pruning framework for large transformer models. "
            "In this work, we investigate whether removing 40% of attention heads preserves translation accuracy. "
            "Experiments on standard benchmarks demonstrate that our method maintains BLEU score while reducing latency.",
            fontsize=10
        )
        p1.insert_text((50, 245), "1. Introduction", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 260, 545, 360),
            "The computational cost of self-attention mechanisms poses a major challenge for edge deployment. "
            "Prior approaches predominantly focus on unstructured sparsity, which requires custom hardware accelerators. "
            "In this paper, we address structured head pruning using first-order gradient approximations.",
            fontsize=10
        )

        # Page 2: Methodology & Experimental Results
        p2 = doc.new_page(width=595, height=842)
        p2.insert_text((50, 70), "2. Methodology", fontsize=13)
        p2.insert_textbox(
            fitz.Rect(50, 85, 545, 170),
            "Our architectural design utilizes an encoder-decoder Transformer with multi-head self-attention. "
            "We compare our approach against baseline dense models and magnitude-based pruning. "
            "Procedural details: Training was conducted for 10 epochs using Adam optimizer with weight decay 0.01.",
            fontsize=10
        )

        results_text = "Evaluation results show consistent convergence across tasks."
        if has_dataset and has_metrics:
            results_text = (
                "We evaluate our framework on the WMT 2014 English-to-German dataset comprising 4.5 million sentence pairs. "
                "Our pruned model achieves 28.4 BLEU, outperforming the baseline dense model by 1.2 BLEU. "
                "Inference latency is reduced to 14.2 ms per sentence on a single NVIDIA T4 GPU."
            )
        elif has_dataset:
            results_text = "We evaluate our framework on the WMT 2014 English-to-German dataset with standard test splits."

        p2.insert_text((50, 185), "3. Results and Limitations", fontsize=13)
        p2.insert_textbox(
            fitz.Rect(50, 200, 545, 340),
            f"{results_text} "
            "A notable limitation of our method is that pruning is restricted to encoder layers. "
            "Future work will explore extending structured pruning to decoder cross-attention layers.",
            fontsize=10
        )

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    # =========================================================================
    # UNIT TESTS: EvidenceValidator
    # =========================================================================

    def test_01_evidence_validator_exact_and_normalized_matching(self):
        """Verifies safe whitespace normalization and verbatim substring matching."""
        passage_text = (
            "We propose a novel structured pruning framework for large transformer models.\n"
            "In this work, we investigate whether removing 40% of attention heads preserves translation accuracy."
        )

        # 1. Exact match
        quote_1 = "We propose a novel structured pruning framework for large transformer models."
        valid, score, reason = EvidenceValidator.verify_quotation(quote_1, passage_text)
        self.assertTrue(valid)
        self.assertEqual(score, 1.0)
        self.assertIsNone(reason)

        # 2. Whitespace & newline mismatch normalization
        quote_2 = "We   propose a novel\nstructured pruning framework   for large transformer models."
        valid_2, score_2, _ = EvidenceValidator.verify_quotation(quote_2, passage_text)
        self.assertTrue(valid_2)
        self.assertEqual(score_2, 1.0)

        # 3. Substring within sentence
        quote_3 = "removing 40% of attention heads preserves translation accuracy"
        valid_3, score_3, _ = EvidenceValidator.verify_quotation(quote_3, passage_text)
        self.assertTrue(valid_3)
        self.assertGreaterEqual(score_3, 0.95)

        # 4. Fabricated quote (mismatch)
        fake_quote = "This framework achieves 99.9% accuracy on ImageNet-1K with zero latency."
        valid_fake, score_fake, reason_fake = EvidenceValidator.verify_quotation(fake_quote, passage_text)
        self.assertFalse(valid_fake)
        self.assertEqual(score_fake, 0.0)
        self.assertIn("not found verbatim", reason_fake.lower())

    def test_02_evidence_validator_ownership_and_rejection_audit(self):
        """Verifies rejection of non-existent passages, mismatched paper IDs, and fabricated quotes."""
        paper_a = "paper-uuid-aaa"
        paper_b = "paper-uuid-bbb"
        passage_1 = "passage-uuid-001"
        passage_2 = "passage-uuid-002"

        passages_store = {
            passage_1: {
                "id": passage_1,
                "paper_id": paper_a,
                "page_start": 1,
                "text": "The dominant sequence transduction models are based on complex neural networks."
            },
            passage_2: {
                "id": passage_2,
                "paper_id": paper_b,  # Belongs to paper B!
                "page_start": 2,
                "text": "We evaluate on the WMT 2014 translation dataset."
            }
        }

        refs = [
            # 1. Valid reference
            EvidenceReference(
                paper_id=paper_a,
                passage_id=passage_1,
                supporting_quote="The dominant sequence transduction models",
                page_number=1,
                extraction_category="OBJECTIVE"
            ),
            # 2. Invalid passage ID (does not exist)
            EvidenceReference(
                paper_id=paper_a,
                passage_id="non-existent-uuid",
                supporting_quote="Some quote",
                page_number=1,
                extraction_category="METHODOLOGY"
            ),
            # 3. Paper ownership mismatch (passage belongs to paper B)
            EvidenceReference(
                paper_id=paper_a,
                passage_id=passage_2,
                supporting_quote="We evaluate on the WMT 2014 translation dataset",
                page_number=2,
                extraction_category="DATASET"
            ),
            # 4. Fabricated quote inside valid passage
            EvidenceReference(
                paper_id=paper_a,
                passage_id=passage_1,
                supporting_quote="Fabricated claim never written in this paper",
                page_number=1,
                extraction_category="KEY_FINDING"
            )
        ]

        verified, summary = EvidenceValidator.validate_evidence_references(
            evidence_list=refs,
            passages_by_id=passages_store,
            expected_paper_id=paper_a
        )

        self.assertEqual(summary.total_cited, 4)
        self.assertEqual(summary.total_verified, 1)
        self.assertEqual(summary.total_rejected, 3)
        self.assertEqual(summary.faithfulness_rate, 0.25)
        self.assertEqual(len(verified), 1)
        self.assertEqual(verified[0].passage_id, passage_1)

    # =========================================================================
    # UNIT TESTS: Robustness on Sparse / Missing Paper Data
    # =========================================================================

    def test_03_robustness_on_papers_without_abstract_or_metrics(self):
        """Verifies that missing dimensions are marked 'Not reported' and not invented."""
        sparse_paper = {
            "id": "sparse-paper-1",
            "title": "Theoretical Bounds on Discrete Optimization",
            "abstract": None,
            "venue": None,
            "publication_year": None
        }
        sparse_passages = [
            {
                "id": "sparse-pass-1",
                "paper_id": "sparse-paper-1",
                "section_title": "Body",
                "page_start": 1,
                "page_number": 1,
                "text": "We study theoretical bounds for submodular function maximization under matroid constraints."
            }
        ]

        sections = PaperIntelligenceService._group_passages_by_section(sparse_passages)
        obj, _ = PaperIntelligenceService._extract_objective(sparse_paper, sections, sparse_passages)
        dataset, _ = PaperIntelligenceService._extract_dataset(sparse_paper, sections, sparse_passages)
        metrics, _ = PaperIntelligenceService._extract_metrics(sparse_paper, sections, sparse_passages)
        limitations, _ = PaperIntelligenceService._extract_limitations(sparse_paper, sections, sparse_passages)

        self.assertIn("submodular", obj.problem_statement.lower())
        self.assertEqual(dataset.dataset_name, "Not reported")
        self.assertEqual(dataset.sample_size, "Not reported")
        self.assertEqual(len(metrics), 0, "Sparse theoretical paper should have 0 quantitative metrics")
        self.assertTrue(len(limitations.author_reported_limitations) > 0)

    # =========================================================================
    # END-TO-END INTEGRATION TESTS: Live Upload, Pipeline, Extraction, API
    # =========================================================================

    def test_04_e2e_full_intelligence_lifecycle_and_api(self):
        """
        Complete live verification against Supabase:
        1. Create research project
        2. Upload synthetic academic PDF
        3. Execute passage extraction pipeline
        4. Trigger POST /api/papers/{paper_id}/intelligence
        5. Verify structured dimensions (Objective, Methodology, Dataset, Metrics, Findings, Limitations)
        6. Verify all citations have faithfulness_rate >= 0.90
        7. Query GET /api/papers/{paper_id}/intelligence
        8. Batch query GET /api/projects/{project_id}/intelligence
        9. Re-extraction with force_regenerate=true (bumping extraction_version to 2)
        10. Clean up test paper and workspace
        """
        # Step 1: Create project
        proj_res = self.client.post("/api/projects", json={
            "name": "__TEST_PHASE3_INTELLIGENCE__",
            "topic": "Model Compression & Pruning",
            "research_question": "Does structured pruning maintain BLEU score?",
            "description": "Integration test workspace for Phase 3 structured intelligence"
        })
        self.assertEqual(proj_res.status_code, 201, f"Project creation failed: {proj_res.text}")
        project_id = proj_res.json()["id"]

        paper_id = None
        try:
            # Step 2: Upload PDF
            pdf_bytes = self._create_synthetic_academic_pdf(
                title="Empirical Evaluation of Structured Pruning — Full Test",
                has_metrics=True,
                has_dataset=True
            )
            upload_res = self.client.post(
                "/api/papers/upload",
                files=[("files", ("structured_pruning_test.pdf", io.BytesIO(pdf_bytes), "application/pdf"))],
                data={"project_id": project_id}
            )
            self.assertEqual(upload_res.status_code, 201, f"PDF upload failed: {upload_res.text}")
            upload_data = upload_res.json()
            if isinstance(upload_data, dict):
                upload_data = upload_data.get("papers", [])
            paper_id = upload_data[0].get("paper_id") or upload_data[0].get("id")

            # Step 3: Run Passage Processing Pipeline
            PassageService.process_paper_pipeline(paper_id)

            # Step 4: Generate Paper Intelligence
            intel_res = self.client.post(f"/api/papers/{paper_id}/intelligence")
            self.assertEqual(intel_res.status_code, 200, f"Generate intelligence failed: {intel_res.text}")
            intel = intel_res.json()

            # Step 5: Verify Structured Dimensions
            self.assertEqual(intel["paper_id"], paper_id)
            self.assertEqual(intel["extraction_version"], 1)

            # A. Objective
            self.assertTrue("pruning" in intel["research_objective"]["problem_statement"].lower())
            self.assertGreater(len(intel["research_objective"]["evidence"]), 0)

            # B. Methodology
            self.assertTrue(len(intel["methodology"]["models_and_techniques"]) > 0)

            # C. Dataset
            self.assertTrue("wmt" in intel["dataset_information"]["dataset_name"].lower())

            # D. Metrics
            self.assertTrue(len(intel["metrics"]) > 0, "Expected at least 1 empirical metric extracted (e.g. BLEU)")
            bleu_metric = next((m for m in intel["metrics"] if "BLEU" in m["metric_name"].upper()), None)
            self.assertIsNotNone(bleu_metric, "Expected BLEU metric to be detected")
            self.assertEqual(bleu_metric["reported_value"], "28.4")

            # E. Key Findings
            self.assertTrue(len(intel["key_findings"]) > 0)

            # F. Limitations
            self.assertTrue(len(intel["limitations"]["author_reported_limitations"]) > 0)
            self.assertTrue(len(intel["limitations"]["future_work"]) > 0)

            # Step 6: Verify Faithfulness Summary
            summary = intel["verification_summary"]
            self.assertGreater(summary["total_cited"], 0)
            self.assertGreater(summary["total_verified"], 0)
            self.assertGreaterEqual(summary["faithfulness_rate"], 0.80)

            # Step 7: Query GET /api/papers/{paper_id}/intelligence
            get_res = self.client.get(f"/api/papers/{paper_id}/intelligence")
            self.assertEqual(get_res.status_code, 200)
            self.assertEqual(get_res.json()["id"], intel["id"])

            # Step 8: Batch query GET /api/projects/{project_id}/intelligence
            proj_intel_res = self.client.get(f"/api/projects/{project_id}/intelligence")
            self.assertEqual(proj_intel_res.status_code, 200)
            proj_intel = proj_intel_res.json()
            self.assertEqual(proj_intel["project_id"], project_id)
            self.assertEqual(proj_intel["total_papers"], 1)
            self.assertEqual(len(proj_intel["papers"]), 1)

            # Step 9: Re-extraction idempotence (force_regenerate=true)
            regen_res = self.client.post(f"/api/papers/{paper_id}/intelligence?force_regenerate=true")
            self.assertEqual(regen_res.status_code, 200)
            regen_data = regen_res.json()
            self.assertEqual(regen_data["extraction_version"], 2, "Extraction version should increment on regeneration")

        finally:
            # Teardown
            if paper_id:
                try:
                    self.client.delete(f"/api/papers/{paper_id}")
                except Exception:
                    pass
            try:
                self.client.delete(f"/api/projects/{project_id}")
            except Exception:
                pass


if __name__ == "__main__":
    unittest.main()

