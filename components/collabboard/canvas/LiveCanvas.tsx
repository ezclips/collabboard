// components/collabboard/canvas/LiveCanvas.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
// --- FIX: Importing types from the central file ---
import { Board, Padlet, BoardSection } from '@/types/collabboard';
// --- END FIX ---
import { ColumnsLayoutRenderer } from './layouts/ColumnsLayoutRenderer';
import { WallLayoutRenderer } from './layouts/WallLayoutRenderer';
import { GridLayoutRenderer } from './layouts/GridLayoutRenderer';
import { FreeformLayoutRenderer } from './layouts/FreeformLayoutRenderer';

interface LiveCanvasProps {
  board: Board;
  padlets: Padlet[];
  sections: BoardSection[];
  onAddPadlet: (padletData: Partial<Padlet>) => void;
  onUpdatePadlet: (padletId: string, updates: Partial<Padlet>) => void;
  onDeletePadlet: (padletId: string) => void;
  currentUser: any;
}

export function LiveCanvas({
  board,
  padlets,
  sections,
  onAddPadlet,
  onUpdatePadlet,
  onDeletePadlet,
  currentUser
}: LiveCanvasProps) {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isAddingPadlet, setIsAddingPadlet] = useState(false);
  const [newPadletPosition, setNewPadletPosition] = useState({ x: 0, y: 0 });

  // Update canvas size on resize
  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight - 120 // Account for header
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Handle double-click to add padlet (for freeform layouts)
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    if (board.layout === 'freeform' || board.layout === 'wall') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setNewPadletPosition({ x, y });
      setIsAddingPadlet(true);
    }
  }, [board.layout]);

  // Handle adding new padlet
  const handleAddPadlet = useCallback((padletData: Partial<Padlet>) => {
    let finalPadletData = { ...padletData };

    // Set position based on layout
    if (board.layout === 'freeform') {
      finalPadletData.position_x = newPadletPosition.x;
      finalPadletData.position_y = newPadletPosition.y;
    } else if (board.layout === 'wall') {
      // Wall layout will auto-position
      finalPadletData.position_x = 0;
      finalPadletData.position_y = 0;
    }

    onAddPadlet(finalPadletData);
    setIsAddingPadlet(false);
  }, [board.layout, newPadletPosition, onAddPadlet]);

  // Generate background style
  const getBackgroundStyle = () => {
    const { background_type, background_value } = board;
    
    switch (background_type) {
      case 'color':
        return { backgroundColor: background_value };
      case 'gradient':
        return { backgroundImage: background_value };
      case 'image':
        return { 
          backgroundImage: `url(${background_value})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };
      default:
        return { backgroundColor: '#f8fafc' };
    }
  };

  // Render layout-specific canvas
  const renderCanvas = () => {
    const commonProps = {
      padlets,
      onUpdatePadlet,
      onDeletePadlet,
      onAddPadlet: handleAddPadlet,
      canvasSize,
      currentUser
    };

    switch (board.layout) {
      case 'columns':
        return (
          <ColumnsLayoutRenderer
            {...commonProps}
            sections={sections}
          />
        );
      
      case 'wall':
        return (
          <WallLayoutRenderer
            {...commonProps}
          />
        );

      case 'grid':
        return (
          <GridLayoutRenderer
            {...commonProps}
          />
        );

      case 'freeform':
        return (
          <FreeformLayoutRenderer
            {...commonProps}
          />
        );
      
      default:
        return (
          <div className="p-8 text-center text-gray-500">
            <p>Unknown layout: {board.layout}</p>
          </div>
        );
    }
  };

  return (
    <div 
      className="relative w-full min-h-screen transition-all duration-300"
      style={getBackgroundStyle()}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <div className="relative z-10">
        {renderCanvas()}
      </div>

      {isAddingPadlet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add New Padlet</h3>
            <QuickAddPadletForm
              onAdd={handleAddPadlet}
              onCancel={() => setIsAddingPadlet(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Quick add padlet form component
function QuickAddPadletForm({ 
  onAdd, 
  onCancel 
}: { 
  onAdd: (data: Partial<Padlet>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd({
        title: title.trim(),
        content: content.trim(),
        width: 200,
        height: 150
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter padlet title..."
          autoFocus
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Enter content..."
        />
      </div>
      
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          disabled={!title.trim()}
        >
          Add Padlet
        </button>
      </div>
    </form>
  );
}