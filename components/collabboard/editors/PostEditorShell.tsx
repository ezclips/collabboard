"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import NoteEditorToolbar, { type ToolbarMode } from './NoteEditorToolbar';

export type { ToolbarMode };

// ---------------------------------------------------------------------------
// Selection reactivity (PATCH-152 §21.2 / §22.5 / §24.11): NoteEditorToolbar
// reads hasSelection at render time, and TipTap's shouldRerenderOnTransaction
// is false, so nothing rerenders the toolbar on a selection change unless
// something calls a React state setter. This hook IS that mechanism: it
// subscribes to `selectionUpdate` and calls setLastSelection on every
// non-empty selection, which is the render trigger that keeps Link/Comment
// enablement live. This is named and owned here so it is never incidental
// coupling again — see PATCH-152.md §21.2/§22.5.
//
// §24.11: a non-empty->empty transition must ALSO rerender, so hasSelection
// reflects a cleared selection (governed for both Note and Document; no
// existing test previously exercised pure collapse-without-an-intervening-
// click, but documentToolbarParity.behavior.test.tsx does). lastSelection
// itself stays sticky at the last non-empty value -- only a lightweight tick
// forces the render on the empty branch.
// ---------------------------------------------------------------------------
export function useShellSelection(editor: Editor | null) {
  const [lastSelection, setLastSelection] = useState<{ from: number; to: number } | null>(null);
  const [, forceEmptyTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handleSelectionUpdate = () => {
      const { from, to, empty } = editor.state.selection;
      if (!empty) setLastSelection({ from, to });
      else forceEmptyTick((c) => c + 1);
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
// Panel coordination (PATCH-152 §22.3/§22.4, revised): active-panel identity
// across the six current Note/Document panel types. Only one of these panels
// may ever be open at a time -- opening any panel closes every other one.
// This used to be opt-in per call site (a caller had to remember to pass a
// `closing` list), which regressed silently whenever a new call site forgot
// to declare it (e.g. NoteEditor's toolbar onTextStyle/onCardColor/
// onAddReaction never did). Making exclusivity the hook's own behaviour
// removes that whole class of bug -- there is no longer a way to open a
// panel without closing the rest.
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

  const openPanel = (id: ShellPanelId) => {
    setOpen(() => Object.fromEntries(ALL_PANELS.map((p) => [p, p === id])) as Record<ShellPanelId, boolean>);
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
  // PATCH-152 §24.12: unlike toolbarHidden (opacity, still mounted), this
  // structurally omits the toolbar zone from the DOM -- required for Document
  // read-only, where mutation controls must be absent, not merely styled out.
  showToolbar?: boolean;
  hasSelection: boolean;
  centre: React.ReactNode;
  sharedPanel: React.ReactNode;
  // PATCH-152 §24.11/24.12: opt-in, render-only indication of the shell's
  // last stored selection while a consumer panel holds focus. Off by default
  // so Note's output stays byte-identical. See useSelectionOverlayRect below.
  selectionIndicator?: boolean;
  selectionEditor?: Editor | null;
  selectionRange?: { from: number; to: number } | null;
  // Optional ARIA passthrough for consumers with dialog semantics (Document);
  // Note passes none of these, so its overlay markup is unaffected.
  role?: string;
  ariaModal?: boolean;
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// Selection visibility (PATCH-152 §24.11/§24.12): a render-only rect overlay
// derived from editor.view.coordsAtPos, so a Document panel can keep the
// original selection visibly identifiable while it holds DOM focus. Never
// touches the document, never becomes a mark, never serializes -- purely a
// positioned, pointer-events-none div computed from the stored range. Clears
// whenever the range is absent or falls outside the current document size.
// ---------------------------------------------------------------------------
function useSelectionOverlayRect(
  editor: Editor | null | undefined,
  range: { from: number; to: number } | null | undefined,
  enabled: boolean,
  rowRef: React.RefObject<HTMLDivElement | null>,
) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!enabled || !editor || !range) {
      setRect(null);
      return;
    }

    const recompute = () => {
      const docSize = editor.state.doc.content.size;
      if (range.from < 0 || range.to > docSize || range.from > range.to) {
        setRect(null);
        return;
      }
      try {
        const start = editor.view.coordsAtPos(range.from);
        const end = editor.view.coordsAtPos(range.to);
        setRect({
          top: Math.min(start.top, end.top),
          left: Math.min(start.left, end.left),
          width: Math.max(4, end.right - start.left),
          height: Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top),
        });
      } catch {
        setRect(null);
      }
    };

    recompute();
    // A block-type change (e.g. toggling a code block from the Text style
    // panel) reflows the document without changing range.from/range.to --
    // the dependency array below never re-fires, so the overlay stayed
    // stuck at its pre-toggle pixel position ("below the text" after the
    // reflow). Recompute on every doc update too, not just when the
    // stored range's own endpoints change.
    editor.on('update', recompute);

    // Switching between side panels (e.g. Comment -> Link) changes the
    // shared-panel slot's width/height, which re-centers the whole
    // toolbar/card/panel row -- moving the card (and the real selection
    // inside it) without firing an editor 'update'. Watch the row itself so
    // the overlay follows the card instead of staying frozen at its
    // pre-switch position.
    const row = rowRef.current;
    const resizeObserver = row && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    resizeObserver?.observe(row!);

    return () => {
      editor.off('update', recompute);
      resizeObserver?.disconnect();
    };
  }, [editor, range?.from, range?.to, enabled, rowRef]);

  return rect;
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
  showToolbar = true,
  hasSelection,
  centre,
  sharedPanel,
  selectionIndicator = false,
  selectionEditor = null,
  selectionRange = null,
  role,
  ariaModal,
  ariaLabel,
}: PostEditorShellProps) {
  const [mode, setMode] = useState<ToolbarMode>('text');
  const rowRef = useRef<HTMLDivElement>(null);
  const overlayRect = useSelectionOverlayRect(selectionEditor, selectionRange, selectionIndicator, rowRef);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onBackdropClick();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role={role}
      aria-modal={ariaModal}
      aria-label={ariaLabel}
    >
      {/* Three-column grid, not a centered flex row: the two flanking columns
          are both `1fr`, so they are always equal width to each other no
          matter what (or whether anything) renders in them -- the centre
          column's on-screen position is therefore fixed at the true middle
          of the screen regardless of which side panel is open. A centered
          flex row instead re-centers the WHOLE group on the group's total
          width, so a side panel appearing/disappearing/changing width
          visibly drags the centre (and the toolbar) sideways with it. The
          grid tracks themselves are pointer-events: none (they're pure
          layout, often wider than their visible content) with pointer
          events re-enabled only on the actual toolbar/centre/panel boxes,
          so empty grid space still counts as a genuine backdrop click. */}
      <div
        ref={rowRef}
        className="grid items-start gap-3"
        style={{ gridTemplateColumns: '1fr auto 1fr', width: '100%', pointerEvents: 'none' }}
      >
        <div className="flex items-start justify-end" style={{ pointerEvents: 'none' }}>
          {showToolbar && (
            <div
              className="relative flex items-start gap-3"
              style={{ pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-w-[72px]">
                <div className={toolbarHidden ? 'opacity-0 pointer-events-none' : ''}>
                  <NoteEditorToolbar {...toolbar} mode={mode} onModeChange={setMode} hasSelection={hasSelection} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
          {centre}
        </div>

        <div className="flex items-start justify-start" style={{ pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {sharedPanel}
          </div>
        </div>
      </div>

      {selectionIndicator && overlayRect && (
        <div
          data-testid="shell-selection-overlay"
          className="fixed pointer-events-none z-[900] rounded-sm bg-blue-400/25 ring-2 ring-blue-400/60"
          style={{ top: overlayRect.top, left: overlayRect.left, width: overlayRect.width, height: overlayRect.height }}
        />
      )}
    </div>
  );
}
