"use client";

import React, { useState, useEffect } from "react";
import {
  Project,
  Paper,
  PaperIntelligence,
  EvidenceReference
} from "../../types";
import {
  fetchProjects,
  fetchProjectPapers,
  fetchPaperIntelligence,
  generatePaperIntelligence,
  fetchSignedUrl
} from "../../lib/api";

interface PaperIntelligenceViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export const PaperIntelligenceView: React.FC<PaperIntelligenceViewProps> = ({
  currentProject,
  onSelectProject
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || "");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string>("");
  const [intelligence, setIntelligence] = useState<PaperIntelligence | null>(null);

  const [loadingPapers, setLoadingPapers] = useState<boolean>(false);
  const [loadingIntel, setLoadingIntel] = useState<boolean>(false);
  const [extracting, setExtracting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence citation inspector modal
  const [activeCitation, setActiveCitation] = useState<EvidenceReference | null>(null);
  const [openingPdf, setOpeningPdf] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync selected project
  useEffect(() => {
    if (currentProject?.id) {
      setSelectedProjectId(currentProject.id);
    }
  }, [currentProject]);

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

  // Load papers when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingPapers(true);
    setError(null);
    setIntelligence(null);
    setSelectedPaperId("");

    fetchProjectPapers(selectedProjectId)
      .then((data) => {
        setPapers(data);
        if (data.length > 0) {
          setSelectedPaperId(data[0].id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingPapers(false));
  }, [selectedProjectId]);

  // Load intelligence when paper changes
  useEffect(() => {
    if (!selectedPaperId) return;
    loadIntelligence(selectedPaperId, false);
  }, [selectedPaperId]);

  const loadIntelligence = async (paperId: string, forceRegen: boolean = false) => {
    setLoadingIntel(!forceRegen);
    if (forceRegen) setExtracting(true);
    setError(null);

    try {
      const data = forceRegen
        ? await generatePaperIntelligence(paperId, true)
        : await fetchPaperIntelligence(paperId);
      setIntelligence(data);
    } catch (err: any) {
      setError(err.message || "Failed to load paper intelligence.");
      setIntelligence(null);
    } finally {
      setLoadingIntel(false);
      setExtracting(false);
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

  const selectedPaper = papers.find((p) => p.id === selectedPaperId);

  // Render citation pill helper
  const renderCitationPill = (ref?: EvidenceReference) => {
    if (!ref) return null;
    return (
      <button
        onClick={() => setActiveCitation(ref)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 ml-1.5 text-xs font-mono font-medium rounded bg-veritas-primary/10 text-veritas-primary hover:bg-veritas-primary/20 hover:text-veritas-dark transition border border-veritas-primary/20"
        title="Inspect verified source evidence"
      >
        <svg className="w-3 h-3 text-veritas-primary" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
        </svg>
        <span>p.{ref.page_number}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Selectors */}
      <div className="bg-white rounded-xl shadow-sm border border-veritas-neutral-light p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-veritas-dark font-serif flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </span>
              Paper Intelligence Profile
            </h1>
            <p className="text-sm text-veritas-neutral-dark mt-1">
              Structured research extraction grounded with verifiable passage-level quotations.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {selectedPaperId && (
              <>
                <button
                  onClick={() => handleOpenPdf(selectedPaperId)}
                  disabled={openingPdf}
                  className="px-3.5 py-2 text-xs font-medium text-veritas-neutral-dark bg-white border border-veritas-neutral-light rounded-lg hover:bg-slate-50 transition flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  {openingPdf ? "Opening..." : "View Original PDF"}
                </button>

                <button
                  onClick={() => loadIntelligence(selectedPaperId, true)}
                  disabled={extracting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-veritas-primary hover:bg-veritas-primary-hover rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {extracting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Extracting Intelligence...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Re-extract Intelligence</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Project & Paper Pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-veritas-neutral-light/60">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-veritas-neutral-dark mb-1.5">
              Research Project
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

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-veritas-neutral-dark mb-1.5">
              Target Paper
            </label>
            <select
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value)}
              disabled={loadingPapers || papers.length === 0}
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
          {selectedPaperId && (
            <button
              onClick={() => loadIntelligence(selectedPaperId, true)}
              className="px-3 py-1 bg-white border border-rose-300 text-xs font-semibold text-rose-700 rounded-lg hover:bg-rose-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {loadingIntel && (
        <div className="p-12 text-center bg-white rounded-xl border border-veritas-neutral-light shadow-sm">
          <div className="w-10 h-10 border-4 border-veritas-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-base font-semibold text-veritas-dark">Synthesizing Research Dimensions</h3>
          <p className="text-xs text-veritas-neutral-dark mt-1">
            Analyzing objectives, methodology, metrics, and ground-truth citations...
          </p>
        </div>
      )}

      {/* Empty paper state */}
      {!loadingIntel && !intelligence && !error && papers.length === 0 && (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-veritas-neutral-light">
          <p className="text-sm text-veritas-neutral-dark">No academic papers found in this project.</p>
          <p className="text-xs text-veritas-neutral-dark mt-1">Upload papers in the "Upload Papers" tab to begin extraction.</p>
        </div>
      )}

      {/* Intelligence Content */}
      {!loadingIntel && intelligence && (
        <div className="space-y-6">
          {/* Metadata & Verification Provenance Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-veritas-dark text-white rounded-xl p-6 shadow-sm border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-2 max-w-3xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {(intelligence.verification_summary.faithfulness_rate * 100).toFixed(0)}% Evidence Grounded
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-slate-300">
                    {intelligence.verification_summary.total_verified} Citations Verified
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-slate-300">
                    v{intelligence.extraction_version} · {intelligence.model_name}
                  </span>
                </div>

                <h2 className="text-xl font-bold font-serif leading-snug">
                  {selectedPaper?.title}
                </h2>
                <p className="text-xs text-slate-300">
                  {selectedPaper?.authors?.join(", ") || "Authors not reported"} ({selectedPaper?.publication_year || "n.d."}) · {intelligence.additional_context.domain}
                </p>
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1.5 max-w-sm justify-start md:justify-end">
                {intelligence.additional_context.keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white/10 text-slate-200 rounded text-xs font-medium border border-white/10">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Grid Layout of Research Dimensions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Research Objective */}
            <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-veritas-neutral-light/60 pb-3">
                <span className="p-1.5 rounded-md bg-blue-50 text-blue-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-veritas-dark font-serif">1. Research Objective</h3>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-semibold text-xs uppercase tracking-wider text-veritas-neutral-dark block mb-1">
                    Problem Investigated
                  </span>
                  <p className="text-veritas-dark leading-relaxed">
                    {intelligence.research_objective.problem_statement}
                    {renderCitationPill(intelligence.research_objective.evidence[0])}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-xs uppercase tracking-wider text-veritas-neutral-dark block mb-1">
                    Core Research Question
                  </span>
                  <p className="text-veritas-dark leading-relaxed">
                    {intelligence.research_objective.research_question}
                    {renderCitationPill(intelligence.research_objective.evidence[1])}
                  </p>
                </div>

                {intelligence.research_objective.hypothesis && intelligence.research_objective.hypothesis !== "Not reported" && (
                  <div>
                    <span className="font-semibold text-xs uppercase tracking-wider text-veritas-neutral-dark block mb-1">
                      Hypothesis Tested
                    </span>
                    <p className="text-veritas-dark leading-relaxed italic">
                      "{intelligence.research_objective.hypothesis}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Methodology & Architecture */}
            <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-veritas-neutral-light/60 pb-3">
                <span className="p-1.5 rounded-md bg-purple-50 text-purple-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-veritas-dark font-serif">2. Methodology & Design</h3>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-semibold text-xs uppercase tracking-wider text-veritas-neutral-dark block mb-1">
                    Design & Approach
                  </span>
                  <p className="text-veritas-dark">
                    {intelligence.methodology.research_design} · {intelligence.methodology.experimental_approach}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-xs uppercase tracking-wider text-veritas-neutral-dark block mb-1">
                    Models & Techniques Used
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {intelligence.methodology.models_and_techniques.map((m, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-xs uppercase tracking-wider text-veritas-neutral-dark block mb-1">
                    Baselines & Procedural Details
                  </span>
                  <p className="text-veritas-dark text-xs leading-relaxed">
                    {intelligence.methodology.procedural_details}
                    {renderCitationPill(intelligence.methodology.evidence[0])}
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Dataset & Empirical Sample */}
            <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-veritas-neutral-light/60 pb-3">
                <span className="p-1.5 rounded-md bg-emerald-50 text-emerald-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-veritas-dark font-serif">3. Dataset & Sample</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-veritas-neutral-dark block mb-0.5 font-medium">Dataset Name</span>
                  <span className="font-bold text-slate-900 block truncate" title={intelligence.dataset_information.dataset_name}>
                    {intelligence.dataset_information.dataset_name}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-veritas-neutral-dark block mb-0.5 font-medium">Source / Origin</span>
                  <span className="font-bold text-slate-900 block">
                    {intelligence.dataset_information.dataset_source || "Not reported"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-veritas-neutral-dark block mb-0.5 font-medium">Sample Size</span>
                  <span className="font-bold text-slate-900 block">
                    {intelligence.dataset_information.sample_size || "Not reported"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-veritas-neutral-dark block mb-0.5 font-medium">Split Condition</span>
                  <span className="font-bold text-slate-900 block">
                    {intelligence.dataset_information.train_val_test_split || "Not reported"}
                  </span>
                </div>
              </div>

              {intelligence.dataset_information.evidence.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs text-veritas-neutral-dark">Evidence citation:</span>
                  {renderCitationPill(intelligence.dataset_information.evidence[0])}
                </div>
              )}
            </div>

            {/* 4. Limitations & Future Work */}
            <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-veritas-neutral-light/60 pb-3">
                <span className="p-1.5 rounded-md bg-amber-50 text-amber-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-veritas-dark font-serif">4. Limitations & Boundaries</h3>
              </div>

              <div className="space-y-2 text-xs">
                {intelligence.limitations.author_reported_limitations.map((lim, i) => (
                  <div key={i} className="p-2.5 rounded bg-amber-50/50 border border-amber-200/50 text-amber-900">
                    <span className="font-semibold block mb-0.5 text-amber-950">Author-Reported Limitation:</span>
                    <span>{lim}</span>
                    {renderCitationPill(intelligence.limitations.evidence[i])}
                  </div>
                ))}
                {intelligence.limitations.future_work.length > 0 && (
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-800">
                    <span className="font-semibold block mb-0.5 text-slate-900">Future Work:</span>
                    <span>{intelligence.limitations.future_work.join("; ")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. Evaluation Metrics Table */}
          <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-veritas-neutral-light/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-teal-50 text-teal-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-veritas-dark font-serif">5. Quantitative Evaluation Metrics</h3>
              </div>
              <span className="text-xs text-veritas-neutral-dark font-medium">
                {intelligence.metrics.length} Reported Value{intelligence.metrics.length !== 1 ? "s" : ""}
              </span>
            </div>

            {intelligence.metrics.length === 0 ? (
              <p className="text-xs text-veritas-neutral-dark italic py-2">
                No quantitative evaluation metrics reported in extracted paper sections.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-veritas-neutral-light text-veritas-neutral-dark font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Metric Name</th>
                      <th className="py-2.5 px-3">Reported Value</th>
                      <th className="py-2.5 px-3">Baseline Comparison</th>
                      <th className="py-2.5 px-3">Experimental Condition</th>
                      <th className="py-2.5 px-3 text-right">Evidence Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-veritas-neutral-light/50">
                    {intelligence.metrics.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-semibold text-veritas-dark">{m.metric_name}</td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                          {m.reported_value} {m.unit || ""}
                        </td>
                        <td className="py-3 px-3 text-veritas-neutral-dark">{m.baseline_comparison || "Not reported"}</td>
                        <td className="py-3 px-3 text-veritas-neutral-dark max-w-xs truncate" title={m.experimental_condition || ""}>
                          {m.experimental_condition || "Standard benchmark"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {renderCitationPill(m.evidence[0])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 6. Key Empirical Findings */}
          <div className="bg-white rounded-xl border border-veritas-neutral-light shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-veritas-neutral-light/60 pb-3">
              <span className="p-1.5 rounded-md bg-rose-50 text-rose-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <h3 className="text-base font-bold text-veritas-dark font-serif">6. Core Research Findings</h3>
            </div>

            <div className="space-y-3">
              {intelligence.key_findings.map((f, idx) => (
                <div key={idx} className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        f.finding_type === "quantitative"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {f.finding_type}
                      </span>
                      {f.answers_research_question && (
                        <span className="text-[10px] text-veritas-neutral-dark font-medium">
                          Directly answers research question
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-veritas-dark font-medium leading-relaxed">
                      {f.finding}
                    </p>
                  </div>
                  <div>
                    {renderCitationPill(f.evidence[0])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Evidence Citation Modal / Drawer */}
      {activeCitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-veritas-neutral-light overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-veritas-primary/30 text-veritas-primary">
                  <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-sm font-bold font-mono">Verified Evidence Citation</h3>
                  <p className="text-[11px] text-slate-300">Exact verbatim match in source document passage</p>
                </div>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Quoted Text */}
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
                  Source Quotation
                </span>
                <p className="text-sm font-serif italic text-amber-950 leading-relaxed">
                  "{activeCitation.supporting_quote}"
                </p>
              </div>

              {/* Provenance Details */}
              <div className="grid grid-cols-2 gap-3 text-slate-700">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">Page in PDF</span>
                  <span className="font-bold text-sm text-slate-900">Page {activeCitation.page_number}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium block">Verification Match</span>
                  <span className="font-bold text-sm text-emerald-700">
                    {(activeCitation.match_score * 100).toFixed(0)}% Exact Substring
                  </span>
                </div>
              </div>

              {/* Deterministic Passage UUID */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    Deterministic Passage UUID
                  </span>
                  <button
                    onClick={() => handleCopy(activeCitation.passage_id, "uuid")}
                    className="text-[11px] font-semibold text-veritas-primary hover:underline"
                  >
                    {copiedId === "uuid" ? "Copied!" : "Copy UUID"}
                  </button>
                </div>
                <code className="text-[11px] font-mono text-slate-800 break-all select-all">
                  {activeCitation.passage_id}
                </code>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-veritas-neutral-light flex items-center justify-between">
              <button
                onClick={() => handleCopy(activeCitation.supporting_quote, "quote")}
                className="text-xs font-semibold text-veritas-dark hover:text-veritas-primary transition"
              >
                {copiedId === "quote" ? "Quotation Copied to Clipboard!" : "Copy Quotation"}
              </button>

              <div className="flex items-center gap-2">
                {selectedPaperId && (
                  <button
                    onClick={() => handleOpenPdf(selectedPaperId)}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-veritas-neutral-light text-veritas-dark rounded-lg hover:bg-slate-100 transition"
                  >
                    Open PDF to Page {activeCitation.page_number}
                  </button>
                )}
                <button
                  onClick={() => setActiveCitation(null)}
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

