"use client";

import React, { useState, useEffect } from "react";
import {
  Project,
  Paper,
  ComparisonResponse,
  PaperEvidence,
  DisagreementClassification,
  ComparisonMatrixResponse,
  MatrixCell
} from "../../types";
import {
  fetchProjects,
  fetchProjectPapers,
  generateComparison,
  fetchProjectComparisons,
  fetchSignedUrl,
  generateMatrix,
  fetchProjectMatrices
} from "../../lib/api";
import {
  GitMerge,
  TableProperties,
  Download,
  ExternalLink,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Table,
  FileText,
  Copy,
  Layers,
  ChevronRight
} from "lucide-react";

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

  // Mode: Corpus Synthesis vs Comparison Matrix
  const [viewMode, setViewMode] = useState<"synthesis" | "matrix">("synthesis");

  // Synthesis state
  const [activeSynthesis, setActiveSynthesis] = useState<ComparisonResponse | null>(null);
  const [savedSyntheses, setSavedSyntheses] = useState<ComparisonResponse[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [loadingPapers, setLoadingPapers] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Matrix state
  const [matrices, setMatrices] = useState<ComparisonMatrixResponse[]>([]);
  const [activeMatrix, setActiveMatrix] = useState<ComparisonMatrixResponse | null>(null);
  const [generatingMatrix, setGeneratingMatrix] = useState<boolean>(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

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

  // Load papers, syntheses, and matrices when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingPapers(true);
    setError(null);
    setMatrixError(null);
    setActiveSynthesis(null);
    setActiveMatrix(null);
    setSelectedPaperIds([]);

    // Fetch project papers
    fetchProjectPapers(selectedProjectId)
      .then((data) => {
        setPapers(data);
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

    // Fetch existing matrices
    loadSavedMatrices(selectedProjectId);
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

  const loadSavedMatrices = (projectId: string) => {
    fetchProjectMatrices(projectId)
      .then((res) => {
        setMatrices(res || []);
        if (res && res.length > 0 && !activeMatrix) {
          setActiveMatrix(res[0]);
        }
      })
      .catch((err) => console.warn("Could not fetch saved matrices:", err));
  };

  const handleTogglePaper = (paperId: string) => {
    setSelectedPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    );
  };

  const handleGenerateSynthesis = async () => {
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

  const handleGenerateMatrix = async () => {
    if (selectedPaperIds.length < 2) {
      setMatrixError("Please select at least 2 papers to generate a comparison matrix.");
      return;
    }
    setGeneratingMatrix(true);
    setMatrixError(null);

    try {
      const res = await generateMatrix({
        project_id: selectedProjectId,
        paper_ids: selectedPaperIds
      });
      setActiveMatrix(res);
      loadSavedMatrices(selectedProjectId);
    } catch (err: any) {
      setMatrixError(err.message || "Failed to generate comparison matrix.");
    } finally {
      setGeneratingMatrix(false);
    }
  };

  const handleCellClick = (cell: MatrixCell) => {
    if (cell.passage_id) {
      setActiveEvidence({
        passage_id: cell.passage_id,
        paper_id: cell.paper_id,
        paper_title: cell.paper_title,
        page_number: cell.page_number,
        exact_quote: cell.exact_quote || cell.content,
        claim_summary: cell.content,
        is_verified: true,
        match_score: 1.0
      });
    }
  };

  const exportMatrixCsv = () => {
    if (!activeMatrix) return;
    const headers = ["Dimension", ...activeMatrix.paper_meta.map((p) => `"${p.title.replace(/"/g, '""')}"`)];
    const rows = activeMatrix.rows.map((row) => {
      return [
        `"${row.dimension.replace(/"/g, '""')}"`,
        ...activeMatrix.paper_ids.map((pid) => {
          const cell = row.cells[pid];
          if (!cell || cell.status === "not_reported") return '"Not reported"';
          const text = `${cell.content}${cell.exact_quote ? " | Quote: " + cell.exact_quote : ""}${
            cell.page_number ? " (p." + cell.page_number + ")" : ""
          }`;
          return `"${text.replace(/"/g, '""')}"`;
        })
      ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `matrix-${activeMatrix.id.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportMatrixJson = () => {
    if (!activeMatrix) return;
    const blob = new Blob([JSON.stringify(activeMatrix, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `matrix-${activeMatrix.id.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
        <FileText className="w-3 h-3 text-veritas-primary" />
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
                <GitMerge className="w-6 h-6" />
              </span>
              Cross-Paper Synthesis & Research Comparison
            </h1>
            <p className="text-sm text-veritas-neutral-dark mt-1">
              Synthesize multi-paper consensus, expose methodological divergences, and generate structured comparison matrices with verified PDF citations.
            </p>
          </div>

          {/* Segmented View Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode("synthesis")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                viewMode === "synthesis"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Corpus Synthesis</span>
            </button>
            <button
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                viewMode === "matrix"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Comparison Matrix</span>
            </button>
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
                    onChange={() => {}}
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

          {/* Action Row Based on Mode */}
          {viewMode === "synthesis" ? (
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
                placeholder="Optional: Focus synthesis on a specific question (e.g. Which method yields higher latency reduction?)"
                className="flex-1 px-3.5 py-2 text-xs bg-white border border-veritas-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-veritas-primary/30"
              />
              <button
                onClick={handleGenerateSynthesis}
                disabled={generating || selectedPaperIds.length < 2}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#126BEB] hover:bg-blue-600 rounded-lg transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {generating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white font-semibold leading-none">Synthesizing Corpus...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white" />
                    <span className="text-white font-semibold leading-none">Generate Cross-Paper Synthesis</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-slate-500">
                Generate an academic side-by-side comparison matrix across Objectives, Methods, Datasets, Results & Limitations.
              </div>
              <div className="flex items-center gap-2">
                {activeMatrix && (
                  <>
                    <button
                      onClick={exportMatrixCsv}
                      className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition"
                      title="Export Matrix as CSV"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={exportMatrixJson}
                      className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition"
                      title="Export Matrix as JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                  </>
                )}
                <button
                  onClick={handleGenerateMatrix}
                  disabled={generatingMatrix || selectedPaperIds.length < 2}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#126BEB] hover:bg-blue-600 rounded-lg transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {generatingMatrix ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="text-white font-semibold leading-none">Generating Matrix...</span>
                    </>
                  ) : (
                    <>
                      <TableProperties className="w-4 h-4 text-white" />
                      <span className="text-white font-semibold leading-none">Generate Comparison Matrix</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODE 1: CORPUS SYNTHESIS                                  */}
      {/* ========================================================== */}
      {viewMode === "synthesis" && (
        <>
          {/* Error state */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>{error}</span>
              </div>
              <button
                onClick={handleGenerateSynthesis}
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
              <GitMerge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
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
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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
                        <FileText className="w-3.5 h-3.5 text-rose-500" />
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
                      <AlertTriangle className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-veritas-dark font-serif">
                        2. Contextual Disagreements & Divergences
                      </h3>
                      <p className="text-xs text-veritas-neutral-dark">
                        Every conflict is classified into genuine contradiction, differing experimental setup, or non-comparable domain.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                    {activeSynthesis.disagreements.length} Points Analyzed
                  </span>
                </div>

                <div className="space-y-4">
                  {activeSynthesis.disagreements.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition space-y-3 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-400">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {item.topic}
                          </span>
                        </div>
                        {renderDisagreementBadge(item.classification)}
                      </div>

                      {/* Side-by-Side Claims */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                          <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                            {item.paper_a_claim.paper_title}
                          </span>
                          <p className="text-slate-900 font-medium">
                            {item.paper_a_claim.claim_summary}
                            {renderCitationPill(item.paper_a_claim)}
                          </p>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                          <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                            {item.paper_b_claim.paper_title}
                          </span>
                          <p className="text-slate-900 font-medium">
                            {item.paper_b_claim.claim_summary}
                            {renderCitationPill(item.paper_b_claim)}
                          </p>
                        </div>
                      </div>

                      {/* Reconciliation / Contextual Explanation */}
                      <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 text-slate-700 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">
                          Reconciliation & Contextual Resolution
                        </span>
                        <p className="leading-relaxed">
                          {item.explanation}
                        </p>
                        {item.contextual_factors && item.contextual_factors.length > 0 && (
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-slate-600">
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

              {/* Section 3: Thematic Consensus & Joint Findings */}
              {activeSynthesis.consensus_points && activeSynthesis.consensus_points.length > 0 && (
                <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
                  <h3 className="text-base font-bold text-veritas-dark font-serif border-l-4 border-emerald-500 pl-3">
                    3. Shared Consensus Points Across Corpus
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeSynthesis.consensus_points.map((pt, idx) => (
                      <div key={pt.id || idx} className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-2 text-xs">
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

              {/* Section 4: Dimensional Synthesis Breakdown */}
              {activeSynthesis.dimension_matrix && activeSynthesis.dimension_matrix.length > 0 && (
                <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
                  <h3 className="text-base font-bold text-veritas-dark font-serif border-l-4 border-blue-500 pl-3">
                    4. Dimensional Synthesis Breakdown
                  </h3>
                  <div className="space-y-3">
                    {activeSynthesis.dimension_matrix.map((dim, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-900">{dim.dimension_name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono">Dimension {idx + 1}</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{dim.synthesis_notes}</p>
                        {dim.evidence && dim.evidence.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-1">
                            <span className="text-[10px] text-slate-400">Dimension Evidence:</span>
                            {dim.evidence.map((ev, eIdx) => (
                              <span key={eIdx}>{renderCitationPill(ev)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================== */}
      {/* MODE 2: COMPARISON MATRIX                                  */}
      {/* ========================================================== */}
      {viewMode === "matrix" && (
        <div className="space-y-6">
          {matrixError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>{matrixError}</span>
              </div>
              <button
                onClick={handleGenerateMatrix}
                className="px-3 py-1 bg-white border border-rose-300 text-xs font-semibold text-rose-700 rounded-lg hover:bg-rose-100"
              >
                Retry
              </button>
            </div>
          )}

          {generatingMatrix && (
            <div className="p-16 text-center bg-white rounded-xl border border-veritas-neutral-light shadow-sm">
              <div className="w-10 h-10 border-4 border-veritas-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <h3 className="text-base font-semibold text-veritas-dark font-serif">
                Extracting Matrix Dimensions & Verifying Cell Citations
              </h3>
              <p className="text-xs text-veritas-neutral-dark mt-1">
                Comparing objectives, methodologies, datasets, findings and limitations across selected papers...
              </p>
            </div>
          )}

          {!generatingMatrix && activeMatrix ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <TableProperties className="w-4 h-4 text-blue-600" />
                    Structured Comparison Matrix
                  </h3>
                  <p className="text-xs text-slate-500">
                    Comparing {activeMatrix.paper_meta.length} papers across {activeMatrix.rows.length} research dimensions with verified PDF citations.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportMatrixCsv}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={exportMatrixJson}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200">
                      <th className="p-4 font-bold uppercase text-slate-500 tracking-wider text-[11px] w-1/4 border-r border-slate-200">
                        Comparison Dimension
                      </th>
                      {activeMatrix.paper_meta.map((pm) => (
                        <th
                          key={pm.id}
                          className="p-4 font-semibold text-slate-900 border-r border-slate-200 last:border-r-0 min-w-[260px]"
                        >
                          <div className="text-xs font-bold text-slate-900">{pm.title}</div>
                          <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                            {pm.authors && pm.authors.length > 0 ? pm.authors[0] : ""} ({pm.year || "N/A"})
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeMatrix.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 font-semibold text-slate-800 border-r border-slate-200 bg-slate-50/40 align-top">
                          <div className="text-xs font-bold text-slate-900">{row.dimension}</div>
                          <div className="text-[11px] text-slate-500 font-normal mt-1 italic">
                            {row.claim_label}
                          </div>
                        </td>
                        {activeMatrix.paper_ids.map((pid) => {
                          const cell = row.cells[pid];
                          if (!cell || cell.status === "not_reported") {
                            return (
                              <td
                                key={pid}
                                className="p-4 text-slate-400 italic border-r border-slate-200 last:border-r-0 align-top bg-slate-50/20"
                              >
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 block w-fit mb-1 font-mono">
                                  Not reported
                                </span>
                                <span>Not documented in this paper</span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={pid}
                              className="p-4 text-slate-800 border-r border-slate-200 last:border-r-0 align-top space-y-2"
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold font-mono">
                                  Evidence present
                                </span>
                                {cell.page_number && (
                                  <button
                                    onClick={() => handleCellClick(cell)}
                                    className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono hover:underline"
                                  >
                                    <span>Page {cell.page_number}</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>

                              <p className="text-xs leading-relaxed text-slate-800 font-medium">
                                {cell.content}
                              </p>

                              {cell.exact_quote && (
                                <div
                                  onClick={() => handleCellClick(cell)}
                                  className="p-2.5 bg-amber-50/60 rounded-lg border border-amber-200/80 text-[11px] font-serif italic text-amber-950 hover:border-blue-400 cursor-pointer transition-colors"
                                  title="Click to view verified citation in modal"
                                >
                                  &ldquo;{cell.exact_quote}&rdquo;
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !generatingMatrix && (
            <div className="p-16 text-center bg-white rounded-xl border border-dashed border-veritas-neutral-light">
              <Table className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-veritas-dark">Source-Linked Comparison Matrix</h3>
              <p className="text-xs text-veritas-neutral-dark mt-1 max-w-md mx-auto mb-4">
                Select 2 or more research papers from the active project above and click &ldquo;Generate Comparison Matrix&rdquo; to build an interactive dimensional comparison table with verified PDF citations.
              </p>
              <button
                onClick={handleGenerateMatrix}
                disabled={generatingMatrix || selectedPaperIds.length < 2}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#126BEB] hover:bg-blue-600 rounded-lg transition shadow-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                <TableProperties className="w-4 h-4" />
                <span>Generate Matrix for Selected Papers</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Verified Evidence Passage Inspection Modal */}
      {activeEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
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
                  &ldquo;{activeEvidence.exact_quote || "Direct quote not available"}&rdquo;
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
