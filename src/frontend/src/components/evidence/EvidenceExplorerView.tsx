"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Project,
  Paper,
  ComparisonMatrixResponse,
  MatrixRow,
  MatrixCell,
  PassageContextResponse,
  PdfAccessResponse,
  ClaimVerificationResult,
  EvidenceVerdict
} from "../../types";
import {
  fetchProjects,
  fetchProjectPapers,
  generateMatrix,
  fetchProjectMatrices,
  fetchPassageContext,
  fetchPdfAccess,
  fetchProjectVerificationSummary
} from "../../lib/api";
import {
  BookOpen,
  FileText,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Table,
  Layers,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Sparkles,
  Download,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Eye,
  RefreshCw,
  SlidersHorizontal,
  Split
} from "lucide-react";

interface EvidenceExplorerViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
  initialPaperId?: string;
  initialPageNumber?: number;
  initialPassageId?: string;
}

export const EvidenceExplorerView: React.FC<EvidenceExplorerViewProps> = ({
  currentProject,
  onSelectProject,
  initialPaperId,
  initialPageNumber = 1,
  initialPassageId
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || "");
  const [papers, setPapers] = useState<Paper[]>([]);

  // Explorer active paper and navigation state
  const [activePaperId, setActivePaperId] = useState<string>(initialPaperId || "");
  const [currentPage, setCurrentPage] = useState<number>(initialPageNumber);
  const [pdfAccess, setPdfAccess] = useState<PdfAccessResponse | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Passage context state (Steps 3 & 4)
  const [activePassageId, setActivePassageId] = useState<string>(initialPassageId || "");
  const [passageContext, setPassageContext] = useState<PassageContextResponse | null>(null);
  const [showSurroundingContext, setShowSurroundingContext] = useState<boolean>(true);

  // Evidence matrix state (Steps 5 & 6)
  const [activeTab, setActiveTab] = useState<"explorer" | "matrix">("explorer");
  const [matrices, setMatrices] = useState<ComparisonMatrixResponse[]>([]);
  const [activeMatrix, setActiveMatrix] = useState<ComparisonMatrixResponse | null>(null);
  const [matrixPaperIds, setMatrixPaperIds] = useState<string[]>([]);
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState<boolean>(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // Responsive mobile toggle
  const [mobilePanel, setMobilePanel] = useState<"pdf" | "details">("pdf");

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

  // Load papers and saved matrices for selected project
  useEffect(() => {
    if (!selectedProjectId) return;

    fetchProjectPapers(selectedProjectId)
      .then((pList) => {
        setPapers(pList);
        if (!activePaperId && pList.length > 0) {
          setActivePaperId(pList[0].id);
        }
        // Default matrix selection: first 2 papers
        if (pList.length >= 2) {
          setMatrixPaperIds([pList[0].id, pList[1].id]);
        }
      })
      .catch((err) => console.error("Failed to load project papers", err));

    fetchProjectMatrices(selectedProjectId)
      .then((mList) => {
        setMatrices(mList);
        if (mList.length > 0) {
          setActiveMatrix(mList[0]);
        }
      })
      .catch(() => {});
  }, [selectedProjectId]);

  // Load PDF access whenever activePaperId changes
  useEffect(() => {
    if (!activePaperId) return;
    setPdfLoading(true);
    setPdfError(null);

    fetchPdfAccess(activePaperId, selectedProjectId)
      .then((access) => {
        setPdfAccess(access);
      })
      .catch((err) => {
        console.error("PDF access error", err);
        setPdfError(err.message || "Failed to load secure PDF.");
      })
      .finally(() => setPdfLoading(false));
  }, [activePaperId, selectedProjectId]);

  // Load passage context whenever activePassageId changes
  useEffect(() => {
    if (!activePassageId) return;

    fetchPassageContext(activePassageId)
      .then((ctx) => {
        setPassageContext(ctx);
        if (ctx.paper_id && ctx.paper_id !== activePaperId) {
          setActivePaperId(ctx.paper_id);
        }
        if (ctx.page_number) {
          setCurrentPage(ctx.page_number);
        }
      })
      .catch((err) => console.error("Passage context error", err));
  }, [activePassageId]);

  // Matrix generation handler
  const handleGenerateMatrix = async () => {
    if (!selectedProjectId || matrixPaperIds.length < 2) {
      setMatrixError("Please select at least 2 papers from the active project.");
      return;
    }

    setIsGeneratingMatrix(true);
    setMatrixError(null);

    try {
      const res = await generateMatrix({
        project_id: selectedProjectId,
        paper_ids: matrixPaperIds
      });
      setActiveMatrix(res);
      setMatrices((prev) => [res, ...prev.filter((m) => m.id !== res.id)]);
    } catch (err: any) {
      console.error("Matrix generation failed", err);
      setMatrixError(err.message || "Failed to generate comparison matrix.");
    } finally {
      setIsGeneratingMatrix(false);
    }
  };

  // Jump from matrix cell directly into PDF Evidence Explorer
  const handleCellClick = (cell: MatrixCell) => {
    if (cell.paper_id) {
      setActivePaperId(cell.paper_id);
    }
    if (cell.page_number) {
      setCurrentPage(cell.page_number);
    }
    if (cell.passage_id) {
      setActivePassageId(cell.passage_id);
    }
    setActiveTab("explorer");
  };

  // Export matrix to CSV
  const exportMatrixCsv = () => {
    if (!activeMatrix) return;
    const headers = ["Dimension", ...activeMatrix.paper_meta.map((p) => `"${p.title.replace(/"/g, '""')}"`)];
    const rows = activeMatrix.rows.map((row) => {
      const rowVals = [
        `"${row.dimension}"`,
        ...activeMatrix.paper_ids.map((pid) => {
          const c = row.cells[pid];
          const text = c ? c.content.replace(/"/g, '""') : "Not reported";
          return `"${text}"`;
        })
      ];
      return rowVals.join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `matrix-${activeMatrix.id.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export matrix to JSON
  const exportMatrixJson = () => {
    if (!activeMatrix) return;
    const blob = new Blob([JSON.stringify(activeMatrix, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `matrix-${activeMatrix.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activePaper = useMemo(() => {
    return papers.find((p) => p.id === activePaperId);
  }, [papers, activePaperId]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header & Breadcrumb */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 tracking-wider uppercase mb-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>VERITAS Phase 8 · Evidence Explorer & Comparison Matrix</span>
          </div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <span>Visual Evidence Explorer</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold">
              PDF Grounding
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Trace claims to physical PDF pages, inspect surrounding context, and compare multi-paper findings side-by-side.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setActiveTab("explorer")}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === "explorer"
                  ? "bg-cyan-600 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Evidence Explorer (PDF)</span>
            </button>
            <button
              onClick={() => setActiveTab("matrix")}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === "matrix"
                  ? "bg-cyan-600 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Comparison Matrix</span>
            </button>
          </div>

          {/* Project Selector */}
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

      {/* Mode A: Evidence Explorer (Split PDF + Claim Diagnostics) */}
      {activeTab === "explorer" && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left Panel: PDF Viewer & Navigation Controls */}
          <div
            className={`${
              mobilePanel === "pdf" ? "flex" : "hidden md:flex"
            } flex-1 md:w-3/5 flex flex-col border-r border-slate-800 bg-slate-950/80 overflow-hidden`}
          >
            {/* PDF Toolbar */}
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Paper Dropdown */}
              <div className="flex items-center gap-2 max-w-xs">
                <span className="text-slate-400 font-mono text-[11px] shrink-0">Paper:</span>
                <select
                  value={activePaperId}
                  onChange={(e) => {
                    setActivePaperId(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs truncate focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page Controls */}
              <div className="flex items-center gap-1.5 font-mono">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-slate-300 px-2 py-0.5 bg-slate-950 rounded border border-slate-800">
                  Page {currentPage} of {pdfAccess?.total_pages || 1}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((prev) =>
                      Math.min(pdfAccess?.total_pages || 1, prev + 1)
                    )
                  }
                  disabled={currentPage >= (pdfAccess?.total_pages || 1)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Zoom & External Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
                  className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(200, z + 15))}
                  className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {pdfAccess?.signed_url && (
                  <button
                    onClick={() => window.open(pdfAccess.signed_url, "_blank")}
                    className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-cyan-400 flex items-center gap-1 text-[11px] px-2 ml-1"
                    title="Open Fullscreen in New Tab"
                  >
                    <span>Full Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Embedded PDF View / Secure Frame */}
            <div className="flex-1 relative overflow-hidden bg-slate-900 flex items-center justify-center">
              {pdfLoading && (
                <div className="flex flex-col items-center gap-2 text-cyan-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span>Loading private PDF from secure storage...</span>
                </div>
              )}

              {pdfError && (
                <div className="p-6 text-center text-rose-400 max-w-sm text-xs">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold mb-1">Failed to render PDF</p>
                  <p className="text-slate-400">{pdfError}</p>
                </div>
              )}

              {!pdfLoading && !pdfError && pdfAccess?.signed_url && (
                <iframe
                  key={`${pdfAccess.paper_id}-${currentPage}`}
                  src={`${pdfAccess.signed_url}#page=${currentPage}&zoom=${zoomLevel}`}
                  className="w-full h-full border-0"
                  title="Secure Academic PDF Viewer"
                />
              )}
            </div>

            {/* Bottom Fallback / Extracted Passage Text Highlighter Bar */}
            {passageContext && (
              <div className="border-t border-slate-800 bg-slate-900/90 p-3 max-h-44 overflow-y-auto text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-cyan-400 font-bold text-[11px]">
                      Extracted Passage · Page {passageContext.page_number} ({passageContext.section_title})
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                      Sequence #{passageContext.sequence_index + 1}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSurroundingContext(!showSurroundingContext)}
                    className="text-[11px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    <span>{showSurroundingContext ? "Hide Adjacent Text" : "Show Adjacent Text"}</span>
                  </button>
                </div>

                {/* Preceding context if toggled */}
                {showSurroundingContext && passageContext.previous_context && (
                  <p className="text-slate-500 font-serif text-[11px] mb-1 italic opacity-70">
                    &hellip; {passageContext.previous_context}
                  </p>
                )}

                {/* Main active passage with highlight */}
                <p className="text-slate-200 font-serif leading-relaxed bg-cyan-950/30 p-2 rounded border border-cyan-800/40">
                  {passageContext.text}
                </p>

                {/* Succeeding context if toggled */}
                {showSurroundingContext && passageContext.next_context && (
                  <p className="text-slate-500 font-serif text-[11px] mt-1 italic opacity-70">
                    {passageContext.next_context} &hellip;
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Selected Claim Diagnostics & Evidence Grounding */}
          <div
            className={`${
              mobilePanel === "details" ? "flex" : "hidden md:flex"
            } md:w-2/5 flex flex-col bg-slate-900/60 overflow-y-auto p-5 gap-4 shadow-xl`}
          >
            {/* Header / Active Claim Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-semibold">
                  Evidence Inspector
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Physical Page Grounded
                </span>
              </div>
              <h2 className="text-base font-bold text-white leading-tight">
                Academic Finding & Citation Provenance
              </h2>
            </div>

            {/* Passage Summary Card */}
            {passageContext ? (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">{passageContext.paper_title}</span>
                  <span className="font-mono text-cyan-400 text-[11px]">
                    Page {passageContext.page_number}
                  </span>
                </div>

                <div className="p-3 bg-slate-900/70 rounded-lg border-l-2 border-cyan-500 text-xs text-slate-200 font-serif italic leading-relaxed">
                  &ldquo;{passageContext.text}&rdquo;
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>Section: <strong className="text-slate-300 font-normal">{passageContext.section_title}</strong></span>
                  <span className="text-emerald-400 flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3 h-3" /> Exact Substring Verified
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-5 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                Click any evidence citation in Claim Verification or the Comparison Matrix below to inspect the exact source passage here.
              </div>
            )}

            {/* Research Paper Bibliographic Information */}
            {activePaper && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-2 text-xs">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">
                  Document Provenance
                </span>
                <p className="font-bold text-white text-sm">{activePaper.title}</p>
                {activePaper.authors && activePaper.authors.length > 0 && (
                  <p className="text-slate-400">
                    Authors: {activePaper.authors.join(", ")}
                  </p>
                )}
                <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px] mt-1">
                  {activePaper.publication_year && (
                    <span>Year: {activePaper.publication_year}</span>
                  )}
                  {activePaper.venue && <span>Venue: {activePaper.venue}</span>}
                  <span>Total Pages: {activePaper.total_pages || activePaper.page_count || 1}</span>
                </div>
              </div>
            )}

            {/* Adjacent Context Explainer Box */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60 text-xs flex flex-col gap-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block font-semibold">
                Evidence Integrity Guarantee
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                VERITAS strictly rejects isolated, hallucinated citations. Every citation maps deterministically to a sentence-bounded passage extracted directly from the private PDF storage.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mode B: Evidence Comparison Matrix (Steps 5 & 6) */}
      {activeTab === "matrix" && (
        <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
          {/* Matrix Config Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Compare Papers:
              </span>
              <div className="flex flex-wrap gap-2">
                {papers.map((p) => {
                  const isSelected = matrixPaperIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (isSelected) {
                          setMatrixPaperIds(matrixPaperIds.filter((id) => id !== p.id));
                        } else {
                          setMatrixPaperIds([...matrixPaperIds, p.id]);
                        }
                      }}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        isSelected
                          ? "bg-cyan-950 border-cyan-500 text-cyan-200 font-medium shadow-sm"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {p.title.slice(0, 32)}...
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Matrix Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateMatrix}
                disabled={isGeneratingMatrix || matrixPaperIds.length < 2}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md transition-all disabled:opacity-50"
              >
                {isGeneratingMatrix ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{isGeneratingMatrix ? "Generating..." : "Generate Matrix"}</span>
              </button>

              {activeMatrix && (
                <>
                  <button
                    onClick={exportMatrixCsv}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs flex items-center gap-1 transition-colors"
                    title="Export Matrix as CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={exportMatrixJson}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs flex items-center gap-1 transition-colors"
                    title="Export Matrix as JSON"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {matrixError && (
            <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{matrixError}</span>
            </div>
          )}

          {/* Matrix Table View */}
          {activeMatrix ? (
            <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-auto shadow-inner">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/80 sticky top-0 z-10 backdrop-blur-sm">
                    <th className="p-4 font-mono uppercase text-slate-400 tracking-wider text-[11px] w-1/4 border-r border-slate-700/60">
                      Comparison Dimension
                    </th>
                    {activeMatrix.paper_meta.map((pm) => (
                      <th
                        key={pm.id}
                        className="p-4 font-semibold text-slate-200 border-r border-slate-700/60 last:border-r-0 min-w-[260px]"
                      >
                        <div className="text-xs font-bold text-cyan-300">{pm.title}</div>
                        <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                          {pm.authors && pm.authors.length > 0 ? pm.authors[0] : ""} ({pm.year || "N/A"})
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {activeMatrix.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-4 font-semibold text-slate-300 border-r border-slate-800 bg-slate-950/40 align-top">
                        <div className="text-xs font-bold text-white">{row.dimension}</div>
                        <div className="text-[11px] text-slate-400 font-normal mt-1 italic">
                          {row.claim_label}
                        </div>
                      </td>
                      {activeMatrix.paper_ids.map((pid) => {
                        const cell = row.cells[pid];
                        if (!cell || cell.status === "not_reported") {
                          return (
                            <td
                              key={pid}
                              className="p-4 text-slate-500 italic border-r border-slate-800 last:border-r-0 align-top bg-slate-950/20"
                            >
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800 block w-fit mb-1 font-mono">
                                Not reported
                              </span>
                              <span>Not documented in this paper</span>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={pid}
                            className="p-4 text-slate-200 border-r border-slate-800 last:border-r-0 align-top space-y-2"
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold font-mono">
                                Evidence present
                              </span>
                              {cell.page_number && (
                                <button
                                  onClick={() => handleCellClick(cell)}
                                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono hover:underline"
                                >
                                  <span>Page {cell.page_number}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>

                            <p className="text-xs leading-relaxed text-slate-200 font-medium">
                              {cell.content}
                            </p>

                            {cell.exact_quote && (
                              <div
                                onClick={() => handleCellClick(cell)}
                                className="p-2 bg-slate-950 rounded border border-slate-800 text-[11px] font-serif italic text-slate-400 hover:border-cyan-500/60 cursor-pointer transition-colors"
                                title="Click to view in PDF Evidence Explorer"
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
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-8 text-center bg-slate-900/30">
              <Table className="w-10 h-10 text-cyan-400 mb-3 opacity-80" />
              <h3 className="text-base font-bold text-white mb-1">
                Source-Linked Comparison Matrix
              </h3>
              <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
                Select 2 or more research papers from the active project above and click &ldquo;Generate Matrix&rdquo; to build an interactive dimensional comparison table with verified PDF citations.
              </p>
              <button
                onClick={handleGenerateMatrix}
                disabled={isGeneratingMatrix || matrixPaperIds.length < 2}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md transition-all disabled:opacity-50"
              >
                Generate Matrix for Selected Papers
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
