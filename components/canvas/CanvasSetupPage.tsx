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
  Layers3,      // For Wall layout
  Columns3,     // For Columns layout
  Grid3X3,      // For Grid layout
  Clock,        // For Timeline layout
  Sparkles,     // For Freeform layout
  Map           // For Map layout
} from "lucide-react";

// Imports
import IconSelector from "@/components/collabboard/canvas/IconSelector";
import WallpaperSelector from "@/components/collabboard/canvas/WallpaperSelector";
import { layoutTypes as importedLayoutTypes, getLayoutFunction } from "@/lib/collabboard/layouts/layout-functions";
import type { LayoutType, PadletPosition } from "@/lib/collabboard/layouts/layout-functions";
import { supabase } from '@/lib/supabase';
import { TimelinePreview } from '@/lib/collabboard/layouts/TimelineLayout';
import { TablePreview } from '@/lib/collabboard/layouts/TableLayout';
import { ColumnsPreview } from '@/lib/collabboard/layouts/ColumnsLayout';
import { GridPreview } from '@/lib/collabboard/layouts/GridLayout';
import { WallPreview } from '@/lib/collabboard/layouts/WallLayout';
// import { StreamPreview } from '@/lib/collabboard/layouts/StreamLayout';
import { FreeformPreview } from '@/lib/collabboard/layouts/FreeformLayout';
import { MapPreview } from '@/lib/collabboard/layouts/MapLayout';


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
  onPreviewAddSection: (baseColumnId?: string, direction?: 'left' | 'right') => void;
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
              if (!IconComponent) {
                console.error(`Icon is missing for layout type: ${layoutOption.id}`);
                return null; // or a placeholder component
              }
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
              <ColumnsPreview
                columns={columns}
                config={{ newPostsAtTop }}
                onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                onAddPost={onPreviewAddPost}
                onRenameColumn={onPreviewRename}
                onDeleteColumn={onPreviewDelete}
                onMoveColumn={onPreviewMove}
                onAddColumn={onPreviewAddSection}
                onDeleteItem={(itemId, columnId) => {
                  console.log('Delete item:', itemId, 'from column:', columnId);
                }}
              />
            ) : previewingLayout === 'table' ? (
                <TablePreview
                    columns={columns}
                    config={{ newPostsAtTop }}
                    onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                    onAddPost={onPreviewAddPost}
                    onRenameColumn={onPreviewRename}
                    onMoveColumn={onPreviewMove}
                    onAddColumn={() => onPreviewAddSection()}
                    onAddItem={(columnId, rowIndex) => {
                        onPreviewAddPost(columnId);
                    }}
                    onDeleteItem={(padletId, columnId) => {
                        console.log('Delete padlet:', padletId, 'from column:', columnId);
                    }}
                />
            ) : previewingLayout === 'timeline' ? (
              <TimelinePreview
                columns={columns}
                config={{ newPostsAtTop }}
                onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                onAddPost={onPreviewAddPost}
                onDeleteItem={(padletId, columnId) => {
                  // Handle delete if needed
                  console.log('Delete padlet:', padletId, 'from column:', columnId);
                }}
              />
            ) : previewingLayout === 'grid' ? (
              <GridPreview
                columns={columns}
                config={{ newPostsAtTop }}
                onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                onAddPost={onPreviewAddPost}
                onDeleteItem={(padletId, columnId) => {
                  console.log('Delete padlet:', padletId, 'from column:', columnId);
                }}
                onCellClick={(row, column) => {
                  console.log('Clicked empty cell:', row, column);
                }}
              />
            ) : previewingLayout === 'wall' ? (
              <WallPreview
                columns={columns}
                config={{ newPostsAtTop }}
                onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                onAddPost={onPreviewAddPost}
                onDeleteItem={(padletId, columnId) => {
                  console.log('Delete padlet:', padletId, 'from column:', columnId);
                }}
                onLikeItem={(padletId) => {
                  console.log('Like padlet:', padletId);
                }}
                onPinItem={(padletId) => {
                  console.log('Pin padlet:', padletId);
                }}
                onShareItem={(padletId) => {
                  console.log('Share padlet:', padletId);
                }}
              />
            ) : previewingLayout === 'freeform' ? (
              <FreeformPreview
                columns={columns}
                config={{ 
                  canvasWidth: 1200,
                  canvasHeight: 800,
                  showGrid: true,
                  snapToGrid: false
                }}
                onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                onAddPost={onPreviewAddPost}
                onDeleteItem={(padletId, columnId) => {
                  console.log('Delete padlet:', padletId, 'from column:', columnId);
                }}
                onUpdatePosition={(padletId, position) => {
                  console.log('Update position:', padletId, position);
                }}
              />
            ) : previewingLayout === 'map' ? (
              <MapPreview
                columns={columns}
                config={{ 
                  layoutMode: 'mindmap',
                  showConnections: true,
                  centerNode: true
                }}
                onEditItem={(padlet, columnId) => onPreviewEdit(padlet, columnId)}
                onAddPost={onPreviewAddPost}
                onDeleteItem={(padletId, columnId) => {
                  console.log('Delete padlet:', padletId, 'from column:', columnId);
                }}
                onUpdatePosition={(padletId, coords) => {
                  console.log('Update position:', padletId, coords);
                }}
              />
            ) : previewingLayout && previewingLayout !== 'columns' && previewingLayout !== 'timeline' && previewingLayout !== 'table' && previewingLayout !== 'grid' && previewingLayout !== 'wall' && previewingLayout !== 'stream' && previewingLayout !== 'freeform' && previewingLayout !== 'map' ? (
              <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
                This layout does not have a specific preview.
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
              {selectedLayoutInfo && selectedLayoutInfo.icon && React.createElement(selectedLayoutInfo.icon, { size: 20 })}
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
  const router = useRouter();

  // Authentication & Loading State
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const layouts = [
      {
        id: 'wall',
        name: 'Wall',
        description: 'Pinterest-style masonry layout',
        icon: Layers3
      },
      {
        id: 'columns',
        name: 'Columns',
        description: 'Kanban-style columns',
        icon: Columns3
      },
      {
        id: 'grid',
        name: 'Grid',
        description: 'Uniform grid layout',
        icon: Grid3X3
      },
      {
        id: 'table',
        name: 'Table',
        description: 'Spreadsheet-like grid',
        icon: Table
      },
      {
        id: 'timeline',
        name: 'Timeline',
        description: 'Chronological timeline',
        icon: Clock
      },
      {
        id: 'freeform',
        name: 'Freeform',
        description: 'Free positioning layout',
        icon: Sparkles
      },
      {
        id: 'map',
        name: 'Map',
        description: 'Mind map layout',
        icon: Map
      }
    ];
    console.log('Available layouts:', layouts.map(l => l.id)); // Debug log
    return layouts;
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
  }, []);

  // Supabase Save Function
  const handleSaveCanvas = async () => {
    setError(null);
    try {
      setLoading(true);
      // 1. Check user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('🔍 User check:', { user, userError });

      if (userError) {
        console.error('❌ User error:', userError);
        setError('Authentication error: ' + userError.message);
        setLoading(false);
        return;
      }

      if (!user) {
        console.error('❌ No user found');
        setError('You must be logged in to save a canvas.');
        setLoading(false);
        return;
      }
      // 2. Prepare canvas data
      const canvasData = {
        title: title.trim(),
        description: description.trim(),
        layout: layout,
        background_type: selectedWallpaper.type,
        background_value: selectedWallpaper.value,
        comments_enabled: commentsEnabled,
        reactions_enabled: true,
        user_id: user.id,
        thumbnail: selectedIcon,
      };

      console.log('🔍 Saving canvas:', canvasData);
      // 3. Insert canvas
      const { data, error: canvasError } = await supabase
        .from('boards')
        .insert(canvasData)
        .select()
        .single();
      console.log('🔍 Insert result:', { data, error: canvasError });
      if (canvasError) {
        console.error('❌ Canvas error:', canvasError);
        setError('Database error: ' + canvasError.message);
        setLoading(false);
        return;
      }
      if (!data) {
        console.error('❌ No data returned');
        setError('No data returned from save operation');
        setLoading(false);
        return;
      }
      console.log('✅ Canvas saved:', data);
      // 4. Create sections if needed
      if (layout === 'columns' || layout === 'table') {
        console.log('🔍 Creating sections...');
        const sectionsToInsert = columns.map((column, index) => ({
          board_id: data.id,
          title: column.title,
          description: `Column ${index + 1}`,
          position: index + 1,
        }));
        const { error: sectionsError } = await supabase
          .from('board_sections')
          .insert(sectionsToInsert);
        if (sectionsError) {
          console.error('❌ Sections error:', sectionsError);
          setError('Error creating sections: ' + sectionsError.message);
          setLoading(false);
          return;
        }
        console.log('✅ Sections created');
      }
      console.log('✅ Canvas created successfully with ID:', data.id);
      router.push('/dashboard'); // Go back to dashboard instead
    } catch (err: any) {
      console.error('❌ Unexpected error:', err);
      setError('Error: ' + (err?.message || 'Unknown error occurred'));
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
          {error && (
            <div className="p-3 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400" role="alert">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}
          <Button
            onClick={handleSaveCanvas}
            className="w-full"
            size="lg"
            disabled={loading || !user}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              'Create Canvas'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}