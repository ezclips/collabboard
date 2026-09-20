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
  canonicalizeDecodedKnowledgeText,
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

/**
 * The result of turning a source into text, when that took a step.
 *
 * EXTRACTION COMES BEFORE CANONICALISATION, and this is what carries it.
 * A `.txt` or `.md` needs no extraction -- the bytes ARE the text -- so this is
 * absent for them and Stage 1's path is unchanged bit for bit. A `.docx` is a
 * ZIP and never survives the strict UTF-8 decode, so it arrives here already
 * turned into text by the adapter that knows how.
 */
export interface KnowledgeSourceExtraction {
  readonly text: string;
  readonly parserName: string;
  readonly parserVersion: string;
  /** Content that carried no text, so the upload can disclose it. */
  readonly imageCount: number;
  readonly footnoteCount: number;
}

export interface KnowledgeTextCandidate {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  /** Absent means identity: this file's bytes are already its text. */
  readonly extraction?: KnowledgeSourceExtraction;
}

export interface ValidatedKnowledgeTextSource {
  readonly originalFilename: string;
  /** The declared type, kept for the record. May be blank or wrong; unused. */
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  /** The one string offsets, the hash and chunks are all computed against. */
  readonly canonicalText: string;
  readonly chunks: readonly KnowledgeTextChunkDraft[];
  /** Absent for a source whose bytes were already its text. */
  readonly extraction?: KnowledgeSourceExtraction;
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

  // A candidate that arrives WITH an extraction was routed by the step that
  // produced it; re-checking the text rules here would refuse every .docx.
  if (
    candidate.extraction === undefined
    && !isKnowledgeTextCandidate({ filename: originalFilename, mimeType: candidate.mimeType })
  ) {
    return err(domainError('validation', 'That file type cannot be added to Knowledge', {
      details: { mimeType: candidate.mimeType, filename: originalFilename },
    }));
  }

  if (candidate.bytes.byteLength === 0) {
    return err(domainError('validation', 'The selected file is empty'));
  }

  const canonical = candidate.extraction === undefined
    ? canonicalizeKnowledgeText(candidate.bytes)
    : canonicalizeDecodedKnowledgeText(candidate.extraction.text);
  if (!canonical.ok) {
    // The refusal's own sentence, not a paraphrase: it names what to do next.
    return err(domainError('validation', canonical.message, {
      details: { reason: canonical.reason },
    }));
  }

  // A DOCUMENT THAT EXTRACTED TO NOTHING IS REFUSED, and a blank .txt is not.
  //
  // The two look alike and are not. A blank text file is transparently blank:
  // the person who chose it can open it and see that. A Word document full of
  // screenshots looks like a document full of content, extracts to nothing,
  // and would sit in the library claiming to be indexed. Refusing it is the
  // only answer that tells the truth at the moment the user can still act.
  //
  // NO THRESHOLD, deliberately: a two-line document is a legitimate document,
  // and any "too little" number would refuse real sources to catch this one.
  // The test is nothing at all, not nearly nothing.
  if (candidate.extraction !== undefined && canonical.text.trim().length === 0) {
    return err(domainError(
      'validation',
      candidate.extraction.imageCount > 0
        // Named rather than generic: this is the common case, and the person
        // needs to know it is the pictures, not a broken file.
        ? 'No text could be read from this document. Text inside images is not read.'
        : 'No text could be read from this document',
      { details: { imageCount: candidate.extraction.imageCount } },
    ));
  }

  return ok({
    originalFilename,
    mimeType: candidate.mimeType,
    fileSizeBytes: candidate.bytes.byteLength,
    canonicalText: canonical.text,
    chunks: buildKnowledgeTextChunks(canonical.text),
    extraction: candidate.extraction,
  });
}
