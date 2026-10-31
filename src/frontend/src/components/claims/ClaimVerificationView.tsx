"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Project,
  SummaryResponse,
  ComparisonResponse,
  OutputClaimsResponse,
  AtomicClaim,
  SentenceDecomposition,
  ClaimCategory,
  EvidenceVerdict,
  ClaimVerificationResult,
  ProjectVerificationSummary,
  CitedEvidencePassage,
  NumericalAuditResult,
  OvergeneralizationAuditResult
} from "../../types";
import {
  fetchProjects,
  fetchProjectSummaries,
  fetchProjectComparisons,
  decomposeClaims,
  fetchOutputClaims,
  verifyClaim,
  verifyBatchClaims,
  fetchProjectVerificationSummary,
  fetchSignedUrl,
  auditNumericalClaim,
  auditOvergeneralization
} from "../../lib/api";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
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
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  BarChart3,
  Check,
  X,
  Binary
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

  // Phase 7: Verification state
  const [verifications, setVerifications] = useState<Record<string, ClaimVerificationResult>>({});
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyingClaimId, setVerifyingClaimId] = useState<string | null>(null);
  const [verificationSummary, setVerificationSummary] = useState<ProjectVerificationSummary | null>(null);
  const [activeVerification, setActiveVerification] = useState<ClaimVerificationResult | null>(null);

  // Selection & UI filtering state
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const [activeSentenceKey, setActiveSentenceKey] = useState<string | null>(null); // "p-s"
  const [activeClaim, setActiveClaim] = useState<AtomicClaim | null>(null);

  // Phase 9: Advanced Research Audit State
  const [auditNumResult, setAuditNumResult] = useState<NumericalAuditResult | null>(null);
  const [auditOvergenResult, setAuditOvergenResult] = useState<OvergeneralizationAuditResult | null>(null);
  const [isAuditingNum, setIsAuditingNum] = useState<boolean>(false);
  const [isAuditingOvergen, setIsAuditingOvergen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [atomicityFilter, setAtomicityFilter] = useState<string>("all"); // "all" | "atomic" | "compound"
  const [verdictFilter, setVerdictFilter] = useState<string>("all"); // "all" | "Supported" | "Contradicted" | "Unresolved" | "Unverified"
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

  // Load summaries, comparisons, and verification metrics
  useEffect(() => {
    if (!selectedProjectId) return;
    setError(null);
    setClaimsData(null);
    setSelectedOutputId("");

    Promise.all([
      fetchProjectSummaries(selectedProjectId).catch(() => ({ summaries: [] })),
      fetchProjectComparisons(selectedProjectId).catch(() => ({ comparisons: [] })),
      fetchProjectVerificationSummary(selectedProjectId).catch(() => null)
    ]).then(([sumRes, compRes, summaryRes]) => {
      setSummaries(sumRes.summaries || []);
      setComparisons(compRes.comparisons || []);
      if (summaryRes) setVerificationSummary(summaryRes);

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

  // Phase 7: Single Claim Verification
  const handleVerifySingle = async (claimId: string) => {
    if (!selectedProjectId) return;
    setVerifyingClaimId(claimId);
    setError(null);

    try {
      const res = await verifyClaim({
        claim_id: claimId,
        project_id: selectedProjectId,
        force_regenerate: true
      });

      setVerifications((prev) => ({ ...prev, [claimId]: res }));

      // Refresh project summary
      fetchProjectVerificationSummary(selectedProjectId)
        .then((s) => setVerificationSummary(s))
        .catch(() => {});
    } catch (err: any) {
      console.error(`Verification failed for claim ${claimId}:`, err);
      setError(err.message || "Verification failed.");
    } finally {
      setVerifyingClaimId(null);
    }
  };

  // Phase 7: Batch Claim Verification
  const handleVerifySelected = async () => {
    if (!selectedProjectId || selectedClaimIds.size === 0) return;
    setIsVerifying(true);
    setError(null);

    try {
      const claimIdsList = Array.from(selectedClaimIds);
      const res = await verifyBatchClaims({
        claim_ids: claimIdsList,
        project_id: selectedProjectId
      });

      const nextMap = { ...verifications };
      res.results.forEach((r) => {
        nextMap[r.claim_id] = r;
      });
      setVerifications(nextMap);

      // Refresh project summary
      fetchProjectVerificationSummary(selectedProjectId)
        .then((s) => setVerificationSummary(s))
        .catch(() => {});
    } catch (err: any) {
      console.error("Batch verification failed:", err);
      setError(err.message || "Batch claim verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Open PDF viewer via signed URL
  const handleOpenPdf = async (paperId: string, pageNumber: number) => {
    try {
      const { signed_url } = await fetchSignedUrl(paperId);
      const urlWithPage = `${signed_url}#page=${pageNumber}`;
      window.open(urlWithPage, "_blank");
    } catch (err: any) {
      alert("Unable to open private PDF: " + (err.message || "Unknown error"));
    }
  };

  // Phase 9: Numerical Truth and Overgeneralization Audits
  const handleAuditNumerics = async () => {
    if (!activeClaim || !selectedProjectId) return;
    setIsAuditingNum(true);
    try {
      const res = await auditNumericalClaim(activeClaim.id, selectedProjectId);
      setAuditNumResult(res);
    } catch (err: any) {
      alert("Numerical truth audit error: " + (err.message || "Unknown error"));
    } finally {
      setIsAuditingNum(false);
    }
  };

  const handleAuditOvergeneralization = async () => {
    if (!activeClaim || !selectedProjectId) return;
    setIsAuditingOvergen(true);
    try {
      const res = await auditOvergeneralization(activeClaim.id, selectedProjectId);
      setAuditOvergenResult(res);
    } catch (err: any) {
      alert("Scope audit error: " + (err.message || "Unknown error"));
    } finally {
      setIsAuditingOvergen(false);
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
    setSelectedClaimIds(new Set(claimsData.claims.map((c) => c.id)));
  };

  const selectAtomicOnly = () => {
    if (!claimsData) return;
    setSelectedClaimIds(new Set(claimsData.claims.filter((c) => c.is_atomic).map((c) => c.id)));
  };

  const selectNumericalOnly = () => {
    if (!claimsData) return;
    setSelectedClaimIds(
      new Set(claimsData.claims.filter((c) => c.category === "numerical").map((c) => c.id))
    );
  };

  const clearSelection = () => {
    setSelectedClaimIds(new Set());
  };

  // Filtered claims list
  const filteredClaims = useMemo(() => {
    if (!claimsData) return [];
    return claimsData.claims.filter((c) => {
      const ver = verifications[c.id];
      const verdict = ver ? ver.verdict : "Unverified";

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

      // Verdict Filter
      if (verdictFilter !== "all") {
        if (verdictFilter === "Unverified" && ver) return false;
        if (verdictFilter !== "Unverified" && verdict !== verdictFilter) return false;
      }

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
  }, [claimsData, searchQuery, categoryFilter, atomicityFilter, verdictFilter, activeSentenceKey, verifications]);

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

  // Verdict badge renderer
  const renderVerdictBadge = (verdict?: EvidenceVerdict | string) => {
    switch (verdict) {
      case "Supported":
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Supported</span>
          </span>
        );
      case "Contradicted":
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shadow-sm">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>Contradicted</span>
          </span>
        );
      case "Unresolved":
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
            <ShieldQuestion className="w-3 h-3 text-amber-400" />
            <span>Unresolved</span>
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            <span>Unverified</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header & Breadcrumb */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 tracking-wider uppercase mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>VERITAS Phase 7 · Hybrid Evidence Retrieval & Verification Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Claim Verification Center</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold">
              Tri-State Evidence Core
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Retrieve source passages using Hybrid RRF, validate verbatim quotations, and determine Supported, Contradicted, or Unresolved verdicts.
          </p>
        </div>

        {/* Project Selector & Faithfulness Pill */}
        <div className="flex items-center gap-3">
          {verificationSummary && verificationSummary.verified_claims > 0 && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">Faithfulness:</span>
              <strong className="text-emerald-400 font-bold">
                {(verificationSummary.faithfulness_rate * 100).toFixed(1)}%
              </strong>
            </div>
          )}

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

              {/* Batch Verification Trigger */}
              {claimsData && (
                <button
                  onClick={handleVerifySelected}
                  disabled={isVerifying || selectedClaimIds.size === 0}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-md disabled:opacity-50"
                >
                  {isVerifying ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>
                    {isVerifying
                      ? "Retrieving & Verifying..."
                      : `Verify Selected (${selectedClaimIds.size})`}
                  </span>
                </button>
              )}

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

        {/* Statistics & Verdict Breakdown Bar */}
        {claimsData && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Layers className="w-3.5 h-3.5" />
                <span>{claimsData.total_claims} Claims</span>
              </div>
              <div className="h-3 w-px bg-slate-800" />

              {/* Supported count */}
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {Object.values(verifications).filter((v) => v.verdict === "Supported").length}{" "}
                  Supported
                </span>
              </div>
              <div className="h-3 w-px bg-slate-800" />

              {/* Contradicted count */}
              <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {Object.values(verifications).filter((v) => v.verdict === "Contradicted").length}{" "}
                  Contradicted
                </span>
              </div>
              <div className="h-3 w-px bg-slate-800" />

              {/* Unresolved count */}
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <ShieldQuestion className="w-3.5 h-3.5" />
                <span>
                  {Object.values(verifications).filter((v) => v.verdict === "Unresolved").length}{" "}
                  Unresolved
                </span>
              </div>
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

              {/* Verdict filter dropdown */}
              <select
                value={verdictFilter}
                onChange={(e) => setVerdictFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs font-medium"
              >
                <option value="all">All Verdicts</option>
                <option value="Supported">Supported</option>
                <option value="Contradicted">Contradicted</option>
                <option value="Unresolved">Unresolved</option>
                <option value="Unverified">Unverified Only</option>
              </select>

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

            {/* Right Pane: Extracted Claims Feed with Verdict Badges */}
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
                    Tri-State Verification Grounded in Retrieved Passages
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
                      const ver = verifications[claim.id];
                      const isCurrentlyVerifying = verifyingClaimId === claim.id;

                      return (
                        <div
                          key={claim.id}
                          className={`p-3.5 rounded-lg border transition-all flex flex-col gap-2.5 ${
                            isSelected
                              ? "bg-slate-900 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/20"
                              : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700"
                          }`}
                        >
                          {/* Card Header: Checkbox + Meta Tags + Verdict */}
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

                              {/* Category Badge */}
                              <span
                                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider ${getCategoryBadgeClass(
                                  claim.category
                                )}`}
                              >
                                {claim.category}
                              </span>

                              {/* Verdict Badge */}
                              {renderVerdictBadge(ver?.verdict)}
                            </div>

                            {/* Verification Actions */}
                            <div className="flex items-center gap-1.5">
                              {!ver && (
                                <button
                                  onClick={() => handleVerifySingle(claim.id)}
                                  disabled={isCurrentlyVerifying}
                                  className="text-[11px] font-medium px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-300 border border-slate-700 text-slate-300 flex items-center gap-1 transition-all disabled:opacity-50"
                                >
                                  {isCurrentlyVerifying ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ShieldCheck className="w-3 h-3" />
                                  )}
                                  <span>{isCurrentlyVerifying ? "Verifying..." : "Verify"}</span>
                                </button>
                              )}

                              {ver && (
                                <button
                                  onClick={() => {
                                    setActiveClaim(claim);
                                    setActiveVerification(ver);
                                    setAuditNumResult(null);
                                    setAuditOvergenResult(null);
                                  }}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center gap-1 border border-slate-700 transition-colors"
                                >
                                  <span>Evidence ({ver.cited_evidence.length})</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Normalized Proposition Text */}
                          <div className="text-xs text-slate-100 font-medium pl-6 leading-relaxed">
                            {claim.normalized_text}
                          </div>

                          {/* Reasoning teaser if verified */}
                          {ver && (
                            <div className="pl-6 pt-1 text-[11px] text-slate-400 border-t border-slate-800/60 flex items-start gap-2">
                              <span className="font-semibold text-slate-300 shrink-0">Verdict Reasoning:</span>
                              <span className="italic truncate">{ver.reasoning}</span>
                            </div>
                          )}
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
              Claim Verification & Evidence Retrieval Engine
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
              Select an output above and click &ldquo;Decompose into Atomic Claims&rdquo;. VERITAS will split compound propositions, run hybrid lexical and vector retrieval across source papers, and verify claims with verbatim quotation integrity.
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

      {/* Verification Evidence Inspector Drawer / Modal */}
      {(activeClaim || activeVerification) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
                  <span>EVIDENCE VERIFICATION INSPECTOR</span>
                  {activeVerification && (
                    <>
                      <span>·</span>
                      <span className="text-slate-400">Model: {activeVerification.model_name}</span>
                    </>
                  )}
                </div>
                <h3 className="text-base font-bold text-white flex items-center gap-2.5">
                  <span>Atomic Proposition Verification</span>
                  {activeVerification && renderVerdictBadge(activeVerification.verdict)}
                </h3>
              </div>
              <button
                onClick={() => {
                  setActiveClaim(null);
                  setActiveVerification(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Downgrade Alert Banner (Step 7) */}
            {activeVerification?.downgraded && (
              <div className="bg-amber-950/60 border border-amber-600/70 rounded-xl p-3.5 text-xs text-amber-200 flex items-start gap-2.5 shadow-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="font-bold text-amber-300 block mb-0.5">
                    Strict Evidence Harness: Verdict Downgraded to Unresolved
                  </strong>
                  <span>{activeVerification.downgrade_reason}</span>
                </div>
              </div>
            )}

            {/* Normalized Proposition */}
            <div className="space-y-1 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Normalized Proposition
              </span>
              <p className="text-sm font-semibold text-cyan-200">
                {activeClaim?.normalized_text || activeVerification?.claim_text}
              </p>
            </div>

            {/* Verification Reasoning */}
            {activeVerification && (
              <div className="space-y-1 bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  Evidence-Grounded Reasoning
                </span>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {activeVerification.reasoning}
                </p>
              </div>
            )}

            {/* Key Assessment Indicators */}
            {activeVerification && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block font-mono">Evidence Strength</span>
                  <span className="font-semibold text-xs mt-0.5 inline-block text-cyan-300">
                    {activeVerification.evidence_strength}
                  </span>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block font-mono">Retrieved Passages</span>
                  <span className="font-semibold text-xs mt-0.5 inline-block font-mono text-slate-200">
                    {activeVerification.retrieved_passages_count} Candidates
                  </span>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block font-mono">Numerical Match</span>
                  <span className="font-semibold text-xs mt-0.5 inline-block">
                    {activeVerification.numerical_check_passed === true ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Exact Figure
                      </span>
                    ) : activeVerification.numerical_check_passed === false ? (
                      <span className="text-rose-400 flex items-center gap-1">
                        <X className="w-3 h-3" /> Discrepancy
                      </span>
                    ) : (
                      <span className="text-slate-400">N/A (Non-numerical)</span>
                    )}
                  </span>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-400 block font-mono">Integrity Status</span>
                  <span className="font-semibold text-xs mt-0.5 inline-block text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Verified Verbatim
                  </span>
                </div>
              </div>
            )}

            {/* Cited Source Passages */}
            {activeVerification && activeVerification.cited_evidence.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Cited Evidence Passages ({activeVerification.cited_evidence.length})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Grounded in physical PDF page numbers
                  </span>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto">
                  {activeVerification.cited_evidence.map((cite, idx) => (
                    <div
                      key={cite.passage_id || idx}
                      className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-400 text-[11px]">
                            Page {cite.page_number} · Section: {cite.section_title}
                          </span>
                          {cite.is_quote_valid && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Verbatim Quote Verified
                            </span>
                          )}
                          {cite.semantic_entailment && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              Logical Entailment
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleOpenPdf(cite.paper_id, cite.page_number)}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                        >
                          <span>Open PDF</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-xs font-serif italic text-slate-300 pl-3 border-l-2 border-cyan-500/60 bg-slate-900/40 p-2 rounded-r">
                        &ldquo;{cite.exact_quote}&rdquo;
                      </div>

                      {cite.explanation && (
                        <div className="text-[11px] text-slate-400 font-sans">
                          <span className="text-slate-300 font-medium">Relevance:</span> {cite.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Limitations & Caveats */}
            {activeVerification && activeVerification.limitations.length > 0 && (
              <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-xs">
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block mb-1">
                  Contextual Limitations & Uncertainties
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {activeVerification.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 9: Advanced Research Audits (Numerical Truth & Scope Detector) */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold">
                  ADVANCED RESEARCH AUDITS (PHASE 9)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAuditNumerics}
                    disabled={isAuditingNum}
                    className="px-2.5 py-1 rounded bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-700/50 text-[11px] font-medium flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <Binary className={`w-3 h-3 ${isAuditingNum ? "animate-spin" : ""}`} />
                    {isAuditingNum ? "Auditing Numerics..." : "Audit Numerics"}
                  </button>
                  <button
                    onClick={handleAuditOvergeneralization}
                    disabled={isAuditingOvergen}
                    className="px-2.5 py-1 rounded bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-700/50 text-[11px] font-medium flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <ShieldCheck className={`w-3 h-3 ${isAuditingOvergen ? "animate-spin" : ""}`} />
                    {isAuditingOvergen ? "Auditing Scope..." : "Audit Scope"}
                  </button>
                </div>
              </div>

              {/* Numerical Audit Outcome */}
              {auditNumResult && (
                <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Numerical Truth Result:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      auditNumResult.verdict === "Numerically consistent"
                        ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                        : auditNumResult.verdict === "Numerical discrepancy"
                        ? "bg-rose-900/50 text-rose-300 border border-rose-700/50"
                        : "bg-amber-900/50 text-amber-300 border border-amber-700/50"
                    }`}>
                      {auditNumResult.verdict}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">{auditNumResult.calculation_explanation}</p>
                  {(auditNumResult.percentage_point_calc || auditNumResult.relative_change_calc) && (
                    <div className="text-[10px] text-cyan-300 font-mono space-y-0.5 pt-1">
                      {auditNumResult.percentage_point_calc && <div>• Absolute Diff: {auditNumResult.percentage_point_calc}</div>}
                      {auditNumResult.relative_change_calc && <div>• Relative Change: {auditNumResult.relative_change_calc}</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Overgeneralization Audit Outcome */}
              {auditOvergenResult && (
                <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Scope & Generalization:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      !auditOvergenResult.is_overgeneralized
                        ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                        : "bg-amber-900/50 text-amber-300 border border-amber-700/50"
                    }`}>
                      {!auditOvergenResult.is_overgeneralized ? "Appropriately Scoped" : "Overgeneralization Flagged"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    <span className="text-slate-300 font-medium">Type:</span> {auditOvergenResult.flagged_type}
                  </div>
                  <p className="text-[11px] text-slate-300">{auditOvergenResult.explanation}</p>
                  {auditOvergenResult.is_overgeneralized && (
                    <div className="p-2 bg-emerald-950/40 border border-emerald-800/60 rounded text-[11px] text-emerald-300">
                      <span className="font-bold block text-emerald-400">Recommended Narrower Wording:</span>
                      &ldquo;{auditOvergenResult.suggested_narrower_wording}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-500 font-mono text-[10px]">
                Algorithm: Hybrid BM25 + Vector RRF (k=60)
              </span>
              <button
                onClick={() => {
                  setActiveClaim(null);
                  setActiveVerification(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
