import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { KnowledgeExtractedElement, KnowledgeExtractedPage } from './pdfExtraction';
import { buildKnowledgeChunks } from './knowledgeChunking';

const bbox = (left = 10) => ({
  left,
  bottom: 20,
  right: left + 100,
  top: 40,
  coordinateSystem: 'pdf-points-bottom-left' as const,
});

function element(
  text: string,
  overrides: Partial<KnowledgeExtractedElement> = {},
): KnowledgeExtractedElement {
  return { type: 'paragraph', pageNumber: 1, text, bbox: bbox(), readingOrder: 1, ...overrides };
}

function page(elements: readonly KnowledgeExtractedElement[], pageNumber = 1): KnowledgeExtractedPage {
  return {
    pageNumber,
    text: elements.map((item) => item.text ?? '').join('\n\n'),
    elements,
  };
}

function hash(text: string): string {
  return createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');
}

describe('buildKnowledgeChunks', () => {
  it('is deterministic, ordered, page-local, and groups semantic elements', () => {
    const first = element('a'.repeat(700), { sourceElementId: 'first', readingOrder: 1 });
    const second = element('b'.repeat(500), { sourceElementId: 'second', readingOrder: 2 });
    const third = element('c'.repeat(700), { sourceElementId: 'third', readingOrder: 3 });
    const orderedPage = page([first, second, third]);
    const input = [{ ...orderedPage, elements: [third, second, first] }, page([element('page two', { pageNumber: 2 })], 2)];

    const chunks = buildKnowledgeChunks(input);
    expect(chunks).toEqual(buildKnowledgeChunks(input));
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2]);
    expect(chunks.map((chunk) => [chunk.pageStart, chunk.pageEnd])).toEqual([[1, 1], [1, 1], [2, 2]]);
    expect(chunks[0].text).toContain('a'.repeat(700));
    expect(chunks[0].text).toContain('b'.repeat(500));
    expect(chunks[0].text).not.toContain('c'.repeat(700));
    expect(chunks[0].sourceLocators).toHaveLength(2);
  });

  it('preserves canonical bboxes and round-trips UTF-16 source offsets', () => {
    const first = element('Alpha 😀 beta', { sourceElementId: 'astral', bbox: bbox(72) });
    const second = element('Tail', { sourceElementId: 'tail', readingOrder: 2, bbox: bbox(200) });
    const source = page([first, second]);
    const chunks = buildKnowledgeChunks([source]);
    const locator = chunks[0].sourceLocators.find((item) => item.sourceElementId === 'astral');

    expect(locator).toMatchObject({
      bbox: bbox(72),
      space: 'pdf-points-bottom-left',
      sourceStart: 0,
      sourceEnd: first.text!.length,
      chunkStart: 0,
      chunkEnd: first.text!.length,
    });
    expect(chunks[0].text.slice(locator!.chunkStart, locator!.chunkEnd)).toBe(first.text);
    expect(source.text.slice(locator!.sourceStart, locator!.sourceEnd)).toBe(first.text);
    expect(first.text!.indexOf('beta')).toBe(9);
  });

  it('uses text-only identity even when locator geometry jitters', () => {
    const first = buildKnowledgeChunks([page([element('same text', { bbox: bbox(10) })])])[0];
    const jittered = buildKnowledgeChunks([page([element('same text', { bbox: bbox(11) })])])[0];
    expect(first.text).toBe(jittered.text);
    expect(hash(first.text)).toBe(hash(jittered.text));
  });

  it('splits oversized newline text without overlap and marks partial locators', () => {
    const text = Array.from({ length: 8 }, (_, index) => `${index}-${'x'.repeat(350)}`).join('\n');
    const chunks = buildKnowledgeChunks([page([element(text, { sourceElementId: 'long' })])]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
    expect(chunks.every((chunk) => chunk.text.length <= 2_000)).toBe(true);
    expect(chunks.every((chunk) => chunk.sourceLocators.every((locator) => locator.partial === true))).toBe(true);
    expect(chunks.every((chunk) => chunk.text.slice(0, 1) !== '')).toBe(true);
  });

  it('keeps an oversized no-safe-split element whole rather than inventing precision', () => {
    const text = 'z'.repeat(2_001);
    const [chunk] = buildKnowledgeChunks([page([element(text, { sourceElementId: 'opaque' })])]);
    expect(chunk.text).toBe(text);
    expect(chunk.sourceLocators[0].partial).toBeUndefined();
  });

  it('keeps a fitting table together and preserves cell coordinates', () => {
    const cells = ['Name', 'Value', 'Alpha', '42'].map((text, index) => element(text, {
      type: 'table-cell',
      sourceElementId: `cell-${index}`,
      bbox: bbox(72 + (index % 2) * 200),
      metadata: { rowNumber: Math.floor(index / 2) + 1, columnNumber: (index % 2) + 1, rowSpan: 1, columnSpan: 1 },
    }));
    const table = element(cells.map((cell) => cell.text).join('\n'), {
      type: 'table',
      sourceElementId: 'table',
      metadata: { numberOfRows: 2, numberOfColumns: 2 },
      children: cells,
      bbox: bbox(72),
    });
    const [chunk] = buildKnowledgeChunks([page([table])]);
    const cellLocators = chunk.sourceLocators.filter((locator) => locator.elementType === 'table-cell');

    expect(chunk.text).toBe('Name\nValue\nAlpha\n42');
    expect(chunk.sourceLocators.some((locator) => locator.sourceElementId === 'table')).toBe(true);
    expect(cellLocators).toHaveLength(4);
    expect(cellLocators.map((locator) => locator.table?.rowNumber)).toEqual([1, 1, 2, 2]);
  });

  it('splits oversized tables only at row boundaries', () => {
    const rows = Array.from({ length: 3 }, (_, row) => [0, 1].map((column) => element(
      `${row + 1}-${column}-${'q'.repeat(350)}`,
      {
        type: 'table-cell',
        sourceElementId: `r${row + 1}c${column + 1}`,
        bbox: bbox(72 + column * 200),
        metadata: { rowNumber: row + 1, columnNumber: column + 1, rowSpan: 1, columnSpan: 1 },
      },
    )));
    const cells = rows.flat();
    const table = element(cells.map((cell) => cell.text).join('\n'), {
      type: 'table',
      sourceElementId: 'large-table',
      children: cells,
      bbox: bbox(72),
    });
    const chunks = buildKnowledgeChunks([page([table])]);

    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('1-0-');
    expect(chunks[0].text).toContain('2-1-');
    expect(chunks[0].text).not.toContain('3-0-');
    expect(chunks[1].text).toContain('3-0-');
    expect(chunks.every((chunk) => chunk.sourceLocators.some((locator) => locator.elementType === 'table' && locator.partial))).toBe(true);
    expect(chunks[0].sourceLocators.filter((locator) => locator.elementType === 'table-cell').every((locator) => locator.table?.rowNumber !== 3)).toBe(true);
  });
});
