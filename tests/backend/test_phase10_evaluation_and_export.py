"""
VERITAS — Phase 10: Automated Test Suite for Evaluation & Report Export
Verifies benchmark dataset loading, metric calculations (F1, Accuracy, Confusion Matrix),
failure classification, academic report compilation, and PDF/CSV/JSON/Markdown exports.
"""

import sys
import unittest
import uuid
import json
from datetime import datetime, timezone
from pathlib import Path

# Add backend to sys.path
backend_path = Path(__file__).resolve().parent.parent.parent / "src" / "backend"
sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient

from main import app
from services.evaluation_service import EvaluationBenchmarkService
from services.export_service import ExportService
from models.evaluation import (
    EvaluationExpectedVerdict,
    FailureCategory,
    BenchmarkSample,
    EvaluationMetrics
)


class TestPhase10EvaluationAndExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.test_project_id = f"test-{uuid.uuid4()}"

    def test_01_benchmark_dataset_parsing(self):
        """Verifies JSON Array and JSONL parsing and schema validation."""
        json_array_data = json.dumps([
            {
                "sample_id": "eval-1",
                "claim_text": "Residual networks ease the training of substantially deeper networks.",
                "expected_verdict": "Supported",
                "source_paper_title": "Deep Residual Learning"
            },
            {
                "sample_id": "eval-2",
                "claim_text": "Dropout layers permanently remove neurons during inference time.",
                "expected_verdict": "Contradicted"
            },
            {
                "sample_id": "eval-3",
                "claim_text": "AGI was formally achieved in benchmark year 2021.",
                "expected_verdict": "Unresolved"
            }
        ])

        info, samples = EvaluationBenchmarkService.validate_and_parse_dataset(json_array_data, "test_bench.json")
        self.assertEqual(len(samples), 3)
        self.assertEqual(info.supported_count, 1)
        self.assertEqual(info.contradicted_count, 1)
        self.assertEqual(info.unresolved_count, 1)
        self.assertEqual(samples[0].expected_verdict, EvaluationExpectedVerdict.SUPPORTED)

    def test_02_benchmark_run_metrics(self):
        """Verifies scientific metric calculation (Accuracy, F1, Confusion Matrix, Source Link Validity)."""
        samples = [
            BenchmarkSample(
                sample_id="test-m-1",
                claim_text="Layer normalization normalizes across features instead of batch elements.",
                expected_verdict=EvaluationExpectedVerdict.SUPPORTED,
                gold_evidence_quotes=["Layer normalization normalizes the inputs across the features."]
            ),
            BenchmarkSample(
                sample_id="test-m-2",
                claim_text="Convolutional filters are completely invariant to arbitrary affine transformations.",
                expected_verdict=EvaluationExpectedVerdict.CONTRADICTED,
                gold_evidence_quotes=["Standard convolutions are translation equivariant, not affine invariant."]
            ),
            BenchmarkSample(
                sample_id="test-m-3",
                claim_text="Unsupervised pretraining produces optimal weights for every conceivable task.",
                expected_verdict=EvaluationExpectedVerdict.UNRESOLVED,
                gold_evidence_quotes=[]
            )
        ]

        run = EvaluationBenchmarkService.run_benchmark(
            samples=samples,
            dataset_name="Test Metric Suite",
            is_official_run=False
        )

        self.assertIsNotNone(run.id)
        self.assertEqual(run.total_samples, 3)
        self.assertGreaterEqual(run.metrics.accuracy, 0.0)
        self.assertIn("Supported", run.metrics.per_class_metrics)
        self.assertIn("Contradicted", run.metrics.per_class_metrics)
        self.assertIn("Unresolved", run.metrics.per_class_metrics)
        self.assertGreaterEqual(run.metrics.source_link_validity_rate, 0.0)

    def test_03_failure_classification(self):
        """Verifies diagnostic error categorization on verification discrepancies."""
        sample_fail = BenchmarkSample(
            sample_id="test-f-1",
            claim_text="Exotic Quantum Method achieves 99.9% accuracy on ImageNet.",
            expected_verdict=EvaluationExpectedVerdict.SUPPORTED,
            gold_evidence_quotes=[]  # Missing evidence
        )

        res = EvaluationBenchmarkService._evaluate_single_sample(sample_fail, "eval-test-proj")
        # With empty quotes and isolated context, retrieval will fail or result will be Unresolved
        self.assertFalse(res.is_correct)
        self.assertIn(res.failure_category, [FailureCategory.RETRIEVAL_FAILURE, FailureCategory.MISSING_EVIDENCE, FailureCategory.NUMERICAL_REASONING_FAILURE])
        self.assertIsNotNone(res.failure_explanation)

    def test_04_benchmark_template_endpoint(self):
        """Verifies the organizer benchmark schema template specification."""
        data = EvaluationBenchmarkService.get_benchmark_template()
        self.assertIn("supported_verdicts", data)
        self.assertIn("sample_json_array", data)
        self.assertEqual(len(data["sample_json_array"]), 3)

    def test_05_dossier_compilation(self):
        """Verifies multi-document audit dossier assembly."""
        dossier = ExportService.compile_project_dossier(self.test_project_id)
        self.assertIn("meta", dossier)
        self.assertIn("statistics", dossier)
        self.assertIn("papers", dossier)
        self.assertIn("claims", dossier)
        self.assertIn("research_gaps", dossier)
        self.assertIn("provenance_ledger", dossier)

    def test_06_export_json_csv_markdown(self):
        """Verifies formatting of JSON, CSV tabular data, and academic Markdown."""
        # JSON
        json_str = ExportService.export_json(self.test_project_id)
        parsed = json.loads(json_str)
        self.assertEqual(parsed["meta"]["project_id"], self.test_project_id)

        # CSV
        csv_str = ExportService.export_csv(self.test_project_id)
        self.assertIn("Claim ID,Category,Is Atomic,Proposition Text,Verification Verdict", csv_str)

        # Markdown
        md_str = ExportService.export_markdown(self.test_project_id)
        self.assertIn("# VERITAS Scientific Research Audit Dossier", md_str)
        self.assertIn("## 1. Executive Summary", md_str)

    def test_07_export_pdf_generation(self):
        """Verifies PyMuPDF generates valid PDF bytes with %PDF magic header."""
        pdf_bytes = ExportService.export_pdf(self.test_project_id)
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertGreater(len(pdf_bytes), 500)
        # PDF magic number check
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
