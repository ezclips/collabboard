"use client";

import { KanbanProvider } from '@/components/kanban-canvas/store';
import { GanttCanvas } from '@/components/gantt-canvas';
import CanvasShareModal from '@/components/collabboard/canvas/ui/CanvasShareModal';
import { canManageWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';

interface GanttShellProps {
  canvasId: string;
  canvasTitle: string;
  currentWorkspaceRole: WorkspaceRole | null;
  onBack: () => void;
}

export default function GanttShell({ canvasId, canvasTitle, currentWorkspaceRole, onBack }: GanttShellProps) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const canManageCanvasShare = canManageWorkspace(currentWorkspaceRole);

  return (
    <div className="h-screen w-full flex overflow-hidden min-w-0">
      <div className="w-14 bg-white border-r flex flex-col items-center py-6 space-y-3 shadow-sm z-20 relative">
        <button
          type="button"
          className="relative cursor-pointer hover:bg-gray-100 rounded p-0.5"
          onClick={onBack}
          title="Back to Dashboard"
        >
          <div className="group relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
              <path fill="#5F6672" fillRule="evenodd" d="m6.646 4.646.708.708-2.147 2.145L13 7.5v1H5.207l2.147 2.146-.708.708L3.293 8z"></path>
            </svg>
            <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
              Dashboard
            </span>
          </div>
        </button>
        <div className="w-6 h-px bg-gray-200" />
        {canManageCanvasShare ? (
          <div className="flex flex-col items-center w-full gap-1">
            <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider leading-none select-none px-1">
              Share
            </span>
            <button
              type="button"
              className="relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-700 transition-all duration-150 hover:bg-slate-100 hover:scale-105"
              onClick={() => setIsShareModalOpen(true)}
              aria-label="Share canvas"
            >
              <div className="group relative flex items-center justify-center">
                <UserPlus size={18} strokeWidth={1.5} />
                <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                  Share canvas
                </span>
              </div>
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <CanvasShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          canvasId={canvasId}
          canvasTitle={canvasTitle}
          currentWorkspaceRole={currentWorkspaceRole}
        />
        <KanbanProvider canvasId={canvasId}>
          <GanttCanvas />
        </KanbanProvider>
      </div>
    </div>
  );
}
