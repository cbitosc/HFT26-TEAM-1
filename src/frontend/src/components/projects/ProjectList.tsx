"use client";

import React, { useState } from "react";
import { useProject } from "../../context/ProjectContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteProject } from "../../lib/api";
import { Project } from "../../types";
import { EditProjectModal } from "./EditProjectModal";
import {
  FolderKanban,
  Plus,
  Search,
  FileText,
  Calendar,
  ArrowRight,
  MoreVertical,
  Trash2,
  Edit,
  AlertTriangle
} from "lucide-react";

export function ProjectList({ onOpenCreateModal }: { onOpenCreateModal: () => void }) {
  const queryClient = useQueryClient();
  const { projects, isLoadingProjects, activeProject, setActiveProject, setActiveTab } = useProject();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<Project | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (activeProject?.id === deletedId) {
        setActiveProject(null);
      }
      setDeleteConfirmProject(null);
    }
  });

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.topic && p.topic.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-[#172033] flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[#126BEB]" />
            Research Workspaces & Projects
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage multi-paper synthesis projects, research objectives, and document collections.
          </p>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 transition-all shadow-sm shadow-blue-500/25 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Research Project
        </button>
      </div>

      {/* Search & Quick Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects by name, topic, or objective..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20 focus:border-[#126BEB]"
          />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          {filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"} found
        </div>
      </div>

      {/* Project Grid */}
      {isLoadingProjects ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              <div className="h-12 bg-slate-50 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#126BEB] flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <FolderKanban className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#172033] mb-1">
            {searchQuery ? "No matching projects found" : "No Research Projects Yet"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
            {searchQuery
              ? "Try adjusting your search criteria or create a new project."
              : "Create your first project to start uploading and verifying multi-paper scientific research."}
          </p>
          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Research Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const isActive = activeProject?.id === project.id;
            return (
              <div
                key={project.id}
                className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between hover:shadow-md ${
                  isActive
                    ? "border-[#126BEB] ring-2 ring-[#126BEB]/15 shadow-sm"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Card Header */}
                <div className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      {project.topic && (
                        <span className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-[#126BEB] border border-blue-200 mb-1.5 truncate max-w-full">
                          {project.topic}
                        </span>
                      )}
                      <h3
                        className="font-bold text-sm text-[#172033] truncate leading-snug cursor-pointer hover:text-[#126BEB]"
                        title={project.name}
                        onClick={() => {
                          setActiveProject(project);
                          setActiveTab("papers");
                        }}
                      >
                        {project.name}
                      </h3>
                    </div>

                    {/* Context Action Menu */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === project.id ? null : project.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpenId === project.id && (
                        <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in duration-100">
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              setEditingProject(project);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Edit className="w-3.5 h-3.5 text-slate-400" />
                            Edit Metadata
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              setDeleteConfirmProject(project);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            Delete Project
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Research Question / Description */}
                  {project.research_question ? (
                    <p className="text-xs text-slate-600 line-clamp-2 italic mb-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      "{project.research_question}"
                    </p>
                  ) : project.description ? (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                      {project.description}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic mb-2">No description provided</p>
                  )}
                </div>

                {/* Card Footer */}
                <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 rounded-b-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span className="flex items-center gap-1 font-semibold text-slate-600">
                      <FileText className="w-3.5 h-3.5 text-[#126BEB]" />
                      {project.paper_count} {project.paper_count === 1 ? "paper" : "papers"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setActiveProject(project);
                      setActiveTab("papers");
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-[#126BEB] text-white shadow-sm"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{isActive ? "Active" : "Open"}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#172033]">Confirm Deletion</h3>
                <p className="text-xs text-slate-400">Irreversible action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to delete the research project{" "}
              <strong className="text-[#172033]">"{deleteConfirmProject.name}"</strong>?
              Associated synthesis records and paper linkages will be removed.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeleteConfirmProject(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmProject.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

