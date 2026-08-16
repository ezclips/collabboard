"use client";

import React, { useMemo } from "react";
import { Pencil } from "lucide-react";
import {
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuSeparator,
  PositionedContextMenuSub,
  PositionedContextMenuSubContent,
  PositionedContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { Padlet } from "@/types/collabboard";

const getMetadataObject = (padlet: Padlet): Record<string, unknown> => {
  if (padlet.metadata && typeof padlet.metadata === "object") {
    return padlet.metadata as Record<string, unknown>;
  }
  return {};
};

type CanvasContextMenuProps = {
  x: number;
  y: number;
  padlet: Padlet;
  openTargets?: Padlet[];
  onOpenTarget?: (p: Padlet) => void;
  getOpenTargetLabel?: (p: Padlet) => string;
  hasPaste: boolean;
  onEdit: (p: Padlet) => void;
  onEditPadletAsPost?: (p: Padlet) => void;
  onCut: (p: Padlet) => void;
  onCopy: (p: Padlet) => void;
  onPaste: (x: number, y: number) => void;
  onDuplicate: (p: Padlet) => void;
  onDelete?: (p: Padlet) => void;
  onSendToBack: (p: Padlet) => void;
  onSendBackward: (p: Padlet) => void;
  onBringForward: (p: Padlet) => void;
  onBringToFront: (p: Padlet) => void;
  onCopyAsPNG: (p: Padlet) => void;
  onExportAsPNG: (p: Padlet) => void;
  onClose: () => void;
};

export function CanvasContextMenu({
  x,
  y,
  padlet,
  openTargets,
  onOpenTarget,
  getOpenTargetLabel,
  hasPaste,
  onEdit,
  onEditPadletAsPost,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onSendToBack,
  onSendBackward,
  onBringForward,
  onBringToFront,
  onCopyAsPNG,
  onExportAsPNG,
  onClose,
}: CanvasContextMenuProps) {
  const isComment = padlet.type === "comment";
  const metadata = getMetadataObject(padlet);
  const isContainerType = padlet.type === "container" || metadata.isContainer === true;
  // PATCH SECTION-H3C: Section Heading gets the SAME minimal action set as
  // Freeform's own SectionHeadingContextMenu (Copy/Paste/Delete/separator/
  // Bring to Front/Send to Back) -- no Edit row (it has no modal editor, only
  // its own inline double-click edit), no Cut/Duplicate/PNG export/forward-
  // backward granularity. Every other post type's menu is untouched below.
  // A plain type comparison (matching this file's existing isComment/
  // isContainerType style) rather than importing the canonical
  // isSectionHeading predicate -- this file deliberately imports nothing
  // from the collabboard component tree (see
  // excalidrawCollabBoardContextMenu.test.tsx's one-way dependency guard).
  const isSectionHeadingType = padlet.type === "section_heading";
  const orderedOpenTargets = useMemo(() => openTargets ?? [], [openTargets]);
  const hasOpenTargets = Boolean(isContainerType && orderedOpenTargets.length > 0 && onOpenTarget);
  const singleOpenTarget = hasOpenTargets && orderedOpenTargets.length === 1 ? orderedOpenTargets[0] : null;
  const resolveOpenTargetLabel = (target: Padlet, idx: number) => {
    const custom = getOpenTargetLabel?.(target)?.trim();
    if (custom) return custom;
    const title = String(target.title ?? "").trim();
    if (title) return title;
    const targetMetadata = getMetadataObject(target);
    const kind = typeof targetMetadata.kind === "string" ? targetMetadata.kind : undefined;
    const type = String(target.type ?? kind ?? "post");
    return `${type.replace(/_/g, " ")} ${idx + 1}`;
  };

  /** Multiple edit targets are the only case that discloses a submenu. */
  const hasEditSubmenu = hasOpenTargets && !singleOpenTarget;

  const editLabel = isComment
    ? "View comment"
    : singleOpenTarget
      ? `Edit ${resolveOpenTargetLabel(singleOpenTarget, 0)}`
      : hasOpenTargets
        ? "Edit post"
        : isContainerType && onEditPadletAsPost
          ? "Edit Post"
          : "Edit";

  /**
   * The direct-edit path, used for every case except the multi-target submenu.
   * A comment has no dedicated callback -- "View comment" routes to `onEdit`,
   * exactly as the pre-migration menu did.
   */
  const runEdit = () => {
    if (singleOpenTarget) {
      onOpenTarget?.(singleOpenTarget);
      return;
    }
    if (isContainerType && onEditPadletAsPost) {
      onEditPadletAsPost(padlet);
      return;
    }
    onEdit(padlet);
  };

  return (
    <PositionedContextMenu
      open
      x={x}
      y={y}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      // Drawing floats this menu above the Excalidraw overlay, so it keeps its
      // high stacking order and its fixed column width.
      className="z-[9999] w-[272px] select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {isSectionHeadingType ? (
        <>
          <PositionedContextMenuItem onSelect={() => onCopy(padlet)}>Copy</PositionedContextMenuItem>
          <PositionedContextMenuItem disabled={!hasPaste} onSelect={() => onPaste(x, y)}>
            Paste
          </PositionedContextMenuItem>
          {onDelete && (
            <PositionedContextMenuItem variant="destructive" onSelect={() => onDelete(padlet)}>
              Delete
            </PositionedContextMenuItem>
          )}

          <PositionedContextMenuSeparator />
          <PositionedContextMenuItem onSelect={() => onBringToFront(padlet)}>
            Bring to Front
          </PositionedContextMenuItem>
          <PositionedContextMenuItem onSelect={() => onSendToBack(padlet)}>
            Send to Back
          </PositionedContextMenuItem>
        </>
      ) : (
        <>
          {hasEditSubmenu ? (
            <PositionedContextMenuSub>
              <PositionedContextMenuSubTrigger>{editLabel}</PositionedContextMenuSubTrigger>
              <PositionedContextMenuSubContent className="w-[220px]">
                {orderedOpenTargets.map((target, idx) => (
                  <PositionedContextMenuItem
                    key={target.id}
                    icon={<Pencil size={13} />}
                    onSelect={() => onOpenTarget?.(target)}
                  >
                    <span className="truncate">{resolveOpenTargetLabel(target, idx)}</span>
                  </PositionedContextMenuItem>
                ))}
              </PositionedContextMenuSubContent>
            </PositionedContextMenuSub>
          ) : (
            <PositionedContextMenuItem onSelect={runEdit}>{editLabel}</PositionedContextMenuItem>
          )}

          <PositionedContextMenuSeparator />
          <PositionedContextMenuItem onSelect={() => onCut(padlet)}>Cut</PositionedContextMenuItem>
          <PositionedContextMenuItem onSelect={() => onCopy(padlet)}>Copy</PositionedContextMenuItem>
          <PositionedContextMenuItem disabled={!hasPaste} onSelect={() => onPaste(x, y)}>
            Paste
          </PositionedContextMenuItem>

          {!isComment && (
            <>
              <PositionedContextMenuSeparator />
              <PositionedContextMenuItem onSelect={() => onSendToBack(padlet)}>
                Send to back
              </PositionedContextMenuItem>
              <PositionedContextMenuItem onSelect={() => onSendBackward(padlet)}>
                Send backward
              </PositionedContextMenuItem>
              <PositionedContextMenuItem onSelect={() => onBringForward(padlet)}>
                Bring forward
              </PositionedContextMenuItem>
              <PositionedContextMenuItem onSelect={() => onBringToFront(padlet)}>
                Bring to front
              </PositionedContextMenuItem>

              <PositionedContextMenuSeparator />
              <PositionedContextMenuItem onSelect={() => onCopyAsPNG(padlet)}>
                Copy to clipboard as PNG
              </PositionedContextMenuItem>
              <PositionedContextMenuItem onSelect={() => onExportAsPNG(padlet)}>
                Export as PNG
              </PositionedContextMenuItem>

              <PositionedContextMenuSeparator />
              <PositionedContextMenuItem onSelect={() => onDuplicate(padlet)}>
                Duplicate
              </PositionedContextMenuItem>
            </>
          )}

          {onDelete && (
            <>
              <PositionedContextMenuSeparator />
              <PositionedContextMenuItem variant="destructive" onSelect={() => onDelete(padlet)}>
                Delete
              </PositionedContextMenuItem>
            </>
          )}
        </>
      )}
    </PositionedContextMenu>
  );
}
