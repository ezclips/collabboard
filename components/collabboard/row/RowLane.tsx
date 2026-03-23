import React, { useState } from "react";
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    MoreVertical,
    Plus,
    Trash2,
    MoveLeft,
    MoveRight,
    Edit2,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BoardSection, Padlet, DropIndicatorState } from "@/types/collabboard";
import PostCardContent from "../PostCardContent";
import RowColumnContainerCard from "../RowColumnContainerCard";
import { ColumnPostContextMenu } from "../menus/ColumnPostContextMenu";
import CardShell from "@/components/collabboard/shells/CardShell";

function DropIndicator() {
    return (
        <div className="w-1 h-full relative pointer-events-none z-50">
            <div className="absolute inset-y-0 -left-1 w-1 bg-purple-600 rounded-full shadow-[0_2px_8px_rgba(168,85,247,0.6)] transition-all duration-100" />
        </div>
    );
}

function SortableContainerItem({ id, children, disabled, widthClass }: { id: string; children: React.ReactNode; disabled?: boolean; widthClass?: string }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`relative shrink-0 outline-none group/sortable ${widthClass || 'w-[280px]'}`}
        >
            {/* Content */}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}

interface RowLaneProps {
    isEditable?: boolean;
    section: BoardSection;
    posts: Padlet[]; // Normalized list for this section
    allPadlets: Padlet[]; // For content rendering reference
    dropIndicator?: DropIndicatorState;
    widthClass?: string; // Dynamic width class
    // Callbacks
    onRename: (title: string) => void;
    onDelete: () => void;
    onAddSectionLeft: () => void;
    onAddSectionRight: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onAddContainerAt?: (position: number) => void;
    // Post actions
    onEditPost: (post: Padlet) => void;
    onDeletePost?: (post: Padlet) => void;
    onOpenPost?: (post: Padlet) => void;
    onOpenTarget?: (post: Padlet) => void; // For opening specific child posts from containers
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
    // Comment handling
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    onUpdateChildComments?: (childId: string, comments: any[]) => void;
    onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void | Promise<void>;
    onAddEmptyContainerAt?: (position: number) => void;
}

export default function RowLane({
    isEditable = false,
    section,
    posts,
    allPadlets,
    dropIndicator,
    widthClass,
    onRename,
    onDelete,
    onAddSectionLeft,
    onAddSectionRight,
    onMoveLeft,
    onMoveRight,
    onAddContainerAt,
    onEditPost,
    onDeletePost,
    onOpenPost,
    onOpenTarget,
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
    currentUserId,
    currentUserName,
    currentUserAvatar,
    onUpdateChildComments,
    onDropDraftIntoContainer,
    onAddEmptyContainerAt,
}: RowLaneProps) {
    // Helper to get container children for the openTargets submenu
    const getContainerChildren = (containerId: string): Padlet[] => {
        const container = allPadlets.find(p => p.id === containerId);
        const childIds = (container?.metadata as any)?.childPadletIds || [];

        if (childIds.length > 0) {
            return childIds
                .map((childId: string) => allPadlets.find(p => p.id === childId))
                .filter(Boolean) as Padlet[];
        }

        return allPadlets.filter(p => (p.metadata as any)?.parentId === containerId);
    };

    // Helper to generate a label for the open target submenu
    const getOpenTargetLabel = (padlet: Padlet): string => {
        const rawType = padlet.type || (padlet.metadata as any)?.kind || 'post';
        return String(rawType).replace(/_/g, ' ');
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editingTitle, setEditingTitle] = useState(section.title);
    const [expandedContainers, setExpandedContainers] = useState<Record<string, boolean>>({});
    const [expandableContainers, setExpandableContainers] = useState<Record<string, boolean>>({});

    const scrollElRef = React.useRef<HTMLDivElement>(null);

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

    // Scroll overflow tracking
    const [canScrollLeft, setCanScrollLeft] = React.useState(false);
    const [canScrollRight, setCanScrollRight] = React.useState(false);

    const updateScrollState = React.useCallback(() => {
        const el = scrollElRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }, []);

    React.useEffect(() => {
        updateScrollState();
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, [updateScrollState, posts.length]);

    const scrollBy = (amount: number) => {
        const el = scrollElRef.current;
        if (el) {
            el.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    const hasContainers = posts.length > 0;

    return (
        <div className="flex flex-col w-full min-h-0 flex-shrink-0 group/section mb-8">
            {/* Section Header */}
            <div
                className="shrink-0 flex items-center justify-between mb-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-white shadow-lg w-[280px]"
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
                            onClick={() => {
                                if (!isEditable) return;
                                setIsEditing(true);
                            }}
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

                    {isEditable && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-1 hover:bg-white/10 rounded-full transition-colors">
                                <MoreVertical size={14} />
                            </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent
                            side="right"
                            align="start"
                            sideOffset={4}
                            className="w-56 bg-white shadow-xl border border-gray-200 z-[1002]"
                        >
                            <DropdownMenuItem onClick={() => onAddContainerAt?.(0)} className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span>Add post</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 group-hover:bg-white group-hover:border-gray-300">
                                        <Plus size={12} />
                                    </div>
                                </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => setIsEditing(true)} className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span>Rename section</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 group-hover:bg-white group-hover:border-gray-300">
                                        <Edit2 size={12} />
                                    </div>
                                </div>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={onAddSectionLeft} className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span>New section above</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 group-hover:bg-white group-hover:border-gray-300">
                                        <MoveLeft size={12} className="rotate-90" />
                                    </div>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onAddSectionRight} className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span>New section below</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 group-hover:bg-white group-hover:border-gray-300">
                                        <MoveRight size={12} className="rotate-90" />
                                    </div>
                                </div>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={onMoveLeft} className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span>Move section up</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 group-hover:bg-white group-hover:border-gray-300">
                                        <MoveLeft size={12} className="rotate-90" />
                                    </div>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onMoveRight} className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span>Move section down</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 group-hover:bg-white group-hover:border-gray-300">
                                        <MoveRight size={12} className="rotate-90" />
                                    </div>
                                </div>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                onClick={onDelete}
                                className="group text-[13px] leading-none text-red-600 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-red-700 cursor-pointer"
                            >
                                <span>Delete section</span>
                                <div className="ml-auto pl-5 flex gap-1 items-center">
                                    <div className="flex items-center justify-center bg-red-50 border border-red-200 rounded px-1.5 py-0.5 text-red-500 group-hover:bg-white group-hover:border-red-300">
                                        <Trash2 size={12} />
                                    </div>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    )}
            </div>
        </div>

        {/* Quick add container */}
        {isEditable && (
            <div className="shrink-0 mb-3 w-[280px]">
                <button
                    onClick={() => (onAddEmptyContainerAt ? onAddEmptyContainerAt(posts.length) : onAddContainerAt?.(posts.length))}
                    className="w-full h-10 bg-black/10 hover:bg-black/20 rounded-lg flex items-center justify-center border border-black/10 transition-all text-black/60 hover:text-black/80"
                    data-no-drag="true"
                    title="Add Container"
                >
                    <Plus size={18} />
                </button>
            </div>
        )}

            {/* Scroll Region with Navigation Arrows */}
            {/* Note: Removed DndContext here, it comes from parent now */}
            <div className="relative w-full group/scroll">
                {/* Left Arrow */}
                {canScrollLeft && (
                    <button
                        type="button"
                        onClick={() => scrollBy(-300)}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-white hover:text-gray-900 transition-all opacity-0 group-hover/scroll:opacity-100"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft size={24} />
                    </button>
                )}

                {/* Right Arrow */}
                {canScrollRight && (
                    <button
                        type="button"
                        onClick={() => scrollBy(300)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-white hover:text-gray-900 transition-all opacity-0 group-hover/scroll:opacity-100"
                        aria-label="Scroll right"
                    >
                        <ChevronRight size={24} />
                    </button>
                )}

                <div
                    ref={scrollElRef}
                    className="w-full max-w-[calc(100vw-6rem)] min-h-[160px] flex flex-row gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain row-scrollbar pl-0 pr-2 items-start"
                    data-column-scroll="true"
                    onScroll={updateScrollState}
                >
                    <SortableContext items={posts.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                        {posts.map((post, index) => {
                            // Render drop indicator if index matches
                            const showIndicator = dropIndicator?.sectionId === String(section.id) && dropIndicator?.index === index;

                            const isContainer = post.type === 'container' || (post.metadata as any)?.kind === 'container' || (post.metadata as any)?.isContainer;

                            if (isContainer) {
                                const containerChildren = getContainerChildren(post.id);
                                return (
                                    <React.Fragment key={post.id}>
                                        {showIndicator && <DropIndicator />}

                                        <SortableContainerItem id={post.id} widthClass={widthClass} disabled={!isEditable}>
                                            <ColumnPostContextMenu
                                                padlet={post}
                                                onSelect={() => { }}
                                                onOpen={() => onOpenPost?.(post)}
                                                openTargets={isEditable ? containerChildren : undefined}
                                                onOpenTarget={isEditable ? onOpenTarget : undefined}
                                                getOpenTargetLabel={getOpenTargetLabel}
                                                onOpenInNewTab={() => onOpenInNewTab?.(post)}
                                                onCopyLink={() => onCopyLink?.(post)}
                                                onStartSlideshow={() => onStartSlideshow?.(post)}
                                                onDownloadAttachment={() => onDownloadAttachment?.(post)}
                                                onCopyAttachmentLink={() => onCopyAttachmentLink?.(post)}
                                                onChangeColor={isEditable ? ((color: string) => onColorChange?.(post, color)) : undefined}
                                                onEdit={isEditable ? (() => onEditPost(post)) : undefined}
                                                onAddBefore={isEditable ? (() => onAddBefore?.(post)) : undefined}
                                                onAddAfter={isEditable ? (() => onAddAfter?.(post)) : undefined}
                                                onDuplicate={isEditable && onDuplicate ? (() => onDuplicate(post)) : undefined}
                                                onCopyToAnotherPadlet={isEditable && onCopyToAnotherPadlet ? (() => onCopyToAnotherPadlet(post)) : undefined}
                                                onTransferToAnotherPadlet={isEditable && onTransferToAnotherPadlet ? (() => onTransferToAnotherPadlet(post)) : undefined}
                                                onSetAsPadletCover={isEditable && onSetAsCover ? (() => onSetAsCover(post)) : undefined}
                                                onPin={isEditable && onPin ? (() => onPin(post)) : undefined}
                                                onReport={isEditable && onReport ? (() => onReport(post)) : undefined}
                                                onDelete={isEditable && onDeletePost ? (() => onDeletePost(post)) : undefined}
                                                onAddContainerAt={isEditable ? onAddContainerAt : undefined}
                                            >
                                                <CardShell
                                                    padletId={post.id}
                                                    isContainer
                                                    title={post.title || undefined}
                                                    cardColor={(post.metadata as any)?.cardColor || '#ffffff'}
                                                    topStripColor={post.metadata?.topStrip && post.metadata.topStrip !== 'transparent' ? post.metadata.topStrip : null}
                                                    onEdit={isEditable ? () => onEditPost(post) : undefined}
                                                    onExpandToggle={expandableContainers[post.id] ? () => setExpandedContainers(prev => ({ ...prev, [post.id]: !prev[post.id] })) : undefined}
                                                    isExpanded={expandedContainers[post.id] ?? false}
                                                    className="cursor-grab active:cursor-grabbing w-full"
                                                >
                                                    <RowColumnContainerCard
                                                        padlet={post}
                                                        allPadlets={allPadlets}
                                                        currentUserId={currentUserId}
                                                        currentUserName={currentUserName}
                                                        currentUserAvatar={currentUserAvatar}
                                                        onUpdateChildComments={onUpdateChildComments}
                                                        onDropDraftIntoContainer={isEditable ? onDropDraftIntoContainer : undefined}
                                                        isExpanded={expandedContainers[post.id] ?? false}
                                                        onExpandAvailabilityChange={(available) => setExpandableContainers(prev => prev[post.id] === available ? prev : { ...prev, [post.id]: available })}
                                                        isContentOnly
                                                    />
                                                </CardShell>
                                            </ColumnPostContextMenu>
                                        </SortableContainerItem>
                                    </React.Fragment>
                                );
                            }

                            return (
                                <React.Fragment key={post.id}>
                                    {showIndicator && <DropIndicator />}
                                    <SortableContainerItem id={post.id} widthClass={widthClass} disabled={!isEditable}>
                                        <ColumnPostContextMenu
                                            padlet={post}
                                            onSelect={() => { }}
                                            onOpen={() => onOpenPost?.(post)}
                                            onOpenInNewTab={() => onOpenInNewTab?.(post)}
                                            onCopyLink={() => onCopyLink?.(post)}
                                            onStartSlideshow={() => onStartSlideshow?.(post)}
                                            onDownloadAttachment={() => onDownloadAttachment?.(post)}
                                            onCopyAttachmentLink={() => onCopyAttachmentLink?.(post)}
                                            onChangeColor={isEditable ? ((color: string) => onColorChange?.(post, color)) : undefined}
                                            onEdit={isEditable ? (() => onEditPost(post)) : undefined}
                                            onAddBefore={isEditable ? (() => onAddBefore?.(post)) : undefined}
                                            onAddAfter={isEditable ? (() => onAddAfter?.(post)) : undefined}
                                            onDuplicate={isEditable && onDuplicate ? (() => onDuplicate(post)) : undefined}
                                            onCopyToAnotherPadlet={isEditable && onCopyToAnotherPadlet ? (() => onCopyToAnotherPadlet(post)) : undefined}
                                            onTransferToAnotherPadlet={isEditable && onTransferToAnotherPadlet ? (() => onTransferToAnotherPadlet(post)) : undefined}
                                            onSetAsPadletCover={isEditable && onSetAsCover ? (() => onSetAsCover(post)) : undefined}
                                            onPin={isEditable && onPin ? (() => onPin(post)) : undefined}
                                            onReport={isEditable && onReport ? (() => onReport(post)) : undefined}
                                            onDelete={isEditable && onDeletePost ? (() => onDeletePost(post)) : undefined}
                                            onAddContainerAt={isEditable ? onAddContainerAt : undefined}
                                        >
                                            <CardShell
                                                padletId={post.id}
                                                isContainer={false}
                                                cardColor={post.metadata?.cardColor || '#ffffff'}
                                                topStripColor={post.metadata?.topStrip && post.metadata.topStrip !== 'transparent' ? post.metadata.topStrip : null}
                                                onEdit={isEditable ? () => onEditPost(post) : undefined}
                                                className="cursor-grab active:cursor-grabbing"
                                            >
                                                <div className="text-base text-gray-800 whitespace-pre-line break-words select-text w-full overflow-hidden">
                                                    <PostCardContent padlet={post} allPadlets={allPadlets} />
                                                </div>
                                            </CardShell>
                                        </ColumnPostContextMenu>
                                    </SortableContainerItem>
                                </React.Fragment >
                            );
                        })}
                    </SortableContext>


                    {/* Drop indicator at the very end */}
                    {
                        dropIndicator?.sectionId === String(section.id) && dropIndicator?.index === posts.length && (
                            <DropIndicator />
                        )
                    }
                </div >
            </div >
        </div>
    );
}
