// components/collabboard/canvas/layouts/ColumnsLayoutRenderer.tsx
"use client";

import { useState } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import PostCardContent from '@/components/collabboard/PostCardContent';
import type { Padlet, BoardSection } from '@/types/collabboard';

interface ColumnsLayoutRendererProps {
  padlets: Padlet[];
  sections: BoardSection[];
  onUpdatePadlet: (padletId: string, updates: Partial<Padlet>) => void;
  onDeletePadlet: (padletId: string) => void;
  onAddPadlet: (padletData: Partial<Padlet>) => void;
  canvasSize: { width: number; height: number };
  currentUser: any;
}

export function ColumnsLayoutRenderer({
  padlets,
  sections,
  onUpdatePadlet,
  onDeletePadlet,
  onAddPadlet,
  canvasSize,
  currentUser
}: ColumnsLayoutRendererProps) {
  const [selectedPadlet, setSelectedPadlet] = useState<string | null>(null);
  const [draggedPadlet, setDraggedPadlet] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);

  // Group padlets by column (using position_x to determine column)
  const getPadletsInColumn = (columnIndex: number) => {
    const columnWidth = 300;
    const columnStart = columnIndex * (columnWidth + 20) + 20;
    const columnEnd = columnStart + columnWidth;

    return padlets
      .filter(p => p.position_x >= columnStart && p.position_x < columnEnd)
      .sort((a, b) => a.position_y - b.position_y);
  };

  // Add padlet to specific column
  const addPadletToColumn = (columnIndex: number, padletData: Partial<Padlet>) => {
    const columnWidth = 300;
    const columnX = columnIndex * (columnWidth + 20) + 20;
    const columnPadlets = getPadletsInColumn(columnIndex);
    const nextY = columnPadlets.length > 0
      ? Math.max(...columnPadlets.map(p => p.position_y + p.height)) + 20
      : 80; // Account for column header

    onAddPadlet({
      ...padletData,
      position_x: columnX,
      position_y: nextY,
      width: columnWidth - 20
    });
  };

  // Handle drag and drop
  const handleDragStart = (padletId: string) => {
    setDraggedPadlet(padletId);
  };

  const handleDragOver = (e: React.DragEvent, columnIndex: number) => {
    e.preventDefault();
    setDragOverColumn(columnIndex);
  };

  const handleDrop = (e: React.DragEvent, columnIndex: number) => {
    e.preventDefault();

    if (draggedPadlet) {
      const columnWidth = 300;
      const columnX = columnIndex * (columnWidth + 20) + 20;
      const columnPadlets = getPadletsInColumn(columnIndex);
      const nextY = columnPadlets.length > 0
        ? Math.max(...columnPadlets.map(p => p.position_y + p.height)) + 20
        : 80;

      onUpdatePadlet(draggedPadlet, {
        position_x: columnX,
        position_y: nextY
      });
    }

    setDraggedPadlet(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedPadlet(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex gap-5 p-5 overflow-x-auto min-h-screen">
      {sections.map((section, index) => {
        const columnPadlets = getPadletsInColumn(index);

        return (
          <div
            key={section.id}
            className={`flex-shrink-0 w-80 bg-gray-50 rounded-lg p-4 ${dragOverColumn === index ? 'bg-blue-50 ring-2 ring-blue-300' : ''
              }`}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">{section.title}</h3>
                {section.description && (
                  <p className="text-sm text-gray-500 mt-1">{section.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 bg-gray-200 px-2 py-1 rounded-full">
                  {columnPadlets.length}
                </span>
                <button className="text-gray-400 hover:text-gray-600 p-1">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Column Content */}
            <div className="space-y-3 min-h-32">
              {columnPadlets.map((padlet) => (
                <div
                  key={padlet.id}
                  draggable
                  onDragStart={() => handleDragStart(padlet.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${draggedPadlet === padlet.id ? 'opacity-50' : ''
                    } ${selectedPadlet === padlet.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                  onClick={() => setSelectedPadlet(padlet.id)}
                >
                  {/* Padlet Header */}
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-gray-800 text-sm leading-tight">
                      {padlet.title}
                    </h4>
                    <div className="relative">
                      <button className="text-gray-400 hover:text-gray-600 p-1">
                        <MoreHorizontal className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {/* Padlet Content */}
                  <div className="text-sm text-gray-600 mb-2">
                    <PostCardContent padlet={padlet as any} />
                  </div>
                  {/* Padlet Footer */}
                  <div className="text-xs text-gray-400">
                    {new Date(padlet.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}

              {/* Add Padlet Button */}
              <button
                onClick={() => addPadletToColumn(index, {
                  title: 'New Task',
                  content: ''
                })}
                className="w-full p-3 text-gray-500 hover:text-gray-700 hover:bg-white border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add a card</span>
              </button>
            </div>
          </div>
        );
      })}

      {/* Add New Column Button */}
      <div className="flex-shrink-0 w-80">
        <button className="w-full h-32 bg-gray-100 hover:bg-gray-200 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700">
          <Plus className="w-5 h-5" />
          <span>Add another list</span>
        </button>
      </div>

      {/* Click anywhere to deselect */}
      <div
        className="fixed inset-0 -z-10"
        onClick={() => setSelectedPadlet(null)}
      />
    </div>
  );
}