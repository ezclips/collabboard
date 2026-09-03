'use client';

import React from 'react';
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
 * EXIT MODEL (R6I-C3). The persisted editor has no Save footer -- it autosaves
 * and you leave it -- so neither does this. Finishing happens through the
 * toolbar's own arrow, which in draft mode reads "Done" and places the image.
 * Every accidental way out still discards: backdrop and Escape write nothing,
 * through the shared press-origin guard so a first click in the title cannot be
 * retargeted into losing the draft.
 *
 * That asymmetry is deliberate. Publishing to a shared board should take a
 * deliberate action; dropping an unpublished draft should not be able to
 * happen by accident, and should never place a card.
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
          // R6I-C3. Finishing the draft IS leaving the editor, so it happens
          // through the toolbar's own arrow rather than a footer the persisted
          // editor does not have. Only this publishes.
          onBack={onSave}
          backLabel="Done"
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
        />
      </div>
    </ImagePostEditorShell>
  );
}
