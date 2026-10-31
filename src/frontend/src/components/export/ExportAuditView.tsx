"use client";

import React, { useState, useEffect } from "react";
import { Project, ProjectAuditDossier } from "../../types";
import { fetchProjectAuditDossier, getExportDownloadUrl } from "../../lib/api";
import {
  DownloadCloud,
  FileText,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  BookOpen,
  Compass,
  FileClock,
  RefreshCw,
  ExternalLink,
  Printer,
  ChevronRight
} from "lucide-react";

interface ExportAuditViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export function ExportAuditView({
  currentProject,
  onSelectProject
}: ExportAuditViewProps) {
  const [dossier, setDossier] = useState<ProjectAuditDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "claims" | "papers" | "gaps" | "ledger">("summary");

  useEffect(() => {
    if (!currentProject) return;
    loadDossier();
  }, [currentProject]);

  const loadDossier = async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProjectAuditDossier(currentProject.id);
      setDossier(res);
    } catch (err: any) {
      setError(err.message || "Failed to compile project audit dossier.");
    } finally {
      setLoading(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
          <DownloadCloud className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">No Project Selected</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Please select or open a research project to compile and download its comprehensive scientific audit report.
        </p>
      </div>
    );
  }

  const stats = dossier?.statistics || {
    total_papers: 0,
    total_claims: 0,
    supported_claims: 0,
    contradicted_claims: 0,
    unresolved_claims: 0,
    faithfulness_rate: 0,
    total_gaps: 0,
    total_ledger_events: 0
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Research Audit Report Center</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Phase 10 Verified
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Export comprehensive, peer-review ready scientific audit dossiers with complete evidence provenance.
          </p>
        </div>

        <button
          onClick={loadDossier}
          disabled={loading}
          className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
          title="Refresh Dossier"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Download Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* PDF Export */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-blue-400 transition">
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 mb-2">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Academic PDF Dossier</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Publication-structured PDF report with cover page, methodology, claims matrix, and provenance trail.
            </p>
          </div>
          <a
            href={getExportDownloadUrl(currentProject.id, "pdf")}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 bg-[#126BEB] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm"
          >
            <DownloadCloud className="w-4 h-4" />
            Download PDF Report
          </a>
        </div>

        {/* JSON Export */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-blue-400 transition">
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 mb-2">
              <FileCode className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Full JSON Audit Data</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Machine-readable structured audit data adhering to Supabase native audit_reports JSONB schema.
            </p>
          </div>
          <a
            href={getExportDownloadUrl(currentProject.id, "json")}
            download
            className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <DownloadCloud className="w-4 h-4 text-slate-500" />
            Download JSON
          </a>
        </div>

        {/* CSV Export */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-blue-400 transition">
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 mb-2">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Claims Table (CSV)</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Spreadsheet of all decomposed claims, verification verdicts, confidence scores, and citations.
            </p>
          </div>
          <a
            href={getExportDownloadUrl(currentProject.id, "csv")}
            download
            className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <DownloadCloud className="w-4 h-4 text-slate-500" />
            Download CSV Table
          </a>
        </div>

        {/* Markdown Export */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-blue-400 transition">
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 mb-2">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Academic Markdown</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              GitHub-flavored Markdown report ready for academic repositories, documentation, or LaTeX pipeline.
            </p>
          </div>
          <a
            href={getExportDownloadUrl(currentProject.id, "markdown")}
            download
            className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <DownloadCloud className="w-4 h-4 text-slate-500" />
            Download Markdown
          </a>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Claims</span>
          <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{stats.total_claims}</span>
          <span className="text-[11px] text-slate-500">From {stats.total_papers} papers</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">Supported</span>
          <span className="text-2xl font-bold text-emerald-700 mt-0.5 block">{stats.supported_claims}</span>
          <span className="text-[11px] text-slate-500">
            {stats.total_claims > 0 ? `${((stats.supported_claims / stats.total_claims) * 100).toFixed(1)}%` : "0%"}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block">Contradicted</span>
          <span className="text-2xl font-bold text-rose-700 mt-0.5 block">{stats.contradicted_claims}</span>
          <span className="text-[11px] text-slate-500">
            {stats.total_claims > 0 ? `${((stats.contradicted_claims / stats.total_claims) * 100).toFixed(1)}%` : "0%"}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">Unresolved (Abstention)</span>
          <span className="text-2xl font-bold text-amber-700 mt-0.5 block">{stats.unresolved_claims}</span>
          <span className="text-[11px] text-slate-500">
            {stats.total_claims > 0 ? `${((stats.unresolved_claims / stats.total_claims) * 100).toFixed(1)}%` : "0%"}
          </span>
        </div>
      </div>

      {/* Live Dossier Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 pt-3 bg-slate-50/50">
          <button
            onClick={() => setActiveTab("summary")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
              activeTab === "summary"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Executive Summary
          </button>
          <button
            onClick={() => setActiveTab("claims")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === "claims"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Claim Verification ({stats.total_claims})
          </button>
          <button
            onClick={() => setActiveTab("papers")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === "papers"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ingested Papers ({stats.total_papers})
          </button>
          <button
            onClick={() => setActiveTab("gaps")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === "gaps"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Research Gaps ({stats.total_gaps})
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
              activeTab === "ledger"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileClock className="w-3.5 h-3.5" />
            Audit Ledger ({stats.total_ledger_events})
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 pt-2">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
              <p className="text-xs">Compiling live project audit dossier...</p>
            </div>
          ) : !dossier ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-xs">No audit dossier available yet.</p>
            </div>
          ) : activeTab === "summary" ? (
            <div className="space-y-4 text-xs leading-relaxed">
              <div className="p-4 bg-blue-50/40 rounded-xl border border-blue-100 space-y-2">
                <span className="font-bold text-sm text-blue-950 block">Project Synthesis Scope</span>
                <p className="text-blue-900">
                  <strong>Research Question:</strong> {dossier.meta.research_question}
                </p>
                <p className="text-blue-900">
                  <strong>Audited Corpus:</strong> {stats.total_papers} academic publications, decomposing {stats.total_claims} factual claims.
                </p>
                <p className="text-blue-900">
                  <strong>Scientific Faithfulness Rate:</strong> {(stats.faithfulness_rate * 100).toFixed(1)}% of claims verified with verbatim source grounding.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 space-y-1.5 font-mono text-[11px]">
                <div>• Platform: {dossier.meta.platform}</div>
                <div>• Specification Version: {dossier.meta.report_version}</div>
                <div>• Compilation Timestamp: {new Date(dossier.meta.generated_at).toLocaleString()}</div>
                <div>• Project ID: {dossier.meta.project_id}</div>
              </div>
            </div>
          ) : activeTab === "claims" ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="p-2.5 font-semibold">ID</th>
                      <th className="p-2.5 font-semibold">Category</th>
                      <th className="p-2.5 font-semibold">Verdict</th>
                      <th className="p-2.5 font-semibold">Proposition Text</th>
                      <th className="p-2.5 font-semibold">Evidence Citation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dossier.claims.map((c, idx) => (
                      <tr key={c.claim_id || idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-mono font-bold text-slate-400">
                          CLM-{String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-100 text-slate-700">
                            {c.category}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.verdict === "Supported"
                              ? "bg-emerald-100 text-emerald-800"
                              : c.verdict === "Contradicted"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {c.verdict}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-slate-900 max-w-sm">
                          {c.text}
                        </td>
                        <td className="p-2.5 italic text-slate-500 max-w-xs truncate">
                          {c.cited_evidence && c.cited_evidence.length > 0
                            ? `"${c.cited_evidence[0].exact_quote}"`
                            : "No passage cited"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "papers" ? (
            <div className="space-y-3">
              {dossier.papers.map((p, idx) => (
                <div key={p.id || idx} className="p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <h4 className="font-bold text-sm text-slate-900">{p.title}</h4>
                  <div className="text-slate-500">
                    Authors: {p.authors?.join(", ") || "N/A"} · {p.venue} ({p.publication_year || "N/A"}) · {p.total_pages} pages
                  </div>
                  <p className="text-slate-600 line-clamp-2 italic pt-1">&ldquo;{p.abstract}&rdquo;</p>
                </div>
              ))}
            </div>
          ) : activeTab === "gaps" ? (
            <div className="space-y-3">
              {dossier.research_gaps.map((g, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {g.origin_type}
                    </span>
                    <h4 className="font-bold text-slate-900">{g.suggested_research_question}</h4>
                  </div>
                  <p className="text-slate-600">{g.explanation}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {dossier.provenance_ledger.slice(0, 15).map((ev, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">{ev.created_at?.slice(0, 10)}</span>
                    <span className="font-semibold text-slate-800">{ev.title}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-200 text-slate-700">
                      {ev.event_type}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {ev.validation_outcome}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
