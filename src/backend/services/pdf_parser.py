import re
from typing import Dict, List, Any, Optional, Tuple
import fitz  # PyMuPDF

SECTION_PATTERNS = [
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?abstract\b', 'ABSTRACT'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?introduction\b', 'INTRODUCTION'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:methodology|methods|method|proposed (?:method|approach|framework)|model architecture|system architecture)\b', 'METHODOLOGY'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:experiments|experimental setup|results|findings|evaluation|empirical evaluation)\b', 'RESULTS'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:discussion|analysis|comparative analysis)\b', 'DISCUSSION'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:limitations|threats to validity|scope and limitations)\b', 'LIMITATIONS'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:conclusion|conclusions|concluding remarks|summary)\b', 'CONCLUSION'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:references|bibliography)\b', 'REFERENCES'),
]

def classify_section_header(text: str) -> Optional[str]:
    """Check if a line matches standard academic section headers."""
    clean = text.strip()
    if len(clean) > 80:  # Section headers are typically concise
        return None
    for pattern, section_type in SECTION_PATTERNS:
        if re.search(pattern, clean):
            return section_type
    return None

class SpatialTextBlock:
    def __init__(self, text: str, x0: float, y0: float, x1: float, y1: float, page: int, font_size: float = 10.0, is_bold: bool = False):
        self.text = text.strip()
        self.x0 = round(x0, 2)
        self.y0 = round(y0, 2)
        self.x1 = round(x1, 2)
        self.y1 = round(y1, 2)
        self.width = round(x1 - x0, 2)
        self.height = round(y1 - y0, 2)
        self.page = page
        self.font_size = font_size
        self.is_bold = is_bold

    def to_bbox_dict(self) -> Dict[str, Any]:
        return {
            "x0": self.x0,
            "y0": self.y0,
            "x1": self.x1,
            "y1": self.y1,
            "width": self.width,
            "height": self.height,
            "page": self.page
        }

class ParsedPDF:
    def __init__(self):
        self.title: str = "Untitled Document"
        self.authors: List[str] = []
        self.publication_year: Optional[int] = None
        self.abstract: Optional[str] = None
        self.total_pages: int = 0
        self.blocks: List[SpatialTextBlock] = []
        self.sections: List[Dict[str, Any]] = []
        self.metadata: Dict[str, Any] = {}

class PDFParser:
    @staticmethod
    def parse_pdf_bytes(pdf_bytes: bytes) -> ParsedPDF:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        parsed = ParsedPDF()
        parsed.total_pages = len(doc)
        
        # Read embedded PDF metadata
        doc_meta = doc.metadata or {}
        embedded_title = doc_meta.get("title", "").strip()
        embedded_author = doc_meta.get("author", "").strip()
        parsed.metadata = {
            "creator": doc_meta.get("creator"),
            "producer": doc_meta.get("producer"),
            "creation_date": doc_meta.get("creationDate"),
            "format": doc_meta.get("format")
        }

        all_blocks: List[SpatialTextBlock] = []
        max_font_size_page1 = 0.0
        candidate_title = ""
        candidate_authors = []
        candidate_abstract = []
        in_abstract = False
        
        # Track detected sections
        current_section = {
            "title": "Abstract / Overview",
            "section_type": "ABSTRACT",
            "page_start": 1,
            "page_end": 1,
            "order_index": 0
        }
        detected_sections: List[Dict[str, Any]] = [current_section]

        for page_idx in range(len(doc)):
            page_num = page_idx + 1
            page = doc[page_idx]
            
            # Use get_text("dict") to inspect fonts and coordinates
            page_dict = page.get_text("dict", sort=True)
            
            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:  # 0 is text block, 1 is image
                    continue
                
                block_text_parts = []
                max_span_font = 0.0
                is_span_bold = False
                
                for line in block.get("lines", []):
                    line_text = ""
                    for span in line.get("spans", []):
                        txt = span.get("text", "")
                        line_text += txt
                        font_size = span.get("size", 10.0)
                        flags = span.get("flags", 0)
                        if font_size > max_span_font:
                            max_span_font = font_size
                        if flags & 2 or "bold" in span.get("font", "").lower():
                            is_span_bold = True
                    if line_text.strip():
                        block_text_parts.append(line_text.strip())
                
                block_full_text = " ".join(block_text_parts).strip()
                if not block_full_text:
                    continue

                bbox = block.get("bbox", (0, 0, 0, 0))
                spatial_block = SpatialTextBlock(
                    text=block_full_text,
                    x0=bbox[0],
                    y0=bbox[1],
                    x1=bbox[2],
                    y1=bbox[3],
                    page=page_num,
                    font_size=max_span_font,
                    is_bold=is_span_bold
                )
                all_blocks.append(spatial_block)

                # Heuristic 1: Title and Author extraction from Page 1
                if page_num == 1:
                    if max_span_font > max_font_size_page1 and len(block_full_text) > 5 and len(block_full_text) < 250:
                        max_font_size_page1 = max_span_font
                        candidate_title = block_full_text

                # Section header detection
                detected_type = classify_section_header(block_full_text)
                if detected_type:
                    # Close previous section
                    detected_sections[-1]["page_end"] = page_num
                    # Start new section
                    new_sec = {
                        "title": block_full_text,
                        "section_type": detected_type,
                        "page_start": page_num,
                        "page_end": page_num,
                        "order_index": len(detected_sections)
                    }
                    detected_sections.append(new_sec)
                    if detected_type == 'ABSTRACT':
                        in_abstract = True
                    else:
                        in_abstract = False
                elif in_abstract:
                    candidate_abstract.append(block_full_text)

        # Update last section page_end
        if detected_sections:
            detected_sections[-1]["page_end"] = parsed.total_pages

        # Fallback Title
        if candidate_title:
            parsed.title = candidate_title
        elif embedded_title and len(embedded_title) > 3:
            parsed.title = embedded_title
        elif all_blocks:
            parsed.title = all_blocks[0].text[:120]

        # Extract year heuristic from text (e.g. 2018-2026)
        first_page_text = " ".join([b.text for b in all_blocks if b.page == 1])
        year_match = re.search(r'\b(20[12][0-9]|199[0-9])\b', first_page_text)
        if year_match:
            parsed.publication_year = int(year_match.group(1))

        if candidate_abstract:
            parsed.abstract = " ".join(candidate_abstract)

        # Clean authors if present in embedded metadata
        if embedded_author:
            parsed.authors = [a.strip() for a in re.split(r'[,;]|\band\b', embedded_author) if a.strip()]

        parsed.blocks = all_blocks
        parsed.sections = detected_sections
        return parsed

