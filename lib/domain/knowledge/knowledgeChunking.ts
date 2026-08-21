import type { KnowledgeExtractedElement, KnowledgeExtractedPage, KnowledgePdfElementType } from './pdfExtraction';
import { KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM } from './pdfExtraction';

export interface KnowledgeChunkSourceLocator {
  readonly pageNumber: number;
  readonly space: typeof KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM;
  readonly bbox: { readonly left: number; readonly bottom: number; readonly right: number; readonly top: number };
  readonly sourceElementId: string;
  readonly elementType: KnowledgePdfElementType;
  readonly readingOrder: number;
  readonly chunkStart: number;
  readonly chunkEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly table?: { readonly rowNumber?: number; readonly columnNumber?: number; readonly rowSpan?: number; readonly columnSpan?: number };
  readonly partial?: true;
}

export interface KnowledgeChunkDraft {
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly text: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly chunkIndex: number;
  readonly sourceLocators: readonly KnowledgeChunkSourceLocator[];
}

export interface KnowledgeChunkWrite extends KnowledgeChunkDraft { readonly textHash: string; }
export const KNOWLEDGE_CHUNK_TARGET_CHARS = 1_000;
export const KNOWLEDGE_CHUNK_MAX_CHARS = 2_000;

interface LocatorDraft { readonly element: KnowledgeExtractedElement; readonly start: number; readonly end: number; readonly partial?: true; }
interface SourceUnit {
  readonly pageNumber: number;
  readonly text: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly separator: string;
  readonly groupKey: string;
  readonly locators: readonly LocatorDraft[];
}
interface ChunkUnit extends SourceUnit { readonly splitElement?: boolean; }

function tableMetadata(element: KnowledgeExtractedElement): KnowledgeChunkSourceLocator['table'] {
  const metadata = element.metadata;
  if (!metadata) return undefined;
  const table = {
    ...(metadata.rowNumber !== undefined ? { rowNumber: metadata.rowNumber } : {}),
    ...(metadata.columnNumber !== undefined ? { columnNumber: metadata.columnNumber } : {}),
    ...(metadata.rowSpan !== undefined ? { rowSpan: metadata.rowSpan } : {}),
    ...(metadata.columnSpan !== undefined ? { columnSpan: metadata.columnSpan } : {}),
  };
  return Object.keys(table).length > 0 ? table : undefined;
}

function sourceId(element: KnowledgeExtractedElement, pageNumber: number, fallback: number): string {
  return element.sourceElementId ?? `${pageNumber}:${element.readingOrder ?? fallback}`;
}

function locateChildren(element: KnowledgeExtractedElement, start: number, fallback: { value: number }): LocatorDraft[] {
  const text = element.text ?? '';
  let cursor = 0;
  const locators: LocatorDraft[] = [];
  for (const child of element.children ?? []) {
    fallback.value += 1;
    const childText = child.text ?? '';
    if (!childText) continue;
    const childStart = text.indexOf(childText, cursor);
    if (childStart < 0) continue;
    const childEnd = childStart + childText.length;
    if (child.bbox) locators.push({ element: child, start: start + childStart, end: start + childEnd });
    locators.push(...locateChildren(child, start + childStart, fallback));
    cursor = childEnd;
  }
  return locators;
}

function locatorsForElement(element: KnowledgeExtractedElement, start: number, fallback: { value: number }, partial?: true): LocatorDraft[] {
  fallback.value += 1;
  const end = start + (element.text ?? '').length;
  const locators = element.bbox && end > start ? [{ element, start, end, partial }] : [];
  return [...locators, ...locateChildren(element, start, fallback)];
}

function directLocator(element: KnowledgeExtractedElement, start: number, fallback: { value: number }, partial?: true): LocatorDraft[] {
  fallback.value += 1;
  const end = start + (element.text ?? '').length;
  return element.bbox && end > start ? [{ element, start, end, partial }] : [];
}

function sortElements(elements: readonly KnowledgeExtractedElement[]): KnowledgeExtractedElement[] {
  return elements.map((element, index) => ({ element, index })).sort((left, right) =>
    (left.element.readingOrder ?? Number.MAX_SAFE_INTEGER) - (right.element.readingOrder ?? Number.MAX_SAFE_INTEGER) || left.index - right.index,
  ).map(({ element }) => element);
}

function unitsForPage(page: KnowledgeExtractedPage): SourceUnit[] {
  const elements = sortElements(page.elements);
  if (elements.length === 0 && page.text) {
    return [{ pageNumber: page.pageNumber, text: page.text, sourceStart: 0, sourceEnd: page.text.length, separator: '', groupKey: 'fallback', locators: [] }];
  }
  const units: SourceUnit[] = [];
  let cursor = 0;
  const fallback = { value: 0 };
  for (const element of elements) {
    const text = element.text ?? '';
    if (!text) continue;
    const start = page.text.indexOf(text, cursor);
    if (start < 0) continue;
    const end = start + text.length;
    if (element.type === 'table' && text.length > KNOWLEDGE_CHUNK_MAX_CHARS) {
      const rows = new Map<number, KnowledgeExtractedElement[]>();
      for (const child of element.children ?? []) {
        const row = child.metadata?.rowNumber;
        if (child.type === 'table-cell' && row !== undefined) rows.set(row, [...(rows.get(row) ?? []), child]);
      }
      const orderedRows = [...rows.entries()].sort(([a], [b]) => a - b);
      let rowCursor = 0;
      for (const [, cells] of orderedRows) {
        const rowText = cells.map((cell) => cell.text ?? '').filter(Boolean).join('\n');
        const rowStart = rowText ? text.indexOf(rowText, rowCursor) : -1;
        if (rowStart < 0) break;
        const rowEnd = rowStart + rowText.length;
        const rowLocators = directLocator(element, start + rowStart, fallback, true);
        let cellCursor = rowStart;
        for (const cell of cells) {
          const cellText = cell.text ?? '';
          const cellStart = text.indexOf(cellText, cellCursor);
          if (cellStart >= 0) rowLocators.push(...locatorsForElement(cell, start + cellStart, fallback));
          cellCursor = cellStart >= 0 ? cellStart + cellText.length : cellCursor;
        }
        units.push({ pageNumber: page.pageNumber, text: rowText, sourceStart: start + rowStart, sourceEnd: start + rowEnd, separator: '\n', groupKey: `table:${start}`, locators: rowLocators });
        rowCursor = rowEnd;
      }
      if (units[units.length - 1]?.sourceStart >= start) { cursor = end; continue; }
    }
    units.push({ pageNumber: page.pageNumber, text, sourceStart: start, sourceEnd: end, separator: '\n\n', groupKey: element.type === 'table' ? `table:${start}` : 'text', locators: locatorsForElement(element, start, fallback) });
    cursor = end;
  }
  return units.length > 0 || !page.text ? units : [{ pageNumber: page.pageNumber, text: page.text, sourceStart: 0, sourceEnd: page.text.length, separator: '', groupKey: 'fallback', locators: [] }];
}

function splitOversizedUnit(unit: SourceUnit): ChunkUnit[] {
  if (unit.text.length <= KNOWLEDGE_CHUNK_MAX_CHARS || !unit.text.includes('\n')) return [unit];
  const result: ChunkUnit[] = [];
  let start = 0;
  while (start < unit.text.length) {
    if (unit.text.length - start <= KNOWLEDGE_CHUNK_MAX_CHARS) {
      result.push({ ...unit, text: unit.text.slice(start), sourceStart: unit.sourceStart + start, sourceEnd: unit.sourceEnd, locators: unit.locators.map((locator) => ({ ...locator, start: Math.max(locator.start, unit.sourceStart + start), partial: true as const })), splitElement: true });
      break;
    }
    const beforeLimit = unit.text.lastIndexOf('\n', start + KNOWLEDGE_CHUNK_MAX_CHARS);
    const boundary = beforeLimit > start ? beforeLimit : unit.text.indexOf('\n', start + KNOWLEDGE_CHUNK_MAX_CHARS);
    if (boundary < 0) return [unit];
    const end = boundary + 1;
    result.push({ ...unit, text: unit.text.slice(start, end), sourceStart: unit.sourceStart + start, sourceEnd: unit.sourceStart + end, locators: unit.locators.map((locator) => ({ ...locator, start: Math.max(locator.start, unit.sourceStart + start), end: Math.min(locator.end, unit.sourceStart + end), partial: true as const })).filter((locator) => locator.end > locator.start), splitElement: true });
    start = end;
  }
  return result;
}

function locatorForChunk(draft: LocatorDraft, unit: ChunkUnit, chunkStart: number, pageNumber: number, fallback: number): KnowledgeChunkSourceLocator {
  const start = Math.max(draft.start, unit.sourceStart);
  const end = Math.min(draft.end, unit.sourceEnd);
  const partial = draft.partial || unit.splitElement || start !== draft.start || end !== draft.end ? true : undefined;
  const table = tableMetadata(draft.element);
  return {
    pageNumber, space: KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM, bbox: draft.element.bbox!, sourceElementId: sourceId(draft.element, pageNumber, fallback),
    elementType: draft.element.type, readingOrder: draft.element.readingOrder ?? fallback,
    chunkStart: chunkStart + start - unit.sourceStart, chunkEnd: chunkStart + end - unit.sourceStart,
    sourceStart: start, sourceEnd: end, ...(table ? { table } : {}), ...(partial ? { partial: true } : {}),
  };
}

function emitChunk(units: readonly ChunkUnit[], chunkIndex: number): KnowledgeChunkDraft {
  const separator = units[0]?.separator ?? '\n\n';
  const text = units.map((unit) => unit.text).join(separator);
  const locators: KnowledgeChunkSourceLocator[] = [];
  let chunkOffset = 0;
  let fallback = 0;
  for (const unit of units) {
    for (const draft of unit.locators) {
      fallback += 1;
      const start = Math.max(draft.start, unit.sourceStart);
      const end = Math.min(draft.end, unit.sourceEnd);
      if (end > start) locators.push(locatorForChunk(draft, unit, chunkOffset, unit.pageNumber, fallback));
    }
    chunkOffset += unit.text.length + (unit === units[units.length - 1] ? 0 : separator.length);
  }
  return { pageStart: units[0].pageNumber, pageEnd: units[units.length - 1].pageNumber, text, charStart: Math.min(...units.map((unit) => unit.sourceStart)), charEnd: Math.max(...units.map((unit) => unit.sourceEnd)), chunkIndex, sourceLocators: locators };
}

export function buildKnowledgeChunks(pages: readonly KnowledgeExtractedPage[]): readonly KnowledgeChunkDraft[] {
  const chunks: KnowledgeChunkDraft[] = [];
  let chunkIndex = 0;
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const units = unitsForPage(page).flatMap(splitOversizedUnit);
    let pending: ChunkUnit[] = [];
    let pendingLength = 0;
    const flush = () => { if (pending.length > 0) chunks.push(emitChunk(pending, chunkIndex++)); pending = []; pendingLength = 0; };
    for (const unit of units) {
      if (unit.splitElement) { flush(); chunks.push(emitChunk([unit], chunkIndex++)); continue; }
      if (pending.length > 0 && unit.groupKey !== pending[0].groupKey) flush();
      const nextLength = pendingLength + (pending.length === 0 ? 0 : unit.separator.length) + unit.text.length;
      const smallTail = unit.text.length < 256 && KNOWLEDGE_CHUNK_MAX_CHARS - pendingLength >= unit.text.length;
      if (pending.length > 0 && nextLength > KNOWLEDGE_CHUNK_MAX_CHARS) flush();
      else if (pending.length > 0 && pendingLength >= KNOWLEDGE_CHUNK_TARGET_CHARS && !smallTail) flush();
      pending.push(unit);
      pendingLength += (pending.length === 1 ? 0 : unit.separator.length) + unit.text.length;
    }
    flush();
  }
  return chunks;
}
