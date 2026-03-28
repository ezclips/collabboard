"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';

type FreeformCanvasBoardMenuProps = {
  x: number;
  y: number;
  isEditable: boolean;
  showGraphLine: boolean;
  canPaste: boolean;
  canUndoPaste: boolean;
  showDotGrid: boolean;
  onClose: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onSelectAll: () => void;
  onToolAction: (toolType: string) => void;
  onOpenBackgroundEditor: () => void;
  onToggleDotGrid: () => void;
};

type MenuPosition = { left: number; top: number };

const UI_FONT =
  '"Assistant", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const FREEFORM_BOARD_TOOL_ITEMS = [
  { label: 'New Note', type: 'note' },
  { label: 'New Link', type: 'link' },
  { label: 'New To-do', type: 'todo' },
  { label: 'New Line', type: 'line' },
  { label: 'New Graph Line', type: 'graph-line' },
  { label: 'New Column', type: 'container' },
  { label: 'New Table', type: 'table' },
  { label: 'New Comment', type: 'comment' },
  { label: 'New Image', type: 'image' },
  { label: 'New Upload', type: 'upload' },
  { label: 'New Import', type: 'import' },
  { label: 'New Draw', type: 'draw' },
  { label: 'New Library', type: 'library' },
  { label: 'New AI Drawing', type: 'ai-component' },
];

function MenuRow({
  label,
  disabled,
  checked,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  checked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-1.5 text-left text-[13px] text-slate-600 transition hover:bg-slate-100 disabled:cursor-default disabled:text-slate-300"
      style={{ fontFamily: UI_FONT }}
    >
      <span>{label}</span>
      <span className="ml-6 flex items-center gap-2 shrink-0 text-[12px] text-slate-500">
        {checked && <Check className="h-4 w-4 text-slate-700" />}
      </span>
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-gray-200" />;
}

export default function FreeformCanvasBoardMenu({
  x,
  y,
  isEditable,
  showGraphLine,
  canPaste,
  canUndoPaste,
  showDotGrid,
  onClose,
  onPaste,
  onUndo,
  onSelectAll,
  onToolAction,
  onOpenBackgroundEditor,
  onToggleDotGrid,
}: FreeformCanvasBoardMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ left: x, top: y });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const menuWidth = menuRef.current?.offsetWidth || 274;
    const menuHeight = menuRef.current?.offsetHeight || 420;
    setMenuPosition({
      left: Math.min(x, window.innerWidth - menuWidth - 8),
      top: Math.min(y, window.innerHeight - menuHeight - 8),
    });
  }, [x, y]);

  const visibleToolItems = useMemo(
    () => FREEFORM_BOARD_TOOL_ITEMS.filter((item) => item.type !== 'graph-line' || showGraphLine),
    [showGraphLine]
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[272px] rounded-md border border-gray-200 bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
      style={{ left: menuPosition.left, top: menuPosition.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuRow label="Paste" disabled={!isEditable || !canPaste} onClick={onPaste} />
      <MenuRow label="Undo" disabled={!isEditable || !canUndoPaste} onClick={onUndo} />
      <MenuRow label="Select All" onClick={onSelectAll} />
      <Divider />

      {visibleToolItems.map((item) => (
        <MenuRow
          key={item.type}
          label={item.label}
          disabled={!isEditable}
          onClick={() => onToolAction(item.type)}
        />
      ))}

      <Divider />
      <MenuRow
        label="Change Board Background..."
        disabled={!isEditable}
        onClick={() => {
          onOpenBackgroundEditor();
          onClose();
        }}
      />
      <MenuRow
        label="Show Dot Grid"
        checked={showDotGrid}
        onClick={onToggleDotGrid}
      />
    </div>
  );
}
