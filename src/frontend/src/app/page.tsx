"use client";

import React, { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { useProject } from "../context/ProjectContext";
import { DashboardView } from "../components/dashboard/DashboardView";
import { ProjectList } from "../components/projects/ProjectList";
import { MultiPdfUpload } from "../components/papers/MultiPdfUpload";
import { ResearchPapersView } from "../components/papers/ResearchPapersView";
import { PaperIntelligenceView } from "../components/intelligence/PaperIntelligenceView";
import { PlaceholderView } from "../components/common/PlaceholderView";
import { SettingsView } from "../components/settings/SettingsView";
import { CreateProjectModal } from "../components/projects/CreateProjectModal";

export default function Home() {
  const { activeTab, activeProject, setActiveProject } = useProject();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardView onOpenCreateModal={() => setCreateModalOpen(true)} />;
      case "projects":
        return <ProjectList onOpenCreateModal={() => setCreateModalOpen(true)} />;
      case "upload":
        return <MultiPdfUpload />;
      case "papers":
        return <ResearchPapersView />;
      case "intelligence":
        return (
          <PaperIntelligenceView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "summaries":
        return (
          <PlaceholderView
            title="Grounded Research Summaries"
            phase="Phase 3"
            description="Evidence-first scientific summarization. Every paragraph is linked to source document chunks with verifiable token attribution and quotation checks."
            features={[
              "Executive research abstract synthesis",
              "Methodological comparison summaries",
              "Zero-hallucination attribution checks",
              "Exportable structured summaries"
            ]}
          />
        );
      case "synthesis":
        return (
          <PlaceholderView
            title="Cross-Paper Synthesis & Disagreement Engine"
            phase="Phase 3"
            description="Multi-document cross-paper synthesis exposing consensus areas, methodological divergences, and contextual nuances between contrasting publications."
            features={[
              "Multi-paper consensus aggregation",
              "Contextual disagreement isolation (varying datasets/metrics)",
              "Comparative methodology analysis",
              "Nuance-aware variable correlation"
            ]}
          />
        );
      case "claims":
        return (
          <PlaceholderView
            title="Claim Verification Center"
            phase="Phase 4"
            description="Atomic claim decomposition engine categorizing propositions into Supported, Contradicted, and Unresolved verdicts with strict evidence thresholds."
            features={[
              "Atomic claim decomposition (Subject-Predicate-Object)",
              "Tri-state verification (Supported, Contradicted, Unresolved)",
              "Deterministic citation & substring validation",
              "Exact character offset mapping"
            ]}
          />
        );
      case "evidence":
        return (
          <PlaceholderView
            title="Interactive PDF Evidence Explorer"
            phase="Phase 4"
            description="Split-screen dual-canvas PDF viewer synchronizing verified claims directly to physical bounding boxes on the original academic paper pages."
            features={[
              "Split-screen responsive PDF canvas",
              "Real-time bounding box highlight overlays",
              "Bidirectional citation clicking",
              "Physical page token alignment"
            ]}
          />
        );
      case "matrix":
        return (
          <PlaceholderView
            title="Evidence Comparison Matrix"
            phase="Phase 4"
            description="Interactive comparison matrix aligning uploaded papers across user-selected dimensions (Architecture, Dataset, Accuracy, Compute, Limitations)."
            features={[
              "Dynamic dimension headers",
              "Paper-by-paper cell comparison",
              "Evidence quote tooltips with page pointers",
              "Interactive heatmap & filtering"
            ]}
          />
        );
      case "gaps":
        return (
          <PlaceholderView
            title="Research Gap Explorer"
            phase="Phase 5"
            description="Identifies actionable research gap suggestions grounded strictly in author-stated limitations across the ingested paper corpus."
            features={[
              "Limitation-grounded gap synthesis",
              "Hypothesis generation with provenance",
              "Explicit distinction between fact & suggestion",
              "Methodological extension recommendations"
            ]}
          />
        );
      case "numerical":
        return (
          <PlaceholderView
            title="Numerical Truth & Consistency Detector"
            phase="Phase 5"
            description="Specialized numeric consistency auditor verifying mathematical statements, percentage points vs relative percentages, and overgeneralization risks."
            features={[
              "Decimal-based mathematical auditing",
              "Baseline & unit mismatch detection",
              "Percentage vs percentage-point verification",
              "Overgeneralization score calculation"
            ]}
          />
        );
      case "benchmarks":
        return (
          <PlaceholderView
            title="Evaluation & Organizer Benchmark Suite"
            phase="Phase 6"
            description="Automated benchmarking harness running against organizer-provided evaluation datasets to measure precision, recall, and citation faithfulness."
            features={[
              "Organizer dataset compatibility",
              "Top-K retrieval recall & MRR",
              "Deterministic citation faithfulness benchmark",
              "Automated metrics scorecards"
            ]}
          />
        );
      case "provenance":
        return (
          <PlaceholderView
            title="Evidence Provenance Ledger"
            phase="Phase 6"
            description="Immutable audit ledger recording the lineage and verification history of every claim, passage, and synthesis output."
            features={[
              "Cryptographic hash validation",
              "Passage ownership verification",
              "Tamper-proof audit trails",
              "Timeline of claim verification"
            ]}
          />
        );
      case "audit":
        return (
          <PlaceholderView
            title="Export & Audit Reports"
            phase="Phase 6"
            description="Export comprehensive scientific audit dossiers in Markdown, JSON, and PDF formats for academic peer review and technical auditing."
            features={[
              "Full provenance export",
              "Verified vs contradicted breakdown",
              "Citation faithfulness scorecard",
              "Peer-review ready reporting"
            ]}
          />
        );
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView onOpenCreateModal={() => setCreateModalOpen(true)} />;
    }
  };

  return (
    <AppLayout>
      {renderContent()}
      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
    </AppLayout>
  );
}

