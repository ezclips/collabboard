"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent, // NEW
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
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogDescription,
//   DialogFooter,
// } from "@/components/ui/dialog";
// import DeleteConfirmModal from '@/components/modals/DeleteConfirmModal';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { WallContainerContextMenu } from '@/components/collabboard/context-menus/WallContainerContextMenu';
import PostCardContent from '@/components/collabboard/PostCardContent';
import CardShell from '@/components/collabboard/shells/CardShell';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';

import { Padlet } from "@/types/collabboard";

// Removed local Padlet interface to use shared type

interface WallCanvasProps {
  padlets: Padlet[];      // Only root items
  allPadlets?: Padlet[];  // NEW: Complete dataset including children
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
  onOpenTarget?: (padlet: Padlet) => void; // For opening specific child posts from containers
  onPadletCreate?: () => void;
  onReorder?: (padlets: Padlet[]) => void;
  userAvatar?: string;
  // Comment handling for interactive comments inside containers
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[]) => void;
}

interface SortablePadletProps {
  padlet: Padlet;
  isEditable: boolean;
  onEdit: (padlet: Padlet) => void;
  onDelete: (id: string) => void;
  // Context Menu Handlers
  onDuplicate?: (padlet: Padlet) => void;
  onChangeColor?: (id: string, color: string) => void;
  onOpen?: (padlet: Padlet) => void;
  onOpenTarget?: (padlet: Padlet) => void; // For opening specific child posts from containers
  onCopyLink?: (padlet: Padlet) => void;
  onAddBefore?: (padlet: Padlet) => void;
  onAddAfter?: (padlet: Padlet) => void;
  onSelect?: (id: string) => void;
  // Helpers for container rendering
  getChildren: (id: string) => Padlet[];
  allPadlets: Padlet[];
  // Comment handling for interactive comments inside containers
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[]) => void;
}



// Sortable Post Card Component
const SortablePadletCard: React.FC<SortablePadletProps> = ({
  padlet,
  isEditable,
  onEdit,
  onDelete,
  getChildren,
  allPadlets,
  onDuplicate,
  onChangeColor,
  onOpen,
  onOpenTarget,
  onCopyLink,
  onAddBefore,
  onAddAfter,
  onSelect,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
}) => {
  // Helper to generate a label for the open target submenu
  const getOpenTargetLabel = (p: Padlet): string => {
    const rawType = p.type || (p.metadata as any)?.kind || 'post';
    return String(rawType).replace(/_/g, ' ');
  };

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

  const isContainer = padlet.type === 'container' ||
    (padlet.metadata as any)?.kind === 'container' ||
    (padlet.metadata as any)?.isContainer;

  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isContainer ? '' : ''}`}
      {...attributes}
      data-container-id={isContainer ? padlet.id : undefined}
      onMouseEnter={() => isContainer && console.log('[WALL][CONTAINER][ENTER]', padlet.id)}
      onMouseLeave={() => isContainer && console.log('[WALL][CONTAINER][LEAVE]', padlet.id)}
    >
      {isContainer ? (
        <WallContainerContextMenu
          padlet={padlet}
          onSelect={() => onSelect?.(padlet.id)}
          onEdit={isEditable ? () => onEdit(padlet) : undefined}
          onDelete={isEditable ? () => onDelete(padlet.id) : undefined}
          onDuplicate={isEditable ? () => onDuplicate?.(padlet) : undefined}
          onChangeColor={isEditable ? (color) => onChangeColor?.(padlet.id, color) : undefined}
          onOpen={() => onOpen?.(padlet)}
          openTargets={getChildren(padlet.id)}
          onOpenTarget={onOpenTarget}
          getOpenTargetLabel={getOpenTargetLabel}
          onCopyLink={() => onCopyLink?.(padlet)}
          onAddBefore={isEditable ? () => onAddBefore?.(padlet) : undefined}
          onAddAfter={isEditable ? () => onAddAfter?.(padlet) : undefined}
        >
          <div
            className={`select-none w-full cursor-grab active:cursor-grabbing ${isDragging ? "opacity-60 scale-[0.99]" : ""}`}
            {...listeners}
          >
            <CardShell
              padletId={padlet.id}
              isContainer
              title={padlet.title || undefined}
              cardColor={padlet.metadata?.cardColor || '#ffffff'}
              topStripColor={padlet.metadata?.topStrip && padlet.metadata.topStrip !== 'transparent' ? padlet.metadata.topStrip : null}
              onEdit={isEditable ? () => onEdit(padlet) : undefined}
              onExpandToggle={canExpand ? () => setIsExpanded(prev => !prev) : undefined}
              isExpanded={isExpanded}
              className={isDragging ? 'ring-2 ring-blue-400' : ''}
            >
              <RowColumnContainerCard
                padlet={padlet}
                allPadlets={allPadlets}
                showHeader={false}
                isContentOnly
                isExpanded={isExpanded}
                onExpandAvailabilityChange={setCanExpand}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserAvatar={currentUserAvatar}
                onUpdateChildComments={onUpdateChildComments}
              />
            </CardShell>
          </div>
        </WallContainerContextMenu>
      ) : null}
    </div>
  );
};

// Drop indicator for Wall Grid layout
function GridDropIndicator() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none z-50">
      <div className="w-full h-full bg-purple-600 rounded-full shadow-[0_2px_8px_rgba(168,85,247,0.6)] transition-all duration-100" />
    </div>
  );
}

// Main Wall Canvas Component
const WallCanvas: React.FC<WallCanvasProps> = ({
  padlets,
  allPadlets,
  canvasId,
  canvasSettings = {},
  isEditable = true,
  onPadletUpdate,
  onPadletDelete,
  onPadletEdit,
  onOpenTarget,
  onPadletCreate,
  onReorder,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, setSelectedPadletId] = useState<string | null>(null);
  const [orderedPadlets, setOrderedPadlets] = useState<Padlet[]>([]);
  const [postsPerRow, setPostsPerRow] = useState(6);

  // Responsive layout: Update columns based on screen width
  useEffect(() => {
    const handleResize = () => {
      // 280px card + 16px gap. px-10 (40px) * 2 = 80px padding.
      // (280 * n) + (16 * (n-1)) <= window.innerWidth - 80
      const cardWidth = 280;
      const gap = 16;
      const padding = 80;
      const availableWidth = window.innerWidth - padding;

      const cols = Math.floor((availableWidth + gap) / (cardWidth + gap));
      setPostsPerRow(Math.max(1, cols));
    };

    handleResize(); // Initial calculation
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<{ row: number; col: number; } | null>(null);

  // const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // const [isDeleting, setIsDeleting] = useState(false);

  // Direct delete handler (bypassing local modal since CanvasClient handles logic now)
  const handleDirectDelete = (id: string) => {
    onPadletDelete?.(id);
  };

  const handleDuplicateContainer = async (container: Padlet) => {
    try {
      const newId = crypto.randomUUID();
      const duplicate = {
        ...container,
        id: newId,
        title: container.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...container.metadata,
          wallPosition: ((container.metadata as any)?.wallPosition || 0) + 1
        }
      };

      // Optimistic update
      setOrderedPadlets(prev => [...prev, duplicate]);

      // Insert to database
      const { error } = await supabase
        .from('padlets')
        .insert(duplicate);

      if (error) throw error;
      toast.success('Container duplicated');
    } catch (err) {
      console.error('Failed to duplicate container:', err);
      toast.error('Failed to duplicate container');
    }
  };

  const handleChangeContainerColor = async (containerId: string, color: string) => {
    try {
      const container = orderedPadlets.find(p => p.id === containerId);
      if (!container) return;

      const updatedMetadata = {
        ...container.metadata,
        cardColor: color, // Ensure consistent naming (cardColor vs backgroundColor)
        backgroundColor: color
      };

      // Optimistic update
      setOrderedPadlets(prev => prev.map(p =>
        p.id === containerId
          ? { ...p, metadata: updatedMetadata }
          : p
      ));

      // Update database is handled via onPadletUpdate propagation normally, 
      // but if we want ensuring locally first:
      onPadletUpdate?.({ ...container, metadata: updatedMetadata });

      const { error } = await supabase
        .from('padlets')
        .update({ metadata: updatedMetadata })
        .eq('id', containerId);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to change color:', err);
      toast.error('Failed to change color');
    }
  };



  const handleOpenContainer = (container: Padlet) => {
    onPadletEdit?.(container);
  };

  const handleCopyLink = (container: Padlet) => {
    const url = `${window.location.origin}/dashboard/canvas/${canvasId}#${container.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const handleAddContainerAt = async (position: number) => {
    const newContainer = {
      id: crypto.randomUUID(),
      board_id: canvasId,
      title: 'New Container',
      content: '',
      type: 'container',
      position_x: 0,
      position_y: 0,
      width: 280,
      height: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        childPadletIds: [],
        wallPosition: position,
        kind: 'container',
        isContainer: true,
        cardColor: '#ffffff'
      }
    };

    // Shift existing containers
    const updatedPadlets = orderedPadlets.map(p => {
      const pPos = (p.metadata as any)?.wallPosition || 0;
      if (p.type === 'container' && pPos >= position) {
        return {
          ...p,
          metadata: {
            ...p.metadata,
            wallPosition: pPos + 1
          }
        };
      }
      return p;
    });

    // Add new container and update state
    setOrderedPadlets([...updatedPadlets, newContainer as any]);

    // Persist to database
    try {
      await supabase.from('padlets').insert(newContainer);
      // Bulk update positions could be heavy, maybe just update affected ones?
      // Ideally we call a stored proc or update affected items.
      // For now, we rely on the fact that new posts are at top or sorted by position.
      // Since we optimistically updated, visual order is correct.
    } catch (e) {
      console.error("Failed to persist container creation", e);
    }
  };

  const handleAddContainerBefore = (container: Padlet) => {
    const currentPos = (container.metadata as any)?.wallPosition || 0;
    handleAddContainerAt(currentPos);
  };

  const handleAddContainerAfter = (container: Padlet) => {
    const currentPos = (container.metadata as any)?.wallPosition || 0;
    handleAddContainerAt(currentPos + 1);
  };

  // Use allPadlets if provided, fallback to padlets for backward compatibility
  const completePadletSet = useMemo(() => allPadlets || padlets, [allPadlets, padlets]);

  const padletById = useMemo(() => new Map(completePadletSet.map((p) => [p.id, p])), [completePadletSet]);

  const getChildren = useCallback((containerId: string) => {
    const container = completePadletSet.find((p) => p.id === containerId);
    const childIds = (container?.metadata as any)?.childPadletIds || [];

    if (childIds.length > 0) {
      return childIds
        .map((childId: string) => padletById.get(childId))
        .filter(Boolean) as Padlet[];
    }

    return completePadletSet.filter(
      (p) => p.metadata?.parentId === containerId
    );
  }, [completePadletSet, padletById]);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 15, // 15px movement required before drag starts
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

  const handleDragMove = (event: DragMoveEvent) => {
    const { over, active } = event;

    if (!over || !active) {
      setDropIndicatorPosition(null);
      return;
    }

    // Don't show indicator when hovering over self
    if (over.id === active.id) {
      setDropIndicatorPosition(null);
      return;
    }

    // Find positions
    const activeIndex = orderedPadlets.findIndex(p => p.id === active.id);
    const overIndex = orderedPadlets.findIndex(p => p.id === over.id);

    if (activeIndex === -1 || overIndex === -1) {
      setDropIndicatorPosition(null);
      return;
    }

    // Calculate grid position using the SAME center-out algorithm as rendering
    const row = Math.floor(overIndex / postsPerRow);
    const positionInRow = overIndex % postsPerRow;

    // Get the center-out column order
    const centerOutOrder = getCenterOutPositions(postsPerRow);
    const col = centerOutOrder[positionInRow];

    setDropIndicatorPosition({ row, col });
  };

  // Handle drag end - reorder posts
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDropIndicatorPosition(null); // Clear indicator

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

  // Handle actions
  const handleEdit = (padlet: Padlet) => {
    onPadletEdit?.(padlet);
  };

  // const handleDelete = (id: string) => {
  //   setSelectedPadletId(id);
  //   setShowDeleteConfirm(true);
  // };

  return (
    <div
      className="min-h-screen w-full overflow-y-auto overflow-x-hidden"
      style={getBackgroundStyle()}
    >
      {/* Canvas Header - REMOVED per user request */}

      {/* Wall Grid */}
      <div className="px-10 py-6 w-full">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setDropIndicatorPosition(null);
          }}
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
                <div className="space-y-4 w-full flex flex-col items-center pb-20">
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
                          gridTemplateColumns: `repeat(${postsPerRow}, minmax(280px, 280px))`,
                        }}
                      >
                        {rowSlots.map((slot, colIndex) => (
                          <div key={`${rowIndex}-${colIndex}`} className="min-h-[100px] relative">
                            {/* Show indicator if this is the drop position */}
                            {dropIndicatorPosition?.row === rowIndex &&
                              dropIndicatorPosition?.col === colIndex && (
                                <GridDropIndicator />
                              )}

                            {slot && (
                              <SortablePadletCard
                                padlet={slot.padlet}
                                isEditable={isEditable}
                                onEdit={handleEdit}
                                onDelete={handleDirectDelete}
                                getChildren={getChildren}
                                allPadlets={completePadletSet}
                                onDuplicate={handleDuplicateContainer}
                                onChangeColor={handleChangeContainerColor}
                                onOpen={handleOpenContainer}
                                onOpenTarget={onOpenTarget}
                                onCopyLink={handleCopyLink}
                                onAddBefore={handleAddContainerBefore}
                                onAddAfter={handleAddContainerAfter}
                                onSelect={setSelectedPadletId}
                                currentUserId={currentUserId}
                                currentUserName={currentUserName}
                                currentUserAvatar={currentUserAvatar}
                                onUpdateChildComments={onUpdateChildComments}
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
            {activeId ? (
              <div className="opacity-80 rotate-2 cursor-grabbing pointer-events-none">
                {(() => {
                  const post = padletById.get(activeId);
                  if (!post) return null;
                  return (
                    <div className="w-[280px] bg-white rounded-lg shadow-md border border-gray-200 p-3">
                      <PostCardContent
                        padlet={post}
                        allPadlets={completePadletSet}
                      />
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Empty State */}
        {orderedPadlets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-xl font-semibold mb-2">Your Wall is Empty</h2>
            <p className="text-sm mb-4">Start adding posts from the left toolbar to build your wall</p>
            {isEditable && (
              <button
                onClick={() => onPadletCreate?.()}
                disabled={!onPadletCreate}
                className={`px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors ${!onPadletCreate ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                + Create First Post
              </button>
            )}
          </div>
        )}
      </div>


      {/* Delete Confirmation Modal */}
      {/* Delete Confirmation Modal - REMOVED (Handled by CanvasClient in hybrid mode) */}
      {/* <DeleteConfirmModal
        isOpen={showDeleteConfirm && !isDeleting}
        onClose={() => {
          setShowDeleteConfirm(false);
          setSelectedPadletId(null);
        }}
        onConfirm={executeDelete}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        isLoading={isDeleting}
      /> */}
    </div >
  );
};

export default WallCanvas;
