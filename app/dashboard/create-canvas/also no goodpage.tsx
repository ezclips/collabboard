'use client';

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowRight,
  Columns,
  Layers,
  Calendar,
  Table,
  Map,
  X,
  Settings
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
  onSelect: (layout: LayoutType) => void;
  onPreview: (layout: LayoutType) => void;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  canvasTitle: string;
  setCanvasTitle: (value: string) => void;
  canvasDescription: string;
  setCanvasDescription: (value: string) => void;
  selectedLayout: LayoutType;
  setSelectedLayout: (layout: LayoutType) => void;
  wallpaper: WallpaperSelection;
  onWallpaperChange: () => void;
  commentsEnabled: boolean;
  setCommentsEnabled: (value: boolean) => void;
  reactionsEnabled: boolean;
  setReactionsEnabled: (value: boolean) => void;
  newPostsAtTop: boolean;
  setNewPostsAtTop: (value: boolean) => void;
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

// Layout types
type LayoutType = 'columns' | 'wall' | 'timeline' | 'grid' | 'freeform' | 'stream' | 'map';

// Layout options configuration
const layoutOptions = [
  {
    id: 'wall' as LayoutType,
    name: 'Wall',
    icon: <Layers className="w-6 h-6" />,
    description: 'Arrange content in a brick-like formation.',
    preview: 'Masonry-style layout with varying heights',
  },
  {
    id: 'columns' as LayoutType,
    name: 'Columns',
    icon: <Columns className="w-6 h-6" />,
    description: 'Organize content in columns.',
    preview: 'Kanban-style columns for organizing tasks',
  },
  {
    id: 'grid' as LayoutType,
    name: 'Grid',
    icon: <Grid3X3 className="w-6 h-6" />,
    description: 'Arrange content in a grid pattern.',
    preview: 'Equal-sized cards in a structured grid',
  },
  {
    id: 'table' as LayoutType,
    name: 'Table',
    icon: <Table className="w-6 h-6" />,
    description: 'Organize content in table format.',
    preview: 'Tabular data presentation with rows and columns',
  },
  {
    id: 'freeform' as LayoutType,
    name: 'Freeform',
    icon: <Palette className="w-6 h-6" />,
    description: 'Position content freely.',
    preview: 'Free positioning like a whiteboard',
  },
  {
    id: 'timeline' as LayoutType,
    name: 'Timeline',
    icon: <Calendar className="w-6 h-6" />,
    description: 'Arrange content along a horizontal line.',
    preview: 'Chronological arrangement from left to right',
  },
  {
    id: 'stream' as LayoutType,
    name: 'Stream',
    icon: <AlignJustify className="w-6 h-6" />,
    description: 'Arrange content in a stream.',
    preview: 'Vertical feed-style layout',
  },
  {
    id: 'map' as LayoutType,
    name: 'Map',
    icon: <Map className="w-6 h-6" />,
    description: 'Display content points on a map.',
    preview: 'Geographic or spatial arrangement',
  },
];

// Mock layout functions with different behaviors for each layout
const getLayoutFunction = (layoutType: LayoutType) => {
  return (count: number, width: number, height: number): PadletPosition[] => {
    const positions: PadletPosition[] = [];
    const itemWidth = 200;
    const itemHeight = 150;
    const padding = 20;

    for (let i = 0; i < count; i++) {
      switch (layoutType) {
        case 'grid':
          const cols = Math.floor(width / (itemWidth + padding));
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
          const columnWidth = width / columnCount;
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
            top: height / 2 - itemHeight / 2,
            left: i * (itemWidth + padding) + padding,
            width: itemWidth,
            height: itemHeight
          });
          break;
        case 'wall':
          // Masonry-style layout with varying heights
          const wallCols = Math.floor(width / (itemWidth + padding));
          const wallCol = i % wallCols;
          const wallRow = Math.floor(i / wallCols);
          const randomHeight = itemHeight + (i % 3) * 30; // Varying heights
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
            left: width / 2 - itemWidth / 2, // Centered
            width: Math.min(itemWidth * 2, width - padding * 2),
            height: itemHeight
          });
          break;
        case 'table':
          const tableCols = 4;
          const tableRow = Math.floor(i / tableCols);
          const tableCol = i % tableCols;
          const cellWidth = (width - padding * (tableCols + 1)) / tableCols;
          positions.push({
            top: tableRow * (itemHeight + padding) + padding,
            left: tableCol * (cellWidth + padding) + padding,
            width: cellWidth,
            height: itemHeight
          });
          break;
        case 'map':
          // Scattered positioning like a mind map
          const angle = (i * 137.5) * (Math.PI / 180); // Golden angle
          const radius = Math.min(width, height) / 4 + (i * 20);
          const centerX = width / 2;
          const centerY = height / 2;
          positions.push({
            top: centerY + Math.sin(angle) * radius - itemHeight / 2,
            left: centerX + Math.cos(angle) * radius - itemWidth / 2,
            width: itemWidth,
            height: itemHeight
          });
          break;
        case 'freeform':
        default:
          positions.push({
            top: Math.random() * (height - itemHeight),
            left: Math.random() * (width - itemWidth),
            width: itemWidth,
            height: itemHeight
          });
          break;
      }
    }
    return positions;
  };
};

// Helper Components
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
// Wallpaper Selector Component - Fixed sizing issues
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
    'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1549317336-206569e8475c?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1558021212-51b6ecfa0db9?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400&h=300&fit=crop'
  ];
  
  const photos = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1418065460487-3d7063cd25f9?w=400&h=300&fit=crop'
  ];
  
  const textures = [
    'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1557683316-973673baf926?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1604071763506-37b8b4d4a8c3?w=400&h=300&fit=crop'
  ];
  
  const wallpaperTabs = [
    { id: 'solid' as const, label: 'Solid Color', icon: <div className="w-3 h-3 rounded-full bg-purple-500"/> }, 
    { id: 'gradients' as const, label: 'Gradients', icon: <div className="w-3 h-3 rounded bg-gradient-to-r from-pink-500 to-blue-500"/> }, 
    { id: 'art' as const, label: 'Art & Illustrations', icon: <Palette className="w-3 h-3"/> }, 
    { id: 'photos' as const, label: 'Photos', icon: <Image className="w-3 h-3"/> }, 
    { id: 'textures' as const, label: 'Textures & Patterns', icon: <Grid3X3 className="w-3 h-3"/> }, 
    { id: 'upload' as const, label: 'Upload', icon: <Upload className="w-3 h-3"/> }
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
          className="w-20 h-12 rounded-lg border-2 border-green-500" 
          style={getBackgroundStyle()}
        />
      </div>
      
      <div className="flex flex-wrap gap-1 mb-6 justify-center">
        {wallpaperTabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 transition-colors ${
              activeTab === tab.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
      
      {activeTab === 'solid' && (
        <div className="grid grid-cols-6 gap-2">
          {solidColors.map(color => (
            <button 
              key={color} 
              onClick={() => onSelect('color', color)} 
              style={{ backgroundColor: color }} 
              className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center transition-transform ${
                currentSelection.value === color ? 'border-purple-500 scale-110' : 'border-gray-200 hover:scale-105'
              }`}
            >
              {currentSelection.value === color && <Check className="w-3 h-3 text-white mix-blend-difference" />}
            </button>
          ))}
        </div>
      )}
      
      {activeTab === 'gradients' && (
        <div className="grid grid-cols-3 gap-2">
          {gradients.map((gradient, index) => (
            <button 
              key={index} 
              onClick={() => onSelect('gradient', gradient)} 
              style={{ background: gradient }} 
              className={`w-full h-16 rounded-lg border-2 flex items-center justify-center transition-transform ${
                currentSelection.value === gradient ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
              }`}
            >
              {currentSelection.value === gradient && <Check className="w-4 h-4 text-white mix-blend-difference" />}
            </button>
          ))}
        </div>
      )}
      
      {['art', 'photos', 'textures'].includes(activeTab) && (
        <div className="grid grid-cols-2 gap-2">
          {(activeTab === 'art' ? artIllustrations : 
            activeTab === 'photos' ? photos : textures).map((url, index) => (
            <button 
              key={index} 
              onClick={() => onSelect('image', url)} 
              className={`w-full h-20 rounded-lg border-2 overflow-hidden transition-transform relative ${
                currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
              }`}
            >
              <img src={url} alt={`${activeTab} ${index + 1}`} className="w-full h-full object-cover" />
              {currentSelection.value === url && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                  <Check className="w-4 h-4 text-white" />
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
            className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-4 text-center w-full"
          >
            <h3 className="text-sm font-medium text-gray-900 mb-2">Upload Custom Image</h3>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-2">
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

// Layout Selection Modal with Preview Function
const LayoutSelectionModal: React.FC<LayoutSelectionModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedLayout, 
  onSelect, 
  onPreview 
}) => {
  const [previewLayout, setPreviewLayout] = useState<LayoutType | null>(null);
  
  const handlePreview = (layout: LayoutType) => {
    setPreviewLayout(layout);
    onPreview(layout);
  };

  const sampleItems = [
    { id: '1', title: 'Sample 1', content: 'Content 1' },
    { id: '2', title: 'Sample 2', content: 'Content 2' },
    { id: '3', title: 'Sample 3', content: 'Content 3' },
    { id: '4', title: 'Sample 4', content: 'Content 4' },
  ];

  const renderMiniPreview = (layout: LayoutType) => {
    const layoutFunction = getLayoutFunction(layout);
    const positions = layoutFunction(4, 120, 80);
    
    return (
      <div className="relative w-full h-16 bg-gray-50 rounded border overflow-hidden">
        {sampleItems.map((item, index) => {
          const pos = positions[index];
          return (
            <div
              key={item.id}
              className="absolute bg-blue-200 rounded"
              style={{
                top: pos.top * 0.4,
                left: pos.left * 0.4,
                width: pos.width * 0.4,
                height: pos.height * 0.4,
                minWidth: '8px',
                minHeight: '8px'
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a format</DialogTitle>
          <DialogDescription>
            Select the layout that best fits your content organization needs.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 p-4">
          {layoutOptions.map((option) => (
            <div 
              key={option.id} 
              className={`border rounded-lg p-4 space-y-3 cursor-pointer transition-all ${
                selectedLayout === option.id 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : previewLayout === option.id
                  ? 'border-green-500 bg-green-50 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
              onClick={() => onSelect(option.id)}
            >
              <div className="flex items-center justify-center text-4xl mb-2">
                {option.icon}
              </div>
              <div>
                <h3 className="font-medium text-base">{option.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{option.description}</p>
                <p className="text-xs text-gray-500 mb-3">{option.preview}</p>
              </div>
              {renderMiniPreview(option.id)}
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(option.id);
                    onClose();
                  }}
                  className="flex-1"
                  size="sm"
                  variant={selectedLayout === option.id ? "default" : "outline"}
                >
                  Select
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview(option.id);
                  }}
                  className="flex-1"
                >
                  Preview
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Settings Panel Component - Matches the reference image
const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  canvasTitle,
  setCanvasTitle,
  canvasDescription,
  setCanvasDescription,
  selectedLayout,
  setSelectedLayout,
  wallpaper,
  onWallpaperChange,
  commentsEnabled,
  setCommentsEnabled,
  reactionsEnabled,
  setReactionsEnabled,
  newPostsAtTop,
  setNewPostsAtTop
}) => {
  const selectedLayoutInfo = layoutOptions.find(l => l.id === selectedLayout);

  const getBackgroundStyle = () => {
    switch (wallpaper.type) {
      case 'color':
        return { backgroundColor: wallpaper.value };
      case 'gradient':
        return { background: wallpaper.value };
      case 'image':
        return { backgroundImage: `url("${wallpaper.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
      default:
        return { backgroundColor: '#22c55e' };
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <Tabs defaultValue="heading" className="w-full">
          <TabsList className="grid w-full grid-cols-6 text-xs px-2">
            <TabsTrigger value="heading" className="text-xs">Heading</TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
            <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
            <TabsTrigger value="engagement" className="text-xs">Engagement</TabsTrigger>
            <TabsTrigger value="posts" className="text-xs">Posts</TabsTrigger>
            <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
          </TabsList>
          
          <div className="px-6 py-4">
            <TabsContent value="heading" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Heading</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-700">Title</Label>
                    <Input
                      value={canvasTitle}
                      onChange={(e) => setCanvasTitle(e.target.value)}
                      placeholder="Timeline"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Description</Label>
                    <Input
                      value={canvasDescription}
                      onChange={(e) => setCanvasDescription(e.target.value)}
                      placeholder="Scroll to view"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Icon</Label>
                    <Button variant="outline" className="w-full justify-between mt-1">
                      <Calendar className="w-4 h-4" />
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Appearance</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Wallpaper</Label>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between mt-1 h-12"
                      onClick={onWallpaperChange}
                    >
                      <div 
                        className="w-8 h-6 rounded border"
                        style={getBackgroundStyle()}
                      />
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Color scheme</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="flex-1">Dark</Button>
                      <Button variant="default" size="sm" className="flex-1 bg-purple-600">Light</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Font</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="default" size="sm" className="bg-purple-600">ABaa</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Post size</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="default" size="sm" className="flex-1 bg-purple-600">Standard</Button>
                      <Button variant="outline" size="sm" className="flex-1">Wide</Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="layout" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Layout</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Format</Label>
                    <p className="text-xs text-gray-500 mb-2">Choose how posts are laid out.</p>
                    <Button variant="outline" className="w-full justify-between">
                      <div className="flex items-center gap-2">
                        <AlignJustify className="w-4 h-4" />
                        <span>Stream</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Group posts by section</Label>
                    </div>
                    <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="engagement" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Engagement</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Comments</Label>
                      <p className="text-xs text-gray-500">Allow visitors to comment on posts</p>
                    </div>
                    <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Reactions</Label>
                      <p className="text-xs text-gray-500">Allow visitors to react to posts</p>
                    </div>
                    <Switch checked={reactionsEnabled} onCheckedChange={setReactionsEnabled} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="posts" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Posts</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">New posts at top</Label>
                      <p className="text-xs text-gray-500">Place newest posts at the beginning</p>
                    </div>
                    <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Content</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Allowed content types</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <label className="text-sm">Text</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <label className="text-sm">Images</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <label className="text-sm">Videos</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <label className="text-sm">Links</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

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

// Main CanvasSetupPage Component
const CanvasSetupPage: React.FC = () => {
  // State management
  const [currentView, setCurrentView] = useState<'setup' | 'wallpaper'>('setup');
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('wall');
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [wallpaper, setWallpaper] = useState<WallpaperSelection>({
    type: 'color',
    value: '#22c55e'
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Canvas settings
  const [canvasTitle, setCanvasTitle] = useState('');
  const [canvasDescription, setCanvasDescription] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  
  // Mock data for preview
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

  // Handlers
  const handleWallpaperSelect = (type: string, value: string) => {
    setWallpaper({ type: type as 'color' | 'gradient' | 'image', value });
    setCurrentView('setup');
  };

  const handleFileSelect = async (file: File) => {
    setUploadingImage(true);
    setUploadError(null);
    
    try {
      // Simulate file upload - replace with actual upload logic
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
    setSelectedLayout(layout);
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

  // Get background style for preview
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

  // Render preview based on layout
  const renderLayoutPreview = () => {
    if (selectedLayout === 'columns') {
      return (
        <div className="flex overflow-x-auto pb-4 h-96">
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

    // For other layouts, show positioned padlets
    const layoutFunction = getLayoutFunction(selectedLayout);
    const positions = layoutFunction(samplePadlets.length, 800, 400);

    return (
      <div className="relative w-full h-96 overflow-hidden">
        {samplePadlets.map((padlet, index) => {
          const position = positions[index];
          if (!position) return null;
          
          return (
            <div
              key={padlet.id}
              className="absolute bg-white rounded-lg p-3 shadow-md border cursor-pointer hover:shadow-lg transition-shadow"
              style={{
                top: Math.max(0, position.top),
                left: Math.max(0, position.left),
                width: Math.min(position.width, 200),
                height: Math.min(position.height, 150),
                maxWidth: '200px',
                maxHeight: '150px'
              }}
            >
              <h4 className="font-medium text-sm mb-1 truncate">{padlet.title}</h4>
              <p className="text-xs text-gray-600 line-clamp-3 overflow-hidden">{padlet.content}</p>
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
      {/* Header */}
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
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" onClick={() => setLayoutModalOpen(true)}>
                Layout
              </Button>
              <Button onClick={handleSaveCanvas}>
                Create Canvas
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Preview Panel */}
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Preview - {layoutOptions.find(l => l.id === selectedLayout)?.name} Layout</CardTitle>
                <p className="text-sm text-gray-500">
                  This is how your canvas will look with the current settings
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('wallpaper')}
                className="flex items-center gap-2"
              >
                <div 
                  className="w-4 h-4 rounded border"
                  style={getBackgroundStyle()}
                />
                Change Wallpaper
              </Button>
            </div>
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

      {/* Layout Selection Modal */}
      <LayoutSelectionModal
        isOpen={layoutModalOpen}
        onClose={() => setLayoutModalOpen(false)}
        selectedLayout={selectedLayout}
        onSelect={setSelectedLayout}
        onPreview={handleLayoutPreview}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canvasTitle={canvasTitle}
        setCanvasTitle={setCanvasTitle}
        canvasDescription={canvasDescription}
        setCanvasDescription={setCanvasDescription}
        selectedLayout={selectedLayout}
        setSelectedLayout={setSelectedLayout}
        wallpaper={wallpaper}
        onWallpaperChange={() => setCurrentView('wallpaper')}
        commentsEnabled={commentsEnabled}
        setCommentsEnabled={setCommentsEnabled}
        reactionsEnabled={reactionsEnabled}
        setReactionsEnabled={setReactionsEnabled}
        newPostsAtTop={newPostsAtTop}
        setNewPostsAtTop={setNewPostsAtTop}
      />
    </div>
  );
};

// Main page component - temporarily without ProtectedRoute for testing
export default function CreateCanvasPage() {
  return <CanvasSetupPage />;
}