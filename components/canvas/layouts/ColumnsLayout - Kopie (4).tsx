import React, { useState } from "react";
import {
    MoreVertical,
    Plus,
    Trash2,
    MoveLeft,
    MoveRight,
    Edit2,
    GripVertical,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
import { Input } from "../../ui/input";
import { cn } from "@/lib/utils";
import { BoardSection, Padlet, DropIndicatorState, ColumnDragPayload } from "../../../types/collabboard";
import { encodeDragPayload, decodeDragPayload } from "../../../lib/dnd";
import PostCardContent from "../../collabboard/PostCardContent";
import { ColumnPostContextMenu } from "../../collabboard/menus/ColumnPostContextMenu";


const DND_KIND_POST_MOVE = 'columns-post-move';
const DND_KIND_CONTAINER_MOVE = 'columns-container-move';
function DropIndicator() {
    return (
        <div className="h-0 relative pointer-events-none z-50">
            <div className="absolute inset-x-0 -top-1 h-1 bg-purple-600 rounded-full shadow-[0_2px_8px_rgba(168,85,247,0.6)] transition-all duration-100" />
        </div>
    );
}

const isNoDragTarget = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;

    // Anything marked data-no-drag or interactive elements should not start a drag
    return Boolean(
        el.closest('[data-no-drag="true"]') ||
        el.closest('button, a, input, textarea, select, option, label, [role="button"], [contenteditable="true"]')
    );
};

interface ColumnsLayoutProps {
    section: BoardSection;
    posts: Padlet[];
    onAddPost: () => void;
    onRename: (title: string) => void;
    onDelete: () => void;
    onAddSectionLeft: () => void;
    onAddSectionRight: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onEditPost: (post: Padlet) => void;
    onReorderPost?: (
        postId: string,
        fromSection: string,
        toSection: string,
        newIndex: number
    ) => void;
    onDeletePost?: (post: Padlet) => void;
    onSaveToLibrary?: (post: Padlet) => void;
    onOpenPost?: (post: Padlet) => void;
    onOpenInNewTab?: (post: Padlet) => void;
    onCopyLink?: (post: Padlet) => void;
    onStartSlideshow?: (post: Padlet) => void;
    onDownloadAttachment?: (post: Padlet) => void;
    onCopyAttachmentLink?: (post: Padlet) => void;
    onColorChange?: (post: Padlet, color: string) => void;
    onAddBefore?: (post: Padlet) => void;
    onAddAfter?: (post: Padlet) => void;
    onDuplicate?: (post: Padlet) => void;
    onCopyToAnotherPadlet?: (post: Padlet) => void;
    onTransferToAnotherPadlet?: (post: Padlet) => void;
    onSetAsCover?: (post: Padlet) => void;
    onPin?: (post: Padlet) => void;
    onReport?: (post: Padlet) => void;
    onSectionActive?: (sectionId: string) => void;
    onAddContainerAt?: (position: number) => void;
    onDropContainerToSection?: (
        containerId: string,
        toSectionId: string,
        targetIndex: number,
        fromSectionId?: string
    ) => Promise<void> | void;
    allPadlets: Padlet[];
    dropIndicator?: DropIndicatorState;
    setDropIndicator?: (state: DropIndicatorState) => void;
}

export default function ColumnsLayout({
    section,
    posts,
    onAddPost,
    onRename,
    onDelete,
    onAddSectionLeft,
    onAddSectionRight,
    onMoveLeft,
    onMoveRight,
    onEditPost,
    onDeletePost,
    onOpenPost,
    onOpenInNewTab,
    onCopyLink,
    onStartSlideshow,
    onDownloadAttachment,
    onCopyAttachmentLink,
    onColorChange,
    onAddBefore,
    onAddAfter,
    onDuplicate,
    onCopyToAnotherPadlet,
    onTransferToAnotherPadlet,
    onSetAsCover,
    onPin,
    onReport,
    onAddContainerAt,
    onReorderPost,
    onDropContainerToSection,
    allPadlets,
    dropIndicator,
    setDropIndicator,
}: ColumnsLayoutProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editingTitle, setEditingTitle] = useState(section.title);
    // Remove local draggingId if we are using global or just rely on CSS classes
    // const [draggingId, setDraggingId] = useState<string | null>(null);

    // Refs for performance-optimized hit testing
    const scrollElRef = React.useRef<HTMLDivElement>(null);
    const itemMidpointsRef = React.useRef<number[]>([]);
    const dropIndicatorRef = React.useRef<DropIndicatorState>({ sectionId: null, index: null });

    const handleTitleSave = () => {
        const next = editingTitle.trim();
        if (next && next !== section.title) onRename(next);
        else setEditingTitle(section.title);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleTitleSave();
        if (e.key === "Escape") {
            setEditingTitle(section.title);
            setIsEditing(false);
        }
    };

    const sortedPosts = [...posts].sort(
        (a, b) =>
            (((a.metadata as any)?.sectionPosition as number) || 0) -
            (((b.metadata as any)?.sectionPosition as number) || 0)
    );

    // Recompute midpoints
    const recomputeMidpoints = React.useCallback(() => {
        const el = scrollElRef.current;
        if (!el) return;

        const itemEls = Array.from(el.querySelectorAll("[data-drop-index]")) as HTMLElement[];
        const scrollRect = el.getBoundingClientRect();

        itemMidpointsRef.current = itemEls.map((item) => {
            const r = item.getBoundingClientRect();
            return (r.top + r.height / 2) - scrollRect.top; // relative to scroll container
        });
    }, []);

    // Recompute midpoints when posts change
    React.useEffect(() => {
        recomputeMidpoints();
    }, [posts.length, recomputeMidpoints]);

    return (
        <div className="flex flex-col w-[280px] h-full min-h-0 flex-shrink-0 group/section">
            {/* Section Header (fixed) */}
            <div
                className="shrink-0 flex items-center justify-between mb-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-white shadow-lg"
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => e.preventDefault()}
            >
                <div className="flex-1 min-w-0 pr-2">
                    {isEditing ? (
                        <Input
                            type="text"
                            value={editingTitle}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setEditingTitle(e.target.value)
                            }
                            onBlur={handleTitleSave}
                            onKeyDown={handleKeyDown}
                            className="bg-transparent border-none text-white font-bold h-6 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-400"
                            autoFocus
                        />
                    ) : (
                        <h3
                            className="font-bold text-sm truncate cursor-pointer hover:text-white/80"
                            onClick={() => setIsEditing(true)}
                            title={section.title}
                        >
                            {section.title}
                        </h3>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <span className="text-[10px] opacity-60 font-mono bg-white/10 px-1.5 py-0.5 rounded">
                        {posts.length}
                    </span>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-1 hover:bg-white/10 rounded-full transition-colors">
                                <MoreVertical size={14} />
                            </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => onAddContainerAt?.(0)}>
                                <Plus className="mr-2 h-4 w-4" /> Add post
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => setIsEditing(true)}>
                                <Edit2 className="mr-2 h-4 w-4" /> Rename section
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={onAddSectionLeft}>
                                <MoveLeft className="mr-2 h-4 w-4" /> New section left
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onAddSectionRight}>
                                <MoveRight className="mr-2 h-4 w-4" /> New section right
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={onMoveLeft}>
                                <MoveLeft className="mr-2 h-4 w-4" /> Move section left
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onMoveRight}>
                                <MoveRight className="mr-2 h-4 w-4" /> Move section right
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                onClick={onDelete}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete section
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Add Item Button (fixed) */}
            <button
                onClick={() => onAddContainerAt?.(posts.length)}
                className="shrink-0 mb-3 w-full h-10 bg-black/20 hover:bg-black/30 text-white rounded-lg flex items-center justify-center transition-all border border-white/5 opacity-0 group-hover/section:opacity-100"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
            >
                <Plus size={20} />
            </button>

            {/* Scroll Region (THIS is the important part) */}
            {/* Scroll Region */}
            <div
                ref={scrollElRef}
                className="flex-1 min-h-0 overflow-y-auto pb-20 pr-2 space-y-4 scrollbar-modern"
                data-column-scroll="true"
                onScroll={() => {
                    // Throttle this if needed, but for now direct call
                    requestAnimationFrame(recomputeMidpoints);
                }}
                onDragEnter={(e) => {
                    // Recompute once when entering column
                    recomputeMidpoints();
                }}
                onDragLeave={(e) => {
                    // Check if leaving the scroll container
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropIndicator?.({ sectionId: null, index: null });
                    }
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';

                    const el = scrollElRef.current;
                    if (!el) return;

                    const rect = el.getBoundingClientRect();
                    const y = e.clientY - rect.top;           // mouse Y relative to scroll container top

                    const mids = itemMidpointsRef.current;
                    const count = mids.length;

                    if (count === 0) {
                        setDropIndicator?.({ sectionId: String(section.id), index: 0 });
                        dropIndicatorRef.current = { sectionId: String(section.id), index: 0 };
                        return;
                    }

                    let insertIndex = count;  // default = after last item

                    for (let i = 0; i < count; i++) {
                        if (y < mids[i]) {
                            insertIndex = i;
                            break;  // found the first midpoint we're above → insert before it
                        }
                    }

                    // Optional: small threshold near bottom to snap to end more forgivingly
                    // if (y > rect.height - 40) insertIndex = count;

                    if (
                        dropIndicator?.sectionId !== String(section.id) ||
                        dropIndicator?.index !== insertIndex
                    ) {
                        dropIndicatorRef.current = { sectionId: String(section.id), index: insertIndex };
                        setDropIndicator?.(dropIndicatorRef.current);
                    }
                }}
                onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const raw = e.dataTransfer.getData('text/plain');
                    const updates = decodeDragPayload(raw);
                    if (!updates) return;

                    const { kind, id, fromSectionId } = updates;
                    const di = dropIndicatorRef.current;
                    const targetIndex = di.index !== undefined && di.index !== null ? di.index : sortedPosts.length;


                    if (kind === 'container') {
                        if (String(fromSectionId) === String(section.id)) {
                            // Same section reorder
                            if (onReorderPost) {
                                onReorderPost(id, String(fromSectionId), String(section.id), targetIndex);
                            }
                        } else {
                            // Cross-section move
                            await onDropContainerToSection?.(id, String(section.id), targetIndex, String(fromSectionId));
                        }
                    } else if (kind === 'post') {
                        if (onReorderPost) {
                            onReorderPost(id, String(fromSectionId), String(section.id), targetIndex);
                        }
                    }

                    // Clear indicator after computing and using targetIndex
                    dropIndicatorRef.current = { sectionId: null, index: null };
                    setDropIndicator?.({ sectionId: null, index: null });
                }}
            >
                {sortedPosts.map((post, index) => {
                    // Render drop indicator if index matches
                    const showIndicator = dropIndicator?.sectionId === String(section.id) && dropIndicator?.index === index;

                    const isContainer = post.type === 'container' || (post.metadata as any)?.kind === 'container' || (post.metadata as any)?.isContainer;

                    if (isContainer) {
                        return (
                            <div key={post.id} data-drop-index={index} data-post-id={post.id} className="relative">
                                {showIndicator && <DropIndicator />}


                                {/* Container Card wrapped in Context Menu */}
                                <ColumnPostContextMenu
                                    padlet={post}
                                    onSelect={() => { }}
                                    onOpen={() => onOpenPost?.(post)}
                                    onOpenInNewTab={() => onOpenInNewTab?.(post)}
                                    onCopyLink={() => onCopyLink?.(post)}
                                    onStartSlideshow={() => onStartSlideshow?.(post)}
                                    onDownloadAttachment={() => onDownloadAttachment?.(post)}
                                    onCopyAttachmentLink={() => onCopyAttachmentLink?.(post)}
                                    onChangeColor={(color: string) => onColorChange?.(post, color)}
                                    onEdit={() => onEditPost(post)}
                                    onAddBefore={() => onAddBefore?.(post)}
                                    onAddAfter={() => onAddAfter?.(post)}
                                    onDuplicate={onDuplicate ? () => onDuplicate(post) : undefined}
                                    onCopyToAnotherPadlet={onCopyToAnotherPadlet ? () => onCopyToAnotherPadlet(post) : undefined}
                                    onTransferToAnotherPadlet={onTransferToAnotherPadlet ? () => onTransferToAnotherPadlet(post) : undefined}
                                    onSetAsPadletCover={onSetAsCover ? () => onSetAsCover(post) : undefined}
                                    onPin={onPin ? () => onPin(post) : undefined}
                                    onReport={onReport ? () => onReport(post) : undefined}
                                    onDelete={onDeletePost ? () => onDeletePost(post) : undefined}
                                    onAddContainerAt={onAddContainerAt}
                                >
                                    <div
                                        draggable
                                        onMouseDownCapture={(e) => {
                                            if (isNoDragTarget(e.target)) {
                                                e.stopPropagation();
                                            }
                                        }}
                                        onMouseDown={(e) => {
                                            if (window.getSelection()?.toString()) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onDragStart={(e) => {
                                            if (isNoDragTarget(e.target)) {
                                                e.preventDefault();
                                                return;
                                            }
                                            const payload: ColumnDragPayload = {
                                                kind: 'container',
                                                id: post.id,
                                                fromSectionId: String(section.id)
                                            };
                                            const raw = encodeDragPayload(payload);
                                            e.dataTransfer.setData("text/plain", raw);
                                            e.dataTransfer.setData("application/collabboard-drag-kind", DND_KIND_CONTAINER_MOVE);
                                            // Fallback
                                            e.dataTransfer.setData("text/container-id", post.id);

                                            e.dataTransfer.effectAllowed = "move";
                                            e.currentTarget.classList.add("opacity-60", "scale-[0.99]", "ring-2", "ring-blue-400");
                                        }}
                                        onDragEnd={(e) => {
                                            e.currentTarget.classList.remove("opacity-60", "scale-[0.99]", "ring-2", "ring-blue-400");
                                        }}
                                        className={cn(
                                            "group relative bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all border border-gray-300/80 overflow-hidden px-5 py-4 min-w-[280px] min-h-[160px] cursor-grab active:cursor-grabbing select-none"
                                        )}
                                        style={{ backgroundColor: (post.metadata as any)?.cardColor || "#fff" }}
                                        data-container-id={post.id}
                                    >
                                        {/* Top Strip */}
                                        {post.metadata?.topStrip && post.metadata.topStrip !== "transparent" && (
                                            <div
                                                className="absolute top-0 left-0 w-full h-1.5"
                                                style={{ backgroundColor: post.metadata.topStrip }}
                                            />
                                        )}

                                        {/* Edit Button */}
                                        <button
                                            data-no-drag="true"
                                            onMouseDownCapture={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onEditPost(post);
                                            }}
                                            className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-gray-800 hover:bg-black/5 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                                            title="Edit post"
                                        >
                                            <Edit2 size={16} />
                                        </button>

                                        <div className="text-base text-gray-800 whitespace-pre-line break-words pl-6 select-text">
                                            <PostCardContent padlet={post} allPadlets={allPadlets} />
                                        </div>
                                    </div>
                                </ColumnPostContextMenu>
                            </div>
                        );
                    }

                    return (
                        <div key={post.id} data-drop-index={index} data-post-id={post.id} className="relative">
                            {showIndicator && <DropIndicator />}
                            <ColumnPostContextMenu
                                key={post.id}
                                padlet={post}
                                onSelect={() => { }}
                                onOpen={() => onOpenPost?.(post)}
                                onOpenInNewTab={() => onOpenInNewTab?.(post)}
                                onCopyLink={() => onCopyLink?.(post)}
                                onStartSlideshow={() => onStartSlideshow?.(post)}
                                onDownloadAttachment={() => onDownloadAttachment?.(post)}
                                onCopyAttachmentLink={() => onCopyAttachmentLink?.(post)}
                                onChangeColor={(color: string) => onColorChange?.(post, color)}
                                onEdit={() => onEditPost(post)}
                                onAddBefore={() => onAddBefore?.(post)}
                                onAddAfter={() => onAddAfter?.(post)}
                                onDuplicate={onDuplicate ? () => onDuplicate(post) : undefined}
                                onCopyToAnotherPadlet={onCopyToAnotherPadlet ? () => onCopyToAnotherPadlet(post) : undefined}
                                onTransferToAnotherPadlet={onTransferToAnotherPadlet ? () => onTransferToAnotherPadlet(post) : undefined}
                                onSetAsPadletCover={onSetAsCover ? () => onSetAsCover(post) : undefined}
                                onPin={onPin ? () => onPin(post) : undefined}
                                onReport={onReport ? () => onReport(post) : undefined}
                                onDelete={onDeletePost ? () => onDeletePost(post) : undefined}
                                onAddContainerAt={onAddContainerAt}
                            >
                                <div
                                    className="group relative bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all border border-gray-300/80 overflow-hidden px-5 py-4 min-h-[120px] select-none"
                                    style={{ backgroundColor: post.metadata?.cardColor || "#fff" }}
                                    draggable={!post.metadata?.isLocked}
                                    onDragStart={(e) => {
                                        // Make sure we set format
                                        const payload: ColumnDragPayload = { kind: 'post', id: post.id, fromSectionId: String(section.id) };
                                        const raw = encodeDragPayload(payload);

                                        e.dataTransfer.setData("text/plain", raw);
                                        e.dataTransfer.setData("application/collabboard-drag-kind", DND_KIND_POST_MOVE);

                                        e.dataTransfer.effectAllowed = 'move';
                                        e.currentTarget.classList.add('opacity-50');
                                    }}
                                    onDragEnd={(e) => {
                                        e.currentTarget.classList.remove('opacity-50');
                                    }}
                                >
                                    {/* Top Strip */}
                                    {post.metadata?.topStrip && post.metadata.topStrip !== "transparent" && (
                                        <div
                                            className="absolute top-0 left-0 w-full h-1.5"
                                            style={{ backgroundColor: post.metadata.topStrip }}
                                        />
                                    )}

                                    {/* Edit Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditPost(post);
                                        }}
                                        className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-gray-800 hover:bg-black/5 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                                        title="Edit post"
                                    >
                                        <Edit2 size={16} />
                                    </button>

                                    <div className="text-base text-gray-800 whitespace-pre-line break-words select-text">
                                        <PostCardContent padlet={post} allPadlets={allPadlets} />
                                    </div>
                                </div>
                            </ColumnPostContextMenu >
                        </div >
                    );
                })}
                {/* Drop indicator at the very end */}
                {
                    dropIndicator?.sectionId === String(section.id) && dropIndicator?.index === sortedPosts.length && (
                        <DropIndicator />
                    )
                }
            </div >
        </div >
    );
}

