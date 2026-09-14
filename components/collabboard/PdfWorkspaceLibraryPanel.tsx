"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, RotateCcw } from 'lucide-react';
import {
  useKnowledgeSourceNoteSummariesForDocument,
  useKnowledgeStandaloneHighlights,
  useKnowledgePdfAreaImageInvalidation,
} from '@/components/collabboard/KnowledgeSourceReferenceContext';
import {
  SOURCE_NOTE_PLACEMENT_MIME,
  serializeKnowledgeSourceNotePlacementDrag,
} from '@/lib/domain/knowledge/knowledgeSourceNotePlacement';
import type { KnowledgeSourceHighlight } from '@/lib/domain/knowledge/knowledgeSourceHighlight';
import { fetchLibraryItems } from '@/lib/collabboard/library';
import type { LibraryItem } from '@/lib/collabboard/library';
import {
  selectPdfWorkspaceLibraryImages,
  type PdfWorkspaceLibraryImage,
} from '@/lib/domain/canvas/pdfWorkspaceLibraryImages';
import type { KnowledgeSourceNoteSummary } from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';

/**
 * The type filters INSIDE one PDF's slice of the one Library.
 *
 * Deliberately types, never sources: the active document is the mandatory
 * primary scope and no filter here can widen or clear it. There is no separate
 * "AI Notes" type either -- a Note saved from an AI answer is an ordinary
 * source-linked Note and appears under Notes with the rest.
 */
export type PdfWorkspaceLibraryFilter = 'all' | 'notes' | 'images' | 'highlights';

const FILTERS: ReadonlyArray<{ id: PdfWorkspaceLibraryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'images', label: 'Images' },
  { id: 'highlights', label: 'Highlights' },
];

interface ImageState {
  readonly documentId: string;
  readonly loading: boolean;
  readonly error: boolean;
  readonly images: readonly PdfWorkspaceLibraryImage[];
}

export interface PdfWorkspaceLibraryPanelProps {
  readonly documentId: string;
  readonly onOpenNote: (targetPadletId: string) => void;
  /**
   * Move the board to this Note, when the board can do that.
   *
   * Optional on purpose: a layout that cannot reveal spatially is handed
   * nothing, so the action is absent rather than present-but-dead. Navigation
   * only -- it never edits, and read authority is all it needs.
   */
  readonly onShowNoteOnBoard?: (targetPadletId: string) => void;
  /**
   * The board's existing placement authority, forwarded verbatim. Present only
   * in the docked reader, where a Note row can be dragged back onto a board
   * that is still on screen -- the drag payload is the SAME identity-only one
   * the Source Notes panel has always written.
   */
  readonly canDragNote?: (targetPadletId: string) => boolean;
  /** Sends the reader to a highlight's own page, in either host. */
  readonly onNavigateToPage?: (request: {
    readonly documentId: string;
    readonly pageNumber: number;
  }) => void;
  readonly onNavigateToImagePage?: (request: {
    readonly libraryItemId: string;
    readonly documentId: string;
    readonly pageNumber: number;
  }) => void;
  readonly loadLibraryItems?: () => Promise<readonly LibraryItem[]>;
}

function NoteRow({
  note,
  onOpenNote,
  onShowNoteOnBoard,
  draggable,
}: {
  note: KnowledgeSourceNoteSummary;
  onOpenNote: (targetPadletId: string) => void;
  onShowNoteOnBoard?: (targetPadletId: string) => void;
  draggable?: boolean;
}) {
  return (
    <li data-pdf-workspace-library-note={note.targetPadletId}>
      <button
        type="button"
        onClick={() => onOpenNote(note.targetPadletId)}
        draggable={draggable || undefined}
        title={draggable ? 'Drag to reposition this Note on the board' : undefined}
        onDragStart={(event) => {
          if (!draggable) { event.preventDefault(); return; }
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(SOURCE_NOTE_PLACEMENT_MIME,
            serializeKnowledgeSourceNotePlacementDrag(note.targetPadletId));
        }}
        className="block w-full rounded-lg border border-gray-100 bg-white p-2 text-left transition hover:border-gray-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        style={note.accentColor ? { borderLeftColor: note.accentColor, borderLeftWidth: 3 } : undefined}
      >
        <p className="truncate text-xs font-medium text-gray-800">{note.title}</p>
        {note.bodyExcerpt ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{note.bodyExcerpt}</p>
        ) : null}
        {note.pageHint ? (
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">{note.pageHint}</p>
        ) : null}
      </button>
      {/*
        A second action beside the row, never instead of it: opening the Note
        is unchanged, and this additionally takes the board to it. Rendered
        only where the board can actually honour the request.
      */}
      {onShowNoteOnBoard ? (
        <button
          type="button"
          data-pdf-workspace-library-note-show-on-board={note.targetPadletId}
          onClick={() => onShowNoteOnBoard(note.targetPadletId)}
          title="Show on board"
          aria-label={`Show ${note.title} on the board`}
          className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-gray-400 transition hover:bg-slate-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <Crosshair className="h-3 w-3" aria-hidden="true" />
          Show on board
        </button>
      ) : null}
    </li>
  );
}

function ImageRow({
  image,
  documentId,
  onNavigateToImagePage,
}: {
  image: PdfWorkspaceLibraryImage;
  documentId: string;
  onNavigateToImagePage?: PdfWorkspaceLibraryPanelProps['onNavigateToImagePage'];
}) {
  const canNavigate = image.provenance.knowledgeDocumentId === documentId
    && Number.isInteger(image.pageNumber)
    && image.pageNumber >= 1
    && Boolean(onNavigateToImagePage);

  const navigate = () => {
    if (!canNavigate) return;
    onNavigateToImagePage?.({
      libraryItemId: image.libraryItemId,
      documentId,
      pageNumber: image.pageNumber,
    });
  };

  return (
    <li data-pdf-workspace-library-image={image.libraryItemId}>
      <div
        data-pdf-workspace-library-image-go={image.libraryItemId}
        className="group flex w-full gap-2 rounded-lg border border-gray-100 bg-white p-2 text-left transition hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default disabled:opacity-60"
      >
        <button
          type="button"
          data-pdf-workspace-library-image-preview={image.libraryItemId}
          aria-label={`Go to page ${image.pageNumber}`}
          disabled={!canNavigate}
          onClick={navigate}
          className="h-14 w-16 shrink-0 overflow-hidden rounded bg-gray-100 transition hover:ring-2 hover:ring-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default disabled:opacity-60"
        >
          {/* Existing Library previews can be same-origin API routes or data URLs. */}
          <img
            src={image.previewSrc}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-800">{image.title}</p>
          <button
            type="button"
            data-pdf-workspace-library-image-page={image.libraryItemId}
            aria-label={`Go to page ${image.pageNumber}`}
            disabled={!canNavigate}
            onClick={navigate}
            className="mt-1 rounded text-[10px] font-semibold uppercase tracking-wide text-gray-400 transition hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default disabled:opacity-60 group-hover:text-blue-700"
          >
            p. {image.pageNumber}
          </button>
        </div>
      </div>
    </li>
  );
}

/** One standalone highlight, and the page it marks. */
function HighlightRow({
  highlight,
  documentId,
  onNavigateToPage,
}: {
  highlight: KnowledgeSourceHighlight;
  documentId: string;
  onNavigateToPage?: PdfWorkspaceLibraryPanelProps['onNavigateToPage'];
}) {
  const canNavigate = Boolean(onNavigateToPage)
    && Number.isInteger(highlight.pageNumber)
    && highlight.pageNumber >= 1;
  return (
    <li data-pdf-workspace-library-highlight={highlight.id}>
      <button
        type="button"
        disabled={!canNavigate}
        aria-label={`Go to page ${highlight.pageNumber}`}
        onClick={() => {
          if (!canNavigate) return;
          onNavigateToPage?.({ documentId, pageNumber: highlight.pageNumber });
        }}
        className="block w-full rounded-lg border border-gray-100 bg-white p-2 text-left transition hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default"
        style={{ borderLeftColor: highlight.color, borderLeftWidth: 3 }}
      >
        <p className="line-clamp-2 text-[11px] text-gray-700">{highlight.quoteText}</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          p. {highlight.pageNumber}
        </p>
      </button>
    </li>
  );
}

export default function PdfWorkspaceLibraryPanel({
  documentId,
  onOpenNote,
  onShowNoteOnBoard,
  canDragNote,
  onNavigateToPage,
  onNavigateToImagePage,
  loadLibraryItems = fetchLibraryItems,
}: PdfWorkspaceLibraryPanelProps) {
  const notes = useKnowledgeSourceNoteSummariesForDocument(documentId);
  // The board's own highlight index, read in the same direction as the Notes
  // above: this panel issues no query of its own for either.
  const highlights = useKnowledgeStandaloneHighlights(documentId);
  // PDF_AREA_IMAGE_LIBRARY_REFRESH_CORRECTION_1 -- bumps ONLY when a
  // rectangle-selection image was confirmed created for THIS document. Every
  // other board edit (move, resize, recolor, an unrelated document's
  // creation) leaves this number, and therefore the effect below, untouched.
  const imageInvalidation = useKnowledgePdfAreaImageInvalidation(documentId);
  // PDF_IMAGE_LIBRARY_REFRESH_ERROR_VISIBILITY_CORRECTION_1 -- the Retry
  // button's own trigger. A local counter, not a context signal: a retry is
  // this panel instance's own request, scoped to whatever `documentId` it
  // closes over at click time, and must never notify any other mounted panel.
  const [retryToken, setRetryToken] = useState(0);
  const [filter, setFilter] = useState<PdfWorkspaceLibraryFilter>('all');
  const [imageState, setImageState] = useState<ImageState>({
    documentId,
    loading: true,
    error: false,
    images: [],
  });
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    // A same-document run (the common case once `imageInvalidation` is what
    // retriggered this effect) keeps the currently-rendered images in state
    // while the refetch is in flight -- clearing them here would flash a
    // populated list to empty for a background refresh nobody asked to see.
    // A genuine document switch still resets to the loading/empty state, so
    // a different PDF's images are never shown against the new document id.
    setImageState((prev) => (
      prev.documentId === documentId
        ? { ...prev, loading: true, error: false }
        : { documentId, loading: true, error: false, images: [] }
    ));

    void loadLibraryItems()
      .then((items) => {
        if (generation !== generationRef.current) return;
        setImageState({
          documentId,
          loading: false,
          error: false,
          images: selectPdfWorkspaceLibraryImages(items, documentId),
        });
      })
      .catch(() => {
        if (generation !== generationRef.current) return;
        setImageState((prev) => ({ ...prev, documentId, loading: false, error: true }));
      });

    return () => {
      generationRef.current += 1;
    };
  }, [documentId, loadLibraryItems, imageInvalidation, retryToken]);

  // Runs the SAME effect above (loader, generation guard, same-document
  // preservation) rather than a second fetch path -- the effect already
  // closes over the CURRENT documentId, so a retry can only ever refresh
  // whichever document is open at the moment it's clicked.
  const retryImages = () => setRetryToken((token) => token + 1);

  const images = imageState.documentId === documentId ? imageState.images : [];
  const imagesLoading = imageState.documentId === documentId && imageState.loading;
  const imagesError = imageState.documentId === documentId && imageState.error;
  const showNotes = filter === 'all' || filter === 'notes';
  const showImages = filter === 'all' || filter === 'images';
  const showHighlights = filter === 'all' || filter === 'highlights';
  const empty = filter === 'all'
    && !imagesLoading
    && !imagesError
    && notes.length === 0
    && images.length === 0
    && highlights.length === 0;

  const filterCounts = useMemo(() => ({
    all: notes.length + images.length + highlights.length,
    notes: notes.length,
    images: images.length,
    highlights: highlights.length,
  }), [highlights.length, images.length, notes.length]);

  return (
    <div data-pdf-workspace-library-panel="true" data-pdf-workspace-library-document={documentId}>
      <div data-pdf-workspace-library-filters="true" className="mb-3 flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-pdf-workspace-library-filter={entry.id}
            aria-pressed={filter === entry.id}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
              filter === entry.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-gray-500 hover:bg-slate-200 hover:text-gray-700'
            }`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label} {filterCounts[entry.id]}
          </button>
        ))}
        {filter !== 'all' ? (
          <button
            type="button"
            data-pdf-workspace-library-filter-reset="true"
            title="Reset filter"
            aria-label="Reset Library filter"
            className="ml-auto rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={() => setFilter('all')}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showNotes ? (
        <section data-pdf-workspace-library-notes="true" className="mb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Notes</p>
          {notes.length === 0 ? (
            <p className="text-[11px] text-gray-500">No notes for this PDF yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {notes.map((note) => (
                <NoteRow
                  key={note.targetPadletId}
                  note={note}
                  onOpenNote={onOpenNote}
                  onShowNoteOnBoard={onShowNoteOnBoard}
                  draggable={canDragNote?.(note.targetPadletId) ?? false}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {showImages ? (
        <section data-pdf-workspace-library-images="true">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Images</p>
          {imagesLoading && images.length === 0 ? (
            <p data-pdf-workspace-library-images-loading="true" className="text-[11px] text-gray-500">
              Loading images…
            </p>
          ) : imagesError && images.length === 0 ? (
            <p data-pdf-workspace-library-images-error="true" className="text-[11px] text-red-500">
              Could not load Library images.
            </p>
          ) : images.length === 0 ? (
            <p className="text-[11px] text-gray-500">No PDF-derived images for this PDF yet.</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {images.map((image) => (
                  <ImageRow
                    key={image.libraryItemId}
                    image={image}
                    documentId={documentId}
                    onNavigateToImagePage={onNavigateToImagePage}
                  />
                ))}
              </ul>
              {/* PDF_IMAGE_LIBRARY_REFRESH_ERROR_VISIBILITY_CORRECTION_1 -- a
                  background refresh (the panel already open, a creation or a
                  retry re-triggering the effect above) that fails must not
                  silently leave a stale list with no indication it happened.
                  The images stay visible either way; this only adds the
                  missing signal beside them. */}
              {imagesError ? (
                <div
                  data-pdf-workspace-library-images-refresh-error="true"
                  className="mt-2 flex items-center justify-between gap-2 rounded border border-red-100 bg-red-50 px-2 py-1.5"
                >
                  <span className="text-[11px] text-red-600">Couldn&apos;t refresh images.</span>
                  <button
                    type="button"
                    data-pdf-workspace-library-images-retry="true"
                    onClick={retryImages}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {showHighlights ? (
        <section data-pdf-workspace-library-highlights="true" className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Highlights</p>
          {highlights.length === 0 ? (
            <p className="text-[11px] text-gray-500">No highlights on this PDF yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {highlights.map((highlight) => (
                <HighlightRow
                  key={highlight.id}
                  highlight={highlight}
                  documentId={documentId}
                  onNavigateToPage={onNavigateToPage}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {empty ? (
        <p data-pdf-workspace-library-empty="true" className="mt-3 text-[11px] text-gray-500">
          Nothing in the Library for this PDF yet.
        </p>
      ) : null}
    </div>
  );
}
