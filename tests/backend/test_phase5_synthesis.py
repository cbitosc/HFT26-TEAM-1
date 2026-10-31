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
from services.synthesis_service import SynthesisService
from services.passage_service import PassageService
from services.intelligence_service import PaperIntelligenceService
from models.comparison import (
    ComparisonGenerateRequest,
    ComparisonResponse,
    DisagreementClassification,
    ProjectComparisonsListResponse
)

class TestPhase5Synthesis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @staticmethod
    def _create_synthetic_pdf(
        title: str,
        method: str,
        dataset: str,
        metric_name: str,
        metric_val: str,
        limitation: str
    ) -> bytes:
        """Generates a structured multi-page PDF with controlled scientific dimensions."""
        doc = fitz.open()

        # Page 1: Abstract & Introduction
        p1 = doc.new_page(width=595, height=842)
        p1.insert_text((50, 70), title, fontsize=18)
        p1.insert_text((50, 95), "Author Alpha, Author Beta (2024)", fontsize=10)
        p1.insert_text((50, 115), "doi: 10.48550/arXiv.2405.00001", fontsize=9)
        p1.insert_text((50, 140), "Abstract", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 155, 545, 230),
            f"We propose {method}, an effective framework for scaling deep learning architectures. "
            f"In this work, we investigate whether {method} outperforms prior baselines on standard tasks. "
            f"Empirical experiments demonstrate superior efficiency and robust generalization.",
            fontsize=10
        )
        p1.insert_text((50, 245), "1. Introduction", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 260, 545, 360),
            f"Scalability in neural networks presents critical challenges for production deployment. "
            f"In this paper, we address this challenge through systematic empirical analysis of {method}.",
            fontsize=10
        )

        # Page 2: Methodology & Evaluation
        p2 = doc.new_page(width=595, height=842)
        p2.insert_text((50, 70), "2. Methodology", fontsize=13)
        p2.insert_textbox(
            fitz.Rect(50, 85, 545, 175),
            f"Our architectural framework relies on an encoder-decoder Transformer incorporating {method}. "
            "We compare our approach against standard baseline models under identical training conditions.",
            fontsize=10
        )

        p2.insert_text((50, 190), "3. Results and Limitations", fontsize=13)
        p2.insert_textbox(
            fitz.Rect(50, 205, 545, 330),
            f"We evaluate our framework on the {dataset} benchmark. "
            f"Our proposed model achieves {metric_val} {metric_name}, outperforming competitive baselines. "
            f"A notable limitation acknowledged by the authors is that {limitation}. "
            "Future work will explore broader multimodal benchmarks.",
            fontsize=10
        )

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    # =========================================================================
    # UNIT TESTS: Disagreement Classification Logic
    # =========================================================================

    def test_01_contextual_disagreement_analysis_logic(self):
        """Verifies that differing datasets or metrics are correctly classified as CONTEXTUAL_DISAGREEMENT, not DIRECT_CONTRADICTION."""
        # Setup mock paper records
        paper_a = {
            "id": "paper-111",
            "title": "Low-Rank Adaptation with Quantization",
            "authors": ["Author A"],
            "publication_year": 2024
        }
        paper_b = {
            "id": "paper-222",
            "title": "Structured Attention Pruning",
            "authors": ["Author B"],
            "publication_year": 2024
        }

        # Mock intelligence objects
        class MockObj:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        mock_intel_a = MockObj(
            research_objective=MockObj(problem_statement="Reducing memory usage in LLMs", research_question="Does 4-bit match 16-bit?", evidence=[]),
            methodology=MockObj(research_design="Empirical Quantitative", models_and_techniques=["Q-LoRA", "Transformer"], procedural_details="Trained for 3 epochs", evidence=[]),
            dataset_information=MockObj(dataset_name="Vicuna-80 Benchmark", sample_size="80 dialogues", evidence=[]),
            metrics=[MockObj(metric_name="Accuracy", reported_value="99.3", unit="%", experimental_condition="Vicuna benchmark", evidence=[])],
            key_findings=[MockObj(finding="Q-LoRA matches full precision while saving 65% memory", finding_type="quantitative", evidence=[])],
            limitations=MockObj(author_reported_limitations=["Incurs 22% dequantization slowdown"], future_work=["Triton kernels"], evidence=[])
        )

        mock_intel_b = MockObj(
            research_objective=MockObj(problem_statement="Pruning attention heads in Transformers", research_question="Does pruning preserve accuracy?", evidence=[]),
            methodology=MockObj(research_design="Empirical Quantitative", models_and_techniques=["Head Pruning", "Transformer"], procedural_details="Trained for 10 epochs", evidence=[]),
            dataset_information=MockObj(dataset_name="WMT 2014 En-De", sample_size="4.5M pairs", evidence=[]),
            metrics=[MockObj(metric_name="BLEU", reported_value="28.4", unit="BLEU", experimental_condition="WMT14 translation", evidence=[])],
            key_findings=[MockObj(finding="Pruned model achieves 28.4 BLEU outperforming dense baselines", finding_type="quantitative", evidence=[])],
            limitations=MockObj(author_reported_limitations=["Restricted to encoder layers"], future_work=["Decoder pruning"], evidence=[])
        )

        intels = {paper_a["id"]: mock_intel_a, paper_b["id"]: mock_intel_b}
        all_ev = []
        disagreements = SynthesisService._analyze_contextual_disagreements([paper_a, paper_b], intels, {}, all_ev)

        self.assertEqual(len(disagreements), 1)
        dis = disagreements[0]
        # Must be CONTEXTUAL_DISAGREEMENT, never DIRECT_CONTRADICTION, because datasets and metrics differ!
        self.assertEqual(dis.classification, "CONTEXTUAL_DISAGREEMENT")
        self.assertTrue(len(dis.contextual_factors) >= 2)
        self.assertTrue(any("benchmark" in f.lower() or "dataset" in f.lower() for f in dis.contextual_factors))
        self.assertTrue(any("metric" in f.lower() for f in dis.contextual_factors))

    def test_02_validation_rejects_fewer_than_two_papers(self):
        """Verifies that synthesis requests with fewer than 2 papers are strictly rejected."""
        with self.assertRaises(ValueError) as ctx:
            SynthesisService.generate_synthesis(
                project_id="any-proj-id",
                paper_ids=["single-paper-id"]
            )
        self.assertIn("at least 2", str(ctx.exception).lower())

    # =========================================================================
    # END-TO-END INTEGRATION TESTS: Live Upload, Pipeline, Synthesis Generation, API
    # =========================================================================

    def test_03_e2e_full_synthesis_api_lifecycle(self):
        """
        Complete live verification against Supabase:
        1. Create research workspace
        2. Upload Paper 1 (Q-LoRA on Vicuna benchmark)
        3. Upload Paper 2 (Structured Pruning on WMT 2014 dataset)
        4. Run passage processing pipeline for both papers
        5. Generate Cross-Paper Synthesis via POST /api/comparisons/generate
        6. Verify ComparisonResponse:
           - 12 dimension items in dimension_matrix
           - Both paper profiles present side-by-side
           - Contextual disagreement item with classification
           - Shared consensus items
           - Verified citations with physical page pointers
        7. Retrieve saved synthesis via GET /api/comparisons/{comparison_id}
        8. Query project syntheses via GET /api/projects/{project_id}/comparisons
        9. Clean up test papers and workspace
        """
        # Step 1: Create workspace
        proj_res = self.client.post("/api/projects", json={
            "name": "__TEST_PHASE5_SYNTHESIS__",
            "topic": "Efficient Transformers: Pruning vs Quantization",
            "research_question": "How do structured pruning and low-bit quantization compare in efficiency?",
            "description": "Integration test workspace for Phase 5 cross-paper synthesis"
        })
        self.assertEqual(proj_res.status_code, 201, f"Project creation failed: {proj_res.text}")
        project_id = proj_res.json()["id"]

        paper_ids = []
        try:
            # Step 2: Upload Paper 1
            pdf_1 = self._create_synthetic_pdf(
                title="Paper A: Q-LoRA Fine-Tuning with Paged Optimizers",
                method="Q-LoRA 4-bit Quantization",
                dataset="Vicuna Evaluation Benchmark",
                metric_name="Accuracy Score",
                metric_val="99.3%",
                limitation="Dequantization incurs 22% runtime latency"
            )
            up1_res = self.client.post(
                "/api/papers/upload",
                files=[("files", ("qlora_paper_a.pdf", io.BytesIO(pdf_1), "application/pdf"))],
                data={"project_id": project_id}
            )
            self.assertEqual(up1_res.status_code, 201)
            up1_data = up1_res.json()
            if isinstance(up1_data, dict):
                up1_data = up1_data.get("papers", [])
            paper_1_id = up1_data[0].get("paper_id") or up1_data[0].get("id")
            paper_ids.append(paper_1_id)

            # Step 3: Upload Paper 2
            pdf_2 = self._create_synthetic_pdf(
                title="Paper B: Structured Pruning for Edge Deployment",
                method="Structured Head Pruning",
                dataset="WMT 2014 Translation Dataset",
                metric_name="BLEU Score",
                metric_val="28.4",
                limitation="Sparsity acceleration requires custom hardware"
            )
            up2_res = self.client.post(
                "/api/papers/upload",
                files=[("files", ("pruning_paper_b.pdf", io.BytesIO(pdf_2), "application/pdf"))],
                data={"project_id": project_id}
            )
            self.assertEqual(up2_res.status_code, 201)
            up2_data = up2_res.json()
            if isinstance(up2_data, dict):
                up2_data = up2_data.get("papers", [])
            paper_2_id = up2_data[0].get("paper_id") or up2_data[0].get("id")
            paper_ids.append(paper_2_id)

            # Step 4: Process passages for both papers
            PassageService.process_paper_pipeline(paper_1_id)
            PassageService.process_paper_pipeline(paper_2_id)

            # Step 5: Generate Cross-Paper Synthesis
            synth_res = self.client.post("/api/comparisons/generate", json={
                "project_id": project_id,
                "paper_ids": [paper_1_id, paper_2_id],
                "research_question": "Does quantization outperform structured pruning across empirical metrics?"
            })
            self.assertEqual(synth_res.status_code, 201, f"Synthesis generation failed: {synth_res.text}")
            synth = synth_res.json()
            comparison_id = synth["id"]

            # Step 6: Verify Comprehensive Response Schema
            self.assertEqual(synth["project_id"], project_id)
            self.assertEqual(len(synth["paper_ids"]), 2)
            self.assertIn("Does quantization outperform", synth["topic"])

            # Verify Profiles
            self.assertEqual(len(synth["paper_profiles"]), 2)
            p_titles = [p["title"] for p in synth["paper_profiles"]]
            self.assertTrue(any("Q-LoRA" in t for t in p_titles))
            self.assertTrue(any("Structured Pruning" in t for t in p_titles))

            # Verify 12 Comparison Dimensions
            self.assertEqual(len(synth["dimension_matrix"]), 12, "Must compare all 12 required dimensions")
            dim_names = [d["dimension_name"] for d in synth["dimension_matrix"]]
            self.assertTrue(any("Objectives" in n for n in dim_names))
            self.assertTrue(any("Methodologies" in n for n in dim_names))
            self.assertTrue(any("Datasets" in n for n in dim_names))
            self.assertTrue(any("Metrics" in n for n in dim_names))
            self.assertTrue(any("Limitations" in n for n in dim_names))

            # Verify Disagreement Classification
            self.assertTrue(len(synth["disagreements"]) >= 1)
            dis0 = synth["disagreements"][0]
            self.assertIn(dis0["classification"], [
                "DIRECT_CONTRADICTION", "CONTEXTUAL_DISAGREEMENT", "NON_COMPARABLE", "INSUFFICIENT_EVIDENCE", "CONSENSUS"
            ])
            self.assertIn("paper_a_claim", dis0)
            self.assertIn("paper_b_claim", dis0)

            # Verify Consensus Items
            self.assertTrue(len(synth["consensus_points"]) >= 1)

            # Verify Evidence Citations & Faithfulness
            self.assertGreater(synth["total_citations"], 0)
            self.assertGreater(synth["verified_citations"], 0)
            self.assertGreaterEqual(synth["faithfulness_rate"], 0.75)

            # Step 7: Query GET /api/comparisons/{comparison_id}
            get_res = self.client.get(f"/api/comparisons/{comparison_id}")
            self.assertEqual(get_res.status_code, 200)
            self.assertEqual(get_res.json()["id"], comparison_id)
            self.assertEqual(get_res.json()["topic"], synth["topic"])

            # Step 8: Query GET /api/projects/{project_id}/comparisons
            proj_comps_res = self.client.get(f"/api/projects/{project_id}/comparisons")
            self.assertEqual(proj_comps_res.status_code, 200)
            proj_comps = proj_comps_res.json()
            self.assertEqual(proj_comps["project_id"], project_id)
            self.assertGreaterEqual(proj_comps["total_comparisons"], 1)

        finally:
            # Teardown
            for pid in paper_ids:
                try:
                    self.client.delete(f"/api/papers/{pid}")
                except Exception:
                    pass
            try:
                self.client.delete(f"/api/projects/{project_id}")
            except Exception:
                pass


if __name__ == "__main__":
    unittest.main()

