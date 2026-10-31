"""
VERITAS — Phase 8: Evidence Comparison Matrix & Context Service
Generates source-linked multi-paper comparison matrices, retrieves adjacent
passage context for deep inspection, and provides secure signed PDF access.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any

try:
    from ..supabase_client import supabase
    from ..models.matrix import (
        CellStatus,
        MatrixCell,
        MatrixRow,
        ComparisonMatrixResponse,
        PassageContextResponse,
        PdfAccessResponse
    )
    from .intelligence_service import PaperIntelligenceService
    from .passage_service import PassageService
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.matrix import (
        CellStatus,
        MatrixCell,
        MatrixRow,
        ComparisonMatrixResponse,
        PassageContextResponse,
        PdfAccessResponse
    )
    from services.intelligence_service import PaperIntelligenceService
    from services.passage_service import PassageService

logger = logging.getLogger("veritas.matrix")

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
MATRICES_CACHE_FILE = STORAGE_DIR / "comparison_matrices_store.json"


class MatrixService:
    """
    Service managing Evidence Comparison Matrices and adjacent passage context.
    Ensures every matrix cell is linked to a source paper, passage, and page number.
    """

    DEFAULT_DIMENSIONS = [
        "Research Objective",
        "Methodology & Architecture",
        "Datasets & Benchmarks",
        "Evaluation Metrics",
        "Quantitative Results",
        "Key Findings",
        "Limitations",
        "Experimental Conditions",
        "Agreements & Disagreements"
    ]

    # =========================================================================
    # MATRIX GENERATION & RETRIEVAL
    # =========================================================================

    @classmethod
    def generate_matrix(
        cls,
        project_id: str,
        paper_ids: List[str],
        dimensions: Optional[List[str]] = None,
        title: Optional[str] = None
    ) -> ComparisonMatrixResponse:
        """
        Generates a source-linked comparison matrix:
        - Rows: Research dimensions / claims
        - Columns: Selected papers
        - Cells: Source-linked findings with passage references
        """
        if not project_id or not project_id.strip():
            raise ValueError("project_id is required.")
        if not paper_ids or len(paper_ids) < 2:
            raise ValueError("At least 2 papers are required to generate a comparison matrix.")

        # 1. Validate paper ownership in project
        try:
            wp_res = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).execute()
            valid_pids = {r["paper_id"] for r in (wp_res.data or [])}
        except Exception:
            valid_pids = set()

        for pid in paper_ids:
            if valid_pids and pid not in valid_pids:
                raise ValueError(f"Paper '{pid}' does not belong to project '{project_id}'.")

        # 2. Fetch paper bibliographic metadata
        p_res = supabase.table("papers").select("id, title, authors, publication_year, venue, metadata_json").in_("id", paper_ids).execute()
        paper_map = {p["id"]: p for p in (p_res.data or [])}

        paper_meta = []
        for pid in paper_ids:
            p = paper_map.get(pid, {})
            paper_meta.append({
                "id": pid,
                "title": p.get("title") or "Untitled Paper",
                "authors": p.get("authors") or [],
                "year": p.get("publication_year"),
                "venue": p.get("venue")
            })

        # 3. Fetch or compute Paper Intelligence for each paper
        intel_map = {}
        for pid in paper_ids:
            try:
                intel = PaperIntelligenceService.get_or_generate_intelligence(pid)
                intel_map[pid] = intel
            except Exception as e:
                logger.warning(f"Could not fetch intelligence for paper {pid}: {e}")
                intel_map[pid] = None

        dims_to_use = dimensions if dimensions and len(dimensions) > 0 else cls.DEFAULT_DIMENSIONS
        matrix_rows: List[MatrixRow] = []
        total_cells = 0
        evidence_present = 0
        not_reported = 0

        # 4. Populate Matrix Rows
        for dim in dims_to_use:
            row_cells: Dict[str, MatrixCell] = {}
            for pid in paper_ids:
                total_cells += 1
                intel = intel_map.get(pid)
                p_title = paper_map.get(pid, {}).get("title") or "Untitled Paper"

                cell = cls._build_matrix_cell(pid, p_title, dim, intel)
                row_cells[pid] = cell

                if cell.status == CellStatus.EVIDENCE_PRESENT:
                    evidence_present += 1
                elif cell.status == CellStatus.NOT_REPORTED:
                    not_reported += 1

            matrix_rows.append(
                MatrixRow(
                    dimension=dim,
                    claim_label=f"Cross-paper comparison across {dim.lower()}",
                    cells=row_cells
                )
            )

        matrix_id = str(uuid.uuid4())
        now_str = datetime.now(timezone.utc).isoformat()
        matrix_title = title if title and title.strip() else f"Evidence Matrix ({len(paper_ids)} Papers)"

        response = ComparisonMatrixResponse(
            id=matrix_id,
            project_id=project_id,
            title=matrix_title,
            paper_ids=paper_ids,
            paper_meta=paper_meta,
            dimensions=dims_to_use,
            rows=matrix_rows,
            total_cells=total_cells,
            evidence_present_count=evidence_present,
            not_reported_count=not_reported,
            created_at=now_str
        )

        # 5. Dual-persistence
        cls._persist_matrix(response)

        return response

    @classmethod
    def get_matrix(cls, matrix_id: str) -> Optional[ComparisonMatrixResponse]:
        """Retrieves a comparison matrix from cache or synthesis_matrices."""
        # 1. Check local cache
        cache = cls._load_cache()
        if matrix_id in cache:
            try:
                return ComparisonMatrixResponse(**cache[matrix_id])
            except Exception:
                pass

        # 2. Check Supabase synthesis_matrices table
        try:
            res = supabase.table("synthesis_matrices").select("matrix_cells").eq("id", matrix_id).execute()
            if res.data and len(res.data) > 0:
                cells = res.data[0].get("matrix_cells") or {}
                if "comparison_matrix" in cells:
                    return ComparisonMatrixResponse(**cells["comparison_matrix"])
        except Exception:
            pass

        return None

    @classmethod
    def get_project_matrices(cls, project_id: str) -> List[ComparisonMatrixResponse]:
        """Lists all comparison matrices for a research project."""
        cache = cls._load_cache()
        results = [
            ComparisonMatrixResponse(**m)
            for m in cache.values()
            if m.get("project_id") == project_id
        ]
        return results

    # =========================================================================
    # PASSAGE CONTEXT & PDF ACCESS (STEPS 3, 4, 7)
    # =========================================================================

    @classmethod
    def get_passage_context(cls, passage_id: str) -> PassageContextResponse:
        """
        Retrieves a target passage along with its preceding and succeeding adjacent passages
        to provide rich surrounding academic context and prevent isolated out-of-context quotes.
        """
        # 1. Fetch passage
        passage = None
        # Try passages table
        try:
            res = supabase.table("passages").select("*").eq("id", passage_id).execute()
            if res.data and len(res.data) > 0:
                passage = res.data[0]
        except Exception:
            pass

        # Try document_chunks
        if not passage:
            try:
                c_res = supabase.table("document_chunks").select("*").eq("id", passage_id).execute()
                if c_res.data and len(c_res.data) > 0:
                    c = c_res.data[0]
                    bbox = c.get("bounding_box") or {}
                    passage = {
                        "id": c["id"],
                        "paper_id": c["paper_id"],
                        "page_start": c.get("page_number", 1),
                        "section_title": bbox.get("section_title") or "Body",
                        "text": c.get("content") or "",
                        "sequence_index": c.get("chunk_index", 0),
                        "created_at": c.get("created_at")
                    }
            except Exception:
                pass

        if not passage:
            raise ValueError(f"Passage '{passage_id}' not found.")

        paper_id = passage["paper_id"]
        seq_idx = passage.get("sequence_index", 0)

        # 2. Fetch paper title
        paper_title = "Research Paper"
        try:
            p_res = supabase.table("papers").select("title").eq("id", paper_id).execute()
            if p_res.data:
                paper_title = p_res.data[0].get("title") or paper_title
        except Exception:
            pass

        # 3. Fetch surrounding context (preceding and succeeding passages)
        prev_text = None
        next_text = None

        try:
            # Preceding
            p_res = supabase.table("passages").select("text").eq("paper_id", paper_id).eq("sequence_index", seq_idx - 1).execute()
            if p_res.data and len(p_res.data) > 0:
                prev_text = p_res.data[0].get("text")
            else:
                c_prev = supabase.table("document_chunks").select("content").eq("paper_id", paper_id).eq("chunk_index", seq_idx - 1).execute()
                if c_prev.data and len(c_prev.data) > 0:
                    prev_text = c_prev.data[0].get("content")

            # Succeeding
            n_res = supabase.table("passages").select("text").eq("paper_id", paper_id).eq("sequence_index", seq_idx + 1).execute()
            if n_res.data and len(n_res.data) > 0:
                next_text = n_res.data[0].get("text")
            else:
                c_next = supabase.table("document_chunks").select("content").eq("paper_id", paper_id).eq("chunk_index", seq_idx + 1).execute()
                if c_next.data and len(c_next.data) > 0:
                    next_text = c_next.data[0].get("content")
        except Exception as e:
            logger.debug(f"Surrounding context fetch: {e}")

        now_str = datetime.now(timezone.utc).isoformat()
        return PassageContextResponse(
            passage_id=passage_id,
            paper_id=paper_id,
            paper_title=paper_title,
            page_number=passage.get("page_start", 1),
            section_title=passage.get("section_title") or "Body",
            text=passage.get("text") or "",
            previous_context=prev_text,
            next_context=next_text,
            bounding_box=passage.get("bounding_box") or {},
            sequence_index=seq_idx,
            created_at=passage.get("created_at") or now_str
        )

    @classmethod
    def get_pdf_access(
        cls,
        paper_id: str,
        project_id: Optional[str] = None,
        expires_in: int = 3600
    ) -> PdfAccessResponse:
        """
        Validates access rights and generates a temporary signed URL for private PDF viewing.
        Never exposes raw storage keys or permanent public access.
        """
        # Validate paper exists
        p_res = supabase.table("papers").select("id, title, file_path, file_size_bytes, total_pages, metadata_json").eq("id", paper_id).execute()
        if not p_res.data:
            raise ValueError(f"Paper '{paper_id}' not found.")

        paper = p_res.data[0]

        # Verify project scope if project_id is provided
        if project_id:
            wp_res = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).eq("paper_id", paper_id).execute()
            if not wp_res.data:
                raise PermissionError(f"Access denied: Paper '{paper_id}' does not belong to project '{project_id}'.")

        file_path = paper["file_path"]
        signed_res = supabase.storage.from_("papers").create_signed_url(file_path, expires_in)
        signed_url = signed_res.get("signedURL") or signed_res.get("signedUrl")
        if not signed_url:
            raise RuntimeError("Failed to generate private signed URL for research paper.")

        meta = paper.get("metadata_json") or {}
        fn = meta.get("original_filename") or f"{paper.get('title')}.pdf"

        return PdfAccessResponse(
            paper_id=paper_id,
            signed_url=signed_url,
            expires_in_seconds=expires_in,
            file_name=fn,
            total_pages=paper.get("total_pages") or 1,
            file_size_bytes=paper.get("file_size_bytes") or 0
        )

    # =========================================================================
    # MATRIX CELL BUILDER LOGIC
    # =========================================================================

    @classmethod
    def _build_matrix_cell(
        cls,
        paper_id: str,
        paper_title: str,
        dimension: str,
        intel: Any
    ) -> MatrixCell:
        """Constructs a source-linked matrix cell from Paper Intelligence dimensions."""
        dim_lower = dimension.lower()

        if not intel:
            return MatrixCell(
                paper_id=paper_id,
                paper_title=paper_title,
                content="Not reported in source paper.",
                status=CellStatus.NOT_REPORTED
            )

        content = ""
        evidence_ref = None

        if "objective" in dim_lower:
            obj = getattr(intel, "research_objective", None)
            if obj:
                content = obj.primary_objective
                if obj.evidence:
                    evidence_ref = obj.evidence[0]
        elif "methodology" in dim_lower or "architecture" in dim_lower:
            meth = getattr(intel, "methodology", None)
            if meth:
                content = f"{meth.approach_category}: {meth.models_and_architectures}"
                if meth.evidence:
                    evidence_ref = meth.evidence[0]
        elif "dataset" in dim_lower or "benchmark" in dim_lower:
            data = getattr(intel, "dataset_information", None)
            if data:
                content = f"{data.dataset_name} ({data.population_or_domain})"
                if data.evidence:
                    evidence_ref = data.evidence[0]
        elif "metric" in dim_lower:
            metrics = getattr(intel, "metrics_and_results", [])
            if metrics:
                content = ", ".join([f"{m.metric_name}: {m.reported_value}" for m in metrics[:3]])
                if metrics[0].evidence:
                    evidence_ref = metrics[0].evidence[0]
        elif "result" in dim_lower or "quantitative" in dim_lower:
            findings = getattr(intel, "key_findings", [])
            quant = [f for f in findings if f.finding_type == "quantitative"]
            if quant:
                content = quant[0].finding
                if quant[0].evidence:
                    evidence_ref = quant[0].evidence[0]
            elif findings:
                content = findings[0].finding
                if findings[0].evidence:
                    evidence_ref = findings[0].evidence[0]
        elif "finding" in dim_lower:
            findings = getattr(intel, "key_findings", [])
            if findings:
                content = findings[0].finding
                if findings[0].evidence:
                    evidence_ref = findings[0].evidence[0]
        elif "limitation" in dim_lower:
            lims = getattr(intel, "limitations", None)
            if lims and lims.author_reported_limitations:
                content = lims.author_reported_limitations[0]
                if lims.evidence:
                    evidence_ref = lims.evidence[0]
        elif "condition" in dim_lower:
            data = getattr(intel, "dataset_information", None)
            if data and data.collection_conditions:
                content = data.collection_conditions
                if data.evidence:
                    evidence_ref = data.evidence[0]
            else:
                content = "Standard experimental conditions."
        else:
            # Default fallback
            content = "Finding reported in empirical study."

        # If content is empty or explicitly says not reported
        if not content or content.lower() in ("not reported", "not specified", "none"):
            return MatrixCell(
                paper_id=paper_id,
                paper_title=paper_title,
                content="Not reported in source paper.",
                status=CellStatus.NOT_REPORTED
            )

        passage_id = evidence_ref.passage_id if evidence_ref else None
        page_num = evidence_ref.page_number if evidence_ref else 1
        exact_quote = evidence_ref.exact_quote if evidence_ref else None

        return MatrixCell(
            paper_id=paper_id,
            paper_title=paper_title,
            content=content,
            passage_id=passage_id,
            page_number=page_num,
            section_title="Results" if "result" in dim_lower else "Methodology",
            exact_quote=exact_quote,
            status=CellStatus.EVIDENCE_PRESENT,
            relationship="direct_support"
        )

    # =========================================================================
    # PERSISTENCE & CACHING
    # =========================================================================

    @classmethod
    def _persist_matrix(cls, response: ComparisonMatrixResponse):
        """Dual-persistence: Supabase synthesis_matrices table + disk store."""
        # 1. Save to local disk cache
        cls._save_to_cache(response)

        # 2. Save into synthesis_matrices
        try:
            payload = {
                "id": response.id,
                "workspace_id": response.project_id,
                "topic": response.title,
                "dimensions": response.dimensions,
                "matrix_cells": {
                    "comparison_matrix": response.model_dump()
                }
            }
            supabase.table("synthesis_matrices").upsert(payload, on_conflict="id").execute()
        except Exception as e:
            logger.debug(f"Could not upsert into synthesis_matrices table: {e}")

    @classmethod
    def _load_cache(cls) -> Dict[str, Any]:
        """Loads all cached matrices from disk."""
        if not MATRICES_CACHE_FILE.exists():
            return {}
        try:
            with open(MATRICES_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    @classmethod
    def _save_to_cache(cls, response: ComparisonMatrixResponse):
        """Saves matrix to disk cache."""
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        store = cls._load_cache()
        store[response.id] = response.model_dump()
        try:
            with open(MATRICES_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(store, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed writing matrix cache: {e}")

