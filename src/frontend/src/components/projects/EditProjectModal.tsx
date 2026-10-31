"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProject } from "../../lib/api";
import { Project } from "../../types";
import { useProject } from "../../context/ProjectContext";
import { X, Edit3, AlertCircle } from "lucide-react";

export function EditProjectModal({
  project,
  isOpen,
  onClose
}: {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { setActiveProject, activeProject } = useProject();

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setTopic(project.topic || "");
      setResearchQuestion(project.research_question || "");
      setDescription(project.description || "");
    }
  }, [project]);

  const mutation = useMutation({
    mutationFn: (data: { name: string; topic?: string; research_question?: string; description?: string }) => {
      if (!project) throw new Error("No project selected");
      return updateProject(project.id, data);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (activeProject?.id === updated.id) {
        setActiveProject(updated);
      }
      onClose();
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to update project");
    }
  });

  if (!isOpen || !project) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage("Project name is required.");
      return;
    }
    setErrorMessage(null);
    mutation.mutate({
      name: name.trim(),
      topic: topic.trim() || undefined,
      research_question: researchQuestion.trim() || undefined,
      description: description.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-[#126BEB] flex items-center justify-center border border-slate-200">
              <Edit3 className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172033]">Edit Project Metadata</h2>
              <p className="text-[11px] text-slate-400">Update research parameters and scope</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20 focus:border-[#126BEB]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Research Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20 focus:border-[#126BEB]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Research Question or Objective</label>
            <input
              type="text"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20 focus:border-[#126BEB]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20 focus:border-[#126BEB] resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 shadow-sm disabled:opacity-50"
            >
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

