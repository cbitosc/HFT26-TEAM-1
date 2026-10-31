"use client";

import React, { useState, useEffect } from "react";
import { Project, ProjectAuditDossier } from "../../types";
import { fetchProjects, fetchProjectAuditDossier, getAuthHeaders, API_BASE_URL } from "../../lib/api";
import {
  DownloadCloud,
  FileText,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Sliders,
  Check,
  Scale,
  Database,
  Layers,
  FileClock,
  Printer,
  ChevronRight,
  FolderKanban
} from "lucide-react";

type ReportCategory = "research" | "verification" | "audit";
type ExportFormat = "pdf" | "csv" | "json";

interface SectionOption {
  id: string;
  label: string;
  description: string;
  defaultIncluded: boolean;
}

const SECTION_OPTIONS: Record<ReportCategory, SectionOption[]> = {
  research: [
    { id: "exec_summary", label: "Executive Summary & Objectives", description: "Central research problems, methodologies & core findings.", defaultIncluded: true },
    { id: "corpus_meta", label: "Corpus Metadata & Paper Profiles", description: "Authors, journals, publication years & methodology paradigms.", defaultIncluded: true },
    { id: "matrix_table", label: "Cross-Paper Comparison Matrix", description: "Structured dimensional comparison across all selected papers.", defaultIncluded: true },
    { id: "gaps", label: "Research Gaps & Frontier Opportunities", description: "Identified blindspots and recommended next methodologies.", defaultIncluded: false }
  ],
  verification: [
    { id: "claims_table", label: "Atomic Claim Verification Table", description: "Individual claims, verified verdicts, and confidence ratings.", defaultIncluded: true },
    { id: "citations", label: "Grounded Source Citations & Quotes", description: "Verbatim quotes and exact PDF page number citations.", defaultIncluded: true },
    { id: "numeric_audit", label: "Numerical Truth & Metric Discrepancies", description: "Deterministic metric checks, baseline comparisons & units.", defaultIncluded: true },
    { id: "overgeneralization", label: "Overgeneralization & Scope Drift Audit", description: "Audits of unhedged claims, non-human trial leaps, and cohort limits.", defaultIncluded: true }
  ],
  audit: [
    { id: "complete_dossier", label: "Complete Scientific Research Dossier", description: "Full consolidated intelligence, summary, claims, and gaps.", defaultIncluded: true },
    { id: "provenance_chain", label: "Cryptographic Provenance Event Chain", description: "Tamper-evident hash ledger of all verification and model calls.", defaultIncluded: true },
    { id: "benchmark_eval", label: "Evaluation Benchmark Performance Metrics", description: "Accuracy, macro F1, confusion matrices, and source link fidelity.", defaultIncluded: true }
  ]
};

interface CentralExportHubViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export function CentralExportHubView({
  currentProject,
  onSelectProject
}: CentralExportHubViewProps) {
  // Step 1: Project Selection
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || "");
  const [dossier, setDossier] = useState<ProjectAuditDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState<boolean>(false);

  // Step 2: Report Category
  const [category, setCategory] = useState<ReportCategory>("research");
  const [specificReport, setSpecificReport] = useState<string>("Executive Research Summary");

  // Step 3: Format
  const [format, setFormat] = useState<ExportFormat>("pdf");

  // Step 4: Included Sections
  const [includedSections, setIncludedSections] = useState<string[]>([
    "exec_summary",
    "corpus_meta",
    "matrix_table"
  ]);

  // Step 5 & 6: Download & Progress
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load projects list
  useEffect(() => {
    fetchProjects()
      .then((projs) => {
        setProjects(projs);
        if (!selectedProjectId && projs.length > 0) {
          setSelectedProjectId(projs[0].id);
        }
      })
      .catch((err) => console.error("Error fetching projects:", err));
  }, []);

  useEffect(() => {
    if (currentProject?.id) {
      setSelectedProjectId(currentProject.id);
    }
  }, [currentProject]);

  // Load audit dossier when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingDossier(true);
    setError(null);
    fetchProjectAuditDossier(selectedProjectId)
      .then((data) => setDossier(data))
      .catch((err) => console.warn("Could not fetch dossier:", err))
      .finally(() => setLoadingDossier(false));
  }, [selectedProjectId]);

  // Update default sections when category changes
  const handleCategoryChange = (newCat: ReportCategory) => {
    setCategory(newCat);
    const defaults = SECTION_OPTIONS[newCat].filter((s) => s.defaultIncluded).map((s) => s.id);
    setIncludedSections(defaults);
    if (newCat === "research") {
      setSpecificReport("Executive Research Summary");
    } else if (newCat === "verification") {
      setSpecificReport("Claim Verification Audit Dossier");
    } else {
      setSpecificReport("Complete Scientific Research Dossier");
    }
  };

  const toggleSection = (id: string) => {
    setIncludedSections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Perform authenticated download
  const handleDownload = async () => {
    if (!selectedProjectId) {
      setError("Please select a research project to export.");
      return;
    }
    setIsDownloading(true);
    setError(null);
    setDownloadSuccess(null);

    try {
      const endpoint = `${API_BASE_URL}/api/projects/${selectedProjectId}/export/${format}`;
      const headers = getAuthHeaders();

      const response = await fetch(endpoint, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Export failed with HTTP status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Extract filename from header or construct default
      const contentDisp = response.headers.get("content-disposition");
      let filename = `veritas_${category}_report_${selectedProjectId.slice(0, 8)}.${format}`;
      if (contentDisp && contentDisp.includes("filename=")) {
        const match = contentDisp.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setDownloadSuccess(`Successfully compiled and downloaded "${filename}".`);
    } catch (err: any) {
      setError(err.message || "Failed to download export file.");
    } finally {
      setIsDownloading(false);
    }
  };

  const activeProjectObj = projects.find((p) => p.id === selectedProjectId);

  // Estimates
  const estimatedPages = format === "pdf" ? Math.max(2, includedSections.length * 2 + (dossier?.statistics.total_claims || 4) / 4) : 1;
  const estimatedSize = format === "pdf" ? `${Math.round(estimatedPages * 45 + 120)} KB` : format === "csv" ? "14 KB" : "85 KB";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-serif">
                  Export & Research Reports
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Publication Ready
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized reporting hub. Generate peer-review dossiers, verification spreadsheets, and machine-readable provenance archives.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Success Banner */}
      {downloadSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccess}</span>
          </div>
          <button onClick={() => setDownloadSuccess(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 6-Step Workflow Configuration */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Project Scope */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-200">
                1
              </span>
              <h2 className="text-sm font-bold text-slate-900">Select Research Project</h2>
            </div>
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                const p = projects.find((x) => x.id === e.target.value);
                if (p && onSelectProject) onSelectProject(p);
              }}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.paper_count} papers indexed)
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Report Category */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-200">
                2
              </span>
              <h2 className="text-sm font-bold text-slate-900">Select Report Category</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "research", title: "Research Reports", desc: "Summaries, synthesis & matrix", icon: FileText },
                { id: "verification", title: "Verification Reports", desc: "Atomic claims & discrepancies", icon: ShieldCheck },
                { id: "audit", title: "Audit Reports", desc: "Full dossier & provenance chain", icon: FileClock }
              ].map((c) => {
                const Icon = c.icon;
                const isSelected = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCategoryChange(c.id as ReportCategory)}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/10 text-slate-900 shadow-xs"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-600"
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                    <div>
                      <div className="text-xs font-bold">{c.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{c.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Format Selection */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-200">
                3
              </span>
              <h2 className="text-sm font-bold text-slate-900">Choose Export Format</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: "pdf",
                  title: "Publication PDF",
                  desc: "Peer-review formatted, charts, source badges",
                  icon: FileText,
                  badge: "A4 Formatted"
                },
                {
                  id: "csv",
                  title: "Tabular CSV",
                  desc: "Claims, verdicts, confidence & page refs",
                  icon: FileSpreadsheet,
                  badge: "Excel / R Ready"
                },
                {
                  id: "json",
                  title: "Structured JSON",
                  desc: "Complete metadata & cryptographic chain",
                  icon: FileCode,
                  badge: "API Standard"
                }
              ].map((fmt) => {
                const Icon = fmt.icon;
                const isSelected = format === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setFormat(fmt.id as ExportFormat)}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/10 text-slate-900 shadow-xs"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100/70 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`w-5 h-5 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 font-semibold">
                        {fmt.badge}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold">{fmt.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{fmt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 4: Section Inclusion Toggles */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-200">
                  4
                </span>
                <h2 className="text-sm font-bold text-slate-900">Section Inclusions</h2>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {includedSections.length} of {SECTION_OPTIONS[category].length} selected
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {SECTION_OPTIONS[category].map((sec) => {
                const isChecked = includedSections.includes(sec.id);
                return (
                  <div
                    key={sec.id}
                    onClick={() => toggleSection(sec.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                      isChecked
                        ? "bg-blue-50/40 border-blue-200 text-slate-900"
                        : "bg-slate-50/60 border-slate-200 text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-semibold">{sec.label}</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{sec.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Step 5 & 6 (Live Preview Card & Download) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Preview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 sticky top-6">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-200">
                5
              </span>
              <h2 className="text-sm font-bold text-slate-900">Live Export Preview</h2>
            </div>

            {/* Simulated Document Preview Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              {/* Document Header Preview */}
              <div className="border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                  <span>VERITAS Research Audit</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-1 font-serif">
                  {specificReport}
                </h3>
                <div className="text-xs text-blue-600 font-semibold mt-0.5">
                  Project: {activeProjectObj?.name || "Active Workspace"}
                </div>
              </div>

              {/* Document Specs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-white rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Pages</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{estimatedPages} A4 Pages</div>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">File Size</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">~{estimatedSize}</div>
                </div>
              </div>

              {/* Sections to be Included */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Included Sections:
                </div>
                <div className="space-y-1">
                  {includedSections.map((secId) => {
                    const sec = SECTION_OPTIONS[category].find((s) => s.id === secId);
                    return (
                      <div key={secId} className="flex items-center gap-1.5 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{sec?.label || secId}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Content Excerpt */}
              <div className="p-3 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-500 font-mono space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Document Header Snippet:</div>
                <p className="line-clamp-3 text-slate-600 italic">
                  &ldquo;This evidence-grounded scientific dossier was automatically compiled and verified by VERITAS v1.0. All assertions are linked to immutable passage coordinates.&rdquo;
                </p>
              </div>
            </div>

            {/* Step 6: One-Click Instant Download Button */}
            <div className="pt-2">
              <button
                onClick={handleDownload}
                disabled={isDownloading || !selectedProjectId}
                className="w-full py-3.5 bg-[#126BEB] hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Compiling & Generating {format.toUpperCase()}...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>Generate & Download {format.toUpperCase()} Report</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-slate-400 text-center mt-2">
                Signed cryptographic verification hash included in download headers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

