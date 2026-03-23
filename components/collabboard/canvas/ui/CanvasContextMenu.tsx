"use client";

import React, { useRef, useLayoutEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import type { Padlet } from "@/types/collabboard";

const UI_FONT =
  '"Assistant", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function MenuItem({
  label,
  shortcut,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      style={{ fontFamily: UI_FONT }}
      className={`w-full flex items-center justify-between text-left text-[13px]
        py-[4px] pl-5 pr-4 transition-colors
        ${
          danger
            ? "text-[#f03e3e] hover:bg-[#fa5252] hover:text-white disabled:opacity-40"
            : "text-[#000] hover:bg-[#339af0] hover:text-white disabled:text-[#adb5bd]"
        }
        disabled:cursor-default`}
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-[0.7rem] ml-4 shrink-0 opacity-60">{shortcut}</span>
      )}
    </button>
  );
}

function Sep() {
  return <div className="my-1 border-t border-[#adb5bd]" />;
}

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [visible, setVisible] = useState(false);
  const [showEditSubmenu, setShowEditSubmenu] = useState(false);
  const orderedOpenTargets = useMemo(() => openTargets ?? [], [openTargets]);
  const hasOpenTargets = Boolean(isContainerType && orderedOpenTargets.length > 0 && onOpenTarget);
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

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const fx = Math.min(x, window.innerWidth - w - 4);
    const fy = y + h > window.innerHeight ? Math.max(4, y - h) : y;
    setPos({ x: fx, y: fy });
    setVisible(true);
  }, [x, y]);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        left: pos.x,
        top: pos.y,
        visibility: visible ? "visible" : "hidden",
        fontFamily: UI_FONT,
        background: "#f1f3f5",
        border: "1px solid #adb5bd",
        boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
        borderRadius: "4px",
      }}
      className="fixed z-[9999] py-2 w-[272px] select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <MenuItem
        label={isComment ? "View comment" : hasOpenTargets ? "Edit post" : isContainerType && onEditPadletAsPost ? "Edit Post" : "Edit"}
        onClick={() => {
          if (hasOpenTargets) {
            setShowEditSubmenu((v) => !v);
            return;
          }
          run(() => isContainerType && onEditPadletAsPost ? onEditPadletAsPost(padlet) : onEdit(padlet));
        }}
      />
      {hasOpenTargets && showEditSubmenu && (
        <div
          className="absolute left-[calc(100%-10px)] top-[10px] py-2 w-[220px] select-none"
          style={{
            fontFamily: UI_FONT,
            background: "#f1f3f5",
            border: "1px solid #adb5bd",
            boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
            borderRadius: "4px",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {orderedOpenTargets.map((target, idx) => (
            <button
              key={target.id}
              style={{ fontFamily: UI_FONT }}
              className="w-full flex items-center justify-between text-left text-[13px] py-[4px] pl-5 pr-4 transition-colors text-[#000] hover:bg-[#339af0] hover:text-white"
              onClick={() => run(() => onOpenTarget?.(target))}
            >
              <span className="truncate pr-3">{resolveOpenTargetLabel(target, idx)}</span>
              <Pencil size={13} />
            </button>
          ))}
        </div>
      )}

      <Sep />
      <MenuItem label="Cut" shortcut="Ctrl+X" onClick={() => run(() => onCut(padlet))} />
      <MenuItem label="Copy" shortcut="Ctrl+C" onClick={() => run(() => onCopy(padlet))} />
      <MenuItem label="Paste" shortcut="Ctrl+V" disabled={!hasPaste} onClick={() => run(() => onPaste(x, y))} />

      {!isComment && (
        <>
          <Sep />
          <MenuItem label="Send to back" shortcut="Ctrl+Shift+[" onClick={() => run(() => onSendToBack(padlet))} />
          <MenuItem label="Send backward" shortcut="Ctrl+[" onClick={() => run(() => onSendBackward(padlet))} />
          <MenuItem label="Bring forward" shortcut="Ctrl+]" onClick={() => run(() => onBringForward(padlet))} />
          <MenuItem label="Bring to front" shortcut="Ctrl+Shift+]" onClick={() => run(() => onBringToFront(padlet))} />

          <Sep />
          <MenuItem label="Copy to clipboard as PNG" shortcut="Shift+Alt+C" onClick={() => run(() => onCopyAsPNG(padlet))} />
          <MenuItem label="Export as PNG" onClick={() => run(() => onExportAsPNG(padlet))} />

          <Sep />
          <MenuItem label="Duplicate" shortcut="Ctrl+D" onClick={() => run(() => onDuplicate(padlet))} />
        </>
      )}

      {onDelete && (
        <>
          <Sep />
          <MenuItem label="Delete" shortcut="Del" danger onClick={() => run(() => onDelete(padlet))} />
        </>
      )}
    </div>
  );
}
