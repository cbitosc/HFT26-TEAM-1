import unittest
import sys
import os
import io
import fitz  # PyMuPDF

# Add src/backend to path
sys.path.insert(0, r"D:\HFT26-TEAM-1\src\backend")

from services.pdf_parser import PDFParser, classify_section_header
from services.chunker import DocumentChunker
from fastapi.testclient import TestClient
from main import app

class TestIngestionPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.synthetic_pdf_bytes = cls._generate_synthetic_research_pdf()

    @staticmethod
    def _generate_synthetic_research_pdf() -> bytes:
        """Create a multi-page standard academic research paper in-memory with PyMuPDF."""
        doc = fitz.open()
        
        # Page 1: Title, Abstract, Introduction
        page1 = doc.new_page(width=595, height=842) # A4
        page1.insert_text((50, 80), "Neural Graph Verification: Auditing Scientific Claims", fontsize=18, fontname="helv")
        page1.insert_text((50, 110), "Jane Doe, Alan Turing, Ada Lovelace", fontsize=11, fontname="helv")
        
        page1.insert_text((50, 150), "Abstract", fontsize=14, fontname="helv")
        page1.insert_text((50, 175), "We introduce a novel neural auditing framework for cross-document empirical validation.", fontsize=10, fontname="helv")
        page1.insert_text((50, 195), "Our method reduces quotation hallucination by 42.5% across 1,200 benchmark papers.", fontsize=10, fontname="helv")
        
        page1.insert_text((50, 240), "1. Introduction", fontsize=14, fontname="helv")
        page1.insert_text((50, 265), "Modern large language models struggle with verifiable attribution in scientific literature.", fontsize=10, fontname="helv")
        page1.insert_text((50, 285), "Existing approaches often generate plausible but fabricated citations.", fontsize=10, fontname="helv")

        # Page 2: Methodology, Limitations, Conclusion
        page2 = doc.new_page(width=595, height=842)
        page2.insert_text((50, 80), "2. Methodology", fontsize=14, fontname="helv")
        page2.insert_text((50, 105), "We employ dual-index Reciprocal Rank Fusion combined with exact token-level quotation matching.", fontsize=10, fontname="helv")
        
        page2.insert_text((50, 160), "3. Limitations", fontsize=14, fontname="helv")
        page2.insert_text((50, 185), "Our evaluation is restricted to English-language academic publications with standard layouts.", fontsize=10, fontname="helv")
        page2.insert_text((50, 205), "Scanned documents with severe optical degradation may produce OCR noise.", fontsize=10, fontname="helv")
        
        page2.insert_text((50, 260), "4. Conclusion", fontsize=14, fontname="helv")
        page2.insert_text((50, 285), "VERITAS demonstrates that deterministic quotation auditing is feasible and scalable.", fontsize=10, fontname="helv")

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    def test_section_header_classifier(self):
        self.assertEqual(classify_section_header("Abstract"), "ABSTRACT")
        self.assertEqual(classify_section_header("1. Introduction"), "INTRODUCTION")
        self.assertEqual(classify_section_header("2. Methodology"), "METHODOLOGY")
        self.assertEqual(classify_section_header("3. Limitations and Future Work"), "LIMITATIONS")
        self.assertEqual(classify_section_header("4. Conclusion"), "CONCLUSION")
        self.assertIsNone(classify_section_header("This is just a regular sentence in a paragraph."))

    def test_pdf_spatial_parsing(self):
        parsed = PDFParser.parse_pdf_bytes(self.synthetic_pdf_bytes)
        self.assertEqual(parsed.total_pages, 2)
        self.assertIn("Neural Graph Verification", parsed.title)
        self.assertGreaterEqual(len(parsed.blocks), 6)
        
        # Check that bounding boxes are populated
        first_block = parsed.blocks[0]
        self.assertGreater(first_block.width, 0)
        self.assertGreater(first_block.height, 0)
        self.assertEqual(first_block.page, 1)

        # Check section detection
        section_types = [s["section_type"] for s in parsed.sections]
        self.assertIn("ABSTRACT", section_types)
        self.assertIn("INTRODUCTION", section_types)
        self.assertIn("METHODOLOGY", section_types)
        self.assertIn("LIMITATIONS", section_types)

    def test_spatial_chunking(self):
        parsed = PDFParser.parse_pdf_bytes(self.synthetic_pdf_bytes)
        chunks = DocumentChunker.chunk_blocks(parsed.blocks, parsed.sections)
        self.assertGreater(len(chunks), 0)
        
        for c in chunks:
            self.assertIn("x0", c.bounding_box)
            self.assertIn("y0", c.bounding_box)
            self.assertIn("width", c.bounding_box)
            self.assertIn("page", c.bounding_box)
            self.assertGreater(len(c.clean_text), 0)
            self.assertGreater(c.token_count, 0)

    def test_workspace_api_crud(self):
        # 1. Create Workspace
        create_res = self.client.post("/api/v1/workspaces", json={
            "name": "__TEST_AUDIT_WORKSPACE__",
            "description": "Integration testing workspace for VERITAS Phase 1"
        })
        self.assertEqual(create_res.status_code, 201)
        ws_data = create_res.json()
        ws_id = ws_data["id"]
        self.assertEqual(ws_data["name"], "__TEST_AUDIT_WORKSPACE__")

        try:
            # 2. List Workspaces
            list_res = self.client.get("/api/v1/workspaces")
            self.assertEqual(list_res.status_code, 200)
            ws_ids = [w["id"] for w in list_res.json()]
            self.assertIn(ws_id, ws_ids)

            # 3. Get Workspace
            get_res = self.client.get(f"/api/v1/workspaces/{ws_id}")
            self.assertEqual(get_res.status_code, 200)
            self.assertEqual(get_res.json()["id"], ws_id)
        finally:
            # 4. Cleanup Workspace
            del_res = self.client.delete(f"/api/v1/workspaces/{ws_id}")
            self.assertEqual(del_res.status_code, 200)

    def test_end_to_end_paper_ingestion_api(self):
        # 1. Create Workspace
        create_ws = self.client.post("/api/v1/workspaces", json={
            "name": "__TEST_PAPER_INGESTION_WS__",
            "description": "Workspace for testing end-to-end PDF ingestion"
        })
        self.assertEqual(create_ws.status_code, 201)
        ws_id = create_ws.json()["id"]

        paper_id = None
        try:
            # 2. Upload Synthetic PDF to Workspace
            files = [("files", ("synthetic_audit_paper.pdf", io.BytesIO(self.synthetic_pdf_bytes), "application/pdf"))]
            upload_res = self.client.post(
                "/api/v1/papers/upload",
                files=files,
                data={"workspace_id": ws_id}
            )
            self.assertEqual(upload_res.status_code, 201)
            upload_data = upload_res.json()
            self.assertEqual(len(upload_data), 1)
            
            p_data = upload_data[0]
            paper_id = p_data["paper_id"]
            self.assertEqual(p_data["total_pages"], 2)
            self.assertGreater(p_data["total_chunks"], 0)
            self.assertEqual(p_data["processing_status"], "EMBEDDED")

            # 3. Get Paper Detail
            detail_res = self.client.get(f"/api/v1/papers/{paper_id}")
            self.assertEqual(detail_res.status_code, 200)
            detail = detail_res.json()
            self.assertEqual(detail["id"], paper_id)
            self.assertGreater(len(detail["sections"]), 0)
            self.assertGreater(detail["chunk_count"], 0)

            # 4. Get Paper Chunks with Bounding Boxes
            chunks_res = self.client.get(f"/api/v1/papers/{paper_id}/chunks")
            self.assertEqual(chunks_res.status_code, 200)
            chunks_data = chunks_res.json()
            self.assertGreater(chunks_data["count"], 0)
            first_chunk = chunks_data["chunks"][0]
            self.assertIn("bounding_box", first_chunk)
            self.assertIn("clean_text", first_chunk)

            # 5. Get PDF Signed URL
            url_res = self.client.get(f"/api/v1/papers/{paper_id}/pdf-url")
            self.assertEqual(url_res.status_code, 200)
            self.assertIn("signed_url", url_res.json())
            self.assertTrue(url_res.json()["signed_url"].startswith("http"))

        finally:
            # 6. Cleanup
            if paper_id:
                self.client.delete(f"/api/v1/papers/{paper_id}")
            self.client.delete(f"/api/v1/workspaces/{ws_id}")

if __name__ == "__main__":
    unittest.main()

