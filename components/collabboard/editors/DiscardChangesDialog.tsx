"use client";

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IMAGE_POST_EDITOR_CONFIRM_Z_INDEX } from './ImagePostEditorShell';

/**
 * PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1 -- where this dialog paints.
 *
 * `inline` is the original behaviour, byte-for-byte: rendered in the normal
 * tree position at `z-[1100]`. Every pre-existing caller keeps it by default.
 *
 * `above-image-editor` is for callers that sit inside CanvasViewport's
 * `isolation: isolate` boundary AND open over a portalled Image post editor.
 * There, the whole canvas subtree paints as ONE atomic layer, so no z-index
 * asked for in place can rise above the portalled overlay -- only leaving the
 * subtree can. Browser-confirmed: at `z-[1100]` in place, the confirmation was
 * invisible behind the `z-[60000]` draft and `elementFromPoint` over "Keep
 * editing" returned the draft's own footer, so neither action could be
 * reached by mouse, and Tab walked straight past it into the page behind.
 */
export type DiscardChangesDialogLayer = 'inline' | 'above-image-editor';

interface DiscardChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
  /**
   * PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1. All three default to the exact
   * original PATCH-149B2-i copy, so the one pre-existing caller (the
   * document-switch confirmation in CanvasClient) renders byte-for-byte what
   * it always has. The PDF-area Image draft is the first caller to override
   * them, with its own "Discard this image?" copy -- this dialog's two-action
   * shape and behaviour stay identical either way.
   */
  title?: string;
  message?: string;
  discardLabel?: string;
  /** Defaults to the original in-place rendering. */
  layer?: DiscardChangesDialogLayer;
}

/** Everything inside the dialog that Tab can legitimately land on. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// PATCH-149B2-i §32.8: exactly two actions -- a third "Save" action would
// fork save-error handling into the confirmation, so it is deliberately
// excluded. No window.confirm: the repository has no existing accessible
// dialog primitive suited to this modal (kanban's ConfirmModal belongs to
// the separate kanban system; CanvasClient's inline delete-confirm has no
// role or accessible name).
export default function DiscardChangesDialog({
  onKeepEditing,
  onDiscard,
  title = 'Discard changes?',
  message = 'You have unsaved changes. If you discard now, they will be lost.',
  discardLabel = 'Discard changes',
  layer = 'inline',
}: DiscardChangesDialogProps) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const raised = layer === 'above-image-editor';

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  /**
   * Raised callers own the keyboard while they are open: Escape IS "Keep
   * editing", and it must not reach the draft's own window-level Escape
   * listener behind us (which would otherwise re-enter its close path).
   * Tab and Shift+Tab cycle within the two actions instead of walking out
   * into the page underneath. Bound to the dialog node, so it only ever sees
   * keys pressed while focus is genuinely inside.
   */
  useEffect(() => {
    if (!raised) return;
    const node = surfaceRef.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onKeepEditing();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && node.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [raised, onKeepEditing]);

  const surface = (
    <div
      ref={surfaceRef}
      data-ui={raised ? 'discard-changes-dialog-raised' : 'discard-changes-dialog'}
      className={
        raised
          ? 'fixed inset-0 flex items-center justify-center bg-black/40'
          : 'fixed inset-0 z-[1100] flex items-center justify-center bg-black/40'
      }
      style={raised ? { zIndex: IMAGE_POST_EDITOR_CONFIRM_Z_INDEX } : undefined}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-changes-title"
        aria-describedby="discard-changes-message"
        className="bg-white rounded-xl shadow-2xl w-[360px] p-5"
      >
        <h2 id="discard-changes-title" className="text-base font-semibold text-gray-900 mb-2">
          {title}
        </h2>
        <p id="discard-changes-message" className="text-sm text-gray-600 mb-5">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={keepRef}
            type="button"
            onClick={onKeepEditing}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
          >
            {discardLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (!raised) return surface;
  if (typeof document === 'undefined') return null;
  return createPortal(surface, document.body);
}
