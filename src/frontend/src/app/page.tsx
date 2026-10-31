"use client";

import React, { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { AuthPortalView } from "../components/auth/AuthPortalView";
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
import { ValidationCenterView } from "../components/validation/ValidationCenterView";
import { CentralExportHubView } from "../components/export/CentralExportHubView";
import { SettingsView } from "../components/settings/SettingsView";
import { CreateProjectModal } from "../components/projects/CreateProjectModal";
import { Sparkles } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const { activeTab, activeProject, setActiveProject } = useProject();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // If session is being restored from local storage
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold font-serif tracking-tight">VERITAS</h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">Restoring secure research session...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, display full Auth Portal
  if (!isAuthenticated) {
    return <AuthPortalView />;
  }

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
      case "matrix":
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
      case "gaps":
        return (
          <ResearchGapExplorerView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "validation":
      case "benchmarks":
      case "provenance":
        return (
          <ValidationCenterView
            currentProject={activeProject}
            onSelectProject={(p) => setActiveProject(p)}
          />
        );
      case "export":
      case "audit":
        return (
          <CentralExportHubView
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
