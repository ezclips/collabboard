"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useKnowledgeSourceNoteSummariesForDocument } from '@/components/collabboard/KnowledgeSourceReferenceContext';
import { fetchLibraryItems } from '@/lib/collabboard/library';
import type { LibraryItem } from '@/lib/collabboard/library';
import {
  selectPdfWorkspaceLibraryImages,
  type PdfWorkspaceLibraryImage,
} from '@/lib/domain/canvas/pdfWorkspaceLibraryImages';
import type { KnowledgeSourceNoteSummary } from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';

export type PdfWorkspaceLibraryFilter = 'all' | 'notes' | 'images';

const FILTERS: ReadonlyArray<{ id: PdfWorkspaceLibraryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'images', label: 'Images' },
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
}: {
  note: KnowledgeSourceNoteSummary;
  onOpenNote: (targetPadletId: string) => void;
}) {
  return (
    <li data-pdf-workspace-library-note={note.targetPadletId}>
      <button
        type="button"
        onClick={() => onOpenNote(note.targetPadletId)}
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

export default function PdfWorkspaceLibraryPanel({
  documentId,
  onOpenNote,
  onNavigateToImagePage,
  loadLibraryItems = fetchLibraryItems,
}: PdfWorkspaceLibraryPanelProps) {
  const notes = useKnowledgeSourceNoteSummariesForDocument(documentId);
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
    setImageState({ documentId, loading: true, error: false, images: [] });

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
        setImageState({ documentId, loading: false, error: true, images: [] });
      });

    return () => {
      generationRef.current += 1;
    };
  }, [documentId, loadLibraryItems]);

  const images = imageState.documentId === documentId ? imageState.images : [];
  const imagesLoading = imageState.documentId === documentId && imageState.loading;
  const imagesError = imageState.documentId === documentId && imageState.error;
  const showNotes = filter === 'all' || filter === 'notes';
  const showImages = filter === 'all' || filter === 'images';
  const empty = filter === 'all'
    && !imagesLoading
    && !imagesError
    && notes.length === 0
    && images.length === 0;

  const filterCounts = useMemo(() => ({
    all: notes.length + images.length,
    notes: notes.length,
    images: images.length,
  }), [images.length, notes.length]);

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
                <NoteRow key={note.targetPadletId} note={note} onOpenNote={onOpenNote} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {showImages ? (
        <section data-pdf-workspace-library-images="true">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Images</p>
          {imagesLoading ? (
            <p data-pdf-workspace-library-images-loading="true" className="text-[11px] text-gray-500">
              Loading images…
            </p>
          ) : imagesError ? (
            <p data-pdf-workspace-library-images-error="true" className="text-[11px] text-red-500">
              Could not load Library images.
            </p>
          ) : images.length === 0 ? (
            <p className="text-[11px] text-gray-500">No PDF-derived images for this PDF yet.</p>
          ) : (
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
          )}
        </section>
      ) : null}

      {empty ? (
        <p data-pdf-workspace-library-empty="true" className="mt-3 text-[11px] text-gray-500">
          No Notes or Images for this PDF yet.
        </p>
      ) : null}
    </div>
  );
}
