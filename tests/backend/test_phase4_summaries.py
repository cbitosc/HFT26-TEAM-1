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
from services.summary_service import SummaryService
from services.passage_service import PassageService
from services.evidence_validator import EvidenceValidator
from models.summary import (
    SummaryGenerateRequest,
    SummaryResponse,
    SummaryStatement,
    ProjectSummariesListResponse
)

class TestPhase4Summaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_paper_id = str(uuid.uuid4())
        cls.test_project_id = str(uuid.uuid4())

    @staticmethod
    def _create_synthetic_academic_pdf(
        title: str = "Quantization and Low-Rank Adaptation for LLMs"
    ) -> bytes:
        """Generates a structured multi-page PDF for summary generation tests."""
        doc = fitz.open()

        # Page 1: Abstract & Introduction
        p1 = doc.new_page(width=595, height=842)
        p1.insert_text((50, 70), title, fontsize=18)
        p1.insert_text((50, 95), "Jane Doe, John Smith (2024)", fontsize=10)
        p1.insert_text((50, 115), "doi: 10.48550/arXiv.2401.00001", fontsize=9)
        p1.insert_text((50, 140), "Abstract", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 155, 545, 230),
            "We propose Q-LoRA, an efficient fine-tuning approach that reduces memory usage without compromising performance. "
            "In this work, we investigate whether 4-bit NormalFloat quantization preserves 16-bit model capabilities across standard reasoning tasks. "
            "Our results demonstrate that Q-LoRA matches full 16-bit fine-tuning performance while reducing memory footprint by 65%.",
            fontsize=10
        )
        p1.insert_text((50, 245), "1. Introduction", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 260, 545, 360),
            "Fine-tuning large language models requires massive GPU cluster resources that remain inaccessible to most researchers. "
            "Existing parameter-efficient methods like LoRA reduce trainable weights but still require loading full-precision models into GPU VRAM. "
            "In this paper, we address this fundamental memory barrier using multi-stage block-wise quantization.",
            fontsize=10
        )

        # Page 2: Methodology, Evaluation & Limitations
        p2 = doc.new_page(width=595, height=842)
        p2.insert_text((50, 70), "2. Methodology and Experiments", fontsize=13)
        p2.insert_textbox(
            fitz.Rect(50, 85, 545, 175),
            "Our architectural design introduces double quantization and paged optimizers to eliminate memory spikes during backpropagation. "
            "We benchmark our framework against standard 16-bit LoRA baselines and full fine-tuning. "
            "Procedural details: Models were fine-tuned for 3 epochs with AdamW optimizer and learning rate 2e-4.",
            fontsize=10
        )

        p2.insert_text((50, 190), "3. Results and Limitations", fontsize=13)
        p2.insert_textbox(
            fitz.Rect(50, 205, 545, 330),
            "We evaluate our framework on the Vicuna benchmark comprising 80 multi-turn conversation questions. "
            "Our 4-bit fine-tuned model achieves 99.3% of ChatGPT performance level, outperforming standard 16-bit LoRA. "
            "A notable limitation reported by authors is that 4-bit quantization incurs a 22% inference slowdown due to on-the-fly dequantization. "
            "Future work will optimize custom Triton kernels to accelerate 4-bit matrix multiplication.",
            fontsize=10
        )

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    # =========================================================================
    # UNIT TESTS: Summary Formats & Statement Provenance
    # =========================================================================

    def test_01_summary_statement_validation_and_epistemic_links(self):
        """Verifies statement-level validation, distinguishing direct support from cautious inference."""
        passage_text = (
            "Our 4-bit fine-tuned model achieves 99.3% of ChatGPT performance level, outperforming standard 16-bit LoRA. "
            "A notable limitation reported by authors is that 4-bit quantization incurs a 22% inference slowdown."
        )

        # Statement with verbatim quote -> direct_support
        valid_quote = "4-bit quantization incurs a 22% inference slowdown"
        is_valid, score, _ = EvidenceValidator.verify_quotation(valid_quote, passage_text)
        self.assertTrue(is_valid)
        self.assertEqual(score, 1.0)

        # Statement with fabricated quote -> rejected / unresolved
        fake_quote = "This technique runs at 1000 tokens per second on mobile phones"
        is_valid_fake, _, reason = EvidenceValidator.verify_quotation(fake_quote, passage_text)
        self.assertFalse(is_valid_fake)
        self.assertIn("not found verbatim", reason.lower())

    # =========================================================================
    # END-TO-END INTEGRATION TESTS: Live Upload, Pipeline, Summary Generation, API
    # =========================================================================

    def test_02_e2e_full_summary_lifecycle_and_api(self):
        """
        Comprehensive live verification:
        1. Create research workspace
        2. Upload academic PDF
        3. Execute passage processing
        4. Generate Detailed Summary via POST /api/summaries/generate
        5. Verify statement-level citations, section headers, and faithfulness
        6. Retrieve summary via GET /api/summaries/{summary_id}
        7. Generate Short Summary via POST /api/summaries/generate (verifying history persistence)
        8. Query GET /api/projects/{project_id}/summaries
        9. Delete summary via DELETE /api/summaries/{summary_id}
        10. Clean up test paper and workspace
        """
        # Step 1: Create project
        proj_res = self.client.post("/api/projects", json={
            "name": "__TEST_PHASE4_SUMMARIES__",
            "topic": "Efficient LLM Fine-Tuning",
            "research_question": "Does 4-bit quantization match full precision LoRA?",
            "description": "Integration test workspace for Phase 4 evidence-grounded summaries"
        })
        self.assertEqual(proj_res.status_code, 201, f"Project creation failed: {proj_res.text}")
        project_id = proj_res.json()["id"]

        paper_id = None
        summary_id = None
        try:
            # Step 2: Upload PDF
            pdf_bytes = self._create_synthetic_academic_pdf(
                title="Q-LoRA: Efficient Finetuning of Quantized LLMs — Test Run"
            )
            upload_res = self.client.post(
                "/api/papers/upload",
                files=[("files", ("qlora_summary_test.pdf", io.BytesIO(pdf_bytes), "application/pdf"))],
                data={"project_id": project_id}
            )
            self.assertEqual(upload_res.status_code, 201, f"PDF upload failed: {upload_res.text}")
            upload_data = upload_res.json()
            if isinstance(upload_data, dict):
                upload_data = upload_data.get("papers", [])
            paper_id = upload_data[0].get("paper_id") or upload_data[0].get("id")

            # Step 3: Run Passage Processing Pipeline
            PassageService.process_paper_pipeline(paper_id)

            # Step 4: Generate Detailed Summary
            gen_res = self.client.post("/api/summaries/generate", json={
                "paper_id": paper_id,
                "project_id": project_id,
                "summary_type": "detailed"
            })
            self.assertEqual(gen_res.status_code, 201, f"Summary generation failed: {gen_res.text}")
            summary = gen_res.json()
            summary_id = summary["id"]

            # Step 5: Verify Summary Integrity
            self.assertEqual(summary["paper_id"], paper_id)
            self.assertEqual(summary["summary_type"], "detailed")
            self.assertTrue(len(summary["sections"]) >= 4, "Detailed summary must have structured sections")
            self.assertTrue(len(summary["statements"]) >= 4, "Summary must contain claim-level statements")
            self.assertGreaterEqual(summary["faithfulness_rate"], 0.75, "Faithfulness rate must exceed 75%")

            # Verify statement provenance fields
            for s in summary["statements"]:
                self.assertIn("statement_text", s)
                self.assertIn("relationship", s)
                self.assertIn("source_paper_id", s)
                self.assertEqual(s["source_paper_id"], paper_id)
                if s["is_verified"]:
                    self.assertIsNotNone(s["supporting_passage_id"])
                    self.assertIsNotNone(s["exact_quote"])
                    self.assertGreaterEqual(s["match_score"], 0.90)

            # Step 6: Query GET /api/summaries/{summary_id}
            get_res = self.client.get(f"/api/summaries/{summary_id}")
            self.assertEqual(get_res.status_code, 200)
            self.assertEqual(get_res.json()["id"], summary_id)
            self.assertEqual(get_res.json()["title"], summary["title"])

            # Step 7: Generate Short Summary (Idempotent history addition)
            gen_short_res = self.client.post("/api/summaries/generate", json={
                "paper_id": paper_id,
                "project_id": project_id,
                "summary_type": "short"
            })
            self.assertEqual(gen_short_res.status_code, 201)
            short_summary = gen_short_res.json()
            self.assertEqual(short_summary["summary_type"], "short")
            self.assertNotEqual(short_summary["id"], summary_id, "New summary must have distinct UUID")

            # Step 8: Query GET /api/projects/{project_id}/summaries
            proj_sums_res = self.client.get(f"/api/projects/{project_id}/summaries")
            self.assertEqual(proj_sums_res.status_code, 200)
            proj_sums = proj_sums_res.json()
            self.assertEqual(proj_sums["project_id"], project_id)
            self.assertGreaterEqual(proj_sums["total_summaries"], 2, "Project must retain both saved summaries")

            # Step 9: Delete short summary
            del_res = self.client.delete(f"/api/summaries/{short_summary['id']}")
            self.assertEqual(del_res.status_code, 200)

            # Verify count decreased
            proj_sums_after = self.client.get(f"/api/projects/{project_id}/summaries")
            self.assertEqual(proj_sums_after.json()["total_summaries"], proj_sums["total_summaries"] - 1)

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

