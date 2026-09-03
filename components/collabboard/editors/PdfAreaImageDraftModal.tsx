'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import ImagePostEditorShell from './ImagePostEditorShell';
import ImagePostEditorCard from './ImagePostEditorCard';
import ImageActionsToolbar from './ImageActionsToolbar';
import { useBackdropDismiss } from './PostEditorShell';

/**
 * R6I-C2 -- the REAL Image post editor, in creation mode.
 *
 * Two earlier attempts got this wrong in the same way: they showed something
 * that was not the Image editor. R6I reused the clipart card modal; R6I-C1
 * replaced it with a preview card and a pair of buttons. Neither is the editor
 * the user has been accepting since R6C, which is a portalled three-track
 * overlay with the vertical Image toolbar on the left and the titled image card
 * in the middle.
 *
 * So this composes the same parts the persisted editor does -- the same shell,
 * the same ImageActionsToolbar, the same ImagePostEditorCard -- rather than
 * approximating them. The only thing it adds is an explicit Save, because
 * unlike the persisted editor there is nothing to autosave to yet.
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
 * DISMISSAL IS NOT THE CLIPART CONTRACT. There, closing saves. Here Save
 * publishes to a shared board, so only the Save button does: Cancel, backdrop
 * and Escape all discard, through the shared press-origin guard so a first
 * click in the title cannot be retargeted into losing the draft.
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
  /** Every other way out. Writes nothing. */
  readonly onCancel: () => void;
  readonly isSaving?: boolean;
}

export default function PdfAreaImageDraftModal({
  isOpen,
  previewSrc,
  title,
  onTitleChange,
  onSave,
  onCancel,
  isSaving = false,
}: PdfAreaImageDraftModalProps) {
  const backdropDismiss = useBackdropDismiss(() => {
    if (!isSaving) onCancel();
  });

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onCancel]);

  if (!isOpen) return null;

  const unavailable = () => {};

  return (
    <ImagePostEditorShell
      dataUi="pdf-area-image-draft-overlay"
      backdropProps={backdropDismiss}
      toolbar={
        <ImageActionsToolbar
          mode="image"
          disabledToolIds={DRAFT_DISABLED_TOOLS}
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
        />

        {/* The persisted editor autosaves, so it needs no such row. This one
            has nothing to save to until the user says so. */}
        <div
          className="mt-4 flex items-center justify-end gap-2"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            data-ui="pdf-area-image-draft-cancel"
            className="px-4 py-1.5 rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            data-ui="pdf-area-image-draft-save"
            className="px-5 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 text-sm font-bold shadow-sm transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSaving ? 'Adding…' : 'Save'}
          </button>
        </div>
      </div>
    </ImagePostEditorShell>
  );
}
