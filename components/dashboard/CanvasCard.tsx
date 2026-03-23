'use client';

import React, { useState } from 'react';
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
}: CanvasCardProps) {
    const router = useRouter();
    const [isHovered, setIsHovered] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const LayoutIcon = layoutIcons[layout?.toLowerCase()] || LayoutGrid;
    const placeholderBg = layoutColors[layout?.toLowerCase()] || 'bg-gray-50';

    const handleOpen = () => {
        setIsLoading(true);
        router.push(`/dashboard/canvas/${id}`);
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

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-gray-300 cursor-pointer"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    onClick={handleOpen}
                >
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
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                )}

                {/* Hover overlay with actions */}
                <div className={`absolute inset-0 bg-black/0 transition-all duration-200 ${isHovered ? 'bg-black/10' : ''}`}>
                    {/* Top-right menu button */}
                    <div className={`absolute top-1 right-1 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <button className="p-1.5 text-gray-500 bg-white/90 hover:bg-white hover:text-gray-800 rounded-full shadow-sm border border-gray-200/70 transition-all">
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
                            className={`absolute bottom-2 left-2 p-1.5 rounded-lg transition-all duration-200 ${
                                isFavorite
                                    ? 'bg-yellow-100 text-yellow-500'
                                    : isHovered
                                    ? 'bg-white/90 text-gray-400 opacity-100'
                                    : 'opacity-0'
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
            </ContextMenuContent>
        </ContextMenu>
    );
}
