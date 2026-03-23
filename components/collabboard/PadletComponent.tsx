// components/collabboard/PadletComponent.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Edit3,
  Trash2,
  Copy,
  Move,
  Heart,
  MessageCircle,
  Share2,
  Upload,
  Eye,
  Download,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { LayoutType, PadletPosition } from '@/lib/collabboard/types';

interface Padlet {
  id: string;
  canvas_id: string;
  title: string;
  content: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  type?: string;
  metadata?: Record<string, any>;
}

interface PadletComponentProps {
  padlet: Padlet;
  position: PadletPosition;
  onUpdate: (updates: Partial<Padlet>) => void;
  onDelete: () => void;
  layout: LayoutType;
  settings?: Record<string, any>;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function PadletComponent({
  padlet,
  position,
  onUpdate,
  onDelete,
  layout,
  settings = {},
  isSelected = false,
  onSelect
}: PadletComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(padlet.title);
  const [editContent, setEditContent] = useState(padlet.content);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageNaturalHeight, setImageNaturalHeight] = useState<number>(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Helper functions
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType?.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const isImage = padlet.file_type?.startsWith('image/');
  const hasFile = !!padlet.file_url;

  // ✅ Enhanced auto-resize calculation that considers actual image dimensions
  const calculateOptimalHeight = (title: string, content: string, includeFileHeight = true) => {
    const padletWidth = position.width - 48; // Account for padding
    const averageCharWidth = 7;
    const charsPerLine = Math.floor(padletWidth / averageCharWidth);

    // Calculate title height
    const titleLines = Math.max(1, Math.ceil(title.length / charsPerLine));
    const titleHeight = titleLines * 24;

    // Calculate content height more accurately
    let contentHeight = 0;
    const contentLines = content.split('\n');

    contentLines.forEach(line => {
      if (line.trim() === '') {
        contentHeight += 20; // Empty line
      } else {
        const wrappedLines = Math.max(1, Math.ceil(line.length / charsPerLine));
        contentHeight += wrappedLines * 18; // 18px per content line
      }
    });

    // Component heights
    const headerHeight = 80; // Header area
    const paddingHeight = 60; // Top/bottom padding and margins

    // ✅ Dynamic file preview height based on actual image dimensions
    let filePreviewHeight = 0;
    if (includeFileHeight && hasFile) {
      if (isImage && imageNaturalHeight > 0) {
        // Calculate proportional height based on padlet width and image aspect ratio
        const imageWidth = padletWidth;
        const aspectRatio = imageNaturalHeight / (imageRef.current?.naturalWidth || imageWidth);
        const calculatedImageHeight = Math.min(300, imageWidth * aspectRatio); // Max 300px height
        filePreviewHeight = calculatedImageHeight + 20; // Add padding

        console.log(`🖼️ Image auto-sizing:
          - Natural: ${imageRef.current?.naturalWidth}x${imageRef.current?.naturalHeight}
          - Container width: ${imageWidth}px
          - Aspect ratio: ${aspectRatio.toFixed(2)}
          - Calculated height: ${calculatedImageHeight}px`);
      } else if (isImage) {
        filePreviewHeight = 200; // Default for loading images
      } else {
        filePreviewHeight = 80; // Document preview space
      }
    }

    const totalHeight = headerHeight + titleHeight + contentHeight + paddingHeight + filePreviewHeight;
    const minHeight = 200;
    const calculatedHeight = Math.max(minHeight, totalHeight);

    console.log(`📏 Auto-resize calculation for "${title}":
      - Padlet width: ${padletWidth}px (${charsPerLine} chars/line)
      - Title: ${titleLines} lines = ${titleHeight}px
      - Content: ${contentLines.length} lines → ${contentHeight}px
      - File preview: ${filePreviewHeight}px (${isImage ? 'image' : hasFile ? 'file' : 'none'})
      - Total: ${calculatedHeight}px (min: ${minHeight}px)`);

    return calculatedHeight;
  };

  // ✅ Auto-resize when image loads
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageNaturalHeight(img.naturalHeight);

    console.log(`🖼️ Image loaded: ${img.naturalWidth}x${img.naturalHeight}`);

    // Trigger resize after image dimensions are known
    setTimeout(() => {
      const newHeight = calculateOptimalHeight(padlet.title, padlet.content, true);
      if (Math.abs(newHeight - padlet.height) > 10) { // Only resize if significant difference
        console.log(`🔄 Auto-resizing padlet for loaded image: ${padlet.height}px → ${newHeight}px`);
        onUpdate({ height: newHeight });
      }
    }, 100);
  };

  // Handle file upload with better auto-resize
  const handleFileUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB');
      return;
    }

    setIsUploading(true);

    try {
      const publicUrl = URL.createObjectURL(file);
      console.log('📎 File uploaded:', file.name, file.type, `${(file.size / 1024).toFixed(1)}KB`);

      // For images, we'll let the onLoad event handle the final resize
      let initialHeight = padlet.height;
      if (!file.type.startsWith('image/')) {
        // For non-images, calculate immediately
        initialHeight = calculateOptimalHeight(padlet.title, padlet.content, true);
      }

      onUpdate({
        file_url: publicUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        height: initialHeight
      });

    } catch (err) {
      console.error('File upload failed:', err);
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Handle editing with auto-resize
  const handleSaveEdit = () => {
    const updatedTitle = editTitle.trim() || 'Untitled';
    const updatedContent = editContent;

    const newHeight = calculateOptimalHeight(updatedTitle, updatedContent, true);

    console.log(`✏️ Saving edit with auto-resize: ${padlet.height}px → ${newHeight}px`);

    onUpdate({
      title: updatedTitle,
      content: updatedContent,
      height: newHeight
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(padlet.title);
    setEditContent(padlet.content);
    setIsEditing(false);
  };

  // Drag functionality (freeform layout only)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (layout !== 'freeform' || isEditing) return;

    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (isEditing) {
      e.preventDefault();
      return;
    }

    // Prepare data for the library
    const data = {
      id: padlet.id,
      title: padlet.title,
      content: padlet.content,
      type: padlet.type || 'note',
      metadata: {
        file_url: padlet.file_url,
        file_name: padlet.file_name,
        file_type: padlet.file_type
      }
    };

    e.dataTransfer.setData('application/collabboard-padlet', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';

    // Also set as generic text for external apps
    e.dataTransfer.setData('text/plain', padlet.title || padlet.content || 'Padlet');
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragStartPos.current.x;
    const newY = e.clientY - dragStartPos.current.y;

    onUpdate({
      position_x: Math.max(0, newX),
      position_y: Math.max(0, newY)
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Get style based on layout and position
  const getPositionStyle = () => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: position.x,
      top: position.y,
      width: position.width,
      height: position.height,
      zIndex: isDragging || isSelected ? 1000 : 1,
    };

    switch (layout) {
      case 'freeform':
        return {
          ...baseStyle,
          cursor: isDragging ? 'grabbing' : 'grab',
        };

      default:
        return {
          ...baseStyle,
          cursor: 'pointer',
          transition: isDragging ? 'none' : 'all 0.2s ease',
        };
    }
  };

  const cardStyle = getPositionStyle();

  return (
    <>
      <Card
        ref={cardRef}
        style={cardStyle}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        className={`
          group transition-all duration-200 flex flex-col
          ${isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}
          ${isDragging ? 'shadow-2xl rotate-1 opacity-80' : ''}
          ${layout === 'freeform' && isDragging ? 'select-none' : ''}
        `}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onSelect}
      >
        {/* Header */}
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-sm font-medium"
                placeholder="Padlet title..."
                autoFocus
              />
            ) : (
              <h3
                className="text-sm font-medium line-clamp-2 flex-1"
                onDoubleClick={() => setIsEditing(true)}
              >
                {padlet.title}
              </h3>
            )}

            {/* Action Menu */}
            <div className={`
              flex items-center gap-1 transition-opacity duration-200
              ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}
            `}>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Heart className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle className="h-3 w-3" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-48 bg-white border shadow-lg z-50">
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    {hasFile ? 'Replace File' : 'Add Image/File'}
                  </DropdownMenuItem>

                  <DropdownMenuItem>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>

                  <DropdownMenuItem>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </DropdownMenuItem>

                  {layout === 'freeform' && (
                    <DropdownMenuItem>
                      <Move className="h-4 w-4 mr-2" />
                      Move to Front
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden">
          {isEditing ? (
            <div className="space-y-3 h-full">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Add content..."
                className="min-h-[120px] resize-none w-full"
                rows={Math.max(6, editContent.split('\n').length + 2)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Upload Status */}
              {isUploading && (
                <div className="mb-3 flex-shrink-0">
                  <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md">
                    <Upload className="h-4 w-4 text-blue-500 animate-pulse" />
                    <span className="text-sm text-blue-700">Uploading file...</span>
                  </div>
                </div>
              )}

              {/* ✅ Enhanced File Preview with Auto-Expanding Images */}
              {hasFile && !isUploading && (
                <div className="mb-3 flex-shrink-0">
                  {isImage ? (
                    <div className="relative">
                      <img
                        ref={imageRef}
                        src={padlet.file_url}
                        alt={padlet.file_name}
                        className="w-full object-cover rounded-md cursor-pointer border"
                        style={{
                          maxHeight: 'none', // ✅ Remove fixed height constraint!
                          height: 'auto'     // ✅ Let image expand naturally
                        }}
                        onClick={() => window.open(padlet.file_url, '_blank')}
                        onLoad={handleImageLoad}
                        onError={() => console.error('Image failed to load:', padlet.file_url)}
                      />
                      <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        <ImageIcon className="h-3 w-3 inline mr-1" />
                        {padlet.file_name}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border">
                      {getFileIcon(padlet.file_type!)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{padlet.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {padlet.file_size ? formatFileSize(padlet.file_size) : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => window.open(padlet.file_url, '_blank')}
                          title="View file"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = padlet.file_url!;
                            a.download = padlet.file_name!;
                            a.click();
                          }}
                          title="Download file"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Text Content */}
              <div
                className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed flex-1"
                style={{
                  minHeight: '40px',
                  overflow: 'visible',
                  lineHeight: '1.5'
                }}
                onDoubleClick={() => setIsEditing(true)}
              >
                {padlet.content || (
                  <span className="italic text-muted-foreground/60">
                    Double-click to add content...
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>

        {/* Resize Handle (Freeform only) */}
        {layout === 'freeform' && (isHovered || isSelected) && (
          <div
            className="absolute bottom-0 right-0 w-3 h-3 bg-primary/20 hover:bg-primary/40 cursor-se-resize"
            style={{
              clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
            }}
          />
        )}

        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute -inset-1 border-2 border-primary rounded-lg pointer-events-none" />
        )}
      </Card>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept="image/*,application/pdf,.doc,.docx,.txt"
        className="hidden"
      />
    </>
  );
}

export const EnhancedPadlet = (props: any) => {
  return null;
};
