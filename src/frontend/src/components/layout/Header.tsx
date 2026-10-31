"use client";

import React, { useState, useEffect } from "react";
import { useProject } from "../../context/ProjectContext";
import { checkBackendHealth } from "../../lib/api";
import { Activity, FolderOpen, ChevronDown, Plus } from "lucide-react";

export function Header({ onOpenCreateModal }: { onOpenCreateModal: () => void }) {
  const { activeProject, setActiveProject, projects } = useProject();
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    checkBackendHealth().then((status) => setIsBackendHealthy(status));
    const interval = setInterval(() => {
      checkBackendHealth().then((status) => setIsBackendHealthy(status));
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      {/* Product Tagline / Mission */}
      <div className="flex items-center gap-3">
        <span className="hidden md:inline-block text-xs font-medium text-slate-500 italic border-l-2 border-[#126BEB] pl-3">
          "Every claim has evidence. Every disagreement has context. Every uncertainty is visible."
        </span>
      </div>

      {/* Right Controls: Project Switcher & Status */}
      <div className="flex items-center gap-4">
        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-[#172033] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#126BEB]" />
            <span className="max-w-[160px] truncate">
              {activeProject ? activeProject.name : "Select Project"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Switch Project
              </div>
              <div className="max-h-48 overflow-y-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveProject(p);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      activeProject?.id === p.id ? "font-bold text-[#126BEB] bg-blue-50/50" : "text-slate-700"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-400">{p.paper_count} papers</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-100 mt-1 pt-1 px-2">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenCreateModal();
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-[#126BEB] font-semibold flex items-center gap-1.5 hover:bg-blue-50 rounded"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New Project
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Backend Health Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-600">
          <Activity
            className={`w-3 h-3 ${
              isBackendHealthy === true
                ? "text-emerald-500 animate-pulse"
                : isBackendHealthy === false
                ? "text-rose-500"
                : "text-amber-500"
            }`}
          />
          <span className="hidden sm:inline">
            {isBackendHealthy === true ? "FastAPI Online" : isBackendHealthy === false ? "FastAPI Offline" : "Connecting..."}
          </span>
        </div>
      </div>
    </header>
  );
}

