'use client';

import React, { useEffect, useRef, useState } from 'react';
import ImagePostEditorShell from './ImagePostEditorShell';
import ImagePostEditorCard from './ImagePostEditorCard';
import ImageActionsToolbar from './ImageActionsToolbar';
import DiscardChangesDialog from './DiscardChangesDialog';

/**
 * R6I-C2 -- the REAL Image post editor, in creation mode.
 *
 * Composes the same parts the persisted editor does -- the same shell, the
 * same ImageActionsToolbar, the same ImagePostEditorCard -- rather than
 * approximating them. See ImagePostEditorCard's own doc for why one card
 * serves both callers.
 *
 * What draft mode changes, and why:
 *
 *  - the right track is empty. Text style, emoji and comment panels all write
 *    to a row that does not exist.
 *  - Edit image, Draw, Reaction and Comment are DISABLED, not wired to no-ops.
 *    Each needs a persisted padlet (Draw and Edit image edit a stored
 *    imageUrl; Reaction and Comment write metadata). A control that looks live
 *    and silently does nothing is worse than one that says "not yet".
 *  - Colour and Caption are disabled for the same reason: both persist through
 *    the padlet update path.
 *
 * PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1 -- EXIT MODEL, REVISED.
 *
 * R6I-C3 gave this draft NO save/cancel footer at all: finishing happened
 * only through the toolbar's own small arrow (relabelled "Done"), and every
 * other way out -- backdrop, Escape, that same arrow when unavailable --
 * discarded silently. In practice the arrow read as decoration: users could
 * not tell it was the one thing that published a shared-board card, and a
 * stray backdrop click threw the capture away with no warning at all.
 *
 * This keeps R6I's ORIGINAL, more important property -- nothing is created
 * until a deliberate action -- while fixing which action is deliberate and
 * which is safe:
 *
 *  - "Add image to canvas" is now the ONE prominent, labelled way to publish.
 *    The toolbar arrow no longer saves anything; it is just another way to
 *    ASK to close, exactly like Escape and the new Cancel button.
 *  - A backdrop click does nothing at all -- it is not "safe discard", it is
 *    NOT a dismissal. The draft stays open and untouched.
 *  - Escape, Cancel and the toolbar arrow all ask before throwing the capture
 *    away, through the same two-action DiscardChangesDialog the rest of the
 *    app already uses for this. Only its own "Discard" writes nothing and
 *    closes.
 */

/** Everything that needs a row before it can do anything. */
const DRAFT_DISABLED_TOOLS = ['caption', 'edit', 'draw', 'reaction', 'comment', 'color'] as const;

export interface PdfAreaImageDraftModalProps {
  readonly isOpen: boolean;
  /** The local preview cut from the already-authorised page image. */
  readonly previewSrc: string | null;
  readonly title: string;
  readonly onTitleChange: (next: string) => void;
  /** The ONLY action that publishes. */
  readonly onSave: () => void;
  /** Confirmed discard. Writes nothing. */
  readonly onCancel: () => void;
  readonly isSaving?: boolean;
  /**
   * The most recent failed/denied attempt's message, or null. Owned by the
   * caller (CanvasClient), which is also the one place that knows WHY a save
   * failed -- this modal only displays it and never invents its own copy.
   */
  readonly error?: string | null;
}

export default function PdfAreaImageDraftModal({
  isOpen,
  previewSrc,
  title,
  onTitleChange,
  onSave,
  onCancel,
  isSaving = false,
  error = null,
}: PdfAreaImageDraftModalProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  /**
   * PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1: whichever control asked to
   * close -- Cancel, the toolbar arrow, or whatever held focus when Escape was
   * pressed -- so "Keep editing" can hand focus straight back to it instead of
   * stranding the user. Falls back to the primary action when the invoker is
   * gone or was never a real control (an Escape from the page body).
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /**
   * Synchronous, unlike `isSaving`: that prop only updates after the parent's
   * state commits and this component re-renders, which is a real window for
   * two clicks dispatched before the browser paints between them to both pass
   * the `disabled` check. This ref is set inside the SAME click handler that
   * reads it, so a second click in that window is refused immediately -- the
   * `isSaving`-driven `disabled` attribute is the visible half of the same
   * guard, not a second, independent one.
   */
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!isSaving) submitLockRef.current = false;
  }, [isSaving]);

  // A fresh draft must never inherit a stale confirmation a PREVIOUS draft's
  // Escape/Cancel left open.
  useEffect(() => {
    if (isOpen) setConfirmingDiscard(false);
  }, [isOpen]);

  /** Escape, Cancel and the toolbar arrow all funnel through here. */
  const requestClose = () => {
    if (isSaving || confirmingDiscard) return;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setConfirmingDiscard(true);
  };

  const keepEditing = () => {
    setConfirmingDiscard(false);
    // The draft is exactly as it was; hand focus back to the control that
    // asked to close, rather than leaving it stranded on a dialog that just
    // unmounted. The primary action is the fallback.
    const invoker = returnFocusRef.current;
    returnFocusRef.current = null;
    if (invoker && invoker.isConnected) invoker.focus();
    else saveButtonRef.current?.focus();
  };

  const discard = () => {
    setConfirmingDiscard(false);
    onCancel();
  };

  const submit = () => {
    if (isSaving || submitLockRef.current) return;
    submitLockRef.current = true;
    onSave();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isSaving, confirmingDiscard]);

  if (!isOpen) return null;

  const unavailable = () => {};

  return (
    <>
      <ImagePostEditorShell
        dataUi="pdf-area-image-draft-overlay"
        // PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1: deliberately no backdropProps
        // at all. A backdrop click is not wired to anything here, so it is not
        // a dismissal of any kind -- safe or otherwise -- the draft simply
        // stays exactly as it was.
        toolbar={
          <ImageActionsToolbar
            mode="image"
            disabledToolIds={DRAFT_DISABLED_TOOLS}
            // The arrow no longer publishes -- it is one more way to ASK to
            // close, same as Escape and the Cancel button below.
            onBack={requestClose}
            backLabel="Cancel"
            backTitle="Discard this image"
            backDisabled={isSaving}
            // Every handler below belongs to a disabled control, so none of them
            // can be reached. They are present because the props are required.
            onColorClick={unavailable}
            onCardColor={unavailable}
            onCaption={unavailable}
            onTextStyle={unavailable}
            onSelectColor={unavailable}
            onSelectHighlight={unavailable}
            onEditImage={unavailable}
            onDrawOnTop={unavailable}
            onAddReaction={unavailable}
            onComment={unavailable}
          />
        }
      >
        <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <ImagePostEditorCard
            imageSrc={previewSrc ?? undefined}
            imageAlt="Selected PDF area"
            title={title}
            onTitleChange={onTitleChange}
            titlePlaceholder="Title"
          >
            {/* Below the image, never over it -- ImagePostEditorCard's
                `children` slot is a row that follows the image in normal
                document flow, the same slot the persisted overlay uses for
                its own reactions/caption rows. */}
            <div data-ui="pdf-area-image-draft-actions" className="flex flex-col gap-2 border-t border-gray-100 p-3">
              {error ? (
                <p data-ui="pdf-area-image-draft-error" role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              ) : null}
              <button
                ref={saveButtonRef}
                type="button"
                data-ui="pdf-area-image-draft-save"
                onClick={submit}
                disabled={isSaving}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSaving ? 'Adding…' : 'Add image to canvas'}
              </button>
              <button
                type="button"
                data-ui="pdf-area-image-draft-cancel"
                onClick={requestClose}
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <p className="text-center text-[11px] text-gray-400">
                Adds this image to the canvas and PDF Library.
              </p>
            </div>
          </ImagePostEditorCard>
        </div>
      </ImagePostEditorShell>
      {confirmingDiscard ? (
        <DiscardChangesDialog
          // This draft opens over a PORTALLED editor from inside the canvas's
          // isolated subtree, so the confirmation has to leave that subtree
          // too or it paints underneath -- see the layer prop's own doc.
          layer="above-image-editor"
          title="Discard this image?"
          message="This PDF-area image has not been added to the canvas yet. If you discard now, it will be lost."
          discardLabel="Discard"
          onKeepEditing={keepEditing}
          onDiscard={discard}
        />
      ) : null}
    </>
  );
}
