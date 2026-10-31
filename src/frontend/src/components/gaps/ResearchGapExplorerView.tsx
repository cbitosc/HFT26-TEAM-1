"use client";

import React, { useState, useEffect } from "react";
import { Project, ResearchGapItem, ProjectGapsResponse, Paper } from "../../types";
import { fetchProjectGaps, generateResearchGaps, fetchProjectPapers } from "../../lib/api";
import {
  Compass,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Filter,
  Lightbulb,
  HelpCircle,
  Layers,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from "lucide-react";

interface ResearchGapExplorerViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
  onNavigateToEvidence?: (paperId: string) => void;
}

export function ResearchGapExplorerView({
  currentProject,
  onSelectProject,
  onNavigateToEvidence
}: ResearchGapExplorerViewProps) {
  const [gapsResponse, setGapsResponse] = useState<ProjectGapsResponse | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Generation Inputs
  const [filterType, setFilterType] = useState<"ALL" | "AUTHOR_IDENTIFIED" | "VERITAS_SYNTHESIZED">("ALL");
  const [focusArea, setFocusArea] = useState<string>("");
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProject) return;

    loadGapsAndPapers();
  }, [currentProject]);

  const loadGapsAndPapers = async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const [gapsRes, papersRes] = await Promise.all([
        fetchProjectGaps(currentProject.id).catch(() => null),
        fetchProjectPapers(currentProject.id).catch(() => [])
      ]);
      if (gapsRes) {
        setGapsResponse(gapsRes);
        if (gapsRes.gaps.length > 0) {
          setExpandedGapId(gapsRes.gaps[0].id);
        }
      }
      setPapers(papersRes || []);
    } catch (err: any) {
      setError(err.message || "Failed to load project research gaps.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!currentProject) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateResearchGaps({
        project_id: currentProject.id,
        paper_ids: selectedPaperIds.length > 0 ? selectedPaperIds : undefined,
        focus_area: focusArea.trim() || undefined
      });
      setGapsResponse(res);
      if (res.gaps.length > 0) {
        setExpandedGapId(res.gaps[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate research gaps.");
    } finally {
      setGenerating(false);
    }
  };

  const togglePaperSelect = (pid: string) => {
    setSelectedPaperIds(prev =>
      prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]
    );
  };

  if (!currentProject) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
          <Compass className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">No Project Selected</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Please select or open a research project to explore and synthesize research gaps across papers.
        </p>
      </div>
    );
  }

  const allGaps = gapsResponse?.gaps || [];
  const filteredGaps = allGaps.filter(g => {
    if (filterType === "AUTHOR_IDENTIFIED") {
      return g.origin_type === "Author-identified future work";
    }
    if (filterType === "VERITAS_SYNTHESIZED") {
      return g.origin_type === "VERITAS-synthesized research direction";
    }
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
              <Compass className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Research Gap Explorer</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
              Phase 9
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Synthesize actionable, evidence-backed research questions grounded strictly in author-stated limitations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadGapsAndPapers}
            disabled={loading || generating}
            className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-[#126BEB] hover:bg-blue-600 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Synthesizing Gaps..." : "Generate Research Gaps"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Synthesis Config Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Filter className="w-4 h-4 text-slate-400" />
            <span>Target Paper Scope:</span>
            {papers.length === 0 ? (
              <span className="text-slate-400 italic font-normal">No papers uploaded</span>
            ) : (
              <div className="flex flex-wrap gap-1.5 ml-1">
                <button
                  onClick={() => setSelectedPaperIds([])}
                  className={`px-2 py-0.5 rounded font-medium transition ${
                    selectedPaperIds.length === 0
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All ({papers.length})
                </button>
                {papers.map(p => {
                  const isSel = selectedPaperIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePaperSelect(p.id)}
                      className={`px-2 py-0.5 rounded font-medium truncate max-w-[180px] transition ${
                        isSel
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      title={p.title}
                    >
                      {p.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-slate-600 font-medium">Focus Area (optional):</label>
            <input
              type="text"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="e.g. Scalability, Evaluation, Efficiency"
              className="px-2.5 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 w-full md:w-60"
            />
          </div>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Gaps</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {gapsResponse?.total_gaps ?? 0}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-200">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-500">Author-Identified</div>
            <div className="text-2xl font-bold text-blue-700 mt-0.5">
              {gapsResponse?.author_identified_count ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Reported directly by authors</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <BookOpen className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-purple-500">VERITAS Synthesized</div>
            <div className="text-2xl font-bold text-purple-700 mt-0.5">
              {gapsResponse?.veritas_synthesized_count ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Cross-paper open directions</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
            <Lightbulb className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setFilterType("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            filterType === "ALL"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          All Gaps ({allGaps.length})
        </button>
        <button
          onClick={() => setFilterType("AUTHOR_IDENTIFIED")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
            filterType === "AUTHOR_IDENTIFIED"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Author-Identified ({gapsResponse?.author_identified_count ?? 0})
        </button>
        <button
          onClick={() => setFilterType("VERITAS_SYNTHESIZED")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
            filterType === "VERITAS_SYNTHESIZED"
              ? "bg-purple-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Lightbulb className="w-3.5 h-3.5" />
          VERITAS Synthesized ({gapsResponse?.veritas_synthesized_count ?? 0})
        </button>
      </div>

      {/* Gaps List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
          <p className="text-sm font-medium">Loading research gap profiles...</p>
        </div>
      ) : filteredGaps.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <Compass className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Research Gaps Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Click &ldquo;Generate Research Gaps&rdquo; to scan author limitations and cross-paper open questions across your project.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-[#126BEB] text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
          >
            Synthesize Gaps Now
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGaps.map((gap, idx) => {
            const isExpanded = expandedGapId === gap.id;
            const isAuthor = gap.origin_type === "Author-identified future work";

            return (
              <div
                key={gap.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition hover:border-slate-300"
              >
                {/* Collapsible Header */}
                <div
                  onClick={() => setExpandedGapId(isExpanded ? null : gap.id)}
                  className="p-5 cursor-pointer flex items-start justify-between gap-4 select-none hover:bg-slate-50/50 transition"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        GAP-{String(idx + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                          isAuthor
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-purple-50 text-purple-700 border border-purple-200"
                        }`}
                      >
                        {isAuthor ? <BookOpen className="w-3 h-3" /> : <Lightbulb className="w-3 h-3" />}
                        {gap.origin_type}
                      </span>
                      {gap.source_paper_titles.map((title, pIdx) => (
                        <span
                          key={pIdx}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium truncate max-w-[220px]"
                          title={title}
                        >
                          📄 {title}
                        </span>
                      ))}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {gap.suggested_research_question}
                    </h3>

                    <p className="text-xs text-slate-600 line-clamp-2">
                      {gap.explanation}
                    </p>
                  </div>

                  <div className="pt-1 text-slate-400">
                    <ChevronRight
                      className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-90 text-blue-600" : ""}`}
                    />
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-5 pt-0 border-t border-slate-100 bg-slate-50/40 space-y-4">
                    {/* Supporting Limitations */}
                    <div className="space-y-2 mt-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Grounded Source Limitations (Author Evidence)
                      </div>
                      <div className="space-y-2">
                        {gap.supporting_limitations.map((lim, lIdx) => (
                          <div
                            key={lIdx}
                            className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 flex items-start gap-2.5 shadow-2xs"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                            <div className="flex-1 italic leading-relaxed">
                              &ldquo;{lim}&rdquo;
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Important Uncertainties */}
                    {gap.important_uncertainties && gap.important_uncertainties.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                          <HelpCircle className="w-4 h-4 text-amber-600" />
                          Critical Scientific Uncertainties
                        </div>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          {gap.important_uncertainties.map((u, uIdx) => (
                            <li
                              key={uIdx}
                              className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2"
                            >
                              <span className="text-amber-500 font-bold">•</span>
                              <span>{u}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Feasibility Notes */}
                    {gap.feasibility_notes && (
                      <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
                        <div className="font-semibold text-indigo-950 mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          Feasibility & Methodological Guidance
                        </div>
                        <p className="leading-relaxed">{gap.feasibility_notes}</p>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <span className="text-slate-400">
                        Created: {new Date(gap.created_at).toLocaleString()}
                      </span>
                      {gap.source_paper_ids.length > 0 && onNavigateToEvidence && (
                        <button
                          onClick={() => onNavigateToEvidence(gap.source_paper_ids[0])}
                          className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                          Explore Source Evidence Passages
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
