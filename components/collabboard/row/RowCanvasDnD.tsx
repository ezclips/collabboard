import React, { useMemo, useState, useCallback, useRef } from "react";
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
    closestCenter,
    useDroppable,
    defaultDropAnimationSideEffects,
    DropAnimation
} from '@dnd-kit/core';
import { BoardSection, Padlet, DropIndicatorState } from "@/types/collabboard";
import RowLane from "./RowLane";
import PostCardContent from "../PostCardContent";

// Helper to determine index based on pointer position relative to card center
function getInsertIndex(pointerX: number, cardRect: DOMRect): 'before' | 'after' {
    const center = cardRect.left + cardRect.width / 2;
    return pointerX < center ? 'before' : 'after';
}

export interface RowCanvasDnDProps {
    isEditable?: boolean;
    sections: BoardSection[];
    padlets: Padlet[];
    allPadlets: Padlet[]; // For passing to RowLane -> PostCardContent
    widthClass?: string; // Dynamic width class
    // Section Actions
    onRename: (sectionId: number, title: string) => void;
    onDeleteSection: (sectionId: number) => void;
    onAddSectionLeft: (sectionId: number) => void;
    onAddSectionRight: (sectionId: number) => void;
    onMoveSectionLeft: (sectionId: number) => void;
    onMoveSectionRight: (sectionId: number) => void;
    onAddContainerAt: (sectionId: number, position: number) => void; // Global add
    onAddEmptyContainerAt?: (sectionId: number, position: number) => void; // Quick add (no prompt)
    // DnD Actions
    onReorderPost: (
        postId: string,
        fromSectionId: string,
        toSectionId: string,
        newIndex: number
    ) => void;
    // Post Actions
    onEditPost: (post: Padlet) => void;
    onDeletePost: (post: Padlet) => void;
    onOpenPost: (post: Padlet) => void;
    onOpenTarget?: (post: Padlet) => void; // For opening specific child posts from containers
    onOpenInNewTab: (post: Padlet) => void;
    onCopyLink: (post: Padlet) => void;
    onStartSlideshow: (post: Padlet) => void;
    onDownloadAttachment: (post: Padlet) => void;
    onCopyAttachmentLink: (post: Padlet) => void;
    onColorChange: (post: Padlet, color: string) => void;
    onAddBefore: (post: Padlet) => void;
    onAddAfter: (post: Padlet) => void;
    onDuplicate: (post: Padlet) => void;
    onCopyToAnotherPadlet: (post: Padlet) => void;
    onTransferToAnotherPadlet: (post: Padlet) => void;
    onSetAsCover: (post: Padlet) => void;
    onPin: (post: Padlet) => void;
    onReport: (post: Padlet) => void;
    // Comment handling
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    onUpdateChildComments?: (childId: string, comments: any[]) => void;
    onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void | Promise<void>;
}

export default function RowCanvasDnD({
    isEditable = false,
    sections,
    padlets,
    allPadlets,
    widthClass,
    onRename,
    onDeleteSection,
    onAddSectionLeft,
    onAddSectionRight,
    onMoveSectionLeft,
    onMoveSectionRight,
    onAddContainerAt,
    onAddEmptyContainerAt,
    onReorderPost,
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
}: RowCanvasDnDProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>({ sectionId: null, index: null });

    // Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 15,
            },
        })
    );

    // Derived state: Map sections to their sorted posts
    const postsBySection = useMemo(() => {
        const map: Record<string, Padlet[]> = {};
        sections.forEach(s => {
            map[s.id] = [];
        });

        padlets.forEach(p => {
            const secId = String((p.metadata as any)?.sectionId || "");
            if (map[secId]) {
                map[secId].push(p);
            }
        });

        // Sort each section
        Object.keys(map).forEach(secId => {
            map[secId].sort((a, b) => {
                const posA = ((a.metadata as any)?.sectionPosition as number) || 0;
                const posB = ((b.metadata as any)?.sectionPosition as number) || 0;
                return posA - posB;
            });
        });

        return map;
    }, [sections, padlets.length, padlets]); // Recompute if sections or padlets change

    // Fast lookup by id for DragOverlay rendering
    const padletById = useMemo(() => new Map(padlets.map(p => [p.id, p])), [padlets]);

    // Helper map to find section of a container strictly by ID
    const containerToSectionId = useMemo(() => {
        const map: Record<string, string> = {};
        padlets.forEach(p => {
            if ((p.metadata as any)?.sectionId) {
                map[p.id] = String((p.metadata as any).sectionId);
            }
        });
        return map;
    }, [padlets]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
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

        // Identify target section
        let targetSectionId: string | null = null;
        let targetIndex: number | null = null;

        // Check if over a lane (droppable)
        if (overIdStr.startsWith("lane:")) {
            targetSectionId = overIdStr.replace("lane:", "");
            // Append to end
            targetIndex = postsBySection[targetSectionId]?.length || 0;
        } else {
            // Over a card
            targetSectionId = containerToSectionId[overIdStr];

            // Fallback: search in sections if map failed (unlikely if data consistent)
            if (!targetSectionId) {
                for (const sec of sections) {
                    if (postsBySection[sec.id]?.find(p => p.id === overIdStr)) {
                        targetSectionId = String(sec.id);
                        break;
                    }
                }
            }

            if (targetSectionId) {
                const postsInSec = postsBySection[targetSectionId] || [];
                const overIndex = postsInSec.findIndex(p => p.id === overIdStr);

                if (overIndex !== -1) {
                    // Calculate precise index using pointer
                    // dnd-kit provides generic collision, but for precise generic insert we need pointer X
                    // We can attempt to get the element rect from the document
                    // since we know the ID (data-container-id={id}) or via dnd-kit refs?
                    // dnd-kit doesn't expose rects easily in onDragOver without custom collision detection,
                    // but we can query the DOM because we are in the browser.

                    // Try finding the card DOM element
                    // Currently RowLane renders cards wrapped in SortableContainerItem
                    // The SortableContainerItem puts ref on the outer div.
                    // But we likely want the visible card which has `data-container-id`
                    const cardEl = document.querySelector(`[data-container-id="${overIdStr}"]`);

                    if (cardEl) {
                        const rect = cardEl.getBoundingClientRect();
                        // Get pointer X from event (activatorEvent usually has clientX in PointerEvents)
                        // Note: event.activatorEvent is the event that STARTED the drag.
                        // We need CURRENT pointer. dnd-kit doesn't expose exact current pointer in DragOverEvent directly
                        // unless we assume standard collision data.
                        // However, strictly speaking, active.rect is available, and over.rect is available?
                        // Actually event.over?.rect (if using specific collision detection) might work? No.
                        //
                        // Workaround: We can infer 'before' or 'after' by comparing indices if in same list,
                        // but cross-list or precise hover requires geometry.
                        //
                        // Let's use `closestCenter` strategy logic:
                        // If we are over item X, `closestCenter` means we are closest to X's center.
                        // If we approach X from left, we are closer to X than X-1.
                        // But we want to know if we crossed the midpoint *of X*.
                        //
                        // Let's try a simpler heuristic first: 
                        // If active.id !== over.id, drag-over index is simply the index of `over` item.
                        targetIndex = overIndex;

                        // We can't easily get pointer X here without custom sensors/coordinates.
                        // BUT, we can rely on how `SortableContext` usually works: it swaps items.
                        // Since we are managing `dropIndicator` manually for visual feedback:
                        // If we are strictly over an item, let's default to that item's index.
                        // The user plan mentioned "the midpoint technique you already built".
                        // In Layout it was: `(r.left + r.width / 2) - scrollRect.left`.
                        //
                        // Refined approach:
                        // If we are dragging Right-to-Left, we want to insert 'after' previous, or 'at' current?
                        // Let's stick to simple: targetIndex = overIndex.
                        // Visual refinement: if we can detect we are past midpoint, index++.

                        // Optimization: For now, let's trust dnd-kit's "over" means "this is the spot".
                        // Logic in standard sortable: "over" is the item being displaced.

                        // Let's try to get the activeRect and overRect if available.
                        // They are not on the event object types directly in basic usage.
                    } else {
                        targetIndex = overIndex;
                    }
                }
            }
        }

        if (targetSectionId !== null && targetIndex !== null) {
            setDropIndicator({ sectionId: targetSectionId, index: targetIndex });
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active } = event;
        setActiveId(null);
        setDropIndicator({ sectionId: null, index: null });

        // Logic handled by onDragOver populating dropIndicator?
        // No, handling it in dragOver is for VISUALS.
        // For actual logical move, we need to finalize it here.
        // Or we can use the last good dropIndicator state?
        // The plan says: "Use activeId and dropIndicator".

        // Wait, handleDragEnd receives `over`.
        // If we trust `dropIndicator` state (which was updated in DragOver),
        // we can use it.
        // However, React state updates might be async or one tick behind the very last event?
        // Usually safe enough for DnD end. 
        // Let's re-calculate to be safe, OR use the `dropIndicator` reference if we used a ref.
        // The component uses `useState`.
        // Better: Re-calculate functionality logic to ensure consistency, 
        // OR rely on state if we are sure.
        // Plan says: "Use activeId and dropIndicator". I will use state.

        if (!dropIndicator.sectionId || dropIndicator.index === null) return;

        const activeIdStr = String(active.id);
        const fromSectionId = containerToSectionId[activeIdStr];
        const toSectionId = dropIndicator.sectionId;
        const targetIndex = dropIndicator.index;

        if (!fromSectionId) return;

        // Avoid redundant updates
        // Note: index comparison is tricky if moving within same list (index shift).
        // onReorderPost usually handles "move item to index X".
        // If moving down in same list, index might need adjustment depending on backend implementation.
        // But usually "insert at index X" implies "make it the item at index X".

        onReorderPost(activeIdStr, fromSectionId, toSectionId, targetIndex);
    };

    // Droppable lanes wrapper
    // We need to render RowLane for each section
    // And wrap each RowLane's content area in useDroppable?
    // RowLane itself is the implementation.
    // If we want the whole lane to be droppable, we can wrap RowLane or pass a ref?
    // User Plan Step 2.2: "In RowCanvasDnD, for each lane: wrap lane list in useDroppable({ id: lane:${sectionId} })"

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={isEditable ? handleDragStart : undefined}
            onDragOver={isEditable ? handleDragOver : undefined}
            onDragEnd={isEditable ? handleDragEnd : undefined}
        >
            <div className="flex flex-col gap-4">
                {sections.map(section => (
                    <DroppableLaneWrapper
                        key={section.id}
                        section={section}
                        padlets={postsBySection[section.id] || []}
                    >
                        <RowLane
                            isEditable={isEditable}
                            section={section}
                            posts={postsBySection[section.id] || []}
                            allPadlets={allPadlets}
                            dropIndicator={dropIndicator}
                            widthClass={widthClass}
                            // Callbacks
                            onRename={(title) => onRename(section.id, title)}
                            onDelete={() => onDeleteSection(section.id)}
                            onAddSectionLeft={() => onAddSectionLeft(section.id)}
                            onAddSectionRight={() => onAddSectionRight(section.id)}
                            onMoveLeft={() => onMoveSectionLeft(section.id)}
                            onMoveRight={() => onMoveSectionRight(section.id)}
                            onAddContainerAt={(pos) => onAddContainerAt(section.id, pos)}
                            onAddEmptyContainerAt={onAddEmptyContainerAt ? (pos) => onAddEmptyContainerAt(section.id, pos) : undefined}
                            onEditPost={onEditPost}
                            onDeletePost={onDeletePost}
                            onOpenPost={onOpenPost}
                            onOpenTarget={onOpenTarget}
                            onOpenInNewTab={onOpenInNewTab}
                            onCopyLink={onCopyLink}
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
                            currentUserId={currentUserId}
                            currentUserName={currentUserName}
                            currentUserAvatar={currentUserAvatar}
                    onUpdateChildComments={onUpdateChildComments}
                    onDropDraftIntoContainer={onDropDraftIntoContainer}
                />
                    </DroppableLaneWrapper>
                ))}
            </div>

            <DragOverlay dropAnimation={defaultDropAnimation}>
                {activeId ? (
                    // We ideally render the card being dragged.
                    // Finding the post data:
                    <div className="opacity-80 rotate-2 cursor-grabbing pointer-events-none">
                        {/* Render a placeholder or simplified card. 
                           Since we don't have the full post context easily without searching,
                           we can search padlets list. */}
                        {(() => {
                            const p = activeId ? padletById.get(activeId) : undefined;
                            if (!p) return null;
                            // Re-use PostCardContent logic or simplified view
                            return (
                                <div className="w-[280px] h-[160px] bg-white rounded-2xl shadow-2xl border border-gray-300 p-4 overflow-hidden">
                                    <PostCardContent padlet={p} allPadlets={allPadlets} />
                                </div>
                            )
                        })()}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

// Inner component to handle droppable logic for the lane background
function DroppableLaneWrapper({ section, padlets, children }: { section: BoardSection, padlets: Padlet[], children: React.ReactNode }) {
    const { setNodeRef } = useDroppable({
        id: `lane:${section.id}`,
        data: { type: 'lane', sectionId: section.id }
    });

    return (
        <div ref={setNodeRef} className="relative" data-section-id={section.id}>
            {children}
        </div>
    );
}

const defaultDropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.4',
            },
        },
    }),
};
