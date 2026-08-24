"use client";

import React, { createContext, useContext, useMemo } from 'react';
import {
  EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX,
  knowledgeSourceReferencesFor,
} from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import type { KnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
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

/** Stable empty result so a padlet with no references never re-renders on identity. */
const NO_REFERENCES: readonly SourceReference[] = [];

export function KnowledgeSourceReferenceProvider({
  index,
  children,
}: {
  index: KnowledgeSourceReferenceIndex;
  children: React.ReactNode;
}) {
  // The index itself is already a new Map only when it actually changed, so
  // this passes the owner's value straight through rather than copying it.
  return (
    <KnowledgeSourceReferenceContext.Provider value={index}>
      {children}
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
