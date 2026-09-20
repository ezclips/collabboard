// @vitest-environment node
//
// DOCX extraction, against the committed fixtures.
//
// EXPECTED TEXT IS DERIVED FROM EACH DOCUMENT'S OWN XML, not from what the
// parser returns. The fixtures' source XML is in
// scripts/fixtures/make-docx-fixtures.mjs and is the authority here; a test
// written against parser output would pass no matter what the parser did.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractKnowledgeDocxText } from './knowledgeDocxExtractionAdapter';
import {
  isKnowledgeDocxCandidate,
  KNOWLEDGE_DOCX_MIME_TYPE,
} from '@/lib/domain/knowledge/knowledgeDocxSource';

const FIXTURES = path.join(process.cwd(), 'lib/infra/knowledge/fixtures/docx');
const read = (name: string) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));

async function textOf(name: string) {
  const result = await extractKnowledgeDocxText(read(name));
  if (!result.ok) throw new Error(`extraction failed: ${result.error.message}`);
  return result.value;
}

describe('the DOCX candidate rule', () => {
  it('routes on extension or media type, and nothing else', () => {
    expect(isKnowledgeDocxCandidate({ filename: 'notes.docx', mimeType: '' })).toBe(true);
    expect(isKnowledgeDocxCandidate({ filename: 'NOTES.DOCX', mimeType: '' })).toBe(true);
    expect(isKnowledgeDocxCandidate({ filename: 'notes', mimeType: KNOWLEDGE_DOCX_MIME_TYPE })).toBe(true);
    expect(isKnowledgeDocxCandidate({ filename: 'notes.txt', mimeType: 'text/plain' })).toBe(false);
    // .doc is the old binary format and is NOT this path.
    expect(isKnowledgeDocxCandidate({ filename: 'notes.doc', mimeType: '' })).toBe(false);
  });
});

describe('structured.docx -- the shape of the text', () => {
  it('is exactly the text the document XML describes', async () => {
    const { text } = await textOf('structured.docx');
    // Derived from the source: H1, paragraph, H2, footnoted paragraph, an
    // EMPTY paragraph, H2, three bullets (the third nested), H2, two numbered
    // items, H2, a 2x2 table bounded by blank blocks, a closing paragraph,
    // then the footnote body.
    expect(text).toBe([
      '# Loom setup notes',
      'The back beam is warped first.',
      '## Warping',
      'Thread the raddle at one inch per section.[^1]',
      '## Bullets',
      '- Raddle',
      '- Lease sticks',
      '  - Two of them',
      '## Numbered',
      '1. Wind the warp',
      '2. Beam it on',
      '## Sett table',
      '',
      'Yarn | Sett',
      '8/2 cotton | 20 epi',
      '',
      'After the table.',
      '',
      '[^1]: Measured on a four-shaft table loom.',
    ].join('\n'));
  });

  it('keeps the footnote BODY, which raw-text extraction drops entirely', async () => {
    const { text, footnoteCount } = await textOf('structured.docx');
    expect(footnoteCount).toBe(1);
    expect(text).toContain('Measured on a four-shaft table loom.');
    // And the reference is where the author put it, not appended anywhere.
    expect(text).toContain('per section.[^1]');
    // The backlink mammoth renders into the body is navigation, not text.
    expect(text).not.toContain('↑');
  });

  it('does NOT keep the empty paragraph -- a measured loss of the pinned route', async () => {
    // The source has an empty paragraph here. mammoth's HTML omits it and its
    // raw-text mode keeps it; the pinned route is HTML, so it is gone.
    //
    // Pinned as a CHARACTERIZATION, not an endorsement: if this ever starts
    // failing, the parser changed underneath us and every stored offset for a
    // document containing a blank line moved. The contract records it as
    // emptyParagraphs: 'omitted-by-parser'.
    const { text } = await textOf('structured.docx');
    expect(text).toContain('per section.[^1]\n## Bullets');
    expect(text).not.toContain('per section.[^1]\n\n## Bullets');
  });

  it('marks list nesting and numbers items within their own level', async () => {
    const { text } = await textOf('structured.docx');
    expect(text).toContain('- Lease sticks\n  - Two of them');
    expect(text).toContain('1. Wind the warp\n2. Beam it on');
  });

  it('bounds the table, so prose never runs into a grid', async () => {
    const { text } = await textOf('structured.docx');
    expect(text).toContain('## Sett table\n\nYarn | Sett');
    expect(text).toContain('8/2 cotton | 20 epi\n\nAfter the table.');
  });

  it('does not read the trailing footnote list as a numbered section', async () => {
    // mammoth emits footnote bodies as an <ol>. Treated as an ordinary list it
    // would append "1. Measured on..." as if the author had written a final
    // numbered section.
    const { text } = await textOf('structured.docx');
    expect(text).not.toContain('1. Measured on a four-shaft table loom.');
    expect(text).toContain('[^1]: Measured on a four-shaft table loom.');
  });
});

describe('revisions.docx -- tracked changes and comments', () => {
  it('takes the ACCEPTED state: insertion in, deletion out', async () => {
    const { text } = await textOf('revisions.docx');
    expect(text).toContain('The sett is usually 20 epi.');
    // The trap, pinned. A walk that takes every text node picks up w:delText
    // and produces a fluent sentence asserting the opposite of the source.
    expect(text).not.toContain('never');
  });

  it('excludes the comment body and keeps the text it was anchored to', async () => {
    const { text } = await textOf('revisions.docx');
    expect(text).toContain('Check this against the draft.');
    expect(text).not.toContain('The draft says 24 epi.');
  });
});

describe('breaks.docx -- separators and characters', () => {
  it('separates a line break, which raw-text extraction welds', async () => {
    const { text } = await textOf('breaks.docx');
    expect(text).toContain('Line one\nLine two');
    expect(text).not.toContain('Line oneLine two');
  });

  it('keeps a tab, and the characters a citation has to survive', async () => {
    const { text } = await textOf('breaks.docx');
    expect(text).toContain('Col A\tCol B');
    expect(text).toContain('Smart “quotes”');
    expect(text).toContain('em—dash');
    expect(text).toContain('NBSP here');
    // An astral character must survive as a whole pair: every offset in this
    // feature is a UTF-16 code unit, and half of one renders as damage.
    expect(text).toContain('Astral 🧵 thread');
  });
});

describe('content that carries no text', () => {
  it('emits nothing for an image, and counts it for disclosure', async () => {
    const { text, imageCount } = await textOf('image.docx');
    expect(imageCount).toBe(1);
    // The exact equality is the proof: nothing at all stands where the image
    // was. A placeholder would be text that is not in the document, and every
    // character of it would shift every offset after it.
    expect(text).toBe('Before the image.\n\nAfter the image.');
  });

  it('reports an image-only document as having no text at all', async () => {
    const { text, imageCount } = await textOf('imageonly.docx');
    expect(imageCount).toBe(1);
    expect(text.trim()).toBe('');
  });
});

describe('limits and failures', () => {
  it('refuses bytes that are not a Word document, without leaking the cause', async () => {
    const result = await extractKnowledgeDocxText(new TextEncoder().encode('not a zip'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toBe('This file could not be read as a Word document');
  });

  it('refuses a document past the byte ceiling before parsing it', async () => {
    const huge = new Uint8Array(26 * 1024 * 1024);
    const result = await extractKnowledgeDocxText(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('This document is too large to read');
  });

  it('reports how long extraction took', async () => {
    const { elapsedMs } = await textOf('structured.docx');
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(elapsedMs)).toBe(true);
  });
});
