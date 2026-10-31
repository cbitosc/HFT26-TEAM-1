"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Project } from "../types";
import { fetchProjects } from "../lib/api";

interface ProjectContextType {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  projects: Project[];
  isLoadingProjects: boolean;
  refetchProjects: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<string>("projects");

  const {
    data: projects = [],
    isLoading: isLoadingProjects,
    refetch: refetchProjects
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects
  });

  // Restore active project from localStorage on initial load
  useEffect(() => {
    const savedId = localStorage.getItem("veritas_active_project_id");
    if (savedId && projects.length > 0) {
      const found = projects.find((p) => p.id === savedId);
      if (found) {
        setActiveProjectState(found);
      }
    }
  }, [projects]);

  const setActiveProject = (project: Project | null) => {
    setActiveProjectState(project);
    if (project) {
      localStorage.setItem("veritas_active_project_id", project.id);
    } else {
      localStorage.removeItem("veritas_active_project_id");
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        setActiveProject,
        activeTab,
        setActiveTab,
        projects,
        isLoadingProjects,
        refetchProjects
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}

