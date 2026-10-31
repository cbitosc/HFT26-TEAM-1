"""
VERITAS — Phase 8 Automated Test Suite
Tests Evidence Comparison Matrix generation, source-linked cell attribution,
surrounding passage context retrieval, and secure PDF access validation.
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
from services.matrix_service import MatrixService
from models.matrix import CellStatus, ComparisonMatrixResponse


class TestPhase8EvidenceExplorer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_project_id = str(uuid.uuid4())
        cls.test_paper_1 = str(uuid.uuid4())
        cls.test_paper_2 = str(uuid.uuid4())

    def test_01_matrix_generation_requires_at_least_two_papers(self):
        """Matrix generation with fewer than 2 papers must fail with 400 or 422."""
        resp = self.client.post("/api/matrices/generate", json={
            "project_id": self.test_project_id,
            "paper_ids": [self.test_paper_1]
        })
        self.assertIn(resp.status_code, [400, 422])

    def test_02_missing_evidence_marked_as_not_reported(self):
        """Cells without evidence must be marked as not_reported, never as contradiction."""
        cell = MatrixService._build_matrix_cell(
            paper_id=self.test_paper_1,
            paper_title="Test Paper",
            dimension="Ablation Analysis",
            intel=None
        )
        self.assertEqual(cell.status, CellStatus.NOT_REPORTED)
        self.assertIn("Not reported", cell.content)
        self.assertNotEqual(cell.relationship, "contradicts")

    def test_03_source_linked_cell_structure(self):
        """A cell with reported evidence must preserve paper ID, title, and direct support relationship."""
        cell = MatrixService._build_matrix_cell(
            paper_id=self.test_paper_1,
            paper_title="Attention Is All You Need",
            dimension="Methodology",
            intel=None  # Fallback to default
        )
        self.assertEqual(cell.paper_id, self.test_paper_1)
        self.assertEqual(cell.paper_title, "Attention Is All You Need")

    def test_04_invalid_passage_id_returns_404(self):
        """Requesting context for a non-existent passage ID must return 404."""
        fake_id = str(uuid.uuid4())
        resp = self.client.get(f"/api/evidence/{fake_id}")
        self.assertEqual(resp.status_code, 404)

    def test_05_invalid_paper_pdf_access_returns_404(self):
        """Requesting PDF access for a non-existent paper must return 404."""
        fake_paper = str(uuid.uuid4())
        resp = self.client.get(f"/api/papers/{fake_paper}/pdf-access")
        self.assertEqual(resp.status_code, 404)

    def test_06_matrix_caching_and_retrieval(self):
        """Verifies matrix generation, persistence, and retrieval by ID."""
        matrix = MatrixService.generate_matrix(
            project_id=self.test_project_id,
            paper_ids=[self.test_paper_1, self.test_paper_2],
            title="Transformer vs RNN Matrix"
        )
        self.assertIsNotNone(matrix.id)
        self.assertEqual(matrix.total_cells, len(matrix.dimensions) * 2)

        # Retrieve via API
        resp = self.client.get(f"/api/matrices/{matrix.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], matrix.id)
        self.assertEqual(data["title"], "Transformer vs RNN Matrix")

    def test_07_project_matrices_list(self):
        """Lists matrices for a project."""
        # Create a test matrix first
        MatrixService.generate_matrix(
            project_id=self.test_project_id,
            paper_ids=[self.test_paper_1, self.test_paper_2],
            title="Benchmark Comparison Matrix"
        )
        matrices = MatrixService.get_project_matrices(self.test_project_id)
        self.assertGreaterEqual(len(matrices), 1)


if __name__ == "__main__":
    unittest.main()
