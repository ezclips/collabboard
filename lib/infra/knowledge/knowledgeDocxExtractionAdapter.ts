/**
 * DOCX -> text, the one place mammoth is called.
 *
 * Infra rather than domain because this reads a ZIP container and runs a
 * third-party parser over bytes someone uploaded. The RULES for what the text
 * becomes live in the domain contract; this module supplies the tree and
 * enforces the limits.
 *
 * IMAGES ARE SUPPRESSED, NOT RENDERED. mammoth's default converts every image
 * to a base64 data URI inside the HTML. For an image-heavy document that is
 * megabytes of markup built in memory to be thrown away one step later, and it
 * is the difference between a bounded extraction and an unbounded one. The
 * converter here emits an empty `src` and counts the image instead, which is
 * also what makes the disclosure downstream possible.
 */
import mammoth from 'mammoth';

import { domainError, type DomainError } from '@/lib/domain/core/errors';
import { err, ok, type Result } from '@/lib/domain/core/result';
import {
  KNOWLEDGE_DOCX_CONTRACT_V1,
  KNOWLEDGE_DOCX_EXTRACTOR_NAME,
  KNOWLEDGE_DOCX_EXTRACTOR_VERSION,
} from '@/lib/domain/knowledge/knowledgeExtractionContract';
import { knowledgeDocxHtmlToText } from '@/lib/domain/knowledge/knowledgeDocxHtmlText';

// Routing lives in the domain, so the browser can learn which files it may
// offer without pulling a ZIP parser toward the bundle.
export {
  KNOWLEDGE_DOCX_ACCEPT,
  KNOWLEDGE_DOCX_EXTENSION,
  KNOWLEDGE_DOCX_MIME_TYPE,
  isKnowledgeDocxCandidate,
} from '@/lib/domain/knowledge/knowledgeDocxSource';

/**
 * LIMITS, enforced rather than hoped for.
 *
 * A DOCX is a ZIP, so the uploaded size bounds nothing about what it expands
 * to -- a few hundred kilobytes of compressed XML can decompress to hundreds
 * of megabytes. Both numbers below are deliberately generous for a document a
 * person wrote and deliberately finite.
 */
export const KNOWLEDGE_DOCX_MAX_BYTES = 25 * 1024 * 1024;
export const KNOWLEDGE_DOCX_MAX_HTML_CHARS = 8 * 1024 * 1024;
export const KNOWLEDGE_DOCX_TIMEOUT_MS = 30_000;

export interface KnowledgeDocxExtraction {
  readonly text: string;
  readonly imageCount: number;
  readonly footnoteCount: number;
  readonly parserName: string;
  readonly parserVersion: string;
  /** How long mammoth plus the walk actually took, for the measured record. */
  readonly elapsedMs: number;
}

export async function extractKnowledgeDocxText(
  bytes: Uint8Array,
): Promise<Result<KnowledgeDocxExtraction, DomainError>> {
  if (bytes.byteLength > KNOWLEDGE_DOCX_MAX_BYTES) {
    return err(domainError('validation', 'This document is too large to read'));
  }

  const started = Date.now();
  let imageCount = 0;

  let html: string;
  try {
    const conversion = await withTimeout(
      mammoth.convertToHtml(
        { buffer: Buffer.from(bytes) },
        {
          // Counted here and dropped; see the module comment.
          convertImage: mammoth.images.imgElement(async () => {
            imageCount += 1;
            return { src: '' };
          }),
        },
      ),
      KNOWLEDGE_DOCX_TIMEOUT_MS,
    );
    html = conversion.value;
  } catch (cause) {
    // A corrupt container, an encrypted document, or the timeout. The user can
    // act on all three, and none of them should reach them as a stack trace.
    return err(domainError(
      'validation',
      cause instanceof Error && cause.message === TIMEOUT
        ? 'This document took too long to read'
        : 'This file could not be read as a Word document',
    ));
  }

  if (html.length > KNOWLEDGE_DOCX_MAX_HTML_CHARS) {
    return err(domainError('validation', 'This document is too complex to read'));
  }

  const walked = knowledgeDocxHtmlToText(html, KNOWLEDGE_DOCX_CONTRACT_V1);

  return ok({
    text: walked.text,
    // mammoth's own count is authoritative over the walker's: an image the
    // converter saw but the walker never reached is still an image whose
    // content is missing from the text.
    imageCount: Math.max(imageCount, walked.imageCount),
    footnoteCount: walked.footnoteCount,
    parserName: KNOWLEDGE_DOCX_EXTRACTOR_NAME,
    parserVersion: KNOWLEDGE_DOCX_EXTRACTOR_VERSION,
    elapsedMs: Date.now() - started,
  });
}

const TIMEOUT = 'knowledge-docx-timeout';

/**
 * A deadline around the parse.
 *
 * It bounds the WAIT, not the work -- mammoth offers no cancellation, so the
 * parse continues in the background until it finishes. That is stated because
 * it matters: the timeout protects the request, and a pathological document
 * can still occupy the process after the user has been answered.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (cause) => { clearTimeout(timer); reject(cause); },
    );
  });
}
