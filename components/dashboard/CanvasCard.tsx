'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Edit2,
    Star,
    StarOff,
    Trash2,
    Copy,
    FolderInput,
    Pencil,
    ExternalLink,
    Columns,
    LayoutGrid,
    Table,
    Layers,
    Map,
    Clock,
    LayoutList,
    Loader2
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface CanvasCardProps {
    id: string | number;
    title: string;
    layout: string;
    thumbnailUrl?: string | null;
    updatedAt: string;
    lastVisitedAt?: string | null;
    isFavorite?: boolean;
    onDelete?: (id: string | number) => void;
    onToggleFavorite?: (id: string | number, isFavorite: boolean) => void;
    onDuplicate?: (id: string | number) => void;
    onRename?: (id: string | number) => void;
    onMoveToFolder?: (id: string | number) => void;
    /**
     * Trash only. Present exclusively for a canvas already in Trash, so an
     * active card's menu is unchanged: the item below renders only when a
     * caller supplies this handler.
     */
    onDeletePermanently?: (id: string | number) => void;
}

// Layout icons mapping
const layoutIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    wall: LayoutGrid,
    columns: Columns,
    grid: LayoutGrid,
    table: Table,
    freeform: Layers,
    stream: LayoutList,
    timeline: Clock,
    map: Map,
};

// Layout colors for placeholder backgrounds
const layoutColors: Record<string, string> = {
    wall: 'bg-blue-50',
    columns: 'bg-purple-50',
    grid: 'bg-green-50',
    table: 'bg-orange-50',
    freeform: 'bg-pink-50',
    stream: 'bg-cyan-50',
    timeline: 'bg-amber-50',
    map: 'bg-teal-50',
};

// Format relative time
function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
}

export default function CanvasCard({
    id,
    title,
    layout,
    thumbnailUrl,
    updatedAt,
    lastVisitedAt,
    isFavorite = false,
    onDelete,
    onToggleFavorite,
    onDuplicate,
    onRename,
    onMoveToFolder,
    onDeletePermanently,
}: CanvasCardProps) {
    const router = useRouter();
    const [isHovered, setIsHovered] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const LayoutIcon = layoutIcons[layout?.toLowerCase()] || LayoutGrid;
    const placeholderBg = layoutColors[layout?.toLowerCase()] || 'bg-gray-50';

    const canvasHref = `/dashboard/canvas/${id}`;

    /**
     * Programmatic open, for the MENU ITEM only.
     *
     * The card itself navigates through a real href (see the overlay link in
     * the markup). This exists because "Open" in the dropdown is a menu
     * command, not a link, and Radix owns that element.
     */
    const handleOpen = () => {
        setIsLoading(true);
        router.push(canvasHref);
    };

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleFavorite?.(id, !isFavorite);
    };

    const handleContextFavorite = () => {
        onToggleFavorite?.(id, !isFavorite);
    };

    const handleContextDelete = () => {
        onDelete?.(id);
    };

    const handleContextDeletePermanently = () => {
        onDeletePermanently?.(id);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
            {/*
              THE CARD IS A LINK -- an overlay anchor, not an onClick on the wrapper.

              This div used to carry `onClick={handleOpen}` and `cursor-pointer`.
              A div with a click handler is invisible to the keyboard: it takes no
              focus, responds to no Enter or Space, and is announced as nothing. A
              keyboard or screen-reader user could not open a canvas AT ALL, which
              is the primary action of this screen (WCAG 2.1.1, Level A). It also
              meant no ctrl/middle-click to open a board in a new tab, and no
              status-bar target on hover.

              It is an OVERLAY sibling rather than a wrapper because this card
              CONTAINS buttons -- the ⋯ menu and the favourite toggle. Nesting a
              button inside an anchor is invalid HTML and behaves unpredictably
              across browsers, so the anchor covers the card from alongside them
              and the controls sit above it on z-index instead:

                  link overlay      z-20
                  loading spinner   z-30   (must stay visible during navigation)
                  ⋯ menu, favourite z-40   (must stay clickable)

              Focus is shown with `focus-within:ring` on the card above, because
              the anchor itself is transparent and has no shape of its own -- the
              ring has to be drawn by something the user can actually see.
            */}
            <Link
                href={canvasHref}
                aria-label={`Open ${title}`}
                onClick={(e) => {
                    // Spinner ONLY for a plain left-click, because only a plain
                    // left-click navigates THIS tab. Ctrl/cmd/shift-click and
                    // middle-click open a new tab and leave this page exactly
                    // where it is -- showing a loading overlay there would spin
                    // forever on a card that was never going anywhere.
                    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    setIsLoading(true);
                }}
                className="absolute inset-0 z-20 rounded-xl focus:outline-none"
            />

            {/* Thumbnail Area */}
            <div className={`relative aspect-[4/3] ${placeholderBg} overflow-hidden`}>
                {thumbnailUrl && !imageError ? (
                    <img
                        src={thumbnailUrl}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    // Placeholder with layout icon
                    <div className="w-full h-full flex items-center justify-center">
                        <LayoutIcon className="w-16 h-16 text-gray-300" />
                    </div>
                )}

                {/* Relative time badge */}
                <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm text-xs text-gray-600 px-2 py-1 rounded-md shadow-sm">
                    {formatRelativeTime(updatedAt)}
                </div>

                {/* Loading overlay */}
                {isLoading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                )}

                {/* Hover overlay with actions */}
                <div className={`absolute inset-0 bg-black/0 transition-all duration-200 ${isHovered ? 'bg-black/10' : ''}`}>
                    {/* Top-right menu button */}
                    {/*
                      z-40: above the card's overlay link, so it stays clickable.
                      focus-within:opacity-100: the button is hidden until hover,
                      and an opacity-0 element is still FOCUSABLE -- without this a
                      keyboard user tabs to a control they cannot see.
                    */}
                    <div className={`absolute top-1 right-1 z-40 transition-opacity duration-200 focus-within:opacity-100 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <button
                                    aria-label={`Actions for ${title}`}
                                    className="p-1.5 text-gray-500 bg-white/90 hover:bg-white hover:text-gray-800 rounded-full shadow-sm border border-gray-200/70 transition-all"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpen(); }}>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Open
                                </DropdownMenuItem>
                                {onRename && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(id); }}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        Rename
                                    </DropdownMenuItem>
                                )}
                                {onDuplicate && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}>
                                        <Copy className="w-4 h-4 mr-2" />
                                        Duplicate
                                    </DropdownMenuItem>
                                )}
                                {onMoveToFolder && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveToFolder(id); }}>
                                        <FolderInput className="w-4 h-4 mr-2" />
                                        Move to folder
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {onDelete && (
                                    <DropdownMenuItem
                                        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
                                        className="text-red-600 focus:text-red-600"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Favorite button */}
                    {onToggleFavorite && (
                        <button
                            onClick={handleFavoriteClick}
                            aria-label={isFavorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
                            aria-pressed={isFavorite}
                            className={`absolute bottom-2 left-2 z-40 p-1.5 rounded-lg transition-all duration-200 ${
                                isFavorite
                                    ? 'bg-yellow-100 text-yellow-500'
                                    : isHovered
                                    ? 'bg-white/90 text-gray-400 opacity-100'
                                    // Hidden until hover, but still focusable -- so it
                                    // reveals itself on keyboard focus as well.
                                    : 'opacity-0 focus-visible:opacity-100 focus-visible:bg-white/90'
                            }`}
                        >
                            <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Info Area */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate" title={title}>
                            {title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <LayoutIcon className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm text-gray-500 capitalize">
                                {layout} layout
                            </span>
                        </div>
                    </div>
                </div>
            </div>
                </div>
            </ContextMenuTrigger>
            
            {/* Right-click Context Menu */}
            <ContextMenuContent className="w-48">
                {onToggleFavorite && (
                    <ContextMenuItem onClick={handleContextFavorite}>
                        {isFavorite ? (
                            <>
                                <StarOff className="w-4 h-4 mr-2" />
                                Remove from Favorites
                            </>
                        ) : (
                            <>
                                <Star className="w-4 h-4 mr-2" />
                                Add to Favorites
                            </>
                        )}
                    </ContextMenuItem>
                )}
                {onToggleFavorite && onDelete && <ContextMenuSeparator />}
                {onDelete && (
                    <ContextMenuItem onClick={handleContextDelete} variant="destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Move to Trash
                    </ContextMenuItem>
                )}
                {onDeletePermanently && (
                    <ContextMenuItem onClick={handleContextDeletePermanently} variant="destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete permanently
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
}
