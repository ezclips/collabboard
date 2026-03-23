// components/collabboard/canvas/PadletComponent.tsx
"use client";

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Edit3, Trash2, Save, X } from 'lucide-react';
import PostCardContent from '@/components/collabboard/PostCardContent';

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

interface PadletComponentProps {
  padlet: Padlet;
  onUpdate: (padletId: string, updates: Partial<Padlet>) => void;
  onDelete: (padletId: string) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  isDraggable?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function PadletComponent({
  padlet,
  onUpdate,
  onDelete,
  isSelected = false,
  onSelect,
  isDraggable = false,
  style = {},
  className = ''
}: PadletComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [tempTitle, setTempTitle] = useState(padlet.title);
  const [tempContent, setTempContent] = useState(padlet.content);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const padletRef = useRef<HTMLDivElement>(null);

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDraggable || isEditing) return;

    const rect = padletRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });

    // Prevent text selection while dragging
    e.preventDefault();
  };

  // Handle drag move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      if (padletRef.current) {
        padletRef.current.style.transform = `translate(${newX - padlet.position_x}px, ${newY - padlet.position_y}px)`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Update position in database
      onUpdate(padlet.id, {
        position_x: Math.max(0, newX),
        position_y: Math.max(0, newY)
      });

      // Reset drag state
      setIsDragging(false);
      if (padletRef.current) {
        padletRef.current.style.transform = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, padlet.position_x, padlet.position_y, padlet.id, onUpdate]);

  const handleSave = () => {
    if (tempTitle.trim() !== padlet.title || tempContent.trim() !== padlet.content) {
      onUpdate(padlet.id, {
        title: tempTitle.trim(),
        content: tempContent.trim()
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempTitle(padlet.title);
    setTempContent(padlet.content);
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this padlet?')) {
      onDelete(padlet.id);
    }
    setShowMenu(false);
  };

  const baseStyles: React.CSSProperties = {
    position: 'absolute',
    left: padlet.position_x,
    top: padlet.position_y,
    width: padlet.width,
    minHeight: padlet.height,
    ...style
  };

  return (
    <div
      ref={padletRef}
      style={baseStyles}
      className={`
        bg-white rounded-lg shadow-sm border border-gray-200 
        ${isDraggable ? 'cursor-move' : 'cursor-pointer'}
        ${isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}
        ${isDragging ? 'z-50 shadow-xl' : ''}
        transition-shadow duration-200
        ${className}
      `}
      onClick={onSelect}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        {isEditing ? (
          <input
            type="text"
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            className="flex-1 text-sm font-medium bg-transparent border-none focus:outline-none"
            placeholder="Padlet title..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
          />
        ) : (
          <h4 className="text-sm font-medium text-gray-800 truncate">
            {padlet.title}
          </h4>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
              >
                <Save className="w-3 h-3" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              >
                <MoreHorizontal className="w-3 h-3" />
              </button>

              {showMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 min-w-24">
                  <button
                    onClick={handleEdit}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {isEditing ? (
          <textarea
            value={tempContent}
            onChange={(e) => setTempContent(e.target.value)}
            className="w-full text-sm text-gray-600 bg-transparent border-none focus:outline-none resize-none"
            rows={3}
            placeholder="Enter content..."
          />
        ) : (
          <div className="text-sm text-gray-600">
            <PostCardContent padlet={padlet as any} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pb-2">
        <div className="text-xs text-gray-400">
          {new Date(padlet.created_at).toLocaleDateString()}
        </div>
      </div>

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}