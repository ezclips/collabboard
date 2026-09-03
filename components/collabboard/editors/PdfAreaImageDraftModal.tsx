'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import ImagePostEditorCard from './ImagePostEditorCard';
import { useBackdropDismiss } from './PostEditorShell';

/**
 * R6I-C1 -- the Image post editor, before the Image exists.
 *
 * R6I reused the clipart draft modal, which was wrong twice over: it looked
 * like a generic card editor rather than the Image editor the user has been
 * accepting since R6C, and it rendered `fixed inset-0 z-[160]` with no portal,
 * so it opened UNDERNEATH the PDF reader (z-1200, and still 900 when yielding).
 *
 * Both are fixed by adopting the accepted Image editor's own architecture
 * rather than a new one:
 *
 *  - the same card composition, via the shared ImagePostEditorCard;
 *  - portalled to <body>, because this renders from inside CanvasViewport's
 *    `isolation: isolate` boundary where the whole canvas subtree paints as one
 *    atomic layer -- no z-index asked for in there can clear a root-level
 *    sibling, which is exactly what R6C established;
 *  - the same z-[60000] tier the persisted image overlay uses, so the two
 *    cannot drift apart.
 *
 * DISMISSAL IS DELIBERATELY NOT THE CLIPART CONTRACT. There, closing saves.
 * Here, nothing exists yet and Save publishes to a shared board, so every way
 * out except the Save button discards: Cancel, X, backdrop and Escape all
 * leave no card, no private crop and no board mutation.
 */

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
  // The shared press-origin guard (R6C): a first click that begins inside the
  // title or a control and is released over the backdrop must not be
  // retargeted into a dismissal -- which here would silently discard the draft.
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

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
      data-ui="pdf-area-image-draft-overlay"
      {...backdropDismiss}
    >
      <div className="flex flex-col items-center gap-4" style={{ pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          {/*
            No reactions, caption, comment or reaction controls: every one of
            them writes to a row that does not exist yet. Showing them disabled
            would be more honest than showing them broken, but showing them at
            all would suggest this draft is further along than it is.
          */}
          <ImagePostEditorCard
            imageSrc={previewSrc ?? undefined}
            imageAlt="Selected PDF area"
            title={title}
            onTitleChange={onTitleChange}
            titlePlaceholder="Title"
          />
        </div>

        <div
          className="flex items-center gap-2"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
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
    </div>,
    document.body,
  );
}
