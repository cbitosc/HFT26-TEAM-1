"use client";

import React from "react";
import { useProject } from "../../context/ProjectContext";
import {
  LayoutDashboard,
  FolderKanban,
  UploadCloud,
  FileText,
  BrainCircuit,
  ScrollText,
  GitMerge,
  ShieldCheck,
  SearchCode,
  TableProperties,
  Compass,
  Binary,
  Target,
  FileClock,
  DownloadCloud,
  Settings,
  Sparkles
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  isImplemented: boolean;
}

const NAV_ITEMS: { category: string; items: NavItem[] }[] = [
  {
    category: "WORKSPACE",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, isImplemented: true },
      { id: "projects", label: "My Projects", icon: FolderKanban, isImplemented: true },
      { id: "upload", label: "Upload Papers", icon: UploadCloud, isImplemented: true },
      { id: "papers", label: "Research Papers", icon: FileText, isImplemented: true },
    ]
  },
  {
    category: "AUDIT & INTELLIGENCE",
    items: [
      { id: "intelligence", label: "Paper Intelligence", icon: BrainCircuit, isImplemented: true },
      { id: "summaries", label: "Research Summaries", icon: ScrollText, isImplemented: true },
      { id: "synthesis", label: "Cross-Paper Synthesis", icon: GitMerge, isImplemented: true },
      { id: "claims", label: "Claim Verification", icon: ShieldCheck, isImplemented: true },
      { id: "evidence", label: "Evidence Explorer", icon: SearchCode, isImplemented: true },
      { id: "matrix", label: "Comparison Matrix", icon: TableProperties, isImplemented: true },
      { id: "gaps", label: "Research Gap Explorer", icon: Compass, isImplemented: true },
      { id: "numerical", label: "Numerical Truth Detector", icon: Binary, isImplemented: true },
    ]
  },
  {
    category: "VALIDATION & EXPORT",
    items: [
      { id: "benchmarks", label: "Evaluation & Benchmarks", icon: Target, badge: "Phase 10", isImplemented: false },
      { id: "provenance", label: "Provenance Ledger", icon: FileClock, isImplemented: true },
      { id: "audit", label: "Export & Audit Reports", icon: DownloadCloud, badge: "Phase 10", isImplemented: false },
      { id: "settings", label: "Settings", icon: Settings, isImplemented: true },
    ]
  }
];

export function Sidebar() {
  const { activeTab, setActiveTab, activeProject } = useProject();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100 gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#126BEB] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <div className="font-bold text-base tracking-tight text-[#172033] flex items-center gap-1.5">
            VERITAS
            <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-[#126BEB] border border-blue-200">
              v1.0
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium leading-none">
            Evidence Auditing Platform
          </div>
        </div>
      </div>

      {/* Active Project Banner */}
      <div className="p-3 mx-3 my-2 bg-slate-50 border border-slate-200/80 rounded-lg">
        <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
          Active Workspace
        </div>
        {activeProject ? (
          <div className="truncate">
            <div className="text-xs font-semibold text-[#172033] truncate" title={activeProject.name}>
              {activeProject.name}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <span>{activeProject.paper_count} papers indexed</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic flex items-center justify-between">
            <span>No project active</span>
            <button
              onClick={() => setActiveTab("projects")}
              className="text-[11px] text-[#126BEB] font-medium not-italic hover:underline"
            >
              Select
            </button>
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-thin">
        {NAV_ITEMS.map((group) => (
          <div key={group.category}>
            <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1.5">
              {group.category}
            </div>
            <nav className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-[#126BEB] text-white shadow-sm shadow-blue-600/15"
                        : "text-slate-600 hover:text-[#172033] hover:bg-slate-100/80"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && !isActive && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-100 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span>CBIT Hacktoberfest '26</span>
          <span className="font-semibold text-slate-500">Team OrbitX</span>
        </div>
      </div>
    </aside>
  );
}

