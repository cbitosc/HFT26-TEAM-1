"use client";

import React, { useState, useEffect } from "react";
import { Project, ProvenanceLedgerEntry, ProjectLedgerResponse, LedgerEventType } from "../../types";
import { fetchProjectLedger } from "../../lib/api";
import {
  FileClock,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Filter,
  Copy,
  Check,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Search,
  ExternalLink
} from "lucide-react";

interface ProvenanceLedgerViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export function ProvenanceLedgerView({
  currentProject,
  onSelectProject
}: ProvenanceLedgerViewProps) {
  const [ledgerResponse, setLedgerResponse] = useState<ProjectLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [selectedEventType, setSelectedEventType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    loadLedger();
  }, [currentProject]);

  const loadLedger = async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProjectLedger(currentProject.id, 100);
      setLedgerResponse(res);
    } catch (err: any) {
      setError(err.message || "Failed to load provenance audit ledger.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportJSON = () => {
    if (!ledgerResponse) return;
    const blob = new Blob([JSON.stringify(ledgerResponse, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veritas_audit_ledger_${currentProject?.name?.replace(/\s+/g, "_") || "project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentProject) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
          <FileClock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">No Project Selected</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Please select or open a research project to inspect its tamper-proof provenance ledger.
        </p>
      </div>
    );
  }

  const allEvents = ledgerResponse?.events || [];
  const filteredEvents = allEvents.filter(ev => {
    if (selectedEventType !== "ALL" && ev.event_type !== selectedEventType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.entity_id.toLowerCase().includes(q) ||
        ev.event_type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome.toUpperCase()) {
      case "SUCCESS":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            SUCCESS
          </span>
        );
      case "FLAGGED":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            FLAGGED
          </span>
        );
      case "DOWNGRADED":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-orange-600" />
            DOWNGRADED
          </span>
        );
      case "FAILED":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
            <XCircle className="w-3 h-3 text-red-600" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
            {outcome}
          </span>
        );
    }
  };

  const getEventTypeLabel = (t: LedgerEventType | string) => {
    return t.replace(/_/g, " ");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
              <FileClock className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Evidence Provenance Ledger</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Immutable Audit Trail
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Complete lineage tracing: Paper &rarr; Passage &rarr; Output &rarr; Claim &rarr; Retrieval &rarr; Verification &rarr; Audit.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadLedger}
            disabled={loading}
            className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleExportJSON}
            disabled={!ledgerResponse || ledgerResponse.total_events === 0}
            className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-sm flex items-center gap-2 shadow-2xs transition disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Audit Ledger (JSON)
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, entity IDs, titles..."
            className="px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-64"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700 text-xs"
          >
            <option value="ALL">All Event Types</option>
            <option value="PAPER_UPLOAD">Paper Upload</option>
            <option value="PAPER_PROCESSING">Paper Processing</option>
            <option value="INTELLIGENCE_EXTRACTION">Intelligence Extraction</option>
            <option value="SUMMARY_GENERATION">Summary Generation</option>
            <option value="SYNTHESIS_GENERATION">Synthesis Generation</option>
            <option value="CLAIM_DECOMPOSITION">Claim Decomposition</option>
            <option value="EVIDENCE_RETRIEVAL">Evidence Retrieval</option>
            <option value="CLAIM_VERIFICATION">Claim Verification</option>
            <option value="NUMERICAL_AUDIT">Numerical Audit</option>
            <option value="OVERGENERALIZATION_AUDIT">Overgeneralization Audit</option>
            <option value="RESEARCH_GAP_GENERATION">Research Gap Generation</option>
          </select>

          <span className="text-slate-400">
            Showing {filteredEvents.length} of {allEvents.length}
          </span>
        </div>
      </div>

      {/* Events Timeline */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-3" />
          <p className="text-sm font-medium">Loading provenance ledger trail...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <FileClock className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Provenance Events Recorded</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            As you upload papers, extract intelligence, decompose claims, and verify evidence, an append-only audit trail is automatically constructed here.
          </p>
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 pl-6 py-2">
          {filteredEvents.map((ev) => {
            const isExpanded = expandedEventId === ev.id;
            return (
              <div key={ev.id} className="relative group">
                {/* Timeline Node */}
                <div className="absolute -left-[31px] top-3 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 shadow-xs" />

                {/* Event Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition hover:border-slate-300">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-200 text-slate-800">
                        {getEventTypeLabel(ev.event_type)}
                      </span>
                      {getOutcomeBadge(ev.validation_outcome)}
                      <span className="text-xs text-slate-400 font-mono">
                        Actor: {ev.actor}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>{new Date(ev.created_at).toLocaleString()}</span>
                      <button
                        onClick={() => copyToClipboard(ev.id, ev.id)}
                        className="text-slate-400 hover:text-slate-600"
                        title="Copy Event ID"
                      >
                        {copiedId === ev.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{ev.title}</h4>
                      <button
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
                      >
                        {isExpanded ? "Hide Metadata" : "Inspect Metadata"}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{ev.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                      <span>Entity ID: <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">{ev.entity_id}</code></span>
                      {ev.model_name && <span>Model: <code className="font-mono text-slate-700">{ev.model_name}</code></span>}
                      {ev.prompt_version && <span>Prompt: <code className="font-mono text-slate-700">{ev.prompt_version}</code></span>}
                    </div>

                    {/* Metadata JSON Drawer */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
                          <span>Event Metadata Payload</span>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(ev.metadata_json, null, 2), ev.id + "_json")}
                            className="text-blue-600 hover:text-blue-700 font-normal flex items-center gap-1"
                          >
                            {copiedId === ev.id + "_json" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            Copy JSON
                          </button>
                        </div>
                        <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 leading-tight">
                          {JSON.stringify(ev.metadata_json, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

