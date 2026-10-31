"use client";

import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CreateProjectModal } from "../projects/CreateProjectModal";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#F5F7FA] overflow-hidden text-[#172033]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onOpenCreateModal={() => setCreateModalOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  );
}

