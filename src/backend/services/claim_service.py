"""
VERITAS — Phase 6: Claim Decomposition Service
Transforms research summaries and cross-paper syntheses into atomic, individually
verifiable claims while strictly preserving paragraph, sentence, and claim order.
"""

import os
import re
import uuid
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

try:
    from ..supabase_client import supabase
    from ..models.claim import (
        ClaimCategory,
        ClaimTypeDb,
        VerificationStatus,
        AtomicClaim,
        SentenceDecomposition,
        ParagraphDecomposition,
        DecomposeClaimsRequest,
        OutputClaimsResponse,
    )
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.claim import (
        ClaimCategory,
        ClaimTypeDb,
        VerificationStatus,
        AtomicClaim,
        SentenceDecomposition,
        ParagraphDecomposition,
        DecomposeClaimsRequest,
        OutputClaimsResponse,
    )

logger = logging.getLogger(__name__)

# Persistent local cache file for resilient output-to-claims retrieval
CACHE_DIR = Path(__file__).resolve().parent.parent / "storage"
CACHE_FILE = CACHE_DIR / "decomposed_claims_store.json"


class ClaimDecompositionService:
    """
    Core engine for transforming summary/synthesis output prose into atomic
    propositions with strict provenance, position tracking, and atomicity analysis.
    """

    MODEL_NAME = "veritas-claim-decomposer-v1"
    PROMPT_VERSION = "2026.1"

    # Category classification patterns
    PATTERNS_NUMERICAL = re.compile(
        r"(\b\d+(\.\d+)?\s*(%|percent|ms|s|seconds|epochs|parameters|params|GB|MB|KB|tokens|fold|samples|images)\b|"
        r"\bp\s*[<>=]\s*0?\.\d+|"
        r"\b\d+(\.\d+)?x\s*(speedup|faster|improvement|reduction)\b|"
        r"\b(accuracy|f1|bleu|rouge|auc|loss|precision|recall|map|mrr|latency|throughput|perplexity)\s*(of|score|value|rate)?\s*[:=]?\s*\d+(\.\d+)?%?|"
        r"(?<![-_a-zA-Z0-9])\d+\.\d+(?![-_a-zA-Z0-9]))",
        re.IGNORECASE
    )

    PATTERNS_COMPARATIVE = re.compile(
        r"\b(outperformed|outperforms|better than|faster than|superior to|exceeded|exceeds|lower error|higher accuracy|improved upon|compared with|compared to|baseline|state-of-the-art|sota|surpassed|surpasses|versus|vs\.)\b",
        re.IGNORECASE
    )

    PATTERNS_METHODOLOGICAL = re.compile(
        r"\b(propose|proposed|framework|architecture|algorithm|model|transformer|pipeline|loss function|optimizer|sgd|adam|gradient descent|stochastic gradient descent|regularization|attention mechanism|fine-tuned|trained on|trained using|training procedure|module|technique|methodology|formulation|ablation|neural network|convolutional|backpropagation)\b",
        re.IGNORECASE
    )

    PATTERNS_DATASET = re.compile(
        r"\b(dataset|benchmark|corpus|data split|samples|annotated|training set|test set|validation set|ImageNet|GLUE|SQuAD|COCO|SuperGLUE|synthetic data|benchmark suite|evaluated on\s+[A-Z0-9_\-]+)\b",
        re.IGNORECASE
    )

    PATTERNS_RESULT = re.compile(
        r"\b(achieved|achieves|demonstrates|demonstrated|results show|findings indicate|observed that|yielded|yields|attained|attains|converged|exhibited|empirically shows)\b",
        re.IGNORECASE
    )

    PATTERNS_GENERALIZATION = re.compile(
        r"\b(generalize|generalized|generalizes|generalization|transferability|cross-domain|out-of-distribution|ood|zero-shot|few-shot|robustness|transfer learning|cross-dataset)\b",
        re.IGNORECASE
    )

    PATTERNS_LIMITATION = re.compile(
        r"\b(limitation|drawback|weakness|failure mode|fails when|struggles with|computationally expensive|high latency|resource intensive|restricted to|bottleneck|caveat|sensitive to)\b",
        re.IGNORECASE
    )

    PATTERNS_SPECULATIVE_AMBIGUOUS = re.compile(
        r"\b(speculate that|might indicate|could suggest|perhaps|it is plausible that|we hypothesize without|arguably|seems to suggest|may imply)\b",
        re.IGNORECASE
    )

    # Conjoined predicates verbs for atomic splitting
    VERB_CONJUNCTION_PATTERN = re.compile(
        r"^(and|as well as|while)\s+(also\s+)?(outperformed|outperforms|generalized|generalizes|achieved|achieves|demonstrated|demonstrates|improved|improves|reduced|reduces|yielded|yields|evaluated|evaluates|surpassed|surpasses|introduced|introduces|showed|shows|attained|attains|exceeded|exceeds)\b",
        re.IGNORECASE
    )

    # =========================================================================
    # PUBLIC LIFECYCLE METHODS
    # =========================================================================

    @classmethod
    def decompose_output(
        cls,
        output_id: str,
        project_id: str,
        original_text: Optional[str] = None,
        paper_ids: Optional[List[str]] = None,
        force_regenerate: bool = False
    ) -> OutputClaimsResponse:
        """
        Decomposes a research summary or synthesis output into atomic claims.
        Preserves original paragraph, sentence, and claim order.
        """
        if not output_id or not output_id.strip():
            raise ValueError("output_id is required.")
        if not project_id or not project_id.strip():
            raise ValueError("project_id is required.")

        # 1. Check existing cached decomposition unless force_regenerate is requested
        if not force_regenerate:
            cached = cls.get_output_claims(output_id)
            if cached:
                return cached

        # 2. Resolve original text if not explicitly provided
        resolved_text = original_text
        resolved_paper_id = paper_ids[0] if paper_ids and len(paper_ids) > 0 else None

        if not resolved_text or not resolved_text.strip():
            resolved_text, source_paper_id = cls._fetch_output_text(output_id, project_id)
            if not resolved_paper_id:
                resolved_paper_id = source_paper_id

        if not resolved_text or not resolved_text.strip():
            raise ValueError(f"No text content found for output '{output_id}'. Please provide original_text.")

        # 3. Execute deterministic sentence and atomic proposition parsing
        paragraphs, all_claims = cls._parse_text_into_claims(
            text=resolved_text,
            output_id=output_id,
            project_id=project_id,
            source_paper_id=resolved_paper_id
        )

        # 4. Compute statistics & breakdowns
        total_sentences = sum(len(p.sentences) for p in paragraphs)
        total_claims = len(all_claims)
        atomic_count = sum(1 for c in all_claims if c.is_atomic)
        compound_count = total_claims - atomic_count

        breakdown: Dict[str, int] = {}
        for c in all_claims:
            cat = c.category.value
            breakdown[cat] = breakdown.get(cat, 0) + 1

        now_str = datetime.now(timezone.utc).isoformat()
        response = OutputClaimsResponse(
            output_id=output_id,
            project_id=project_id,
            original_text=resolved_text,
            paragraphs=paragraphs,
            claims=all_claims,
            total_paragraphs=len(paragraphs),
            total_sentences=total_sentences,
            total_claims=total_claims,
            atomic_claims_count=atomic_count,
            compound_claims_count=compound_count,
            categories_breakdown=breakdown,
            created_at=now_str
        )

        # 5. Persist claims to DB and local cache
        cls._persist_claims(response, resolved_paper_id)

        return response

    @classmethod
    def get_output_claims(cls, output_id: str) -> Optional[OutputClaimsResponse]:
        """Retrieves stored claims for an output ID from local cache or DB."""
        # 1. Check local persistent file store
        cache_data = cls._load_cache()
        if output_id in cache_data:
            try:
                return OutputClaimsResponse(**cache_data[output_id])
            except Exception as e:
                logger.warning(f"Error parsing cached claims for output '{output_id}': {e}")

        # 2. Check synthesis_matrices matrix_cells
        try:
            res = supabase.table("synthesis_matrices").select("matrix_cells, workspace_id").eq("id", output_id).execute()
            if res.data and len(res.data) > 0:
                cells = res.data[0].get("matrix_cells") or {}
                if "claims_response" in cells:
                    return OutputClaimsResponse(**cells["claims_response"])
        except Exception:
            pass

        # 3. Check papers metadata_json saved_summaries
        try:
            p_res = supabase.table("papers").select("metadata_json").execute()
            for p in (p_res.data or []):
                meta = p.get("metadata_json") or {}
                for s in meta.get("saved_summaries", []):
                    if s.get("id") == output_id and "claims_response" in s:
                        return OutputClaimsResponse(**s["claims_response"])
        except Exception:
            pass

        return None

    @classmethod
    def get_claim(cls, claim_id: str) -> Optional[AtomicClaim]:
        """Retrieves a single decomposed claim by ID."""
        # Check cache
        cache_data = cls._load_cache()
        for out_id, out_data in cache_data.items():
            for c_dict in out_data.get("claims", []):
                if c_dict.get("id") == claim_id:
                    return AtomicClaim(**c_dict)

        # Check Supabase claims table
        try:
            res = supabase.table("claims").select("*").eq("id", claim_id).execute()
            if res.data and len(res.data) > 0:
                row = res.data[0]
                # Convert DB row to AtomicClaim
                cat = cls._map_db_type_to_category(row.get("claim_type", "EMPIRICAL"))
                return AtomicClaim(
                    id=row["id"],
                    output_id=row.get("workspace_id", ""),
                    project_id=row.get("workspace_id", ""),
                    source_paper_id=row.get("source_paper_id"),
                    original_text=row.get("claim_text", ""),
                    normalized_text=row.get("claim_text", ""),
                    paragraph_index=0,
                    sentence_index=0,
                    claim_index=0,
                    original_position={},
                    is_atomic=True,
                    category=cat,
                    decomposition_notes="Retrieved directly from database master table",
                    verification_status=row.get("verification_status", VerificationStatus.UNVERIFIED),
                    confidence_score=row.get("confidence_score", 1.0),
                    created_at=row.get("created_at", datetime.now(timezone.utc).isoformat())
                )
        except Exception:
            pass

        return None

    # =========================================================================
    # DECOMPOSITION & NLP LOGIC
    # =========================================================================

    @classmethod
    def _parse_text_into_claims(
        cls,
        text: str,
        output_id: str,
        project_id: str,
        source_paper_id: Optional[str]
    ) -> Tuple[List[ParagraphDecomposition], List[AtomicClaim]]:
        """
        Splits text into paragraphs, sentences, and atomic propositions.
        Preserves natural narrative order: Paragraph -> Sentence -> Atomic Claim.
        """
        raw_paragraphs = cls._split_into_paragraphs(text)
        paragraph_decomps: List[ParagraphDecomposition] = []
        all_claims: List[AtomicClaim] = []

        running_char_offset = 0

        for p_idx, p_text in enumerate(raw_paragraphs):
            p_text_clean = p_text.strip()
            if not p_text_clean:
                continue

            # Find paragraph start offset in original text
            p_start_offset = text.find(p_text, running_char_offset)
            if p_start_offset == -1:
                p_start_offset = running_char_offset
            running_char_offset = p_start_offset + len(p_text)

            sentences = cls._split_into_sentences(p_text_clean)
            sentence_decomps: List[SentenceDecomposition] = []

            p_running_offset = 0
            for s_idx, s_text in enumerate(sentences):
                s_text_clean = s_text.strip()
                if not s_text_clean:
                    continue

                s_start = p_text_clean.find(s_text, p_running_offset)
                if s_start == -1:
                    s_start = p_running_offset
                s_end = s_start + len(s_text)
                p_running_offset = s_end

                # Global char coordinates
                global_s_start = p_start_offset + s_start
                global_s_end = p_start_offset + s_end

                # Decompose sentence into atomic propositions
                raw_propositions = cls._decompose_sentence_into_propositions(s_text_clean)

                sentence_claims: List[AtomicClaim] = []
                for c_idx, (prop_text, is_atomic, notes) in enumerate(raw_propositions):
                    claim_id = str(uuid.uuid4())
                    category = cls._classify_claim(prop_text, is_atomic)
                    
                    # Compute normalized text
                    normalized = cls._normalize_claim_text(prop_text)

                    pos = {
                        "paragraph_index": p_idx,
                        "sentence_index": s_idx,
                        "claim_index": c_idx,
                        "start_char": global_s_start,
                        "end_char": global_s_end
                    }

                    now_str = datetime.now(timezone.utc).isoformat()
                    claim = AtomicClaim(
                        id=claim_id,
                        output_id=output_id,
                        project_id=project_id,
                        source_paper_id=source_paper_id,
                        original_text=s_text_clean,
                        normalized_text=normalized,
                        paragraph_index=p_idx,
                        sentence_index=s_idx,
                        claim_index=c_idx,
                        original_position=pos,
                        is_atomic=is_atomic,
                        category=category,
                        decomposition_notes=notes,
                        verification_status=VerificationStatus.UNVERIFIED,
                        confidence_score=0.95 if is_atomic else 0.85,
                        created_at=now_str
                    )
                    sentence_claims.append(claim)
                    all_claims.append(claim)

                sentence_decomps.append(
                    SentenceDecomposition(
                        sentence_index=s_idx,
                        original_sentence=s_text_clean,
                        start_char=global_s_start,
                        end_char=global_s_end,
                        claims=sentence_claims
                    )
                )

            paragraph_decomps.append(
                ParagraphDecomposition(
                    paragraph_index=p_idx,
                    original_paragraph=p_text_clean,
                    sentences=sentence_decomps
                )
            )

        return paragraph_decomps, all_claims

    @classmethod
    def _split_into_paragraphs(cls, text: str) -> List[str]:
        """Splits markdown prose into paragraphs, handling headers and line breaks."""
        raw_blocks = text.split("\n\n")
        paragraphs = []
        for block in raw_blocks:
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
            if not lines:
                continue
            # If line is markdown header, remove leading '#' marks
            clean_lines = []
            for ln in lines:
                if ln.startswith("#"):
                    stripped = re.sub(r"^#+\s*", "", ln).strip()
                    if stripped:
                        clean_lines.append(stripped)
                elif ln.startswith(("-", "*", "•")):
                    # List bullet point
                    stripped = re.sub(r"^[-*•]\s*", "", ln).strip()
                    if stripped:
                        clean_lines.append(stripped)
                else:
                    clean_lines.append(ln)
            if clean_lines:
                paragraphs.append(" ".join(clean_lines))
        return paragraphs

    @classmethod
    def _split_into_sentences(cls, text: str) -> List[str]:
        """
        Tokenizes sentences with protection against academic abbreviations,
        decimal numbers, citations, and section headings.
        """
        protected = text

        # Protect known abbreviations
        abbrs = [
            ("e.g.", "__ABBR_EG__"),
            ("i.e.", "__ABBR_IE__"),
            ("et al.", "__ABBR_ETAL__"),
            ("Fig.", "__ABBR_FIG__"),
            ("Figs.", "__ABBR_FIGS__"),
            ("Tab.", "__ABBR_TAB__"),
            ("Sec.", "__ABBR_SEC__"),
            ("Eq.", "__ABBR_EQ__"),
            ("Ref.", "__ABBR_REF__"),
            ("vs.", "__ABBR_VS__"),
            ("ca.", "__ABBR_CA__"),
            ("cf.", "__ABBR_CF__"),
            ("Dr.", "__ABBR_DR__"),
            ("Prof.", "__ABBR_PROF__"),
            ("approx.", "__ABBR_APPROX__"),
            ("al.", "__ABBR_AL__"),
        ]
        for abbr, token in abbrs:
            protected = re.sub(re.escape(abbr), token, protected, flags=re.IGNORECASE)

        # Protect decimal numbers (e.g. 94.2, 0.05)
        protected = re.sub(r"(\d+)\.(\d+)", r"\1__DECIMAL_DOT__\2", protected)

        # Sentence boundary split: period, exclamation, or question mark followed by whitespace and uppercase
        raw_splits = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])", protected)

        clean_sentences = []
        for s in raw_splits:
            restored = s
            for abbr, token in abbrs:
                restored = restored.replace(token, abbr)
            restored = restored.replace("__DECIMAL_DOT__", ".")
            restored = restored.strip()
            if restored:
                clean_sentences.append(restored)

        # Fallback if no sentence delimiter matched
        if not clean_sentences and text.strip():
            clean_sentences.append(text.strip())

        return clean_sentences

    @classmethod
    def _decompose_sentence_into_propositions(cls, sentence: str) -> List[Tuple[str, bool, str]]:
        """
        Decomposes a sentence into individual atomic factual propositions.
        Returns tuples of (proposition_text, is_atomic, decomposition_notes).

        Handles:
        1. Semicolons ';' separating independent clauses.
        2. Conjoined predicates: "Model A outperformed Model B on Dataset X and generalized better to Dataset Y"
           -> Claim 1: "Model A outperformed Model B on Dataset X"
           -> Claim 2: "Model A generalized better to Dataset Y"
        3. Independent coordinated clauses with 'and', 'while', 'whereas', 'but'.
        4. Compound numerical/metric statements.
        5. Ambiguous or speculative statements marked as non-atomic.
        """
        s = sentence.strip()

        # Step 4: Check if statement is speculative or ambiguous
        if cls.PATTERNS_SPECULATIVE_AMBIGUOUS.search(s):
            return [(
                s,
                False,
                "Compound/mixed statement: contains speculative or interpretive framing without direct empirical assertion."
            )]

        # Check semicolon split first
        if ";" in s:
            parts = [p.strip() for p in s.split(";") if p.strip()]
            if len(parts) > 1:
                decomposed = []
                for idx, part in enumerate(parts):
                    # Clean trailing/leading punctuation
                    clean_part = part.rstrip(".")
                    decomposed.append((
                        clean_part + ".",
                        True,
                        f"Atomic proposition extracted from semicolon-separated clause {idx + 1}."
                    ))
                return decomposed

        # Check for conjoined predicates / clauses:
        # Example: "Model A outperformed Model B on Dataset X and generalized better to Dataset Y."
        # Split on coordinating conjunctions where second half contains an action verb
        conjunction_split = cls._split_conjoined_sentence(s)
        if conjunction_split:
            return conjunction_split

        # Check for enumeration patterns: (1)... (2)... or 1)... 2)...
        enum_matches = re.split(r"\s*(?:\(\d+\)|\b\d+\))\s*", s)
        if len(enum_matches) > 2 and enum_matches[0]:
            # Introductory phrase + items
            intro = enum_matches[0].rstrip(":").strip()
            items = [item.strip().rstrip(".,;") for item in enum_matches[1:] if item.strip()]
            decomposed = []
            for idx, item in enumerate(items):
                full_prop = f"{intro}: {item}."
                decomposed.append((
                    full_prop,
                    True,
                    f"Atomic proposition decomposed from enumeration item {idx + 1}."
                ))
            return decomposed

        # Single atomic proposition
        return [(s, True, "Atomic factual proposition (single independent clause).")]

    @classmethod
    def _split_conjoined_sentence(cls, sentence: str) -> Optional[List[Tuple[str, bool, str]]]:
        """
        Detects compound statements joined by 'and', 'while', 'whereas', 'but'
        and extracts cleanly bounded atomic propositions with subject propagation.
        """
        # Look for pattern: "[Clause 1] and [VerbPhrase 2]" or "[Clause 1], and [Clause 2]"
        # Split on ", and ", " and ", ", while ", " while ", ", whereas ", ", but "
        delimiters = [
            (r",\s+and\s+", "and"),
            (r"\s+and\s+", "and"),
            (r",\s+while\s+", "while"),
            (r"\s+while\s+", "while"),
            (r",\s+whereas\s+", "whereas"),
            (r"\s+whereas\s+", "whereas"),
            (r",\s+but\s+", "but"),
        ]

        for pattern, conj_name in delimiters:
            match = re.search(pattern, sentence, flags=re.IGNORECASE)
            if not match:
                continue

            part1 = sentence[:match.start()].strip()
            part2 = sentence[match.end():].strip()

            if not part1 or not part2:
                continue

            # Ensure part1 is substantial (at least 3 words) and part2 is substantial (at least 3 words)
            words1 = part1.split()
            words2 = part2.split()
            if len(words1) < 3 or len(words2) < 3:
                continue

            # Case A: Check if part2 starts with a conjoined predicate verb
            # e.g. "generalized better to Dataset Y" or "achieved 92% accuracy"
            v_match = re.match(r"^(also\s+)?([a-z]+ed|[a-z]+es|[a-z]+s)\b", part2, re.IGNORECASE)
            # Find subject from part1
            subject = cls._extract_subject(part1)

            # Check if part2 has its own subject or shares subject
            has_own_subject = cls._has_own_subject(part2)

            if not has_own_subject and subject and v_match:
                # Subject propagation: "Model A" + " " + "generalized better to Dataset Y"
                claim1_text = part1.rstrip(".,;") + "."
                claim2_text = f"{subject} {part2}".rstrip(".,;") + "."

                return [
                    (
                        claim1_text,
                        True,
                        f"Atomic proposition 1 (subject: '{subject}')."
                    ),
                    (
                        claim2_text,
                        True,
                        f"Atomic proposition 2 (propagated subject: '{subject}' joined by '{conj_name}')."
                    )
                ]

            elif has_own_subject:
                # Two independent clauses: e.g. "Model A achieved 94% on Dataset X, while Model B scored 89%."
                claim1_text = part1.rstrip(".,;") + "."
                claim2_text = part2.rstrip(".,;") + "."
                # Capitalize first letter of claim2 if needed
                if claim2_text and claim2_text[0].islower():
                    claim2_text = claim2_text[0].upper() + claim2_text[1:]

                return [
                    (
                        claim1_text,
                        True,
                        f"Atomic proposition 1 decomposed from compound statement joined by '{conj_name}'."
                    ),
                    (
                        claim2_text,
                        True,
                        f"Atomic proposition 2 decomposed from compound statement joined by '{conj_name}'."
                    )
                ]

        return None

    @classmethod
    def _extract_subject(cls, clause: str) -> Optional[str]:
        """Extracts the leading noun phrase / subject from a clause."""
        # Clean leading words like 'Moreover,', 'Furthermore,', 'In addition,'
        clean = re.sub(r"^(moreover|furthermore|in addition|additionally|specifically|overall|notably|importantly|consequently),\s*", "", clause, flags=re.IGNORECASE)

        # Look for leading noun phrase up to the first main verb
        # Common verb markers: outperformed, achieved, demonstrates, uses, introduces, operates, yields, etc.
        verb_pattern = re.compile(
            r"\b(outperformed|outperforms|achieved|achieves|demonstrated|demonstrates|improved|improves|reduced|reduces|yielded|yields|evaluated|evaluates|surpassed|surpasses|introduced|introduces|showed|shows|attained|attains|exceeded|exceeds|is|was|are|were|uses|used|employs|employed|proposes|proposed)\b",
            re.IGNORECASE
        )
        v_match = verb_pattern.search(clean)
        if v_match and v_match.start() > 2:
            subject = clean[:v_match.start()].strip()
            # If subject has commas or parentheticals, clean them
            subject = re.sub(r"\(.*?\)", "", subject).strip()
            if len(subject.split()) <= 8:
                return subject

        # Fallback: first 3 words
        words = clean.split()
        if words:
            return " ".join(words[:min(3, len(words))])
        return None

    @classmethod
    def _has_own_subject(cls, clause: str) -> bool:
        """Determines if a clause appears to have its own explicit subject."""
        # If clause begins with a noun phrase or pronoun followed by a verb
        words = clause.split()
        if not words:
            return False

        # Pronouns
        pronouns = {"it", "they", "we", "the authors", "the model", "the framework", "the method", "this approach"}
        first_few = " ".join(words[:2]).lower()
        if words[0].lower() in pronouns or first_few in pronouns:
            return True

        # Starts with 'the', 'a', 'an', 'this', 'these', 'our'
        if words[0].lower() in {"the", "a", "an", "this", "these", "our", "their"}:
            return True

        # Check if first word is a capital proper noun (e.g. "BERT", "GPT-4", "ResNet")
        if words[0][0].isupper() and not words[0].lower() in {"and", "but", "while", "as", "also"}:
            return True

        return False

    @classmethod
    def _normalize_claim_text(cls, prop_text: str) -> str:
        """
        Normalizes a proposition into a standalone, verifiable statement.
        Ensures proper capitalization, trim whitespace, and terminating punctuation.
        """
        cleaned = prop_text.strip()
        if not cleaned:
            return ""

        # Remove leading conjunctions or transitional adverbs
        cleaned = re.sub(
            r"^(moreover|furthermore|additionally|specifically|in addition|notably|overall|thus|hence|therefore),\s*",
            "",
            cleaned,
            flags=re.IGNORECASE
        ).strip()

        # Ensure capitalization
        if cleaned and cleaned[0].islower():
            cleaned = cleaned[0].upper() + cleaned[1:]

        # Ensure terminating punctuation
        if not cleaned.endswith((".", "!", "?")):
            cleaned += "."

        return cleaned

    @classmethod
    def _classify_claim(cls, text: str, is_atomic: bool) -> ClaimCategory:
        """Classifies a proposition into its primary academic research category."""
        if not is_atomic:
            return ClaimCategory.MIXED

        # 1. Numerical (highest priority if specific empirical figures are stated)
        if cls.PATTERNS_NUMERICAL.search(text):
            # If also comparative, could be comparative or numerical; numerical takes precedence for verification
            return ClaimCategory.NUMERICAL

        # 2. Comparative
        if cls.PATTERNS_COMPARATIVE.search(text):
            return ClaimCategory.COMPARATIVE

        # 3. Limitation
        if cls.PATTERNS_LIMITATION.search(text):
            return ClaimCategory.LIMITATION

        # 4. Generalization
        if cls.PATTERNS_GENERALIZATION.search(text):
            return ClaimCategory.GENERALIZATION

        # 5. Methodological
        if cls.PATTERNS_METHODOLOGICAL.search(text):
            return ClaimCategory.METHODOLOGICAL

        # 6. Dataset
        if cls.PATTERNS_DATASET.search(text):
            return ClaimCategory.DATASET

        # 7. Result
        if cls.PATTERNS_RESULT.search(text):
            return ClaimCategory.RESULT

        # 8. Default
        return ClaimCategory.DESCRIPTIVE_FACTUAL

    @classmethod
    def _map_category_to_db_type(cls, cat: ClaimCategory) -> ClaimTypeDb:
        """Maps ClaimCategory to Supabase claims.claim_type enum."""
        mapping = {
            ClaimCategory.NUMERICAL: ClaimTypeDb.BENCHMARK_RESULT,
            ClaimCategory.COMPARATIVE: ClaimTypeDb.BENCHMARK_RESULT,
            ClaimCategory.RESULT: ClaimTypeDb.EMPIRICAL,
            ClaimCategory.METHODOLOGICAL: ClaimTypeDb.METHODOLOGICAL,
            ClaimCategory.DATASET: ClaimTypeDb.EMPIRICAL,
            ClaimCategory.GENERALIZATION: ClaimTypeDb.THEORETICAL,
            ClaimCategory.LIMITATION: ClaimTypeDb.LIMITATION,
            ClaimCategory.DESCRIPTIVE_FACTUAL: ClaimTypeDb.EMPIRICAL,
            ClaimCategory.MIXED: ClaimTypeDb.THEORETICAL,
        }
        return mapping.get(cat, ClaimTypeDb.EMPIRICAL)

    @classmethod
    def _map_db_type_to_category(cls, db_type: str) -> ClaimCategory:
        """Maps Supabase claims.claim_type to ClaimCategory."""
        mapping = {
            "BENCHMARK_RESULT": ClaimCategory.NUMERICAL,
            "EMPIRICAL": ClaimCategory.RESULT,
            "METHODOLOGICAL": ClaimCategory.METHODOLOGICAL,
            "THEORETICAL": ClaimCategory.DESCRIPTIVE_FACTUAL,
            "LIMITATION": ClaimCategory.LIMITATION,
        }
        return mapping.get(db_type, ClaimCategory.DESCRIPTIVE_FACTUAL)

    # =========================================================================
    # PERSISTENCE & DATA RETRIEVAL
    # =========================================================================

    @classmethod
    def _fetch_output_text(cls, output_id: str, project_id: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Retrieves original text for an output ID by probing:
        1. Synthesis matrices table.
        2. Paper summaries stored in metadata_json.
        3. Outputs table (if present).
        """
        # 1. Try synthesis_matrices
        try:
            s_res = supabase.table("synthesis_matrices").select("matrix_cells, topic").eq("id", output_id).execute()
            if s_res.data and len(s_res.data) > 0:
                cells = s_res.data[0].get("matrix_cells") or {}
                # Extract text from dimension_matrix or consensus/disagreements
                lines = []
                topic = s_res.data[0].get("topic")
                if topic:
                    lines.append(f"Cross-Paper Synthesis: {topic}\n")
                
                # Check for consensus points
                for c in cells.get("consensus_points", []):
                    lines.append(f"{c.get('statement', '')}")

                # Check for dimension matrix
                for dim in cells.get("dimension_matrix", []):
                    lines.append(f"{dim.get('dimension', '')}: {dim.get('synthesis_summary', '')}")

                # Check for disagreements
                for d in cells.get("disagreements", []):
                    lines.append(f"Disagreement on {d.get('dimension', '')}: {d.get('description', '')}")

                if lines:
                    return "\n\n".join(lines), None
        except Exception as e:
            logger.debug(f"Synthesis matrix text fetch skipped: {e}")

        # 2. Try paper metadata saved_summaries
        try:
            p_res = supabase.table("papers").select("id, metadata_json").execute()
            for p in (p_res.data or []):
                meta = p.get("metadata_json") or {}
                for s in meta.get("saved_summaries", []):
                    if s.get("id") == output_id:
                        text = s.get("content") or ""
                        return text, p["id"]
        except Exception as e:
            logger.debug(f"Paper summary metadata fetch skipped: {e}")

        # 3. Try outputs table
        try:
            o_res = supabase.table("outputs").select("content, paper_id").eq("id", output_id).execute()
            if o_res.data and len(o_res.data) > 0:
                return o_res.data[0].get("content"), o_res.data[0].get("paper_id")
        except Exception:
            pass

        return None, None

    @classmethod
    def _persist_claims(cls, response: OutputClaimsResponse, paper_id: Optional[str]):
        """
        Dual-persistence:
        1. Writes claims into Supabase `claims` table.
        2. Updates local cache and parent output metadata.
        """
        # A. Update local file cache
        cls._save_to_cache(response)

        # B. Upsert into Supabase `claims` table
        resolved_paper_id = paper_id
        if not resolved_paper_id:
            # Fallback: look for any paper in the project
            try:
                wp = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", response.project_id).limit(1).execute()
                if wp.data:
                    resolved_paper_id = wp.data[0]["paper_id"]
            except Exception:
                pass

        if resolved_paper_id:
            for claim in response.claims:
                db_claim_type = cls._map_category_to_db_type(claim.category)
                payload = {
                    "id": claim.id,
                    "workspace_id": response.project_id,
                    "source_paper_id": resolved_paper_id,
                    "claim_text": claim.normalized_text,
                    "claim_type": db_claim_type.value,
                    "confidence_score": claim.confidence_score,
                    "verification_status": claim.verification_status.value
                }
                try:
                    supabase.table("claims").upsert(payload, on_conflict="id").execute()
                except Exception as e:
                    logger.debug(f"Could not upsert claim '{claim.id}' to claims table: {e}")

        # C. Update synthesis_matrices if output_id matches a synthesis
        try:
            sm_res = supabase.table("synthesis_matrices").select("matrix_cells").eq("id", response.output_id).execute()
            if sm_res.data and len(sm_res.data) > 0:
                cells = sm_res.data[0].get("matrix_cells") or {}
                cells["claims_response"] = response.model_dump()
                supabase.table("synthesis_matrices").update({"matrix_cells": cells}).eq("id", response.output_id).execute()
        except Exception:
            pass

        # D. Update paper metadata saved_summaries if output_id matches a summary
        try:
            p_res = supabase.table("papers").select("id, metadata_json").execute()
            for p in (p_res.data or []):
                meta = p.get("metadata_json") or {}
                saved = meta.get("saved_summaries") or []
                updated = False
                for s in saved:
                    if s.get("id") == response.output_id:
                        s["claims_response"] = response.model_dump()
                        updated = True
                if updated:
                    supabase.table("papers").update({"metadata_json": meta}).eq("id", p["id"]).execute()
        except Exception:
            pass

    @classmethod
    def _load_cache(cls) -> Dict[str, Any]:
        """Loads all cached output claims from local disk storage."""
        if not CACHE_FILE.exists():
            return {}
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read claim cache: {e}")
            return {}

    @classmethod
    def _save_to_cache(cls, response: OutputClaimsResponse):
        """Saves decomposed claims to disk cache."""
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_data = cls._load_cache()
        cache_data[response.output_id] = response.model_dump()
        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache_data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to write claim cache: {e}")
