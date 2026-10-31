"use client";

import React, { useState, useEffect } from "react";
import {
  Project,
  AtomicClaim,
  NumericalAuditResult,
  OvergeneralizationAuditResult,
  OutputClaimsResponse
} from "../../types";
import {
  auditNumericalClaim,
  auditOvergeneralization,
  fetchOutputClaims,
  fetchProjectSummaries,
  fetchProjectComparisons
} from "../../lib/api";
import {
  Binary,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Percent,
  TrendingUp,
  BookOpen,
  RefreshCw,
  Search,
  Sparkles,
  ArrowRight,
  Maximize2
} from "lucide-react";

interface NumericalTruthAuditViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
  onNavigateToEvidence?: (paperId: string) => void;
}

export function NumericalTruthAuditView({
  currentProject,
  onSelectProject,
  onNavigateToEvidence
}: NumericalTruthAuditViewProps) {
  const [claims, setClaims] = useState<AtomicClaim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<AtomicClaim | null>(null);

  // Audit Results
  const [numResult, setNumResult] = useState<NumericalAuditResult | null>(null);
  const [overgenResult, setOvergenResult] = useState<OvergeneralizationAuditResult | null>(null);
  const [auditingNum, setAuditingNum] = useState(false);
  const [auditingOvergen, setAuditingOvergen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    loadProjectClaims();
  }, [currentProject]);

  const loadProjectClaims = async () => {
    if (!currentProject) return;
    setLoadingClaims(true);
    setError(null);
    try {
      // Gather claims from summaries and syntheses
      const [sumsRes, compsRes] = await Promise.all([
        fetchProjectSummaries(currentProject.id).catch(() => ({ summaries: [] })),
        fetchProjectComparisons(currentProject.id).catch(() => ({ comparisons: [] }))
      ]);

      const outputIds: string[] = [];
      (sumsRes.summaries || []).forEach((s: any) => outputIds.push(s.id));
      (compsRes.comparisons || []).forEach((c: any) => outputIds.push(c.id));

      const gatheredClaims: AtomicClaim[] = [];
      for (const oid of outputIds.slice(0, 5)) {
        try {
          const resp = await fetchOutputClaims(oid);
          if (resp && resp.claims) {
            gatheredClaims.push(...resp.claims);
          }
        } catch {
          // ignore
        }
      }

      setClaims(gatheredClaims);
      if (gatheredClaims.length > 0 && !selectedClaim) {
        handleSelectClaim(gatheredClaims[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load claims for auditing.");
    } finally {
      setLoadingClaims(false);
    }
  };

  const handleSelectClaim = async (claim: AtomicClaim) => {
    setSelectedClaim(claim);
    setNumResult(null);
    setOvergenResult(null);
    if (!currentProject) return;

    // Run both audits automatically
    setAuditingNum(true);
    setAuditingOvergen(true);
    setError(null);

    try {
      const [nRes, oRes] = await Promise.all([
        auditNumericalClaim(claim.id, currentProject.id).catch((err) => {
          console.warn("Num audit error:", err);
          return null;
        }),
        auditOvergeneralization(claim.id, currentProject.id).catch((err) => {
          console.warn("Overgen audit error:", err);
          return null;
        })
      ]);
      setNumResult(nRes);
      setOvergenResult(oRes);
    } catch (err: any) {
      setError(err.message || "Failed to audit proposition.");
    } finally {
      setAuditingNum(false);
      setAuditingOvergen(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
          <Binary className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">No Project Selected</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Please select or open a research project to run mathematical and overgeneralization audits on proposition claims.
        </p>
      </div>
    );
  }

  const getVerdictBadge = (verdict?: string) => {
    switch (verdict) {
      case "Numerically consistent":
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Numerically Consistent
          </span>
        );
      case "Numerical discrepancy":
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            Numerical Discrepancy
          </span>
        );
      case "Context mismatch":
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Context Mismatch (Metric / Dataset)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Insufficient Numerical Evidence
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <Binary className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Numerical Truth & Scope Detector</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Deterministic Auditor
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Detects mathematical discrepancies, percentage points vs relative changes, and overgeneralization risks.
          </p>
        </div>

        <button
          onClick={loadProjectClaims}
          disabled={loadingClaims}
          className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loadingClaims ? "animate-spin" : ""}`} />
          Reload Claims
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Left Claim Selector, Right Inspection Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Claim Propositions */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Propositions ({claims.length})
            </h3>
            <span className="text-[11px] text-slate-400">Click to audit</span>
          </div>

          {loadingClaims ? (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
              <p className="text-xs">Loading project claims...</p>
            </div>
          ) : claims.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-xs">No decomposed claims available yet.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Generate a Research Summary or Synthesis first to decompose propositions.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {claims.map((c) => {
                const isSelected = selectedClaim?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectClaim(c)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition select-none ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-400 text-blue-950 font-medium shadow-2xs"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-slate-100 text-slate-600">
                        {c.category}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {c.verification_status}
                      </span>
                    </div>
                    <p className="line-clamp-2 leading-relaxed">{c.normalized_text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: In-Depth Audit Panels */}
        <div className="lg:col-span-7 space-y-6">
          {selectedClaim ? (
            <>
              {/* Selected Claim Banner */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Inspected Proposition
                </div>
                <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                  &ldquo;{selectedClaim.normalized_text}&rdquo;
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500 font-mono">
                  <span>ID: {selectedClaim.id}</span>
                  <span>•</span>
                  <span>Category: {selectedClaim.category}</span>
                </div>
              </div>

              {/* Feature A: Numerical Truth Auditor Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Binary className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">Numerical Truth Audit</h3>
                  </div>
                  {auditingNum ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    numResult && getVerdictBadge(numResult.verdict)
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {auditingNum ? (
                    <p className="text-xs text-slate-500 italic">Running Decimal arithmetic audit...</p>
                  ) : numResult ? (
                    <>
                      {/* Metric & Context Matching Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Metric</span>
                          <span className="font-semibold text-slate-800">
                            {numResult.claimed_expression?.metric || "N/A"}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Dataset</span>
                          <span className="font-semibold text-slate-800">
                            {numResult.claimed_expression?.dataset || "N/A"}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Claimed Value</span>
                          <span className="font-semibold text-blue-700">
                            {numResult.claimed_expression
                              ? `${numResult.claimed_expression.value}${numResult.claimed_expression.unit || ""}`
                              : "N/A"}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Source Reported</span>
                          <span className="font-semibold text-emerald-700">
                            {numResult.source_reported_expression
                              ? `${numResult.source_reported_expression.value}${numResult.source_reported_expression.unit || ""}`
                              : "Not stated"}
                          </span>
                        </div>
                      </div>

                      {/* Mathematical Explanation */}
                      <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-950">
                        <span className="font-bold block mb-0.5">Deterministic Validation Log:</span>
                        <p className="leading-relaxed">{numResult.calculation_explanation}</p>
                      </div>

                      {/* Percentage Point vs Relative Change Breakdown */}
                      {(numResult.percentage_point_calc || numResult.relative_change_calc) && (
                        <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs space-y-1">
                          <span className="font-bold text-amber-950 block">Calculated Mathematical Distinctions:</span>
                          {numResult.percentage_point_calc && (
                            <p className="text-amber-900">
                              • Absolute Difference: <code className="font-mono font-bold">{numResult.percentage_point_calc}</code>
                            </p>
                          )}
                          {numResult.relative_change_calc && (
                            <p className="text-amber-900">
                              • Relative Percentage Change: <code className="font-mono font-bold">{numResult.relative_change_calc}</code>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Exact Cited Source Quotation */}
                      {numResult.exact_quote && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Exact Paper Source Passage
                          </span>
                          <p className="italic text-slate-700">&ldquo;{numResult.exact_quote}&rdquo;</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Click a proposition to run numerical verification.</p>
                  )}
                </div>
              </div>

              {/* Feature B: Overgeneralization Detector Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <h3 className="text-sm font-bold text-slate-900">Scope & Overgeneralization Detector</h3>
                  </div>
                  {auditingOvergen ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                  ) : overgenResult ? (
                    overgenResult.is_overgeneralized ? (
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Scope Overreach Flagged
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Appropriately Scoped
                      </span>
                    )
                  ) : null}
                </div>

                <div className="p-5 space-y-4">
                  {auditingOvergen ? (
                    <p className="text-xs text-slate-500 italic">Analyzing scope bounds and causal claims...</p>
                  ) : overgenResult ? (
                    <>
                      <div className="text-xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">Classification:</span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium">
                            {overgenResult.flagged_type}
                          </span>
                        </div>

                        <p className="text-slate-600 leading-relaxed">
                          {overgenResult.explanation}
                        </p>

                        <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-lg text-purple-950 space-y-1">
                          <span className="font-bold block">Evidence-Supported Scope:</span>
                          <p>{overgenResult.evidence_supported_scope}</p>
                        </div>

                        {overgenResult.is_overgeneralized && (
                          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg text-emerald-950 space-y-1">
                            <span className="font-bold block text-emerald-900">
                              VERITAS Recommended Narrower Wording:
                            </span>
                            <p className="font-medium italic">
                              &ldquo;{overgenResult.suggested_narrower_wording}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Select a proposition to inspect scope risks.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Binary className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="text-base font-semibold text-slate-700">No Proposition Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Choose any extracted claim from the left column to run the deterministic numerical and scope verification engine.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
