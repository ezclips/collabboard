import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../core/ids';
import type { SourceReference } from './knowledgePersistence';
import { normalizeStorableRegion } from './knowledgePageRegionGeometry';

/**
 * Source references grouped by the Note they annotate.
 *
 * Read state only. Nothing here is persisted: durable provenance lives in
 * `source_references` alone and must never be copied onto a padlet row or into
 * padlet metadata.
 *
 * The external contract is deliberately `ReadonlyMap` of `readonly` arrays --
 * every operation returns a new index, so a caller holding an older one keeps
 * seeing exactly what it saw before.
 */
export type KnowledgeSourceReferenceIndex = ReadonlyMap<string, readonly SourceReference[]>;

/**
 * The order the reader already asked the database for: `created_at` ascending,
 * then `id`. Re-applying it locally means an optimistically inserted reference
 * lands where a reload would have put it, instead of merely at the end.
 */
export function compareKnowledgeSourceReferences(a: SourceReference, b: SourceReference): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Groups a flat reference list by target padlet id.
 *
 * A padlet with no references gets no key at all rather than an empty array, so
 * "has provenance" is a plain `has()` and never a length check.
 */
export function buildKnowledgeSourceReferenceIndex(
  references: readonly SourceReference[],
): KnowledgeSourceReferenceIndex {
  const index = new Map<string, SourceReference[]>();

  for (const reference of references) {
    const key = String(reference.targetPadletId);
    const bucket = index.get(key);
    if (bucket) bucket.push(reference);
    else index.set(key, [reference]);
  }

  for (const bucket of index.values()) bucket.sort(compareKnowledgeSourceReferences);

  return index;
}

/**
 * Adds one reference to its target's bucket, returning a new index.
 *
 * Identity is the row id. Two citations of the same document and page are two
 * distinct references and both are kept; only a repeat of the same row id is
 * absorbed, which is what makes this safe to call after a write whose result a
 * later board load may also return.
 */
export function upsertKnowledgeSourceReference(
  index: KnowledgeSourceReferenceIndex,
  reference: SourceReference,
): KnowledgeSourceReferenceIndex {
  const key = String(reference.targetPadletId);
  const existing = index.get(key) ?? [];

  // Neither the previous Map nor the previous array is touched: the bucket is
  // rebuilt and only this one key is replaced.
  const replaced = existing.some((current) => current.id === reference.id);
  const bucket = (replaced
    ? existing.map((current) => (current.id === reference.id ? reference : current))
    : [...existing, reference]
  ).sort(compareKnowledgeSourceReferences);

  const next = new Map(index);
  next.set(key, bucket);
  return next;
}

/** The references for one padlet, or an empty list when it has none. */
export function knowledgeSourceReferencesFor(
  index: KnowledgeSourceReferenceIndex,
  targetPadletId: string,
): readonly SourceReference[] {
  return index.get(targetPadletId) ?? [];
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Narrows an untrusted payload -- a write response body -- onto a
 * `SourceReference`, or returns null.
 *
 * Only the identifying and page fields are required, because those are what an
 * index entry is useless without. Everything else degrades to null rather than
 * rejecting the whole reference, matching how the rest of the Knowledge read
 * surfaces treat partial rows.
 */
export function parseKnowledgeSourceReference(value: unknown): SourceReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const id = optionalString(record.id);
  const targetPadletId = optionalString(record.targetPadletId);
  const sourceDocumentId = optionalString(record.sourceDocumentId);
  const pageStart = optionalInteger(record.pageStart);
  const pageEnd = optionalInteger(record.pageEnd);
  const createdAt = optionalString(record.createdAt);

  if (!id || !targetPadletId || !sourceDocumentId || !createdAt) return null;
  if (pageStart === null || pageEnd === null) return null;
  // The same minimum range invariants the write command checks before insert
  // and the table's CHECK constraints hold afterwards. A citation cannot begin
  // before page 1 or end before it started, so a payload claiming otherwise is
  // not a reference this index will carry into a badge.
  if (pageStart < 1 || pageEnd < pageStart) return null;

  return {
    id: asSourceReferenceId(id),
    targetPadletId: asPostId(targetPadletId),
    sourceDocumentId: asKnowledgeDocumentId(sourceDocumentId),
    pageStart,
    pageEnd,
    quoteText: optionalString(record.quoteText),
    quoteHash: optionalString(record.quoteHash),
    charStart: optionalInteger(record.charStart),
    charEnd: optionalInteger(record.charEnd),
    // P6J-F9-B2. Validated through the one region authority, never cast: an
    // out-of-bounds or partial rectangle from a response body degrades to no
    // region rather than becoming a locator nothing downstream could honour.
    region: normalizeStorableRegion(record.region),
    locator: record.locator === null || record.locator === undefined
      ? null
      : (record.locator as SourceReference['locator']),
    createdAt,
  };
}

/** The empty index, shared so an empty board does not allocate a new Map. */
export const EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX: KnowledgeSourceReferenceIndex = new Map();
