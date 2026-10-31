"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Project,
  SummaryResponse,
  ComparisonResponse,
  OutputClaimsResponse,
  AtomicClaim,
  SentenceDecomposition,
  ClaimCategory
} from "../../types";
import {
  fetchProjects,
  fetchProjectSummaries,
  fetchProjectComparisons,
  decomposeClaims,
  fetchOutputClaims
} from "../../lib/api";
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileText,
  Search,
  Filter,
  ArrowRight,
  Split,
  Maximize2,
  Minimize2,
  Sparkles,
  Info,
  CheckSquare,
  Square,
  RefreshCw,
  Hash,
  ChevronRight,
  BookOpen,
  SlidersHorizontal,
  ExternalLink,
  HelpCircle,
  BarChart3
} from "lucide-react";

interface ClaimVerificationViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export const ClaimVerificationView: React.FC<ClaimVerificationViewProps> = ({
  currentProject,
  onSelectProject
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || "");

  // Available outputs for current project
  const [summaries, setSummaries] = useState<SummaryResponse[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonResponse[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [isCustomText, setIsCustomText] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>("");

  // Decomposition state
  const [claimsData, setClaimsData] = useState<OutputClaimsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selection & UI filtering state
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const [activeSentenceKey, setActiveSentenceKey] = useState<string | null>(null); // "p-s"
  const [activeClaim, setActiveClaim] = useState<AtomicClaim | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [atomicityFilter, setAtomicityFilter] = useState<string>("all"); // "all" | "atomic" | "compound"
  const [viewMode, setViewMode] = useState<"split" | "prose" | "claims">("split");

  // Load project list on mount
  useEffect(() => {
    fetchProjects()
      .then((p) => {
        setProjects(p);
        if (!selectedProjectId && p.length > 0) {
          setSelectedProjectId(p[0].id);
        }
      })
      .catch((err) => console.error("Failed to load projects", err));
  }, []);

  // Update selectedProjectId when currentProject prop changes
  useEffect(() => {
    if (currentProject?.id) {
      setSelectedProjectId(currentProject.id);
    }
  }, [currentProject]);

  // Load summaries and comparisons when selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setError(null);
    setClaimsData(null);
    setSelectedOutputId("");

    Promise.all([
      fetchProjectSummaries(selectedProjectId).catch(() => ({ summaries: [] })),
      fetchProjectComparisons(selectedProjectId).catch(() => ({ comparisons: [] }))
    ]).then(([sumRes, compRes]) => {
      setSummaries(sumRes.summaries || []);
      setComparisons(compRes.comparisons || []);

      // Auto-select the first available summary or comparison
      if (sumRes.summaries && sumRes.summaries.length > 0) {
        setSelectedOutputId(sumRes.summaries[0].id);
        setIsCustomText(false);
      } else if (compRes.comparisons && compRes.comparisons.length > 0) {
        setSelectedOutputId(compRes.comparisons[0].id);
        setIsCustomText(false);
      } else {
        setIsCustomText(true);
        setCustomText(
          "Model A outperformed Model B on Dataset X and generalized better to Dataset Y.\n\n" +
          "The proposed optimizer reduces latency to 14.2ms while achieving 94.6% accuracy."
        );
      }
    });
  }, [selectedProjectId]);

  // Handle decomposition trigger
  const handleDecompose = async (forceRegenerate: boolean = false) => {
    if (!selectedProjectId) {
      setError("Please select an active research project.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let outputIdToUse = selectedOutputId;
      let textToUse: string | undefined = undefined;

      if (isCustomText || !selectedOutputId) {
        outputIdToUse = `custom-out-${Date.now()}`;
        textToUse = customText;
        if (!textToUse.trim()) {
          setError("Please enter or select text to decompose.");
          setIsLoading(false);
          return;
        }
      }

      const res = await decomposeClaims({
        output_id: outputIdToUse,
        project_id: selectedProjectId,
        original_text: textToUse,
        force_regenerate: forceRegenerate
      });

      setClaimsData(res);
      // Default: select all atomic claims
      const initialSelected = new Set<string>();
      res.claims.forEach((c) => {
        if (c.is_atomic) initialSelected.add(c.id);
      });
      setSelectedClaimIds(initialSelected);
    } catch (err: any) {
      console.error("Decomposition failed", err);
      setError(err.message || "Failed to decompose claims into atomic propositions.");
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle selection for a claim
  const toggleClaimSelection = (claimId: string) => {
    const next = new Set(selectedClaimIds);
    if (next.has(claimId)) {
      next.delete(claimId);
    } else {
      next.add(claimId);
    }
    setSelectedClaimIds(next);
  };

  // Batch selection helpers
  const selectAll = () => {
    if (!claimsData) return;
    const next = new Set(claimsData.claims.map((c) => c.id));
    setSelectedClaimIds(next);
  };

  const selectAtomicOnly = () => {
    if (!claimsData) return;
    const next = new Set(claimsData.claims.filter((c) => c.is_atomic).map((c) => c.id));
    setSelectedClaimIds(next);
  };

  const selectNumericalOnly = () => {
    if (!claimsData) return;
    const next = new Set(
      claimsData.claims
        .filter((c) => c.category === "numerical")
        .map((c) => c.id)
    );
    setSelectedClaimIds(next);
  };

  const clearSelection = () => {
    setSelectedClaimIds(new Set());
  };

  // Filtered claims list
  const filteredClaims = useMemo(() => {
    if (!claimsData) return [];
    return claimsData.claims.filter((c) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNorm = c.normalized_text.toLowerCase().includes(q);
        const matchesOrig = c.original_text.toLowerCase().includes(q);
        if (!matchesNorm && !matchesOrig) return false;
      }
      // Category
      if (categoryFilter !== "all" && c.category !== categoryFilter) {
        return false;
      }
      // Atomicity
      if (atomicityFilter === "atomic" && !c.is_atomic) return false;
      if (atomicityFilter === "compound" && c.is_atomic) return false;

      // Active sentence highlight filter if clicked
      if (activeSentenceKey) {
        const [pIdxStr, sIdxStr] = activeSentenceKey.split("-");
        if (
          c.paragraph_index !== parseInt(pIdxStr, 10) ||
          c.sentence_index !== parseInt(sIdxStr, 10)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [claimsData, searchQuery, categoryFilter, atomicityFilter, activeSentenceKey]);

  // Color mapping for claim categories
  const getCategoryBadgeClass = (category: ClaimCategory | string) => {
    switch (category) {
      case "numerical":
        return "bg-sky-500/15 text-sky-400 border-sky-500/30";
      case "comparative":
        return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
      case "methodological":
        return "bg-purple-500/15 text-purple-400 border-purple-500/30";
      case "dataset":
        return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
      case "result":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "generalization":
        return "bg-teal-500/15 text-teal-400 border-teal-500/30";
      case "limitation":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "mixed":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      default:
        return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header & Breadcrumb */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 tracking-wider uppercase mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>VERITAS Phase 6 · Claim Verification Center</span>
          </div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Atomic Claim Decomposition</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
              Provenance Intact
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Decompose academic syntheses into atomic, independently verifiable propositions while preserving sentence order.
          </p>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium">Project Scope:</label>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              const found = projects.find((p) => p.id === e.target.value);
              if (found && onSelectProject) onSelectProject(found);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col overflow-hidden px-6 py-4 gap-4">
        {/* Source Output Selection & Decomposition Trigger Card */}
        <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-4 shadow-lg flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Source Document:
              </span>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setIsCustomText(false)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    !isCustomText
                      ? "bg-cyan-600 text-white font-medium shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Project Outputs ({summaries.length + comparisons.length})
                </button>
                <button
                  onClick={() => setIsCustomText(true)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    isCustomText
                      ? "bg-cyan-600 text-white font-medium shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Custom Research Text
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDecompose(false)}
                disabled={isLoading}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-md disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{isLoading ? "Decomposing..." : "Decompose into Atomic Claims"}</span>
              </button>

              {claimsData && (
                <button
                  onClick={() => handleDecompose(true)}
                  disabled={isLoading}
                  title="Re-run decomposition algorithm"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Conditional Inputs */}
          {!isCustomText ? (
            <div className="flex flex-col gap-2">
              <select
                value={selectedOutputId}
                onChange={(e) => setSelectedOutputId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {summaries.length === 0 && comparisons.length === 0 && (
                  <option value="">No generated outputs found in project yet</option>
                )}
                {summaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    [Summary] {s.title} ({s.summary_type})
                  </option>
                ))}
                {comparisons.map((c) => (
                  <option key={c.id} value={c.id}>
                    [Cross-Paper Synthesis] {c.topic} ({c.paper_ids.length} papers)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Paste research summary, abstract, or cross-paper synthesis text here..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
              />
            </div>
          )}

          {error && (
            <div className="bg-rose-950/40 border border-rose-800/80 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Statistics Bar (Visible when claims exist) */}
        {claimsData && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-slate-300">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{claimsData.total_paragraphs} Paragraphs</span>
              </div>
              <div className="h-3 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-slate-300">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                <span>{claimsData.total_sentences} Sentences</span>
              </div>
              <div className="h-3 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Layers className="w-3.5 h-3.5" />
                <span>{claimsData.total_claims} Extracted Claims</span>
              </div>
              <div className="h-3 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{claimsData.atomic_claims_count} Atomic</span>
              </div>
              {claimsData.compound_claims_count > 0 && (
                <>
                  <div className="h-3 w-px bg-slate-800" />
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{claimsData.compound_claims_count} Compound / Mixed</span>
                  </div>
                </>
              )}
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setViewMode("split")}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
                  viewMode === "split"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
              <button
                onClick={() => setViewMode("prose")}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
                  viewMode === "prose"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Full Prose</span>
              </button>
              <button
                onClick={() => setViewMode("claims")}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
                  viewMode === "claims"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Claims Only</span>
              </button>
            </div>
          </div>
        )}

        {/* Filter & Batch Actions Bar */}
        {claimsData && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Search & Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter claim text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs"
                />
              </div>

              {/* Category dropdown */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs"
              >
                <option value="all">All Categories</option>
                <option value="numerical">Numerical</option>
                <option value="comparative">Comparative</option>
                <option value="methodological">Methodological</option>
                <option value="dataset">Dataset</option>
                <option value="result">Result</option>
                <option value="generalization">Generalization</option>
                <option value="limitation">Limitation</option>
                <option value="descriptive_factual">Descriptive</option>
                <option value="mixed">Mixed</option>
              </select>

              {/* Atomicity dropdown */}
              <select
                value={atomicityFilter}
                onChange={(e) => setAtomicityFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs"
              >
                <option value="all">All Atomicity</option>
                <option value="atomic">Atomic Only</option>
                <option value="compound">Compound / Mixed</option>
              </select>

              {activeSentenceKey && (
                <button
                  onClick={() => setActiveSentenceKey(null)}
                  className="px-2 py-1 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1 text-[11px] hover:bg-cyan-900/60"
                >
                  <span>Filtering by sentence</span>
                  <span className="font-bold">✕</span>
                </button>
              )}
            </div>

            {/* Batch Selection Controls */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs font-mono">
                Selected: <strong className="text-cyan-400">{selectedClaimIds.size}</strong>/
                {claimsData.total_claims}
              </span>
              <button
                onClick={selectAll}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                All
              </button>
              <button
                onClick={selectAtomicOnly}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                Atomic
              </button>
              <button
                onClick={selectNumericalOnly}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                Numerical
              </button>
              <button
                onClick={clearSelection}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Core Content Area */}
        {claimsData ? (
          <div className="flex-1 flex overflow-hidden gap-4 min-h-0">
            {/* Left Pane: Interactive Prose View */}
            {(viewMode === "split" || viewMode === "prose") && (
              <div
                className={`${
                  viewMode === "split" ? "w-1/2" : "w-full"
                } flex flex-col bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-inner`}
              >
                <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Original Synthesis Prose
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Click any sentence to inspect extracted atomic claims
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 font-serif text-sm leading-relaxed text-slate-300">
                  {claimsData.paragraphs.map((p) => (
                    <div
                      key={`para-${p.paragraph_index}`}
                      className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800/80 hover:border-slate-700/80 transition-all"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2 font-sans">
                        <span>Paragraph {p.paragraph_index + 1}</span>
                        <span>·</span>
                        <span>{p.sentences.length} Sentences</span>
                      </div>
                      <p className="space-x-1">
                        {p.sentences.map((s) => {
                          const sKey = `${p.paragraph_index}-${s.sentence_index}`;
                          const isHighlighted = activeSentenceKey === sKey;
                          return (
                            <span
                              key={sKey}
                              onClick={() =>
                                setActiveSentenceKey(
                                  activeSentenceKey === sKey ? null : sKey
                                )
                              }
                              className={`cursor-pointer rounded px-1.5 py-0.5 transition-all inline ${
                                isHighlighted
                                  ? "bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400 font-medium"
                                  : "hover:bg-slate-800 hover:text-white"
                              }`}
                              title={`Sentence ${s.sentence_index + 1}: ${s.claims.length} claims extracted`}
                            >
                              {s.original_sentence}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Right Pane: Extracted Claims Feed */}
            {(viewMode === "split" || viewMode === "claims") && (
              <div
                className={`${
                  viewMode === "split" ? "w-1/2" : "w-full"
                } flex flex-col bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-inner`}
              >
                <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Atomic Proposition Feed ({filteredClaims.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Ordered strictly by source narrative position
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {filteredClaims.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      No claims match current filter criteria.
                    </div>
                  ) : (
                    filteredClaims.map((claim) => {
                      const isSelected = selectedClaimIds.has(claim.id);
                      return (
                        <div
                          key={claim.id}
                          className={`p-3.5 rounded-lg border transition-all flex flex-col gap-2.5 ${
                            isSelected
                              ? "bg-slate-900 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/20"
                              : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700"
                          }`}
                        >
                          {/* Card Header: Checkbox + Meta Tags */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={() => toggleClaimSelection(claim.id)}
                                className="text-slate-400 hover:text-cyan-400 transition-colors"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>

                              {/* Position Badge */}
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                P{claim.paragraph_index + 1} · S{claim.sentence_index + 1} · C{claim.claim_index + 1}
                              </span>

                              {/* Atomicity Badge */}
                              {claim.is_atomic ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  <span>Atomic</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  <span>Compound / Mixed</span>
                                </span>
                              )}

                              {/* Category Badge */}
                              <span
                                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider ${getCategoryBadgeClass(
                                  claim.category
                                )}`}
                              >
                                {claim.category}
                              </span>
                            </div>

                            {/* Inspector Button */}
                            <button
                              onClick={() => setActiveClaim(claim)}
                              className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-slate-800"
                            >
                              <span>Inspect</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Normalized Proposition Text */}
                          <div className="text-xs text-slate-100 font-medium pl-6 leading-relaxed">
                            {claim.normalized_text}
                          </div>

                          {/* Original context & notes footer */}
                          <div className="pl-6 pt-1 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                            <span className="italic truncate max-w-sm">
                              &ldquo;{claim.original_text}&rdquo;
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              Status: <span className="text-slate-300">Ready for Verification</span>
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty state before decomposition */
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-8 text-center bg-slate-900/30">
            <div className="w-14 h-14 rounded-2xl bg-cyan-950/50 border border-cyan-800/50 flex items-center justify-center mb-4 text-cyan-400 shadow-lg">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Ready to Decompose Research Claims
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
              Select a research summary or cross-paper synthesis from your project, or paste
              academic text above. VERITAS will isolate compound statements into individually
              testable propositions with sentence-level provenance.
            </p>
            <button
              onClick={() => handleDecompose(false)}
              disabled={isLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Decompose Selected Output</span>
            </button>
          </div>
        )}
      </div>

      {/* Claim Detail Modal Inspector */}
      {activeClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
                  <span>PROPOSITION INSPECTOR</span>
                  <span>·</span>
                  <span className="text-slate-400">ID: {activeClaim.id.slice(0, 8)}...</span>
                </div>
                <h3 className="text-base font-bold text-white">
                  Atomic Proposition Breakdown
                </h3>
              </div>
              <button
                onClick={() => setActiveClaim(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Normalized Proposition */}
            <div className="space-y-1.5 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Normalized Atomic Statement
              </span>
              <p className="text-sm font-semibold text-cyan-200">
                {activeClaim.normalized_text}
              </p>
            </div>

            {/* Original Sentence */}
            <div className="space-y-1.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Original Sentence in Source Narrative
              </span>
              <p className="text-xs font-serif italic text-slate-300">
                &ldquo;{activeClaim.original_text}&rdquo;
              </p>
            </div>

            {/* Key Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block font-mono">Category</span>
                <span className={`font-semibold capitalize text-xs mt-0.5 inline-block`}>
                  {activeClaim.category}
                </span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block font-mono">Atomicity</span>
                <span className="font-semibold text-xs mt-0.5 inline-block text-emerald-300">
                  {activeClaim.is_atomic ? "Atomic" : "Compound"}
                </span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block font-mono">Position</span>
                <span className="font-semibold text-xs mt-0.5 inline-block font-mono text-cyan-300">
                  P{activeClaim.paragraph_index + 1} · S{activeClaim.sentence_index + 1} · C{activeClaim.claim_index + 1}
                </span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block font-mono">Confidence</span>
                <span className="font-semibold text-xs mt-0.5 inline-block font-mono text-slate-200">
                  {(activeClaim.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Decomposition Rationale & Notes */}
            {activeClaim.decomposition_notes && (
              <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-xs">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                  Decomposition Notes
                </span>
                <p className="text-slate-300">{activeClaim.decomposition_notes}</p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  toggleClaimSelection(activeClaim.id);
                  setActiveClaim(null);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {selectedClaimIds.has(activeClaim.id)
                  ? "Deselect Claim"
                  : "Select Claim for Verification"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

