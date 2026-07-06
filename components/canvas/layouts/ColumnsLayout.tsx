import React, { useState, useMemo, useEffect } from "react";
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
    DropAnimation,
    defaultDropAnimationSideEffects,
    pointerWithin,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";

import ColumnsLane from "@/components/canvas/layouts/ColumnsCanvasRow";
import PostCardContent from "@/components/collabboard/PostCardContent";
import PostPreviewCard from "@/components/collabboard/PostPreviewCard";
import { BoardSection, Padlet, DropIndicatorState } from "@/types/collabboard";

type SectionWithPosts = {
    section: BoardSection;
    posts: Padlet[];
};

interface ColumnsLayoutProps {
    columns: SectionWithPosts[];
    isEditable?: boolean;
    className?: string;
    widthClass?: string; // Dynamic width class

    onAddPost: (sectionId: number) => void;
    onRenameSection: (sectionId: number, title: string) => void;
    onDeleteSection: (sectionId: number) => void;
    onAddSectionLeft: (sectionId: number) => void;
    onAddSectionRight: (sectionId: number) => void;
    onMoveLeft: (sectionId: number) => void;
    onMoveRight: (sectionId: number) => void;
    onAddGlobalSection: () => void;
    onReorderPost?: (postId: string, fromSectionId: string, toSectionId: string, index: number) => void;

    onEditPost: (post: Padlet) => void;
    onOpenPost?: (post: Padlet) => void;
    onDeletePost?: (post: Padlet) => void;
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
    onCopyLink?: (post: Padlet) => void;
    onOpenInNewTab?: (post: Padlet) => void;
    onSectionActive?: (sectionId: string) => void;
    onAddContainerAt?: (sectionId: number, position: number) => void;
    onAddEmptyContainerAt?: (sectionId: number, position: number) => void;
    onDropContainerToSection?: (
        containerId: string,
        toSectionId: string,
        targetIndex: number,
        fromSectionId?: string
    ) => Promise<void> | void;

    onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void | Promise<void>;

    allPadlets: Padlet[];
    dropIndicator?: DropIndicatorState;
    setDropIndicator?: (state: DropIndicatorState) => void;
    // Comment handling
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    onUpdateChildComments?: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
}

const customDropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: "0.4",
            },
        },
    }),
};

const laneId = (sectionId: number | string) => `lane:${sectionId}`;
const isContainerPadlet = (p: Padlet) =>
    p.type === "container" ||
    (p.metadata as any)?.kind === "container" ||
    (p.metadata as any)?.isContainer;

export default function ColumnsLayout({
    columns,
    isEditable = false,
    className,
    widthClass,

    onAddPost,
    onRenameSection,
    onDeleteSection,
    onAddSectionLeft,
    onAddSectionRight,
    onMoveLeft,
    onMoveRight,
    onAddGlobalSection,
    onReorderPost,

    onEditPost,
    onOpenPost,
    onDeletePost,
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
    onCopyLink,
    onOpenInNewTab,
    onSectionActive,
    onAddContainerAt,
    onAddEmptyContainerAt,
    onDropContainerToSection,
    onDropDraftIntoContainer,
    allPadlets,
    currentUserId,
    currentUserName,
    currentUserAvatar,
    onUpdateChildComments,
}: ColumnsLayoutProps) {
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>({
        sectionId: null,
        index: null,
    });
    // Ref mirrors dropIndicator state so handleDragEnd always reads the latest
    // value even if React hasn't committed the setState from handleDragOver yet.
    const dropIndicatorRef = React.useRef<DropIndicatorState>({ sectionId: null, index: null });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 15,
            },
        })
    );

    // Normalize columns
    const normalizedColumns = useMemo<SectionWithPosts[]>(() => {
        if (!columns) return [];
        return columns
            .map((c) => {
                if (!c) return null;
                if ((c as SectionWithPosts).section) {
                    return { section: (c as SectionWithPosts).section, posts: (c as SectionWithPosts).posts ?? [] };
                }
                if ((c as unknown as BoardSection).id) {
                    return { section: c as unknown as BoardSection, posts: [] };
                }
                return null;
            })
            .filter((c): c is SectionWithPosts => c !== null && c.section !== undefined);
    }, [columns]);

    // Derived state for lookups
    const postsBySection = useMemo(() => {
        const map: Record<string, Padlet[]> = {};
        normalizedColumns.forEach(({ section }) => {
            map[String(section.id)] = [];
        });
        // Populate with ALL padlets that belong to sections to ensure we catch everything
        // But safely we can use the props posts if they are reliable.
        // The plan suggests strictly following the props.
        // However, for drag target calculation, we need accurate lists.
        // Let's use normalizedColumns posts.
        normalizedColumns.forEach(({ section, posts }) => {
            map[String(section.id)] = [...posts].sort(
                (a, b) =>
                ((((a.metadata as any)?.sectionPosition as number) || 0) -
                    (((b.metadata as any)?.sectionPosition as number) || 0))
            );
        });
        return map;
    }, [normalizedColumns]);

    const padletById = useMemo(() => {
        const map = new Map<string, Padlet>();
        allPadlets.forEach((p) => map.set(p.id, p));
        return map;
    }, [allPadlets]);

    const containerToSectionId = useMemo(() => {
        const map: Record<string, string> = {};
        allPadlets.forEach((p) => {
            if ((p.metadata as any)?.sectionId) {
                map[p.id] = String((p.metadata as any).sectionId);
            }
        });
        return map;
    }, [allPadlets]);

    // Ref to track ACTUAL current pointer position
    const pointerPositionRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Track pointer position using window listener with capture phase
    React.useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            pointerPositionRef.current = { x: e.clientX, y: e.clientY };
        };

        // Use capture phase to ensure we get events even during drag
        window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });

        return () => {
            window.removeEventListener('pointermove', handlePointerMove, { capture: true } as EventListenerOptions);
        };
    }, []);

    // Handlers
    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const id = String(active.id);

        // Initialize pointer position
        const activatorEvent = event.activatorEvent as PointerEvent;
        if (activatorEvent.clientY) {
            pointerPositionRef.current = { x: activatorEvent.clientX, y: activatorEvent.clientY };
        }

        setActiveDragId(id);
        dropIndicatorRef.current = { sectionId: null, index: null };
        setDropIndicator({ sectionId: null, index: null });
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;

        if (!over) {
            dropIndicatorRef.current = { sectionId: null, index: null };
            setDropIndicator({ sectionId: null, index: null });
            return;
        }

        const overIdStr = String(over.id);

        let targetSectionId: string | null = null;
        let targetIndex: number | null = null;

        // Use the DRAGGED ITEM'S position, not the pointer.
        // This handles offsets (grabbing card from bottom) and is more reliable.
        const activeRect = active.rect.current.translated;
        // Fallback to initial if translated is null (shouldn't happen during drag)
        const currentY = activeRect ? activeRect.top : (pointerPositionRef.current.y);

        // CASE 1: Hovering over lane background
        if (overIdStr.startsWith("lane:")) {
            targetSectionId = overIdStr.replace("lane:", "");
            const postsInSection = postsBySection[targetSectionId] || [];

            if (postsInSection.length === 0) {
                // Empty lane -> insert at index 0
                targetIndex = 0;
            } else {
                // We are hovering the lane background (gaps between cards).
                // We must find the correct insertion index by checking ALL card positions.
                let bestIndex = postsInSection.length; // Default to append

                // Iterate through all posts to find where we fit
                for (let i = 0; i < postsInSection.length; i++) {
                    const post = postsInSection[i];
                    const element = document.querySelector(
                        `[data-section-id="${targetSectionId}"] [data-post-id="${post.id}"]`
                    );

                    if (element) {
                        const rect = element.getBoundingClientRect();
                        const cardMidpoint = rect.top + rect.height / 2;

                        // If we are strictly ABOVE this card's midpoint, insert here.
                        if (currentY < cardMidpoint) {
                            bestIndex = i;
                            break; // Found our spot, stop looking
                        }
                    }
                }
                targetIndex = bestIndex;
            }
        }
        // CASE 2: Hovering over a card
        else {
            targetSectionId = containerToSectionId[overIdStr];

            if (targetSectionId) {
                const postsInSec = postsBySection[targetSectionId] || [];
                const overIndex = postsInSec.findIndex((p) => p.id === overIdStr);

                if (overIndex !== -1) {
                    // Precise Midpoint Detection
                    const overElement = document.querySelector(`[data-post-id="${overIdStr}"]`);

                    if (overElement) {
                        const rect = overElement.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;

                        // Top half -> insert before (index)
                        // Bottom half -> insert after (index + 1)
                        targetIndex = currentY < midpoint ? overIndex : overIndex + 1;
                    } else {
                        targetIndex = overIndex;
                    }
                }
            }
        }

        if (targetSectionId !== null && targetIndex !== null) {
            dropIndicatorRef.current = { sectionId: targetSectionId, index: targetIndex };
            setDropIndicator({ sectionId: targetSectionId, index: targetIndex });
        } else {
            dropIndicatorRef.current = { sectionId: null, index: null };
            setDropIndicator({ sectionId: null, index: null });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active } = event;
        const activeIdStr = String(active.id);

        setActiveDragId(null);
        // Snapshot then clear the indicator
        const savedIndicator = { ...dropIndicatorRef.current };
        dropIndicatorRef.current = { sectionId: null, index: null };
        setDropIndicator({ sectionId: null, index: null });

        const fromSectionId = containerToSectionId[activeIdStr];
        if (!fromSectionId) return;

        const movedPadlet = padletById.get(activeIdStr);
        if (!movedPadlet) return;

        const movedIsContainer = isContainerPadlet(movedPadlet);

        if (movedIsContainer) {
            // Compute drop target directly from the final pointer position.
            // pointerWithin collision detection is unreliable for same-column drags
            // because the active card's placeholder blocks event firing. Using the
            // real pointer position at drop time is always accurate.
            const pointer = pointerPositionRef.current;
            let finalSectionId: string | null = null;
            let finalIndex: number | null = null;

            for (const col of normalizedColumns) {
                const sectionId = String(col.section.id);
                const laneEl = document.querySelector(`[data-section-id="${sectionId}"]`);
                if (!laneEl) continue;
                const laneRect = laneEl.getBoundingClientRect();
                if (pointer.x < laneRect.left || pointer.x > laneRect.right) continue;

                // Pointer is within this column — find insertion index.
                // Exclude the active card so we scan only other items.
                finalSectionId = sectionId;
                const otherPosts = (postsBySection[sectionId] || []).filter(p => p.id !== activeIdStr);
                let bestIndex = otherPosts.length; // default: append

                for (let i = 0; i < otherPosts.length; i++) {
                    const el = document.querySelector(
                        `[data-section-id="${sectionId}"] [data-post-id="${otherPosts[i].id}"]`
                    );
                    if (!el) continue;
                    const rect = el.getBoundingClientRect();
                    if (pointer.y < rect.top + rect.height / 2) {
                        bestIndex = i;
                        break;
                    }
                }
                finalIndex = bestIndex;
                break;
            }

            if (!finalSectionId || finalIndex === null) return;

            await onDropContainerToSection?.(activeIdStr, finalSectionId, finalIndex, fromSectionId);
        } else {
            // Non-containers: use the indicator captured during DragOver (was reliable before)
            if (!savedIndicator.sectionId || savedIndicator.index === null) return;
            onReorderPost?.(activeIdStr, fromSectionId, savedIndicator.sectionId, savedIndicator.index);
        }
    };

    return (
        <div className={`h-full min-h-0 overflow-hidden ${className || ""}`}>
            <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden no-scrollbar" data-columns-scroll-container>
                <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithin}
                    onDragStart={isEditable ? handleDragStart : undefined}
                    onDragOver={isEditable ? handleDragOver : undefined}
                    onDragEnd={isEditable ? handleDragEnd : undefined}
                >
                    <div className="h-full min-h-0 flex gap-6 px-10 py-10 items-stretch overflow-y-hidden">
                        {normalizedColumns.map(({ section, posts }) => (
                            <div
                                key={section.id}
                                data-section-id={section.id}
                                className="h-full min-h-0 flex"
                                onPointerDownCapture={() => onSectionActive?.(section.id.toString())}
                            >
                                <ColumnsLane
                                    isEditable={isEditable}
                                    section={section}
                                    posts={posts}
                                    allPadlets={allPadlets}
                                    laneDroppableId={laneId(section.id)}
                                    widthClass={widthClass}

                                    // UI State
                                    activeDragId={activeDragId}
                                    dropIndicator={dropIndicator}

                                    // Callbacks
                                    onAddPost={() => onAddPost(Number(section.id))}
                                    onRename={(title) => onRenameSection(Number(section.id), title)}
                                    onDelete={() => onDeleteSection(Number(section.id))}
                                    onAddSectionLeft={() => onAddSectionLeft(Number(section.id))}
                                    onAddSectionRight={() => onAddSectionRight(Number(section.id))}
                                    onMoveLeft={() => onMoveLeft(Number(section.id))}
                                    onMoveRight={() => onMoveRight(Number(section.id))}

                                    onEditPost={onEditPost}
                                    onOpenPost={onOpenPost}
                                    onDeletePost={onDeletePost}
                                    onStartSlideshow={onStartSlideshow}
                                    onDownloadAttachment={onDownloadAttachment}
                                    onCopyAttachmentLink={onCopyAttachmentLink}
                                    onColorChange={onColorChange}
                                    onAddBefore={onAddBefore}
                                    onAddAfter={onAddAfter}
                                    onDuplicate={onDuplicate}
                                    onCopyToAnotherPadlet={onCopyToAnotherPadlet}
                                    onTransferToAnotherPadlet={onTransferToAnotherPadlet}
                                    onSetAsCover={onSetAsCover}
                                    onPin={onPin}
                                    onReport={onReport}
                                    onCopyLink={onCopyLink}
                                    onOpenInNewTab={onOpenInNewTab}

                                    // Container helpers
                                    onAddContainerAt={(pos) => onAddContainerAt?.(Number(section.id), pos)}
                                    onAddEmptyContainerAt={(pos) => onAddEmptyContainerAt?.(Number(section.id), pos)}
                                    onDropContainerToSection={onDropContainerToSection}
                                    onDropDraftIntoContainer={onDropDraftIntoContainer}

                                    // Comment handling
                                    currentUserId={currentUserId}
                                    currentUserName={currentUserName}
                                    currentUserAvatar={currentUserAvatar}
                                    onUpdateChildComments={onUpdateChildComments}
                                />
                            </div>
                        ))}

                        {isEditable && (
                            <button
                                onClick={onAddGlobalSection}
                                className="shrink-0 w-32 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center gap-2 transition-all shadow-lg border border-white/10"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="font-medium text-xs">Add section</span>
                            </button>
                        )}
                    </div>

                    <DragOverlay dropAnimation={customDropAnimation}>
                        {activeDragId ? (
                            <div className="opacity-80 rotate-2 cursor-grabbing pointer-events-none">
                                {(() => {
                                    const post = padletById.get(activeDragId);
                                    if (!post) return null;

                                    return (
                                        <div className="w-[280px] bg-white rounded-lg shadow-md border border-gray-200 p-3">
                                            <PostCardContent
                                                padlet={post}
                                                allPadlets={allPadlets}
                                            />
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>
        </div>
    );
}
