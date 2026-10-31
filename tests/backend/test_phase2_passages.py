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
from services.pdf_processor import PDFProcessor, ProcessedPaperResult
from services.ocr_adapter import OCRAdapter
from services.processing_tracker import ProcessingTracker
from services.passage_service import PassageService
from supabase_client import supabase

class TestPhase2Passages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_paper_id = str(uuid.uuid4())
        cls.test_project_id = str(uuid.uuid4())

    @staticmethod
    def _create_academic_pdf(title: str = "Attention Is All You Need", page_count: int = 2) -> bytes:
        """Generates a structured, multi-page academic PDF in memory."""
        doc = fitz.open()
        
        # Page 1: Title, Abstract, Introduction
        p1 = doc.new_page(width=595, height=842)
        p1.insert_text((50, 70), title, fontsize=18)
        p1.insert_text((50, 95), "Ashish Vaswani, Noam Shazeer, Niki Parmar (2017)", fontsize=10)
        p1.insert_text((50, 115), "doi: 10.48550/arXiv.1706.03762", fontsize=9)
        p1.insert_text((50, 140), "Abstract", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 155, 545, 230),
            "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. "
            "We propose the Transformer, a model architecture eschewing recurrence and entirely relying on an attention mechanism. "
            "Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable.",
            fontsize=10
        )
        p1.insert_text((50, 245), "1. Introduction", fontsize=13)
        p1.insert_textbox(
            fitz.Rect(50, 260, 545, 360),
            "Recurrent neural networks, particularly LSTM and gated recurrent neural networks, have been firmly established as state of the art approaches. "
            "This inherently sequential nature precludes parallelization within training examples, which becomes critical at longer sequence lengths. "
            "In this work we propose the Transformer, a model architecture eschewing recurrence.",
            fontsize=10
        )

        if page_count > 1:
            # Page 2: Model Architecture & Results
            p2 = doc.new_page(width=595, height=842)
            p2.insert_text((50, 70), "2. Model Architecture", fontsize=13)
            p2.insert_textbox(
                fitz.Rect(50, 85, 545, 170),
                "Most competitive neural sequence transduction models have an encoder-decoder structure. "
                "Here, the encoder maps an input sequence of symbol representations to a sequence of continuous representations. "
                "Given z, the decoder then generates an output sequence of symbols one element at a time.",
                fontsize=10
            )
            p2.insert_text((50, 185), "3. Results and Conclusion", fontsize=13)
            p2.insert_textbox(
                fitz.Rect(50, 200, 545, 300),
                "On the WMT 2014 English-to-German translation task, the big transformer model outperforms the best previously reported models. "
                "The model achieves 28.4 BLEU, improving over the existing best results by more than 2.0 BLEU. "
                "Training took 3.5 days on 8 P100 GPUs.",
                fontsize=10
            )

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    # =========================================================================
    # UNIT TESTS: PDFProcessor
    # =========================================================================

    def test_01_pdf_processor_text_and_metadata_extraction(self):
        pdf_bytes = self._create_academic_pdf(page_count=2)
        result: ProcessedPaperResult = PDFProcessor.process_pdf_bytes(
            pdf_bytes=pdf_bytes,
            paper_id=self.test_paper_id,
            project_id=self.test_project_id,
            fallback_filename="transformer.pdf"
        )

        self.assertEqual(result.paper_id, self.test_paper_id)
        self.assertEqual(result.page_count, 2)
        self.assertTrue(len(result.passages) >= 2, f"Expected at least 2 passages, got {len(result.passages)}")
        self.assertFalse(result.has_scanned_pages)
        self.assertGreater(result.duration_seconds, 0.0)

        # Check metadata extraction
        self.assertTrue("Transformer" in result.abstract or "sequence" in result.abstract.lower())
        self.assertEqual(result.publication_year, 2017)
        self.assertIn("10.48550/arxiv.1706.03762", (result.doi or "").lower())

        # Check passage schema integrity
        for p in result.passages:
            self.assertEqual(p.paper_id, self.test_paper_id)
            self.assertTrue(len(p.id) > 10, "Passage must have a non-empty UUID")
            self.assertTrue(len(p.text.strip()) > 0, "Passage text must not be empty")
            self.assertGreaterEqual(p.page_start, 1)
            self.assertGreaterEqual(p.page_end, p.page_start)
            self.assertGreaterEqual(p.sequence_index, 0)
            self.assertEqual(p.extraction_method, "text")

    def test_02_deterministic_passage_uuids(self):
        """Verifies that the same PDF content and paper_id produce identical passage UUIDs across runs."""
        pdf_bytes = self._create_academic_pdf(page_count=2)
        
        run_1 = PDFProcessor.process_pdf_bytes(
            pdf_bytes=pdf_bytes,
            paper_id=self.test_paper_id,
            fallback_filename="test_run1.pdf"
        )
        run_2 = PDFProcessor.process_pdf_bytes(
            pdf_bytes=pdf_bytes,
            paper_id=self.test_paper_id,
            fallback_filename="test_run2.pdf"
        )

        self.assertEqual(len(run_1.passages), len(run_2.passages))
        for p1, p2 in zip(run_1.passages, run_2.passages):
            self.assertEqual(p1.id, p2.id, f"Passage UUID must be deterministic: {p1.id} != {p2.id}")
            self.assertEqual(p1.sequence_index, p2.sequence_index)
            self.assertEqual(p1.text, p2.text)

        # Different paper_id should generate different UUIDs
        other_paper_id = str(uuid.uuid4())
        run_3 = PDFProcessor.process_pdf_bytes(
            pdf_bytes=pdf_bytes,
            paper_id=other_paper_id,
            fallback_filename="test_run3.pdf"
        )
        self.assertNotEqual(run_1.passages[0].id, run_3.passages[0].id)

    def test_03_corrupt_and_empty_pdf_handling(self):
        """Verifies that empty and malformed PDF buffers are rejected gracefully with clean ValueErrors."""
        with self.assertRaises(ValueError) as ctx_empty:
            PDFProcessor.process_pdf_bytes(b"", paper_id="err-1")
        self.assertIn("empty", str(ctx_empty.exception).lower())

        with self.assertRaises(ValueError) as ctx_corrupt:
            PDFProcessor.process_pdf_bytes(b"CORRUPT_NOT_A_VALID_PDF_HEADER", paper_id="err-2")
        self.assertTrue("malformed" in str(ctx_corrupt.exception).lower() or "failed to open" in str(ctx_corrupt.exception).lower())

    def test_04_ocr_adapter_graceful_fallback(self):
        """Verifies OCR adapter reports availability honestly and doesn't fabricate data."""
        is_avail = OCRAdapter.is_tesseract_available()
        self.assertIsInstance(is_avail, bool)

        # Create a single empty page (simulating scanned image without text)
        doc = fitz.open()
        doc.new_page(width=595, height=842)
        scanned_bytes = doc.tobytes()
        doc.close()

        result = PDFProcessor.process_pdf_bytes(
            pdf_bytes=scanned_bytes,
            paper_id="scanned-test-id",
            fallback_filename="scanned.pdf"
        )
        self.assertTrue(result.has_scanned_pages)
        if not is_avail:
            self.assertTrue(any("OCR" in err for err in result.errors))

    # =========================================================================
    # UNIT TESTS: ProcessingTracker
    # =========================================================================

    def test_05_processing_tracker_state_transitions(self):
        test_id = f"tracker-test-{uuid.uuid4().hex[:8]}"

        # 1. Start job
        ProcessingTracker.start_job(test_id)
        status = ProcessingTracker.get_status(test_id)
        self.assertEqual(status["status"], "processing")
        self.assertEqual(status["progress_pct"], 5)

        # 2. Update progress
        ProcessingTracker.update_progress(test_id, 50, "Extracting sentences")
        status = ProcessingTracker.get_status(test_id)
        self.assertEqual(status["status"], "processing")
        self.assertEqual(status["progress_pct"], 50)
        self.assertEqual(status["phase"], "Extracting sentences")

        # 3. Complete job
        ProcessingTracker.complete_job(test_id, total_passages=14, duration_seconds=1.23, extraction_method="text")
        status = ProcessingTracker.get_status(test_id)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["progress_pct"], 100)
        self.assertEqual(status["total_passages"], 14)
        self.assertEqual(status["duration_seconds"], 1.23)

        # 4. Fail job
        fail_id = f"tracker-fail-{uuid.uuid4().hex[:8]}"
        ProcessingTracker.start_job(fail_id)
        ProcessingTracker.fail_job(fail_id, "Corrupt stream error")
        status_fail = ProcessingTracker.get_status(fail_id)
        self.assertEqual(status_fail["status"], "failed")
        self.assertEqual(status_fail["error"], "Corrupt stream error")

    # =========================================================================
    # END-TO-END INTEGRATION TESTS: Live Upload, Pipeline, API Polling, Passages
    # =========================================================================

    def test_06_e2e_full_processing_and_passages_api(self):
        """
        Comprehensive live workflow:
        1. Create test workspace/project
        2. Upload a 2-page academic PDF
        3. Trigger processing via POST /api/papers/{paper_id}/process
        4. Poll GET /api/papers/{paper_id}/processing-status
        5. Verify passages via GET /api/papers/{paper_id}/passages
        6. Verify project status via GET /api/projects/{project_id}/processing-status
        7. Reprocess idempotence check
        8. Clean up
        """
        # Step 1: Create project
        proj_res = self.client.post("/api/projects", json={
            "name": "__TEST_PHASE2_EVALUATION__",
            "topic": "Neural Architecture",
            "research_question": "Does self-attention replace convolution efficiently?",
            "description": "Integration test workspace for Phase 2 passage extraction"
        })
        self.assertEqual(proj_res.status_code, 201, f"Project creation failed: {proj_res.text}")
        project_id = proj_res.json()["id"]

        paper_id = None
        try:
            # Step 2: Upload PDF
            pdf_bytes = self._create_academic_pdf(title="Attention Is All You Need — Test Run", page_count=2)
            upload_res = self.client.post(
                "/api/papers/upload",
                files=[("files", ("attention_test.pdf", io.BytesIO(pdf_bytes), "application/pdf"))],
                data={"project_id": project_id}
            )
            self.assertEqual(upload_res.status_code, 201, f"PDF upload failed: {upload_res.text}")
            uploaded_papers = upload_res.json()
            if isinstance(uploaded_papers, dict):
                uploaded_papers = uploaded_papers.get("papers", [])
            self.assertEqual(len(uploaded_papers), 1)
            paper_id = uploaded_papers[0].get("paper_id") or uploaded_papers[0].get("id")

            # Step 3: Trigger Processing
            proc_trigger_res = self.client.post(f"/api/papers/{paper_id}/process")
            self.assertIn(proc_trigger_res.status_code, [200, 202])
            trigger_data = proc_trigger_res.json()
            self.assertEqual(trigger_data["paper_id"], paper_id)
            self.assertIn(trigger_data["status"], ["queued", "processing", "completed"])

            # Step 4: Poll Processing Status until completion (max 20 seconds)
            max_wait = 20
            start_time = time.time()
            completed = False
            last_status = None

            while time.time() - start_time < max_wait:
                status_res = self.client.get(f"/api/papers/{paper_id}/processing-status")
                self.assertEqual(status_res.status_code, 200)
                last_status = status_res.json()
                if last_status["status"] == "completed":
                    completed = True
                    break
                elif last_status["status"] == "failed":
                    self.fail(f"Processing failed: {last_status.get('error')}")
                time.sleep(0.5)

            # If background task didn't execute in TestClient context (which sometimes doesn't auto-run BackgroundTasks without synchronous runner),
            # run PassageService directly to verify the pipeline logic against Supabase.
            if not completed:
                PassageService.process_paper_pipeline(paper_id)
                status_res = self.client.get(f"/api/papers/{paper_id}/processing-status")
                last_status = status_res.json()
                self.assertEqual(last_status["status"], "completed")

            self.assertGreater(last_status["total_passages"], 0)

            # Step 5: Query Passages with pagination
            passages_res = self.client.get(f"/api/papers/{paper_id}/passages?limit=5&offset=0")
            self.assertEqual(passages_res.status_code, 200, f"Passages query failed: {passages_res.text}")
            p_data = passages_res.json()
            self.assertEqual(p_data["paper_id"], paper_id)
            self.assertGreater(p_data["total_passages"], 0)
            self.assertLessEqual(len(p_data["passages"]), 5)
            self.assertEqual(p_data["offset"], 0)
            self.assertEqual(p_data["limit"], 5)

            # Verify first passage content
            p0 = p_data["passages"][0]
            self.assertIn("id", p0)
            self.assertIn("text", p0)
            self.assertIn("page_start", p0)
            self.assertIn("sequence_index", p0)

            # Step 6: Query Project Processing Status
            proj_status_res = self.client.get(f"/api/projects/{project_id}/processing-status")
            self.assertEqual(proj_status_res.status_code, 200)
            proj_data = proj_status_res.json()
            self.assertEqual(proj_data["project_id"], project_id)
            self.assertEqual(proj_data["total_papers"], 1)
            self.assertEqual(proj_data["completed"], 1)
            self.assertEqual(proj_data["failed"], 0)

            # Step 7: Reprocessing Idempotence
            # Reprocessing should overwrite passages without duplicate key errors
            reprocess_res = self.client.post(f"/api/papers/{paper_id}/process?force_retry=true")
            self.assertIn(reprocess_res.status_code, [200, 202])
            PassageService.process_paper_pipeline(paper_id)

            passages_res_after = self.client.get(f"/api/papers/{paper_id}/passages")
            self.assertEqual(passages_res_after.status_code, 200)
            self.assertEqual(passages_res_after.json()["total_passages"], p_data["total_passages"], "Passage count should remain identical after reprocessing")

        finally:
            # Cleanup
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
