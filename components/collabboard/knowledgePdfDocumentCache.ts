"use client";

import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * PATCH-177. ONE loaded pdf.js document per (board, document), shared by every
 * page and every mount, so a document with 40 pages loads once rather than 40
 * times.
 *
 * pdfjs-dist is imported DYNAMICALLY inside the call, never at module top level:
 * that keeps server rendering and the test environment free of it. The worker is
 * registered once, so every page agrees where it is.
 */

/**
 * A cached promise per document. A FAILED load is cached as a rejection too, so
 * a broken file is not retried on every page -- there are no retry loops.
 */
const documents = new Map<string, Promise<PDFDocumentProxy>>();

let workerConfigured = false;

/** The route that authorizes, then redirects to a signed URL. */
function originalFileUrl(boardId: string, documentId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/original`;
}

async function loadPdfDocument(boardId: string, documentId: string): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    workerConfigured = true;
  }
  // `getDocument({ url })` fetches the signed URL itself. Nothing is invented:
  // the route above is the same authorized original-file route the reader uses.
  //
  // LOCKED DOWN, because this parses a file any board member may have uploaded,
  // in every OTHER viewer's browser. The layer needs only text and positions:
  // no code evaluation (CVE-2024-4367 was an eval path; 4.10.38 is patched and
  // this closes the path regardless), no XFA forms, no embedded fonts installed
  // into the page. workerIsolation.source.test.ts pins these three options.
  return pdfjs.getDocument({
    url: originalFileUrl(boardId, documentId),
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
  }).promise;
}

/** What the page layer hands to pdf.js's TextLayer. */
export type PdfTextLayerOptions = ConstructorParameters<typeof import('pdfjs-dist').TextLayer>[0];

/**
 * Build a pdf.js TextLayer. Kept HERE so this file stays the ONE browser-side
 * PDF.js importer (workerIsolation.source.test.ts admits exactly this file).
 */
export async function createPdfTextLayer(
  options: PdfTextLayerOptions,
): Promise<{ render(): Promise<unknown>; cancel(): void }> {
  const pdfjs = await import('pdfjs-dist');
  return new pdfjs.TextLayer(options);
}

/** The one pdf.js document for a board document, loading it at most once. */
export function getPdfDocument(boardId: string, documentId: string): Promise<PDFDocumentProxy> {
  const key = `${boardId}:${documentId}`;
  const cached = documents.get(key);
  if (cached) return cached;
  const loading = loadPdfDocument(boardId, documentId);
  documents.set(key, loading);
  // The cache keeps the REJECTED promise; this handler only stops the browser
  // reporting an unhandled rejection when a caller attaches its own catch.
  loading.catch(() => {});
  return loading;
}
