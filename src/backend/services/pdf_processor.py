import re
import time
import uuid
import hashlib
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
from services.ocr_adapter import OCRAdapter

SECTION_REGEXES = [
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?abstract\b', 'Abstract'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?introduction\b', 'Introduction'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:methodology|methods|method|proposed (?:method|approach|framework)|model architecture)\b', 'Methodology'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:experiments|experimental setup|results|findings|evaluation)\b', 'Results'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:discussion|analysis|comparative analysis)\b', 'Discussion'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:limitations|threats to validity)\b', 'Limitations'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:conclusion|conclusions|concluding remarks)\b', 'Conclusion'),
    (r'(?i)^\s*(?:[0-9IVX]+\.?\s*)?(?:references|bibliography)\b', 'References'),
]

DOI_REGEX = r'\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+\b'

def detect_section_title(line: str) -> Optional[str]:
    clean = line.strip()
    if len(clean) > 80:
        return None
    for pattern, name in SECTION_REGEXES:
        if re.search(pattern, clean):
            return name
    return None

class ProcessedPassage:
    def __init__(
        self,
        passage_id: str,
        paper_id: str,
        project_id: Optional[str],
        page_start: int,
        page_end: int,
        section_title: Optional[str],
        text: str,
        sequence_index: int,
        extraction_method: str = 'text'
    ):
        self.id = passage_id
        self.paper_id = paper_id
        self.project_id = project_id
        self.page_start = page_start
        self.page_end = page_end
        self.section_title = section_title
        self.text = text
        self.sequence_index = sequence_index
        self.extraction_method = extraction_method

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "paper_id": self.paper_id,
            "project_id": self.project_id,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "section_title": self.section_title,
            "text": self.text,
            "sequence_index": self.sequence_index,
            "extraction_method": self.extraction_method
        }

class ProcessedPaperResult:
    def __init__(self, paper_id: str = ""):
        self.paper_id: str = paper_id
        self.title: str = ""
        self.authors: List[str] = []
        self.publication_year: Optional[int] = None
        self.abstract: Optional[str] = None
        self.doi: Optional[str] = None
        self.page_count: int = 0
        self.passages: List[ProcessedPassage] = []
        self.has_scanned_pages: bool = False
        self.duration_seconds: float = 0.0
        self.metadata: Dict[str, Any] = {}
        self.errors: List[str] = []

class PDFProcessor:
    TARGET_PASSAGE_WORDS = 250
    MIN_PASSAGE_WORDS = 15
    OVERLAP_SENTENCES = 1

    @classmethod
    def process_pdf_bytes(
        cls,
        pdf_bytes: bytes,
        paper_id: str,
        project_id: Optional[str] = None,
        fallback_filename: str = "document.pdf"
    ) -> ProcessedPaperResult:
        start_time = time.time()
        result = ProcessedPaperResult(paper_id=paper_id)

        if not pdf_bytes or len(pdf_bytes) == 0:
            raise ValueError("PDF file is empty (0 bytes). Cannot process document.")

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            raise ValueError(f"Malformed or corrupted PDF file: {str(e)}")

        if doc.is_encrypted:
            raise ValueError("PDF is encrypted or password-protected. Cannot extract content.")

        if len(doc) == 0:
            raise ValueError("PDF contains zero pages.")

        result.page_count = len(doc)
        raw_metadata = doc.metadata or {}
        result.metadata = {
            "format": raw_metadata.get("format"),
            "creator": raw_metadata.get("creator"),
            "producer": raw_metadata.get("producer")
        }

        # Page-by-page extraction
        all_passages: List[ProcessedPassage] = []
        full_document_text = ""
        current_section = "Abstract / Overview"
        sequence_counter = 0

        max_font_p1 = 0.0
        candidate_title = ""
        candidate_abstract = []
        in_abstract = False

        for page_idx in range(len(doc)):
            page_num = page_idx + 1
            page = doc[page_idx]

            # Extract text blocks
            page_dict = page.get_text("dict", sort=True)
            page_blocks = []
            page_char_count = 0

            for b in page_dict.get("blocks", []):
                if b.get("type") != 0:
                    continue
                block_lines = []
                for line in b.get("lines", []):
                    line_text = "".join([span.get("text", "") for span in line.get("spans", [])]).strip()
                    if line_text:
                        block_lines.append(line_text)
                        # Page 1 Title candidate
                        if page_num == 1:
                            for span in line.get("spans", []):
                                sz = span.get("size", 10.0)
                                if sz > max_font_p1 and len(line_text) > 4 and len(line_text) < 200:
                                    max_font_p1 = sz
                                    candidate_title = line_text

                block_str = " ".join(block_lines).strip()
                if block_str:
                    page_blocks.append(block_str)
                    page_char_count += len(block_str)

            # Check if page is scanned or empty
            extraction_method = "text"
            if page_char_count < 40:
                result.has_scanned_pages = True
                pixmap = page.get_pixmap(dpi=150)
                ocr_text, ocr_method, ocr_err = OCRAdapter.extract_text_from_pixmap(pixmap.tobytes())
                if ocr_text:
                    page_blocks = [ocr_text]
                    extraction_method = ocr_method
                else:
                    extraction_method = ocr_method
                    if ocr_err:
                        result.errors.append(f"Page {page_num}: {ocr_err}")

            page_full_text = "\n\n".join(page_blocks)
            full_document_text += " " + page_full_text

            # Segment page into paragraphs and sentence-bounded passages
            for block in page_blocks:
                sec_match = detect_section_title(block)
                if sec_match:
                    current_section = sec_match
                    if sec_match == 'Abstract':
                        in_abstract = True
                    else:
                        in_abstract = False
                    continue
                elif in_abstract:
                    candidate_abstract.append(block)

                # Segment paragraph into sentences
                sentences = re.split(r'(?<=[.!?])\s+', block)
                current_passage_sentences = []
                current_word_count = 0

                for sent in sentences:
                    clean_sent = sent.strip()
                    if not clean_sent:
                        continue
                    w_count = len(clean_sent.split())
                    current_passage_sentences.append(clean_sent)
                    current_word_count += w_count

                    if current_word_count >= cls.TARGET_PASSAGE_WORDS:
                        p_text = " ".join(current_passage_sentences).strip()
                        if len(p_text.split()) >= cls.MIN_PASSAGE_WORDS:
                            # Generate deterministic stable UUID5
                            text_hash = hashlib.md5(p_text[:80].encode('utf-8')).hexdigest()
                            stable_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{paper_id}_p{page_num}_s{sequence_counter}_{text_hash}"))
                            
                            all_passages.append(
                                ProcessedPassage(
                                    passage_id=stable_id,
                                    paper_id=paper_id,
                                    project_id=project_id,
                                    page_start=page_num,
                                    page_end=page_num,
                                    section_title=current_section,
                                    text=p_text,
                                    sequence_index=sequence_counter,
                                    extraction_method=extraction_method
                                )
                            )
                            sequence_counter += 1

                        # Keep overlap sentence
                        if len(current_passage_sentences) > cls.OVERLAP_SENTENCES:
                            current_passage_sentences = current_passage_sentences[-cls.OVERLAP_SENTENCES:]
                            current_word_count = sum(len(s.split()) for s in current_passage_sentences)
                        else:
                            current_passage_sentences = []
                            current_word_count = 0

                # Trailing sentences in block
                if current_passage_sentences:
                    p_text = " ".join(current_passage_sentences).strip()
                    if len(p_text.split()) >= cls.MIN_PASSAGE_WORDS or (len(p_text.split()) >= 5 and len(all_passages) == 0):
                        text_hash = hashlib.md5(p_text[:80].encode('utf-8')).hexdigest()
                        stable_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{paper_id}_p{page_num}_s{sequence_counter}_{text_hash}"))
                        all_passages.append(
                            ProcessedPassage(
                                passage_id=stable_id,
                                paper_id=paper_id,
                                project_id=project_id,
                                page_start=page_num,
                                page_end=page_num,
                                section_title=current_section,
                                text=p_text,
                                sequence_index=sequence_counter,
                                extraction_method=extraction_method
                            )
                        )
                        sequence_counter += 1

        # Title & Bibliographic metadata extraction
        if candidate_title:
            result.title = candidate_title
        elif raw_metadata.get("title"):
            result.title = raw_metadata["title"].strip()
        else:
            result.title = fallback_filename

        if raw_metadata.get("author"):
            result.authors = [a.strip() for a in re.split(r'[,;]|\band\b', raw_metadata["author"]) if a.strip()]

        if candidate_abstract:
            result.abstract = " ".join(candidate_abstract)

        # DOI extraction
        doi_match = re.search(DOI_REGEX, full_document_text)
        if doi_match:
            result.doi = doi_match.group(0).rstrip('.')

        # Publication year extraction
        year_match = re.search(r'\b(20[12][0-9]|199[0-9])\b', full_document_text[:1500])
        if year_match:
            result.publication_year = int(year_match.group(1))

        result.passages = all_passages
        result.duration_seconds = round(time.time() - start_time, 3)
        return result
