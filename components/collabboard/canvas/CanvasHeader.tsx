// components/collabboard/canvas/CanvasHeader.tsx
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Layout, 
  Settings, 
  Share, 
  MoreHorizontal,
  Edit3,
  Save,
  X
} from 'lucide-react';
// --- FIX: Importing types from the central file ---
import { Board } from '@/types/collabboard';
// --- END FIX ---

interface CanvasHeaderProps {
  board: Board;
  onLayoutChange: (layout: string) => void;
  onTitleChange: (title: string) => void;
}

const LAYOUT_OPTIONS = [
  { value: 'wall', label: 'Wall', icon: '🧱' },
  { value: 'columns', label: 'Columns', icon: '📋' },
  { value: 'grid', label: 'Grid', icon: '⚏' },
  { value: 'table', label: 'Table', icon: '📊' },
  { value: 'freeform', label: 'Freeform', icon: '🎨' },
  { value: 'timeline', label: 'Timeline', icon: '📅' },
  { value: 'stream', label: 'Stream', icon: '📜' },
  { value: 'map', label: 'Map', icon: '🗺️' }
];

export function CanvasHeader({ 
  board, 
  onLayoutChange, 
  onTitleChange 
}: CanvasHeaderProps) {
  const router = useRouter();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(board.title);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleTitleSave = () => {
    if (tempTitle.trim() && tempTitle.trim() !== board.title) {
      onTitleChange(tempTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setTempTitle(board.title);
    setIsEditingTitle(false);
  };

  const handleLayoutSelect = (layout: string) => {
    onLayoutChange(layout);
    setShowLayoutPicker(false);
  };

  const currentLayout = LAYOUT_OPTIONS.find(l => l.value === board.layout);

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between relative z-30">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
        
        <div className="h-6 w-px bg-gray-300"></div>
        
        {/* Title */}
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                className="text-lg font-semibold bg-transparent border-b-2 border-blue-500 focus:outline-none min-w-0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') handleTitleCancel();
                }}
                autoFocus
              />
              <button
                onClick={handleTitleSave}
                className="text-green-600 hover:text-green-700 p-1"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={handleTitleCancel}
                className="text-gray-500 hover:text-gray-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-800">
                {board.title}
              </h1>
              <button
                onClick={() => setIsEditingTitle(true)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Layout Picker */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutPicker(!showLayoutPicker)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            <Layout className="w-4 h-4" />
            <span className="hidden sm:inline">
              {currentLayout?.label || 'Layout'}
            </span>
            <span className="text-lg">{currentLayout?.icon}</span>
          </button>
          
          {showLayoutPicker && (
            <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48 z-50">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Layout Options
              </div>
              {LAYOUT_OPTIONS.map((layout) => (
                <button
                  key={layout.value}
                  onClick={() => handleLayoutSelect(layout.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-3 ${
                    board.layout === layout.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                  }`}
                >
                  <span className="text-lg">{layout.icon}</span>
                  <span>{layout.label}</span>
                  {board.layout === layout.value && (
                    <span className="ml-auto text-blue-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Share Button */}
        <button className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors">
          <Share className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>

        {/* More Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          
          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48 z-50">
              <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3">
                <Settings className="w-4 h-4" />
                Canvas Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {(showLayoutPicker || showMoreMenu) && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowLayoutPicker(false);
            setShowMoreMenu(false);
          }}
        />
      )}
    </header>
  );
}
