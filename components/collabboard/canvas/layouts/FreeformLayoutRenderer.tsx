// components/collabboard/canvas/layouts/FreeformLayoutRenderer.tsx
"use client";

import { useState } from 'react';
import { PadletComponent } from '../PadletComponent';

interface Padlet {
  id: string;
  board_id: string;
  title: string;
  content: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

interface FreeformLayoutRendererProps {
  padlets: Padlet[];
  onUpdatePadlet: (padletId: string, updates: Partial<Padlet>) => void;
  onDeletePadlet: (padletId: string) => void;
  onAddPadlet: (padletData: Partial<Padlet>) => void;
  canvasSize: { width: number; height: number };
  currentUser: any;
}

export function FreeformLayoutRenderer({
  padlets,
  onUpdatePadlet,
  onDeletePadlet,
  onAddPadlet,
  canvasSize,
  currentUser
}: FreeformLayoutRendererProps) {
  const [selectedPadlet, setSelectedPadlet] = useState<string | null>(null);

  return (
    <div 
      className="relative w-full min-h-screen"
      style={{ minHeight: canvasSize.height }}
    >
      {/* Instructions overlay when empty */}
      {padlets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">🎨</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Freeform Canvas
            </h3>
            <p className="text-gray-500 mb-4">
              Double-click anywhere to add a padlet
            </p>
            <div className="text-sm text-gray-400 bg-white/80 backdrop-blur-sm rounded-lg p-3">
              💡 Tip: You can drag padlets anywhere on the canvas
            </div>
          </div>
        </div>
      )}

      {/* Render all padlets */}
      {padlets.map((padlet) => (
        <PadletComponent
          key={padlet.id}
          padlet={padlet}
          onUpdate={onUpdatePadlet}
          onDelete={onDeletePadlet}
          isSelected={selectedPadlet === padlet.id}
          onSelect={() => setSelectedPadlet(padlet.id)}
          isDraggable={true}
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