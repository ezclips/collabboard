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

import { domainError, type DomainError } from '@/lib/domain/core/errors';
import { err, ok, type Result } from '@/lib/domain/core/result';
import {
  KNOWLEDGE_DOCX_CONTRACT_V1,
  KNOWLEDGE_DOCX_EXTRACTOR_NAME,
  KNOWLEDGE_DOCX_EXTRACTOR_VERSION,
} from '@/lib/domain/knowledge/knowledgeExtractionContract';
import { knowledgeDocxHtmlToText } from '@/lib/domain/knowledge/knowledgeDocxHtmlText';
import { scanKnowledgeDocxArchive } from './knowledgeDocxArchiveScan';

export {
  KNOWLEDGE_DOCX_MAX_DECLARED_BYTES,
  KNOWLEDGE_DOCX_MAX_ENTRIES,
  KNOWLEDGE_DOCX_MAX_INFLATED_ENTRY_BYTES,
  KNOWLEDGE_DOCX_MAX_INFLATED_TOTAL_BYTES,
} from './knowledgeDocxArchiveScan';

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
 * The heap the extraction worker is allowed.
 *
 * WHAT THIS IS AND IS NOT, corrected after measurement. An earlier version of
 * this comment claimed the worker's heap ceiling is what stops a decompression
 * bomb. It is not, and the committed fixture proves it: running `zipbomb.docx`
 * through this worker returns a normal failure MESSAGE -- jszip's own
 * "uncompressed data size mismatch" -- in ~755 ms, having taken the process to
 * ~402 MB RSS. The heap ceiling never fired. Per Node's documentation
 * `resourceLimits` bounds the JS engine only: external ArrayBuffer allocations
 * and process-wide exhaustion are outside it.
 *
 * So this is defence in depth, not the bound. It is kept because `terminate()`
 * is real -- it stops work a promise race would merely stop waiting for -- and
 * because a parser fault is contained off the request thread. The enforceable
 * bound on memory lives in `knowledgeDocxArchiveScan`, which counts inflated
 * bytes as they are produced and refuses mid-stream.
 */
export const KNOWLEDGE_DOCX_MAX_HEAP_MB = 256;

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
  /**
   * Bytes the archive actually inflated to, measured during the bounded scan.
   *
   * Carried so the measured record is taken from the real pipeline rather than
   * from a probe written alongside it.
   */
  readonly inflatedBytes: number;
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

  // Bounded, streaming, and BEFORE the parser. This both MEASURES what the
  // archive really expands to and refuses it mid-inflation when that is too
  // much, so mammoth below is handed a container whose expansion is a measured
  // fact rather than a number the uploader wrote.
  const scanned = await scanKnowledgeDocxArchive(bytes);
  if (!scanned.ok) return err(scanned.error);

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
    hasTrackedChanges: scanned.value.hasTrackedChanges,
    inflatedBytes: scanned.value.inflatedBytes,
    parserName: KNOWLEDGE_DOCX_EXTRACTOR_NAME,
    parserVersion: KNOWLEDGE_DOCX_EXTRACTOR_VERSION,
    elapsedMs: Date.now() - started,
  });
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
 * THE DIFFERENCE FROM A DEADLINE, which is why the worker is here: a promise
 * race rejects and leaves the work running, because mammoth offers no
 * cancellation. Terminating the thread stops it. That is what this buys, and
 * the claim stops there -- the heap ceiling is a second line that measurement
 * showed does not fire on the bomb fixture, and the bound on decompression is
 * enforced before this function is ever reached.
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
