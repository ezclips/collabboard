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

    // Recompute midpoints on scroll / drag enter
    const recomputeMidpoints = React.useCallback(() => {
        const el = scrollElRef.current;
        if (!el) return;

        const scrollRect = el.getBoundingClientRect();
        const itemEls = Array.from(
            el.querySelectorAll("[data-drop-index]")
        ) as HTMLElement[];

        itemMidpointsRef.current = itemEls.map((itemEl) => {
            const rect = itemEl.getBoundingClientRect();
            return rect.top - scrollRect.top + rect.height / 2 + el.scrollTop;
        });
    }, []);

    React.useEffect(() => {
        recomputeMidpoints();
    }, [sortedPosts.length, recomputeMidpoints]);

    return (
        <div className="flex flex-col w-[280px] h-full min-h-0 flex-shrink-0 group/section">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between mb-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-white shadow-lg">
                {isEditing ? (
                    <Input
                        autoFocus
                        className="h-6 w-full bg-transparent border-none text-white placeholder:text-gray-400 text-sm focus:outline-none focus:ring-0"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={handleTitleSave}
                        onKeyDown={handleKeyDown}
                    />
                ) : (
                    <div className="flex items-center gap-2 flex-1 text-sm font-medium truncate">
                        <GripVertical
                            size={12}
                            className="text-gray-300 shrink-0 opacity-0 group-hover/section:opacity-100 transition-opacity"
                        />
                        <span className="truncate">{section.title}</span>
                    </div>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-white/10 rounded-full transition-colors opacity-80 hover:opacity-100 focus:outline-none">
                            <MoreVertical size={14} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {!isEditing && (
                            <>
                                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                                    <Edit2 size={14} className="mr-2" />
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuItem onClick={onAddSectionLeft}>
                            <MoveLeft size={14} className="mr-2" />
                            Add section left
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onAddSectionRight}>
                            <MoveRight size={14} className="mr-2" />
                            Add section right
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onMoveLeft}>
                            <MoveLeft size={14} className="mr-2" />
                            Move left
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onMoveRight}>
                            <MoveRight size={14} className="mr-2" />
                            Move right
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={onDelete}>
                            <Trash2 size={14} className="mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Scroll Region */}
            <div
                ref={scrollElRef}
                className="flex-1 min-h-0 overflow-y-auto pb-2 pr-0 space-y-4 hide-scrollbar scroll-fade relative"
                data-column-scroll="true"
                onScroll={recomputeMidpoints}
                onDragEnter={(e) => {
                    recomputeMidpoints();
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';

                    const el = scrollElRef.current;
                    if (!el) return;

                    const rect = el.getBoundingClientRect();
                    const y = e.clientY - rect.top + el.scrollTop;  // mouse Y relative to container top

                    const mids = itemMidpointsRef.current;
                    const count = mids.length;

                    if (count === 0) {
                        setDropIndicator?.({ sectionId: String(section.id), index: 0 });
                        dropIndicatorRef.current = { sectionId: String(section.id), index: 0 };
                        return;
                    }

                    let insertIndex = count;  // default = end

                    for (let i = 0; i < count; i++) {
                        if (y < mids[i]) {
                            insertIndex = i;
                            break;  // insert before this item
                        }
                    }

                    if (
                        dropIndicator?.sectionId !== String(section.id) ||
                        dropIndicator?.index !== insertIndex
                    ) {
                        dropIndicatorRef.current = { sectionId: String(section.id), index: insertIndex };
                        setDropIndicator?.(dropIndicatorRef.current);
                    }
                }}
                onDragLeave={(e) => {
                    if (!e.relatedTarget || !scrollElRef.current?.contains(e.relatedTarget as Node)) {
                        setDropIndicator?.({ sectionId: null, index: null });
                        dropIndicatorRef.current = { sectionId: null, index: null };
                    }
                }}
                onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropIndicator?.({ sectionId: null, index: null });
                    dropIndicatorRef.current = { sectionId: null, index: null };

                    const di = dropIndicatorRef.current;

                    if (di.sectionId !== String(section.id)) return;

                    const kind = e.dataTransfer.getData("application/collabboard-drag-kind");

                    if (!kind) return;

                    const raw = e.dataTransfer.getData("text/plain");
                    const payload = decodeDragPayload<ColumnDragPayload>(raw);

                    if (!payload) return;

                    const { id, fromSectionId } = payload;

                    const targetIndex = di.index !== undefined && di.index !== null ? di.index : sortedPosts.length;

                    if (kind === DND_KIND_POST_MOVE) {
                        if (onReorderPost) onReorderPost(id, String(fromSectionId), String(section.id), targetIndex);
                    } else if (kind === DND_KIND_CONTAINER_MOVE) {
                        await onDropContainerToSection?.(id, String(section.id), targetIndex, String(fromSectionId));
                    }
                }}
            >
                {/* Drop indicator at the very top */}
                {dropIndicator?.sectionId === String(section.id) && dropIndicator?.index === 0 && (
                    <DropIndicator />
                )}

                {/* Posts */}
                {sortedPosts.map((post, i) => (
                    <div key={post.id} data-drop-index={i}>
                        {/* Drop indicator before item */}
                        {dropIndicator?.sectionId === String(section.id) && dropIndicator?.index === i && (
                            <DropIndicator />
                        )}

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
                                className="group relative bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-shadow duration-200 ease-out border border-gray-300/80 overflow-hidden px-5 py-4 min-h-[120px] select-none"
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

                                <div className="text-base text-gray-800 whitespace-pre-line break-words select-text w-full overflow-hidden">
                                    <PostCardContent padlet={post} allPadlets={allPadlets} />
                                </div>
                            </div>
                        </ColumnPostContextMenu >
                    </div >
                ))}
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

React.useEffect(() => {
  const el = scrollElRef.current;
  if (!el) return;

  const updateFade = () => {
    const hasMore = el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 10;
    el.classList.toggle('has-more', hasMore);
  };

  el.addEventListener('scroll', updateFade);
  window.addEventListener('resize', updateFade);
  updateFade(); // initial

  return () => {
    el.removeEventListener('scroll', updateFade);
    window.removeEventListener('resize', updateFade);
  };
}, [posts.length]);