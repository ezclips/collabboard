"use client";

import React, { createContext, useContext, useMemo } from 'react';
import {
  EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX,
  compareKnowledgeSourceReferences,
  knowledgeSourceReferencesFor,
} from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import type { KnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import {
  EMPTY_KNOWLEDGE_SOURCE_BACKLINK_INDEX,
  knowledgeSourceBacklinksForDocument,
} from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type {
  KnowledgeSourceBacklink,
  KnowledgeSourceBacklinkIndex,
} from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';
import type { KnowledgeSourceNoteColors } from '@/lib/domain/knowledge/knowledgeSourceHighlightColor';
import {
  EMPTY_KNOWLEDGE_SOURCE_NOTE_SUMMARY_INDEX,
  knowledgeSourceNoteSummariesForDocument,
} from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';
import type {
  KnowledgeSourceNoteSummary,
  KnowledgeSourceNoteSummaryIndex,
} from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';

/**
 * Read-only access to the board's source-reference index.
 *
 * CanvasClient owns the state and the loading; this only carries it to the
 * shared card and editor surfaces, which would otherwise need a new prop at
 * every one of PostCardContent's eleven call sites.
 *
 * Deliberately inert: no fetching, no persistence, no Supabase, no mutable
 * module cache. A surface outside the provider reads as "no provenance", which
 * is the same thing a failed reference load produces.
 */
const KnowledgeSourceReferenceContext = createContext<KnowledgeSourceReferenceIndex>(
  EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX,
);

/**
 * P6J-F6-B3 -- the same relation read backwards, for the Knowledge reader.
 * Derived by the same owner and carried on the same provider. Not a second
 * state system: nothing is stored twice, and nothing here can load.
 */
const KnowledgeSourceBacklinkContext = createContext<KnowledgeSourceBacklinkIndex>(
  EMPTY_KNOWLEDGE_SOURCE_BACKLINK_INDEX,
);

/**
 * P6J-F8-B3 -- padlet id -> its stored `metadata.cardColor`. Carried on the
 * same provider for the same reason as the other two: CanvasClient already
 * holds the posts, and the reader must not grow a second way to reach them.
 * Transport only -- nothing here validates, defaults or writes a colour.
 */
const KnowledgeSourceNoteColorContext = createContext<KnowledgeSourceNoteColors>(new Map());

/**
 * PDF Source Notes Panel -- Phase 1. Document id -> the Notes citing it, with
 * enough presentation-safe detail (title, body excerpt, accent, page hint,
 * per-reference kind) for a standalone panel. Carried on the SAME provider,
 * for the SAME reason as the other three: CanvasClient already holds both
 * halves the projection joins, and the reader must not grow a second way to
 * reach them, let alone a second fetch.
 */
const KnowledgeSourceNoteSummaryContext = createContext<KnowledgeSourceNoteSummaryIndex>(
  EMPTY_KNOWLEDGE_SOURCE_NOTE_SUMMARY_INDEX,
);

/** Stable empty result so a padlet with no references never re-renders on identity. */
const NO_REFERENCES: readonly SourceReference[] = [];
const NO_BACKLINKS: readonly KnowledgeSourceBacklink[] = [];
const NO_NOTE_COLORS: KnowledgeSourceNoteColors = new Map();
const NO_NOTE_SUMMARIES: readonly KnowledgeSourceNoteSummary[] = [];

export function KnowledgeSourceReferenceProvider({
  index,
  backlinks = EMPTY_KNOWLEDGE_SOURCE_BACKLINK_INDEX,
  noteColors = NO_NOTE_COLORS,
  noteSummaries = EMPTY_KNOWLEDGE_SOURCE_NOTE_SUMMARY_INDEX,
  children,
}: {
  index: KnowledgeSourceReferenceIndex;
  /** Optional so a surface that only needs forward provenance stays unchanged. */
  backlinks?: KnowledgeSourceBacklinkIndex;
  /** Optional: omitting it leaves every highlight on its neutral styling. */
  noteColors?: KnowledgeSourceNoteColors;
  /** Optional: omitting it leaves the Source Notes panel showing nothing. */
  noteSummaries?: KnowledgeSourceNoteSummaryIndex;
  children: React.ReactNode;
}) {
  // All four are already new Maps only when they actually changed, so this
  // passes the owner's values straight through rather than copying them.
  return (
    <KnowledgeSourceReferenceContext.Provider value={index}>
      <KnowledgeSourceBacklinkContext.Provider value={backlinks}>
        <KnowledgeSourceNoteColorContext.Provider value={noteColors}>
          <KnowledgeSourceNoteSummaryContext.Provider value={noteSummaries}>
            {children}
          </KnowledgeSourceNoteSummaryContext.Provider>
        </KnowledgeSourceNoteColorContext.Provider>
      </KnowledgeSourceBacklinkContext.Provider>
    </KnowledgeSourceReferenceContext.Provider>
  );
}

/**
 * The board's Note colours, for read-time highlight tinting only.
 *
 * Returns the owner's own Map. A surface outside the provider reads as "no
 * colours", which is the same neutral result as a board where nobody has
 * coloured anything.
 */
export function useKnowledgeSourceNoteColors(): KnowledgeSourceNoteColors {
  return useContext(KnowledgeSourceNoteColorContext);
}

/** Every reference on one padlet, in the index's own createdAt/id order. */
export function useKnowledgeSourceReferencesForPadlet(
  padletId: string | null | undefined,
): readonly SourceReference[] {
  const index = useContext(KnowledgeSourceReferenceContext);
  return useMemo(() => {
    if (!padletId) return NO_REFERENCES;
    const references = knowledgeSourceReferencesFor(index, padletId);
    return references.length > 0 ? references : NO_REFERENCES;
  }, [index, padletId]);
}

/**
 * P6J-F6-B4-B3 -- every citation OF one document, whichever Note made it.
 *
 * A projection of the index already in memory, nothing more: no request, no
 * second context, no module-level cache, and the supplied index is never
 * mutated. The reader needs this direction because a highlight belongs to a
 * page of a source, while the index is keyed by the citing padlet.
 *
 * Rows are NOT collapsed. Two Notes citing the same span are two citations, and
 * an overlap of two must be able to report a count of two.
 */
export function useKnowledgeSourceReferencesForDocument(
  documentId: string | null | undefined,
): readonly SourceReference[] {
  const index = useContext(KnowledgeSourceReferenceContext);
  return useMemo(() => {
    if (!documentId) return NO_REFERENCES;
    const found: SourceReference[] = [];
    for (const references of index.values()) {
      for (const reference of references) {
        if (String(reference.sourceDocumentId) === documentId) found.push(reference);
      }
    }
    if (found.length === 0) return NO_REFERENCES;
    // Map iteration order is bucket-insertion order; re-apply the index's own
    // createdAt/id ordering so the reader never depends on that accident.
    found.sort(compareKnowledgeSourceReferences);
    return found;
  }, [index, documentId]);
}

/**
 * Every Note citation of one document, one entry per reference row.
 *
 * Deliberately un-collapsed: the reader needs each citation's page range to
 * decide which page sections a Note belongs under, and that filtering runs per
 * rendered page -- where a hook cannot be called. Callers collapse to unique
 * Notes with the domain helpers.
 */
export function useKnowledgeSourceBacklinksForDocument(
  documentId: string | null | undefined,
): readonly KnowledgeSourceBacklink[] {
  const backlinks = useContext(KnowledgeSourceBacklinkContext);
  return useMemo(() => {
    const found = knowledgeSourceBacklinksForDocument(backlinks, documentId);
    return found.length > 0 ? found : NO_BACKLINKS;
  }, [backlinks, documentId]);
}

/**
 * PDF Source Notes Panel -- Phase 1. Every Note summary citing one document,
 * read straight from context: no request, no Supabase, no persistence. A
 * surface outside the provider, or a document with no citations, both read as
 * "no Source Notes", the same neutral result an empty board would produce.
 */
export function useKnowledgeSourceNoteSummariesForDocument(
  documentId: string | null | undefined,
): readonly KnowledgeSourceNoteSummary[] {
  const index = useContext(KnowledgeSourceNoteSummaryContext);
  return useMemo(() => {
    const found = knowledgeSourceNoteSummariesForDocument(index, documentId);
    return found.length > 0 ? found : NO_NOTE_SUMMARIES;
  }, [index, documentId]);
}
