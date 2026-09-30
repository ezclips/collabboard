// PATCH-216. Can an imported file become a readable Knowledge document?
//
// Importing from Google Drive or OneDrive historically made only an image card:
// a preview plus a link that opens the file in the provider. The wiki and the
// board AI never saw the file's content. This module decides, purely, whether a
// picked file can instead take the SAME path a computer upload takes, and how
// its bytes should be obtained.

import { KNOWLEDGE_DOCX_MIME_TYPE } from '@/lib/domain/knowledge/knowledgeDocxSource';
import { UPLOAD_LIMITS } from '@/lib/domain/storage/uploadLimits';
import type { ImportBrowserItem, ImportProvider } from './types';

export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

/**
 * The MIME types this feature can turn into a readable document.
 *
 * Google Docs are not downloadable as themselves -- Google exports them -- so
 * they are handled specially in `documentImportPlan` and are included here only
 * so the client's choice UI agrees with the server.
 */
const DOWNLOADABLE_MIME_TYPES = new Set<string>([
  'application/pdf',
  KNOWLEDGE_DOCX_MIME_TYPE,
  'text/plain',
  'text/markdown',
]);

/** The sentence shown when a picked file cannot become a document. */
export const DOCUMENT_IMPORT_REFUSAL =
  'Only PDF, Word, text and Google Docs files can be added as documents.';

/**
 * Would this MIME type be accepted as a readable document? Used by the client
 * to decide whether to offer the choice at all.
 */
export function isDocumentImportable(mimeType: string): boolean {
  return mimeType === GOOGLE_DOC_MIME_TYPE || DOWNLOADABLE_MIME_TYPES.has(mimeType);
}

export interface DocumentImportPlan {
  /** How the server must obtain the bytes. */
  readonly kind: 'download' | 'export-pdf';
  /** The filename the uploaded document will carry. */
  readonly filename: string;
  /** The Content-Type of the bytes. */
  readonly contentType: string;
  /** The size limit that applies to these bytes. */
  readonly maxBytes: number;
}

export type DocumentImportDecision =
  | DocumentImportPlan
  | { readonly refused: string };

/**
 * The plan for turning an imported item into a document, or a refusal.
 *
 * GOOGLE DOCS ARE EXPORTED AS PDF and take the `.pdf` name; everything else is
 * downloaded as it is. The size limit follows the CONTENT TYPE the document
 * will actually have (a Google Doc exported as PDF is bounded as a PDF).
 */
export function documentImportPlan(
  provider: ImportProvider,
  item: Pick<ImportBrowserItem, 'name' | 'mimeType'>,
): DocumentImportDecision {
  void provider;
  const mimeType = item.mimeType;

  if (mimeType === GOOGLE_DOC_MIME_TYPE) {
    return {
      kind: 'export-pdf',
      filename: `${item.name}.pdf`,
      contentType: 'application/pdf',
      maxBytes: UPLOAD_LIMITS.knowledgePdf,
    };
  }

  if (!DOWNLOADABLE_MIME_TYPES.has(mimeType)) {
    return { refused: DOCUMENT_IMPORT_REFUSAL };
  }

  const maxBytes = mimeType === 'application/pdf'
    ? UPLOAD_LIMITS.knowledgePdf
    : UPLOAD_LIMITS.knowledgeText;

  return { kind: 'download', filename: item.name, contentType: mimeType, maxBytes };
}

/** Narrowing helper: is this decision a refusal? */
export function isRefusedPlan(
  decision: DocumentImportDecision,
): decision is { readonly refused: string } {
  return 'refused' in decision;
}
