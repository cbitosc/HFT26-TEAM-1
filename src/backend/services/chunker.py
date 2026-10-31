import re
from typing import List, Dict, Any, Optional
from services.pdf_parser import SpatialTextBlock

class ChunkItem:
    def __init__(self, chunk_index: int, content: str, page_number: int, bounding_box: Dict[str, Any], token_count: int, section_type: str = 'BODY'):
        self.chunk_index = chunk_index
        self.content = content.strip()
        self.clean_text = self._normalize_text(content)
        self.page_number = page_number
        self.bounding_box = bounding_box
        self.token_count = token_count
        self.section_type = section_type
        self.section_id: Optional[str] = None

    @staticmethod
    def _normalize_text(text: str) -> str:
        # Normalize whitespace, remove special unicode quotes and hyphens
        cleaned = re.sub(r'[\r\n\t]+', ' ', text)
        cleaned = re.sub(r'[“”]', '"', cleaned)
        cleaned = re.sub(r'[‘’]', "'", cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned)
        return cleaned.strip()

    def to_dict(self, paper_id: Optional[str] = None) -> Dict[str, Any]:
        data = {
            "chunk_index": self.chunk_index,
            "content": self.content,
            "clean_text": self.clean_text,
            "page_number": self.page_number,
            "bounding_box": self.bounding_box,
            "token_count": self.token_count,
        }
        if paper_id:
            data["paper_id"] = paper_id
        if self.section_id:
            data["section_id"] = self.section_id
        return data

class DocumentChunker:
    TARGET_CHUNK_TOKENS = 350
    MIN_CHUNK_TOKENS = 50

    @classmethod
    def chunk_blocks(cls, blocks: List[SpatialTextBlock], sections: List[Dict[str, Any]]) -> List[ChunkItem]:
        """
        Group spatial blocks by page and section into bounded semantic chunks.
        Never crosses page boundaries so that every chunk has a precise page and bounding box.
        """
        if not blocks:
            return []

        chunks: List[ChunkItem] = []
        chunk_idx = 0

        # Group blocks by page
        pages: Dict[int, List[SpatialTextBlock]] = {}
        for block in blocks:
            pages.setdefault(block.page, []).append(block)

        for page_num in sorted(pages.keys()):
            page_blocks = pages[page_num]
            current_buffer: List[SpatialTextBlock] = []
            current_token_count = 0

            for b in page_blocks:
                tokens = max(1, int(len(b.text.split()) * 1.3))
                
                # If adding this block exceeds target tokens and buffer is not empty, emit chunk
                if current_token_count + tokens > cls.TARGET_CHUNK_TOKENS and current_buffer:
                    chunk = cls._create_chunk(chunk_idx, current_buffer, page_num, sections)
                    chunks.append(chunk)
                    chunk_idx += 1
                    current_buffer = [b]
                    current_token_count = tokens
                else:
                    current_buffer.append(b)
                    current_token_count += tokens

            if current_buffer:
                chunk = cls._create_chunk(chunk_idx, current_buffer, page_num, sections)
                chunks.append(chunk)
                chunk_idx += 1

        return chunks

    @classmethod
    def _create_chunk(cls, chunk_idx: int, buffer: List[SpatialTextBlock], page_num: int, sections: List[Dict[str, Any]]) -> ChunkItem:
        content = " ".join([b.text for b in buffer]).strip()
        tokens = max(1, int(len(content.split()) * 1.3))
        
        # Calculate bounding box enclosing all blocks in the chunk
        min_x0 = min(b.x0 for b in buffer)
        min_y0 = min(b.y0 for b in buffer)
        max_x1 = max(b.x1 for b in buffer)
        max_y1 = max(b.y1 for b in buffer)

        bbox = {
            "x0": round(min_x0, 2),
            "y0": round(min_y0, 2),
            "x1": round(max_x1, 2),
            "y1": round(max_y1, 2),
            "width": round(max_x1 - min_x0, 2),
            "height": round(max_y1 - min_y0, 2),
            "page": page_num
        }

        # Determine section type based on page range
        sec_type = "BODY"
        for s in sections:
            if s.get("page_start", 1) <= page_num <= s.get("page_end", page_num):
                sec_type = s.get("section_type", "BODY")
                break

        return ChunkItem(
            chunk_index=chunk_idx,
            content=content,
            page_number=page_num,
            bounding_box=bbox,
            token_count=tokens,
            section_type=sec_type
        )

