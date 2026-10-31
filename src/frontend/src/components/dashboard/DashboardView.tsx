"use client";

import React from "react";
import { useProject } from "../../context/ProjectContext";
import {
  FolderKanban,
  FileText,
  UploadCloud,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Plus
} from "lucide-react";

export function DashboardView({ onOpenCreateModal }: { onOpenCreateModal: () => void }) {
  const { projects, activeProject, setActiveProject, setActiveTab } = useProject();

  const totalPapers = projects.reduce((acc, p) => acc + (p.paper_count || 0), 0);

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner */}
      <div className="bg-gradient-to-r from-[#172033] to-[#1e2d4a] rounded-3xl p-8 text-white relative overflow-hidden shadow-lg border border-slate-800">
        <div className="max-w-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-[11px] font-semibold backdrop-blur-sm border border-white/15 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Evidence-First AI Research Auditing
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Every claim has evidence. Every disagreement has context.
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
            VERITAS deconstructs dense academic research literature into atomic propositions, verifies claims against source passages with pixel-level PDF bounding boxes, and detects contextual contradictions across conflicting papers.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 transition-all shadow-md shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              New Research Project
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm border border-white/10"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Research PDFs
            </button>
          </div>
        </div>

        {/* Ambient background blur accent */}
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none"></div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Workspaces</span>
            <FolderKanban className="w-5 h-5 text-[#126BEB]" />
          </div>
          <div className="text-2xl font-bold text-[#172033]">{projects.length}</div>
          <p className="text-[11px] text-slate-400 mt-1">Multi-paper research scopes</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Indexed Papers</span>
            <FileText className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-[#172033]">{totalPapers}</div>
          <p className="text-[11px] text-slate-400 mt-1">Parsed with PyMuPDF spatial bboxes</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Evidence Status</span>
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-[#172033]">
            {activeProject ? "Ready to Audit" : "Standby"}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeProject ? `Project: ${activeProject.name}` : "Select a project to begin"}
          </p>
        </div>
      </div>

      {/* Recent Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#172033] uppercase tracking-wider">
            Recent Research Projects
          </h2>
          <button
            onClick={() => setActiveTab("projects")}
            className="text-xs font-semibold text-[#126BEB] hover:underline"
          >
            View all
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <p className="text-xs text-slate-400 mb-3">No research projects configured yet.</p>
            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.slice(0, 4).map((project) => (
              <div
                key={project.id}
                onClick={() => {
                  setActiveProject(project);
                  setActiveTab("papers");
                }}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-[#126BEB] hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <h3 className="font-bold text-xs text-[#172033] truncate">{project.name}</h3>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {project.topic || "General Scientific Domain"} • {project.paper_count} papers
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

