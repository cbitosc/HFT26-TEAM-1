"use client";

import React from "react";
import { Settings, Server, Database, Lock, Cpu, CheckCircle2 } from "lucide-react";

export function SettingsView() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-[#172033] flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#126BEB]" />
          Platform Environment & Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configuration parameters, security verification, and connected backend infrastructure.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
        {/* Backend API Configuration */}
        <div>
          <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-[#126BEB]" />
            FastAPI Backend Service
          </h2>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">API Gateway Endpoint:</span>
              <span className="font-mono font-semibold text-[#172033]">{backendUrl}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Framework:</span>
              <span className="font-semibold text-slate-700">FastAPI + Pydantic v2 (AsyncIO)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Spatial PDF Parser:</span>
              <span className="font-semibold text-slate-700">PyMuPDF (fitz) v2.0</span>
            </div>
          </div>
        </div>

        {/* Database & Storage */}
        <div>
          <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            Supabase PostgreSQL & Storage Cluster
          </h2>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Database Engine:</span>
              <span className="font-semibold text-slate-700">PostgreSQL 15+ (pgvector enabled)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Storage Bucket:</span>
              <span className="font-semibold text-slate-700">papers (Private Storage, 50MB PDF limit)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Security Perimeter:</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Row Level Security (RLS) Active
              </span>
            </div>
          </div>
        </div>

        {/* AI Provider Adapter */}
        <div>
          <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-600" />
            AI & Inference Engine Adapter
          </h2>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Configured Adapter:</span>
              <span className="font-semibold text-slate-700">Featherless AI / Gemini Unified Adapter</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Embedding Dimensionality:</span>
              <span className="font-semibold text-slate-700">768-dim (HNSW Cosine Vector Index)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Secret Management:</span>
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Isolated Backend Environment (.env excluded from Git)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

