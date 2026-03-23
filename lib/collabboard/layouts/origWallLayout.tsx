// lib/collabboard/layouts/WallLayout.tsx

import React, { useState, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Edit2,
  Plus,
  Trash2,
  Image,
  Type,
  Heart,
  Bookmark,
  Share,
  ArrowUp,
  ArrowDown,
  Pin,
  Copy,
  ExternalLink
} from "lucide-react";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface WallConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Masonry layout settings
  columnCount: 'auto' | number;
  columnWidth: number;
  gapSize: number;
  minColumnWidth: number;
  maxColumnWidth: number;

  // Dynamic sizing
  autoHeight: boolean;
  minHeight: number;
  maxHeight: number;
  heightVariation: 'none' | 'subtle' | 'moderate' | 'high';
  aspectRatioRange: { min: number; max: number };

  // Content fitting
  contentBasedHeight: boolean;
  imageAspectRatio: 'preserve' | 'force-square' | 'force-portrait' | 'force-landscape';
  textHeightMultiplier: number; // Factor for text content height

  // Visual settings
  cardStyle: 'flat' | 'raised' | 'floating' | 'outlined';
  cardRadius: 'none' | 'small' | 'medium' | 'large' | 'rounded';
  shadowIntensity: 'none' | 'subtle' | 'medium' | 'strong';
  hoverEffect: 'none' | 'lift' | 'scale' | 'tilt' | 'glow';

  // Pinterest-style features
  showPinButton: boolean;
  showOverlayOnHover: boolean;
  showQuickActions: boolean;
  enableImageZoom: boolean;
  showAuthorInfo: boolean;
  showEngagementStats: boolean;

  // Spacing and padding
  cardPadding: 'none' | 'small' | 'medium' | 'large';
  headerPadding: 'none' | 'small' | 'medium' | 'large';
  contentPadding: 'none' | 'small' | 'medium' | 'large';

  // Typography
  titleStyle: 'simple' | 'bold' | 'elegant' | 'modern';
  titleSize: 'small' | 'medium' | 'large' | 'xl';
  contentStyle: 'minimal' | 'comfortable' | 'spacious';
  fontFamily: 'system' | 'serif' | 'sans' | 'mono';

  // Background and colors
  backgroundColor: string;
  cardBackground: string;
  textColor: string;
  accentColor: string;
  overlayColor: string;
  overlayOpacity: number;

  // Interaction settings
  clickBehavior: 'edit' | 'expand' | 'zoom' | 'navigate';
  enableDoubleClick: boolean;
  enableRightClick: boolean;
  enableKeyboardNavigation: boolean;

  // Loading and performance
  lazyLoading: boolean;
  preloadImages: boolean;
  virtualScrolling: boolean;
  infiniteScroll: boolean;
  itemsPerPage: number;

  // Animation settings
  animateOnScroll: boolean;
  entranceAnimation: 'none' | 'fade' | 'slide' | 'scale' | 'flip';
  animationDelay: number;
  animationDuration: 'fast' | 'normal' | 'slow';
  staggerDelay: number;

  // Responsive settings
  responsiveColumns: {
    mobile: number;
    tablet: number;
    desktop: number;
    wide: number;
  };

  // Collaboration settings
  realTimeUpdates: boolean;
  showUserAvatars: boolean;
  enableLikes: boolean;
  enableComments: boolean;
  enableSharing: boolean;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
  itemPermissions: { [itemId: string]: 'read' | 'write' | 'admin' };
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  image_url?: string;
  background_color?: string;
  text_color?: string;
  height_override?: number; // Custom height for this item
  width_override?: number; // Custom width for this item
  tags?: string[];
  likes_count?: number;
  comments_count?: number;
  is_pinned?: boolean;
  is_featured?: boolean;
  author_name?: string;
  author_avatar?: string;
  category?: string;
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface WallItem extends Padlet {
  calculatedHeight: number;
  calculatedWidth: number;
  column: number;
  position: PadletPosition;
}

export interface WallPreviewProps {
  columns: ColumnData[];
  canvasId: string; // Make sure this line exists
  config: Partial<WallConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
  onLikeItem?: (padletId: string) => void;
  onPinItem?: (padletId: string) => void;
  onShareItem?: (padletId: string) => void;
}

export interface WallLiveCanvasProps extends WallPreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (items: Padlet[]) => void;
  onReorder?: (items: Padlet[]) => void;
}

export interface WallSettingsProps {
  config: WallConfig;
  onChange: (config: Partial<WallConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Wall Layout - Arranges padlets in a masonry/Pinterest-style grid
 * Creates dynamic heights and flowing layout
 */
export function calculateWallPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  if (count === 0) return [];

  const positions: PadletPosition[] = [];
  const padding = 20;
  const gap = 16;
  const columnWidth = 240;

  // Calculate number of columns that fit
  const availableWidth = canvasWidth - (2 * padding);
  const columns = Math.max(1, Math.floor(availableWidth / (columnWidth + gap)));
  const adjustedColumnWidth = (availableWidth - ((columns - 1) * gap)) / columns;

  // Track column heights
  const columnHeights = new Array(columns).fill(0);

  // Generate positions for each item
  for (let i = 0; i < count; i++) {
    // Find shortest column
    const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));

    // Calculate position
    const x = padding + (shortestColumn * (adjustedColumnWidth + gap));
    const y = padding + columnHeights[shortestColumn];

    // Dynamic height based on index (simulating content variety)
    const baseHeight = 200;
    const heightVariation = 100;
    const dynamicHeight = baseHeight + (Math.sin(i * 0.5) * heightVariation);
    const height = Math.max(150, Math.min(400, dynamicHeight));

    positions.push({
      top: y,
      left: x,
      width: adjustedColumnWidth,
      height: height
    });

    // Update column height
    columnHeights[shortestColumn] += height + gap;
  }

  return positions;
}

// ============================================================================
// WALL CARD COMPONENT (FIXED VERSION)
// ============================================================================

export const WallCard: React.FC<{
  padlet: Padlet;
  position: PadletPosition;
  config: Partial<WallConfig>;
  onEdit?: (padlet: Padlet) => void;
  onDelete?: (padletId: string) => void;
  onLike?: (padletId: string) => void;
  onPin?: (padletId: string) => void;
  onShare?: (padletId: string) => void;
}> = ({
  padlet,
  position,
  config = {},
  onEdit,
  onDelete,
  onLike,
  onPin,
  onShare
}) => {
  const {
    cardStyle = 'raised',
    cardRadius = 'medium',
    shadowIntensity = 'medium',
    hoverEffect = 'lift',
    showPinButton = true,
    showOverlayOnHover = true,
    showQuickActions = true,
    showEngagementStats = true,
    cardPadding = 'medium'
  } = config;

  const getCardStyleClass = () => {
    const base = 'transition-all duration-300 cursor-pointer bg-white overflow-hidden';

    const styles = {
      flat: 'border border-gray-200',
      raised: 'shadow-md hover:shadow-lg',
      floating: 'shadow-lg hover:shadow-xl',
      outlined: 'border-2 border-gray-300 hover:border-blue-400'
    };

    const shadows = {
      none: '',
      subtle: 'shadow-sm hover:shadow-md',
      medium: 'shadow-md hover:shadow-lg',
      strong: 'shadow-lg hover:shadow-xl'
    };

    const hovers = {
      none: '',
      lift: 'hover:-translate-y-1',
      scale: 'hover:scale-105',
      tilt: 'hover:rotate-1',
      glow: 'hover:ring-4 hover:ring-blue-200'
    };

    const radius = {
      none: 'rounded-none',
      small: 'rounded-sm',
      medium: 'rounded-lg',
      large: 'rounded-xl',
      rounded: 'rounded-2xl'
    };

    return `${base} ${styles[cardStyle]} ${shadows[shadowIntensity]} ${hovers[hoverEffect]} ${radius[cardRadius]}`;
  };

  const getPaddingClass = () => {
    switch (cardPadding) {
      case 'none': return 'p-0';
      case 'small': return 'p-2';
      case 'large': return 'p-6';
      default: return 'p-4';
    }
  };

  // FIXED: Event handlers with proper propagation control
  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🖊️ EDIT CLICKED for:', padlet.title);
    onEdit?.(padlet);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🗑️ DELETE CLICKED for:', padlet.title);
    // Using a custom message box instead of window.confirm
    if (confirm(`Delete "${padlet.title}"?`)) { // Placeholder for custom modal
      onDelete?.(padlet.id);
    }
  };

  const handlePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('📌 PIN CLICKED for:', padlet.title);
    onPin?.(padlet.id);
  };

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('❤️ LIKE CLICKED for:', padlet.title);
    onLike?.(padlet.id);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔗 SHARE CLICKED for:', padlet.title);
    onShare?.(padlet.id);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Only trigger edit if clicking directly on the card (not dropdown)
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.card-content')) {
      console.log('📝 Card clicked, triggering edit for:', padlet.title);
      onEdit?.(padlet);
    }
  };

  return (
    <div
      className={`absolute ${getCardStyleClass()} group`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        backgroundColor: padlet.background_color || 'white',
        color: padlet.text_color || 'inherit'
      }}
      onClick={handleCardClick}
    >
      {/* Image if present */}
      {padlet.image_url && (
        <div className="relative w-full h-2/3 overflow-hidden">
          <img
            src={padlet.image_url}
            alt={padlet.title}
            className="w-full h-full object-cover"
          />

          {/* Hover Overlay */}
          {showOverlayOnHover && (
            <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {showQuickActions && (
                <div className="flex gap-2">
                  {showPinButton && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-white/90 hover:bg-white"
                      onClick={handlePin}
                    >
                      <Pin size={16} />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/90 hover:bg-white"
                    onClick={handleShare}
                  >
                    <Share size={16} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className={`card-content ${getPaddingClass()}`}>
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-sm line-clamp-2 flex-1">
            {padlet.title}
          </h3>

          {/* FIXED: More Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('🔧 Dropdown trigger clicked');
                }}
              >
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-48 bg-white border border-gray-200 shadow-lg"
              onClick={(e) => e.stopPropagation()} // Prevent dropdown close on content click
            >
              <DropdownMenuItem 
                onClick={handleEdit}
                className="cursor-pointer hover:bg-gray-50"
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit post
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={handlePin}
                className="cursor-pointer hover:bg-gray-50"
              >
                <Pin className="mr-2 h-4 w-4" />
                {padlet.is_pinned ? 'Unpin' : 'Pin'} post
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('📋 Copy link clicked');
                  // Copy link logic here
                }}
                className="cursor-pointer hover:bg-gray-50"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={handleShare}
                className="cursor-pointer hover:bg-gray-50"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Share post
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('⬆️ Move up clicked');
                }}
                className="cursor-pointer hover:bg-gray-50"
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                Move up
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('⬇️ Move down clicked');
                }}
                className="cursor-pointer hover:bg-gray-50"
              >
                <ArrowDown className="mr-2 h-4 w-4" />
                Move down
              </DropdownMenuItem>

              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-xs text-gray-600 line-clamp-3 mb-3">
          {padlet.content}
        </p>

        {/* Tags */}
        {padlet.tags && padlet.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {padlet.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                #{tag}
              </span>
            ))}
            {padlet.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{padlet.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Engagement Stats */}
        {showEngagementStats && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              {padlet.likes_count !== undefined && (
                <button
                  className="flex items-center gap-1 hover:text-red-500 transition-colors"
                  onClick={handleLike}
                >
                  <Heart size={12} />
                  {padlet.likes_count}
                </button>
              )}
              {padlet.comments_count !== undefined && (
                <span className="flex items-center gap-1">
                  <Type size={12} />
                  {padlet.comments_count}
                </span>
              )}
            </div>

            {padlet.is_pinned && (
              <Pin size={12} className="text-blue-500" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// WALL PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const WallPreview: React.FC<WallPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem,
  onLikeItem,
  onPinItem,
  onShareItem
}) => {
  const { newPostsAtTop = false, columnCount = 'auto' } = config;

  // Get all padlets and apply ordering
  const allPadlets = columns.flatMap(col => col.items);
  const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

  // Calculate positions and wall items
  const wallItems = useMemo(() => {
    if (displayedPadlets.length === 0) return [];

    const containerWidth = 1200; // Preview container width
    const positions = calculateWallPositions(displayedPadlets.length, containerWidth);

    return displayedPadlets.map((padlet, index) => ({
      ...padlet,
      calculatedHeight: positions[index]?.height || 200,
      calculatedWidth: positions[index]?.width || 240,
      column: Math.floor(index / Math.ceil(displayedPadlets.length / 3)),
      position: positions[index] || { top: 0, left: 0, width: 240, height: 200 }
    }));
  }, [displayedPadlets]);

  // Calculate container height
  const containerHeight = useMemo(() => {
    if (wallItems.length === 0) return 400;
    const maxBottom = Math.max(...wallItems.map(item => item.position.top + item.position.height));
    return maxBottom + 40; // Add padding
  }, [wallItems]);

  if (displayedPadlets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        Add some content to see the Wall layout preview
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-transparent rounded-lg border-0 overflow-auto">
      <div
        className="relative mx-auto rounded-lg shadow-none"
        style={{
          width: '1200px',
          height: `${containerHeight}px`,
          backgroundColor: config.backgroundColor === 'transparent' ? 'transparent' : (config.backgroundColor || 'white')
        }}
      >
        {wallItems.map((item) => (
          <WallCard
            key={item.id}
            padlet={item}
            position={item.position}
            config={config}
            onEdit={(padlet) => {
              const sourceColumn = columns.find(col =>
                col.items.some(item => item.id === padlet.id)
              );
              onEditItem(padlet, sourceColumn?.id);
            }}
            onDelete={(padletId) => {
              const sourceColumn = columns.find(col =>
                col.items.some(item => item.id === padletId)
              );
              if (sourceColumn && onDeleteItem) {
                onDeleteItem(padletId, sourceColumn.id);
              }
            }}
            onLike={onLikeItem}
            onPin={onPinItem}
            onShare={onShareItem}
          />
        ))}

        {/* Add New Item Floating Button */}
        <div className="absolute bottom-4 right-4">
          <Button
            className="rounded-full w-12 h-12 shadow-lg hover:shadow-xl"
            onClick={() => {
              if (columns.length > 0) {
                onAddPost(columns[0].id);
              }
            }}
          >
            <Plus size={24} />
          </Button>
        </div>
      </div>

      {/* Wall Info */}
      <div className="flex justify-center items-center gap-4 mt-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <Image size={16} />
          {wallItems.length} items
        </span>
        <span>Masonry layout</span>
        <span>
          {Math.max(...wallItems.map(item => item.column)) + 1} columns
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// WALL PRODUCTION CANVAS COMPONENT (FIXED VERSION)
// ============================================================================

export const WallProductionCanvas: React.FC<WallPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem,
  onLikeItem,
  onPinItem,
  onShareItem
}) => {
  const { newPostsAtTop = false } = config;

  // Get all padlets and apply ordering
  const allPadlets = columns.flatMap(col => col.items);
  const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

  // Calculate positions and wall items with responsive container width
  const wallItems = useMemo(() => {
    if (displayedPadlets.length === 0) return [];

    // Get actual container width or use fallback
    const containerWidth = typeof window !== 'undefined' ?
      (window.innerWidth - 100) : 1200; // Account for padding

    const positions = calculateWallPositions(displayedPadlets.length, containerWidth);

    return displayedPadlets.map((padlet, index) => ({
      ...padlet,
      calculatedHeight: positions[index]?.height || 200,
      calculatedWidth: positions[index]?.width || 240,
      column: Math.floor(index / Math.ceil(displayedPadlets.length / 4)), // Better column calculation
      position: positions[index] || { top: 0, left: 0, width: 240, height: 200 }
    }));
  }, [displayedPadlets]);

  // Calculate total height for container
  const containerHeight = useMemo(() => {
    if (wallItems.length === 0) return 400;
    const maxBottom = Math.max(...wallItems.map(item => item.position.top + item.position.height));
    return Math.max(400, maxBottom + 100); // Ensure minimum height
  }, [wallItems]);

  // FIXED: Add post handler with logging
  const handleAddPost = () => {
    console.log('🆕 ADD POST clicked from floating button');
    if (columns.length > 0) {
      onAddPost(columns[0].id);
    }
  };

  if (displayedPadlets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Your Wall is Empty</h3>
          <p className="text-gray-500 mb-4">Add your first post to get started.</p>
          <button
            onClick={handleAddPost}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
          >
            <Plus size={16} />
            Add First Post
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full relative"
      style={{ minHeight: `${containerHeight}px` }}
    >
      {/* Production wall items - Clean, no background containers */}
      {wallItems.map((item) => (
        <WallCard
          key={item.id}
          padlet={item}
          position={item.position}
          config={{
            ...config,
            cardStyle: config.cardStyle || 'raised',
            showPinButton: config.showPinButton !== false,
            showOverlayOnHover: config.showOverlayOnHover !== false,
            showQuickActions: config.showQuickActions !== false,
            showEngagementStats: config.showEngagementStats !== false,
            cardPadding: config.cardPadding || 'medium'
          }}
          onEdit={(padlet) => {
            const sourceColumn = columns.find(col =>
              col.items.some(item => item.id === padlet.id)
            );
            console.log('📝 Production Edit triggered for:', padlet.title);
            onEditItem(padlet, sourceColumn?.id);
          }}
          onDelete={(padletId) => {
            const sourceColumn = columns.find(col =>
              col.items.some(item => item.id === padletId)
            );
            if (sourceColumn && onDeleteItem) {
              console.log('🗑️ Production Delete triggered for:', padletId);
              onDeleteItem(padletId, sourceColumn.id);
            }
          }}
          onLike={(padletId) => {
            console.log('❤️ Production Like triggered for:', padletId);
            onLikeItem?.(padletId);
          }}
          onPin={(padletId) => {
            console.log('📌 Production Pin triggered for:', padletId);
            onPinItem?.(padletId);
          }}
          onShare={(padletId) => {
            console.log('🔗 Production Share triggered for:', padletId);
            onShareItem?.(padletId);
          }}
        />
      ))}

      {/* FIXED: Floating Add Button - Working perfectly */}
      <button
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        style={{ 
          zIndex: 9999,
          position: 'fixed',
          pointerEvents: 'auto',
          cursor: 'pointer'
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🆕 FLOATING BUTTON CLICKED!');
          handleAddPost();
        }}
        title="Add new post"
      >
        <Plus size={24} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* Optional: Wall Statistics Bar */}
      {wallItems.length > 0 && (
        <div className="fixed bottom-6 left-6 z-40 bg-black/20 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <span>{wallItems.length} posts</span>
          <span>•</span>
          <span>{Math.max(...wallItems.map(item => item.column)) + 1} columns</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// WALL LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const WallLiveCanvas: React.FC<WallLiveCanvasProps> = ({
  canvasId,
  isEditable,
  columns,
  config = {},
  collaborators = [],
  onEditItem,
  onAddPost,
  onDeleteItem,
  onLikeItem,
  onPinItem,
  onShareItem,
  onSave,
  onReorder
}) => {
  // TODO: Implement live wall functionality
  // - Infinite scroll masonry
  // - Real-time collaborative pinning
  // - Live reactions and engagement
  // - Drag and drop reordering
  // - Advanced filtering and search
  // - Pinterest-style image zoom
  // - Social features (likes, shares, comments)

  return (
    <div className="relative w-full h-full">
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Wall Live Canvas</h3>
          <p>Canvas ID: {canvasId}</p>
          <p>Editable: {isEditable ? 'Yes' : 'No'}</p>
          <p>Collaborators: {collaborators.length}</p>
          <p>Items: {columns.reduce((sum, col) => sum + col.items.length, 0)}</p>
          <p className="text-sm text-gray-400 mt-2">Coming soon...</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// WALL SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const WallSettings: React.FC<WallSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  // TODO: Implement wall-specific settings
  // - Masonry layout controls (columns, spacing)
  // - Card styling and appearance
  // - Pinterest-style features
  // - Engagement and social features
  // - Content-based dynamic sizing
  // - Animation and interaction settings
  // - Performance and loading options

  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Wall Settings</h3>

      <div className="text-gray-500">
        <p>Wall-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Masonry layout configuration</li>
          <li>Card styling and visual effects</li>
          <li>Pinterest-style interactions</li>
          <li>Social engagement features</li>
          <li>Content-based dynamic sizing</li>
          <li>Animation and hover effects</li>
          <li>Responsive column settings</li>
          <li>Performance optimization</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultWallConfig: WallConfig = {
  // Current settings
  newPostsAtTop: false,

  // Masonry layout
  columnCount: 'auto',
  columnWidth: 240,
  gapSize: 16,
  minColumnWidth: 200,
  maxColumnWidth: 320,

  // Dynamic sizing
  autoHeight: true,
  minHeight: 150,
  maxHeight: 500,
  heightVariation: 'moderate',
  aspectRatioRange: { min: 0.6, max: 1.8 },

  // Content fitting
  contentBasedHeight: true,
  imageAspectRatio: 'preserve',
  textHeightMultiplier: 1.2,

  // Visual settings
  cardStyle: 'raised',
  cardRadius: 'medium',
  shadowIntensity: 'medium',
  hoverEffect: 'lift',

  // Pinterest features
  showPinButton: true,
  showOverlayOnHover: true,
  showQuickActions: true,
  enableImageZoom: false,
  showAuthorInfo: false,
  showEngagementStats: true,

  // Spacing
  cardPadding: 'medium',
  headerPadding: 'small',
  contentPadding: 'medium',

  // Typography
  titleStyle: 'simple',
  titleSize: 'medium',
  contentStyle: 'comfortable',
  fontFamily: 'system',

  // Colors
  backgroundColor: '#f9fafb',
  cardBackground: '#ffffff',
  textColor: '#111827',
  accentColor: '#3b82f6',
  overlayColor: '#000000',
  overlayOpacity: 0.4,

  // Interaction
  clickBehavior: 'edit',
  enableDoubleClick: false,
  enableRightClick: true,
  enableKeyboardNavigation: true,

  // Performance
  lazyLoading: true,
  preloadImages: false,
  virtualScrolling: false,
  infiniteScroll: false,
  itemsPerPage: 50,

  // Animation
  animateOnScroll: false,
  entranceAnimation: 'fade',
  animationDelay: 100,
  animationDuration: 'normal',
  staggerDelay: 50,

  // Responsive
  responsiveColumns: {
    mobile: 1,
    tablet: 2,
    desktop: 3,
    wide: 4
  },

  // Collaboration
  realTimeUpdates: true,
  showUserAvatars: false,
  enableLikes: true,
  enableComments: true,
  enableSharing: true,

  // Access control
  viewPermissions: 'public',
  editPermissions: 'collaborators',
  itemPermissions: {}
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const calculateMasonryLayout = (
  items: Padlet[],
  containerWidth: number,
  config: Partial<WallConfig> = {}
): WallItem[] => {
  const {
    columnCount = 'auto',
    columnWidth = 240,
    gapSize = 16,
    minHeight = 150,
    maxHeight = 500
  } = config;

  const padding = 20;
  const availableWidth = containerWidth - (2 * padding);

  // Calculate columns
  let columns: number;
  if (columnCount === 'auto') {
    columns = Math.max(1, Math.floor(availableWidth / (columnWidth + gapSize)));
  } else {
    columns = Math.max(1, columnCount);
  }

  const adjustedColumnWidth = (availableWidth - ((columns - 1) * gapSize)) / columns;
  const columnHeights = new Array(columns).fill(0);

  return items.map((item, index) => {
    // Find shortest column
    const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));

    // Calculate dynamic height based on content
    let height = item.height_override || minHeight;
    if (config.contentBasedHeight) {
      const contentLength = item.content.length;
      const titleLength = item.title.length;
      height = Math.max(minHeight, Math.min(maxHeight,
        minHeight + (contentLength * 2) + (titleLength * 3)
      ));
    }

    // Position calculation
    const x = padding + (shortestColumn * (adjustedColumnWidth + gapSize));
    const y = padding + columnHeights[shortestColumn];

    const position: PadletPosition = {
      top: y,
      left: x,
      width: adjustedColumnWidth,
      height: height
    };

    // Update column height
    columnHeights[shortestColumn] += height + gapSize;

    return {
      ...item,
      calculatedHeight: height,
      calculatedWidth: adjustedColumnWidth,
      column: shortestColumn,
      position
    };
  });
};

export const optimizeWallLayout = (
  items: Padlet[],
  containerWidth: number,
  config: Partial<WallConfig> = {}
): { columns: number; totalHeight: number; efficiency: number } => {
  const layouts = [];

  // Try different column counts
  for (let cols = 1; cols <= 6; cols++) {
    const wallItems = calculateMasonryLayout(items, containerWidth, { ...config, columnCount: cols });
    const maxHeight = Math.max(...wallItems.map(item => item.position.top + item.position.height));
    const avgHeight = wallItems.reduce((sum, item) => sum + item.calculatedHeight, 0) / wallItems.length;
    const efficiency = avgHeight / maxHeight; // Higher is better (more compact)

    layouts.push({
      columns: cols,
      totalHeight: maxHeight,
      efficiency: efficiency
    });
  }

  // Return the most efficient layout
  return layouts.reduce((best, current) =>
    current.efficiency > best.efficiency ? current : best
  );
};

export const getWallStatistics = (items: WallItem[]): {
  totalItems: number;
  columns: number;
  averageHeight: number;
  tallestItem: number;
  shortestItem: number;
  totalHeight: number;
} => {
  if (items.length === 0) {
    return {
      totalItems: 0,
      columns: 0,
      averageHeight: 0,
      tallestItem: 0,
      shortestItem: 0,
      totalHeight: 0
    };
  }

  const heights = items.map(item => item.calculatedHeight);
  const maxBottom = Math.max(...items.map(item => item.position.top + item.position.height));
  const uniqueColumns = new Set(items.map(item => item.column)).size;

  return {
    totalItems: items.length,
    columns: uniqueColumns,
    averageHeight: heights.reduce((sum, h) => sum + h, 0) / heights.length,
    tallestItem: Math.max(...heights),
    shortestItem: Math.min(...heights),
    totalHeight: maxBottom
  };
};

export const reorderWallItems = (
  items: Padlet[],
  fromIndex: number,
  toIndex: number
): Padlet[] => {
  const newItems = [...items];
  const [removed] = newItems.splice(fromIndex, 1);
  newItems.splice(toIndex, 0, removed);
  return newItems;
};

export const filterWallItems = (
  items: Padlet[],
  filters: {
    tags?: string[];
    author?: string;
    hasImage?: boolean;
    isPinned?: boolean;
    minLikes?: number;
    searchTerm?: string;
  }
): Padlet[] => {
  return items.filter(item => {
    if (filters.tags && filters.tags.length > 0) {
      const itemTags = item.tags || [];
      if (!filters.tags.some(tag => itemTags.includes(tag))) return false;
    }

    if (filters.author && item.author_id !== filters.author) return false;

    if (filters.hasImage !== undefined) {
      const hasImage = !!item.image_url;
      if (hasImage !== filters.hasImage) return false;
    }

    if (filters.isPinned !== undefined && item.is_pinned !== filters.isPinned) return false;

    if (filters.minLikes && (item.likes_count || 0) < filters.minLikes) return false;

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const inTitle = item.title.toLowerCase().includes(term);
      const inContent = item.content.toLowerCase().includes(term);
      const inTags = (item.tags || []).some(tag => tag.toLowerCase().includes(term));
      if (!inTitle && !inContent && !inTags) return false;
    }

    return true;
  });
};

export const exportWallData = (
  items: WallItem[],
  format: 'json' | 'csv' | 'html' = 'json'
): string => {
  switch (format) {
    case 'csv':
      let csv = 'Title,Content,Column,Height,Width,Tags,Likes,Pinned\n';
      items.forEach(item => {
        csv += `"${item.title}","${item.content}",${item.column},${item.calculatedHeight},${item.calculatedWidth},"${(item.tags || []).join(';')}",${item.likes_count || 0},${item.is_pinned || false}\n`;
      });
      return csv;

    case 'html':
      let html = `
        <div class="wall-export" style="columns: ${Math.max(...items.map(i => i.column)) + 1}; column-gap: 16px;">
      `;
      items.forEach(item => {
        html += `
          <div class="wall-item" style="break-inside: avoid; margin-bottom: 16px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
            ${item.image_url ? `<img src="${item.image_url}" style="width: 100%; height: auto; margin-bottom: 8px;" />` : ''}
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${item.title}</h3>
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">${item.content}</p>
            ${item.tags && item.tags.length > 0 ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${item.tags.map(tag => `<span style="background: #f3f4f6; color: #6b7280; padding: 2px 6px; border-radius: 12px; font-size: 10px;">#${tag}</span>`).join('')}</div>` : ''}
          </div>
        `;
      });
      html += '</div>';
      return html;

    default:
      return JSON.stringify({
        items: items.map(item => ({
          ...item,
          position: item.position,
          calculatedDimensions: {
            width: item.calculatedWidth,
            height: item.calculatedHeight,
            column: item.column
          }
        })),
        statistics: getWallStatistics(items),
        exportedAt: new Date().toISOString()
      }, null, 2);
  }
};

export const generateWallThumbnail = (
  items: WallItem[],
  containerWidth: number = 400,
  containerHeight: number = 300
): string => {
  // Generate a simple SVG thumbnail representation
  const scale = containerWidth / 1200; // Scale down from full size

  let svg = `<svg width="${containerWidth}" height="${containerHeight}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#f9fafb"/>`;

  items.forEach(item => {
    const x = item.position.left * scale;
    const y = item.position.top * scale;
    const width = item.position.width * scale;
    const height = item.position.height * scale;

    // Ensure item fits within thumbnail bounds
    if (y < containerHeight) {
      const clampedHeight = Math.min(height, containerHeight - y);
      svg += `<rect x="${x}" y="${y}" width="${width}" height="${clampedHeight}" fill="white" stroke="#e5e7eb" stroke-width="1" rx="4"/>`;

      // Add a small indicator for content type
      if (item.image_url) {
        svg += `<rect x="${x + 4}" y="${y + 4}" width="${width - 8}" height="${clampedHeight * 0.6}" fill="#ddd6fe" rx="2"/>`;
      }
      svg += `<rect x="${x + 4}" y="${y + clampedHeight * 0.7}" width="${width - 8}" height="8" fill="#f3f4f6" rx="1"/>`;
      svg += `<rect x="${x + 4}" y="${y + clampedHeight * 0.85}" width="${width * 0.6}" height="6" fill="#f3f4f6" rx="1"/>`;
    }
  });

  svg += '</svg>';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};
