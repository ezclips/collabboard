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
    closestCenter,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";

import ColumnsLane from "./ColumnsCanvasRow";
import PostCardContent from "@/components/collabboard/PostCardContent";
import { BoardSection, Padlet, DropIndicatorState } from "@/types/collabboard";

type SectionWithPosts = {
    section: BoardSection;
    posts: Padlet[];
};

interface ColumnsLayoutProps {
    columns: SectionWithPosts[];
    className?: string;

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
    className,

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
    onDropContainerToSection,
    onDropDraftIntoContainer,
    allPadlets,
}: ColumnsLayoutProps) {
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>({
        sectionId: null,
        index: null,
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
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

    // Ref to track current pointer position during drag
    const pointerPositionRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Track pointer position globally during drag
    React.useEffect(() => {
        if (!activeDragId) return;

        const handleMouseMove = (e: MouseEvent) => {
            pointerPositionRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches[0]) {
                pointerPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchmove', handleTouchMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchmove', handleTouchMove);
        };
    }, [activeDragId]);

    // Handlers
    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const id = String(active.id);
        console.log(`[COLUMNS][DND] Drag Start: id=${id}`);

        // Initialize pointer position from activator event
        const activatorEvent = event.activatorEvent as MouseEvent | TouchEvent;
        if ('clientX' in activatorEvent) {
            pointerPositionRef.current = { x: activatorEvent.clientX, y: activatorEvent.clientY };
        } else if ('touches' in activatorEvent && activatorEvent.touches[0]) {
            pointerPositionRef.current = { x: activatorEvent.touches[0].clientX, y: activatorEvent.touches[0].clientY };
        }

        setActiveDragId(id);
        setDropIndicator({ sectionId: null, index: null });
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;

        if (!over) {
            setDropIndicator({ sectionId: null, index: null });
            return;
        }

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);

        let targetSectionId: string | null = null;
        let targetIndex: number | null = null;

        // Get current pointer Y from our tracking ref
        const pointerY = pointerPositionRef.current.y;

        // CASE 1: Hovering over lane background
        if (overIdStr.startsWith("lane:")) {
            targetSectionId = overIdStr.replace("lane:", "");
            const postsInSection = postsBySection[targetSectionId] || [];

            if (postsInSection.length === 0) {
                // Empty lane -> insert at index 0
                targetIndex = 0;
            } else {
                // Get first card in this section
                const firstCardElement = document.querySelector(
                    `[data-section-id="${targetSectionId}"] [data-post-id="${postsInSection[0].id}"]`
                );

                if (firstCardElement) {
                    const firstCardRect = firstCardElement.getBoundingClientRect();

                    // If pointer is ABOVE first card's top edge -> insert at index 0 (TOP)
                    if (pointerY < firstCardRect.top) {
                        targetIndex = 0;
                    } else {
                        // Otherwise, append to end
                        targetIndex = postsInSection.length;
                    }
                } else {
                    // Fallback: append to end
                    targetIndex = postsInSection.length;
                }
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
                        targetIndex = pointerY < midpoint ? overIndex : overIndex + 1;
                    } else {
                        targetIndex = overIndex;
                    }
                }
            }
        }

        if (targetSectionId !== null && targetIndex !== null) {
            setDropIndicator({ sectionId: targetSectionId, index: targetIndex });
        } else {
            setDropIndicator({ sectionId: null, index: null });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active } = event;
        const activeIdStr = String(active.id);

        console.log('[COLUMNS][DND] Drag End');

        setActiveDragId(null);
        const finalIndicator = dropIndicator;
        setDropIndicator({ sectionId: null, index: null });

        if (!finalIndicator.sectionId || finalIndicator.index === null) return;

        const fromSectionId = containerToSectionId[activeIdStr];
        const toSectionId = finalIndicator.sectionId;
        const targetIndex = finalIndicator.index;

        // If we can't find where it came from, we can't move it safely?
        // Actually standard is we valid move if we have target.
        // But we need fromSectionId for update callbacks usually.
        if (!fromSectionId) {
            // fallback or return
            return;
        }

        const movedPadlet = padletById.get(activeIdStr);
        if (!movedPadlet) return;

        const movedIsContainer = isContainerPadlet(movedPadlet);

        if (movedIsContainer) {
            if (String(fromSectionId) === String(toSectionId)) {
                onReorderPost?.(activeIdStr, String(fromSectionId), String(toSectionId), targetIndex);
            } else {
                // Container move across sections
                await onDropContainerToSection?.(activeIdStr, String(toSectionId), targetIndex, String(fromSectionId));
            }
        } else {
            onReorderPost?.(activeIdStr, String(fromSectionId), String(toSectionId), targetIndex);
        }
    };

    return (
        <div className={`h-full min-h-0 overflow-hidden ${className || ""}`}>
            <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden no-scrollbar">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
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
                                    section={section}
                                    posts={posts}
                                    allPadlets={allPadlets}
                                    laneDroppableId={laneId(section.id)}

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
                                    onDropContainerToSection={onDropContainerToSection}
                                    onDropDraftIntoContainer={onDropDraftIntoContainer}
                                />
                            </div>
                        ))}

                        <button
                            onClick={onAddGlobalSection}
                            className="shrink-0 w-32 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center gap-2 transition-all shadow-lg border border-white/10"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="font-medium text-xs">Add section</span>
                        </button>
                    </div>

                    <DragOverlay dropAnimation={customDropAnimation}>
                        {activeDragId ? (
                            <div className="opacity-80 rotate-2 cursor-grabbing pointer-events-none">
                                {(() => {
                                    const post = padletById.get(activeDragId);
                                    if (!post) return null;

                                    return (
                                        <div className="w-[280px] rounded-2xl shadow-2xl border border-gray-300/80 bg-white px-5 py-4">
                                            <PostCardContent padlet={post} allPadlets={allPadlets} />
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
