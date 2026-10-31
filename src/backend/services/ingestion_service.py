import hashlib
from typing import Dict, Any, List, Optional
from supabase_client import supabase
from services.pdf_parser import PDFParser
from services.chunker import DocumentChunker

class IngestionService:
    @classmethod
    async def ingest_pdf(cls, file_bytes: bytes, filename: str, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Orchestrates full ingestion pipeline:
        1. SHA-256 Deduplication check
        2. Within-project duplicate detection
        3. Supabase Storage upload
        4. PyMuPDF Spatial text extraction
        5. Structured section classification
        6. Bounded chunking with spatial coordinates
        7. Database persistence
        """
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        file_size = len(file_bytes)
        storage_path = f"{file_hash}.pdf"

        # 1. Check if paper already exists globally in the database
        existing = supabase.table("papers").select("id, title, total_pages, processing_status, metadata_json").eq("file_hash", file_hash).execute()
        
        if existing.data:
            existing_paper = existing.data[0]
            paper_id = existing_paper["id"]

            # 2. Check if already linked to this project
            is_already_in_project = False
            if workspace_id:
                link_check = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", workspace_id).eq("paper_id", paper_id).execute()
                if link_check.data:
                    is_already_in_project = True
                else:
                    cls._link_paper_to_workspace(workspace_id, paper_id)

            chunk_count_res = supabase.table("document_chunks").select("id", count="exact").eq("paper_id", paper_id).execute()
            chunk_count = chunk_count_res.count if chunk_count_res.count is not None else 0

            return {
                "paper_id": paper_id,
                "title": existing_paper["title"],
                "original_filename": filename,
                "file_hash": file_hash,
                "total_pages": existing_paper["total_pages"],
                "page_count": existing_paper["total_pages"],
                "total_chunks": chunk_count,
                "total_sections": 0,
                "processing_status": existing_paper["processing_status"],
                "status": existing_paper["processing_status"],
                "is_duplicate": is_already_in_project,
                "message": "Paper already exists in this project." if is_already_in_project else "Existing paper indexed and linked to project."
            }

        # 3. Upload PDF Binary to Supabase Storage (Private 'papers' bucket)
        try:
            supabase.storage.from_("papers").upload(
                storage_path,
                file_bytes,
                file_options={"content-type": "application/pdf"}
            )
        except Exception as e:
            # If already exists in storage from an earlier upload, ignore conflict
            if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                raise RuntimeError(f"Storage upload failed: {str(e)}")

        # 4. Spatial PDF Parsing via PyMuPDF
        parsed = PDFParser.parse_pdf_bytes(file_bytes)
        paper_title = parsed.title if parsed.title and len(parsed.title) > 3 else filename

        # Merge original filename into metadata
        paper_metadata = {
            **parsed.metadata,
            "original_filename": filename
        }

        # 5. Insert Master Paper Record
        paper_record = {
            "title": paper_title,
            "authors": parsed.authors,
            "publication_year": parsed.publication_year,
            "abstract": parsed.abstract,
            "file_path": storage_path,
            "file_hash": file_hash,
            "file_size_bytes": file_size,
            "total_pages": parsed.total_pages,
            "processing_status": "PARSING",
            "metadata_json": paper_metadata
        }

        inserted_paper = supabase.table("papers").insert(paper_record).execute()
        if not inserted_paper.data:
            raise RuntimeError("Failed to insert paper record into database")
        
        paper_id = inserted_paper.data[0]["id"]

        # Link to workspace/project if provided
        if workspace_id:
            cls._link_paper_to_workspace(workspace_id, paper_id)

        # 6. Insert Paper Sections
        section_id_map: Dict[int, str] = {}
        if parsed.sections:
            section_records = []
            for s in parsed.sections:
                section_records.append({
                    "paper_id": paper_id,
                    "title": s["title"],
                    "section_type": s["section_type"],
                    "page_start": s["page_start"],
                    "page_end": s["page_end"],
                    "order_index": s["order_index"]
                })
            
            sec_res = supabase.table("paper_sections").insert(section_records).execute()
            if sec_res.data:
                for idx, row in enumerate(sec_res.data):
                    section_id_map[row.get("order_index", idx)] = row["id"]

        # 7. Generate Semantic Chunks with Bounding Boxes
        chunks = DocumentChunker.chunk_blocks(parsed.blocks, parsed.sections)
        chunk_records = []
        for c in chunks:
            matched_section_id = None
            for s in parsed.sections:
                if s["page_start"] <= c.page_number <= s["page_end"]:
                    matched_section_id = section_id_map.get(s["order_index"])
                    break

            c_dict = c.to_dict(paper_id=paper_id)
            c_dict["section_id"] = matched_section_id
            chunk_records.append(c_dict)

        # Batch insert chunks
        batch_size = 50
        for i in range(0, len(chunk_records), batch_size):
            batch = chunk_records[i:i + batch_size]
            supabase.table("document_chunks").insert(batch).execute()

        # 8. Update Paper Status to EMBEDDED
        supabase.table("papers").update({"processing_status": "EMBEDDED"}).eq("id", paper_id).execute()

        return {
            "paper_id": paper_id,
            "title": paper_title,
            "original_filename": filename,
            "file_hash": file_hash,
            "total_pages": parsed.total_pages,
            "page_count": parsed.total_pages,
            "total_chunks": len(chunk_records),
            "total_sections": len(parsed.sections),
            "processing_status": "EMBEDDED",
            "status": "EMBEDDED",
            "is_duplicate": False,
            "message": "Paper successfully extracted, sectioned, chunked, and indexed."
        }

    @staticmethod
    def _link_paper_to_workspace(workspace_id: str, paper_id: str):
        try:
            supabase.table("workspace_papers").insert({
                "workspace_id": workspace_id,
                "paper_id": paper_id
            }).execute()
        except Exception:
            pass
