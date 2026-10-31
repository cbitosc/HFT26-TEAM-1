"use client";

import React, { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadPapers } from "../../lib/api";
import { useProject } from "../../context/ProjectContext";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCw,
  FolderOpen,
  ArrowRight
} from "lucide-react";

interface QueuedFile {
  id: string;
  file: File;
  status: "idle" | "uploading" | "success" | "duplicate" | "error";
  error?: string;
  pages?: number;
  chunks?: number;
}

export function MultiPdfUpload() {
  const queryClient = useQueryClient();
  const { activeProject, projects, setActiveProject, setActiveTab } = useProject();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(activeProject?.id || "");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync selected project with active project
  React.useEffect(() => {
    if (activeProject) {
      setSelectedProjectId(activeProject.id);
    } else if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [activeProject, projects]);

  const handleFiles = (fileList: FileList | File[]) => {
    const newItems: QueuedFile[] = [];
    const filesArray = Array.from(fileList);

    for (const f of filesArray) {
      const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
      if (!isPdf) {
        newItems.push({
          id: Math.random().toString(),
          file: f,
          status: "error",
          error: "Invalid file type. Only PDF documents are supported."
        });
        continue;
      }
      if (f.size === 0) {
        newItems.push({
          id: Math.random().toString(),
          file: f,
          status: "error",
          error: "File is empty (0 bytes)."
        });
        continue;
      }
      if (f.size > 52428800) {
        newItems.push({
          id: Math.random().toString(),
          file: f,
          status: "error",
          error: "File exceeds 50MB limit."
        });
        continue;
      }

      newItems.push({
        id: Math.random().toString(),
        file: f,
        status: "idle"
      });
    }

    setQueue((prev) => [...prev, ...newItems]);
  };

  const uploadMutation = useMutation({
    mutationFn: async (items: QueuedFile[]) => {
      if (!selectedProjectId) {
        throw new Error("Please select a target research project.");
      }
      const filesToUpload = items.map((i) => i.file);
      return uploadPapers(filesToUpload, selectedProjectId);
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project_papers", selectedProjectId] });

      setQueue((prev) =>
        prev.map((item, idx) => {
          const res = results[idx];
          if (!res) return item;
          if (res.is_duplicate) {
            return {
              ...item,
              status: "duplicate",
              error: res.message,
              pages: res.total_pages,
              chunks: res.total_chunks
            };
          }
          return {
            ...item,
            status: "success",
            pages: res.total_pages,
            chunks: res.total_chunks
          };
        })
      );
    },
    onError: (err: any) => {
      setQueue((prev) =>
        prev.map((item) =>
          item.status === "uploading"
            ? { ...item, status: "error", error: err.message || "Upload failed" }
            : item
        )
      );
    }
  });

  const startUpload = () => {
    const pending = queue.filter((item) => item.status === "idle" || item.status === "error");
    if (pending.length === 0) return;

    setQueue((prev) =>
      prev.map((item) =>
        item.status === "idle" || item.status === "error"
          ? { ...item, status: "uploading", error: undefined }
          : item
      )
    );

    uploadMutation.mutate(pending);
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const clearCompleted = () => {
    setQueue((prev) => prev.filter((i) => i.status !== "success" && i.status !== "duplicate"));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const targetProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172033] flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-[#126BEB]" />
            Multi-PDF Research Ingestion
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ingest academic research papers with PyMuPDF spatial extraction, bounding box preservation, and private cloud storage.
          </p>
        </div>

        {/* Project Target Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 shrink-0">Target Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              const p = projects.find((x) => x.id === e.target.value);
              if (p) setActiveProject(p);
            }}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#126BEB]/20"
          >
            {projects.length === 0 ? (
              <option value="">No projects available</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {projects.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
          <span>You need to create a research project before uploading research papers.</span>
          <button
            onClick={() => setActiveTab("projects")}
            className="text-xs font-bold text-[#126BEB] underline hover:no-underline"
          >
            Go to Projects
          </button>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-[#126BEB] bg-blue-50/50 scale-[0.99]"
            : "border-slate-300 bg-white hover:border-[#126BEB] hover:bg-slate-50/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files);
            }
          }}
        />

        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#126BEB] flex items-center justify-center mx-auto mb-3 border border-blue-100 shadow-sm">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-bold text-[#172033] mb-1">
          Drag & drop research PDFs here, or <span className="text-[#126BEB]">browse files</span>
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-3">
          Upload multiple academic PDFs simultaneously. Supported format: PDF (up to 50MB per file).
        </p>

        <div className="inline-flex items-center gap-3 text-[11px] text-slate-500 font-medium bg-slate-100/70 px-3 py-1 rounded-full">
          <span>✓ PyMuPDF Spatial Extraction</span>
          <span>•</span>
          <span>✓ Private Supabase Storage</span>
          <span>•</span>
          <span>✓ SHA-256 Deduplication</span>
        </div>
      </div>

      {/* Queue List */}
      {queue.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <span className="text-xs font-bold text-[#172033]">
              Upload Queue ({queue.length} {queue.length === 1 ? "file" : "files"})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={clearCompleted}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1"
              >
                Clear Finished
              </button>
              <button
                onClick={startUpload}
                disabled={uploadMutation.isPending || !selectedProjectId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#126BEB] text-white hover:bg-blue-600 disabled:opacity-50 shadow-sm"
              >
                {uploadMutation.isPending ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload All</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {queue.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 truncate" title={item.file.name}>
                      {item.file.name}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{formatSize(item.file.size)}</span>
                      {item.pages && <span>• {item.pages} pages</span>}
                      {item.chunks && <span>• {item.chunks} spatial chunks</span>}
                      {item.error && <span className="text-red-500 font-medium">• {item.error}</span>}
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-3 shrink-0">
                  {item.status === "uploading" && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#126BEB] font-medium bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                      <RotateCw className="w-3 h-3 animate-spin" />
                      Parsing PDF...
                    </span>
                  )}
                  {item.status === "success" && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Indexed
                    </span>
                  )}
                  {item.status === "duplicate" && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                      Already in Project
                    </span>
                  )}
                  {item.status === "error" && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-red-700 font-medium bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      Failed
                    </span>
                  )}
                  {item.status === "idle" && (
                    <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2.5 py-1 rounded-full">
                      Ready
                    </span>
                  )}

                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1 text-slate-300 hover:text-slate-600 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finished Summary Banner */}
      {queue.some((i) => i.status === "success" || i.status === "duplicate") && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div>
            <span className="font-bold">Ingestion complete!</span> Papers are stored in private Supabase Storage and segmented with PyMuPDF spatial coordinates.
          </div>
          <button
            onClick={() => setActiveTab("papers")}
            className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-900 ml-4 shrink-0"
          >
            <span>View Research Papers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

