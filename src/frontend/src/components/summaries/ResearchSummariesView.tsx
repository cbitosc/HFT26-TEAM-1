"use client";

import React, { useState, useEffect } from "react";
import {
  Project,
  Paper,
  SummaryType,
  SummaryResponse,
  SummaryStatement
} from "../../types";
import {
  fetchProjects,
  fetchProjectPapers,
  generateSummary,
  fetchProjectSummaries,
  deleteSummary,
  fetchSignedUrl
} from "../../lib/api";

interface ResearchSummariesViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export const ResearchSummariesView: React.FC<ResearchSummariesViewProps> = ({
  currentProject,
  onSelectProject
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || "");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string>("");
  const [summaryType, setSummaryType] = useState<SummaryType>("detailed");

  // Summary state
  const [activeSummary, setActiveSummary] = useState<SummaryResponse | null>(null);
  const [savedSummaries, setSavedSummaries] = useState<SummaryResponse[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence citation inspector
  const [activeStatement, setActiveStatement] = useState<SummaryStatement | null>(null);
  const [openingPdf, setOpeningPdf] = useState<boolean>(false);
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

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

  // Update when currentProject prop changes
  useEffect(() => {
    if (currentProject?.id) {
      setSelectedProjectId(currentProject.id);
    }
  }, [currentProject]);

  // Load papers and history when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setError(null);
    setActiveSummary(null);

    // Fetch papers
    fetchProjectPapers(selectedProjectId)
      .then((data) => {
        setPapers(data);
        if (data.length > 0) {
          setSelectedPaperId(data[0].id);
        } else {
          setSelectedPaperId("");
        }
      })
      .catch((err) => setError(err.message));

    // Fetch saved summaries history
    loadSavedSummaries(selectedProjectId);
  }, [selectedProjectId]);

  const loadSavedSummaries = (projectId: string) => {
    setLoadingHistory(true);
    fetchProjectSummaries(projectId)
      .then((res) => {
        setSavedSummaries(res.summaries || []);
        if (res.summaries && res.summaries.length > 0 && !activeSummary) {
          setActiveSummary(res.summaries[0]);
        }
      })
      .catch((err) => loggerWarn(err))
      .finally(() => setLoadingHistory(false));
  };

  const loggerWarn = (err: any) => {
    console.warn("Could not fetch saved summaries:", err);
  };

  const handleGenerate = async () => {
    if (!selectedPaperId) return;
    setGenerating(true);
    setError(null);

    try {
      const summary = await generateSummary({
        paper_id: selectedPaperId,
        project_id: selectedProjectId,
        summary_type: summaryType
      });
      setActiveSummary(summary);
      // Refresh history list
      loadSavedSummaries(selectedProjectId);
    } catch (err: any) {
      setError(err.message || "Failed to generate summary.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (summaryId: string) => {
    if (!confirm("Are you sure you want to delete this saved summary?")) return;
    try {
      await deleteSummary(summaryId);
      setSavedSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      if (activeSummary?.id === summaryId) {
        const remaining = savedSummaries.filter((s) => s.id !== summaryId);
        setActiveSummary(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    }
  };

  const handleOpenPdf = async (paperId: string, pageNum?: number) => {
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

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStatus(label);
    setTimeout(() => setCopiedStatus(null), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!activeSummary) return;
    const blob = new Blob([activeSummary.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeSummary.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedPaper = papers.find((p) => p.id === selectedPaperId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-veritas-neutral-light p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-veritas-dark font-serif flex items-center gap-2">
              <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              Evidence-Grounded Research Summaries
            </h1>
            <p className="text-sm text-veritas-neutral-dark mt-1">
              Produce faithful summaries with claim-level provenance, distinguishing explicit facts from cautious inferences.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {activeSummary && (
              <>
                <button
                  onClick={() => handleCopyText(activeSummary.content, "md")}
                  className="px-3 py-2 text-xs font-medium text-veritas-neutral-dark bg-white border border-veritas-neutral-light rounded-lg hover:bg-slate-50 transition flex items-center gap-1.5"
                  title="Copy formatted markdown to clipboard"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copiedStatus === "md" ? "Copied!" : "Copy Markdown"}</span>
                </button>

                <button
                  onClick={handleDownloadMarkdown}
                  className="px-3 py-2 text-xs font-medium text-veritas-neutral-dark bg-white border border-veritas-neutral-light rounded-lg hover:bg-slate-50 transition flex items-center gap-1.5"
                  title="Export summary as .md file"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Export</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Generator Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-veritas-neutral-light/60">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-veritas-neutral-dark mb-1.5">
              Workspace Project
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                const p = projects.find((x) => x.id === e.target.value);
                if (p && onSelectProject) onSelectProject(p);
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-veritas-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-veritas-primary/30"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} ({proj.paper_count} papers)
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-veritas-neutral-dark mb-1.5">
              Target Paper
            </label>
            <select
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value)}
              disabled={papers.length === 0}
              className="w-full px-3 py-2 text-sm bg-white border border-veritas-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-veritas-primary/30 disabled:bg-slate-50"
            >
              {papers.length === 0 ? (
                <option value="">No papers in this project</option>
              ) : (
                papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.publication_year || "n.d."})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-veritas-neutral-dark mb-1.5">
              Summary Format
            </label>
            <div className="flex gap-2">
              <select
                value={summaryType}
                onChange={(e) => setSummaryType(e.target.value as SummaryType)}
                className="w-full px-3 py-2 text-sm bg-white border border-veritas-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-veritas-primary/30"
              >
                <option value="detailed">Detailed Analysis</option>
                <option value="short">Short Overview</option>
                <option value="structured_academic">Structured Academic</option>
              </select>

              <button
                onClick={handleGenerate}
                disabled={generating || !selectedPaperId}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#126BEB] hover:bg-blue-600 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {generating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white font-semibold leading-none">Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-white font-semibold leading-none">Generate</span>
                  </>
                )}
              </button>
            </div>
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

      {/* Main Content Layout: History Sidebar + Active Summary Display */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Saved Summaries List */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-veritas-neutral-light/60 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-veritas-dark flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Saved Summaries
            </h3>
            <span className="text-[11px] font-mono text-veritas-neutral-dark font-medium">
              {savedSummaries.length}
            </span>
          </div>

          {loadingHistory && (
            <div className="p-4 text-center">
              <div className="w-5 h-5 border-2 border-veritas-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-[11px] text-veritas-neutral-dark">Loading history...</p>
            </div>
          )}

          {!loadingHistory && savedSummaries.length === 0 && (
            <div className="p-4 text-center text-xs text-veritas-neutral-dark italic">
              No saved summaries yet. Select a paper and click "Generate".
            </div>
          )}

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {savedSummaries.map((s) => {
              const isSelected = activeSummary?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSummary(s)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition relative group ${
                    isSelected
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isSelected ? "bg-white/20 text-white" : "bg-white text-slate-700 border border-slate-200"
                    }`}>
                      {s.summary_type.replace("_", " ")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition p-0.5"
                      title="Delete summary"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-xs font-semibold line-clamp-2 leading-snug">
                    {s.title}
                  </p>

                  <div className="flex items-center justify-between text-[10px] mt-2 opacity-80">
                    <span>{(s.faithfulness_rate * 100).toFixed(0)}% Grounded</span>
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Summary Display */}
        <div className="lg:col-span-3 space-y-4">
          {generating && (
            <div className="p-16 text-center bg-white rounded-xl border border-veritas-neutral-light shadow-sm">
              <div className="w-10 h-10 border-4 border-veritas-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <h3 className="text-base font-semibold text-veritas-dark font-serif">
                Synthesizing Evidence-Grounded Summary
              </h3>
              <p className="text-xs text-veritas-neutral-dark mt-1">
                Extracting factual statements and validating exact passage quotations...
              </p>
            </div>
          )}

          {!generating && !activeSummary && (
            <div className="p-16 text-center bg-white rounded-xl border border-dashed border-veritas-neutral-light">
              <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-veritas-dark">No Summary Selected</h3>
              <p className="text-xs text-veritas-neutral-dark mt-1">
                Choose a paper from the dropdown above and click "Generate" to synthesize an academic summary.
              </p>
            </div>
          )}

          {!generating && activeSummary && (
            <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-8 space-y-6">
              {/* Provenance Badge & Summary Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-veritas-neutral-light">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {(activeSummary.faithfulness_rate * 100).toFixed(0)}% Evidence Faithfulness
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700">
                      {activeSummary.verified_statements} of {activeSummary.total_statements} Statements Verified
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 capitalize">
                      {activeSummary.summary_type.replace("_", " ")} Format
                    </span>
                  </div>
                  <h2 className="text-xl font-bold font-serif text-veritas-dark pt-1">
                    {activeSummary.title}
                  </h2>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPdf(activeSummary.paper_id)}
                    disabled={openingPdf}
                    className="px-3 py-1.5 text-xs font-medium text-veritas-neutral-dark bg-white border border-veritas-neutral-light rounded-lg hover:bg-slate-50 transition flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    <span>View PDF</span>
                  </button>
                </div>
              </div>

              {/* Formatted Sections with Interactive Statements */}
              <div className="space-y-6">
                {activeSummary.sections.map((section, secIdx) => (
                  <div key={secIdx} className="space-y-3">
                    <h3 className="text-base font-bold text-veritas-dark font-serif border-l-4 border-veritas-primary pl-3">
                      {section.heading}
                    </h3>

                    {/* Section Statements with Click-to-Inspect */}
                    <div className="space-y-2.5 text-sm leading-relaxed text-slate-800">
                      {section.statements.length > 0 ? (
                        section.statements.map((stmt, stmtIdx) => (
                          <div
                            key={stmt.id || stmtIdx}
                            onClick={() => setActiveStatement(stmt)}
                            className="p-3 rounded-lg border border-transparent hover:border-veritas-primary/30 hover:bg-slate-50/80 transition cursor-pointer group flex items-start justify-between gap-3"
                          >
                            <p className="text-sm text-slate-900 group-hover:text-veritas-dark">
                              {stmt.statement_text}
                            </p>

                            <div className="shrink-0 flex items-center gap-1 pt-0.5">
                              {stmt.page_number && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-veritas-primary/10 text-veritas-primary group-hover:bg-veritas-primary group-hover:text-white transition">
                                  <span>p.{stmt.page_number}</span>
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                stmt.relationship === "direct_support"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {stmt.relationship === "direct_support" ? "Verified" : "Inference"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-800 whitespace-pre-line pl-3">
                          {section.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Statement Provenance Modal / Inspector */}
      {activeStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-veritas-neutral-light overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-sm font-bold font-mono">Statement-Level Evidence Provenance</h3>
                  <p className="text-[11px] text-slate-300">Ground-truth excerpt verified in source academic PDF</p>
                </div>
              </div>
              <button
                onClick={() => setActiveStatement(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Summary Statement */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Synthesized Statement in Summary
                </span>
                <p className="text-sm text-slate-900 font-medium">
                  {activeStatement.statement_text}
                </p>
              </div>

              {/* Supporting Verbatim Quote */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
                  Supporting Verbatim Quotation
                </span>
                <p className="text-sm font-serif italic text-amber-950 leading-relaxed">
                  "{activeStatement.exact_quote || "No explicit quotation provided."}"
                </p>
              </div>

              {/* Provenance Metadata Grid */}
              <div className="grid grid-cols-3 gap-3 text-slate-700">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">PDF Page</span>
                  <span className="font-bold text-sm text-slate-900">
                    Page {activeStatement.page_number || "n/a"}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">Epistemic Link</span>
                  <span className={`font-bold text-xs uppercase block pt-0.5 ${
                    activeStatement.relationship === "direct_support" ? "text-emerald-700" : "text-amber-700"
                  }`}>
                    {activeStatement.relationship.replace("_", " ")}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">Faithfulness</span>
                  <span className="font-bold text-sm text-emerald-700">
                    {(activeStatement.match_score * 100).toFixed(0)}% Match
                  </span>
                </div>
              </div>

              {/* Deterministic Passage UUID */}
              {activeStatement.supporting_passage_id && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                      Source Passage UUID
                    </span>
                    <button
                      onClick={() => handleCopyText(activeStatement.supporting_passage_id!, "uuid")}
                      className="text-[11px] font-semibold text-veritas-primary hover:underline"
                    >
                      {copiedStatus === "uuid" ? "Copied!" : "Copy UUID"}
                    </button>
                  </div>
                  <code className="text-[11px] font-mono text-slate-800 break-all select-all">
                    {activeStatement.supporting_passage_id}
                  </code>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-veritas-neutral-light flex items-center justify-between">
              <button
                onClick={() => handleCopyText(activeStatement.statement_text, "stmt")}
                className="text-xs font-semibold text-veritas-dark hover:text-veritas-primary transition"
              >
                {copiedStatus === "stmt" ? "Statement Copied!" : "Copy Statement"}
              </button>

              <div className="flex items-center gap-2">
                {activeSummary && (
                  <button
                    onClick={() => handleOpenPdf(activeSummary.paper_id, activeStatement.page_number || undefined)}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-veritas-neutral-light text-veritas-dark rounded-lg hover:bg-slate-100 transition"
                  >
                    Open PDF to Page {activeStatement.page_number || 1}
                  </button>
                )}
                <button
                  onClick={() => setActiveStatement(null)}
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

