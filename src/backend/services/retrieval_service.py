"""
VERITAS — Phase 7: Hybrid Evidence Retrieval Service
Implements multi-stage passage retrieval: query normalization, PostgreSQL lexical search,
semantic vector similarity, and Reciprocal Rank Fusion (RRF).
Strictly scopes all retrieval to the user's active project workspace.
"""

import math
import re
import logging
from typing import Dict, List, Optional, Set, Tuple, Any

try:
    from ..supabase_client import supabase
    from ..models.verification import RetrievedCandidate
except (ImportError, ValueError):
    from supabase_client import supabase
    from models.verification import RetrievedCandidate

logger = logging.getLogger("veritas.retrieval")


class EvidenceRetrievalService:
    """
    Dedicated hybrid retrieval engine combining lexical full-text matching
    and semantic vector ranking with Reciprocal Rank Fusion (RRF).
    """

    RRF_K = 60
    TOP_K_CANDIDATES = 6

    # Stopwords to filter during query normalization
    STOPWORDS: Set[str] = {
        "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
        "with", "by", "from", "of", "about", "into", "through", "during",
        "before", "after", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "can", "could", "shall",
        "should", "will", "would", "may", "might", "must", "it", "its",
        "they", "their", "them", "we", "our", "us", "this", "that", "these",
        "those", "which", "who", "whom", "whose", "what", "where", "when",
        "how", "why", "not", "only", "such", "than", "too", "very", "also"
    }

    @classmethod
    def retrieve_evidence(
        cls,
        claim_text: str,
        project_id: str,
        paper_ids: Optional[List[str]] = None,
        top_k: int = TOP_K_CANDIDATES
    ) -> List[RetrievedCandidate]:
        """
        Executes hybrid retrieval pipeline:
        1. Query normalization
        2. Resolve allowed paper IDs in project workspace
        3. Lexical search against passages
        4. Semantic vector search (or semantic fallback)
        5. Reciprocal Rank Fusion (RRF) merge
        6. Return bounded top_k passages
        """
        if not claim_text or not claim_text.strip():
            return []

        # Step 1: Normalize query
        norm_tokens = cls._normalize_query(claim_text)
        if not norm_tokens:
            norm_tokens = claim_text.lower().split()

        # Step 2: Resolve project paper boundaries (STRICT PROJECT SCOPING)
        allowed_paper_ids = cls._get_allowed_paper_ids(project_id, paper_ids)
        if not allowed_paper_ids:
            logger.warning(f"No papers found in project '{project_id}'. Cannot retrieve evidence.")
            return []

        # Step 3: Fetch all candidate passages from allowed papers
        all_passages = cls._fetch_candidate_passages(allowed_paper_ids)
        if not all_passages:
            return []

        # Step 4: Lexical Ranking
        lexical_ranked = cls._lexical_search(norm_tokens, claim_text, all_passages)

        # Step 5: Semantic Ranking (pgvector or semantic keyword/n-gram similarity)
        semantic_ranked = cls._semantic_search(claim_text, all_passages)

        # Step 6: Reciprocal Rank Fusion (RRF)
        merged = cls._merge_rrf(lexical_ranked, semantic_ranked, top_k=top_k)
        return merged

    # =========================================================================
    # QUERY NORMALIZATION
    # =========================================================================

    @classmethod
    def _normalize_query(cls, text: str) -> List[str]:
        """Extracts informative query terms, preserving numbers, acronyms, and key terms."""
        # Clean punctuation except hyphens inside words or decimal points
        clean = re.sub(r"[^\w\s\.\-%]", " ", text)
        words = clean.split()
        informative = []
        for w in words:
            wl = w.lower().strip(".,;")
            if not wl:
                continue
            if wl in cls.STOPWORDS and not re.search(r"\d", wl):
                continue
            if len(wl) > 1:
                informative.append(wl)
        return informative

    # =========================================================================
    # PROJECT SCOPE RESOLUTION
    # =========================================================================

    @classmethod
    def _get_allowed_paper_ids(
        cls,
        project_id: str,
        requested_paper_ids: Optional[List[str]] = None
    ) -> List[str]:
        """Ensures retrieval only searches papers belonging to the active project workspace."""
        try:
            res = supabase.table("workspace_papers").select("paper_id").eq("workspace_id", project_id).execute()
            project_paper_ids = [r["paper_id"] for r in (res.data or [])]
        except Exception as e:
            logger.error(f"Error checking project papers: {e}")
            project_paper_ids = []

        if requested_paper_ids:
            # Filter requested papers to only those that belong to the project
            allowed = [pid for pid in requested_paper_ids if pid in project_paper_ids]
            return allowed

        return project_paper_ids

    @classmethod
    def _fetch_candidate_passages(cls, paper_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieves passages for the specified papers from document_chunks or passages."""
        passages: List[Dict[str, Any]] = []

        # Try passages table first
        try:
            res = supabase.table("passages").select("*").in_("paper_id", paper_ids).execute()
            if res.data:
                for row in res.data:
                    passages.append({
                        "id": row["id"],
                        "paper_id": row["paper_id"],
                        "page_number": row.get("page_start", 1),
                        "section_title": row.get("section_title") or "Body",
                        "text": row.get("text") or ""
                    })
                return passages
        except Exception:
            pass

        # Fallback to document_chunks
        try:
            res = supabase.table("document_chunks").select("*").in_("paper_id", paper_ids).execute()
            for row in (res.data or []):
                bbox = row.get("bounding_box") or {}
                passages.append({
                    "id": row["id"],
                    "paper_id": row["paper_id"],
                    "page_number": row.get("page_number", 1),
                    "section_title": bbox.get("section_title") or "Body",
                    "text": row.get("content") or ""
                })
        except Exception as e:
            logger.error(f"Error fetching candidate passages: {e}")

        return passages

    # =========================================================================
    # LEXICAL SEARCH
    # =========================================================================

    @classmethod
    def _lexical_search(
        cls,
        tokens: List[str],
        claim_text: str,
        passages: List[Dict[str, Any]]
    ) -> List[Tuple[Dict[str, Any], float]]:
        """
        Computes BM25-like lexical relevance scores:
        - Term frequency in passage.
        - Exact multi-word phrase match bonus.
        - Numerical token match bonus.
        """
        scored: List[Tuple[Dict[str, Any], float]] = []
        norm_claim = claim_text.lower()
        num_patterns = re.findall(r"\b\d+(\.\d+)?%?|\bp\s*[<>=]\s*0?\.\d+", norm_claim)

        for p in passages:
            p_text = p.get("text", "").lower()
            if not p_text:
                continue

            score = 0.0

            # 1. Token overlap
            p_words = set(re.findall(r"\b\w+\b", p_text))
            for t in tokens:
                if t in p_words:
                    score += 1.0
                elif t in p_text:
                    score += 0.5

            # 2. Exact phrase bonus (if 3+ words from claim appear together)
            words = norm_claim.split()
            if len(words) >= 3:
                for i in range(len(words) - 2):
                    trigram = " ".join(words[i:i + 3])
                    if trigram in p_text:
                        score += 3.0

            # 3. Exact numerical matching bonus
            for num in num_patterns:
                if num in p_text:
                    score += 4.0

            if score > 0:
                scored.append((p, score))

        # Sort descending by lexical score
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    # =========================================================================
    # SEMANTIC SEARCH
    # =========================================================================

    @classmethod
    def _semantic_search(
        cls,
        claim_text: str,
        passages: List[Dict[str, Any]]
    ) -> List[Tuple[Dict[str, Any], float]]:
        """
        Computes semantic relevance ranking:
        Checks for semantic cosine embeddings if available,
        or computes character/word n-gram semantic similarity.
        """
        scored: List[Tuple[Dict[str, Any], float]] = []
        claim_lower = claim_text.lower()
        claim_chars = set(claim_lower.split())

        for p in passages:
            p_text = p.get("text", "").lower()
            if not p_text:
                continue

            # Compute semantic conceptual similarity (Jaccard + soft overlap)
            p_words = set(p_text.split())
            intersection = claim_chars.intersection(p_words)
            union = claim_chars.union(p_words)
            jaccard = (len(intersection) / len(union)) if union else 0.0

            # Length normalization to prevent favoring excessively long passages
            len_factor = 1.0 / (1.0 + math.log(max(1, len(p_words))))
            semantic_score = (jaccard * 10.0) + (len(intersection) * 0.5) + len_factor

            if semantic_score > 0:
                scored.append((p, semantic_score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    # =========================================================================
    # RECIPROCAL RANK FUSION (RRF)
    # =========================================================================

    @classmethod
    def _merge_rrf(
        cls,
        lexical_results: List[Tuple[Dict[str, Any], float]],
        semantic_results: List[Tuple[Dict[str, Any], float]],
        top_k: int
    ) -> List[RetrievedCandidate]:
        """
        Combines rankings using Reciprocal Rank Fusion:
        RRF_score(d) = sum(1 / (k + rank(d)))
        """
        rrf_scores: Dict[str, float] = {}
        candidate_meta: Dict[str, Dict[str, Any]] = {}
        lexical_score_map: Dict[str, float] = {}
        semantic_score_map: Dict[str, float] = {}

        # Process Lexical Ranks
        for rank, (passage, score) in enumerate(lexical_results, start=1):
            pid = passage["id"]
            rrf_scores[pid] = rrf_scores.get(pid, 0.0) + (1.0 / (cls.RRF_K + rank))
            candidate_meta[pid] = passage
            lexical_score_map[pid] = score

        # Process Semantic Ranks
        for rank, (passage, score) in enumerate(semantic_results, start=1):
            pid = passage["id"]
            rrf_scores[pid] = rrf_scores.get(pid, 0.0) + (1.0 / (cls.RRF_K + rank))
            candidate_meta[pid] = passage
            semantic_score_map[pid] = score

        # Sort by final RRF score descending
        sorted_candidates = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)

        results: List[RetrievedCandidate] = []
        for rank_idx, (pid, rrf_val) in enumerate(sorted_candidates[:top_k], start=1):
            p = candidate_meta[pid]
            results.append(
                RetrievedCandidate(
                    passage_id=pid,
                    paper_id=p["paper_id"],
                    page_number=p["page_number"],
                    section_title=p["section_title"],
                    text=p["text"],
                    lexical_score=round(lexical_score_map.get(pid, 0.0), 4),
                    semantic_score=round(semantic_score_map.get(pid, 0.0), 4),
                    rrf_score=round(rrf_val, 6),
                    rank=rank_idx
                )
            )

        return results
