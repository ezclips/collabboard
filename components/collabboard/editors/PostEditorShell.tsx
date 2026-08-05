"use client";

import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import NoteEditorToolbar, { type ToolbarMode } from './NoteEditorToolbar';

export type { ToolbarMode };

// ---------------------------------------------------------------------------
// Selection reactivity (PATCH-152 §21.2 / §22.5): NoteEditorToolbar reads
// hasSelection at render time, and TipTap's shouldRerenderOnTransaction is
// false, so nothing rerenders the toolbar on a selection change unless
// something calls a React state setter. This hook IS that mechanism: it
// subscribes to `selectionUpdate` and calls setLastSelection on every
// non-empty selection, which is the render trigger that keeps Link/Comment
// enablement live. This is named and owned here so it is never incidental
// coupling again — see PATCH-152.md §21.2/§22.5.
// ---------------------------------------------------------------------------
export function useShellSelection(editor: Editor | null) {
  const [lastSelection, setLastSelection] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const handleSelectionUpdate = () => {
      const { from, to, empty } = editor.state.selection;
      if (!empty) setLastSelection({ from, to });
    };
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor]);

  const hasSelection = !!editor && !editor.state.selection.empty;
  return { hasSelection, lastSelection };
}

// ---------------------------------------------------------------------------
// Panel coordination (PATCH-152 §22.3/§22.4): active-panel identity across
// the six current Note panel types. Mutual exclusion here replicates ONLY
// the transitions NoteEditor already performs today (opening the
// selected-text Comment popup closes textStyle/cardColor/reaction) -- it does
// not invent new exclusivity between panels that coexist today (e.g. Link and
// TextStylePopup have never closed one another). Callers pass `closing` to
// reproduce an existing transition; omitting it opens without side effects,
// matching current behaviour.
// ---------------------------------------------------------------------------
export type ShellPanelId = 'textStyle' | 'cardColor' | 'link' | 'comment' | 'reaction' | 'detached';

const ALL_PANELS: ShellPanelId[] = ['textStyle', 'cardColor', 'link', 'comment', 'reaction', 'detached'];

export function useShellPanels() {
  const [open, setOpen] = useState<Record<ShellPanelId, boolean>>({
    textStyle: false,
    cardColor: false,
    link: false,
    comment: false,
    reaction: false,
    detached: false,
  });

  const openPanel = (id: ShellPanelId, closing: ShellPanelId[] = []) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: true };
      closing.forEach((c) => {
        next[c] = false;
      });
      return next;
    });
  };
  const closePanel = (id: ShellPanelId) => setOpen((prev) => ({ ...prev, [id]: false }));
  const closeAll = () => setOpen(Object.fromEntries(ALL_PANELS.map((id) => [id, false])) as Record<ShellPanelId, boolean>);

  return { open, openPanel, closePanel, closeAll };
}

type ToolbarPassthroughProps = Omit<
  React.ComponentProps<typeof NoteEditorToolbar>,
  'mode' | 'onModeChange' | 'hasSelection'
>;

interface PostEditorShellProps {
  isOpen: boolean;
  onBackdropClick: () => void;
  toolbar: ToolbarPassthroughProps;
  toolbarHidden?: boolean;
  hasSelection: boolean;
  centre: React.ReactNode;
  sharedPanel: React.ReactNode;
}

// ---------------------------------------------------------------------------
// PostEditorShell (PATCH-152 §22): the single authoritative post-editor
// shell -- overlay/backdrop, left toolbar, centre slot, and the shared
// right-side secondary-panel region, in that fixed structural order. Owns
// Text/Box mode (uncontrolled -- the caller never needs to read it) and the
// toolbar it renders. Knows nothing about the centre's content, persistence,
// or serialization -- the caller supplies the centre as an opaque node.
// ---------------------------------------------------------------------------
export default function PostEditorShell({
  isOpen,
  onBackdropClick,
  toolbar,
  toolbarHidden = false,
  hasSelection,
  centre,
  sharedPanel,
}: PostEditorShellProps) {
  const [mode, setMode] = useState<ToolbarMode>('text');

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onBackdropClick();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-start gap-3">
          <div className="min-w-[72px]">
            <div className={toolbarHidden ? 'opacity-0 pointer-events-none' : ''}>
              <NoteEditorToolbar {...toolbar} mode={mode} onModeChange={setMode} hasSelection={hasSelection} />
            </div>
          </div>
        </div>

        {centre}

        {sharedPanel}
      </div>
    </div>
  );
}
