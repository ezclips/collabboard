"use client";

import React, { useEffect, useState } from 'react';
import {
  listKnowledgePdfs,
  type KnowledgePdfPlacementSource,
  type KnowledgePdfProcessingStatus,
  type KnowledgePdfSummary,
} from '@/components/collabboard/KnowledgePdfUploader';

/**
 * Placing a PDF the board already has.
 *
 * A Knowledge document is durable and board-independent; its canvas card is one
 * disposable reference. Deleting the card used to strand the document -- it
 * stayed ready and listed by the API with no way for anyone to reach it again,
 * because Add PDF only ever uploads. This chooser is the missing return path,
 * and nothing more: it reads the board's own Knowledge listing and hands one
 * row to the SAME placement authority an upload uses.
 *
 * Not a library panel. It opens on demand, places one document and closes; the
 * permanent Knowledge sidebar PDF-C1 removed is not coming back through here.
 */

const STATUS_LABELS: Record<KnowledgePdfProcessingStatus, string> = {
  uploaded: 'Preparing…',
  processing: 'Preparing…',
  ready: 'Ready',
  failed: 'Unavailable',
};

export interface KnowledgeExistingPdfPickerProps {
  readonly isOpen: boolean;
  readonly boardId: string;
  /** Document ids that already have a card here, so V1 offers no second copy. */
  readonly placedDocumentIds: readonly string[];
  readonly onClose: () => void;
  /**
   * Hands the chosen document to the canvas placement authority. Rejecting (or
   * returning false) leaves the chooser open and reports the failure, so a
   * failed insert can never look like a success.
   */
  readonly onPlace: (source: KnowledgePdfPlacementSource) => Promise<boolean> | boolean;
  /** Test seam. Production uses the shared, board-authorized list helper. */
  readonly listDocuments?: (boardId: string) => Promise<readonly KnowledgePdfSummary[]>;
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly documents: readonly KnowledgePdfSummary[] };

export default function KnowledgeExistingPdfPicker({
  isOpen,
  boardId,
  placedDocumentIds,
  onClose,
  onPlace,
  listDocuments,
}: KnowledgeExistingPdfPickerProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [placeFailed, setPlaceFailed] = useState(false);
  /**
   * Removing one for good -- followups item 15.
   *
   * This chooser is where the delete control belongs because it is the only
   * surface that shows a board's documents at all: the permanent Knowledge
   * library PDF-C1 removed is not mounted anywhere. The comment at the top of
   * this file describes a document stranded with "no way for anyone to reach it
   * again"; until now the same was true of removing one.
   *
   * Two steps, because the deletion is irreversible and it cascades -- pages,
   * chunks, references, highlights and embeddings go with the row, and the
   * stored PDF goes with them. Arming one row disarms any other, so a mis-click
   * beside a Place button cannot leave a primed control behind.
   */
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState<string | null>(null);

  // Fetched on open, never polled: KnowledgePdfUploader already owns the only
  // poll over this endpoint, and a second timer would double the load for no
  // extra information.
  useEffect(() => {
    if (!isOpen || !boardId) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    setPlaceFailed(false);
    const load = listDocuments ?? ((id: string) => listKnowledgePdfs(id));
    void load(boardId)
      .then((documents) => { if (!cancelled) setState({ kind: 'loaded', documents }); })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, [isOpen, boardId, listDocuments]);

  if (!isOpen) return null;

  const place = async (document: KnowledgePdfSummary) => {
    setPlacingId(document.id);
    setPlaceFailed(false);
    try {
      const placed = await onPlace({
        id: document.id,
        originalFilename: document.originalFilename,
        processingStatus: document.processingStatus,
      });
      // Only a confirmed placement closes the chooser.
      if (placed === false) setPlaceFailed(true);
      else onClose();
    } catch {
      setPlaceFailed(true);
    } finally {
      setPlacingId(null);
    }
  };

  /**
   * The row leaves the list only when the server says the document is gone. An
   * optimistic removal would show a chooser missing a PDF the board still has,
   * and the user's next move would be to upload it again.
   */
  const remove = async (documentId: string) => {
    setDeletingId(documentId);
    setDeleteFailed(null);
    try {
      const response = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        // Reports the server's refusal; it never predicts one. This chooser
        // lists every document and lets the server decide.
        setDeleteFailed(response.status === 403
          ? 'You are not allowed to remove that PDF.'
          : 'Could not remove that PDF.');
        return;
      }
      setState((current) => (current.kind === 'loaded'
        ? { ...current, documents: current.documents.filter((entry) => entry.id !== documentId) }
        : current));
      setConfirmingDeleteId(null);
    } catch {
      setDeleteFailed('Could not remove that PDF.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      data-ui="knowledge-existing-pdf-picker"
      className="absolute z-50 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
      role="dialog"
      aria-label="Existing PDFs"
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-semibold text-gray-700">Existing PDFs</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close existing PDFs"
          className="rounded px-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {state.kind === 'loading' ? (
        <p className="px-1 py-3 text-xs text-gray-500">Loading…</p>
      ) : state.kind === 'error' ? (
        <p className="px-1 py-3 text-xs text-gray-500">PDF list is temporarily unavailable.</p>
      ) : state.documents.length === 0 ? (
        <p className="px-1 py-3 text-xs text-gray-500">No existing PDFs available.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto">
          {state.documents.map((document) => {
            const alreadyPlaced = placedDocumentIds.includes(document.id);
            const isReady = document.processingStatus === 'ready';
            // Anything not ready, and anything already on this board, is shown
            // with its reason rather than being clickable and doing nothing.
            const disabled = alreadyPlaced || !isReady || placingId !== null;
            const reason = alreadyPlaced
              ? 'Already on board'
              : STATUS_LABELS[document.processingStatus] ?? 'Unavailable';
            return (
              <li key={document.id} data-existing-pdf-id={document.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { void place(document); }}
                  className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left ${
                    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-800">
                    {document.originalFilename}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">
                    {alreadyPlaced || !isReady
                      ? reason
                      : document.pageCount === null ? '' : `${document.pageCount} pages`}
                  </span>
                </button>
                {/* LEFT-ALIGNED, UNDER THE ROW, AND THAT IS NOT COSMETIC. This
                    popover is `w-72` anchored `right-0` and, with a wide tab
                    strip, it renders partly beyond the right edge of the window
                    -- measured at x=1824..2112 in a 1920px viewport, so its
                    right two thirds are unreachable. A control at the row's
                    trailing edge could not be clicked at all. Keeping it at the
                    leading edge also matches the library surface.

                    Offered in EVERY status, including `failed` and `Already on
                    board`: a document that cannot be placed is exactly the one
                    a user most wants to be rid of, and it is the one whose
                    Place button is disabled. */}
                {confirmingDeleteId !== document.id ? (
                  <button
                    type="button"
                    data-existing-pdf-remove={document.id}
                    aria-label={`Remove ${document.originalFilename}`}
                    title={`Remove ${document.originalFilename}`}
                    className="ml-2 mb-1 rounded text-[10px] text-gray-400 underline underline-offset-2 hover:text-red-700"
                    onClick={() => { setConfirmingDeleteId(document.id); setDeleteFailed(null); }}
                  >
                    Remove
                  </button>
                ) : null}
                {confirmingDeleteId === document.id ? (
                  <div
                    data-existing-pdf-remove-confirm-row={document.id}
                    className="mb-1 rounded bg-red-50 px-2 py-1"
                  >
                    {/* What it costs, said BEFORE the confirm rather than after. */}
                    <p className="text-[10px] leading-snug text-gray-600">
                      Delete this PDF, its extracted text and any highlights on it? Answers that
                      cited it keep their citations, but the source can no longer be opened.
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        data-existing-pdf-remove-confirm={document.id}
                        disabled={deletingId === document.id}
                        className="text-[10px] font-medium text-red-700 underline underline-offset-2 disabled:text-gray-400 disabled:no-underline"
                        onClick={() => { void remove(document.id); }}
                      >
                        {deletingId === document.id ? 'Removing…' : 'Delete permanently'}
                      </button>
                      <button
                        type="button"
                        data-existing-pdf-remove-cancel={document.id}
                        disabled={deletingId === document.id}
                        className="text-[10px] font-medium text-gray-600 underline underline-offset-2"
                        onClick={() => { setConfirmingDeleteId(null); setDeleteFailed(null); }}
                      >
                        Cancel
                      </button>
                    </div>
                    {deleteFailed !== null ? (
                      <p data-existing-pdf-remove-error={document.id} className="mt-0.5 text-[10px] text-red-700">
                        {deleteFailed}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {placeFailed ? (
        <p className="px-1 pt-1 text-xs text-red-600">Could not add that PDF. Try again.</p>
      ) : null}
    </div>
  );
}
