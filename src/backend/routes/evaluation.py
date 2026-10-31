"""
VERITAS — Phase 10: Evaluation & Benchmarking API Routes
Exposes endpoints for running scientific benchmark evaluations,
inspecting evaluation history, and retrieving official benchmark templates.
"""

import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body, Query
from pydantic import BaseModel

try:
    from ..services.evaluation_service import EvaluationBenchmarkService
    from ..models.evaluation import (
        EvaluationRunResponse,
        ListEvaluationRunsResponse,
        EvaluationRun
    )
except (ImportError, ValueError):
    from services.evaluation_service import EvaluationBenchmarkService
    from models.evaluation import (
        EvaluationRunResponse,
        ListEvaluationRunsResponse,
        EvaluationRun
    )

router = APIRouter(prefix="/api/evaluation", tags=["Evaluation & Benchmarking"])


class RunBenchmarkJsonRequest(BaseModel):
    dataset_name: Optional[str] = "Uploaded Scientific Benchmark"
    dataset_content: Optional[str] = None
    target_project_id: Optional[str] = None
    is_official_run: bool = False
    samples: Optional[List[Dict[str, Any]]] = None


@router.post("/run", response_model=EvaluationRunResponse)
async def run_evaluation_benchmark(
    file: Optional[UploadFile] = File(None),
    dataset_name: Optional[str] = Form(None),
    target_project_id: Optional[str] = Form(None),
    is_official_run: bool = Form(False),
    body: Optional[RunBenchmarkJsonRequest] = Body(None)
):
    """
    Executes automated scientific evaluation against an uploaded benchmark dataset (JSON/JSONL).
    Runs in an isolated sandbox context so test items never leak into user projects.
    """
    content = ""
    filename = "benchmark_dataset.json"

    if file:
        filename = file.filename or filename
        raw_bytes = await file.read()
        content = raw_bytes.decode("utf-8", errors="replace")
        name = dataset_name or filename
    elif body and body.dataset_content:
        content = body.dataset_content
        name = body.dataset_name or dataset_name or "JSON Dataset"
        target_project_id = body.target_project_id or target_project_id
        is_official_run = body.is_official_run
    elif body and body.samples:
        content = json.dumps(body.samples)
        name = body.dataset_name or dataset_name or "JSON Dataset"
        target_project_id = body.target_project_id or target_project_id
        is_official_run = body.is_official_run
    else:
        raise HTTPException(
            status_code=400,
            detail="No benchmark dataset provided. Please upload a JSON/JSONL file or provide dataset_content."
        )

    try:
        info, samples = EvaluationBenchmarkService.validate_and_parse_dataset(content, filename=filename)
        run = EvaluationBenchmarkService.run_benchmark(
            samples=samples,
            dataset_name=name,
            target_project_id=target_project_id,
            is_official_run=is_official_run
        )
        return EvaluationRunResponse(run=run)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


@router.get("/runs", response_model=ListEvaluationRunsResponse)
def list_evaluation_runs():
    """Returns list of past evaluation runs with summary metrics."""
    runs = EvaluationBenchmarkService.list_runs()
    return ListEvaluationRunsResponse(
        total_runs=len(runs),
        runs=runs
    )


@router.get("/runs/{run_id}", response_model=EvaluationRunResponse)
def get_evaluation_run(run_id: str):
    """Retrieves full diagnostics and sample outcomes for a specific evaluation run."""
    run = EvaluationBenchmarkService.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Evaluation run '{run_id}' not found.")
    return EvaluationRunResponse(run=run)


@router.get("/template")
def get_benchmark_template():
    """Returns official benchmark schema specifications and example samples."""
    return EvaluationBenchmarkService.get_benchmark_template()
