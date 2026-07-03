import React, { useState } from "react";
import {
  MoreVertical,
  Plus,
  Trash2,
  MoveLeft,
  MoveRight,
  Edit2,
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
import RowColumnContainerCard from "@/components/collabboard/RowColumnContainerCard";
import { ColumnPostContextMenu } from "@/components/collabboard/menus/ColumnPostContextMenu";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import CardShell from "@/components/collabboard/shells/CardShell";

const isContainerPadlet = (p: Padlet) =>
  p.type === "container" ||
  (p.metadata as any)?.kind === "container" ||
  (p.metadata as any)?.isContainer;

type ColumnsLayoutProps = {
  section?: BoardSection;
  posts: Padlet[];
  isEditable?: boolean;

  laneDroppableId: string;
  widthClass?: string;

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
  onAddEmptyContainerAt?: (position: number) => void;
  onDropContainerToSection?: (
    containerId: string,
    toSectionId: string,
    targetIndex: number,
    fromSectionId?: string
  ) => Promise<void> | void;

  allPadlets: Padlet[];

  activeDragId: string | null;
  dropIndicator?: DropIndicatorState;

  onDropDraftIntoContainer?: (
    containerId: string,
    draftPayload: any
  ) => void | Promise<void>;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[]) => void;
};

function DraggablePostItem({
  post,
  children,
  isActive,
  isEditable = false,
}: {
  post: Padlet;
  children: React.ReactNode;
  isActive: boolean;
  isEditable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    data: { type: "post", post },
    disabled: !isEditable,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative group/item transition-opacity",
        isDragging && "opacity-0",
        isActive && "ring-2 ring-purple-400"
      )}
      {...attributes}
      {...listeners}
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement | null;

        if ((e as any).button === 2) {
          e.stopPropagation();
          return;
        }

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
  isEditable = false,
  laneDroppableId,
  widthClass,
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
  onAddEmptyContainerAt,
  allPadlets,
  activeDragId,
  dropIndicator,
  onDropDraftIntoContainer,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
}: ColumnsLayoutProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(section?.title ?? "");
  const [expandedContainers, setExpandedContainers] = useState<Record<string, boolean>>({});
  const [expandableContainers, setExpandableContainers] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (section) setEditingTitle(section.title);
  }, [section?.id]);

  if (!section) {
    return (
      <div className="flex flex-col w-[280px] h-full min-h-0 flex-shrink-0 opacity-0 pointer-events-none" />
    );
  }

  const { setNodeRef: setLaneRef } = useDroppable({
    id: laneDroppableId,
    data: { type: "lane", sectionId: section.id },
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
      (((a.metadata as any)?.sectionPosition as number) || 0) -
      (((b.metadata as any)?.sectionPosition as number) || 0)
  );

  return (
    <div
      ref={setLaneRef}
      className={`flex flex-col h-full min-h-0 flex-shrink-0 group/section px-2 ${
        widthClass || "w-[280px]"
      }`}
    >
      <div className="shrink-0 flex items-center justify-between mb-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-white shadow-lg">
        <div className="flex-1 min-w-0 pr-2">
          {isEditing && isEditable ? (
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
              {isEditable && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                  data-no-drag="true"
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-80 hover:opacity-100 transition-opacity"
              data-no-drag="true"
            >
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

      {isEditable && (
        <div className="shrink-0 mb-3">
          <button
            onClick={() =>
              onAddEmptyContainerAt
                ? onAddEmptyContainerAt(sortedPosts.length)
                : onAddContainerAt?.(sortedPosts.length)
            }
            className="w-full h-10 bg-black/10 hover:bg-black/20 rounded-lg flex items-center justify-center border border-black/10 transition-all text-black/60 hover:text-black/80"
            data-no-drag="true"
            title="Add Container"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto pb-0 space-y-4 hide-scrollbar"
        data-column-scroll="true"
      >
        {sortedPosts.map((post) => {
          const isContainer = isContainerPadlet(post);
          const openTargets = isContainer
            ? allPadlets.filter((p) => p.metadata?.parentId === post.id)
            : undefined;

          const card = isContainer ? (
            <div
              data-post-id={post.id}
              data-container-id={post.id}
              onDragOver={(e) => {
                if (!isEditable) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                if (!isEditable) return;
                e.preventDefault();
                e.stopPropagation();
                const payload = e.dataTransfer.getData("application/json");

                if (payload) {
                  try {
                    const data = JSON.parse(payload);
                    onDropDraftIntoContainer?.(post.id, data);
                  } catch {}
                }
              }}
            >
              <ColumnPostContextMenu
                padlet={post}
                onSelect={() => {}}
                restrictToMenuTrigger
                openTargets={isEditable ? openTargets : undefined}
                onOpenTarget={isEditable ? onEditPost : undefined}
                getOpenTargetLabel={(target) => target.type || "post"}
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
                onCopyToAnotherPadlet={
                  onCopyToAnotherPadlet
                    ? () => onCopyToAnotherPadlet(post)
                    : undefined
                }
                onTransferToAnotherPadlet={
                  onTransferToAnotherPadlet
                    ? () => onTransferToAnotherPadlet(post)
                    : undefined
                }
                onSetAsPadletCover={
                  onSetAsCover ? () => onSetAsCover(post) : undefined
                }
                onPin={onPin ? () => onPin(post) : undefined}
                onReport={onReport ? () => onReport(post) : undefined}
                onDelete={onDeletePost ? () => onDeletePost(post) : undefined}
                onAddContainerAt={
                  onAddContainerAt ? (pos: number) => onAddContainerAt(pos) : undefined
                }
              >
                <CardShell
                  padletId={post.id}
                  isContainer
                  title={post.title || undefined}
                  cardColor={(post.metadata as any)?.cardColor || '#ffffff'}
                  topStripColor={(post.metadata as any)?.topStrip && (post.metadata as any).topStrip !== 'transparent' ? (post.metadata as any).topStrip : null}
                  onEdit={isEditable ? () => onEditPost(post) : undefined}
                  onExpandToggle={expandableContainers[post.id] ? () => setExpandedContainers(prev => ({ ...prev, [post.id]: !prev[post.id] })) : undefined}
                  isExpanded={expandedContainers[post.id] ?? false}
                >
                  <RowColumnContainerCard
                    padlet={post}
                    allPadlets={allPadlets}
                    onDropDraftIntoContainer={
                      isEditable ? onDropDraftIntoContainer : undefined
                    }
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    currentUserAvatar={currentUserAvatar}
                    onUpdateChildComments={onUpdateChildComments}
                    isExpanded={expandedContainers[post.id] ?? false}
                    onExpandAvailabilityChange={(available) => setExpandableContainers(prev => prev[post.id] === available ? prev : { ...prev, [post.id]: available })}
                    isContentOnly
                  />
                </CardShell>
              </ColumnPostContextMenu>
            </div>
          ) : (
            <div data-post-id={post.id}>
              <ColumnPostContextMenu
                padlet={post}
                onSelect={() => {}}
                restrictToMenuTrigger
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
                onCopyToAnotherPadlet={
                  onCopyToAnotherPadlet
                    ? () => onCopyToAnotherPadlet(post)
                    : undefined
                }
                onTransferToAnotherPadlet={
                  onTransferToAnotherPadlet
                    ? () => onTransferToAnotherPadlet(post)
                    : undefined
                }
                onSetAsPadletCover={
                  onSetAsCover ? () => onSetAsCover(post) : undefined
                }
                onPin={onPin ? () => onPin(post) : undefined}
                onReport={onReport ? () => onReport(post) : undefined}
                onDelete={onDeletePost ? () => onDeletePost(post) : undefined}
                onAddContainerAt={
                  onAddContainerAt ? (pos: number) => onAddContainerAt(pos) : undefined
                }
              >
                <CardShell
                  padletId={post.id}
                  isContainer={false}
                  cardColor={(post.metadata as any)?.cardColor || '#ffffff'}
                  topStripColor={(post.metadata as any)?.topStrip && (post.metadata as any).topStrip !== 'transparent' ? (post.metadata as any).topStrip : null}
                  onEdit={isEditable ? () => onEditPost(post) : undefined}
                >
                  <PostCardContent padlet={post} allPadlets={allPadlets} />
                </CardShell>
              </ColumnPostContextMenu>
            </div>
          );

          return (
            <DraggablePostItem
              key={post.id}
              post={post}
              isActive={activeDragId === post.id}
              isEditable={isEditable}
            >
              {card}
            </DraggablePostItem>
          );
        })}
      </div>
    </div>
  );
}
