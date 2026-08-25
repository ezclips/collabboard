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

/** Stable empty result so a padlet with no references never re-renders on identity. */
const NO_REFERENCES: readonly SourceReference[] = [];
const NO_BACKLINKS: readonly KnowledgeSourceBacklink[] = [];

export function KnowledgeSourceReferenceProvider({
  index,
  backlinks = EMPTY_KNOWLEDGE_SOURCE_BACKLINK_INDEX,
  children,
}: {
  index: KnowledgeSourceReferenceIndex;
  /** Optional so a surface that only needs forward provenance stays unchanged. */
  backlinks?: KnowledgeSourceBacklinkIndex;
  children: React.ReactNode;
}) {
  // Both indexes are already new Maps only when they actually changed, so this
  // passes the owner's values straight through rather than copying them.
  return (
    <KnowledgeSourceReferenceContext.Provider value={index}>
      <KnowledgeSourceBacklinkContext.Provider value={backlinks}>
        {children}
      </KnowledgeSourceBacklinkContext.Provider>
    </KnowledgeSourceReferenceContext.Provider>
  );
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
