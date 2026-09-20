/**
 * The bounded archive scan, tested for the property that matters: that the
 * limit acts DURING decompression rather than after it.
 *
 * A test that only checks the return value cannot tell the two apart -- an
 * unbounded read that inflates 335 MB and then refuses returns exactly what a
 * bounded one returns. So these measure time and memory as well, and the
 * bomb-stopping test is paired with a mutation note saying how it goes red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_DOCX_MAX_INFLATED_ENTRY_BYTES,
  KNOWLEDGE_DOCX_MAX_INFLATED_TOTAL_BYTES,
  scanKnowledgeDocxArchive,
} from './knowledgeDocxArchiveScan';

const FIXTURES = path.join(process.cwd(), 'lib/infra/knowledge/fixtures/docx');
const read = (name: string) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));

describe('the bounded .docx archive scan', () => {
  it('reports what an ordinary document really inflates to', async () => {
    const result = await scanKnowledgeDocxArchive(read('structured.docx'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Measured, not declared. The exact figure is not pinned -- regenerating
    // the fixture would move it -- but the RELATIONSHIPS are what the bounds
    // rest on, and those must hold.
    expect(result.value.inflatedBytes).toBeGreaterThan(0);
    expect(result.value.entryCount).toBeGreaterThan(0);
    expect(result.value.largestEntryBytes).toBeLessThanOrEqual(result.value.inflatedBytes);
    expect(result.value.inflatedBytes).toBeLessThan(KNOWLEDGE_DOCX_MAX_INFLATED_TOTAL_BYTES);
    expect(result.value.largestEntryBytes).toBeLessThan(KNOWLEDGE_DOCX_MAX_INFLATED_ENTRY_BYTES);
  });

  it('refuses a lying archive while inflating it, in bounded time and memory', async () => {
    // GOES RED BY: raising KNOWLEDGE_DOCX_MAX_INFLATED_ENTRY_BYTES above the
    // fixture's real expansion. The scan then inflates all 335 MB, and both the
    // duration and the growth assertions fail. Verified by doing it.
    const before = process.memoryUsage().rss;
    const started = Date.now();
    const result = await scanKnowledgeDocxArchive(read('zipbomb.docx'));
    const elapsed = Date.now() - started;
    const growthMb = (process.memoryUsage().rss - before) / (1024 * 1024);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('This document is too large to read');

    // Unbounded, this same read took 879 ms and 482 MB peak RSS. The thresholds
    // are loose enough not to flake on a busy machine and far below that.
    expect(elapsed).toBeLessThan(5_000);
    expect(growthMb).toBeLessThan(200);
  }, 60_000);

  it('finds revision marks by streaming, without holding the document', async () => {
    // The tracked-changes fact is the reason the old code read document.xml in
    // full. It is now read as a stream and discarded chunk by chunk, and the
    // answer must not have changed.
    const revised = await scanKnowledgeDocxArchive(read('revisions.docx'));
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.value.hasTrackedChanges).toBe(true);
  });

  it('does not report revisions in a document that has none', async () => {
    // The negative control. A detector that always fires detects nothing.
    const plain = await scanKnowledgeDocxArchive(read('structured.docx'));
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    expect(plain.value.hasTrackedChanges).toBe(false);
  });

  it('is not fooled by w:instrText, which begins with the same five characters', async () => {
    // `w:instrText` is a field code, not an insertion. The scan matches the
    // element delimiter for exactly this reason, and a substring check here
    // would report tracked changes on a document with a page number in it.
    const plain = await scanKnowledgeDocxArchive(read('long.docx'));
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    expect(plain.value.hasTrackedChanges).toBe(false);
  });

  it('refuses bytes that are not a ZIP at all', async () => {
    const result = await scanKnowledgeDocxArchive(new TextEncoder().encode('not a docx'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('This file could not be read as a Word document');
  });

  it('accepts every committed fixture that is meant to be readable', async () => {
    // The bounds must not refuse ordinary documents. A limit nobody can pass is
    // indistinguishable from a broken feature.
    for (const name of ['structured.docx', 'revisions.docx', 'breaks.docx', 'image.docx', 'long.docx']) {
      const result = await scanKnowledgeDocxArchive(read(name));
      expect(result.ok, name).toBe(true);
    }
  }, 60_000);
});
