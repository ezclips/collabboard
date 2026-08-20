import type {
  KnowledgeBoundingBox,
  KnowledgeElementMetadata,
  KnowledgeExtractedElement,
  KnowledgeExtractedPage,
  KnowledgePageGeometry,
  KnowledgePdfElementType,
  KnowledgePdfExtractionResult,
  KnowledgePdfParserIdentity,
} from '../../domain/knowledge/pdfExtraction';
import { KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM } from '../../domain/knowledge/pdfExtraction';

type JsonRecord = Record<string, unknown>;

export interface OpenDataLoaderNormalizationOptions {
  readonly contentSha256: string;
  readonly parser: KnowledgePdfParserIdentity;
  readonly pageGeometry?: Readonly<Record<number, KnowledgePageGeometry>>;
  readonly rawArtifact?: KnowledgePdfExtractionResult['rawArtifact'];
}

interface NormalizationState {
  readonly readingOrderByPage: Map<number, number>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asPositiveInteger(value: unknown): number | undefined {
  const number = asFiniteNumber(value);
  return number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined;
}

function asSourceElementId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.replace(/\r\n?/g, '\n');
}

function rawTypeOf(value: JsonRecord): string | undefined {
  return asString(value.type)?.toLowerCase();
}

function normalizedTypeOf(rawType: string | undefined): KnowledgePdfElementType {
  switch (rawType) {
    case 'paragraph':
      return 'paragraph';
    case 'heading':
      return 'heading';
    case 'list':
      return 'list';
    case 'list item':
    case 'list-item':
      return 'list-item';
    case 'table':
      return 'table';
    case 'table cell':
    case 'table-cell':
      return 'table-cell';
    case 'caption':
      return 'caption';
    case 'image':
    case 'picture':
      return 'image';
    case 'formula':
      return 'formula';
    default:
      return 'other';
  }
}

function childRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sourceChildren(value: JsonRecord, rawType: string | undefined): JsonRecord[] {
  if (rawType === 'list') return childRecords(value['list items']);
  if (rawType === 'table') return childRecords(value.rows);
  if (rawType === 'table row') return childRecords(value.cells);
  return childRecords(value.kids);
}

function normalizeBoundingBox(value: unknown): KnowledgeBoundingBox | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const [left, bottom, right, top] = value.map(asFiniteNumber);
  if ([left, bottom, right, top].some((coordinate) => coordinate === undefined)) return undefined;
  return {
    left: left as number,
    bottom: bottom as number,
    right: right as number,
    top: top as number,
    coordinateSystem: KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM,
  };
}

function addMetadataValue(
  metadata: Record<string, string | number>,
  key: string,
  value: string | number | undefined,
): void {
  if (value !== undefined) metadata[key] = value;
}

function normalizeMetadata(
  value: JsonRecord,
  rawType: string | undefined,
  normalizedType: KnowledgePdfElementType,
): KnowledgeElementMetadata | undefined {
  const metadata: Record<string, string | number> = {};

  if (normalizedType === 'other' && rawType) addMetadataValue(metadata, 'sourceType', rawType);
  addMetadataValue(metadata, 'headingLevel', asPositiveInteger(value['heading level']));
  addMetadataValue(metadata, 'numberingStyle', asString(value['numbering style']));
  addMetadataValue(metadata, 'numberOfRows', asPositiveInteger(value['number of rows']));
  addMetadataValue(metadata, 'numberOfColumns', asPositiveInteger(value['number of columns']));
  addMetadataValue(metadata, 'rowNumber', asPositiveInteger(value['row number']));
  addMetadataValue(metadata, 'columnNumber', asPositiveInteger(value['column number']));
  addMetadataValue(metadata, 'rowSpan', asPositiveInteger(value['row span']));
  addMetadataValue(metadata, 'columnSpan', asPositiveInteger(value['column span']));

  const linkedContentSourceElementId = asSourceElementId(value['linked content id']);
  const previousTableSourceElementId = asSourceElementId(value['previous table id']);
  const nextTableSourceElementId = asSourceElementId(value['next table id']);
  addMetadataValue(metadata, 'linkedContentSourceElementId', linkedContentSourceElementId);
  addMetadataValue(metadata, 'previousTableSourceElementId', previousTableSourceElementId);
  addMetadataValue(metadata, 'nextTableSourceElementId', nextTableSourceElementId);

  return Object.keys(metadata).length > 0 ? (metadata as KnowledgeElementMetadata) : undefined;
}

function nextReadingOrder(state: NormalizationState, pageNumber: number): number {
  const next = (state.readingOrderByPage.get(pageNumber) ?? 0) + 1;
  state.readingOrderByPage.set(pageNumber, next);
  return next;
}

function elementText(
  value: JsonRecord,
  children: readonly KnowledgeExtractedElement[],
): string | undefined {
  const ownText = normalizeText(value.content);
  if (ownText !== undefined) return ownText;
  const childText = children
    .map((child) => child.text)
    .filter((text): text is string => text !== undefined && text !== '')
    .join('\n');
  return childText || undefined;
}

function normalizeChildren(
  value: JsonRecord,
  rawType: string | undefined,
  state: NormalizationState,
  pageNumber: number,
): KnowledgeExtractedElement[] {
  return sourceChildren(value, rawType).flatMap((child) => {
    // Rows are structural containers in the source shape. The public
    // contract preserves their cells directly under the table instead of
    // exposing a parser-specific table-row type.
    if (rawTypeOf(child) === 'table row') {
      return childRecords(child.cells).flatMap(
        (cell) => normalizeElement(cell, state, pageNumber) ?? [],
      );
    }
    return normalizeElement(child, state, pageNumber) ?? [];
  });
}

function normalizeElement(
  value: JsonRecord,
  state: NormalizationState,
  inheritedPageNumber?: number,
): KnowledgeExtractedElement | undefined {
  const pageNumber = asPositiveInteger(value['page number']) ?? inheritedPageNumber;
  if (pageNumber === undefined) return undefined;

  const rawType = rawTypeOf(value);
  const type = normalizedTypeOf(rawType);
  const readingOrder = nextReadingOrder(state, pageNumber);
  const children = normalizeChildren(value, rawType, state, pageNumber);
  const text = elementText(value, children);
  const sourceElementId = asSourceElementId(value.id);
  const metadata = normalizeMetadata(value, rawType, type);
  const bbox = normalizeBoundingBox(value['bounding box']);

  return {
    ...(sourceElementId ? { sourceElementId } : {}),
    type,
    pageNumber,
    ...(text ? { text } : {}),
    ...(bbox ? { bbox } : {}),
    readingOrder,
    ...(metadata ? { metadata } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function pageNumbersIn(value: unknown, pages: Set<number>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => pageNumbersIn(item, pages));
    return;
  }
  if (!isRecord(value)) return;

  const pageNumber = asPositiveInteger(value['page number']);
  if (pageNumber !== undefined) pages.add(pageNumber);
  ['kids', 'list items', 'rows', 'cells'].forEach((key) => pageNumbersIn(value[key], pages));
}

function pageGeometryFor(
  pageNumber: number,
  pageGeometry: Readonly<Record<number, KnowledgePageGeometry>> | undefined,
): KnowledgePageGeometry | undefined {
  const geometry = pageGeometry?.[pageNumber];
  if (!geometry) return undefined;
  if (!(geometry.widthPoints > 0) || !(geometry.heightPoints > 0)) return undefined;
  return geometry;
}

function normalizePage(
  pageNumber: number,
  elements: readonly KnowledgeExtractedElement[],
  pageGeometry: Readonly<Record<number, KnowledgePageGeometry>> | undefined,
): KnowledgeExtractedPage {
  const geometry = pageGeometryFor(pageNumber, pageGeometry);
  return {
    pageNumber,
    ...(geometry ? { widthPoints: geometry.widthPoints, heightPoints: geometry.heightPoints } : {}),
    ...(geometry?.rotation !== undefined ? { rotation: geometry.rotation } : {}),
    text: elements
      .map((element) => element.text)
      .filter((text): text is string => text !== undefined && text !== '')
      .join('\n\n'),
    elements,
  };
}

/**
 * Normalize the documented OpenDataLoader JSON shape without importing or
 * executing the OpenDataLoader runtime.
 */
export function normalizeOpenDataLoaderPdf(
  input: unknown,
  options: OpenDataLoaderNormalizationOptions,
): KnowledgePdfExtractionResult {
  const root = isRecord(input) ? input : {};
  const kids = childRecords(root.kids);
  const state: NormalizationState = { readingOrderByPage: new Map() };
  const elementsByPage = new Map<number, KnowledgeExtractedElement[]>();

  kids.forEach((kid) => {
    const element = normalizeElement(kid, state);
    if (!element) return;
    const elements = elementsByPage.get(element.pageNumber) ?? [];
    elements.push(element);
    elementsByPage.set(element.pageNumber, elements);
  });

  const pageNumbers = new Set<number>(elementsByPage.keys());
  pageNumbersIn(kids, pageNumbers);
  const declaredPageCount = asPositiveInteger(root['number of pages']) ?? 0;
  const highestElementPage = Math.max(0, ...pageNumbers);
  const pageCount = Math.max(declaredPageCount, highestElementPage);
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    return normalizePage(pageNumber, elementsByPage.get(pageNumber) ?? [], options.pageGeometry);
  });

  return {
    parser: options.parser,
    document: {
      contentSha256: options.contentSha256,
      pageCount,
      ...(asString(root.title) ? { title: asString(root.title) } : {}),
      ...(asString(root.author) ? { author: asString(root.author) } : {}),
    },
    pages,
    citationReady:
      pages.length > 0 && pages.every((page) => page.widthPoints !== undefined && page.heightPoints !== undefined),
    ...(options.rawArtifact ? { rawArtifact: options.rawArtifact } : {}),
  };
}
