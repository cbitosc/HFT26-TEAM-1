"use client";

import React from "react";
import { Sparkles, Clock, ShieldCheck, CheckCircle2 } from "lucide-react";

interface PlaceholderViewProps {
  title: string;
  phase: string;
  description: string;
  features: string[];
}

export function PlaceholderView({ title, phase, description, features }: PlaceholderViewProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-6 my-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#126BEB] border border-blue-200">
            {phase}
          </span>
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Under Active Implementation
          </span>
        </div>

        <h1 className="text-2xl font-bold text-[#172033] mb-2">{title}</h1>
        <p className="text-xs text-slate-500 leading-relaxed mb-6">{description}</p>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6">
          <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#126BEB]" />
            Core Capabilities In Development:
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-600">
            {features.map((feat, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-4 flex items-center justify-between">
          <span>In strict adherence to the Master Engineering Directive (Rule 6 & 13)</span>
          <span className="font-semibold text-slate-600">VERITAS Auditing Engine</span>
        </div>
      </div>
    </div>
  );
}

