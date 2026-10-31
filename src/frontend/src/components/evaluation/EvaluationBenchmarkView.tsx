"use client";

import React, { useState, useEffect } from "react";
import { Project, EvaluationRun, EvaluationRunSummary } from "../../types";
import {
  runEvaluationBenchmark,
  fetchEvaluationRuns,
  fetchEvaluationRun,
  fetchBenchmarkTemplate
} from "../../lib/api";
import {
  Target,
  Sparkles,
  UploadCloud,
  FileCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Download,
  Filter,
  Layers,
  ChevronDown,
  ChevronRight,
  Info,
  Check,
  Copy,
  Clock,
  BarChart3
} from "lucide-react";

interface EvaluationBenchmarkViewProps {
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
}

export function EvaluationBenchmarkView({
  currentProject,
  onSelectProject
}: EvaluationBenchmarkViewProps) {
  const [runs, setRuns] = useState<EvaluationRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvaluationRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload & Run controls
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState<string>("");
  const [useProjectScope, setUseProjectScope] = useState<boolean>(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateData, setTemplateData] = useState<any>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  // Diagnostics filters
  const [filterFailureCat, setFilterFailureCat] = useState<string>("ALL");
  const [filterVerdict, setFilterVerdict] = useState<string>("ALL");

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEvaluationRuns();
      setRuns(res.runs || []);
      if (res.runs.length > 0) {
        loadFullRun(res.runs[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load evaluation history.");
    } finally {
      setLoading(false);
    }
  };

  const loadFullRun = async (runId: string) => {
    try {
      const res = await fetchEvaluationRun(runId);
      setSelectedRun(res.run);
    } catch (err: any) {
      setError(err.message || "Failed to load run details.");
    }
  };

  const handleRunEvaluation = async () => {
    if (!file) {
      setError("Please select a benchmark dataset file (.json or .jsonl).");
      return;
    }

    setEvaluating(true);
    setError(null);
    try {
      const res = await runEvaluationBenchmark(
        file,
        datasetName.trim() || file.name,
        useProjectScope && currentProject ? currentProject.id : undefined
      );
      setSelectedRun(res.run);
      // Reload runs list
      loadRuns();
    } catch (err: any) {
      setError(err.message || "Benchmark execution failed.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleOpenTemplate = async () => {
    try {
      const data = await fetchBenchmarkTemplate();
      setTemplateData(data);
      setTemplateModalOpen(true);
    } catch (err: any) {
      alert("Failed to load benchmark template: " + err.message);
    }
  };

  const handleDownloadResultsJSON = () => {
    if (!selectedRun) return;
    const blob = new Blob([JSON.stringify(selectedRun, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veritas_benchmark_results_${selectedRun.dataset_name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSamples = (selectedRun?.sample_results || []).filter(s => {
    if (filterFailureCat !== "ALL" && s.failure_category !== filterFailureCat) {
      return false;
    }
    if (filterVerdict === "CORRECT" && !s.is_correct) return false;
    if (filterVerdict === "INCORRECT" && s.is_correct) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <Target className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Evaluation & Benchmark Suite</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Phase 10
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Automated scientific evaluation harness measuring Accuracy, Macro/Weighted F1, Confusion Matrix, and Source Link Validity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenTemplate}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2 transition"
          >
            <FileCode className="w-4 h-4 text-slate-500" />
            Benchmark Schema Template
          </button>
          <button
            onClick={loadRuns}
            disabled={loading || evaluating}
            className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Official Dataset Notification Banner */}
      <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block text-amber-950">
            Evaluation Readiness Status: Official Benchmark Harness Ready
          </span>
          <p className="leading-relaxed text-amber-800">
            The organizer evaluation dataset was not bundled in the initial code repository. The VERITAS scientific evaluation harness is fully operational and adheres to the official scientific fact-checking specification. Organizers and judges can upload any evaluation dataset (.json or .jsonl) below to run deterministic benchmarking in an isolated sandbox.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Run Evaluation Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          Run Benchmark Evaluation
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Benchmark File (.json or .jsonl)</label>
            <input
              type="file"
              accept=".json,.jsonl"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 hover:file:bg-slate-100"
            />
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Dataset Name / Suite Label</label>
            <input
              type="text"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="e.g. Organizer Test Benchmark Split A"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-3 flex items-center justify-end">
            <button
              onClick={handleRunEvaluation}
              disabled={evaluating || !file}
              className="w-full px-4 py-2 bg-[#126BEB] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
            >
              <Target className={`w-4 h-4 ${evaluating ? "animate-spin" : ""}`} />
              {evaluating ? "Executing Benchmark..." : "Execute Evaluation Run"}
            </button>
          </div>
        </div>

        {currentProject && (
          <div className="pt-2 flex items-center gap-2 text-xs text-slate-600 border-t border-slate-100">
            <input
              type="checkbox"
              id="scope-check"
              checked={useProjectScope}
              onChange={(e) => setUseProjectScope(e.target.checked)}
              className="rounded text-blue-600"
            />
            <label htmlFor="scope-check" className="cursor-pointer">
              Retrieve against active project corpus (<strong>{currentProject.name}</strong>) when gold evidence is omitted.
            </label>
          </div>
        )}
      </div>

      {/* Selected Run Metrics Scorecard */}
      {selectedRun ? (
        <div className="space-y-6">
          {/* Top Level Scorecards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Accuracy</span>
              <span className="text-2xl font-bold text-slate-900 mt-0.5 block">
                {(selectedRun.metrics.accuracy * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">{selectedRun.total_samples} samples</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-blue-500 block tracking-wider">Macro F1</span>
              <span className="text-2xl font-bold text-blue-700 mt-0.5 block">
                {(selectedRun.metrics.macro_f1 * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">Unweighted class avg</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-indigo-500 block tracking-wider">Weighted F1</span>
              <span className="text-2xl font-bold text-indigo-700 mt-0.5 block">
                {(selectedRun.metrics.weighted_f1 * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">Imbalance adjusted</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-emerald-500 block tracking-wider">Source Link Validity</span>
              <span className="text-2xl font-bold text-emerald-700 mt-0.5 block">
                {(selectedRun.metrics.source_link_validity_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">Verbatim citation fidelity</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-amber-500 block tracking-wider">Abstention Rate</span>
              <span className="text-2xl font-bold text-amber-700 mt-0.5 block">
                {(selectedRun.metrics.unresolved_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">Unresolved cases</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Actions</span>
                <span className="text-xs font-medium text-slate-600 block mt-1">Export Results</span>
              </div>
              <button
                onClick={handleDownloadResultsJSON}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Download JSON
              </button>
            </div>
          </div>

          {/* Confusion Matrix and Per-Class Results */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Confusion Matrix */}
            <div className="lg:col-span-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  3×3 Confusion Matrix
                </h3>
                <span className="text-[10px] text-slate-400">Rows: Expected | Columns: Predicted</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="p-2 text-left font-semibold text-slate-500">Exp \ Pred</th>
                      <th className="p-2 font-semibold text-emerald-700">Supported</th>
                      <th className="p-2 font-semibold text-rose-700">Contradicted</th>
                      <th className="p-2 font-semibold text-amber-700">Unresolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Supported", "Contradicted", "Unresolved"].map((exp) => (
                      <tr key={exp} className="border-b border-slate-100">
                        <td className="p-2.5 font-bold text-left text-slate-700 bg-slate-50/50">{exp}</td>
                        {["Supported", "Contradicted", "Unresolved"].map((pred) => {
                          const val = selectedRun.metrics.confusion_matrix?.[exp]?.[pred] ?? 0;
                          const isDiagonal = exp === pred;
                          return (
                            <td
                              key={pred}
                              className={`p-2.5 font-mono font-bold ${
                                isDiagonal && val > 0
                                  ? "bg-emerald-50 text-emerald-800"
                                  : val > 0
                                  ? "bg-rose-50 text-rose-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-Class Metrics */}
            <div className="lg:col-span-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Per-Class Performance Breakdown
                </h3>
                <span className="text-[10px] text-slate-400">Precision · Recall · F1</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-left">
                      <th className="p-2 font-semibold">Class</th>
                      <th className="p-2 font-semibold text-center">Support</th>
                      <th className="p-2 font-semibold text-center">Precision</th>
                      <th className="p-2 font-semibold text-center">Recall</th>
                      <th className="p-2 font-semibold text-center">F1 Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(selectedRun.metrics.per_class_metrics || {}).map(([clsName, cMet]) => (
                      <tr key={clsName}>
                        <td className="p-2.5 font-bold text-slate-800">{clsName}</td>
                        <td className="p-2.5 text-center font-mono text-slate-600">{cMet.support}</td>
                        <td className="p-2.5 text-center font-mono font-medium text-slate-800">
                          {(cMet.precision * 100).toFixed(1)}%
                        </td>
                        <td className="p-2.5 text-center font-mono font-medium text-slate-800">
                          {(cMet.recall * 100).toFixed(1)}%
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-blue-700">
                          {(cMet.f1_score * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sample Diagnostics & Failure Analysis */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Per-Sample Verification Outcomes & Failures</h3>
                <span className="text-xs text-slate-500">
                  Showing {filteredSamples.length} of {selectedRun.sample_results.length} evaluated items
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filterVerdict}
                  onChange={(e) => setFilterVerdict(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                >
                  <option value="ALL">All Outcomes</option>
                  <option value="CORRECT">Correct Only</option>
                  <option value="INCORRECT">Failures Only</option>
                </select>

                <select
                  value={filterFailureCat}
                  onChange={(e) => setFilterFailureCat(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white text-xs max-w-[200px]"
                >
                  <option value="ALL">All Error Categories</option>
                  {Object.keys(selectedRun.failure_summary || {}).map((fc) => (
                    <option key={fc} value={fc}>{fc}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {filteredSamples.map((sample, idx) => (
                <div key={sample.sample_id || idx} className="p-4 space-y-2 hover:bg-slate-50/50 transition">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 text-[11px] font-bold">
                        #{sample.sample_id}
                      </span>
                      {sample.is_correct ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          CORRECT ({sample.predicted_verdict})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          MISMATCH: Exp [{sample.expected_verdict}] vs Pred [{sample.predicted_verdict}]
                        </span>
                      )}
                      {sample.is_justified_abstention && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Justified Abstention
                        </span>
                      )}
                    </div>

                    {sample.failure_category && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        {sample.failure_category}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    &ldquo;{sample.claim_text}&rdquo;
                  </p>

                  {sample.failure_explanation && (
                    <div className="p-2.5 bg-rose-50/60 border border-rose-100 rounded text-xs text-rose-900">
                      <span className="font-bold text-[11px] block">Diagnosis:</span>
                      {sample.failure_explanation}
                    </div>
                  )}

                  {sample.retrieved_top_passages && sample.retrieved_top_passages.length > 0 && (
                    <div className="text-[11px] text-slate-500 italic pl-3 border-l-2 border-slate-200">
                      Top Evidence Context: &ldquo;{sample.retrieved_top_passages[0].text}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <Target className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Evaluation Run Selected</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Upload a scientific benchmark dataset above or click &ldquo;Benchmark Schema Template&rdquo; to inspect expected data formatting.
          </p>
        </div>
      )}

      {/* Schema Template Modal */}
      {templateModalOpen && templateData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-blue-600" />
                Organizer Benchmark Schema Specification
              </h3>
              <button
                onClick={() => setTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              VERITAS accepts standard JSON arrays or JSONL files. Each record specifies a test claim, ground-truth verdict (Supported, Contradicted, Unresolved), and optional gold quotes.
            </p>

            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto max-h-72 leading-relaxed">
              {JSON.stringify(templateData.sample_json_array, null, 2)}
            </pre>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(templateData.sample_json_array, null, 2));
                  setCopiedTemplate(true);
                  setTimeout(() => setCopiedTemplate(false), 2000);
                }}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition"
              >
                {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedTemplate ? "Copied!" : "Copy JSON Schema"}
              </button>

              <button
                onClick={() => setTemplateModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

