"use client";

import React, { useState, useEffect } from "react";
import {
  Project,
  Paper,
  ComparisonResponse,
  PaperEvidence,
  DisagreementClassification
} from "../../types";
import {
  fetchProjects,
  fetchProjectPapers,
  generateComparison,
  fetchProjectComparisons,
  fetchSignedUrl
} from "../../lib/api";

interface CrossPaperSynthesisViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export const CrossPaperSynthesisView: React.FC<CrossPaperSynthesisViewProps> = ({
  currentProject,
  onSelectProject
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || "");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [researchQuestion, setResearchQuestion] = useState<string>("");

  // Synthesis state
  const [activeSynthesis, setActiveSynthesis] = useState<ComparisonResponse | null>(null);
  const [savedSyntheses, setSavedSyntheses] = useState<ComparisonResponse[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [loadingPapers, setLoadingPapers] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence citation inspector modal
  const [activeEvidence, setActiveEvidence] = useState<PaperEvidence | null>(null);
  const [openingPdf, setOpeningPdf] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load project list
  useEffect(() => {
    fetchProjects()
      .then((projs) => {
        setProjects(projs);
        if (!selectedProjectId && projs.length > 0) {
          setSelectedProjectId(projs[0].id);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  // Update when currentProject changes
  useEffect(() => {
    if (currentProject?.id) {
      setSelectedProjectId(currentProject.id);
    }
  }, [currentProject]);

  // Load papers and saved comparisons when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingPapers(true);
    setError(null);
    setActiveSynthesis(null);
    setSelectedPaperIds([]);

    // Fetch project papers
    fetchProjectPapers(selectedProjectId)
      .then((data) => {
        setPapers(data);
        // Pre-select first 2 papers if available
        if (data.length >= 2) {
          setSelectedPaperIds([data[0].id, data[1].id]);
        } else if (data.length === 1) {
          setSelectedPaperIds([data[0].id]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingPapers(false));

    // Fetch existing syntheses
    loadSavedSyntheses(selectedProjectId);
  }, [selectedProjectId]);

  const loadSavedSyntheses = (projectId: string) => {
    fetchProjectComparisons(projectId)
      .then((res) => {
        setSavedSyntheses(res.comparisons || []);
        if (res.comparisons && res.comparisons.length > 0 && !activeSynthesis) {
          setActiveSynthesis(res.comparisons[0]);
        }
      })
      .catch((err) => console.warn("Could not fetch saved comparisons:", err));
  };

  const handleTogglePaper = (paperId: string) => {
    setSelectedPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    );
  };

  const handleGenerate = async () => {
    if (selectedPaperIds.length < 2) {
      setError("Please select at least 2 papers to perform a cross-paper synthesis.");
      return;
    }
    setGenerating(true);
    setError(null);

    try {
      const result = await generateComparison({
        project_id: selectedProjectId,
        paper_ids: selectedPaperIds,
        research_question: researchQuestion.trim() || undefined
      });
      setActiveSynthesis(result);
      loadSavedSyntheses(selectedProjectId);
    } catch (err: any) {
      setError(err.message || "Failed to generate cross-paper synthesis.");
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenPdf = async (paperId: string) => {
    setOpeningPdf(true);
    try {
      const res = await fetchSignedUrl(paperId);
      window.open(res.signed_url, "_blank");
    } catch (err: any) {
      alert(`Could not open PDF: ${err.message}`);
    } finally {
      setOpeningPdf(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderDisagreementBadge = (classification: DisagreementClassification) => {
    switch (classification) {
      case "DIRECT_CONTRADICTION":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            Direct Contradiction
          </span>
        );
      case "CONTEXTUAL_DISAGREEMENT":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Contextual Disagreement
          </span>
        );
      case "NON_COMPARABLE":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
            Non-Comparable Domains
          </span>
        );
      case "CONSENSUS":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Consensus Observed
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            Insufficient Evidence
          </span>
        );
    }
  };

  const renderCitationPill = (ev?: PaperEvidence) => {
    if (!ev || !ev.passage_id) return null;
    return (
      <button
        onClick={() => setActiveEvidence(ev)}
        className="inline-flex items-center gap-1 px-2 py-0.5 ml-1.5 text-xs font-mono font-medium rounded bg-veritas-primary/10 text-veritas-primary hover:bg-veritas-primary/20 hover:text-veritas-dark transition border border-veritas-primary/20"
        title="View verified passage quotation"
      >
        <svg className="w-3 h-3 text-veritas-primary" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
        </svg>
        <span>p.{ev.page_number || 1}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-veritas-neutral-light p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-veritas-dark font-serif flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </span>
              Cross-Paper Synthesis & Disagreement Engine
            </h1>
            <p className="text-sm text-veritas-neutral-dark mt-1">
              Every disagreement has context. Synthesize multi-paper consensus, expose methodological divergences, and distinguish contradictions from contextual differences.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {savedSyntheses.length > 0 && (
              <span className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-100 text-slate-700 rounded-lg">
                {savedSyntheses.length} Saved Synthes{savedSyntheses.length !== 1 ? "es" : "is"}
              </span>
            )}
          </div>
        </div>

        {/* Multi-Paper Selection Controls */}
        <div className="mt-6 pt-6 border-t border-veritas-neutral-light/60 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-veritas-neutral-dark mb-1">
                Select 2 or More Papers from Project
              </label>
              <p className="text-xs text-veritas-neutral-dark">
                Selected: <span className="font-bold text-veritas-dark">{selectedPaperIds.length} of {papers.length}</span> papers
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedPaperIds(papers.map((p) => p.id))}
                disabled={papers.length < 2}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedPaperIds([])}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Paper Checkbox Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {papers.map((paper) => {
              const isChecked = selectedPaperIds.includes(paper.id);
              return (
                <div
                  key={paper.id}
                  onClick={() => handleTogglePaper(paper.id)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition flex items-start gap-2.5 ${
                    isChecked
                      ? "bg-indigo-50/70 border-indigo-300 text-indigo-950 shadow-xs"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by parent div
                    className="mt-0.5 rounded border-slate-300 text-veritas-primary focus:ring-veritas-primary"
                  />
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold truncate leading-tight">
                      {paper.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {paper.authors?.join(", ") || "n.d."} ({paper.publication_year || "n.d."})
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Optional Research Focus Question & Generate Button */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <input
              type="text"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              placeholder="Optional: Focus synthesis on a specific question (e.g. Which method yields higher latency reduction?)"
              className="flex-1 px-3.5 py-2 text-xs bg-white border border-veritas-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-veritas-primary/30"
            />
            <button
              onClick={handleGenerate}
              disabled={generating || selectedPaperIds.length < 2}
              className="px-5 py-2 text-xs font-bold text-white bg-veritas-primary hover:bg-veritas-primary-hover rounded-lg transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
            >
              {generating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Synthesizing Corpus...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span>Generate Cross-Paper Synthesis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            onClick={handleGenerate}
            className="px-3 py-1 bg-white border border-rose-300 text-xs font-semibold text-rose-700 rounded-lg hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {generating && (
        <div className="p-16 text-center bg-white rounded-xl border border-veritas-neutral-light shadow-sm">
          <div className="w-10 h-10 border-4 border-veritas-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-base font-semibold text-veritas-dark font-serif">
            Comparing Dimensions & Analyzing Disagreements
          </h3>
          <p className="text-xs text-veritas-neutral-dark mt-1">
            Reconciling benchmark datasets, metric variations, and contextual explanations...
          </p>
        </div>
      )}

      {/* Empty Selection state */}
      {!generating && !activeSynthesis && papers.length >= 2 && (
        <div className="p-16 text-center bg-white rounded-xl border border-dashed border-veritas-neutral-light">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <h3 className="text-sm font-semibold text-veritas-dark">Select Papers to Synthesize</h3>
          <p className="text-xs text-veritas-neutral-dark mt-1 max-w-md mx-auto">
            Choose two or more academic papers above and click "Generate Cross-Paper Synthesis" to produce side-by-side matrices and contextual disagreement analysis.
          </p>
        </div>
      )}

      {/* Active Synthesis Display */}
      {!generating && activeSynthesis && (
        <div className="space-y-6">
          {/* Provenance Header Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-6 shadow-sm border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {(activeSynthesis.faithfulness_rate * 100).toFixed(0)}% Citation Grounded
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-slate-300">
                    {activeSynthesis.paper_ids.length} Papers Compared
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-slate-300">
                    {activeSynthesis.verified_citations} Verified Evidence Citations
                  </span>
                </div>
                <h2 className="text-xl font-bold font-serif leading-snug">
                  {activeSynthesis.topic}
                </h2>
              </div>
            </div>
          </div>

          {/* Section 1: Side-by-Side Paper Profiles */}
          <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-veritas-dark font-serif border-l-4 border-veritas-primary pl-3">
              1. Side-by-Side Research Profiles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeSynthesis.paper_profiles.map((prof) => (
                <div key={prof.paper_id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5 text-xs">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 leading-snug line-clamp-2">
                      {prof.title}
                    </h4>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      {prof.authors.join(", ") || "n.d."} ({prof.year || "n.d."})
                    </p>
                  </div>

                  <div className="border-t border-slate-200/80 pt-2 space-y-1.5 text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">Paradigm: </span>
                      {prof.methodology}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Dataset: </span>
                      {prof.datasets.join(", ") || "Not reported"}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Key Metrics: </span>
                      {prof.metrics.join("; ") || "Not reported"}
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenPdf(prof.paper_id)}
                    className="w-full mt-2 py-1.5 text-[11px] font-semibold text-veritas-primary bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    <span>View PDF</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Contextual Disagreements & Divergences */}
          <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-veritas-neutral-light/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-amber-50 text-amber-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-veritas-dark font-serif">
                  2. Contextual Disagreement & Divergence Analysis
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {activeSynthesis.disagreements.length} Divergence Item{activeSynthesis.disagreements.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-4">
              {activeSynthesis.disagreements.map((item) => (
                <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{item.topic}</h4>
                      <p className="text-slate-600 mt-0.5">{item.description}</p>
                    </div>
                    <div>{renderDisagreementBadge(item.classification)}</div>
                  </div>

                  {/* Side-by-Side Claims */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                      <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                        {item.paper_a_claim.paper_title}
                      </span>
                      <p className="text-slate-900 font-medium">
                        {item.paper_a_claim.claim_summary}
                        {renderCitationPill(item.paper_a_claim)}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                      <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                        {item.paper_b_claim.paper_title}
                      </span>
                      <p className="text-slate-900 font-medium">
                        {item.paper_b_claim.claim_summary}
                        {renderCitationPill(item.paper_b_claim)}
                      </p>
                    </div>
                  </div>

                  {/* Contextual Explanation */}
                  <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80 text-amber-950 space-y-1">
                    <span className="font-bold text-[10px] uppercase tracking-wider text-amber-900 block">
                      VERITAS Contextual Explanation
                    </span>
                    <p className="leading-relaxed">{item.explanation}</p>
                    {item.contextual_factors.length > 0 && (
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-amber-900/90">
                        {item.contextual_factors.map((factor, fIdx) => (
                          <li key={fIdx}>{factor}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Consensus Points */}
          {activeSynthesis.consensus_points.length > 0 && (
            <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
              <h3 className="text-base font-bold text-veritas-dark font-serif border-l-4 border-emerald-500 pl-3">
                3. Shared Consensus Points Across Corpus
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeSynthesis.consensus_points.map((pt) => (
                  <div key={pt.id} className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-emerald-950">{pt.topic}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        {pt.strength} Consensus
                      </span>
                    </div>
                    <p className="text-emerald-900 leading-relaxed">
                      {pt.consensus_statement}
                    </p>
                    <div className="pt-1 flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-emerald-800 font-semibold">Supporting Citations:</span>
                      {pt.supporting_papers.map((ev, i) => (
                        <span key={i}>{renderCitationPill(ev)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: 12-Dimension Comparison Matrix Table */}
          <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-veritas-dark font-serif border-l-4 border-veritas-primary pl-3">
              4. Complete 12-Dimension Comparison Matrix
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-veritas-neutral-light text-slate-700 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3 w-1/4">Research Dimension</th>
                    {activeSynthesis.paper_profiles.map((p) => (
                      <th key={p.paper_id} className="py-3 px-3">
                        {p.title}
                      </th>
                    ))}
                    <th className="py-3 px-3 w-1/4">Synthesis Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-veritas-neutral-light/50">
                  {activeSynthesis.dimension_matrix.map((dim, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-veritas-dark align-top">
                        {dim.dimension_name}
                      </td>
                      {activeSynthesis.paper_profiles.map((p) => {
                        const val = dim.paper_values[p.paper_id] || "Not reported";
                        const ev = dim.evidence.find((e) => e.paper_id === p.paper_id);
                        return (
                          <td key={p.paper_id} className="py-3 px-3 text-slate-800 align-top leading-relaxed">
                            <span>{val}</span>
                            {renderCitationPill(ev)}
                          </td>
                        );
                      })}
                      <td className="py-3 px-3 text-slate-600 align-top italic">
                        {dim.synthesis_notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Citation Modal */}
      {activeEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-veritas-neutral-light overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-sm font-bold font-mono">Verified Synthesis Citation</h3>
                  <p className="text-[11px] text-slate-300">Grounded evidence from {activeEvidence.paper_title}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveEvidence(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
                  Verbatim Source Quotation
                </span>
                <p className="text-sm font-serif italic text-amber-950 leading-relaxed">
                  "{activeEvidence.exact_quote || "Direct quote not available"}"
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-700">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">PDF Page</span>
                  <span className="font-bold text-sm text-slate-900">
                    Page {activeEvidence.page_number || 1}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">Verification Match</span>
                  <span className="font-bold text-sm text-emerald-700">
                    {(activeEvidence.match_score * 100).toFixed(0)}% Exact Substring
                  </span>
                </div>
              </div>

              {activeEvidence.passage_id && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                      Passage UUID
                    </span>
                    <button
                      onClick={() => handleCopy(activeEvidence.passage_id!, "uuid")}
                      className="text-[11px] font-semibold text-veritas-primary hover:underline"
                    >
                      {copiedId === "uuid" ? "Copied!" : "Copy UUID"}
                    </button>
                  </div>
                  <code className="text-[11px] font-mono text-slate-800 break-all select-all">
                    {activeEvidence.passage_id}
                  </code>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-veritas-neutral-light flex items-center justify-between">
              <button
                onClick={() => handleCopy(activeEvidence.claim_summary, "claim")}
                className="text-xs font-semibold text-veritas-dark hover:text-veritas-primary transition"
              >
                {copiedId === "claim" ? "Claim Copied!" : "Copy Claim"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenPdf(activeEvidence.paper_id)}
                  disabled={openingPdf}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-veritas-neutral-light text-veritas-dark rounded-lg hover:bg-slate-100 transition"
                >
                  Open PDF to Page {activeEvidence.page_number || 1}
                </button>
                <button
                  onClick={() => setActiveEvidence(null)}
                  className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

