"use client"

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ArrowLeft,
  Loader2,
  Plus,
  Edit2,
  Trash2,
  MoveLeft,
  MoveRight,
  MoreVertical,
  ArrowRight,
  Table,
} from "lucide-react";

// Imports
import IconSelector from "@/components/collabboard/canvas/IconSelector";
import WallpaperSelector from "@/components/collabboard/canvas/WallpaperSelector";
import { layoutTypes as importedLayoutTypes, getLayoutFunction } from "@/lib/collabboard/layouts/layout-functions";
import type { LayoutType, PadletPosition } from "@/lib/collabboard/layouts/layout-functions";
import { useSupabase } from '@/lib/supabase';

// Types
interface WallpaperSelection {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
}

interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

interface ColumnProps {
  id: string;
  title: string;
  items: Padlet[];
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onAddPost: (columnId: string) => void;
  onMove: (columnId: string, direction: 'left' | 'right') => void;
  onAddSection: (direction: 'left' | 'right') => void;
  onEditItem: (item: Padlet) => void;
}

// Column Component (For Kanban/Columns Layout)
const Column: React.FC<ColumnProps> = ({
  id,
  title,
  items,
  onRename,
  onDelete,
  onAddPost,
  onMove,
  onAddSection,
  onEditItem
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(title);

  const handleTitleSave = () => {
    if (editingTitle.trim() && editingTitle.trim() !== title) {
      onRename(id, editingTitle.trim());
    } else {
      setEditingTitle(title);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditingTitle(title);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    setEditingTitle(title);
  }, [title]);

  const handleDeleteSection = () => {
    const itemCount = items.length;
    const message = itemCount > 0
      ? `Are you sure you want to delete "${title}" and its ${itemCount} item(s)?`
      : `Are you sure you want to delete "${title}"?`;

    if (window.confirm(message)) {
      onDelete(id);
    }
  };

  return (
    <div className="flex flex-col w-80 bg-slate-200/80 rounded-lg p-1 mx-2 flex-shrink-0 relative">
      <div className="flex items-center justify-between p-2 text-slate-800">
        {isEditing ? (
          <Input
            type="text"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleKeyDown}
            className="font-bold bg-white border-blue-500 h-8 text-sm"
            autoFocus
          />
        ) : (
          <h3
            className="font-bold text-sm p-1 cursor-pointer hover:text-blue-600"
            onClick={() => setIsEditing(true)}
          >
            {title}
          </h3>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-slate-300/50"
            >
              <MoreVertical size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white border border-gray-200 shadow-lg">
            <DropdownMenuItem onClick={() => onAddPost(id)}>
              <Plus className="mr-2 h-4 w-4" />
              Add post
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Rename section
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAddSection('left')}>
              <MoveLeft className="mr-2 h-4 w-4" />
              New section left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddSection('right')}>
              <MoveRight className="mr-2 h-4 w-4" />
              New section right
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => onMove(id, 'left')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Move section left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(id, 'right')}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Move section right
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleDeleteSection}
              className="text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-grow min-h-[100px] space-y-2 px-1 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white p-3 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onEditItem(item)}
          >
            <h4 className="font-medium text-sm mb-1">{item.title}</h4>
            <p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>
          </div>
        ))}
      </div>

      <Button variant="ghost" onClick={() => onAddPost(id)} className="w-full mt-2 h-9">
        <Plus size={16} />
      </Button>
    </div>
  );
};

// Padlet Editor Modal
const PadletEditorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; content: string }) => void;
  padlet: Padlet | null;
}> = ({ isOpen, onClose, onSave, padlet }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (padlet) {
      setTitle(padlet.title);
      setContent(padlet.content);
    } else {
      setTitle('');
      setContent('');
    }
  }, [padlet]);

  const handleSave = () => {
    if (title.trim() || content.trim()) {
      onSave({ title: title.trim(), content: content.trim() });
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl">
        <DialogHeader className="bg-white/90 rounded-t-lg p-4">
          <DialogTitle className="text-gray-900">{padlet ? 'Edit Post' : 'Create New Post'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 bg-white/90">
          <div>
            <Label htmlFor="padlet-title" className="text-gray-900">Title</Label>
            <Input
              id="padlet-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title"
              onKeyDown={handleKeyDown}
              className="bg-white border-gray-300"
            />
          </div>
          <div>
            <Label htmlFor="padlet-content" className="text-gray-900">Content</Label>
            <textarea
              id="padlet-content"
              className="w-full p-2 border border-gray-300 rounded-md resize-none h-24 bg-white"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter content"
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title.trim() && !content.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Table Layout Component (For Preview)
const TableLayoutPreview: React.FC<{
    columns: ColumnData[];
    onRenameColumn: (id: string, newTitle: string) => void;
    onMoveColumn: (id: string, direction: 'left' | 'right') => void;
    onAddColumn: () => void;
    onEditItem: (item: Padlet, columnId: string) => void;
    onAddItem: (columnId: string, rowIndex: number) => void;
}> = ({ columns, onRenameColumn, onMoveColumn, onAddColumn, onEditItem, onAddItem }) => {
    
    const [editingHeader, setEditingHeader] = useState<string | null>(null);
    const [headerTitle, setHeaderTitle] = useState("");

    const numRows = useMemo(() => {
        if (!columns || columns.length === 0) return 1;
        const maxItems = Math.max(...columns.map(c => c.items.length));
        return Math.max(1, maxItems); // Always show at least one row
    }, [columns]);

    const handleRename = (id: string) => {
        if (headerTitle.trim()) {
            onRenameColumn(id, headerTitle.trim());
        }
        setEditingHeader(null);
    };

    return (
        <div className="p-4 bg-white rounded-lg border w-full">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="border-b">
                        <th className="p-2 w-12"></th>
                        {columns.map((col, colIndex) => (
                            <th key={col.id} className="p-2 text-left font-semibold text-sm text-gray-700">
                                <div className="flex items-center gap-2">
                                    {editingHeader === col.id ? (
                                        <Input
                                            value={headerTitle}
                                            onChange={(e) => setHeaderTitle(e.target.value)}
                                            onBlur={() => handleRename(col.id)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleRename(col.id)}
                                            autoFocus
                                            className="h-8"
                                        />
                                    ) : (
                                        <span className="p-1">{col.title}</span>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                                <MoreVertical size={16} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => { setEditingHeader(col.id); setHeaderTitle(col.title); }}>
                                                <Edit2 className="mr-2 h-4 w-4" /> Rename Field
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => onMoveColumn(col.id, 'left')}
                                                disabled={colIndex === 0}
                                            >
                                                <ArrowLeft className="mr-2 h-4 w-4" /> Move Left
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => onMoveColumn(col.id, 'right')}
                                                disabled={colIndex === columns.length - 1}
                                            >
                                                <ArrowRight className="mr-2 h-4 w-4" /> Move Right
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </th>
                        ))}
                        <th className="p-2">
                            <Button variant="outline" size="sm" onClick={onAddColumn}>
                                <Plus className="mr-2 h-4 w-4" /> Add Field
                            </Button>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {[...Array(numRows)].map((_, rowIndex) => (
                        <tr key={rowIndex} className="border-b hover:bg-gray-50 group">
                            <td className="p-2 text-center text-gray-500 text-sm">{rowIndex + 1}</td>
                            {columns.map(col => {
                                const item = col.items[rowIndex];
                                return (
                                    <td key={col.id} className="p-0 border-l">
                                        <div 
                                            className="w-full h-24 flex items-center justify-center p-2 text-center cursor-pointer"
                                            onClick={() => item ? onEditItem(item, col.id) : onAddItem(col.id, rowIndex)}
                                        >
                                            {item ? (
                                                <div className="w-full">
                                                    <p className="font-semibold text-sm">{item.title}</p>
                                                    <p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>
                                                </div>
                                            ) : (
                                                <Plus className="text-gray-400 group-hover:text-blue-500" />
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                            <td className="border-l"></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


// Layout Selection Modal Component
const LayoutSelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
  columns: ColumnData[];
  newPostsAtTop: boolean;
  onPreviewEdit: (padlet: Padlet | null, columnId?: string) => void;
  onPreviewAddPost: (columnId: string) => void;
  onPreviewRename: (columnId: string, newTitle: string) => void;
  onPreviewDelete: (columnId: string) => void;
  onPreviewMove: (columnId: string, direction: 'left' | 'right') => void;
  onPreviewAddSection: (baseColumnId: string, direction: 'left' | 'right') => void;
  layoutTypes: any[];
}> = ({
  isOpen,
  onClose,
  selectedLayout,
  onSelect,
  columns,
  newPostsAtTop,
  onPreviewEdit,
  onPreviewAddPost,
  onPreviewRename,
  onPreviewDelete,
  onPreviewMove,
  onPreviewAddSection,
  layoutTypes
}) => {
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewingLayout, setPreviewingLayout] = useState<LayoutType | null>(null);

  const handlePreview = (layoutType: LayoutType) => {
    setPreviewingLayout(layoutType);
    setPreviewModalOpen(true);
  };

  const handleSelectFromPreview = (layoutType: LayoutType) => {
    onSelect(layoutType);
    setPreviewModalOpen(false);
    onClose();
  };
  
  const addTableColumn = () => {
      // This is a simplified handler for the preview
      alert("This would add a new field (column) to the table.");
  };

  const addTableItem = (columnId: string, rowIndex: number) => {
      alert(`This would add a new item to ${columnId} at row ${rowIndex + 1}`);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="!max-w-[85vw] !w-[1200px] max-h-[95vh] bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl" style={{ maxWidth: '85vw', width: '1200px' }}>
          <DialogHeader className="bg-white/90 rounded-t-lg p-6">
            <DialogTitle className="text-gray-900 text-xl">Choose a format</DialogTitle>
            <DialogDescription className="text-gray-600 text-base">
              Select the layout that best fits your content organization needs. Click Preview to see how it works.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-4 p-6 bg-white/90 max-h-[70vh] overflow-y-auto">
            {layoutTypes.map((layoutOption) => {
              const IconComponent = layoutOption.icon;
              const isSelected = selectedLayout === layoutOption.id;

              return (
                <div
                  key={layoutOption.id}
                  className={`border rounded-lg p-4 space-y-3 transition-all bg-white ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-center text-3xl mb-3">
                    <IconComponent size={40} className={isSelected ? 'text-blue-600' : 'text-gray-600'} />
                  </div>

                  <div className="text-center">
                    <h3 className="font-semibold text-base mb-2 text-gray-900">{layoutOption.name}</h3>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{layoutOption.description}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      className="flex-1 h-8 text-sm"
                      onClick={() => {
                        onSelect(layoutOption.id);
                        onClose();
                      }}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-8 text-sm"
                      onClick={() => handlePreview(layoutOption.id)}
                    >
                      Preview
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="!max-w-[99vw] !w-[1800px] max-h-[99vh] overflow-hidden bg-white/95 backdrop-blur-md flex flex-col" style={{ maxWidth: '99vw', width: '1800px' }}>
          {/* Fixed Header */}
          <DialogHeader className="flex-shrink-0 p-6 border-b bg-white/90">
            <div>
              <DialogTitle className="text-gray-900 text-2xl">
                Preview: {layoutTypes.find(l => l.id === previewingLayout)?.name || 'Layout'}
              </DialogTitle>
              <p className="text-gray-600 text-base mt-2">
                {layoutTypes.find(l => l.id === previewingLayout)?.description}
              </p>
            </div>
          </DialogHeader>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-auto p-6 bg-gray-50 min-h-0">
            {previewingLayout === 'columns' ? (
              <div className="flex gap-4 h-full overflow-x-auto p-4 min-h-[600px]">
                {columns.map(col => (
                  <Column
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    items={col.items}
                    onRename={onPreviewRename}
                    onDelete={onPreviewDelete}
                    onAddPost={onPreviewAddPost}
                    onMove={onPreviewMove}
                    onAddSection={(direction) => onPreviewAddSection(col.id, direction)}
                    onEditItem={(item) => onPreviewEdit(item, col.id)}
                  />
                ))}
              </div>
            ) : previewingLayout === 'table' ? (
                <TableLayoutPreview
                    columns={columns}
                    onRenameColumn={onPreviewRename}
                    onMoveColumn={onPreviewMove}
                    onAddColumn={addTableColumn}
                    onEditItem={onPreviewEdit}
                    onAddItem={addTableItem}
                />
            ) : previewingLayout === 'timeline' ? (
              <div className="relative w-full min-h-[600px] p-4 bg-white rounded-lg border overflow-x-auto">
                {(() => {
                  const allPadlets = columns.flatMap(col => col.items);
                  const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

                  if (displayedPadlets.length === 0) {
                    return (
                      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
                        Add some content to see the Timeline layout preview
                      </div>
                    );
                  }

                  return (
                    <div className="relative w-full p-8">
                      <div className="flex items-start gap-12 min-w-max pb-8">
                        <div 
                          className="absolute top-12 h-0.5 bg-gradient-to-r from-blue-400 to-blue-600" 
                          style={{ 
                            left: '80px', 
                            right: '80px',
                            width: `${displayedPadlets.length * 280 - 80}px`
                          }}
                        ></div>
                        
                        {displayedPadlets.map((padlet, index) => (
                          <div key={padlet.id} className="relative flex flex-col items-center min-w-[240px]">
                            <div className="relative z-10 w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg mb-6 flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                            
                            <div
                              className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-[240px] cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-105 relative group"
                              onClick={() => {
                                const sourceColumn = columns.find(col => 
                                  col.items.some(item => item.id === padlet.id)
                                );
                                onPreviewEdit(padlet, sourceColumn?.id);
                              }}
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical size={14} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-white border border-gray-200 shadow-lg">
                                  <DropdownMenuItem onClick={() => {
                                    const sourceColumn = columns.find(col => 
                                      col.items.some(item => item.id === padlet.id)
                                    );
                                    onPreviewEdit(padlet, sourceColumn?.id);
                                  }}>
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit post
                                  </DropdownMenuItem>
                                  
                                  <DropdownMenuSeparator />
                                  
                                  <DropdownMenuItem onClick={() => {
                                    const sourceColumn = columns.find(col => 
                                      col.items.some(item => item.id === padlet.id)
                                    );
                                    if (sourceColumn) {
                                      onPreviewAddPost(sourceColumn.id);
                                    }
                                  }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add post before
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    const sourceColumn = columns.find(col => 
                                      col.items.some(item => item.id === padlet.id)
                                    );
                                    if (sourceColumn) {
                                      onPreviewAddPost(sourceColumn.id);
                                    }
                                  }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add post after
                                  </DropdownMenuItem>
                                  
                                  <DropdownMenuSeparator />
                                  
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      if (window.confirm(`Are you sure you want to delete "${padlet.title}"?`)) {
                                        console.log('Delete padlet:', padlet.id);
                                      }
                                    }}
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete post
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <div className="text-center mb-3">
                                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                  Step {index + 1}
                                </span>
                              </div>
                              <h4 className="font-bold text-gray-900 text-lg mb-3 text-center">
                                {padlet.title}
                              </h4>
                              <p className="text-gray-600 text-sm leading-relaxed text-center">
                                {padlet.content}
                              </p>
                              
                              <div className="mt-4 flex justify-center">
                                <div className="w-8 h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-center mt-8">
                        <Button
                          variant="outline"
                          className="flex items-center gap-2 px-6 py-3 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
                          onClick={() => {
                            if (columns.length > 0) {
                              onPreviewAddPost(columns[0].id);
                            }
                          }}
                        >
                          <Plus size={18} />
                          Add Timeline Item
                        </Button>
                      </div>
                      
                      <div className="flex justify-between mt-6 text-xs text-gray-400 font-medium">
                        <span>Start</span>
                        <span>Timeline Progress</span>
                        <span>End</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : previewingLayout && previewingLayout !== 'columns' && previewingLayout !== 'timeline' ? (
              <div className="relative w-full min-h-[600px] p-4 bg-white rounded-lg border">
                {(() => {
                  const allPadletsForPreview = columns.flatMap(col => col.items);
                  const displayedPadletsForPreview = newPostsAtTop ? [...allPadletsForPreview].reverse() : allPadletsForPreview;

                  if (displayedPadletsForPreview.length === 0) {
                    return (
                      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
                        Add some content to see the {layoutTypes.find(l => l.id === previewingLayout)?.name} layout preview
                      </div>
                    );
                  }

                  const previewWidth = 1400;
                  const previewHeight = 600;
                  const calculatePositions = getLayoutFunction(previewingLayout);

                  let previewPositions;
                  if (previewingLayout === 'wall' || previewingLayout === 'stream') {
                    previewPositions = calculatePositions(displayedPadletsForPreview.length, previewWidth);
                  } else {
                    previewPositions = calculatePositions(displayedPadletsForPreview.length, previewWidth, previewHeight);
                  }

                  return displayedPadletsForPreview.map((padlet, index) => {
                    const pos = previewPositions[index];
                    if (!pos) return null;

                    return (
                      <div
                        key={padlet.id}
                        className="absolute bg-white p-4 rounded-lg shadow-md border hover:shadow-lg transition-shadow cursor-pointer"
                        style={{
                          top: `${pos.top}px`,
                          left: `${pos.left}px`,
                          width: `${pos.width}px`,
                          height: `${pos.height}px`
                        }}
                        onClick={() => {
                          const sourceColumn = columns.find(col =>
                            col.items.some(item => item.id === padlet.id)
                          );
                          onPreviewEdit(padlet, sourceColumn?.id);
                        }}
                      >
                        <h4 className="font-semibold text-base mb-2 text-gray-900">{padlet.title}</h4>
                        <p className="text-sm text-gray-600 leading-relaxed">{padlet.content}</p>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
                Preview for {layoutTypes.find(l => l.id === previewingLayout)?.name} layout
              </div>
            )}
          </div>
          
          {/* Fixed Footer */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 border-t border-gray-200 bg-white">
            <div className="text-gray-600 flex-1 min-w-0">
              <p className="text-base font-medium text-gray-900 truncate">
                {previewingLayout && layoutTypes.find(l => l.id === previewingLayout)?.name} Layout
              </p>
              <p className="text-sm mt-1 text-gray-600">
                {previewingLayout === 'columns' 
                  ? 'Interactive preview - click items to edit and use dropdown menus.'
                  : previewingLayout === 'timeline'
                  ? 'Interactive timeline - click items to edit and arrange chronologically.'
                  : 'Preview shows how content will be arranged with this layout.'
                }
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Button variant="outline" size="lg" onClick={() => setPreviewModalOpen(false)}>
                Back to Selection
              </Button>
              <Button size="lg" onClick={() => previewingLayout && handleSelectFromPreview(previewingLayout)}>
                Select This Layout
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Layout Section Component
const LayoutSection: React.FC<{
  selectedLayout: LayoutType;
  newPostsAtTop: boolean;
  setNewPostsAtTop: (value: boolean) => void;
  onOpenLayoutModal: () => void;
  layoutTypes: any[];
}> = ({ selectedLayout, newPostsAtTop, setNewPostsAtTop, onOpenLayoutModal, layoutTypes }) => {
  const selectedLayoutInfo = layoutTypes.find(l => l.id === selectedLayout);

  return (
    <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
      <CardHeader className="bg-white/90">
        <CardTitle className="text-gray-900">Layout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 bg-white/90" suppressHydrationWarning>
        <div>
          <Label className="text-sm font-medium text-gray-900">Format</Label>
          <Button
            variant="outline"
            onClick={onOpenLayoutModal}
            className="w-full justify-between mt-2 h-12 bg-white border-gray-300"
          >
            <div className="flex items-center gap-3">
              {selectedLayoutInfo && React.createElement(selectedLayoutInfo.icon, { size: 20 })}
              <span className="text-gray-600">{selectedLayoutInfo?.name}</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-900">New Posts at Top</Label>
              <p className="text-xs text-gray-500">Place newest posts at the beginning</p>
            </div>
            <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main Canvas Setup Component
const CanvasSetupPage: React.FC = () => {
  const { supabase } = useSupabase();
  const router = useRouter();

  // Authentication & Loading State
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Canvas Settings
  const [title, setTitle] = useState("My Canvas");
  const [description, setDescription] = useState("A collaborative workspace");
  const [selectedIcon, setSelectedIcon] = useState("🎨");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperSelection>({
    type: 'color',
    value: '#ffffff'
  });
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('wall');

  // Modal States
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [wallpaperDialogOpen, setWallpaperDialogOpen] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPadlet, setEditingPadlet] = useState<Padlet | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

  // Create single deduplicated layoutTypes array
  const layoutTypes = useMemo(() => {
    const baseLayouts = importedLayoutTypes;
    const tableLayout = {
        id: 'table',
        name: 'Table',
        description: 'Organize content in a spreadsheet-like grid.',
        icon: Table,
    };
    const unique = new Map<string, typeof baseLayouts[number] | typeof tableLayout>();
    
    [...baseLayouts, tableLayout].forEach((layout) => {
      if (!unique.has(layout.id)) unique.set(layout.id, layout);
    });

    return Array.from(unique.values());
  }, []);

  // Sample data for preview and columns
  const [columns, setColumns] = useState<ColumnData[]>([
    {
      id: 'column-1',
      title: 'Attachment',
      items: [
        { id: 'item-1', title: 'Map of Berlin', content: 'Image of a map.' },
      ]
    },
    {
      id: 'column-2',
      title: 'Body',
      items: [
        { id: 'item-3', title: 'xcfasdcacasca', content: 'Some details here.' }
      ]
    },
    {
      id: 'column-3',
      title: 'Testing',
      items: [
        { id: 'item-4', title: 'sdsdsdsd', content: 'More details.' }
      ]
    }
  ]);

  // Get current user on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          setUser(profile || session.user);
        }
      } catch (error) {
        console.error('Error getting user:', error);
      }
    };

    getCurrentUser();
    setIsMounted(true);
  }, [supabase]);

  // Supabase Save Function
  const handleSaveCanvas = async () => {
    if (!user) {
      alert('Please log in to save your canvas');
      return;
    }

    setLoading(true);
    try {
      // Create canvas in database
      const { data: canvas, error: canvasError } = await supabase
        .from('boards')
        .insert([
          {
            title: title,
            description: description,
            layout: layout,
            background_type: selectedWallpaper.type,
            background_value: selectedWallpaper.value,
            comments_enabled: commentsEnabled,
            reactions_enabled: false,
            thumbnail: selectedIcon,
            user_id: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (canvasError) {
        throw canvasError;
      }

      // If columns or table layout, save the columns as sections/fields
      if (layout === 'columns' || layout === 'table') {
        const sectionsToInsert = columns.map((column, index) => ({
          board_id: canvas.id,
          title: column.title,
          description: `Column ${index + 1}`,
          position: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: sectionsError } = await supabase
          .from('board_sections')
          .insert(sectionsToInsert);

        if (sectionsError) {
          throw sectionsError;
        }
      }

      alert('Canvas saved successfully!');
      router.push(`/dashboard/canvas/${canvas.id}`);

    } catch (error: any) {
      console.error('Error saving canvas:', error);
      alert('Error saving canvas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Event Handlers
  const handleWallpaperUpdate = (type: string, value: string) => {
    setSelectedWallpaper({
      type: type as WallpaperSelection['type'],
      value
    });
    setWallpaperDialogOpen(false);
  };

  const getCurrentBackground = (): React.CSSProperties => {
    if (selectedWallpaper.type === 'color') {
      return { backgroundColor: selectedWallpaper.value };
    }
    if (selectedWallpaper.type === 'gradient') {
      return { background: selectedWallpaper.value };
    }
    if (selectedWallpaper.value && selectedWallpaper.type === 'image') {
      return {
        backgroundImage: `url("${selectedWallpaper.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      };
    }
    return { backgroundColor: '#f3f4f6' };
  };

  // Column management functions
  const addColumn = (baseColumnId?: string, direction: 'left' | 'right' = 'right') => {
    const newColumn: ColumnData = {
      id: `col-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: "New Field",
      items: []
    };

    if (baseColumnId) {
        const baseIndex = columns.findIndex(col => col.id === baseColumnId);
        if (baseIndex === -1) return;

        const newIndex = direction === 'left' ? baseIndex : baseIndex + 1;
        const newColumns = [...columns];
        newColumns.splice(newIndex, 0, newColumn);
        setColumns(newColumns);
    } else {
        setColumns([...columns, newColumn]);
    }
  };

  const deleteColumn = (columnId: string) => {
    setColumns(columns.filter(col => col.id !== columnId));
  };

  const renameColumn = (columnId: string, newTitle: string) => {
    setColumns(columns.map(col =>
      col.id === columnId ? { ...col, title: newTitle } : col
    ));
  };

  const moveColumn = (columnId: string, direction: 'left' | 'right') => {
    const index = columns.findIndex(col => col.id === columnId);
    if (index === -1) return;

    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;

    const newColumns = [...columns];
    const [removed] = newColumns.splice(index, 1);
    newColumns.splice(newIndex, 0, removed);
    setColumns(newColumns);
  };

  const handleOpenEditor = (padlet: Padlet | null, columnId?: string) => {
    setEditingPadlet(padlet);
    setTargetColumnId(columnId || null);
    setIsEditorOpen(true);
  };

  const handleAddPost = (columnId: string, rowIndex?: number) => {
    setEditingPadlet(null);
    setTargetColumnId(columnId);
    // We can pass rowIndex to the editor if needed in the future
    setIsEditorOpen(true);
  };

  const handleSavePadlet = (padletData: { title: string; content: string }) => {
    if (editingPadlet && targetColumnId) {
      // Editing an existing padlet
      setColumns(columns.map(column => {
          if (column.id !== targetColumnId) return column;
          return {
              ...column,
              items: column.items.map(item =>
                item.id === editingPadlet.id ? { ...item, ...padletData } : item
              )
          }
      }));
    } else if (targetColumnId) {
      // Adding a new padlet
      const newPost: Padlet = {
        id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...padletData
      };
      setColumns(columns.map(column => {
        if (column.id !== targetColumnId) return column;
        
        const newItems = [...column.items];
        // For table, we might need to insert at a specific index, but for now, append.
        newItems.push(newPost);

        return { ...column, items: newItems };
      }));
    }
  };

  const handleOpenLayoutModal = () => {
    setShowLayoutModal(true);
  };

  const handleSelectLayout = (layoutId: LayoutType) => {
    setLayout(layoutId);
    setShowLayoutModal(false);
  };

  // Don't render until mounted to prevent hydration mismatch
  if (!isMounted) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Saving canvas...</span>
      </div>
    );
  }

  return (
    <div style={getCurrentBackground()} className="p-4 transition-all duration-300 min-h-screen" suppressHydrationWarning>
      <div className="max-w-2xl mx-auto space-y-4" suppressHydrationWarning>

        {/* Canvas Settings */}
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Canvas Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 bg-white/90" suppressHydrationWarning>
            <div>
              <Label htmlFor="title" className="text-gray-900">Title</Label>
              <Input
                id="title"
                placeholder="Canvas title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>
            <div>
              <Label htmlFor="description" className="text-gray-900">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>
            <div>
              <Label className="text-gray-900">Icon</Label>
              <Button
                variant="outline"
                onClick={() => setIconDialogOpen(true)}
                className="w-full justify-start bg-white border-gray-300"
              >
                {selectedIcon} Select Icon
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="bg-white/90" suppressHydrationWarning>
            <Label className="text-sm font-medium text-gray-900">Wallpaper</Label>
            <Button
              variant="outline"
              onClick={() => setWallpaperDialogOpen(true)}
              className="w-full justify-between mt-2 h-12 bg-white border-gray-300"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded border"
                  style={(() => {
                    if (selectedWallpaper.type === 'image') {
                      return {
                        backgroundImage: `url("${selectedWallpaper.value}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      };
                    } else if (selectedWallpaper.type === 'gradient') {
                      return {
                        background: selectedWallpaper.value
                      };
                    } else {
                      return {
                        backgroundColor: selectedWallpaper.value || '#ffffff'
                      };
                    }
                  })()}
                />
                <span className="text-gray-600">Current wallpaper</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Layout Section */}
        <LayoutSection
          selectedLayout={layout}
          newPostsAtTop={newPostsAtTop}
          setNewPostsAtTop={setNewPostsAtTop}
          onOpenLayoutModal={handleOpenLayoutModal}
          layoutTypes={layoutTypes}
        />

        {/* Engagement */}
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Engagement</CardTitle>
          </CardHeader>
          <CardContent className="bg-white/90" suppressHydrationWarning>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-900">Comments</Label>
                <p className="text-xs text-gray-500">Allow users to comment on posts</p>
              </div>
              <Switch
                checked={commentsEnabled}
                onCheckedChange={setCommentsEnabled}
              />
            </div>
          </CardContent>
        </Card>

        <div className="pt-4" suppressHydrationWarning>
          <Button
            onClick={handleSaveCanvas}
            className="w-full"
            size="lg"
            disabled={loading || !user}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              `Save Canvas${!user ? ' (Login Required)' : ''}`
            )}
          </Button>
        </div>
      </div>

      {/* Layout Selection Modal */}
      <LayoutSelectionModal
        isOpen={showLayoutModal}
        onClose={() => setShowLayoutModal(false)}
        selectedLayout={layout}
        onSelect={handleSelectLayout}
        columns={columns}
        newPostsAtTop={newPostsAtTop}
        onPreviewEdit={handleOpenEditor}
        onPreviewAddPost={handleAddPost}
        onPreviewRename={renameColumn}
        onPreviewDelete={deleteColumn}
        onPreviewMove={moveColumn}
        onPreviewAddSection={addColumn}
        layoutTypes={layoutTypes}
      />

      {/* Padlet Editor Modal */}
      <PadletEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSavePadlet}
        padlet={editingPadlet}
      />

      {/* Wallpaper Selector */}
      <WallpaperSelector
        isOpen={wallpaperDialogOpen}
        onClose={() => setWallpaperDialogOpen(false)}
        currentSelection={selectedWallpaper}
        onSelect={handleWallpaperUpdate}
      />

      {/* Icon Selector */}
      <IconSelector
        isOpen={iconDialogOpen}
        onClose={() => setIconDialogOpen(false)}
        selectedIcon={selectedIcon}
        onSelect={setSelectedIcon}
      />
    </div>
  );
};

export default CanvasSetupPage;
