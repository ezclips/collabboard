"use client"

import React, { useState, useEffect } from "react";
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
} from "lucide-react";

// CORRECTED IMPORTS - Using your actual file structure
import IconSelector from "@/components/collabboard/canvas/IconSelector";
import WallpaperSelector from "@/components/collabboard/canvas/WallpaperSelector";
import { getLayoutFunction } from "@/lib/collabboard/layouts/layout-functions";
import type { LayoutType, PadletPosition } from "@/lib/collabboard/layouts/layout-functions";
import { 
  Grid, 
  Columns, 
  Table, 
  MapPin, 
  Activity, 
  List, 
  Move 
} from "lucide-react";

// Temporarily hardcode layoutTypes to avoid duplicate keys
const layoutTypes = [
  {
    id: 'wall' as LayoutType,
    name: 'Wall',
    description: 'Arrange content in a brick-like formation.',
    icon: Grid
  },
  {
    id: 'columns' as LayoutType,
    name: 'Columns',
    description: 'Organize content in columns.',
    icon: Columns
  },
  {
    id: 'grid' as LayoutType,
    name: 'Grid',
    description: 'Arrange content in a uniform grid.',
    icon: Grid
  },
  {
    id: 'table' as LayoutType,
    name: 'Table',
    description: 'Organize content in a table format.',
    icon: Table
  },
  {
    id: 'freeform' as LayoutType,
    name: 'Freeform',
    description: 'Place content anywhere on the canvas.',
    icon: Move
  },
  {
    id: 'stream' as LayoutType,
    name: 'Stream',
    description: 'Display content in a vertical stream.',
    icon: List
  },
  {
    id: 'map' as LayoutType,
    name: 'Map',
    description: 'Position content on a map-like interface.',
    icon: MapPin
  }
];

// Define types locally since they're not in a separate types file
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

// Column Component Props Interface
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

// Column Component with proper TypeScript typing
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

// Layout Section Component
const LayoutSection: React.FC<{
  selectedLayout: LayoutType;
  setSelectedLayout: (layout: LayoutType) => void;
  newPostsAtTop: boolean;
  setNewPostsAtTop: (value: boolean) => void;
  onOpenLayoutModal: () => void;
}> = ({ selectedLayout, newPostsAtTop, setNewPostsAtTop, onOpenLayoutModal }) => {
  const selectedLayoutInfo = layoutTypes.find(l => l.id === selectedLayout);
  
  return (
    <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg">
      <CardHeader className="bg-white/90">
        <CardTitle className="text-gray-900">Layout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 bg-white/90">
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

// Simplified Layout Selection Modal with Full-Screen Preview
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
  onPreviewAddSection
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

      {/* Full-Screen Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="!max-w-[99vw] !w-[1800px] max-h-[99vh] overflow-hidden bg-white/95 backdrop-blur-md" style={{ maxWidth: '99vw', width: '1800px' }}>
          <DialogHeader className="flex flex-row items-center justify-between p-6 border-b bg-white/90">
            <div>
              <DialogTitle className="text-gray-900 text-2xl">
                Preview: {layoutTypes.find(l => l.id === previewingLayout)?.name || 'Layout'}
              </DialogTitle>
              <p className="text-gray-600 text-base mt-2">
                {layoutTypes.find(l => l.id === previewingLayout)?.description}
              </p>
            </div>
          </DialogHeader>
          
          <div className="flex-grow overflow-auto p-6 bg-gray-50" style={{ minHeight: '700px', maxHeight: '80vh' }}>
            {previewingLayout === 'columns' ? (
              // INTERACTIVE COLUMNS PREVIEW
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
            ) : previewingLayout && previewingLayout !== 'columns' ? (
              // OTHER LAYOUTS using layout functions
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
          
          <div className="flex justify-between items-center p-6 border-t bg-white/90">
            <div className="text-gray-600">
              <p className="text-base font-medium">
                {previewingLayout && layoutTypes.find(l => l.id === previewingLayout)?.name} Layout
              </p>
              <p className="text-sm mt-1">
                {previewingLayout === 'columns' 
                  ? 'Interactive preview - you can click items to edit, use dropdown menus, and see how columns work.'
                  : 'This preview shows how your actual content will be arranged using the layout algorithm.'
                }
              </p>
            </div>
            <div className="flex gap-4">
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

// Main Canvas Setup Component
const CanvasSetupPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
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
  
  const [columns, setColumns] = useState<ColumnData[]>([
    { 
      id: 'column-1', 
      title: 'To Do', 
      items: [ 
        { id: 'item-1', title: 'Review new layout', content: 'Check the column and wall layouts with the new dropdown menu.' }, 
        { id: 'item-2', title: 'Test interactions', content: 'Test the dropdown menu functionality and styling.' } 
      ] 
    },
    { 
      id: 'column-2', 
      title: 'In Progress', 
      items: [ 
        { id: 'item-3', title: 'Integrate dropdown', content: 'Successfully integrated shadcn/ui dropdown menu.' } 
      ] 
    },
    { 
      id: 'column-3', 
      title: 'Done', 
      items: [] 
    }
  ]);
  
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [wallpaperDialogOpen, setWallpaperDialogOpen] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPadlet, setEditingPadlet] = useState<Padlet | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

  // Fix hydration issue - only render dynamic content after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert("Settings saved successfully!");
    } catch (error) {
      alert("Error saving settings. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  
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
  const addColumn = (baseColumnId: string, direction: 'left' | 'right') => {
    const newColumn: ColumnData = {
      id: `col-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: "New Section",
      items: []
    };

    const baseIndex = columns.findIndex(col => col.id === baseColumnId);
    if (baseIndex === -1) return;

    const newIndex = direction === 'left' ? baseIndex : baseIndex + 1;
    const newColumns = [...columns];
    newColumns.splice(newIndex, 0, newColumn);
    setColumns(newColumns);
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
    if (columnId) {
      setTargetColumnId(columnId);
    }
    setIsEditorOpen(true);
  };

  const handleAddPost = (columnId: string) => {
    setEditingPadlet(null);
    setTargetColumnId(columnId);
    setIsEditorOpen(true);
  };

  const handleSavePadlet = (padletData: { title: string; content: string }) => {
    if (editingPadlet) {
      setColumns(columns.map(column => ({
        ...column,
        items: column.items.map(item => 
          item.id === editingPadlet.id ? { ...item, ...padletData } : item
        )
      })));
    } else if (targetColumnId) {
      const newPost: Padlet = { 
        id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`, 
        ...padletData 
      };
      setColumns(columns.map(column => 
        column.id === targetColumnId 
          ? { 
              ...column, 
              items: newPostsAtTop 
                ? [newPost, ...column.items] 
                : [...column.items, newPost]
            } 
          : column
      ));
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
        <span className="ml-2">Saving settings...</span>
      </div>
    );
  }

  return (
    <div style={getCurrentBackground()} className="p-4 transition-all duration-300 min-h-screen" suppressHydrationWarning>
      <div className="max-w-2xl mx-auto space-y-4" suppressHydrationWarning>
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Heading</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 bg-white/90" suppressHydrationWarning>
            <div>
              <Label htmlFor="title" className="text-gray-900">Title</Label>
              <Input 
                id="title" 
                placeholder="Board title" 
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
                  className="w-8 h-8 rounded border bg-white" 
                  style={selectedWallpaper.type === 'image' ? {
                    backgroundImage: `url("${selectedWallpaper.value}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  } : {
                    backgroundColor: selectedWallpaper.type === 'color' ? selectedWallpaper.value : undefined,
                    background: selectedWallpaper.type === 'gradient' ? selectedWallpaper.value : undefined
                  }}
                />
                <span className="text-gray-600">Current wallpaper</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
                                  
        <LayoutSection 
          selectedLayout={layout} 
          setSelectedLayout={setLayout} 
          newPostsAtTop={newPostsAtTop} 
          setNewPostsAtTop={setNewPostsAtTop} 
          onOpenLayoutModal={handleOpenLayoutModal}
        />

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
            onClick={handleSaveSettings} 
            className="w-full" 
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Canvas Settings'
            )}
          </Button>
        </div>
      </div>
      
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
      />

      <PadletEditorModal 
        isOpen={isEditorOpen} 
        onClose={() => setIsEditorOpen(false)} 
        onSave={handleSavePadlet} 
        padlet={editingPadlet} 
      />

      <WallpaperSelector
        isOpen={wallpaperDialogOpen}
        onClose={() => setWallpaperDialogOpen(false)}
        currentSelection={selectedWallpaper}
        onSelect={handleWallpaperUpdate}
      />

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