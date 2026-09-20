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
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import JSZip from 'jszip';

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

/**
 * The heap the extraction worker is allowed, enforced by V8 from inside it.
 *
 * This is the bound the post-decompression ceilings could not provide: they
 * run after the memory has already been allocated. Generous for a document a
 * person wrote, and small enough that a decompression bomb hits it long before
 * it reaches the server's own limit.
 */
export const KNOWLEDGE_DOCX_MAX_HEAP_MB = 256;

/**
 * VERIFIED, not assumed: neither library enforces anything.
 *
 * jszip 3.10.1 has no entry cap and no size cap, and mammoth 1.12.3 adds none
 * of its own. So every bound below is ours, and the ones that can be checked
 * BEFORE decompressing are checked before decompressing.
 */
export const KNOWLEDGE_DOCX_MAX_ENTRIES = 512;
export const KNOWLEDGE_DOCX_MAX_DECLARED_BYTES = 200 * 1024 * 1024;
export const KNOWLEDGE_DOCX_MAX_TEXT_CHARS = 4 * 1024 * 1024;

export interface KnowledgeDocxExtraction {
  readonly text: string;
  readonly imageCount: number;
  readonly footnoteCount: number;
  /**
   * Whether the source carried tracked changes.
   *
   * Detected in the ARCHIVE, not in the HTML: by the time mammoth has produced
   * markup the revisions are already applied, so the only place the fact still
   * exists is the source XML. Carried so the accepted-changes policy can be
   * disclosed rather than silently applied.
   */
  readonly hasTrackedChanges: boolean;
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

  const preflight = await inspectKnowledgeDocxArchive(bytes);
  if (!preflight.ok) return err(preflight.error);

  const converted = await convertInWorker(bytes);
  if (!converted.ok) return err(converted.error);
  const { html, imageCount } = converted.value;

  if (html.length > KNOWLEDGE_DOCX_MAX_HTML_CHARS) {
    return err(domainError('validation', 'This document is too complex to read'));
  }

  const walked = knowledgeDocxHtmlToText(html, KNOWLEDGE_DOCX_CONTRACT_V1);

  // The LAST bound, on what actually gets stored. The HTML ceiling above is a
  // bound on the parser's output; this one is a bound on the text whose every
  // offset the rest of the feature will carry.
  if (walked.text.length > KNOWLEDGE_DOCX_MAX_TEXT_CHARS) {
    return err(domainError('validation', 'This document contains too much text to index'));
  }

  return ok({
    text: walked.text,
    // mammoth's own count is authoritative over the walker's: an image the
    // converter saw but the walker never reached is still an image whose
    // content is missing from the text.
    imageCount: Math.max(imageCount, walked.imageCount),
    footnoteCount: walked.footnoteCount,
    hasTrackedChanges: preflight.value.hasTrackedChanges,
    parserName: KNOWLEDGE_DOCX_EXTRACTOR_NAME,
    parserVersion: KNOWLEDGE_DOCX_EXTRACTOR_VERSION,
    elapsedMs: Date.now() - started,
  });
}

/**
 * The pre-decompression look at the archive.
 *
 * A .docx is a ZIP, so the uploaded size bounds nothing about what it expands
 * to. The central directory declares each entry's uncompressed size, and jszip
 * exposes it without inflating anything -- so the cheap checks happen here,
 * before a single entry is decompressed.
 *
 * WHAT THIS DOES NOT DO, said plainly: the declared size is a number inside a
 * file the uploader wrote, so a hostile archive can lie about it. This stops
 * the accidental case and the naive malicious one at no cost. The bounds that
 * do not trust the file are the ones AFTER decompression -- the HTML ceiling,
 * the extracted-text ceiling and the deadline -- and they are why those still
 * exist rather than being replaced by this.
 */
interface KnowledgeDocxArchiveFacts {
  readonly hasTrackedChanges: boolean;
}

async function inspectKnowledgeDocxArchive(
  bytes: Uint8Array,
): Promise<Result<KnowledgeDocxArchiveFacts, DomainError>> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(Buffer.from(bytes));
  } catch {
    return err(domainError('validation', 'This file could not be read as a Word document'));
  }

  const names = Object.keys(zip.files);
  if (names.length > KNOWLEDGE_DOCX_MAX_ENTRIES) {
    return err(domainError('validation', 'This document has too many parts to read'));
  }

  // A .docx without a main document part is not a .docx, whatever it is named.
  const main = zip.file('word/document.xml');
  if (!main) {
    return err(domainError('validation', 'This file could not be read as a Word document'));
  }

  let declared = 0;
  for (const name of names) {
    const entry = zip.files[name] as unknown as { _data?: { uncompressedSize?: number } };
    const size = entry._data?.uncompressedSize;
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) declared += size;
    if (declared > KNOWLEDGE_DOCX_MAX_DECLARED_BYTES) {
      return err(domainError('validation', 'This document is too large to read'));
    }
  }

  // Read once, here, while the part is already in hand. A revision mark is a
  // w:ins or w:del ELEMENT, so the check is for the element's opening
  // delimiter rather than a bare substring -- "w:instrText" begins with
  // "w:ins" and is a field code, not an insertion.
  let hasTrackedChanges = false;
  try {
    const xml = await main.async('string');
    hasTrackedChanges = /<w:(?:ins|del)[ >]/.test(xml);
  } catch {
    // A body that cannot be read here will fail in mammoth a moment later with
    // a better message. Not knowing whether there were revisions is not a
    // reason to refuse the document.
    hasTrackedChanges = false;
  }

  return ok({ hasTrackedChanges });
}

/** Where the worker lives, resolved from the repository root at runtime. */
export const KNOWLEDGE_DOCX_WORKER_PATH = 'lib/infra/knowledge/knowledgeDocxWorker.cjs';

interface KnowledgeDocxConversion {
  readonly html: string;
  readonly imageCount: number;
}

/**
 * Decompress and parse in a worker with enforced limits.
 *
 * THE DIFFERENCE FROM A DEADLINE, which is the whole point: a promise race
 * rejects and leaves the work running. Terminating the thread stops it, and
 * resourceLimits has V8 enforce the heap ceiling from inside -- so a
 * decompression bomb fails WHILE it inflates rather than after, which is the
 * one thing a post-decompression check can never do.
 *
 * Failures are deliberately indistinguishable to the caller: a corrupt
 * container, an encrypted document, a heap ceiling and a kill all mean the
 * same thing to the person who uploaded it. The exception is the deadline,
 * which tells them the document was too big rather than broken.
 */
async function convertInWorker(
  bytes: Uint8Array,
): Promise<Result<KnowledgeDocxConversion, DomainError>> {
  // Copied so the worker owns its buffer: the request's bytes are still held
  // by the caller, and a transfer would detach them underneath it.
  const copy = new Uint8Array(bytes);

  return new Promise<Result<KnowledgeDocxConversion, DomainError>>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(path.join(process.cwd(), KNOWLEDGE_DOCX_WORKER_PATH), {
        workerData: { bytes: copy },
        transferList: [copy.buffer],
        resourceLimits: {
          maxOldGenerationSizeMb: KNOWLEDGE_DOCX_MAX_HEAP_MB,
          maxYoungGenerationSizeMb: 32,
        },
      });
    } catch {
      return resolve(err(domainError('unavailable', 'Upload is temporarily unavailable')));
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (result: Result<KnowledgeDocxConversion, DomainError>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Always terminate. A worker that answered still has to be reaped, and
      // one that failed may still be running.
      void worker.terminate();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish(err(domainError('validation', 'This document took too long to read')));
    }, KNOWLEDGE_DOCX_TIMEOUT_MS);

    worker.on('message', (message: { ok: boolean; value?: KnowledgeDocxConversion }) => {
      finish(message.ok && message.value
        ? ok(message.value)
        : err(domainError('validation', 'This file could not be read as a Word document')));
    });

    // Covers the heap ceiling (ERR_WORKER_OUT_OF_MEMORY) and a worker that
    // could not start at all -- a deployment that did not carry the file.
    worker.on('error', () => {
      finish(err(domainError('validation', 'This file could not be read as a Word document')));
    });

    // Only reached when the worker ended without answering; a normal answer
    // has already settled by the time this fires.
    worker.on('exit', () => {
      finish(err(domainError('validation', 'This file could not be read as a Word document')));
    });
  });
}
