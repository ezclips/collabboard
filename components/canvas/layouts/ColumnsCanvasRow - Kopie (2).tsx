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
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BoardSection, Padlet, DropIndicatorState } from "@/types/collabboard";
import PostCardContent from "@/components/collabboard/PostCardContent";
import { ColumnPostContextMenu } from "@/components/collabboard/menus/ColumnPostContextMenu";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

const isContainerPadlet = (p: Padlet) =>
  p.type === "container" ||
  (p.metadata as any)?.kind === "container" ||
  (p.metadata as any)?.isContainer;

type ColumnsLayoutProps = {
  section?: BoardSection;
  posts: Padlet[];

  // dnd-kit lane id injected by controller
  laneDroppableId: string;

  onAddPost: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAddSectionLeft: () => void;
  onAddSectionRight: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;

  onEditPost: (post: Padlet) => void;
  onDeletePost?: (post: Padlet) => void;
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

  onAddContainerAt?: (position: number) => void;
  onDropContainerToSection?: (
    containerId: string,
    toSectionId: string,
    targetIndex: number,
    fromSectionId?: string
  ) => Promise<void> | void;

  allPadlets: Padlet[];

  // purely UI (optional)
  activeDragId: string | null;
  dropIndicator?: DropIndicatorState;

  onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void | Promise<void>;
};



function DraggablePostItem({
  post,
  children,
  isActive,
}: {
  post: Padlet;
  children: React.ReactNode;
  isActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    data: { type: 'post', post },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative group/item transition-opacity",
        isDragging && "opacity-0", // Hide original during drag
        isActive && "ring-2 ring-purple-400"
      )}
      {...attributes}
      {...listeners}
      // ✅ Prevent right-click from starting drag; keep Radix context menu working
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement | null;

        // Right click -> do NOT start dnd-kit drag
        if ((e as any).button === 2) {
          e.stopPropagation();
          return;
        }

        // Anything inside data-no-drag should not start dragging
        if (target?.closest?.('[data-no-drag="true"]')) {
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}

export default function ColumnsCanvasRow({
  section,
  posts,

  laneDroppableId,

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
  allPadlets,
  activeDragId,
  dropIndicator,
  onDropDraftIntoContainer,
}: ColumnsLayoutProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(section?.title ?? "");

  React.useEffect(() => {
    if (section) setEditingTitle(section.title);
  }, [section?.id]);

  if (!section) {
    // IMPORTANT: Never return null here (hydration mismatch / empty canvas risk).
    // Render a stable placeholder column instead.
    return (
      <div className="flex flex-col w-[280px] h-full min-h-0 flex-shrink-0 opacity-0 pointer-events-none" />
    );
  }

  const { setNodeRef: setLaneRef } = useDroppable({
    id: laneDroppableId,
    data: { type: 'lane', sectionId: section.id }
  });

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
    ((((a.metadata as any)?.sectionPosition as number) || 0) -
      (((b.metadata as any)?.sectionPosition as number) || 0))
  );

  return (
    <div className="flex flex-col w-[280px] h-full min-h-0 flex-shrink-0 group/section">
      {/* Section Header */}
      <div className="shrink-0 flex items-center justify-between mb-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-white shadow-lg">
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
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm truncate">{section.title}</span>
              <button
                onClick={() => setIsEditing(true)}
                className="opacity-60 hover:opacity-100 transition-opacity"
                data-no-drag="true"
              >
                <Edit2 size={14} />
              </button>
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="opacity-80 hover:opacity-100 transition-opacity" data-no-drag="true">
              <MoreVertical size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuItem onClick={onAddSectionLeft}>
              <MoveLeft size={14} className="mr-2" /> Add section left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddSectionRight}>
              <MoveRight size={14} className="mr-2" /> Add section right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onMoveLeft}>
              <MoveLeft size={14} className="mr-2" /> Move left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveRight}>
              <MoveRight size={14} className="mr-2" /> Move right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 size={14} className="mr-2" /> Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Add Item Button */}
      <button
        onClick={() => onAddContainerAt?.(sortedPosts.length)}
        className="shrink-0 mb-3 w-full h-10 bg-black/20 hover:bg-black/30 text-white rounded-lg flex items-center justify-center transition-all border border-white/5 opacity-0 group-hover/section:opacity-100"
        data-no-drag="true"
      >
        <Plus size={20} />
      </button>

      {/* Scroll Region (droppable lane + sortable list) */}
      <div
        ref={setLaneRef}
        className="flex-1 min-h-0 overflow-y-auto pb-0 px-2 space-y-4 hide-scrollbar"
        data-column-scroll="true"
      >
        {sortedPosts.map((post, index) => {
          const isContainer = isContainerPadlet(post);

          const card = isContainer ? (
            <div
              // Add data-post-id for target detection
              data-post-id={post.id}
              // Add container id for native drop
              data-container-id={post.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragEnter={(e) => {
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const payload = e.dataTransfer.getData("application/json");

                if (payload) {
                  try {
                    const data = JSON.parse(payload);
                    onDropDraftIntoContainer?.(post.id, data);
                  } catch (err) {
                  }
                }
              }}
            >
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
                onAddContainerAt={onAddContainerAt ? (pos: number) => onAddContainerAt(pos) : undefined}
              >
                <div
                  className={cn(
                    "group relative bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-transform duration-150 ease-out border border-gray-300/80 overflow-hidden px-5 py-4 min-h-[160px] select-none"
                  )}
                  style={{ backgroundColor: (post.metadata as any)?.cardColor || "#fff" }}
                >
                  <PostCardContent padlet={post} allPadlets={allPadlets} />
                </div>
              </ColumnPostContextMenu>
            </div>
          ) : (
            <div data-post-id={post.id}>
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
                onAddContainerAt={onAddContainerAt ? (pos: number) => onAddContainerAt(pos) : undefined}
              >
                <div
                  className={cn(
                    "group relative bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-transform duration-150 ease-out border border-gray-300/80 overflow-hidden px-5 py-4 min-h-[120px] select-none"
                  )}
                  style={{ backgroundColor: (post.metadata as any)?.cardColor || "#fff" }}
                >
                  <PostCardContent padlet={post} allPadlets={allPadlets} />
                </div>
              </ColumnPostContextMenu>
            </div>
          );

          return (
            <React.Fragment key={post.id}>


              <DraggablePostItem post={post} isActive={activeDragId === post.id}>
                {card}
              </DraggablePostItem>
            </React.Fragment>
          );
        })}


      </div>
    </div>
  );
}
