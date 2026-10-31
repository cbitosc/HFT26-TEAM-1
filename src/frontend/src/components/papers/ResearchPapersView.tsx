"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProjectPapers, deletePaper, fetchSignedUrl } from "../../lib/api";
import { useProject } from "../../context/ProjectContext";
import { Paper } from "../../types";
import {
  FileText,
  UploadCloud,
  ExternalLink,
  Trash2,
  Calendar,
  Layers,
  HardDrive,
  Search,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export function ResearchPapersView() {
  const queryClient = useQueryClient();
  const { activeProject, projects, setActiveTab } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: papers = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["project_papers", activeProject?.id],
    queryFn: () => (activeProject ? fetchProjectPapers(activeProject.id) : Promise.resolve([])),
    enabled: !!activeProject
  });

  const deleteMutation = useMutation({
    mutationFn: (paperId: string) => deletePaper(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_papers", activeProject?.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeletingId(null);
    }
  });

  const handleOpenPdf = async (paperId: string) => {
    try {
      const res = await fetchSignedUrl(paperId);
      if (res.signed_url) {
        window.open(res.signed_url, "_blank");
      }
    } catch (err: any) {
      alert(`Could not open PDF: ${err.message}`);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (!activeProject) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#126BEB] flex items-center justify-center mx-auto mb-4 border border-blue-100">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-[#172033] mb-1">No Active Project Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
          Please select or create a project workspace to inspect indexed research papers.
        </p>
        <button
          onClick={() => setActiveTab("projects")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 shadow-sm"
        >
          View Projects
        </button>
      </div>
    );
  }

  const filtered = papers.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.original_filename && p.original_filename.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-[#126BEB] border border-blue-200">
              {activeProject.name}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500">{papers.length} research papers indexed</span>
          </div>
          <h1 className="text-xl font-bold text-[#172033] flex items-center gap-2 mt-1">
            <FileText className="w-5 h-5 text-[#126BEB]" />
            Indexed Academic Papers
          </h1>
        </div>

        <button
          onClick={() => setActiveTab("upload")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/25 shrink-0"
        >
          <UploadCloud className="w-4 h-4" />
          Upload More Papers
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search papers by title or filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20 focus:border-[#126BEB]"
          />
        </div>
      </div>

      {/* Paper Table / Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 p-4 animate-pulse"></div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-md mx-auto my-8">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-[#172033] mb-1">No Papers in this Project</h4>
          <p className="text-xs text-slate-400 mb-4">
            Upload multi-paper research PDFs to begin spatial decomposition and evidence verification.
          </p>
          <button
            onClick={() => setActiveTab("upload")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 shadow-sm"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload Research PDFs
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold tracking-wider text-[11px] uppercase">
              <tr>
                <th className="px-5 py-3">Document Title & Filename</th>
                <th className="px-4 py-3">Pages</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((paper) => (
                <tr key={paper.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5 max-w-md">
                    <div className="font-bold text-[#172033] truncate leading-tight" title={paper.title}>
                      {paper.title}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 truncate">
                      <span className="font-mono text-slate-500">{paper.original_filename}</span>
                      {paper.publication_year && <span>• {paper.publication_year}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      {paper.page_count || 1}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">
                    {formatSize(paper.file_size)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Indexed & Chunked
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                    {new Date(paper.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2">
                    <button
                      onClick={() => handleOpenPdf(paper.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] transition-colors"
                      title="Open in secure PDF reader"
                    >
                      <ExternalLink className="w-3 h-3 text-[#126BEB]" />
                      <span>View PDF</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${paper.title}" from this project?`)) {
                          deleteMutation.mutate(paper.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="inline-flex items-center gap-1 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete paper"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

