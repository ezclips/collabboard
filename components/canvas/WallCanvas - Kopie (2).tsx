"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Edit2, Trash2, Pin, Heart, MessageCircle, Share } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';

import { Padlet } from "@/types/collabboard";

// Removed local Padlet interface to use shared type

interface WallCanvasProps {
  padlets: Padlet[];
  canvasId: string;
  canvasSettings?: {
    background_type?: 'color' | 'gradient' | 'image';
    background_value?: string;
    comments_enabled?: boolean;
    new_posts_at_top?: boolean;
  };
  isEditable?: boolean;
  onPadletUpdate?: (padlet: Padlet) => void;
  onPadletDelete?: (padletId: string) => void;
  onPadletEdit?: (padlet: Padlet) => void;
  onPadletCreate?: () => void;
  onReorder?: (padlets: Padlet[]) => void;
  userName?: string;
  userAvatar?: string;
}

interface SortablePadletProps {
  padlet: Padlet;
  position: number;
  isEditable: boolean;
  commentsEnabled: boolean;
  onEdit: (padlet: Padlet) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onLike: (id: string) => void;
}

// Sortable Post Card Component
const SortablePadletCard: React.FC<SortablePadletProps> = ({
  padlet,
  position,
  isEditable,
  commentsEnabled,
  onEdit,
  onDelete,
  onPin,
  onLike,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: padlet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    scale: isDragging ? 0.98 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const cardColor = padlet.metadata?.cardColor || '#ffffff';
  const topStrip = padlet.metadata?.topStrip;
  const author = (padlet.metadata as any)?.author || 'R. Rain';

  // Calculate relative time (unchanged)
  const getRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'just now';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'less than a minute ago';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} from now`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
      {...attributes}
    >
      {/* Position Badge — ONLY visible while dragging */}
      {isDragging && (
        <div className="absolute -top-3 -right-3 z-20 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg border-2 border-white">
          {position}
        </div>
      )}

      <div
        className={`bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:shadow-xl ${isDragging ? 'shadow-2xl ring-2 ring-blue-400' : ''
          }`}
        style={{ backgroundColor: cardColor }}
        {...listeners}
      >
        {/* Top Strip */}
        {topStrip && topStrip !== 'transparent' && (
          <div className="h-1.5" style={{ backgroundColor: topStrip }} />
        )}

        {/* Author Header */}
        <div className="flex items-center gap-2 p-3 pb-2">
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
            {author.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{author}</p>
            <p className="text-xs text-gray-500">{getRelativeTime(padlet.created_at)}</p>
          </div>

          {/* Actions Menu */}
          {isEditable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-white">
                <DropdownMenuItem onClick={() => onEdit(padlet)}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(padlet.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPin(padlet.id)}>
                  <Pin className="mr-2 h-4 w-4" />
                  {padlet.is_pinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Card Content (title, content, etc.) — keep your existing content rendering */}
        <div className="p-3 pt-0">
          {padlet.file_url && padlet.file_type?.startsWith('image/') && (
            <div className="mb-2 rounded overflow-hidden border border-gray-100">
              <img
                src={padlet.file_url}
                alt={padlet.file_name || 'Image'}
                className="w-full h-auto object-cover"
                style={{ maxHeight: '200px' }}
              />
            </div>
          )}

          {padlet.title && (
            <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
              {padlet.title}
            </h3>
          )}
          {padlet.content && (
            <p className="text-sm text-gray-700 line-clamp-4">
              {padlet.content}
            </p>
          )}
        </div>

        {/* Footer with comments/likes/etc. — keep as-is */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <button onClick={() => onLike(padlet.id)} className="hover:text-red-500 transition-colors flex items-center gap-1">
              ❤️ {padlet.likes_count || 0}
            </button>
            <span className="flex items-center gap-1">
              💬 {0} {/* replace with real comment count later */}
            </span>
          </div>
          {commentsEnabled && (
            <button className="hover:text-blue-500 transition-colors">
              + Add comment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Main Wall Canvas Component
const WallCanvas: React.FC<WallCanvasProps> = ({
  padlets,
  canvasId,
  canvasSettings = {},
  isEditable = true,
  onPadletUpdate,
  onPadletDelete,
  onPadletEdit,
  onPadletCreate,
  onReorder,
  userName = 'User',
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orderedPadlets, setOrderedPadlets] = useState<Padlet[]>([]);
  const [postsPerRow, setPostsPerRow] = useState(7); // Default from screenshot

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  /**
   * Calculate center-out position indices for a row
   * Pattern: center, right of center, left of center, right+1, left+1, etc.
   * 
   * For 7 columns (indices 0-6), center is 3:
   * Order: 3, 4, 2, 5, 1, 6, 0
   * 
   * This creates a visual pattern where posts fill from the middle outward
   */
  const getCenterOutPositions = useCallback((columnsPerRow: number): number[] => {
    const positions: number[] = [];
    const center = Math.floor(columnsPerRow / 2);

    positions.push(center); // First position is center

    let offset = 1;
    while (positions.length < columnsPerRow) {
      // Add right of center
      if (center + offset < columnsPerRow) {
        positions.push(center + offset);
      }
      // Add left of center  
      if (center - offset >= 0 && positions.length < columnsPerRow) {
        positions.push(center - offset);
      }
      offset++;
    }

    return positions;
  }, []);

  /**
   * Assign grid positions to padlets using center-out pattern
   * Each row fills from center outward before moving to the next row
   */
  const assignGridPositions = useCallback((
    posts: Padlet[],
    columnsPerRow: number
  ): { padlet: Padlet; row: number; col: number; displayOrder: number }[] => {
    const centerOutOrder = getCenterOutPositions(columnsPerRow);
    const result: { padlet: Padlet; row: number; col: number; displayOrder: number }[] = [];

    posts.forEach((padlet, index) => {
      const row = Math.floor(index / columnsPerRow);
      const positionInRow = index % columnsPerRow;
      const col = centerOutOrder[positionInRow];

      result.push({
        padlet,
        row,
        col,
        displayOrder: index + 1,
      });
    });

    return result;
  }, [getCenterOutPositions]);

  // Calculate wall layout positions
  // Posts populate: 1st=center, 2nd=right of center, 3rd=left of center, etc.
  const calculateWallOrder = useCallback((posts: Padlet[], newPostsAtTop: boolean): Padlet[] => {
    if (!posts.length) return [];

    // Sort by wallPosition if available, otherwise by created_at
    const sorted = [...posts].sort((a, b) => {
      const posA = ((a.metadata as any)?.wallPosition as number | undefined) ?? Number.MAX_SAFE_INTEGER;
      const posB = ((b.metadata as any)?.wallPosition as number | undefined) ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;

      // Fallback to created_at
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return newPostsAtTop ? dateB - dateA : dateA - dateB;
    });

    return sorted;
  }, []);

  // Initialize ordered padlets
  useEffect(() => {
    const ordered = calculateWallOrder(padlets, canvasSettings.new_posts_at_top || false);
    setOrderedPadlets(ordered);
  }, [padlets, canvasSettings.new_posts_at_top, calculateWallOrder]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end - reorder posts
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = orderedPadlets.findIndex(p => p.id === active.id);
    const newIndex = orderedPadlets.findIndex(p => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder array
    const newOrder = [...orderedPadlets];
    const [movedItem] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, movedItem);

    // Update wallPosition metadata for all items
    const updatedPadlets = newOrder.map((p, idx) => ({
      ...p,
      metadata: {
        ...p.metadata,
        wallPosition: idx,
      },
    }));

    setOrderedPadlets(updatedPadlets);
    onReorder?.(updatedPadlets);
  };

  // Get background style from canvas settings
  const getBackgroundStyle = (): React.CSSProperties => {
    const { background_type, background_value } = canvasSettings;

    if (background_type === 'color' && background_value) {
      return { backgroundColor: background_value };
    }
    if (background_type === 'gradient' && background_value) {
      return { background: background_value };
    }
    if (background_type === 'image' && background_value) {
      return {
        backgroundImage: `url("${background_value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    return { backgroundColor: '#f8f4ee' }; // Default warm background like Padlet
  };

  // Active padlet for drag overlay
  const activePadlet = activeId ? orderedPadlets.find(p => p.id === activeId) : null;

  // Handle actions
  const handleEdit = (padlet: Padlet) => {
    onPadletEdit?.(padlet);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this post?')) {
      onPadletDelete?.(id);
    }
  };

  const handlePin = (id: string) => {
    const padlet = orderedPadlets.find(p => p.id === id);
    if (padlet) {
      onPadletUpdate?.({
        ...padlet,
        is_pinned: !padlet.is_pinned,
      });
    }
  };

  const handleLike = (id: string) => {
    const padlet = orderedPadlets.find(p => p.id === id);
    if (padlet) {
      onPadletUpdate?.({
        ...padlet,
        likes_count: (padlet.likes_count || 0) + 1,
      });
    }
  };

  return (
    <div
      className="min-h-screen w-full overflow-y-auto overflow-x-hidden"
      style={getBackgroundStyle()}
    >
      {/* Canvas Header - REMOVED per user request */}

      {/* Wall Grid */}
      <div className="p-6 max-w-screen-2xl mx-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedPadlets.map(p => p.id)}
            strategy={rectSortingStrategy}
          >
            {/* 
              Wall Grid with Center-Out Positioning
              Posts are visually placed from center outward in each row:
              Row pattern for 7 columns: 4, 5, 3, 6, 2, 7, 1 (center, right, left, right, left...)
            */}
            {(() => {
              // Get grid positions using center-out algorithm
              const gridPositions = assignGridPositions(orderedPadlets, postsPerRow);

              // Calculate total rows
              const totalRows = Math.ceil(orderedPadlets.length / postsPerRow);

              // Render rows
              return (
                <div className="space-y-4">
                  {Array.from({ length: totalRows }).map((_, rowIndex) => {
                    // Get all items in this row
                    const rowItems = gridPositions.filter(item => item.row === rowIndex);

                    // Create an array with slots for each column position
                    const rowSlots: (typeof rowItems[0] | null)[] = Array(postsPerRow).fill(null);
                    rowItems.forEach(item => {
                      rowSlots[item.col] = item;
                    });

                    return (
                      <div
                        key={rowIndex}
                        className="grid gap-4"
                        style={{
                          gridTemplateColumns: `repeat(${postsPerRow}, minmax(0, 1fr))`,
                        }}
                      >
                        {rowSlots.map((slot, colIndex) => (
                          <div key={`${rowIndex}-${colIndex}`} className="min-h-[100px]">
                            {slot && (
                              <SortablePadletCard
                                padlet={slot.padlet}
                                position={slot.displayOrder}
                                isEditable={isEditable}
                                commentsEnabled={canvasSettings.comments_enabled ?? true}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onPin={handlePin}
                                onLike={handleLike}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </SortableContext>

          {/* Drag Overlay */}
          <DragOverlay>
            {activePadlet && (
              <div className="bg-white rounded-lg shadow-2xl border-2 border-blue-400 p-3 opacity-90">
                <h3 className="font-medium text-sm">{activePadlet.title || 'Untitled'}</h3>
                <p className="text-xs text-gray-500 truncate">{activePadlet.content}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Empty State */}
        {orderedPadlets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-xl font-semibold mb-2">Your Wall is Empty</h2>
            <p className="text-sm mb-4">Start adding posts to build your wall</p>
            {isEditable && (
              <button
                onClick={onPadletCreate}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                + Create First Post
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WallCanvas;
