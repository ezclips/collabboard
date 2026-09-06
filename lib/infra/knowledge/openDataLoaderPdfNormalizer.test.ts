import { describe, expect, it } from 'vitest';
import basicFixture from './fixtures/openDataLoader-basic.json';
import observedNativeShapeFixture from './fixtures/openDataLoader-real-shape.json';
import tableFixture from './fixtures/openDataLoader-table.json';
import { createHash } from 'node:crypto';
import { asKnowledgeDocumentId } from '../../domain/core/ids';
import { ok } from '../../domain/core/result';
import { buildKnowledgeChunks } from '../../domain/knowledge/knowledgeChunking';
import { completeKnowledgeExtraction } from '../../domain/knowledge/knowledgeExtraction';
import type {
  KnowledgeExtractionCompletion,
  KnowledgeExtractionRepository,
} from '../../domain/knowledge/knowledgeExtraction';
import {
  toKnowledgeChunkRecords,
  toKnowledgePageRecords,
} from './knowledgeExtractionAdapters';
import { normalizeOpenDataLoaderPdf } from './openDataLoaderPdfNormalizer';

const parser = { name: 'opendataloader-pdf', version: 'fixture-0.0.0', optionsHash: 'options-1' } as const;

describe('normalizeOpenDataLoaderPdf', () => {
  it('normalizes document metadata, 1-based pages, headings, paragraphs, and lists', () => {
    const result = normalizeOpenDataLoaderPdf(basicFixture, {
      contentSha256: 'sha-basic',
      parser,
    });

    expect(result.document).toEqual({ contentSha256: 'sha-basic', pageCount: 2 });
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.pages[0].text).toContain('Project Notes');
    expect(result.pages[0].text).toContain('First item\nSecond item');
    expect(result.pages[0].elements[0]).toMatchObject({
      sourceElementId: '1',
      type: 'heading',
      pageNumber: 1,
      text: 'Project Notes',
      metadata: { headingLevel: 1 },
    });
    expect(result.pages[0].elements[2]).toMatchObject({
      type: 'list',
      text: 'First item\nSecond item',
      metadata: { numberingStyle: 'bullet' },
    });
    expect(result.pages[1].elements[0]).toMatchObject({
      type: 'other',
      metadata: { sourceType: 'future-parser-element' },
    });
  });

  it('preserves PDF-point bottom-left bounding boxes and deterministic reading order', () => {
    const first = normalizeOpenDataLoaderPdf(basicFixture, { contentSha256: 'sha-basic', parser });
    const second = normalizeOpenDataLoaderPdf(basicFixture, { contentSha256: 'sha-basic', parser });

    expect(first).toEqual(second);
    expect(first.pages[0].elements[0]).toMatchObject({
      bbox: {
        left: 72,
        bottom: 700,
        right: 300,
        top: 724,
        coordinateSystem: 'pdf-points-bottom-left',
      },
      readingOrder: 1,
    });
    expect(first.pages[0].elements[1].readingOrder).toBe(2);
  });

  it('preserves table/cell structure, cell coordinates, and nested cell content', () => {
    const result = normalizeOpenDataLoaderPdf(tableFixture, {
      contentSha256: 'sha-table',
      parser,
      pageGeometry: { 1: { widthPoints: 612, heightPoints: 792, rotation: 0 } },
    });
    const table = result.pages[0].elements[0];

    expect(table).toMatchObject({
      type: 'table',
      text: 'Name\nValue\nAlpha\n42',
      metadata: { numberOfRows: 2, numberOfColumns: 2 },
    });
    expect(table.children).toHaveLength(4);
    expect(table.children?.[0]).toMatchObject({
      type: 'table-cell',
      text: 'Name',
      metadata: { rowNumber: 1, columnNumber: 1, rowSpan: 1, columnSpan: 1 },
      bbox: { left: 72, bottom: 500, right: 300, top: 600 },
    });
    expect(table.children?.[0].children?.[0]).toMatchObject({ type: 'paragraph', text: 'Name' });
    expect(result.citationReady).toBe(true);
  });

  it('handles observed native text blocks and table cells without source IDs', () => {
    const result = normalizeOpenDataLoaderPdf(observedNativeShapeFixture, {
      contentSha256: 'sha-observed-native-shape',
      parser,
    });
    const [textBlock, table] = result.pages[0].elements;

    expect(textBlock).toMatchObject({
      type: 'other',
      sourceElementId: '5',
      metadata: { sourceType: 'text block' },
      children: [{ type: 'paragraph', sourceElementId: '1', text: 'Figure placeholder' }],
    });
    expect(table.children?.[0]).toMatchObject({
      type: 'table-cell',
      metadata: { rowNumber: 1, columnNumber: 1 },
      bbox: { coordinateSystem: 'pdf-points-bottom-left' },
    });
    expect(table.children?.[0]).not.toHaveProperty('sourceElementId');
  });

  it('does not invent page dimensions and reports citation readiness explicitly', () => {
    const withoutGeometry = normalizeOpenDataLoaderPdf(basicFixture, { contentSha256: 'sha-basic', parser });
    const withPartialGeometry = normalizeOpenDataLoaderPdf(basicFixture, {
      contentSha256: 'sha-basic',
      parser,
      pageGeometry: { 1: { widthPoints: 612, heightPoints: 792 } },
    });

    expect(withoutGeometry.citationReady).toBe(false);
    expect(withoutGeometry.pages[0]).not.toHaveProperty('widthPoints');
    expect(withoutGeometry.pages[0]).not.toHaveProperty('heightPoints');
    expect(withPartialGeometry.citationReady).toBe(false);
    expect(withPartialGeometry.pages[0]).toMatchObject({ widthPoints: 612, heightPoints: 792 });
    expect(withPartialGeometry.pages[1]).not.toHaveProperty('widthPoints');
  });

  it('keeps parser identity, options, raw artifact metadata, and provenance IDs at the boundary', () => {
    const result = normalizeOpenDataLoaderPdf(basicFixture, {
      contentSha256: 'sha-basic',
      parser,
      rawArtifact: { format: 'application/json', storageKey: 'future/raw/basic.json' },
    });

    expect(result.parser).toEqual(parser);
    expect(result.rawArtifact).toEqual({ format: 'application/json', storageKey: 'future/raw/basic.json' });
    expect(result.pages[0].elements[0].sourceElementId).toBe('1');
    expect(result.pages[0].elements[0]).not.toHaveProperty('font');
    expect(result.pages[0].elements[0]).not.toHaveProperty('pdfua_tag');
  });

  it('handles non-object input and missing optional fields without side effects', () => {
    const result = normalizeOpenDataLoaderPdf(null, { contentSha256: 'sha-empty', parser });

    expect(result.document).toEqual({ contentSha256: 'sha-empty', pageCount: 0 });
    expect(result.pages).toEqual([]);
    expect(result.citationReady).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PostgreSQL-untranslatable characters.
//
// PROVEN: production document f5efa877 failed at stage `complete` with
// dbErrorCode 22P05 -- untranslatable_character -- after the parser, geometry
// and every structural page/chunk invariant had passed.
//
// CODE-PROVEN: normalizeText preserved U+0000 verbatim, so parser text carried
// it into p_pages/p_chunks and on into PostgreSQL's JSONB-to-text conversion.
//
// NOT proven here: that this particular fixture's parser output contains
// U+0000. Java and the OpenDataLoader jar are absent on this machine, so the
// real parser output for it cannot be produced. These tests use synthetic
// OpenDataLoader-shaped input and prove the boundary, which is what the
// SQLSTATE plus the code path justify.
// ---------------------------------------------------------------------------

const NUL = '\u0000';
const REPLACEMENT = '\uFFFD';

/** Minimal OpenDataLoader-shaped document with one text element per page. */
const parserDoc = (contents: readonly string[], id?: unknown) => ({
  'number of pages': contents.length,
  kids: contents.map((content, index) => ({
    type: 'paragraph',
    'page number': index + 1,
    content,
    ...(id === undefined ? {} : { id }),
    'bounding box': [10, 10, 200, 40],
  })),
});

const geometryFor = (pages: number) =>
  Object.fromEntries(
    Array.from({ length: pages }, (_, i) => [i + 1, { widthPoints: 612, heightPoints: 792, rotation: 0 }]),
  );

const normalize = (input: unknown, pages = 1) =>
  normalizeOpenDataLoaderPdf(input, {
    contentSha256: 'sha-nul',
    parser,
    pageGeometry: geometryFor(pages),
  });

describe('PostgreSQL-untranslatable characters (SQLSTATE 22P05)', () => {
  it('N1. replaces a NUL in element and page text, preserving length', () => {
    const result = normalize(parserDoc([`A${NUL}B`]));
    const element = result.pages[0].elements[0];

    expect(element.text).toBe(`A${REPLACEMENT}B`);
    expect(result.pages[0].text).toBe(`A${REPLACEMENT}B`);
    expect(element.text).not.toContain(NUL);
    expect(result.pages[0].text).not.toContain(NUL);
    // One UTF-16 code unit for one UTF-16 code unit: offsets cannot shift.
    expect(element.text!.length).toBe(`A${NUL}B`.length);
    expect(element.text!.indexOf(REPLACEMENT)).toBe(`A${NUL}B`.indexOf(NUL));
  });

  it('N2. replaces every occurrence, including adjacent and terminal ones', () => {
    const raw = `${NUL}a${NUL}${NUL}b${NUL}`;
    const result = normalize(parserDoc([raw]));
    const text = result.pages[0].text;

    expect(text).not.toContain(NUL);
    expect([...text].filter((c) => c === REPLACEMENT)).toHaveLength(4);
    expect(text.length).toBe(raw.length);
    expect(text).toBe(`${REPLACEMENT}a${REPLACEMENT}${REPLACEMENT}b${REPLACEMENT}`);
  });

  it('N3. keeps the existing CR / CRLF normalization and replaces NUL too', () => {
    const result = normalize(parserDoc([`a\r\nb\rc${NUL}d`]));
    const text = result.pages[0].text;

    expect(text).toBe(`a\nb\nc${REPLACEMENT}d`);
    expect(text).not.toContain('\r');
    expect(text).not.toContain(NUL);
  });

  it('N4. leaves ordinary Unicode exactly as the parser produced it', () => {
    // Accents, CJK, an astral-plane emoji, a combining mark, and control
    // characters PostgreSQL CAN store are all untouched.
    const raw = 'é 中文 \u{1F600} é tab\tnewline\nvertical\u000B';
    const result = normalize(parserDoc([raw]));
    const text = result.pages[0].text;

    expect(text).toBe(raw);
    expect(text).toContain('é');
    expect(text).toContain('中文');
    expect(text).toContain('\u{1F600}');
    expect(text).toContain('\t');
    expect(text).toContain('\u000B');
    // The astral character survives as a surrogate pair, not as two questions.
    expect([...text].filter((c) => c === '\u{1F600}')).toHaveLength(1);
    expect(text).not.toContain(REPLACEMENT);
  });

  it('N5. sanitizes a parser-controlled source element id', () => {
    const result = normalize(parserDoc(['body text'], `id${NUL}part`));
    const element = result.pages[0].elements[0];

    expect(element.sourceElementId).toBe(`id${REPLACEMENT}part`);
    expect(element.sourceElementId).not.toContain(NUL);
    expect(element.sourceElementId!.length).toBe(`id${NUL}part`.length);
  });

  it('N5b. a numeric source element id is unaffected', () => {
    const result = normalize(parserDoc(['body text'], 42));
    expect(result.pages[0].elements[0].sourceElementId).toBe('42');
  });
});

describe('22P05 -- the completion payload is PostgreSQL-safe end to end', () => {
  /** Builds the exact records the adapter sends as p_pages / p_chunks. */
  async function completionPayload(input: unknown, pages = 1) {
    const extraction = normalize(input, pages);
    const chunks = buildKnowledgeChunks(extraction.pages);
    const geometry = extraction.pages.map((page) => ({
      pageNumber: page.pageNumber,
      widthPoints: page.widthPoints!,
      heightPoints: page.heightPoints!,
      rotation: page.rotation ?? 0,
    }));

    let captured: KnowledgeExtractionCompletion | undefined;
    const repository = {
      async complete(completion: KnowledgeExtractionCompletion) {
        captured = completion;
        return ok(undefined);
      },
    } as unknown as KnowledgeExtractionRepository;

    const outcome = await completeKnowledgeExtraction(
      {
        repository,
        hasher: { sha256: async (b: Uint8Array) => createHash('sha256').update(b).digest('hex') },
      } as never,
      {
        documentId: asKnowledgeDocumentId('f5efa877-518d-4ade-a2b7-3249a0285803'),
        processingLeaseToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        extraction,
        geometry,
        chunks,
        rawArtifactPath: 'knowledge/board/doc/artifact.json',
      },
    );

    return {
      outcome,
      completion: captured!,
      pageRecords: toKnowledgePageRecords(captured!),
      chunkRecords: toKnowledgeChunkRecords(captured!),
    };
  }

  it('N6. neither p_pages nor p_chunks carries a NUL, in any encoding', async () => {
    const { outcome, pageRecords, chunkRecords } = await completionPayload(
      parserDoc([`A${NUL}B and more text to chunk`], 1),
    );
    expect(outcome.ok).toBe(true);

    for (const [label, records] of [['p_pages', pageRecords], ['p_chunks', chunkRecords]] as const) {
      const serialized = JSON.stringify(records);
      // Both the escaped form PostgREST would transmit...
      expect(serialized, label).not.toContain('\\u0000');
      // ...and any raw code unit that survived into the structure.
      expect(serialized.includes(NUL), label).toBe(false);
      expect(serialized, label).toContain(REPLACEMENT);
    }
    expect(chunkRecords.length).toBeGreaterThan(0);
  });

  it('N7. a NUL inside a source element id does not survive into p_chunks', async () => {
    const { chunkRecords } = await completionPayload(
      parserDoc([`text with a bbox element`], `id${NUL}part`),
    );
    const locators = chunkRecords.flatMap((r) => r.source_locators as { sourceElementId: string }[]);

    expect(locators.length).toBeGreaterThan(0);
    // The locator is kept, not dropped, and its id is repaired in place.
    for (const locator of locators) {
      expect(locator.sourceElementId).not.toContain(NUL);
      expect(locator.sourceElementId).toBe(`id${REPLACEMENT}part`);
    }
    expect(JSON.stringify(chunkRecords)).not.toContain('\\u0000');
  });

  it('N8. hashes and offsets are computed from the SANITIZED text', async () => {
    const raw = `A${NUL}B`;
    const { completion, pageRecords, chunkRecords } = await completionPayload(parserDoc([raw]));

    const sanitized = `A${REPLACEMENT}B`;
    const expectedHash = createHash('sha256')
      .update(new TextEncoder().encode(sanitized))
      .digest('hex');

    // The page hash is the hash of what is actually stored -- not of the raw
    // parser text, which is the desynchronisation this placement avoids.
    expect(pageRecords[0].text).toBe(sanitized);
    expect(pageRecords[0].text_hash).toBe(expectedHash);

    const chunk = chunkRecords[0];
    expect(chunk.text).toBe(sanitized);
    expect(chunk.text_hash).toBe(
      createHash('sha256').update(new TextEncoder().encode(String(chunk.text))).digest('hex'),
    );

    // Offsets still address the same characters: no shift from the swap.
    expect(chunk.char_start).toBe(0);
    expect(chunk.char_end).toBe(sanitized.length);
    expect(sanitized.length).toBe(raw.length);
    expect(completion.pageCount).toBe(1);
  });
});
