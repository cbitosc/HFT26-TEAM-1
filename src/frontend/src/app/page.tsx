"use client";

import React, { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { useProject } from "../context/ProjectContext";
import { DashboardView } from "../components/dashboard/DashboardView";
import { ProjectList } from "../components/projects/ProjectList";
import { MultiPdfUpload } from "../components/papers/MultiPdfUpload";
import { ResearchPapersView } from "../components/papers/ResearchPapersView";
import { PaperIntelligenceView } from "../components/intelligence/PaperIntelligenceView";
import { ResearchSummariesView } from "../components/summaries/ResearchSummariesView";
import { CrossPaperSynthesisView } from "../components/synthesis/CrossPaperSynthesisView";
import { ClaimVerificationView } from "../components/claims/ClaimVerificationView";
import { EvidenceExplorerView } from "../components/evidence/EvidenceExplorerView";
import { ResearchGapExplorerView } from "../components/gaps/ResearchGapExplorerView";
import { ProvenanceLedgerView } from "../components/ledger/ProvenanceLedgerView";
import { NumericalTruthAuditView } from "../components/audit/NumericalTruthAuditView";
import { EvaluationBenchmarkView } from "../components/evaluation/EvaluationBenchmarkView";
import { ExportAuditView } from "../components/export/ExportAuditView";
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
          <ResearchSummariesView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "synthesis":
        return (
          <CrossPaperSynthesisView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "claims":
        return (
          <ClaimVerificationView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "evidence":
        return (
          <EvidenceExplorerView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "matrix":
        return (
          <EvidenceExplorerView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "gaps":
        return (
          <ResearchGapExplorerView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "numerical":
        return (
          <NumericalTruthAuditView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "benchmarks":
        return (
          <EvaluationBenchmarkView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "provenance":
        return (
          <ProvenanceLedgerView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "audit":
        return (
          <ExportAuditView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
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

