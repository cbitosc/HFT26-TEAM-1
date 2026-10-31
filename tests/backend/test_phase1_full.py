import unittest
import sys
import os
import io
import fitz

# Add src/backend to sys.path
sys.path.insert(0, r"D:\HFT26-TEAM-1\src\backend")

from fastapi.testclient import TestClient
from main import app

class TestPhase1Full(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.pdf_1 = cls._make_pdf("Paper 1: Transformer Pruning", "Pruning multi-head attention heads yields 2x throughput gains.")
        cls.pdf_2 = cls._make_pdf("Paper 2: Quantization Analysis", "FP8 quantization maintains BLEU score across standard translation tasks.")

    @staticmethod
    def _make_pdf(title: str, text: str) -> bytes:
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 80), title, fontsize=16)
        page.insert_text((50, 120), "Abstract", fontsize=12)
        page.insert_text((50, 140), text, fontsize=10)
        page.insert_text((50, 180), "1. Introduction", fontsize=12)
        page.insert_text((50, 200), "Detailed introductory text evaluating empirical metrics.", fontsize=10)
        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    def test_01_project_lifecycle(self):
        # 1. Create project
        create_res = self.client.post("/api/projects", json={
            "name": "__TEST_TRANSFORMER_EFFICIENCY__",
            "topic": "Model Compression",
            "research_question": "Does pruning outperform quantization at high sparsity?",
            "description": "Comparative study between structured pruning and post-training quantization."
        })
        self.assertEqual(create_res.status_code, 201)
        p = create_res.json()
        self.assertIn("id", p)
        self.assertEqual(p["name"], "__TEST_TRANSFORMER_EFFICIENCY__")
        self.assertEqual(p["topic"], "Model Compression")
        self.assertEqual(p["research_question"], "Does pruning outperform quantization at high sparsity?")
        project_id = p["id"]

        try:
            # 2. List projects
            list_res = self.client.get("/api/projects")
            self.assertEqual(list_res.status_code, 200)
            ids = [item["id"] for item in list_res.json()]
            self.assertIn(project_id, ids)

            # 3. Get single project
            get_res = self.client.get(f"/api/projects/{project_id}")
            self.assertEqual(get_res.status_code, 200)
            self.assertEqual(get_res.json()["id"], project_id)

            # 4. Patch project metadata
            patch_res = self.client.patch(f"/api/projects/{project_id}", json={
                "name": "__TEST_TRANSFORMER_EFFICIENCY_UPDATED__",
                "topic": "Efficient Deep Learning"
            })
            self.assertEqual(patch_res.status_code, 200)
            self.assertEqual(patch_res.json()["name"], "__TEST_TRANSFORMER_EFFICIENCY_UPDATED__")
            self.assertEqual(patch_res.json()["topic"], "Efficient Deep Learning")
        finally:
            # 5. Delete project
            del_res = self.client.delete(f"/api/projects/{project_id}")
            self.assertEqual(del_res.status_code, 200)

    def test_02_validation_checks(self):
        # Reject non-PDF
        fake_txt = io.BytesIO(b"Hello world")
        res = self.client.post(
            "/api/papers/upload",
            files=[("files", ("notes.txt", fake_txt, "text/plain"))]
        )
        self.assertEqual(res.status_code, 415)

        # Reject empty file
        empty_pdf = io.BytesIO(b"")
        res2 = self.client.post(
            "/api/papers/upload",
            files=[("files", ("empty.pdf", empty_pdf, "application/pdf"))]
        )
        self.assertEqual(res2.status_code, 400)

        # Reject upload to nonexistent project ID
        valid_pdf = io.BytesIO(self.pdf_1)
        res3 = self.client.post(
            "/api/papers/upload",
            files=[("files", ("test.pdf", valid_pdf, "application/pdf"))],
            data={"project_id": "00000000-0000-0000-0000-000000000000"}
        )
        self.assertEqual(res3.status_code, 404)

    def test_03_multi_pdf_upload_and_duplicates(self):
        # Create dedicated project
        proj = self.client.post("/api/projects", json={
            "name": "__MULTI_UPLOAD_PROJ__",
            "topic": "Multi-Paper Ingestion Test"
        }).json()
        proj_id = proj["id"]

        paper_ids = []
        try:
            # 1. Multi-PDF upload (2 files in 1 request)
            files = [
                ("files", ("transformer_pruning.pdf", io.BytesIO(self.pdf_1), "application/pdf")),
                ("files", ("quantization_analysis.pdf", io.BytesIO(self.pdf_2), "application/pdf")),
            ]
            upload_res = self.client.post(
                "/api/papers/upload",
                files=files,
                data={"project_id": proj_id}
            )
            self.assertEqual(upload_res.status_code, 201)
            results = upload_res.json()
            self.assertEqual(len(results), 2)
            self.assertFalse(results[0]["is_duplicate"])
            self.assertFalse(results[1]["is_duplicate"])
            paper_ids = [r["paper_id"] for r in results]

            # 2. Duplicate detection within same project
            dup_files = [
                ("files", ("transformer_pruning.pdf", io.BytesIO(self.pdf_1), "application/pdf")),
            ]
            dup_res = self.client.post(
                "/api/papers/upload",
                files=dup_files,
                data={"project_id": proj_id}
            )
            self.assertEqual(dup_res.status_code, 201)
            dup_results = dup_res.json()
            self.assertTrue(dup_results[0]["is_duplicate"])
            self.assertIn("already exists", dup_results[0]["message"])

            # 3. List papers for this project
            list_res = self.client.get(f"/api/projects/{proj_id}/papers")
            self.assertEqual(list_res.status_code, 200)
            data = list_res.json()
            self.assertEqual(data["total_papers"], 2)

            # Verify fields
            for p in data["papers"]:
                self.assertIn("id", p)
                self.assertIn("original_filename", p)
                self.assertIn("storage_path", p)
                self.assertIn("file_size", p)
                self.assertIn("status", p)
                self.assertIn("page_count", p)

            # 4. Check signed URL generation from private bucket
            first_paper_id = paper_ids[0]
            url_res = self.client.get(f"/api/papers/{first_paper_id}/pdf-url")
            self.assertEqual(url_res.status_code, 200)
            self.assertIn("signed_url", url_res.json())
            self.assertTrue(url_res.json()["signed_url"].startswith("http"))

        finally:
            # Cleanup papers and project
            for pid in paper_ids:
                self.client.delete(f"/api/papers/{pid}")
            self.client.delete(f"/api/projects/{proj_id}")

if __name__ == "__main__":
    unittest.main()

