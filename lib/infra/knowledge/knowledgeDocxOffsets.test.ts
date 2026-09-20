// @vitest-environment node
//
// THE OFFSETS INSTRUMENT, on the DOCX path -- and shown able to go RED.
//
// Every citation into a pageless source is a pair of UTF-16 offsets into the
// canonical text. assertLosslessChunking is what stands between a source and a
// corpus of citations that each land a little way from what they quote, and an
// instrument that has only ever been seen passing is not evidence of anything.
// So each check below is run twice: once on the real extraction, and once on a
// deliberately broken copy that it must reject.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractKnowledgeDocxText } from './knowledgeDocxExtractionAdapter';
import { canonicalizeDecodedKnowledgeText } from '@/lib/domain/knowledge/knowledgeTextCanonical';
import {
  assertLosslessChunking,
  buildKnowledgeTextChunks,
  type KnowledgeTextChunkDraft,
} from '@/lib/domain/knowledge/knowledgeTextChunking';

const FIXTURES = path.join(process.cwd(), 'lib/infra/knowledge/fixtures/docx');
const FIXTURE_NAMES = [
  'structured.docx', 'revisions.docx', 'breaks.docx', 'image.docx', 'long.docx',
] as const;

/** The one fixture long enough to produce more than a single chunk. */
const MULTI_CHUNK = 'long.docx';

async function pipeline(name: string) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));
  const extracted = await extractKnowledgeDocxText(bytes);
  if (!extracted.ok) throw new Error(`extraction failed: ${extracted.error.message}`);
  const canonical = canonicalizeDecodedKnowledgeText(extracted.value.text);
  if (!canonical.ok) throw new Error(`canonicalisation failed: ${canonical.reason}`);
  return { text: canonical.text, chunks: buildKnowledgeTextChunks(canonical.text), extracted: extracted.value };
}

describe('the offsets instrument is GREEN on every DOCX fixture', () => {
  it.each(FIXTURE_NAMES)('%s chunks losslessly', async (name) => {
    const { text, chunks } = await pipeline(name);
    expect(assertLosslessChunking(text, chunks)).toBeNull();
  });

  it.each(FIXTURE_NAMES)('%s: every chunk is exactly its own slice', async (name) => {
    // The property the whole feature rests on: chunk.text === text.slice(a, b).
    // Anything else means a citation highlights something other than what the
    // search matched.
    const { text, chunks } = await pipeline(name);
    for (const chunk of chunks) {
      expect(chunk.text).toBe(text.slice(chunk.charStart, chunk.charEnd));
    }
  });
});

describe('the offsets instrument GOES RED when it should', () => {
  // Without these, "the invariant held" says nothing: an assertion that cannot
  // fail is indistinguishable from one that is never evaluated.

  it('rejects a chunk whose text no longer matches its range', async () => {
    const { text, chunks } = await pipeline('structured.docx');
    expect(chunks.length).toBeGreaterThan(0);
    const tampered: KnowledgeTextChunkDraft[] = chunks.map((chunk, i) =>
      (i === 0 ? { ...chunk, text: `${chunk.text}x` } : chunk));
    expect(assertLosslessChunking(text, tampered)).not.toBeNull();
  });

  it('rejects a gap between two chunks', async () => {
    const { text, chunks } = await pipeline(MULTI_CHUNK);
    expect(chunks.length).toBeGreaterThan(1);
    // Shorten the first chunk's range: the text it covers is now unreachable.
    const gapped = chunks.map((chunk, i) => (i === 0
      ? { ...chunk, charEnd: chunk.charEnd - 1, text: chunk.text.slice(0, -1) }
      : chunk));
    expect(assertLosslessChunking(text, gapped)).not.toBeNull();
  });

  it('rejects chunks that do not cover the whole text', async () => {
    const { text, chunks } = await pipeline(MULTI_CHUNK);
    expect(assertLosslessChunking(text, chunks.slice(0, -1))).not.toBeNull();
  });

  it('rejects an overlap', async () => {
    const { text, chunks } = await pipeline(MULTI_CHUNK);
    expect(chunks.length).toBeGreaterThan(1);
    const overlapped = chunks.map((chunk, i) => (i === 1
      ? { ...chunk, charStart: chunk.charStart - 1, text: text.slice(chunk.charStart - 1, chunk.charEnd) }
      : chunk));
    expect(assertLosslessChunking(text, overlapped)).not.toBeNull();
  });
});

describe('extraction cost, measured', () => {
  it('reports elapsed time per fixture', async () => {
    // Recorded rather than asserted against a threshold: these fixtures are
    // small, and a number from them is evidence about THEM. The acceptance
    // still owes a measurement on a real, large Word document.
    const rows: string[] = [];
    for (const name of FIXTURE_NAMES) {
      const { extracted, text, chunks } = await pipeline(name);
      rows.push(
        `${name}: ${extracted.elapsedMs}ms, ${text.length} code units, ${chunks.length} chunks`,
      );
      expect(extracted.elapsedMs).toBeLessThan(5_000);
    }
    // eslint-disable-next-line no-console
    console.log('DOCX extraction cost:\n  ' + rows.join('\n  '));
  });
});
