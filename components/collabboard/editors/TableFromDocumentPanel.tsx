"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileInput, X } from 'lucide-react';

import {
  describeCoverage,
  gridFromDocumentTable,
  TABLE_FROM_DOCUMENT_MAX_PAGES,
  TABLE_FROM_DOCUMENT_MAX_REQUEST_CHARS,
  type TableFromDocumentSource,
  type TableFromDocumentTable,
} from '@/lib/domain/ai/tableFromDocument';
import type { TableGrid } from '@/lib/domain/canvas/tableStructure';
import TablePlanPreview from './TablePlanPreview';

/**
 * PATCH-176. "Table from a document": pick a ready PDF or video transcript on
 * the board, say what the table should contain, and the AI proposes a table
 * taken only from that document's text.
 *
 * THE PANEL WRITES NOTHING. It lists the board's documents, asks the route for a
 * proposal, shows it, and reports the draft grid upward on Apply -- the editor
 * owns the one writer and the Undo. The document is read by the SERVER through
 * the user's own session; this component only names a document id.
 */

const REQUEST_TIMEOUT_MS = 65_000;

interface DocumentListItem {
  readonly id: string;
  readonly originalFilename: string;
  readonly pageCount: number | null;
  readonly processingStatus: string;
}

type Phase =
  | { kind: 'pick' }
  | { kind: 'loading' }
  | {
      kind: 'preview';
      table: TableFromDocumentTable;
      source: TableFromDocumentSource;
      draft: TableGrid;
    }
  | { kind: 'nothing'; message: string }
  | { kind: 'error'; message: string };

export interface TableFromDocumentPanelProps {
  readonly boardId: string;
  /** How much text the current table already holds, for the replace warning. */
  readonly currentTableHasText: boolean;
  /** Reports the draft upward on Apply; never writes the grid itself. */
  readonly onApply: (draft: TableGrid, filename: string) => void;
  /** Reports whether a draft is being previewed, so the editor can lock. */
  readonly onPreview: (draft: TableGrid | null) => void;
  readonly onClose: () => void;
}

export default function TableFromDocumentPanel({
  boardId,
  currentTableHasText,
  onApply,
  onPreview,
  onClose,
}: TableFromDocumentPanelProps) {
  const [documents, setDocuments] = useState<DocumentListItem[] | null>(null);
  const [listError, setListError] = useState(false);
  const [documentId, setDocumentId] = useState('');
  const [request, setRequest] = useState('');
  const [pageFrom, setPageFrom] = useState('1');
  const [pageTo, setPageTo] = useState('20');
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // The board's documents, once. Only the ready ones can be read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/boards/${boardId}/knowledge`);
        if (cancelled) return;
        if (!response.ok) {
          setListError(true);
          setDocuments([]);
          return;
        }
        const body = await response.json().catch(() => null);
        const list: DocumentListItem[] = body && Array.isArray(body.documents)
          ? body.documents
            .filter((doc: unknown): doc is DocumentListItem => (
              !!doc && typeof (doc as DocumentListItem).id === 'string'
            ))
            .filter((doc: DocumentListItem) => doc.processingStatus === 'ready')
          : [];
        setDocuments(list);
        setDocumentId(list[0]?.id ?? '');
      } catch {
        if (!cancelled) {
          setListError(true);
          setDocuments([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  const selected = useMemo(
    () => (documents ?? []).find((doc) => doc.id === documentId) ?? null,
    [documents, documentId],
  );
  const isPdf = selected !== null && typeof selected.pageCount === 'number';

  // Default the page range to the first 20 pages of the selected PDF.
  useEffect(() => {
    if (selected && typeof selected.pageCount === 'number') {
      setPageFrom('1');
      setPageTo(String(Math.min(TABLE_FROM_DOCUMENT_MAX_PAGES, selected.pageCount)));
    }
  }, [documentId, selected]);

  const rangeTooWide = isPdf
    && (Number(pageTo) - Number(pageFrom) + 1 > TABLE_FROM_DOCUMENT_MAX_PAGES
      || Number(pageFrom) < 1
      || Number(pageTo) < Number(pageFrom));

  const handleClose = () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    onPreview(null);
    onClose();
  };

  const generate = async () => {
    if (!documentId || request.trim().length === 0 || rangeTooWide) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    setPhase({ kind: 'loading' });
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const body: Record<string, unknown> = { documentId, request: request.trim() };
      if (isPdf) {
        body.pageFrom = Number(pageFrom);
        body.pageTo = Number(pageTo);
      }
      const response = await fetch(
        `/api/boards/${boardId}/ai/table-from-document`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        },
      );
      if (generationRef.current !== generation) return;

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const apiMessage = payload && typeof payload.error === 'string' ? payload.error : null;
        if (response.status === 409) {
          setPhase({ kind: 'error', message: 'This document is still being processed.' });
        } else if (response.status === 404 || response.status === 403) {
          setPhase({ kind: 'error', message: 'This document is not available.' });
        } else if (response.status === 400) {
          setPhase({ kind: 'error', message: apiMessage ?? 'The AI request failed. Please try again.' });
        } else {
          setPhase({ kind: 'error', message: 'The AI request failed. Please try again.' });
        }
        return;
      }

      const payload = await response.json().catch(() => null);
      if (generationRef.current !== generation) return;
      const table: TableFromDocumentTable | null = payload && payload.table ? payload.table : null;
      const source: TableFromDocumentSource | null = payload && payload.source ? payload.source : null;
      if (!table || !source) {
        setPhase({ kind: 'error', message: "The AI's answer couldn't be used. Try rephrasing." });
        return;
      }
      if (table.rows.length === 0) {
        setPhase({ kind: 'nothing', message: table.message.trim() || 'Nothing in this document matched your request.' });
        return;
      }
      const draft = gridFromDocumentTable(table);
      onPreview(draft);
      setPhase({ kind: 'preview', table, source, draft });
    } catch {
      if (generationRef.current !== generation) return;
      setPhase({ kind: 'error', message: "The AI didn't answer in time. Try fewer pages." });
    } finally {
      clearTimeout(timer);
    }
  };

  const tryAgain = () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    onPreview(null);
    setPhase({ kind: 'pick' });
  };

  const generateDisabled = documents === null
    || selected === null
    || request.trim().length === 0
    || rangeTooWide;

  return (
    <div
      data-table-from-document-panel=""
      className="relative z-[1100] w-[320px] bg-white rounded-xl shadow-xl border border-gray-200 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <FileInput className="h-4 w-4 text-purple-500" aria-hidden="true" />
        Table from a document
      </div>

      {phase.kind === 'pick' && (
        <>
          {listError ? (
            <p data-table-from-document-list-error="" className="mb-2 text-xs text-red-600">
              Couldn&apos;t load this board&apos;s documents.
            </p>
          ) : documents !== null && documents.length === 0 ? (
            <p data-table-from-document-empty="" className="mb-2 text-xs text-gray-500">
              Add a PDF or a video transcript to this board first.
            </p>
          ) : (
            <>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="table-from-document-source">Document</label>
              <select
                id="table-from-document-source"
                data-table-from-document-source=""
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none"
              >
                {(documents ?? []).map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.originalFilename}{typeof doc.pageCount === 'number' ? ` · ${doc.pageCount} pages` : ''}
                  </option>
                ))}
              </select>

              {isPdf && (
                <div className="mb-2">
                  <span className="mb-1 block text-xs text-gray-500">Pages</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      data-table-from-document-page-from=""
                      min={1}
                      max={selected?.pageCount ?? undefined}
                      value={pageFrom}
                      onChange={(e) => setPageFrom(e.target.value)}
                      className="w-16 rounded border border-gray-200 px-2 py-1 text-sm outline-none"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                      type="number"
                      data-table-from-document-page-to=""
                      min={1}
                      max={selected?.pageCount ?? undefined}
                      value={pageTo}
                      onChange={(e) => setPageTo(e.target.value)}
                      className="w-16 rounded border border-gray-200 px-2 py-1 text-sm outline-none"
                    />
                  </div>
                  {rangeTooWide && (
                    <p data-table-from-document-range-error="" className="mt-1 text-xs text-amber-600">
                      Up to 20 pages at a time.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <textarea
            id="table-from-document-request"
            data-table-from-document-request=""
            rows={3}
            value={request}
            maxLength={TABLE_FROM_DOCUMENT_MAX_REQUEST_CHARS}
            placeholder="e.g. Every part with its number and price"
            onChange={(e) => setRequest(e.target.value.slice(0, TABLE_FROM_DOCUMENT_MAX_REQUEST_CHARS))}
            className="mb-2 w-full resize-y rounded border border-gray-200 px-2 py-1 text-sm outline-none"
          />

          <p className="mb-2 text-xs text-gray-400">
            The AI reads the document and proposes a table; you see it before anything changes.
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              data-table-from-document-generate=""
              onClick={generate}
              disabled={generateDisabled}
              className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </>
      )}

      {phase.kind === 'loading' && (
        <div role="status" className="text-xs text-gray-400">Reading the document…</div>
      )}

      {phase.kind === 'preview' && (
        <>
          {phase.table.message && (
            <p data-table-from-document-message="" className="mb-1 text-xs text-gray-700">{phase.table.message}</p>
          )}
          <p data-table-from-document-coverage="" className="mb-2 text-xs text-gray-400">
            {describeCoverage(phase.source)}
          </p>
          <div className="mb-2 max-h-[240px] overflow-auto">
            <TablePlanPreview grid={phase.draft} />
          </div>
          <p className="mb-2 text-xs text-gray-400">
            Taken from the document by the AI — check it against the source.
          </p>
          {currentTableHasText && (
            <p data-table-from-document-replace-warning="" className="mb-2 text-xs text-amber-600">
              Apply replaces the current table. You can undo it.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => onApply(phase.draft, phase.source.filename)}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {phase.kind === 'nothing' && (
        <>
          <p data-table-from-document-nothing="" className="mb-2 text-xs text-gray-600">{phase.message}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Close
            </button>
            <button
              type="button"
              onClick={tryAgain}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Try again
            </button>
          </div>
        </>
      )}

      {phase.kind === 'error' && (
        <>
          <div role="alert" data-table-from-document-error="" className="mb-2 text-xs text-red-600">{phase.message}</div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Close
            </button>
            <button
              type="button"
              onClick={tryAgain}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
