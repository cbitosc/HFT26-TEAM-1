import logging
from typing import List, Dict, Any, Optional
from supabase_client import supabase
from services.pdf_processor import PDFProcessor, ProcessedPaperResult
from services.processing_tracker import ProcessingTracker

logger = logging.getLogger("veritas.passages")

class PassageService:
    @classmethod
    def process_paper_pipeline(cls, paper_id: str):
        """
        Background task worker executing the complete PDF processing pipeline:
        1. Private PDF download
        2. PyMuPDF text & metadata extraction
        3. Scanned/OCR detection
        4. Sentence-bounded passage segmentation with stable UUIDs
        5. Database persistence
        """
        try:
            # 1. Fetch Paper Metadata
            p_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
            if not p_res.data:
                ProcessingTracker.fail_job(paper_id, f"Paper '{paper_id}' not found in database.")
                return

            paper = p_res.data[0]
            file_path = paper["file_path"]

            # Discover project_id via workspace_papers
            link_res = supabase.table("workspace_papers").select("workspace_id").eq("paper_id", paper_id).limit(1).execute()
            project_id = link_res.data[0]["workspace_id"] if link_res.data else None

            # 2. Download from Private Storage
            ProcessingTracker.update_progress(paper_id, 15, "Downloading PDF from private storage")
            pdf_bytes = supabase.storage.from_("papers").download(file_path)

            # 3. Process PDF
            ProcessingTracker.update_progress(paper_id, 40, "Extracting page layout and metadata via PyMuPDF")
            filename = (paper.get("metadata_json") or {}).get("original_filename") or paper.get("title") or "document.pdf"

            processed: ProcessedPaperResult = PDFProcessor.process_pdf_bytes(
                pdf_bytes=pdf_bytes,
                paper_id=paper_id,
                project_id=project_id,
                fallback_filename=filename
            )

            # 4. Update Paper Metadata
            ProcessingTracker.update_progress(paper_id, 65, "Updating bibliographic metadata")
            update_payload = {
                "total_pages": processed.page_count,
                "processing_status": "EMBEDDED"
            }
            if processed.abstract and not paper.get("abstract"):
                update_payload["abstract"] = processed.abstract
            if processed.publication_year and not paper.get("publication_year"):
                update_payload["publication_year"] = processed.publication_year
            if processed.authors and not paper.get("authors"):
                update_payload["authors"] = processed.authors

            # Merge metadata
            meta = paper.get("metadata_json") or {}
            if processed.doi:
                meta["doi"] = processed.doi
            meta["processing_duration_seconds"] = processed.duration_seconds
            meta["has_scanned_pages"] = processed.has_scanned_pages
            if processed.errors:
                meta["processing_warnings"] = processed.errors
            update_payload["metadata_json"] = meta

            supabase.table("papers").update(update_payload).eq("id", paper_id).execute()

            # 5. Persist Passages (Safe Reprocessing: Clear previous passages first)
            ProcessingTracker.update_progress(paper_id, 80, "Persisting segmented passages")
            cls._persist_passages(paper_id, project_id, processed)

            # 6. Mark Completion
            method = "ocr" if processed.has_scanned_pages else "text"
            ProcessingTracker.complete_job(
                paper_id=paper_id,
                total_passages=len(processed.passages),
                duration_seconds=processed.duration_seconds,
                extraction_method=method,
                is_scanned=processed.has_scanned_pages
            )
            logger.info(f"Successfully processed paper {paper_id}: {len(processed.passages)} passages in {processed.duration_seconds}s")

        except Exception as e:
            logger.error(f"Paper processing pipeline failed for {paper_id}: {str(e)}")
            ProcessingTracker.fail_job(paper_id, str(e))
            try:
                supabase.table("papers").update({"processing_status": "FAILED"}).eq("id", paper_id).execute()
            except Exception:
                pass

    @classmethod
    def _persist_passages(cls, paper_id: str, project_id: Optional[str], processed: ProcessedPaperResult):
        """
        Dual-mode persistence:
        First attempts to insert into dedicated 'passages' table.
        If 'passages' table does not exist, persists into 'document_chunks'.
        """
        passage_records = [p.to_dict() for p in processed.passages]

        # Try inserting into dedicated passages table
        table_used = "passages"
        try:
            # Clear previous records for idempotence
            supabase.table("passages").delete().eq("paper_id", paper_id).execute()
            
            # Batch insert (50 per batch)
            batch_size = 50
            for i in range(0, len(passage_records), batch_size):
                batch = passage_records[i:i + batch_size]
                supabase.table("passages").insert(batch).execute()
            return
        except Exception as e:
            if "does not exist" in str(e).lower() or "pgrst205" in str(e).lower():
                table_used = "document_chunks"
            else:
                logger.warning(f"Error persisting to passages table: {e}. Falling back to document_chunks.")
                table_used = "document_chunks"

        # Fallback to document_chunks table
        try:
            supabase.table("document_chunks").delete().eq("paper_id", paper_id).execute()
            chunk_records = []
            for p in processed.passages:
                chunk_records.append({
                    "id": p.id,
                    "paper_id": paper_id,
                    "chunk_index": p.sequence_index,
                    "content": p.text,
                    "clean_text": p.text.lower(),
                    "page_number": p.page_start,
                    "bounding_box": {
                        "page": p.page_start,
                        "section_title": p.section_title,
                        "extraction_method": p.extraction_method,
                        "x0": 50.0, "y0": 100.0, "x1": 500.0, "y1": 700.0,
                        "width": 450.0, "height": 600.0
                    },
                    "token_count": max(1, int(len(p.text.split()) * 1.3))
                })

            batch_size = 50
            for i in range(0, len(chunk_records), batch_size):
                batch = chunk_records[i:i + batch_size]
                supabase.table("document_chunks").insert(batch).execute()
        except Exception as e:
            raise RuntimeError(f"Failed to persist passages into database: {str(e)}")

    @classmethod
    def get_passages_for_paper(cls, paper_id: str, page: Optional[int] = None, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        """
        Retrieves segmented passages for a paper with pagination.
        Handles both 'passages' and 'document_chunks' seamlessly.
        """
        # Try passages table first
        try:
            q = supabase.table("passages").select("*", count="exact").eq("paper_id", paper_id)
            if page is not None:
                q = q.eq("page_start", page)
            res = q.order("sequence_index").range(offset, offset + limit - 1).execute()
            
            if res.data is not None:
                total = res.count if res.count is not None else len(res.data)
                return {
                    "paper_id": paper_id,
                    "total_passages": total,
                    "limit": limit,
                    "offset": offset,
                    "passages": res.data
                }
        except Exception:
            pass

        # Fallback to document_chunks table
        q = supabase.table("document_chunks").select("*", count="exact").eq("paper_id", paper_id)
        if page is not None:
            q = q.eq("page_number", page)
        res = q.order("chunk_index").range(offset, offset + limit - 1).execute()

        total = res.count if res.count is not None else len(res.data or [])
        passages = []
        for c in (res.data or []):
            bbox = c.get("bounding_box") or {}
            passages.append({
                "id": c["id"],
                "paper_id": paper_id,
                "project_id": None,
                "page_start": c.get("page_number", 1),
                "page_end": c.get("page_number", 1),
                "section_title": bbox.get("section_title") or "Body",
                "text": c.get("content", ""),
                "sequence_index": c.get("chunk_index", 0),
                "extraction_method": bbox.get("extraction_method") or "text",
                "created_at": c.get("created_at")
            })

        return {
            "paper_id": paper_id,
            "total_passages": total,
            "limit": limit,
            "offset": offset,
            "passages": passages
        }

    @classmethod
    def get_project_processing_status(cls, project_id: str) -> Dict[str, Any]:
        """
        Aggregates processing metrics for all papers linked to project_id.
        """
        links_res = supabase.table("workspace_papers").select("paper_id, papers(id, title, processing_status, total_pages)").eq("workspace_id", project_id).execute()
        
        papers_status = []
        completed = 0
        processing = 0
        pending = 0
        failed = 0

        for item in (links_res.data or []):
            p = item.get("papers")
            if not p:
                continue
            paper_id = p["id"]
            live_job = ProcessingTracker.get_status(paper_id)

            # If job is pending in memory, verify if DB already shows EMBEDDED
            if live_job["status"] == "pending":
                db_status = (p.get("processing_status") or "").upper()
                if db_status in ["EMBEDDED", "PROCESSED", "INDEXED"]:
                    live_job["status"] = "completed"
                    live_job["progress_pct"] = 100
                    live_job["phase"] = "Processing complete"
                elif db_status == "FAILED":
                    live_job["status"] = "failed"
                    live_job["phase"] = "Processing failed"

            # Aggregate
            st = live_job["status"]
            if st == "completed":
                completed += 1
            elif st == "processing":
                processing += 1
            elif st == "failed":
                failed += 1
            else:
                pending += 1

            papers_status.append(live_job)

        return {
            "project_id": project_id,
            "total_papers": len(papers_status),
            "completed": completed,
            "processing": processing,
            "pending": pending,
            "failed": failed,
            "papers": papers_status
        }

