import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';
import type { KnowledgeSourcePageRequest } from './knowledgeSourceNoteDraft';
import { normalizeStorableRegion, type NormalizedPageRegion } from './knowledgePageRegionGeometry';

/**
 * P6J-F8-B1 -- what a dragged source clip carries between the Knowledge
 * reader and the canvas. Pure and browser-safe: no React, no fetch, no
 * Supabase, no DOM, so reader, controller and tests share one shape.
 *
 * PARSING HERE IS CLIENT HYGIENE, NEVER PERSISTENCE AUTHORITY. A payload that
 * survives every check below still proves nothing: the server re-reads its own
 * stored page and re-derives the canonical quote -- or re-crops from its own
 * stored page derivative -- before anything is written.
 * What this buys is that a malformed, foreign or forged transfer fails closed
 * on the client before it can even reach that request.
 */

/**
 * One dedicated transfer type. Deliberately NOT `text/plain`: every drag from
 * every application carries text/plain, so honouring it would let arbitrary
 * dropped text impersonate a Knowledge citation.
 */
export const KNOWLEDGE_SOURCE_CLIP_MIME = 'application/collabboard-knowledge-clip';

/**
 * The text arm, unchanged since B1. `kind` was reserved so the R6B area clip
 * could be an added arm rather than a parallel payload -- and so an area
 * payload reaching a surface that only understands text is rejected outright,
 * never read as a text clip.
 */
export interface KnowledgeSourceTextClipPayload {
  readonly kind: 'text';
  readonly sourceDocumentId: string;
  readonly originalFilename: string;
  readonly pageNumber: number;
  /**
   * The B4-B1 contract, unchanged and un-recomputed: page-relative, UTF-16
   * code units, half-open [charStart, charEnd).
   */
  readonly charStart: number;
  readonly charEnd: number;
  /**
   * What the reader proved it selected. Verification evidence only -- the
   * server compares it against its own slice and stores that slice instead.
   */
  readonly selectedText: string;
}

/**
 * R6B -- the area arm. IDENTITY AND RECTANGLE ONLY.
 *
 * There are deliberately no image bytes, no data URL, no base64 and no Storage
 * path here. A crop of a private Knowledge PDF must never be reconstructible
 * from a DataTransfer: the drop carries only what the server needs to re-crop
 * from its OWN stored page derivative, after it has re-authorised the board.
 *
 * `region` is the page's INTRINSIC UNROTATED normalized rectangle -- exactly
 * what KnowledgeDocumentPageRegionSelector emits and what the existing crop
 * authority already stores. The client's applied rotation is deliberately not
 * carried: the server reads the persisted page rotation instead.
 */
export interface KnowledgeSourceAreaClipPayload {
  readonly kind: 'area';
  readonly sourceDocumentId: string;
  readonly originalFilename: string;
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
}

/** One transfer shape, two arms. Nothing else may be dropped as a clip. */
export type KnowledgeSourceClipPayload = KnowledgeSourceTextClipPayload | KnowledgeSourceAreaClipPayload;

/** The serialized form. One place builds it, one place reads it. */
export function buildKnowledgeSourceClipTransfer(payload: KnowledgeSourceClipPayload): string {
  return JSON.stringify(payload);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function clipRecord(raw: string | null | undefined): Record<string, unknown> | null {
  if (!isNonEmptyString(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON is a foreign or corrupted transfer, never an error to report.
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/** Shared by both arms: which document, which page, under what name. */
function parseClipIdentity(
  record: Record<string, unknown>,
): { sourceDocumentId: string; originalFilename: string; pageNumber: number } | null {
  if (!isNonEmptyString(record.sourceDocumentId)) return null;
  if (typeof record.originalFilename !== 'string') return null;
  const { pageNumber } = record;
  if (!Number.isInteger(pageNumber) || (pageNumber as number) < 1) return null;
  return {
    sourceDocumentId: record.sourceDocumentId,
    originalFilename: record.originalFilename,
    pageNumber: pageNumber as number,
  };
}

/**
 * The ONE parse authority for the dedicated clip type. Both arms are decided
 * here, so no surface can invent a third reading of the same transfer.
 *
 * Every rejection returns null: no partial recovery, no repair. A clip that
 * cannot be proven whole is not a clip -- the alternative is a citation
 * pointing somewhere nobody selected, or a crop of a page nobody chose.
 */
export function parseKnowledgeSourceClipPayload(raw: string | null | undefined): KnowledgeSourceClipPayload | null {
  const record = clipRecord(raw);
  if (record === null) return null;
  // An unknown kind fails closed rather than defaulting to either arm: an
  // 'area' payload read as a text clip would fabricate offsets it never
  // carried, and a text payload read as an area would fabricate a rectangle.
  if (record.kind === 'text') return parseTextArm(record);
  if (record.kind === 'area') return parseAreaArm(record);
  return null;
}

function parseTextArm(record: Record<string, unknown>): KnowledgeSourceTextClipPayload | null {
  const identity = parseClipIdentity(record);
  if (identity === null) return null;

  const { charStart, charEnd, selectedText } = record;
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  // Half-open [start, end): an empty or inverted span is not a selection.
  if ((charStart as number) < 0 || (charStart as number) >= (charEnd as number)) return null;
  if (!isNonEmptyString(selectedText)) return null;
  // The same cap the reader refuses at and the server enforces again.
  if (selectedText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;

  return {
    kind: 'text',
    sourceDocumentId: identity.sourceDocumentId,
    originalFilename: identity.originalFilename,
    pageNumber: identity.pageNumber,
    charStart: charStart as number,
    charEnd: charEnd as number,
    selectedText,
  };
}

function parseAreaArm(record: Record<string, unknown>): KnowledgeSourceAreaClipPayload | null {
  const identity = parseClipIdentity(record);
  if (identity === null) return null;
  // The one rectangle authority, reused rather than re-derived: finite, inside
  // the unit page, positive extent. A rectangle that fails it is not a region.
  const region = normalizeStorableRegion(record.region);
  if (region === null) return null;
  // Rebuilt field by field. Spreading `record` would carry whatever a forged
  // transfer chose to attach -- including the bytes or Storage path this arm
  // exists specifically to refuse.
  return {
    kind: 'area',
    sourceDocumentId: identity.sourceDocumentId,
    originalFilename: identity.originalFilename,
    pageNumber: identity.pageNumber,
    region: { x: region.x, y: region.y, width: region.width, height: region.height },
  };
}

/**
 * Narrowing parsers for surfaces that handle exactly one arm. A surface that
 * only understands text must see an area clip as "not mine" -- never as a
 * malformed text clip, and never as something to coerce.
 */
export function parseKnowledgeSourceTextClipPayload(
  raw: string | null | undefined,
): KnowledgeSourceTextClipPayload | null {
  const payload = parseKnowledgeSourceClipPayload(raw);
  return payload !== null && payload.kind === 'text' ? payload : null;
}

export function parseKnowledgeSourceAreaClipPayload(
  raw: string | null | undefined,
): KnowledgeSourceAreaClipPayload | null {
  const payload = parseKnowledgeSourceClipPayload(raw);
  return payload !== null && payload.kind === 'area' ? payload : null;
}

/**
 * The dropped clip as the request the EXISTING note-draft builder already
 * takes, so the drag and button paths share one draft authority.
 *
 * `pageText` is empty on purpose: it is read only to snapshot a page-only
 * quote, and a clip always carries a selection, which makes the quote
 * server-derived and the page text unused. Passing the selected text here
 * would look harmless and would silently become a client-supplied quote the
 * moment that branch changed.
 */
export function knowledgeSourceClipPageRequest(payload: KnowledgeSourceTextClipPayload): KnowledgeSourcePageRequest {
  return {
    sourceDocumentId: payload.sourceDocumentId,
    originalFilename: payload.originalFilename,
    pageNumber: payload.pageNumber,
    pageText: '',
    selection: {
      charStart: payload.charStart,
      charEnd: payload.charEnd,
      selectedText: payload.selectedText,
    },
  };
}
