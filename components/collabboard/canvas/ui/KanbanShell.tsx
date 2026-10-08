"use client";

import { KanbanProvider } from '@/components/kanban-canvas/store';
import { KanbanCanvas } from '@/components/kanban-canvas';
import { KanbanGanttSchedulerSplit } from '@/components/scheduler-canvas/KanbanGanttSchedulerSplit';
import {
  KanbanBoardAiBridge,
  KanbanBoardAiContext,
  type KanbanBoardAiBridgeApi,
  type KanbanBoardAiHost,
} from '@/components/kanban-canvas/KanbanBoardAiBridge';
import CanvasShareModal from '@/components/collabboard/canvas/ui/CanvasShareModal';
import { canManageWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import { Bot, UserPlus } from 'lucide-react';
import { useState } from 'react';

interface KanbanShellProps {
  canvasId: string;
  canvasTitle: string;
  enableGantt: boolean;
  enableScheduler: boolean;
  isGanttVisible: boolean;
  isSchedulerVisible: boolean;
  setIsGanttVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSchedulerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  currentWorkspaceRole: WorkspaceRole | null;
  onBack: () => void;
  /* PATCH-323. Board AI on Kanban: the button toggles the drawer CanvasClient
     renders; the bridge connects the drawer's card actions to this store. */
  boardAiEnabled?: boolean;
  isBoardAiChatOpen?: boolean;
  onToggleBoardAiChat?: () => void;
  boardAiHost?: KanbanBoardAiHost | null;
  onBoardAiBridgeReady?: (api: KanbanBoardAiBridgeApi | null) => void;
}

/** The Board AI drawer's own max width, so the Kanban area yields exactly it. */
const BOARD_AI_PANEL_WIDTH = 420;

export default function KanbanShell({
  canvasId,
  canvasTitle,
  enableGantt,
  enableScheduler,
  isGanttVisible,
  isSchedulerVisible,
  setIsGanttVisible,
  setIsSchedulerVisible,
  currentWorkspaceRole,
  onBack,
  boardAiEnabled = false,
  isBoardAiChatOpen = false,
  onToggleBoardAiChat,
  boardAiHost = null,
  onBoardAiBridgeReady,
}: KanbanShellProps) {
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
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path fill="#5F6672" fillRule="evenodd" d="m6.646 4.646.708.708-2.147 2.145L13 7.5v1H5.207l2.147 2.146-.708.708L3.293 8z"></path>
          </svg>
        </button>
        <div className="w-6 h-px bg-gray-200" />
        {/* PATCH-323. The Board AI entry point, in the rail so it covers no
            Kanban control. Available to every reader who can open the board,
            exactly as on Freeform. */}
        {boardAiEnabled ? (
          <button
            type="button"
            data-board-ai-button="true"
            aria-label="Board AI"
            title="Board AI"
            aria-pressed={isBoardAiChatOpen}
            onClick={onToggleBoardAiChat}
            className="relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-700 transition-all duration-150 hover:bg-slate-100 hover:scale-105"
          >
            <div className="group relative flex items-center justify-center">
              <Bot size={18} strokeWidth={1.5} />
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                Board AI
              </span>
            </div>
          </button>
        ) : null}
        {enableGantt ? (
          <button
            type="button"
            className="relative flex flex-col items-center p-2 rounded-lg transition-all duration-200 cursor-pointer bg-transparent hover:bg-blue-100 hover:ring-2 hover:ring-blue-300"
            onClick={() => setIsGanttVisible((current) => !current)}
            title={isGanttVisible ? 'Hide Gantt' : 'Show Gantt'}
            aria-label={isGanttVisible ? 'Hide Gantt' : 'Show Gantt'}
          >
            <div className="group relative w-8 h-8 flex items-center justify-center">
              <span className="flex w-8 h-8 items-center justify-center rounded-md border border-gray-300 bg-white text-[11px] font-semibold leading-none tabular-nums text-gray-700">
                {isGanttVisible ? 'G-' : 'G+'}
              </span>
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                {isGanttVisible ? 'Hide Gantt' : 'Show Gantt'}
              </span>
            </div>
          </button>
        ) : null}
        {enableScheduler ? (
          <button
            type="button"
            className="relative flex flex-col items-center p-2 rounded-lg transition-all duration-200 cursor-pointer bg-transparent hover:bg-blue-100 hover:ring-2 hover:ring-blue-300"
            onClick={() => setIsSchedulerVisible((current) => !current)}
            title={isSchedulerVisible ? 'Hide Scheduler' : 'Show Scheduler'}
            aria-label={isSchedulerVisible ? 'Hide Scheduler' : 'Show Scheduler'}
          >
            <div className="group relative w-8 h-8 flex items-center justify-center">
              <span className="flex w-8 h-8 items-center justify-center rounded-md border border-gray-300 bg-white text-[11px] font-semibold leading-none tabular-nums text-gray-700">
                {isSchedulerVisible ? 'S-' : 'S+'}
              </span>
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                {isSchedulerVisible ? 'Hide Scheduler' : 'Show Scheduler'}
              </span>
            </div>
          </button>
        ) : null}
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

      <div
        data-kanban-board-area="true"
        className="flex-1 min-w-0 min-h-0 overflow-hidden"
        /* While the drawer is open, the board yields its width rather than
           sitting under it -- the board scrolls horizontally anyway, so a
           reserved strip costs nothing that a fixed overlay would not. */
        style={{ paddingRight: isBoardAiChatOpen ? BOARD_AI_PANEL_WIDTH : undefined }}
      >
        <CanvasShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          canvasId={canvasId}
          canvasTitle={canvasTitle}
          currentWorkspaceRole={currentWorkspaceRole}
        />
        <KanbanProvider canvasId={canvasId}>
          {/* The bridge and the host context must both be INSIDE the provider:
              the bridge uses the store, and the context reaches the card menu
              several components below. */}
          <KanbanBoardAiContext.Provider value={boardAiHost}>
            <KanbanBoardAiBridge onRegister={onBoardAiBridgeReady} />
            {(enableGantt || enableScheduler) ? (
              <KanbanGanttSchedulerSplit
                canvasId={canvasId}
                showGantt={enableGantt && isGanttVisible}
                showScheduler={enableScheduler && isSchedulerVisible}
              />
            ) : (
              <KanbanCanvas canvasId={canvasId} />
            )}
          </KanbanBoardAiContext.Provider>
        </KanbanProvider>
      </div>
    </div>
  );
}
