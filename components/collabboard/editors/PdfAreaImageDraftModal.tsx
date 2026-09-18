'use client';

import React, { useEffect, useRef, useState } from 'react';
import ImagePostEditorShell from './ImagePostEditorShell';
import ImagePostEditorCard from './ImagePostEditorCard';
import ImageActionsToolbar from './ImageActionsToolbar';
import DiscardChangesDialog from './DiscardChangesDialog';
import { useBackdropDismiss } from './PostEditorShell';

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
 * PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1 -- EXIT MODEL, AND NO FOOTER.
 *
 * This draft has NO Save and NO Cancel button, deliberately. Every other post
 * editor in this app is left by clicking away from it, and a footer here made
 * the one draft that captures a PDF region behave unlike all of them. The exit
 * model now matches: you click outside, and what you made is kept.
 *
 *  - CLICKING OUTSIDE SAVES. The backdrop is bound to the same `submit` the
 *    footer button used to call, through the shared `useBackdropDismiss` -- so
 *    only a press that BEGINS and ENDS on the backdrop counts, and a drag that
 *    starts in the card cannot publish by accident.
 *  - ENTER SAVES, from anywhere in the card, so the capture can be finished
 *    without reaching for the mouse.
 *  - ESCAPE and the TOOLBAR ARROW still ASK, through the same two-action
 *    DiscardChangesDialog as before. Only its own "Discard" writes nothing.
 *
 * WHY THIS CANNOT REINTRODUCE THE DEFECT THE FOOTER WAS ADDED FOR. That defect
 * was the "disappearing area image": a backdrop click DISCARDED the capture,
 * silently, and the network log showed zero creation requests. The fix was
 * never "a button must exist" -- it was "a stray click must not destroy work".
 * A backdrop that SAVES cannot lose work, so the failure mode is closed by
 * construction rather than by a control the user has to find.
 *
 * R6I's ORIGINAL PROPERTY IS PRESERVED: nothing is created until a DELIBERATE
 * action. Clicking outside is that action. It is deliberate in the same sense
 * that closing any other editor in this app is -- the user chose to leave --
 * and it is now the only interpretation a click outside has, rather than one of
 * two silent ones.
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
  /**
   * The card wrapper. Serves two things that used to need the save button:
   * Enter-to-save (keydown bubbles here from the title input, whose own handler
   * blurs but neither preventDefaults nor stops propagation), and finding the
   * title input for focus return WITHOUT giving ImagePostEditorCard a new ref
   * prop it does not otherwise need.
   */
  const wrapperRef = useRef<HTMLDivElement>(null);
  /**
   * PDF_AREA_DISCARD_DIALOG_LAYER_CORRECTION_1: whichever control asked to
   * close -- the toolbar arrow, or whatever held focus when Escape was
   * pressed -- so "Keep editing" can hand focus straight back to it instead of
   * stranding the user. Falls back to the title input when the invoker is gone
   * or was never a real control (an Escape from the page body): with the footer
   * removed, the title input is the only focusable control this draft owns.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /** The title input, found by its data-ui rather than through a new prop. */
  const titleInput = () =>
    wrapperRef.current?.querySelector<HTMLElement>('[data-ui="image-post-editor-title"]') ?? null;
  /**
   * Synchronous, unlike `isSaving`: that prop only updates after the parent's
   * state commits and this component re-renders, which is a real window for
   * two submissions dispatched before the browser paints between them to both
   * pass an `isSaving` check.
   *
   * THIS REF IS NOW THE ONLY LOCK. It used to be the invisible half of a pair,
   * alongside the save button's `isSaving`-driven `disabled` attribute -- but
   * that button is gone, and a backdrop cannot be disabled. Two fast clicks
   * outside, or Enter held down, reach `submit` with nothing else in the way,
   * so this ref is what stops the second one. It is set inside the SAME handler
   * that reads it, which is what makes it immune to the render delay above.
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
    // The title input is the fallback because it is now the ONLY focusable
    // control this draft owns -- the save button that used to serve as the
    // "primary action" fallback no longer exists.
    else titleInput()?.focus();
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

  /**
   * CLICKING OUTSIDE SAVES. The shared authority, not a bare onClick: it fires
   * only when the press BEGAN and ENDED on the backdrop itself, so a drag that
   * starts inside the card and drifts out -- selecting the title by dragging
   * does exactly that -- cannot publish by accident. Called unconditionally
   * here, above the `isOpen` early return, because it owns a ref.
   */
  const backdropSaves = useBackdropDismiss(submit);

  /**
   * ENTER SAVES. The handler sits on this modal's own wrapper rather than on
   * the title input, because the input belongs to ImagePostEditorCard and is
   * shared with the persisted editor -- whose Enter must keep meaning "blur",
   * not "publish". Keydown from the input still reaches here, since the card's
   * own handler blurs without stopping propagation.
   *
   * `isComposing` is checked because Enter commits a candidate during IME
   * input: publishing on that keystroke would cut a Japanese or Chinese title
   * off mid-word.
   */
  const onWrapperKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    if (event.nativeEvent.isComposing) return;
    if (confirmingDiscard) return;
    event.preventDefault();
    submit();
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
        // PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1: the backdrop now SAVES. This
        // prop was previously omitted entirely so that a backdrop click did
        // nothing; it is bound to `submit` -- never to a discard, which is the
        // behaviour that lost captures in the first place.
        backdropProps={backdropSaves}
        toolbar={
          <ImageActionsToolbar
            mode="image"
            disabledToolIds={DRAFT_DISABLED_TOOLS}
            // The arrow does not publish -- it ASKS to close, same as Escape.
            // It and Escape are now the only two ways to leave WITHOUT saving,
            // and both route through the discard confirmation.
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
        <div
          ref={wrapperRef}
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onWrapperKeyDown}
        >
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
              {/* No buttons. The caption carries the state the save button
                  used to: without it an in-flight save is completely silent,
                  and a slow one is indistinguishable from a dead modal. */}
              <p data-ui="pdf-area-image-draft-caption" className="text-center text-[11px] text-gray-400">
                {isSaving ? 'Adding…' : 'Adds this image to the canvas and PDF Library.'}
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
