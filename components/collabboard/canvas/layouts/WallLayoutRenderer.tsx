// components/collabboard/canvas/layouts/WallLayoutRenderer.tsx
"use client";

import { memo, useState, useEffect, useRef } from 'react';
import { PadletComponent } from '../PadletComponent';
import type { Padlet } from '@/types/collabboard';

interface WallLayoutRendererProps {
  padlets: Padlet[];
  onUpdatePadlet: (padletId: string, updates: Partial<Padlet>) => void;
  onDeletePadlet: (padletId: string) => void;
  onAddPadlet: (padletData: Partial<Padlet>) => void;
  canvasSize: { width: number; height: number };
  currentUser: any;
}

function WallLayoutRendererBase({
  padlets,
  onUpdatePadlet,
  onDeletePadlet,
  onAddPadlet,
  canvasSize,
  currentUser
}: WallLayoutRendererProps) {
  const [selectedPadlet, setSelectedPadlet] = useState<string | null>(null);
  const [layoutedPadlets, setLayoutedPadlets] = useState<Padlet[]>([]);
  const layoutSyncedRef = useRef(false);

  // Calculate wall layout positions
  useEffect(() => {
    layoutSyncedRef.current = false;
    if (padlets.length === 0) {
      setLayoutedPadlets([]);
      return;
    }

    const COLUMN_WIDTH = 250;
    const PADDING = 20;
    const containerWidth = canvasSize.width || 1200;
    const columnsCount = Math.floor((containerWidth - PADDING * 2) / (COLUMN_WIDTH + PADDING));
    
    // Initialize columns array
    const columns: { height: number; padlets: Padlet[] }[] = Array(columnsCount)
      .fill(null)
      .map(() => ({ height: PADDING, padlets: [] }));

    // Sort padlets by creation date
    const sortedPadlets = [...padlets].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Place padlets in columns (masonry style)
    const updatedPadlets = sortedPadlets.map((padlet) => {
      // Find the column with the least height
      const shortestColumnIndex = columns.reduce(
        (minIndex, column, index) =>
          column.height < columns[minIndex].height ? index : minIndex,
        0
      );

      const column = columns[shortestColumnIndex];
      const x = PADDING + shortestColumnIndex * (COLUMN_WIDTH + PADDING);
      const y = column.height;

      // Calculate dynamic height based on content
      const baseHeight = 150;
      const contentLines = (padlet.content || '').split('\n').length;
      const titleLines = Math.ceil(padlet.title.length / 30);
      const dynamicHeight = Math.max(baseHeight, (contentLines + titleLines) * 20 + 80);

      // Update column height
      column.height += dynamicHeight + PADDING;
      column.padlets.push(padlet);

      return {
        ...padlet,
        position_x: x,
        position_y: y,
        width: COLUMN_WIDTH,
        height: dynamicHeight
      };
    });

    setLayoutedPadlets(updatedPadlets);
  }, [padlets, canvasSize.width]);

  // Update positions in database when layout changes
  useEffect(() => {
    if (layoutSyncedRef.current) return;
    layoutSyncedRef.current = true;
    layoutedPadlets.forEach((layoutedPadlet) => {
      const originalPadlet = padlets.find(p => p.id === layoutedPadlet.id);
      if (
        originalPadlet &&
        (originalPadlet.position_x !== layoutedPadlet.position_x ||
         originalPadlet.position_y !== layoutedPadlet.position_y ||
         originalPadlet.width !== layoutedPadlet.width ||
         originalPadlet.height !== layoutedPadlet.height)
      ) {
        // Update position silently (without re-triggering layout)
        onUpdatePadlet(layoutedPadlet.id, {
          position_x: layoutedPadlet.position_x,
          position_y: layoutedPadlet.position_y,
          width: layoutedPadlet.width,
          height: layoutedPadlet.height
        });
      }
    });
  }, [layoutedPadlets]);

  return (
    <div className="relative w-full min-h-screen p-5">
      {/* Instructions overlay when empty */}
      {padlets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">🧱</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Wall Layout
            </h3>
            <p className="text-gray-500 mb-4">
              Click the + button to add your first padlet
            </p>
            <div className="text-sm text-gray-400 bg-white/80 backdrop-blur-sm rounded-lg p-3">
              💡 Padlets are automatically arranged in a masonry wall layout
            </div>
          </div>
        </div>
      )}

      {/* Render layouted padlets */}
      {layoutedPadlets.map((padlet) => (
        <PadletComponent
          key={padlet.id}
          padlet={padlet}
          onUpdate={onUpdatePadlet}
          onDelete={onDeletePadlet}
          isSelected={selectedPadlet === padlet.id}
          onSelect={() => setSelectedPadlet(padlet.id)}
          isDraggable={false} // Wall layout auto-positions
        />
      ))}

      {/* Click anywhere to deselect */}
      <div 
        className="absolute inset-0 -z-10"
        onClick={() => setSelectedPadlet(null)}
      />
    </div>
  );
}

export const WallLayoutRenderer = memo(WallLayoutRendererBase);