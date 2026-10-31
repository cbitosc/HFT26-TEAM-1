import shutil
import logging
from typing import Tuple, Optional

logger = logging.getLogger("veritas.ocr")

class OCRAdapter:
    """
    Modular OCR adapter with automatic engine discovery (Tesseract / pytesseract).
    If OCR engine is not installed, gracefully flags pages without fabricating text.
    """
    _engine_checked = False
    _is_available = False

    @classmethod
    def is_ocr_available(cls) -> bool:
        if not cls._engine_checked:
            # Check if tesseract binary is in system PATH
            tesseract_bin = shutil.which("tesseract")
            if tesseract_bin:
                try:
                    import pytesseract
                    cls._is_available = True
                    logger.info(f"Tesseract OCR engine discovered at {tesseract_bin}")
                except ImportError:
                    logger.warning("Tesseract binary found but pytesseract Python package is not installed.")
                    cls._is_available = False
            else:
                cls._is_available = False
                logger.info("No local OCR engine (Tesseract) detected in system PATH.")
            cls._engine_checked = True
        return cls._is_available

    @classmethod
    def is_tesseract_available(cls) -> bool:
        return cls.is_ocr_available()

    @classmethod
    def extract_text_from_pixmap(cls, pixmap_bytes: bytes) -> Tuple[str, str, Optional[str]]:
        """
        Executes OCR on an image byte array.
        Returns: (extracted_text, extraction_method, error_message)
        """
        if not cls.is_ocr_available():
            return (
                "",
                "ocr_unavailable",
                "Scanned or image-only page detected. OCR engine (Tesseract) is not installed on this host."
            )

        try:
            import pytesseract
            from PIL import Image
            import io

            image = Image.open(io.BytesIO(pixmap_bytes))
            text = pytesseract.image_to_string(image)
            return (text.strip(), "ocr", None)
        except Exception as e:
            logger.error(f"OCR execution failed: {str(e)}")
            return (
                "",
                "ocr_unavailable",
                f"OCR execution error: {str(e)}"
            )
