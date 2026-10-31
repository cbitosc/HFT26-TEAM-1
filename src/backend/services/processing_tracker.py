import time
import threading
from typing import Dict, Any, Optional

class ProcessingTracker:
    _lock = threading.Lock()
    _jobs: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def start_job(cls, paper_id: str, total_pages: int = 1) -> bool:
        """
        Attempts to acquire a processing lock for paper_id.
        Returns False if already actively processing (concurrency protection).
        """
        with cls._lock:
            existing = cls._jobs.get(paper_id)
            if existing and existing.get("status") == "processing":
                return False

            cls._jobs[paper_id] = {
                "paper_id": paper_id,
                "status": "processing",
                "progress_pct": 5,
                "phase": "Downloading document from private storage",
                "total_pages": total_pages,
                "pages_processed": 0,
                "total_passages": 0,
                "duration_seconds": 0.0,
                "extraction_method": "text",
                "is_scanned": False,
                "error": None,
                "started_at": time.time(),
                "completed_at": None
            }
            return True

    @classmethod
    def update_progress(cls, paper_id: str, progress_pct: int, phase: str, pages_processed: int = 0, is_scanned: bool = False):
        with cls._lock:
            if paper_id in cls._jobs:
                cls._jobs[paper_id]["progress_pct"] = min(99, max(0, progress_pct))
                cls._jobs[paper_id]["phase"] = phase
                if pages_processed:
                    cls._jobs[paper_id]["pages_processed"] = pages_processed
                if is_scanned:
                    cls._jobs[paper_id]["is_scanned"] = True

    @classmethod
    def complete_job(cls, paper_id: str, total_passages: int, duration_seconds: float, extraction_method: str = "text", is_scanned: bool = False):
        with cls._lock:
            if paper_id in cls._jobs:
                cls._jobs[paper_id]["status"] = "completed"
                cls._jobs[paper_id]["progress_pct"] = 100
                cls._jobs[paper_id]["phase"] = "Processing and passage segmentation complete"
                cls._jobs[paper_id]["total_passages"] = total_passages
                cls._jobs[paper_id]["duration_seconds"] = duration_seconds
                cls._jobs[paper_id]["extraction_method"] = extraction_method
                cls._jobs[paper_id]["is_scanned"] = is_scanned
                cls._jobs[paper_id]["completed_at"] = time.time()

    @classmethod
    def fail_job(cls, paper_id: str, error_msg: str):
        with cls._lock:
            if paper_id in cls._jobs:
                cls._jobs[paper_id]["status"] = "failed"
                cls._jobs[paper_id]["phase"] = "Processing failed"
                cls._jobs[paper_id]["error"] = error_msg
                cls._jobs[paper_id]["completed_at"] = time.time()

    @classmethod
    def get_status(cls, paper_id: str) -> Dict[str, Any]:
        with cls._lock:
            job = cls._jobs.get(paper_id)
            if job:
                return dict(job)
            return {
                "paper_id": paper_id,
                "status": "pending",
                "progress_pct": 0,
                "phase": "Not yet processed",
                "total_pages": 0,
                "pages_processed": 0,
                "total_passages": 0,
                "duration_seconds": None,
                "extraction_method": None,
                "error": None,
                "is_scanned": False
            }

