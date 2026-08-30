import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';
import type { KnowledgeSourcePageRequest } from './knowledgeSourceNoteDraft';
import {
  isCanonicalPageRotation,
  normalizeStorableRegion,
  type KnowledgePageRotation,
  type NormalizedPageRegion,
} from './knowledgePageRegionGeometry';

/**
 * P6J-F8-B1 -- what a dragged text source clip carries between the Knowledge
 * reader and the canvas. Pure and browser-safe: no React, no fetch, no
 * Supabase, no DOM, so reader, controller and tests share one shape.
 *
 * PARSING HERE IS CLIENT HYGIENE, NEVER PERSISTENCE AUTHORITY. A payload that
 * survives every check below still proves nothing: the server re-reads its own
 * stored page and re-derives the canonical quote before any row is inserted.
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
 * `kind` is the ONE discriminant: an area payload reaching a build that
 * cannot handle it is rejected outright by its own arm, never silently read
 * as a text clip fabricating offsets it never had.
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
 * F9 area arm. Deliberately as thin as the text arm's own evidence: a
 * normalized SOURCE rectangle and the rotation it was proved against, and
 * nothing else -- no OCR, no extracted text, no image bytes, no Storage path.
 * F9 already performs no OCR, so an area clip quotes nothing; the server's
 * own region branch already produces a blank-content, provenance-only draft.
 */
export interface KnowledgeSourceAreaClipPayload {
  readonly kind: 'area';
  readonly sourceDocumentId: string;
  readonly originalFilename: string;
  readonly pageNumber: number;
  readonly region: NormalizedPageRegion;
  readonly appliedRotation: KnowledgePageRotation;
}

export type KnowledgeSourceClipPayload = KnowledgeSourceTextClipPayload | KnowledgeSourceAreaClipPayload;

/** The serialized form. One place builds it, one place reads it. */
export function buildKnowledgeSourceClipTransfer(payload: KnowledgeSourceClipPayload): string {
  return JSON.stringify(payload);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Every rejection returns null: no partial recovery, no repair. A clip that
 * cannot be proven whole is not a clip -- the alternative is a citation
 * pointing somewhere nobody selected.
 */
export function parseKnowledgeSourceClipPayload(raw: string | null | undefined): KnowledgeSourceClipPayload | null {
  if (!isNonEmptyString(raw)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON is a foreign or corrupted transfer, never an error to report.
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  // Identity fields both arms share -- checked once, before the kind switch
  // decides what else a payload must carry.
  if (!isNonEmptyString(record.sourceDocumentId)) return null;
  if (typeof record.originalFilename !== 'string') return null;
  const { pageNumber } = record;
  if (!Number.isInteger(pageNumber) || (pageNumber as number) < 1) return null;

  if (record.kind === 'text') {
    const { charStart, charEnd, selectedText } = record;
    if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
    // Half-open [start, end): an empty or inverted span is not a selection.
    if ((charStart as number) < 0 || (charStart as number) >= (charEnd as number)) return null;
    if (!isNonEmptyString(selectedText)) return null;
    // The same cap the reader refuses at and the server enforces again.
    if (selectedText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;

    return {
      kind: 'text',
      sourceDocumentId: record.sourceDocumentId,
      originalFilename: record.originalFilename,
      pageNumber: pageNumber as number,
      charStart: charStart as number,
      charEnd: charEnd as number,
      selectedText,
    };
  }

  if (record.kind === 'area') {
    // The SAME authorities the server-owned crop route re-validates a
    // persisted region with -- one definition of "a storable rectangle",
    // never a second geometry check here.
    const region = normalizeStorableRegion(record.region);
    if (region === null) return null;
    if (!isCanonicalPageRotation(record.appliedRotation)) return null;

    return {
      kind: 'area',
      sourceDocumentId: record.sourceDocumentId,
      originalFilename: record.originalFilename,
      pageNumber: pageNumber as number,
      region,
      appliedRotation: record.appliedRotation,
    };
  }

  // Unknown kinds fail closed rather than defaulting to text: an 'area'
  // payload read as a text clip would fabricate offsets it never carried.
  return null;
}

/**
 * The dropped clip as the request the EXISTING note-draft builder already
 * takes, so the drag and button paths -- and now both clip kinds -- share one
 * draft authority.
 *
 * `pageText` is empty on purpose for both arms: a text clip always carries a
 * selection, which makes the quote server-derived and the page text unused,
 * and an area clip quotes nothing at all (F9 performs no OCR). Passing text
 * here would look harmless and would silently become a client-supplied quote
 * the moment either branch changed.
 */
export function knowledgeSourceClipPageRequest(payload: KnowledgeSourceClipPayload): KnowledgeSourcePageRequest {
  if (payload.kind === 'area') {
    return {
      sourceDocumentId: payload.sourceDocumentId,
      originalFilename: payload.originalFilename,
      pageNumber: payload.pageNumber,
      pageText: '',
      selection: null,
      region: {
        region: payload.region,
        appliedRotation: payload.appliedRotation,
      },
    };
  }
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
