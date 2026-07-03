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
import { MoreVertical, Edit2, Trash2, Pin, Heart, MessageCircle, Share } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogDescription,
//   DialogFooter,
// } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
// import DeleteConfirmModal from '@/components/modals/DeleteConfirmModal';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { WallContainerContextMenu } from '@/components/collabboard/context-menus/WallContainerContextMenu';
import PostCardContent from '@/components/collabboard/PostCardContent';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import SafeHtmlContent from '@/components/collabboard/SafeHtmlContent';
import EmbeddedCommentList from '@/components/collabboard/EmbeddedCommentList';

import { Padlet } from "@/types/collabboard";

// Removed local Padlet interface to use shared type

interface RowCanvasProps {
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
    onPadletCreate?: () => void;
    onReorder?: (padlets: Padlet[]) => void;
    userName?: string;
    userAvatar?: string;
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    onUpdateChildComments?: (childId: string, comments: any[]) => void;
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
    // Context Menu Handlers
    onDuplicate?: (padlet: Padlet) => void;
    onChangeColor?: (id: string, color: string) => void;
    onOpen?: (padlet: Padlet) => void;
    onCopyLink?: (padlet: Padlet) => void;
    onAddBefore?: (padlet: Padlet) => void;
    onAddAfter?: (padlet: Padlet) => void;
    onDeleteContainer?: (id: string) => void; // Now uses the same handler as onDelete
    onSelect?: (id: string) => void;
    // Helpers for container rendering
    getChildCount: (id: string) => number;
    getChildren: (id: string) => Padlet[];
    getAccentColor: (p: Padlet) => string;
    getTitle: (p: Padlet) => string;
    allPadlets: Padlet[];
    // Comment handling
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    onUpdateChildComments?: (childId: string, comments: any[]) => void;
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
    getChildCount,
    getChildren,
    getAccentColor,
    getTitle,
    allPadlets,
    onDuplicate,
    onChangeColor,
    onOpen,
    onCopyLink,
    onAddBefore,
    onAddAfter,
    onDeleteContainer,
    onSelect,
    currentUserId,
    currentUserName,
    currentUserAvatar,
    onUpdateChildComments,
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

    // Determine if it's a container
    const isContainer = padlet.type === 'container' ||
        (padlet.metadata as any)?.kind === 'container' ||
        (padlet.metadata as any)?.isContainer;

    // For RowCanvas, we fetch children to render them horizontally
    const children = isContainer ? getChildren(padlet.id) : [];
    // Match the visual order (row is rendered right-to-left via flex-row-reverse)
    const openTargets = isContainer ? [...children].reverse() : [];

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group ${isContainer ? '' : ''}`}
            {...attributes}
            data-container-id={isContainer ? padlet.id : undefined}
            onMouseEnter={() => isContainer && console.log('[ROW][CONTAINER][ENTER]', padlet.id)}
            onMouseLeave={() => isContainer && console.log('[ROW][CONTAINER][LEAVE]', padlet.id)}
        >
            {isContainer ? (
                <WallContainerContextMenu
                    padlet={padlet}
                    onSelect={() => onSelect?.(padlet.id)}
                    restrictToMenuTrigger
                    onEdit={isEditable ? () => onEdit(padlet) : undefined}
                    onDelete={isEditable ? () => onDelete(padlet.id) : undefined}
                    onDuplicate={isEditable ? () => onDuplicate?.(padlet) : undefined}
                    onChangeColor={isEditable ? (color) => onChangeColor?.(padlet.id, color) : undefined}
                    onOpen={() => onOpen?.(padlet)}
                    openTargets={openTargets}
                    onOpenTarget={isEditable ? (target) => onEdit(target) : undefined}
                    getOpenTargetLabel={(target) => target.type || 'post'}
                    onCopyLink={() => onCopyLink?.(padlet)}
                    onAddBefore={isEditable ? () => onAddBefore?.(padlet) : undefined}
                    onAddAfter={isEditable ? () => onAddAfter?.(padlet) : undefined}
                >
                    <div
                        // Use same container wrapper styles as WallCanvas, but overflow-x-auto for row behavior
                        // We keep the responsive width clamp to match Wall consistency
                        className={`group relative bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all border border-gray-300/80 overflow-visible px-5 py-4 min-h-[160px] w-[clamp(180px,85vw,280px)] cursor-grab active:cursor-grabbing select-none ${isDragging ? "opacity-60 scale-[0.99] ring-2 ring-blue-400" : ""}`}
                        style={{ backgroundColor: padlet.metadata?.cardColor || "#fff" }}
                        {...listeners}
                    >
                        {/* Top Strip */}
                        {padlet.metadata?.topStrip && padlet.metadata.topStrip !== "transparent" && (
                            <div
                                className="absolute top-0 left-0 w-full h-1.5"
                                style={{ backgroundColor: padlet.metadata.topStrip }}
                            />
                        )}

                        {/* Edit Button */}
                        {isEditable && (
                            <button
                                data-post-menu-trigger="true"
                                data-no-drag="true"
                                onMouseDownCapture={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onEdit(padlet);
                                }}
                                className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-gray-800 hover:bg-black/5 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                                title="Edit post"
                            >
                                <Edit2 size={16} />
                            </button>
                        )}

                        {/* Content Area - Header */}
                        <div className="mb-2">
                            <h3 className="font-bold text-gray-800 break-words">{padlet.title || "Untitled Container"}</h3>
                            {padlet.content && <SafeHtmlContent content={padlet.content} className="text-xs text-gray-500" />}
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-gray-100 w-full my-2" />

                        {/* Children ROW - The core difference for RowCanvas */}
                        {/* flex-row-reverse makes them flow right-to-left? User said "right->left" 
                 Wait, standard row is left-to-right. "right->left" usually implies RTL or 
                 maybe they meant they append to the right?
                 Plan says: "so the row flows right->left"
                 Usually user means Hebrew/Arabic OR they mean "starts at right"?
                 Or maybe just "horizontal sequence".
                 Let's stick to Plan: "Use flex flex-row-reverse"
             */}
                        <div className="flex flex-row-reverse overflow-x-auto gap-2 pb-2 min-h-[50px] items-start">
                            {children.length > 0 ? (
                                children.map(child => (
                                    <div key={child.id} className={child.type === 'comment' ? 'w-full' : 'w-[240px] shrink-0'}>
                                        {child.type === 'comment' && onUpdateChildComments ? (
                                            <EmbeddedCommentList
                                                comments={(child.metadata as any)?.comments || []}
                                                badgeColor={(child.metadata as any)?.badgeColor}
                                                currentUserId={currentUserId}
                                                currentUserName={currentUserName}
                                                currentUserAvatar={currentUserAvatar}
                                                onSubmit={(text) => {
                                                    const newComment = {
                                                        id: `comment-${Date.now()}`,
                                                        text,
                                                        userId: currentUserId || 'anonymous',
                                                        userName: currentUserName || 'Anonymous',
                                                        userAvatar: currentUserAvatar,
                                                        timestamp: Date.now(),
                                                    };
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    onUpdateChildComments(child.id, [...existingComments, newComment]);
                                                }}
                                                onEditComment={(commentId, newText) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const updated = existingComments.map((c: any) =>
                                                        c.id === commentId ? { ...c, text: newText } : c
                                                    );
                                                    onUpdateChildComments(child.id, updated);
                                                }}
                                                onRemoveComment={(commentId) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const filtered = existingComments.filter((c: any) => c.id !== commentId);
                                                    onUpdateChildComments(child.id, filtered);
                                                }}
                                                onToggleStrikethrough={(commentId) => {
                                                    const existingComments = (child.metadata as any)?.comments || [];
                                                    const updated = existingComments.map((c: any) =>
                                                        c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                                                    );
                                                    onUpdateChildComments(child.id, updated);
                                                }}
                                            />
                                        ) : (
                                            <PostCardContent
                                                padlet={child}
                                                allPadlets={allPadlets}
                                                currentUserId={currentUserId}
                                                currentUserName={currentUserName}
                                                currentUserAvatar={currentUserAvatar}
                                                onUpdateChildComments={onUpdateChildComments}
                                            />
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-xs text-gray-400 italic p-2">Empty row</div>
                            )}
                        </div>

                    </div>
                </WallContainerContextMenu>
            ) : (
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

                    {/* Card Content */}
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

                        <div className="text-sm text-gray-800 break-words select-text w-full overflow-hidden">
                            <PostCardContent padlet={padlet} allPadlets={allPadlets} />
                        </div>
                    </div>

                    {/* Footer with comments/likes/etc. */}
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
            )}
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

// Main Row Canvas Component
const RowCanvas: React.FC<RowCanvasProps> = ({
    padlets,
    allPadlets,
    canvasId,
    canvasSettings = {},
    isEditable = true,
    onPadletUpdate,
    onPadletDelete,
    onPadletEdit,
    onPadletCreate,
    onReorder,
    userName = 'User',
    currentUserId,
    currentUserName,
    currentUserAvatar,
    onUpdateChildComments,
}) => {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [orderedPadlets, setOrderedPadlets] = useState<Padlet[]>([]);
    const [postsPerRow, setPostsPerRow] = useState(7); // Default from screenshot
    const [dropIndicatorPosition, setDropIndicatorPosition] = useState<{ row: number; col: number; } | null>(null);
    const [selectedPadletId, setSelectedPadletId] = useState<string | null>(null);

    // Check C - Mount log
    useEffect(() => console.log('[RowCanvas] mounted'), []);

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

    // Helpers for Container Child Rendering
    const getAccentColor = (padlet: Padlet) => {
        return padlet.metadata?.cardColor || '#6366f1'; // default indigo
    };

    const getTitle = (padlet: Padlet) => {
        return padlet.title || padlet.type?.charAt(0).toUpperCase() + padlet.type?.slice(1) || 'Untitled';
    };

    const getChildren = useCallback((containerId: string) => {
        return completePadletSet.filter(
            (p) => p.metadata?.parentId === containerId
        );
    }, [completePadletSet]);

    const getChildCount = useCallback((containerId: string) => {
        return getChildren(containerId).length;
    }, [getChildren]);

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
            const row = Math.floor(index / postsPerRow);
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

    // Active padlet for drag overlay
    const activePadlet = activeId ? orderedPadlets.find(p => p.id === activeId) : null;

    // Handle actions
    const handleEdit = (padlet: Padlet) => {
        onPadletEdit?.(padlet);
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
            {/* Wall Grid */}
            <div className="p-6 max-w-screen-2xl mx-auto">
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
                                                    <div key={`${rowIndex}-${colIndex}`} className="min-h-[100px] relative">
                                                        {/* Show indicator if this is the drop position */}
                                                        {dropIndicatorPosition?.row === rowIndex &&
                                                            dropIndicatorPosition?.col === colIndex && (
                                                                <GridDropIndicator />
                                                            )}

                                                        {slot && (
                                                            <SortablePadletCard
                                                                padlet={slot.padlet}
                                                                position={slot.displayOrder}
                                                                isEditable={isEditable}
                                                                commentsEnabled={canvasSettings.comments_enabled ?? true}
                                                                onEdit={handleEdit}
                                                                onDelete={handleDirectDelete}
                                                                onPin={handlePin}
                                                                onLike={handleLike}
                                                                getChildCount={getChildCount}
                                                                getChildren={getChildren}
                                                                getAccentColor={getAccentColor}
                                                                getTitle={getTitle}
                                                                allPadlets={completePadletSet}
                                                                onDuplicate={handleDuplicateContainer}
                                                                onChangeColor={handleChangeContainerColor}
                                                                onOpen={handleOpenContainer}
                                                                onCopyLink={handleCopyLink}
                                                                onAddBefore={handleAddContainerBefore}
                                                                onAddAfter={handleAddContainerAfter}
                                                                onDeleteContainer={handleDirectDelete}
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
        </div >
    );
};

export default RowCanvas;
