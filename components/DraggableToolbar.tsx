// DraggableToolbar.tsx - Simple drag & drop padlet creation
'use client';

import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Link, 
  CheckSquare, 
  Columns, 
  Image, 
  Upload, 
  Palette,
  Calendar,
  Music,
  MapPin,
  Video,
  Table,
  Type
} from 'lucide-react';

interface ToolbarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  type: 'text' | 'link' | 'todo' | 'column' | 'image' | 'file' | 'color' | 'date' | 'audio' | 'map' | 'video' | 'table' | 'heading';
  color: string;
}

interface DraggableToolbarProps {
  onCreatePadlet: (type: string, position?: { x: number; y: number }) => void;
  onEnhancePadlet?: (padletId: string, type: string) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  respectLayout?: boolean;
}

const toolbarItems: ToolbarItem[] = [
  { id: 'note', icon: <FileText size={20} />, label: 'Note', type: 'text', color: 'bg-blue-100 hover:bg-blue-200' },
  { id: 'link', icon: <Link size={20} />, label: 'Link', type: 'link', color: 'bg-purple-100 hover:bg-purple-200' },
  { id: 'todo', icon: <CheckSquare size={20} />, label: 'To-do', type: 'todo', color: 'bg-green-100 hover:bg-green-200' },
  { id: 'column', icon: <Columns size={20} />, label: 'Column', type: 'column', color: 'bg-gray-100 hover:bg-gray-200' },
  { id: 'image', icon: <Image size={20} />, label: 'Add image', type: 'image', color: 'bg-pink-100 hover:bg-pink-200' },
  { id: 'upload', icon: <Upload size={20} />, label: 'Upload', type: 'file', color: 'bg-yellow-100 hover:bg-yellow-200' },
  { id: 'color', icon: <Palette size={20} />, label: 'Color', type: 'color', color: 'bg-red-100 hover:bg-red-200' },
  { id: 'date', icon: <Calendar size={20} />, label: 'Due date', type: 'date', color: 'bg-orange-100 hover:bg-orange-200' },
  { id: 'audio', icon: <Music size={20} />, label: 'Audio', type: 'audio', color: 'bg-indigo-100 hover:bg-indigo-200' },
  { id: 'map', icon: <MapPin size={20} />, label: 'Map', type: 'map', color: 'bg-teal-100 hover:bg-teal-200' },
  { id: 'video', icon: <Video size={20} />, label: 'Video', type: 'video', color: 'bg-cyan-100 hover:bg-cyan-200' },
  { id: 'table', icon: <Table size={20} />, label: 'Table', type: 'table', color: 'bg-lime-100 hover:bg-lime-200' },
  { id: 'heading', icon: <Type size={20} />, label: 'Heading', type: 'heading', color: 'bg-slate-100 hover:bg-slate-200' },
];

export const DraggableToolbar: React.FC<DraggableToolbarProps> = ({
  onCreatePadlet,
  onEnhancePadlet,
  canvasRef,
  respectLayout = true
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState<ToolbarItem | null>(null);
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [hoveredPadlet, setHoveredPadlet] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, item: ToolbarItem) => {
    setIsDragging(true);
    setDraggedItem(item);
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Create custom drag image
    const dragImage = document.createElement('div');
    dragImage.className = `${item.color} p-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium`;
    dragImage.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 50, 25);
    
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedItem(null);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current || !draggedItem) return;

    // Check if we're dropping onto an existing padlet
    const target = e.target as HTMLElement;
    const padletElement = target.closest('.padlet');
    
    if (padletElement && onEnhancePadlet) {
      // Enhance existing padlet
      const padletId = padletElement.getAttribute('data-padlet-id');
      if (padletId) {
        console.log(`🔧 Enhancing padlet ${padletId} with ${draggedItem.label}`);
        onEnhancePadlet(padletId, draggedItem.type);
        setDraggedItem(null);
        setHoveredPadlet(null);
        return;
      }
    }

    // Create new padlet
    if (respectLayout) {
      console.log(`🎯 Creating ${draggedItem.label} with layout positioning`);
      onCreatePadlet(draggedItem.type);
    } else {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const position = {
        x: e.clientX - canvasRect.left - 140,
        y: e.clientY - canvasRect.top - 100
      };
      console.log(`🎯 Creating ${draggedItem.label} at exact position:`, position);
      onCreatePadlet(draggedItem.type, position);
    }
    
    setDraggedItem(null);
    setHoveredPadlet(null);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    
    // Highlight padlet being hovered over
    const target = e.target as HTMLElement;
    const padletElement = target.closest('.padlet');
    const padletId = padletElement?.getAttribute('data-padlet-id');
    setHoveredPadlet(padletId || null);
  };

  return (
    <>
      {/* Floating Toolbar Toggle */}
      <button
        onClick={() => setIsToolbarOpen(!isToolbarOpen)}
        className="fixed top-1/2 left-4 -translate-y-1/2 w-12 h-12 bg-white border border-gray-300 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-50"
        title="Toggle Toolbar"
      >
        <span className="text-xl">{isToolbarOpen ? '←' : '→'}</span>
      </button>

      {/* Sidebar Toolbar - Scrollable without scrollbars */}
      <div className={`fixed top-1/2 -translate-y-1/2 transition-all duration-300 z-40 ${
        isToolbarOpen ? 'left-20' : '-left-96'
      }`}>
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-24 max-h-[80vh]">
          {/* Scrollable container without scrollbars */}
          <div 
            className="overflow-y-auto overflow-x-hidden scrollbar-hide space-y-2 max-h-[calc(80vh-24px)]"
            style={{
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE and Edge */
            }}
            onWheel={(e) => {
              // Enable smooth scrolling with mouse wheel
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            <style jsx>{`
              .scrollbar-hide::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            
            {toolbarItems.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onDragEnd={handleDragEnd}
                className={`${item.color} p-3 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-105 flex flex-col items-center gap-1 group`}
                title={item.label}
              >
                <div className="text-gray-700 group-hover:text-gray-900">
                  {item.icon}
                </div>
                <span className="text-xs font-medium text-gray-600 group-hover:text-gray-800 text-center leading-tight">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas Drop Zone Overlay */}
      {isDragging && (
        <div
          className="fixed inset-0 z-30 pointer-events-none"
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
          style={{ pointerEvents: isDragging ? 'auto' : 'none' }}
        >
          <div className="absolute inset-0 bg-blue-50 bg-opacity-50 border-2 border-dashed border-blue-300 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <div className="flex items-center gap-3 text-blue-600">
                {draggedItem?.icon}
                <span className="font-semibold">
                  {hoveredPadlet 
                    ? `Add ${draggedItem?.label} to padlet` 
                    : `Drop to create ${draggedItem?.label}`
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      {isToolbarOpen && (
        <div className="fixed bottom-4 left-4 bg-black text-white px-4 py-2 rounded-lg text-sm z-50">
          👆 Drag to canvas to create • Drag to existing padlet to enhance • Scroll to see more
        </div>
      )}
    </>
  );
};

export default DraggableToolbar;