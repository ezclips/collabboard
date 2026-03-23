// File: app/dashboard/create-canvas/page.tsx
'use client';

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
  AlignJustify,
  ChevronRight,
  ArrowLeft,
  Check,
  Upload,
  Loader2,
  Link,
  Palette,
  Image,
  Grid3X3,
  Plus,
  Edit2,
  Trash2,
  MoveLeft,
  MoveRight,
  MoreVertical,
  Columns,
  Layers,
  Calendar,
  Table,
  Map
} from "lucide-react";

// TypeScript interfaces
interface Padlet {
  id: string;
  db_id?: string;
  title: string;
  content: string;
}

interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface WallpaperSelection {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

interface LinkUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: string, value: string) => void;
}

interface WallpaperSelectorProps {
  onSelect: (type: string, value: string) => void;
  onBack: () => void;
  currentSelection: WallpaperSelection;
  onFileSelect: (file: File) => void;
  uploadingImage: boolean;
  uploadError: string | null;
}

interface LayoutSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLayout: LayoutType;
  previewedLayout: LayoutType | null;
  onSelect: (layout: LayoutType) => void;
  onPreview: (layout: LayoutType) => void;
}

interface LayoutSectionProps {
  selectedLayout: LayoutType;
  setSelectedLayout: (layout: LayoutType) => void;
  newPostsAtTop: boolean;
  setNewPostsAtTop: (value: boolean) => void;
  onPreview: (layout: LayoutType) => void;
  onOpenLayoutModal: () => void;
  previewedLayout?: LayoutType | null;
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

type LayoutType = 'columns' | 'wall' | 'timeline' | 'grid' | 'freeform' | 'stream' | 'map';

const layoutOptions = [
  {
    id: 'wall' as LayoutType,
    name: 'Wall',
    icon: <Layers className="w-6 h-6" />,
    description: 'Arrange content in a brick-like formation.',
  },
  {
    id: 'columns' as LayoutType,
    name: 'Columns',
    icon: <Columns className="w-6 h-6" />,
    description: 'Organize content in columns.',
  },
  {
    id: 'grid' as LayoutType,
    name: 'Grid',
    icon: <Grid3X3 className="w-6 h-6" />,
    description: 'Arrange content in a grid pattern.',
  },
  {
    id: 'table' as LayoutType,
    name: 'Table',
    icon: <Table className="w-6 h-6" />,
    description: 'Organize content in table format.',
  },
  {
    id: 'freeform' as LayoutType,
    name: 'Freeform',
    icon: <Palette className="w-6 h-6" />,
    description: 'Position content freely.',
  },
  {
    id: 'timeline' as LayoutType,
    name: 'Timeline',
    icon: <Calendar className="w-6 h-6" />,
    description: 'Arrange content along a horizontal line.',
  },
  {
    id: 'stream' as LayoutType,
    name: 'Stream',
    icon: <AlignJustify className="w-6 h-6" />,
    description: 'Arrange content in a stream.',
  },
  {
    id: 'map' as LayoutType,
    name: 'Map',
    icon: <Map className="w-6 h-6" />,
    description: 'Display content points on a map.',
  },
];

const getLayoutFunction = (layoutType: LayoutType) => {
  return (count: number, width: number, height: number): PadletPosition[] => {
    const positions: PadletPosition[] = [];
    const itemWidth = 200;
    const itemHeight = 150;
    const padding = 20;

    // Ensure valid width and height
    const safeWidth = Math.max(width, itemWidth + padding * 2);
    const safeHeight = Math.max(height, itemHeight + padding * 2);

    for (let i = 0; i < count; i++) {
      switch (layoutType) {
        case 'grid':
          const cols = Math.floor(safeWidth / (itemWidth + padding)) || 1;
          const row = Math.floor(i / cols);
          const col = i % cols;
          positions.push({
            top: row * (itemHeight + padding) + padding,
            left: col * (itemWidth + padding) + padding,
            width: itemWidth,
            height: itemHeight
          });
          break;
        case 'columns':
          const columnCount = 3;
          const columnWidth = safeWidth / columnCount;
          const columnIndex = i % columnCount;
          const itemsInColumn = Math.floor(i / columnCount);
          positions.push({
            top: itemsInColumn * (itemHeight + padding) + padding,
            left: columnIndex * columnWidth + padding,
            width: columnWidth - padding * 2,
            height: itemHeight
          });
          break;
        case 'timeline':
          positions.push({
            top: safeHeight / 2 - itemHeight / 2,
            left: i * (itemWidth + padding) + padding,
            width: itemWidth,
            height: itemHeight
          });
          break;
        case 'wall':
          const wallCols = Math.floor(safeWidth / (itemWidth + padding)) || 1;
          const wallCol = i % wallCols;
          const wallRow = Math.floor(i / wallCols);
          const randomHeight = itemHeight + Math.random() * 50;
          positions.push({
            top: wallRow * (randomHeight + padding) + padding,
            left: wallCol * (itemWidth + padding) + padding,
            width: itemWidth,
            height: randomHeight
          });
          break;
        case 'stream':
          positions.push({
            top: i * (itemHeight + padding) + padding,
            left: padding,
            width: safeWidth - padding * 2,
            height: itemHeight
          });
          break;
        case 'freeform':
        case 'map':
        default:
          positions.push({
            top: Math.random() * (safeHeight - itemHeight),
            left: Math.random() * (safeWidth - itemWidth),
            width: itemWidth,
            height: itemHeight
          });
          break;
      }
    }
    return positions;
  };
};

const LinkUploader: React.FC<LinkUploaderProps> = ({ isOpen, onClose, onSelect }) => {
  const [link, setLink] = useState("");
  
  const handleSubmit = () => {
    if (link.trim()) {
      onSelect('image', link.trim());
      onClose();
      setLink("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter image link</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input 
            value={link} 
            onChange={(e) => setLink(e.target.value)} 
            placeholder="Paste image link here" 
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <Button 
            onClick={handleSubmit} 
            disabled={!link.trim()}
          >
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const WallpaperSelector: React.FC<WallpaperSelectorProps> = ({ 
  onSelect, 
  onBack, 
  currentSelection, 
  onFileSelect, 
  uploadingImage, 
  uploadError 
}) => {
  const [activeTab, setActiveTab] = useState<'solid' | 'gradients' | 'art' | 'photos' | 'textures' | 'upload'>('solid');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      onFileSelect(file);
    } else {
      setSelectedFileName('');
    }
  };
  
  const solidColors = [
    '#ffffff', '#f3f4f6', '#d1d5db', '#374151', '#1f2937', '#000000',
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
    '#ec4899', '#f59e0b', '#84cc16', '#06b6d4', '#6366f1', '#a855f7'
  ];
  
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
  ];
  
  const artIllustrations = [
    'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1549317336-206569e8475c?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1558021212-51b6ecfa0db9?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=600&fit=crop'
  ];
  
  const photos = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1418065460487-3d7063cd25f9?w=800&h=600&fit=crop'
  ];
  
  const textures = [
    'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1604071763506-37b8b4d4a8c3?w=800&h=600&fit=crop'
  ];
  
  const wallpaperTabs = [
    { id: 'solid' as const, label: 'Solid Color', icon: <div className="w-4 h-4 rounded-full bg-purple-500"/> }, 
    { id: 'gradients' as const, label: 'Gradients', icon: <div className="w-4 h-4 rounded bg-gradient-to-r from-pink-500 to-blue-500"/> }, 
    { id: 'art' as const, label: 'Art & Illustrations', icon: <Palette className="w-4 h-4"/> }, 
    { id: 'photos' as const, label: 'Photos', icon: <Image className="w-4 h-4"/> }, 
    { id: 'textures' as const, label: 'Textures & Patterns', icon: <Grid3X3 className="w-4 h-4"/> }, 
    { id: 'upload' as const, label: 'Upload', icon: <Upload className="w-4 h-4"/> }
  ];
  
  const getBackgroundStyle = () => {
    switch (currentSelection.type) {
      case 'color':
        return { backgroundColor: currentSelection.value };
      case 'gradient':
        return { background: currentSelection.value };
      case 'image':
        return { backgroundImage: `url("${currentSelection.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
      default:
        return { backgroundColor: '#22c55e' };
    }
  };
  
  return (
    <div className="p-6">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mr-3 p-2">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-lg font-semibold text-center flex-1">Wallpaper</h2>
      </div>
      
      <div className="flex justify-center mb-6">
        <div 
          className="w-24 h-16 rounded-lg border-2 border-green-500" 
          style={getBackgroundStyle()}
        />
      </div>
      
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        {wallpaperTabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            className={`px-3 py-2 rounded-full text-sm flex items-center gap-2 transition-colors ${
              activeTab === tab.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      
      {activeTab === 'solid' && (
        <div className="grid grid-cols-6 gap-3">
          {solidColors.map(color => (
            <button 
              key={color} 
              onClick={() => onSelect('color', color)} 
              style={{ backgroundColor: color }} 
              className={`w-full aspect-square rounded-lg border-2 flex items-center justify-center transition-transform ${
                currentSelection.value === color ? 'border-purple-500 scale-110' : 'border-gray-200 hover:scale-105'
              }`}
            >
              {currentSelection.value === color && <Check className="w-4 h-4 text-white mix-blend-difference" />}
            </button>
          ))}
        </div>
      )}
      
      {activeTab === 'gradients' && (
        <div className="grid grid-cols-3 gap-3">
          {gradients.map((gradient, index) => (
            <button 
              key={index} 
              onClick={() => onSelect('gradient', gradient)} 
              style={{ background: gradient }} 
              className={`w-full aspect-video rounded-lg border-2 flex items-center justify-center transition-transform ${
                currentSelection.value === gradient ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
              }`}
            >
              {currentSelection.value === gradient && <Check className="w-5 h-5 text-white mix-blend-difference" />}
            </button>
          ))}
        </div>
      )}
      
      {activeTab === 'art' && (
        <div className="grid grid-cols-2 gap-3">
          {artIllustrations.map((url, index) => (
            <button 
              key={index} 
              onClick={() => onSelect('image', url)} 
              className={`w-full aspect-video rounded-lg border-2 overflow-hidden transition-transform relative ${
                currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
              }`}
            >
              <img src={url} alt={`Art ${index + 1}`} className="w-full h-full object-cover" />
              {currentSelection.value === url && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                  <Check className="w-5 h-5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      
      {activeTab === 'photos' && (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((url, index) => (
            <button 
              key={index} 
              onClick={() => onSelect('image', url)} 
              className={`w-full aspect-video rounded-lg border-2 overflow-hidden transition-transform relative ${
                currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
              }`}
            >
              <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
              {currentSelection.value === url && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                  <Check className="w-5 h-5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      
      {activeTab === 'textures' && (
        <div className="grid grid-cols-2 gap-3">
          {textures.map((url, index) => (
            <button 
              key={index} 
              onClick={() => onSelect('image', url)} 
              className={`w-full aspect-video rounded-lg border-2 overflow-hidden transition-transform relative ${
                currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
              }`}
            >
              <img src={url} alt={`Texture ${index + 1}`} className="w-full h-full object-cover" />
              {currentSelection.value === url && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                  <Check className="w-5 h-5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      
      {activeTab === 'upload' && (
        <div className="space-y-4">
          <label 
            htmlFor="file-upload" 
            className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-6 text-center w-full"
          >
            <h3 className="text-sm font-medium text-gray-900 mb-2">Upload Custom Image</h3>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-4">
              <span>{selectedFileName ? 'Selected:' : 'Choose file'}</span>
              <span className="text-gray-400 truncate max-w-[150px]">{selectedFileName || 'No file selected'}</span>
            </div>
            <input 
              id="file-upload" 
              type="file" 
              className="sr-only" 
              accept="image/*" 
              onChange={handleFileChange} 
              disabled={uploadingImage} 
            />
            {uploadingImage && (
              <div className="mt-2 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Uploading...</span>
              </div>
            )}
            {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
          </label>
          <div className="mt-4">
            <Button variant="outline" className="w-full" onClick={() => setLinkDialogOpen(true)}>
              <Link className="w-4 h-4 mr-2" /> Add Image from Link
            </Button>
          </div>
        </div>
      )}
      
      <LinkUploader 
        isOpen={linkDialogOpen} 
        onClose={() => setLinkDialogOpen(false)} 
        onSelect={onSelect} 
      />
    </div>
  );
};

const LayoutSection: React.FC<LayoutSectionProps> = ({ 
  selectedLayout, 
  setSelectedLayout, 
  newPostsAtTop, 
  setNewPostsAtTop, 
  onPreview, 
  onOpenLayoutModal,
  previewedLayout
}) => {
  const selectedLayoutInfo = layoutOptions.find(l => l.id === (previewedLayout || selectedLayout));
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Layout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Format</Label>
          <Button 
            variant="outline" 
            onClick={onOpenLayoutModal}
            className="w-full justify-between mt-2 h-12"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{selectedLayoutInfo?.icon}</span>
              <span className="text-gray-600">{selectedLayoutInfo?.name}</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">New Posts at Top</Label>
              <p className="text-xs text-gray-500">Place newest posts at the beginning</p>
            </div>
            <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const LayoutSelectionModal: React.FC<LayoutSelectionModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedLayout, 
  previewedLayout, 
  onSelect, 
  onPreview 
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Choose a format</DialogTitle>
          <DialogDescription>
            Select or preview the layout that best fits your content organization needs.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 p-4">
          {layoutOptions.map((option) => (
            <div 
              key={option.id} 
              className={`border rounded-lg p-4 space-y-3 cursor-pointer transition-all ${
                selectedLayout === option.id 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : previewedLayout === option.id
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
              onClick={() => onSelect(option.id)}
            >
              <div className="flex items-center justify-center text-4xl mb-2">
                {option.icon}
              </div>
              <div>
                <h3 className="font-medium text-base">{option.name}</h3>
                <p className="text-sm text-gray-600 mb-3">{option.description}</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(option.id);
                  }}
                  className="flex-1"
                  variant={selectedLayout === option.id ? "default" : "outline"}
                >
                  {selectedLayout === option.id ? 'Selected' : 'Select'}
                </Button>
                <Button 
                  variant={previewedLayout === option.id ? "secondary" : "outline"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(option.id);
                  }}
                  className="flex-1"
                >
                  {previewedLayout === option.id ? 'Previewing' : 'Preview'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

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
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onAddPost(id)}>
              <Plus className="mr-2 h-4 w-4" />
              Add post
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Rename section
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMove(id, 'left')}>
              <MoveLeft className="mr-2 h-4 w-4" />
              Move left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(id, 'right')}>
              <MoveRight className="mr-2 h-4 w-4" />
              Move right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAddSection('left')}>
              <Plus className="mr-2 h-4 w-4" />
              Add section to left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddSection('right')}>
              <Plus className="mr-2 h-4 w-4" />
              Add section to right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDeleteSection} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2 p-2 flex-1 min-h-[200px]">
        {items.map((item) => (
          <div 
            key={item.id} 
            className="bg-white rounded p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onEditItem(item)}
          >
            <h4 className="font-medium text-sm mb-1">{item.title}</h4>
            <p className="text-xs text-gray-600 line-clamp-3">{item.content}</p>
          </div>
        ))}
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onAddPost(id)}
          className="w-full text-gray-600 hover:text-gray-800 py-2 border-2 border-dashed border-gray-300 hover:border-gray-400"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add post
        </Button>
      </div>
    </div>
  );
};

const CanvasSetupPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'setup' | 'wallpaper'>('setup');
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('wall');
  const [previewedLayout, setPreviewedLayout] = useState<LayoutType | null>(null);
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [wallpaper, setWallpaper] = useState<WallpaperSelection>({
    type: 'color',
    value: '#22c55e'
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  
  const [canvasTitle, setCanvasTitle] = useState('');
  const [canvasDescription, setCanvasDescription] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  
  const [columns, setColumns] = useState<ColumnData[]>([
    {
      id: '1',
      title: 'To Do',
      items: [
        { id: '1', title: 'Task 1', content: 'Description for task 1' },
        { id: '2', title: 'Task 2', content: 'Description for task 2' }
      ]
    },
    {
      id: '2', 
      title: 'In Progress',
      items: [
        { id: '3', title: 'Task 3', content: 'Description for task 3' }
      ]
    },
    {
      id: '3',
      title: 'Done',
      items: []
    }
  ]);
  
  const [samplePadlets] = useState<Padlet[]>([
    { id: '1', title: 'Sample Post 1', content: 'This is a sample post content' },
    { id: '2', title: 'Sample Post 2', content: 'Another sample post with different content' },
    { id: '3', title: 'Sample Post 3', content: 'Third sample post for layout preview' },
    { id: '4', title: 'Sample Post 4', content: 'Fourth sample post' },
    { id: '5', title: 'Sample Post 5', content: 'Fifth sample post' },
    { id: '6', title: 'Sample Post 6', content: 'Sixth sample post' }
  ]);

  const handleWallpaperSelect = (type: string, value: string) => {
    setWallpaper({ type: type as 'color' | 'gradient' | 'image', value });
    setCurrentView('setup');
  };

  const handleFileSelect = async (file: File) => {
    setUploadingImage(true);
    setUploadError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const fakeUrl = URL.createObjectURL(file);
      setWallpaper({ type: 'image', value: fakeUrl });
      setCurrentView('setup');
    } catch (error) {
      setUploadError('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleLayoutPreview = (layout: LayoutType) => {
    setPreviewedLayout(layout);
  };

  const handleLayoutSelect = (layout: LayoutType) => {
    setSelectedLayout(layout);
    setPreviewedLayout(null);
    setLayoutModalOpen(false);
  };

  const handleColumnRename = (columnId: string, newTitle: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, title: newTitle } : col
    ));
  };

  const handleColumnDelete = (columnId: string) => {
    setColumns(prev => prev.filter(col => col.id !== columnId));
  };

  const handleAddPost = (columnId: string) => {
    const newPost: Padlet = {
      id: Date.now().toString(),
      title: `New Post ${Date.now()}`,
      content: 'Click to edit this post content'
    };
    
    setColumns(prev => prev.map(col => 
      col.id === columnId 
        ? { ...col, items: newPostsAtTop ? [newPost, ...col.items] : [...col.items, newPost] }
        : col
    ));
  };

  const handleColumnMove = (columnId: string, direction: 'left' | 'right') => {
    setColumns(prev => {
      const currentIndex = prev.findIndex(col => col.id === columnId);
      if (currentIndex === -1) return prev;
      
      const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newColumns = [...prev];
      [newColumns[currentIndex], newColumns[newIndex]] = [newColumns[newIndex], newColumns[currentIndex]];
      return newColumns;
    });
  };

  const handleAddSection = (direction: 'left' | 'right') => {
    const newSection: ColumnData = {
      id: Date.now().toString(),
      title: 'New Section',
      items: []
    };
    
    if (direction === 'left') {
      setColumns(prev => [newSection, ...prev]);
    } else {
      setColumns(prev => [...prev, newSection]);
    }
  };

  const handleEditItem = (item: Padlet) => {
    console.log('Editing item:', item);
  };

  const handleSaveCanvas = async () => {
    try {
      const canvasData = {
        title: canvasTitle,
        description: canvasDescription,
        layout: selectedLayout,
        backgroundType: wallpaper.type,
        backgroundValue: wallpaper.value,
        commentsEnabled,
        reactionsEnabled,
        newPostsAtTop,
        columns: selectedLayout === 'columns' ? columns : undefined
      };
      
      console.log('Saving canvas:', canvasData);
    } catch (error) {
      console.error('Error saving canvas:', error);
    }
  };

  const getBackgroundStyle = () => {
    switch (wallpaper.type) {
      case 'color':
        return { backgroundColor: wallpaper.value };
      case 'gradient':
        return { background: wallpaper.value };
      case 'image':
        return { 
          backgroundImage: `url("${wallpaper.value}")`, 
          backgroundSize: 'cover', 
          backgroundPosition: 'center' 
        };
      default:
        return { backgroundColor: '#22c55e' };
    }
  };

  const renderLayoutPreview = () => {
    const activeLayout = previewedLayout || selectedLayout;

    if (activeLayout === 'columns') {
      return (
        <div className="flex overflow-x-auto pb-4">
          {columns.map((column) => (
            <Column
              key={column.id}
              id={column.id}
              title={column.title}
              items={column.items}
              onRename={handleColumnRename}
              onDelete={handleColumnDelete}
              onAddPost={handleAddPost}
              onMove={handleColumnMove}
              onAddSection={handleAddSection}
              onEditItem={handleEditItem}
            />
          ))}
        </div>
      );
    }

    const layoutFunction = getLayoutFunction(activeLayout);
    const positions = layoutFunction(samplePadlets.length, 800, 600);

    return (
      <div className="relative w-full h-96 overflow-hidden">
        {samplePadlets.map((padlet, index) => {
          const position = positions[index];
          // Fix: Skip rendering if position is undefined
          if (!position) {
            console.warn(`No position for padlet at index ${index} in layout ${activeLayout}`);
            return null;
          }
          return (
            <div
              key={padlet.id}
              className="absolute bg-white rounded-lg p-3 shadow-md border cursor-pointer hover:shadow-lg transition-shadow"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                height: position.height,
                transform: 'scale(0.8)',
                transformOrigin: 'top left'
              }}
            >
              <h4 className="font-medium text-sm mb-1 truncate">{padlet.title}</h4>
              <p className="text-xs text-gray-600 line-clamp-3">{padlet.content}</p>
            </div>
          );
        })}
      </div>
    );
  };

  if (currentView === 'wallpaper') {
    return (
      <WallpaperSelector
        onSelect={handleWallpaperSelect}
        onBack={() => setCurrentView('setup')}
        currentSelection={wallpaper}
        onFileSelect={handleFileSelect}
        uploadingImage={uploadingImage}
        uploadError={uploadError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-lg font-semibold">Create Canvas</h1>
                <p className="text-sm text-gray-500">Set up your collaborative workspace</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={() => console.log('Preview')}>
                Preview
              </Button>
              <Button onClick={handleSaveCanvas}>
                Create Canvas
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Canvas Title</Label>
                  <Input
                    id="title"
                    value={canvasTitle}
                    onChange={(e) => setCanvasTitle(e.target.value)}
                    placeholder="Enter canvas title..."
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={canvasDescription}
                    onChange={(e) => setCanvasDescription(e.target.value)}
                    placeholder="Brief description..."
                  />
                </div>
              </CardContent>
            </Card>

            <LayoutSection
              selectedLayout={selectedLayout}
              setSelectedLayout={setSelectedLayout}
              newPostsAtTop={newPostsAtTop}
              setNewPostsAtTop={setNewPostsAtTop}
              onPreview={handleLayoutPreview}
              onOpenLayoutModal={() => setLayoutModalOpen(true)}
              previewedLayout={previewedLayout}
            />

            <Card>
              <CardHeader>
                <CardTitle>Wallpaper</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => setCurrentView('wallpaper')}
                  className="w-full justify-between h-12"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-6 h-6 rounded border"
                      style={getBackgroundStyle()}
                    />
                    <span className="text-gray-600">
                      {wallpaper.type === 'color' ? 'Solid Color' : 
                       wallpaper.type === 'gradient' ? 'Gradient' : 'Image'}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Comments</Label>
                    <p className="text-xs text-gray-500">Allow comments on posts</p>
                  </div>
                  <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Reactions</Label>
                    <p className="text-xs text-gray-500">Enable reactions on posts</p>
                  </div>
                  <Switch checked={reactionsEnabled} onCheckedChange={setReactionsEnabled} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <p className="text-sm text-gray-500">
                  This is how your canvas will look with the {previewedLayout || selectedLayout} layout
                </p>
              </CardHeader>
              <CardContent>
                <div 
                  className="rounded-lg border min-h-96 p-4"
                  style={getBackgroundStyle()}
                >
                  {renderLayoutPreview()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <LayoutSelectionModal
        isOpen={layoutModalOpen}
        onClose={() => {
          setPreviewedLayout(null);
          setLayoutModalOpen(false);
        }}
        selectedLayout={selectedLayout}
        previewedLayout={previewedLayout}
        onSelect={handleLayoutSelect}
        onPreview={handleLayoutPreview}
      />
    </div>
  );
};

export default function CreateCanvasPage() {
  return <CanvasSetupPage />;
}