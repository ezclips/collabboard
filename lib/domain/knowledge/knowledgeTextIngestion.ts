// Validating a text source on the way in.
//
// A SIBLING OF validateKnowledgePdf, NOT AN EXTENSION OF IT. That function
// checks a %PDF- magic number because a PDF has one; text has no signature,
// and the only way to know whether bytes are text is to try to decode them.
// So the check IS the decode, and its result is the canonical text everything
// downstream is computed against -- which is why this returns that text rather
// than the bytes.
//
// THE EXTENSION AND THE DECLARED MIME TYPE ARE BOTH CALLER-CONTROLLED and
// neither is trusted to decide what the file IS. They decide only whether the
// user meant to upload text; canonicalizeKnowledgeText decides whether it is.
// A .txt full of JPEG bytes fails the decode, not the extension check.

import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';

import {
  canonicalizeKnowledgeText,
} from './knowledgeTextCanonical';
import { buildKnowledgeTextChunks, type KnowledgeTextChunkDraft } from './knowledgeTextChunking';

/** The document kind this module produces. Matches the schema's CHECK. */
export const KNOWLEDGE_TEXT_KIND = 'text';

/**
 * What the uploader offers and what the server accepts. Markdown is text with
 * a different extension at this stage -- see the unit doc: rendering markdown
 * moves every offset, so Stage 1's reader shows the source.
 */
export const KNOWLEDGE_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'] as const;
export const KNOWLEDGE_TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/markdown',
] as const;

/** The accept attribute for the file picker, built from the two lists above. */
export const KNOWLEDGE_TEXT_ACCEPT = [
  ...KNOWLEDGE_TEXT_MIME_TYPES,
  ...KNOWLEDGE_TEXT_EXTENSIONS,
].join(',');

export interface KnowledgeTextCandidate {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface ValidatedKnowledgeTextSource {
  readonly originalFilename: string;
  /** The declared type, kept for the record. May be blank or wrong; unused. */
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  /** The one string offsets, the hash and chunks are all computed against. */
  readonly canonicalText: string;
  readonly chunks: readonly KnowledgeTextChunkDraft[];
}

const hasTextExtension = (filename: string) =>
  KNOWLEDGE_TEXT_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));

/** Is this candidate meant for the text path at all? */
export function isKnowledgeTextCandidate(candidate: {
  readonly filename: string; readonly mimeType: string;
}): boolean {
  return hasTextExtension(candidate.filename.trim())
    || (KNOWLEDGE_TEXT_MIME_TYPES as readonly string[]).includes(candidate.mimeType);
}

/**
 * Validate, decode, and chunk in one step, because they are one decision: a
 * file is acceptable text exactly when it decodes, and the decoded form is
 * what gets stored.
 *
 * A source whose canonical text is empty or whitespace-only is ACCEPTED and
 * produces no chunks. That is the acceptance's own wording -- "refuse or index
 * nothing, never invent" -- and indexing nothing is the more honest of the two
 * for a file that is legitimately blank.
 */
export function validateKnowledgeTextSource(
  candidate: KnowledgeTextCandidate,
): Result<ValidatedKnowledgeTextSource, DomainError> {
  const originalFilename = candidate.filename.trim();
  if (originalFilename.length === 0) {
    return err(domainError('validation', 'A filename is required'));
  }

  if (!isKnowledgeTextCandidate({ filename: originalFilename, mimeType: candidate.mimeType })) {
    return err(domainError('validation', 'That file type cannot be added to Knowledge', {
      details: { mimeType: candidate.mimeType, filename: originalFilename },
    }));
  }

  if (candidate.bytes.byteLength === 0) {
    return err(domainError('validation', 'The selected file is empty'));
  }

  const canonical = canonicalizeKnowledgeText(candidate.bytes);
  if (!canonical.ok) {
    // The refusal's own sentence, not a paraphrase: it names what to do next.
    return err(domainError('validation', canonical.message, {
      details: { reason: canonical.reason },
    }));
  }

  return ok({
    originalFilename,
    mimeType: candidate.mimeType,
    fileSizeBytes: candidate.bytes.byteLength,
    canonicalText: canonical.text,
    chunks: buildKnowledgeTextChunks(canonical.text),
  });
}
