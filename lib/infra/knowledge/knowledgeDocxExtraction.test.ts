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

import {
  extractKnowledgeDocxText,
  KNOWLEDGE_DOCX_MAX_ENTRIES,
} from './knowledgeDocxExtractionAdapter';
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

describe('archive bounds, verified against what the libraries do NOT enforce', () => {
  // jszip 3.10.1 has no entry cap and no size cap; mammoth 1.12.3 adds none.
  // Every bound here is ours, and the cheap ones run before decompression.

  it('refuses an archive with no main document part', async () => {
    // A ZIP named .docx is not a .docx. Without this it reaches mammoth and
    // comes back as an unexplained failure.
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('hello.txt', 'not a word document');
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' }));

    const result = await extractKnowledgeDocxText(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('This file could not be read as a Word document');
  });

  it('refuses an archive with too many parts, before decompressing any', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    for (let i = 0; i < KNOWLEDGE_DOCX_MAX_ENTRIES + 10; i += 1) zip.file(`part-${i}.bin`, 'x');
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' }));

    const result = await extractKnowledgeDocxText(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('This document has too many parts to read');
  });

  it('accepts every real fixture -- the bounds do not refuse ordinary documents', async () => {
    // The control that keeps the limits honest: a ceiling that refuses real
    // work is not a safeguard, it is an outage.
    for (const name of ['structured.docx', 'revisions.docx', 'breaks.docx', 'long.docx']) {
      const result = await extractKnowledgeDocxText(read(name));
      expect(result.ok, `${name} must still extract`).toBe(true);
    }
  });
});

describe('a document whose only text is whitespace', () => {
  it('extracts to nothing, and is therefore refused by the upload', async () => {
    // "Nothing at all" is trim(), not length === 0. The extractor's job is
    // only to produce the text; the refusal is the upload's, and is proved
    // against this same shape in knowledgeTextIngestion's own suite.
    const { text } = await textOf('whitespace.docx');
    expect(text.length).toBeGreaterThan(0);
    expect(text.trim()).toBe('');
  });
});

describe('the facts a disclosure is built from', () => {
  it('reports tracked changes from the ARCHIVE, where the fact still exists', async () => {
    // By the time mammoth has produced HTML the revisions are already applied,
    // so the only place this is knowable is the source XML.
    const { hasTrackedChanges } = await textOf('revisions.docx');
    expect(hasTrackedChanges).toBe(true);
  });

  it('does not see tracked changes in a document that has none', async () => {
    const { hasTrackedChanges } = await textOf('structured.docx');
    expect(hasTrackedChanges).toBe(false);
  });

  it('reports images in a MIXED document, which is the silent case', async () => {
    // An image-only document is refused and says so. A document with text AND
    // pictures succeeds, looks complete, and is the one that needs telling.
    const { imageCount, text } = await textOf('image.docx');
    expect(imageCount).toBe(1);
    expect(text.trim().length).toBeGreaterThan(0);
  });
});

describe('the limits that are ENFORCED rather than declared', () => {
  /**
   * The gap this closes, stated once: the archive preflight reads the size the
   * central directory DECLARES, and that is a number inside a file the
   * uploader wrote. zipbomb.docx declares 4,096 bytes for a part that inflates
   * to 335 MB. Nothing checked before decompression can catch it, and a check
   * after decompression runs only once the memory has already been taken.
   *
   * Extraction therefore runs in a worker with a V8-enforced heap ceiling and
   * a terminable thread, so the failure happens DURING inflation.
   */
  it('stops a bomb that lies about its size, during decompression', async () => {
    const started = Date.now();
    const result = await extractKnowledgeDocxText(read('zipbomb.docx'));
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The refusal says the file could not be read, and nothing about heaps or
    // workers: the cause is ours, not the uploader's business.
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toBe('This file could not be read as a Word document');
    // And it fails FAST -- it is stopped while inflating, not after.
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it('the same bomb is caught EARLIER when it declares its real size', async () => {
    // The honest control: with a truthful central directory the preflight
    // refuses it without decompressing anything at all. Both layers matter --
    // this one is cheap, the worker is the one that cannot be lied to.
    const honest = read('zipbomb.docx');
    // Rewrite the declared size back to something over the ceiling.
    const view = Buffer.from(honest.buffer.slice(0));
    for (let i = 0; i < view.length - 46; i += 1) {
      if (view.readUInt32LE(i) !== 0x02014b50) continue;
      const nameLength = view.readUInt16LE(i + 28);
      if (view.toString('utf8', i + 46, i + 46 + nameLength) !== 'word/document.xml') continue;
      view.writeUInt32LE(300 * 1024 * 1024, i + 24);
    }

    const result = await extractKnowledgeDocxText(new Uint8Array(view));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('This document is too large to read');
  }, 60_000);
});
