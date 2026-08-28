// @vitest-environment jsdom
/**
 * P6J-F9-C2 -- the region crop as seen through the real card shell, not just
 * the standalone marker. freeformKnowledgeSourceMarker.integration.test.tsx
 * already proves the crop's presence/absence/order via the shared marker
 * directly (P1-P5, P9-P11); this file proves the surrounding card survives
 * it, mirroring PostCardContent.commentPermission.test.tsx's own full-mount
 * pattern.
 */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostCardContent from './PostCardContent';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';
import type { Padlet } from '@/types/collabboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }) }));

const PADLET_ID = 'f1a5c1d0-0000-4000-8000-000000000001';
const padlet = {
  id: PADLET_ID, title: 'Note', content: 'Hello world', type: 'text', metadata: {},
} as unknown as Padlet;

function pageRegionReference(id: string): SourceReference {
  return {
    id, targetPadletId: PADLET_ID, sourceDocumentId: 'doc-1', pageStart: 3, pageEnd: 3,
    quoteText: null, quoteHash: null, charStart: null, charEnd: null,
    region: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 }, locator: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as SourceReference;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(references: readonly SourceReference[]) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeSourceReferenceProvider index={buildKnowledgeSourceReferenceIndex(references)}>
        <PostCardContent padlet={padlet} />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  return host!;
}

describe('P6J-F9-C2 PostCardContent + region crop', () => {
  it('P6/P7: a crop image failure removes only the crop, leaving body and marker intact', () => {
    const container = mount([pageRegionReference('ref-1')]);
    expect(container.querySelector('[data-knowledge-source-region-crop]')).not.toBeNull();

    const img = container.querySelector('img[aria-hidden="true"]')!;
    act(() => { img.dispatchEvent(new Event('error')); });

    expect(container.querySelector('[data-knowledge-source-region-crop]')).toBeNull();
    expect(container.querySelector('.tiptap')!.textContent).toBe('Hello world');
    expect(container.querySelector('[data-knowledge-source-marker]')).not.toBeNull();
  });

  it('P8: a card with no source references is entirely unaffected', () => {
    const container = mount([]);
    expect(container.querySelector('[data-knowledge-source-region-crop]')).toBeNull();
    expect(container.querySelector('[data-knowledge-source-marker]')).toBeNull();
    expect(container.querySelector('.tiptap')!.textContent).toBe('Hello world');
  });

  it('P12: the crop never reaches the Note body -- body renders exactly the stored content', () => {
    const container = mount([pageRegionReference('ref-1')]);
    const body = container.querySelector('.tiptap')!;
    expect(body.innerHTML).toBe('Hello world');
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).not.toContain('/crop');
  });
});
