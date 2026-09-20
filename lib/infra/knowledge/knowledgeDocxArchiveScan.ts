/**
 * The bounded read of an uploaded .docx container.
 *
 * WHY THIS EXISTS, AND WHAT IT REPLACES. The previous preflight trusted the
 * archive: it summed the uncompressed sizes the central directory DECLARES and
 * refused anything whose declared total was too large. That number lives inside
 * a file the uploader wrote, so a hostile archive simply lies about it -- and
 * the old preflight then read `word/document.xml` in full, IN THE REQUEST
 * PROCESS, to look for revision marks. That read was the real exposure, and it
 * ran before the extraction worker was ever created, so the isolation
 * downstream of it protected nothing at all.
 *
 * MEASURED on the committed `zipbomb.docx` fixture, same machine, same Node:
 *
 *   old preflight read   879 ms   peak RSS 482 MB   (jszip eventually threw)
 *   bounded scan below    86 ms   peak RSS  75 MB   (refused by our ceiling)
 *
 * Note what stopped the old one: jszip's own "uncompressed data size mismatch",
 * which fires only because this fixture LIES about its size. An archive that
 * declares its expansion truthfully inflates in full without complaint. That is
 * not a limit, it is a coincidence -- and the same coincidence is why the
 * extraction worker appeared to stop the bomb when it did not.
 *
 * WHAT THIS DOES INSTEAD. Every entry is inflated as a STREAM and the bytes are
 * counted as they arrive, per entry and across the archive. Crossing a ceiling
 * stops the stream mid-entry, so the process never holds the full expansion of
 * a hostile file.
 *
 * WHAT THE LIMIT IS, EXACTLY. It is a REJECTION THRESHOLD, not a guaranteed
 * maximum allocation. Counting stops the moment the threshold is crossed and
 * `pause()` stops the inflater, but chunks already queued still arrive, so some
 * bytes land past the threshold. On `zipbomb.docx` that overshoot was OBSERVED
 * at ~3.6 MB. That figure is one measurement of one fixture on one machine --
 * it is not a bound, and nothing here should be read as promising a ceiling on
 * bytes allocated. What is guaranteed is that crossing the threshold ends the
 * scan and refuses the document, instead of inflating to completion.
 *
 * WHAT A REJECTION MEANS DOWNSTREAM, stated explicitly because the ordering is
 * the protection:
 *
 *   - `extractKnowledgeDocxText` calls this scan BEFORE `convertInWorker` and
 *     returns on failure, so a refusal means mammoth never runs and no worker
 *     is ever created.
 *   - The scan ends at the refusal: the stream is paused and the loop returns,
 *     so no further entry is inflated.
 *   - There is consequently nothing to terminate. `terminate()` still exists on
 *     the worker path, covering documents that PASS this scan and then behave
 *     badly inside mammoth.
 *
 * WHY MAMMOTH CANNOT SLIP PAST THIS. It is handed the same bytes this scan
 * read -- one uploaded buffer, no second source -- and this scan counts EVERY
 * non-directory entry in the archive, not merely `word/document.xml`. So there
 * is no entry mammoth can decompress that was not measured first. The scan
 * bounds what the archive expands to; it does not bound what mammoth then does
 * with a document that passed, which is what the worker is for.
 *
 * VERIFIED, not assumed: jszip 3.10.1 enforces no entry count, no entry size
 * and no total size of its own, and mammoth 1.12.3 adds none. Every bound here
 * is ours. What jszip DOES provide is `internalStream`, which delivers inflated
 * output in chunks -- that is the hook that makes a limit during decompression
 * possible at all, and it is why this module uses the library rather than
 * hand-rolling a ZIP reader.
 */
import JSZip from 'jszip';

import { domainError, type DomainError } from '@/lib/domain/core/errors';
import { err, ok, type Result } from '@/lib/domain/core/result';

/**
 * CEILINGS ON REAL, MEASURED OUTPUT.
 *
 * Sized against what they feed rather than picked round: extraction refuses any
 * document yielding more than 4M characters of text, and a `word/document.xml`
 * above 32 MB cannot produce less than that without being almost entirely
 * markup. The archive total leaves room for a document's media, which is
 * already-compressed data that inflates roughly one-to-one and so is bounded by
 * the upload ceiling anyway.
 */
export const KNOWLEDGE_DOCX_MAX_INFLATED_ENTRY_BYTES = 32 * 1024 * 1024;
export const KNOWLEDGE_DOCX_MAX_INFLATED_TOTAL_BYTES = 64 * 1024 * 1024;

/** Entry-count and declared-size ceilings. Cheap, and checked before any inflation. */
export const KNOWLEDGE_DOCX_MAX_ENTRIES = 512;
export const KNOWLEDGE_DOCX_MAX_DECLARED_BYTES = 200 * 1024 * 1024;

/** The main document part. Absent, the file is not a .docx whatever it is named. */
const MAIN_PART = 'word/document.xml';

/**
 * How much of the previous chunk is re-examined with the next one.
 *
 * The revision-mark scan runs over a stream, so a match can straddle a chunk
 * boundary. Carrying the last few bytes forward costs nothing and is the
 * difference between a correct scan and one that silently misses an insertion
 * that happened to land on the seam.
 */
const SEAM_BYTES = 16;

/** A revision mark is an ELEMENT: `w:instrText` starts with `w:ins` and is a field code. */
const REVISION_MARK = /<w:(?:ins|del)[ >]/;

export interface KnowledgeDocxArchiveScan {
  /**
   * Whether the source carried tracked changes.
   *
   * Detected in the ARCHIVE, not in the parser's HTML: by the time mammoth has
   * produced markup the revisions are already applied, so the source XML is the
   * only place the fact still exists. Carried so the accepted-changes policy
   * can be disclosed rather than silently applied.
   */
  readonly hasTrackedChanges: boolean;
  /** Bytes actually inflated -- measured, not declared. */
  readonly inflatedBytes: number;
  readonly entryCount: number;
  readonly largestEntryBytes: number;
}

export async function scanKnowledgeDocxArchive(
  bytes: Uint8Array,
): Promise<Result<KnowledgeDocxArchiveScan, DomainError>> {
  let zip: JSZip;
  try {
    // Reads the central directory only; nothing is inflated here.
    zip = await JSZip.loadAsync(Buffer.from(bytes));
  } catch {
    return err(domainError('validation', 'This file could not be read as a Word document'));
  }

  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  if (names.length > KNOWLEDGE_DOCX_MAX_ENTRIES) {
    return err(domainError('validation', 'This document has too many parts to read'));
  }
  if (!zip.file(MAIN_PART)) {
    return err(domainError('validation', 'This file could not be read as a Word document'));
  }

  // SUPPLEMENTARY, and kept for exactly that reason: an honest archive that is
  // simply enormous is refused here without inflating a single byte. It is not
  // trusted to stop a dishonest one -- the streaming ceilings below do that.
  let declared = 0;
  for (const name of names) {
    const entry = zip.files[name] as unknown as { _data?: { uncompressedSize?: number } };
    const size = entry._data?.uncompressedSize;
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) declared += size;
    if (declared > KNOWLEDGE_DOCX_MAX_DECLARED_BYTES) {
      return err(domainError('validation', 'This document is too large to read'));
    }
  }

  let total = 0;
  let largest = 0;
  let hasTrackedChanges = false;

  for (const name of names) {
    const scan = await inflateEntryBounded(
      zip.files[name],
      Math.min(
        KNOWLEDGE_DOCX_MAX_INFLATED_ENTRY_BYTES,
        KNOWLEDGE_DOCX_MAX_INFLATED_TOTAL_BYTES - total,
      ),
      name === MAIN_PART,
    );
    if (!scan.ok) return err(scan.error);
    total += scan.value.bytes;
    largest = Math.max(largest, scan.value.bytes);
    if (scan.value.matched) hasTrackedChanges = true;
  }

  return ok({
    hasTrackedChanges,
    inflatedBytes: total,
    entryCount: names.length,
    largestEntryBytes: largest,
  });
}

interface KnowledgeDocxEntryScan {
  readonly bytes: number;
  readonly matched: boolean;
}

/**
 * jszip's chunked-inflation surface, declared here because its own typings omit
 * it.
 *
 * `internalStream` is a real, documented-by-source part of jszip 3.10.1 --
 * `async()` is implemented on top of it -- but `@types` does not expose it, so
 * using it needs a shape written out rather than an `any` that would hide a
 * change in the library. jszip is pinned, and the streaming tests fail loudly
 * if a future version stops emitting chunks, which is the guard that matters:
 * a version that buffered internally would silently restore the unbounded
 * behaviour this module exists to remove.
 */
interface KnowledgeDocxChunkStream {
  on(event: 'data', handler: (chunk: Uint8Array) => void): KnowledgeDocxChunkStream;
  on(event: 'error', handler: (cause: unknown) => void): KnowledgeDocxChunkStream;
  on(event: 'end', handler: () => void): KnowledgeDocxChunkStream;
  resume(): KnowledgeDocxChunkStream;
  pause(): KnowledgeDocxChunkStream;
}

interface KnowledgeDocxStreamableEntry {
  internalStream(type: 'uint8array'): KnowledgeDocxChunkStream;
}

/** Throws rather than degrading: an entry we cannot stream is one we cannot bound. */
function streamableEntry(entry: JSZip.JSZipObject): KnowledgeDocxStreamableEntry {
  const candidate = entry as unknown as Partial<KnowledgeDocxStreamableEntry>;
  if (typeof candidate.internalStream !== 'function') {
    throw new TypeError('jszip entry does not support chunked inflation');
  }
  return candidate as KnowledgeDocxStreamableEntry;
}

/**
 * Inflate one entry, counting output as it arrives and stopping when it is too
 * much.
 *
 * THE POINT IS WHAT IS NOT HELD. Chunks are counted and discarded rather than
 * concatenated, so the peak cost of reading an entry is one chunk and not the
 * entry -- which is what lets a 335 MB expansion be refused having inflated
 * 32 MB. The revision scan likewise tests each chunk and keeps only a seam,
 * never the document.
 */
async function inflateEntryBounded(
  entry: JSZip.JSZipObject,
  limit: number,
  scanForRevisions: boolean,
): Promise<Result<KnowledgeDocxEntryScan, DomainError>> {
  return new Promise((resolve) => {
    let bytes = 0;
    let matched = false;
    let seam = '';
    let settled = false;

    const stream = streamableEntry(entry).internalStream('uint8array');

    const finish = (result: Result<KnowledgeDocxEntryScan, DomainError>) => {
      if (settled) return;
      settled = true;
      // Stop pulling. Without this the inflater keeps running after a refusal,
      // which is the very failure mode a post-hoc check has.
      try {
        stream.pause();
      } catch {
        // Already finished; there is nothing left to stop.
      }
      resolve(result);
    };

    stream.on('data', (chunk: Uint8Array) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > limit) {
        finish(err(domainError('validation', 'This document is too large to read')));
        return;
      }
      if (scanForRevisions && !matched) {
        // latin1 rather than utf-8 deliberately: the markers are ASCII, and a
        // byte-preserving decode cannot mangle a marker split across a chunk
        // boundary the way a partial multi-byte sequence would.
        const text = seam + Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length).toString('latin1');
        if (REVISION_MARK.test(text)) matched = true;
        else seam = text.slice(-SEAM_BYTES);
      }
    });

    // A part that cannot be inflated will fail in mammoth a moment later with a
    // message written for the person who uploaded it. Not knowing whether there
    // were revisions is not itself a reason to refuse the document.
    stream.on('error', () => {
      finish(ok({ bytes, matched }));
    });
    stream.on('end', () => {
      finish(ok({ bytes, matched }));
    });
    stream.resume();
  });
}
