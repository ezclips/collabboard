// components/canvas/layouts/WallLayout.tsx

import React from "react";
import WallContainerCard from "../wall/WallContainerCard";

import { Padlet } from "@/types/collabboard";

type WallLayoutProps = {
  padlets: Padlet[];
  selectedPadletId: string | null;
  onSelect: (id: string) => void;
  onOpen: (padlet: Padlet) => void;

  wallDraggingId: string | null;
  wallDragOverIndex: number | null;
  setWallDraggingId: (id: string | null) => void;
  setWallDragOverIndex: (index: number | null) => void;
  handleWallReorder: (draggedId: string, targetIndex: number) => void;

  // New props for Container-as-Standard Pick Mode
  wallPlacementMode: 'idle' | 'pickExistingContainer';
  onContainerPick: (containerId: string) => void;
  onHoverContainer?: (containerId: string | null) => void;
  wallActiveContainerTargetId?: string | null;
  onContextMenu?: (e: React.MouseEvent, padletId: string) => void;
};

export default function WallLayout({
  padlets,
  selectedPadletId,
  onSelect,
  onOpen,
  wallDraggingId,
  wallDragOverIndex,
  setWallDraggingId,
  setWallDragOverIndex,
  handleWallReorder,
  wallPlacementMode,
  onContainerPick,
  onHoverContainer,
  wallActiveContainerTargetId,
  onContextMenu,
}: WallLayoutProps) {
  // Step 1: Build container/child relationship
  const rootContainers = padlets.filter(p => p.type === 'container' && !p.metadata?.parentId);
  const childPosts = padlets.filter(p => p.metadata?.parentId);
  const childrenByContainerId: Record<string, Padlet[]> = {};
  childPosts.forEach(child => {
    const parentId = child.metadata?.parentId;
    if (!parentId) return;
    if (!childrenByContainerId[parentId]) childrenByContainerId[parentId] = [];
    childrenByContainerId[parentId].push(child);
  });
  // Sort children by position or created_at
  Object.values(childrenByContainerId).forEach(childrenArr => {
    childrenArr.sort((a, b) => {
      if (a.position_x !== undefined && b.position_x !== undefined) {
        return a.position_x - b.position_x;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  });

  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden px-6 py-6">
      <div
        className="grid gap-4 content-start justify-center w-full"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        {/* Render containers as cards, others as normal */}
        {rootContainers.map((container, index) => {
          const isPickTarget = wallPlacementMode === 'pickExistingContainer' && wallActiveContainerTargetId === container.id;
          const isPickMode = wallPlacementMode === 'pickExistingContainer';
          return (
            <WallContainerCard
              key={container.id}
              container={container}
              childrenPosts={childrenByContainerId[container.id] || []}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              isPickMode={isPickMode}
              isPickTarget={isPickTarget}
              onClick={isPickMode ? () => onContainerPick(container.id) : undefined}
            />
          );
        })}
        {/* Optionally render non-container padlets if needed (should not exist in Wall layout) */}
      </div>
    </div>
  );
}
