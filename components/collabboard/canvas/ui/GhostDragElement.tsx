"use client";

import type { NewPostDragState } from '@/types/collabboard';

interface GhostDragElementProps {
  newPostDragState: NewPostDragState;
}

export default function GhostDragElement({ newPostDragState }: GhostDragElementProps) {
  if (!newPostDragState.isActive || !newPostDragState.draft) return null;

  return (
    <div
      className="fixed pointer-events-none z-[9999] opacity-80"
      style={{
        left: newPostDragState.cursor.x - 100,
        top: newPostDragState.cursor.y - 50,
      }}
    >
      <div className="w-[200px] bg-white rounded-xl shadow-2xl border-2 border-indigo-400 p-4">
        <div className="text-xs font-medium text-gray-700 truncate">
          {newPostDragState.draft.kind === 'note' && 'Note'}
          {newPostDragState.draft.kind === 'link' && 'Link'}
          {newPostDragState.draft.kind === 'todo' && 'To-do'}
          {newPostDragState.draft.kind === 'table' && 'Table'}
        </div>
        <div className="text-[10px] text-gray-500 truncate mt-1">
          Drag to a container...
        </div>
      </div>
    </div>
  );
}
