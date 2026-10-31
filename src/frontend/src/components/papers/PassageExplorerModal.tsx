"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPaperPassages } from "../../lib/api";
import { Paper, Passage } from "../../types";
import {
  X,
  FileText,
  Search,
  BookOpen,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Binary,
  Eye
} from "lucide-react";

export function PassageExplorerModal({
  paper,
  isOpen,
  onClose
}: {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPassage, setSelectedPassage] = useState<Passage | null>(null);
  const pageSize = 15;

  const {
    data: passagesData,
    isLoading
  } = useQuery({
    queryKey: ["paper_passages", paper?.id, currentPage],
    queryFn: () => (paper ? fetchPaperPassages(paper.id, undefined, pageSize, currentPage * pageSize) : Promise.resolve(null)),
    enabled: isOpen && !!paper
  });

  if (!isOpen || !paper) return null;

  const passages = passagesData?.passages || [];
  const totalPassages = passagesData?.total_passages || 0;
  const totalPages = Math.ceil(totalPassages / pageSize);

  const filteredPassages = passages.filter((p) =>
    p.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.section_title && p.section_title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#126BEB] border border-blue-100 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#172033] truncate leading-tight" title={paper.title}>
                {paper.title}
              </h2>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="font-mono">{paper.original_filename}</span>
                <span>•</span>
                <span>{totalPassages} Traceable Passages</span>
                {paper.page_count && <span>• {paper.page_count} Pages</span>}
                {paper.metadata_json?.doi && <span>• DOI: {paper.metadata_json.doi}</span>}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4 bg-white shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search passages by keyword or section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:bg-white focus:border-[#126BEB]"
            />
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                className="p-1 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Main Content: Split Master-Detail */}
        <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-slate-100">
          {/* Left Column: Passage List */}
          <div className="w-1/2 overflow-y-auto p-4 space-y-3 scrollbar-thin bg-slate-50/30">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 p-4 animate-pulse"></div>
                ))}
              </div>
            ) : filteredPassages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No passages match your query.
              </div>
            ) : (
              filteredPassages.map((p) => {
                const isSelected = selectedPassage?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPassage(p)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-xs ${
                      isSelected
                        ? "bg-blue-50/60 border-[#126BEB] shadow-sm"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-[#172033] truncate">
                          {p.section_title || "Body Section"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Page {p.page_start}
                        </span>
                        {p.extraction_method === "ocr" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            OCR
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-slate-600 line-clamp-3 leading-relaxed">
                      {p.text}
                    </p>

                    <div className="mt-2 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span title={p.id}>ID: {p.id.slice(0, 8)}...</span>
                      <span>#{p.sequence_index + 1}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Selected Passage Inspection */}
          <div className="w-1/2 p-6 overflow-y-auto bg-white flex flex-col justify-between">
            {selectedPassage ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#126BEB] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {selectedPassage.section_title || "Body Section"}
                    </span>
                    <h3 className="font-bold text-sm text-[#172033] mt-1.5">
                      Passage #{selectedPassage.sequence_index + 1} • Page {selectedPassage.page_start}
                    </h3>
                  </div>

                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                    selectedPassage.extraction_method === "ocr"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}>
                    {selectedPassage.extraction_method === "ocr" ? "OCR Extracted" : "Native Text Extracted"}
                  </span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans select-text whitespace-pre-wrap">
                  {selectedPassage.text}
                </div>

                {/* Provenance Metadata Card */}
                <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 text-[11px] space-y-1.5">
                  <div className="font-bold text-slate-600 uppercase tracking-wider text-[10px] mb-1">
                    Passage Provenance Attributes
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Stable UUID:</span>
                    <span className="text-slate-700 truncate max-w-[220px]" title={selectedPassage.id}>
                      {selectedPassage.id}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Paper Source:</span>
                    <span className="text-slate-700 truncate max-w-[220px]" title={selectedPassage.paper_id}>
                      {selectedPassage.paper_id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Word Count:</span>
                    <span className="text-slate-700 font-semibold">
                      {selectedPassage.text.split(/\s+/).length} words
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
                <Eye className="w-8 h-8 text-slate-300 mb-2" />
                <h4 className="text-xs font-bold text-slate-600">Select a Passage to Inspect</h4>
                <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                  Click on any segmented passage on the left to review its verbatim text, source page, and provenance metadata.
                </p>
              </div>
            )}

            <div className="text-[10px] text-slate-400 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span>VERITAS Evidence Passage Auditor</span>
              <span>Sub-sentence Boundary Preserved</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

