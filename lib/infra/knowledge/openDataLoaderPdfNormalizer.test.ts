import { describe, expect, it } from 'vitest';
import basicFixture from './fixtures/openDataLoader-basic.json';
import tableFixture from './fixtures/openDataLoader-table.json';
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
