// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeSourceNotesPanel from './KnowledgeSourceNotesPanel';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import {
  buildKnowledgeSourceNoteSummaryIndex,
  type KnowledgeSourceNotePost,
} from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';
import type { NormalizedPageRegion } from '@/lib/domain/knowledge/knowledgePageRegionGeometry';

const DOC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const N1 = '11111111-1111-4111-8111-111111111111';
const N2 = '22222222-2222-4222-8222-222222222222';
const REGION: NormalizedPageRegion = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

const componentSource = fs.readFileSync(
  path.join(process.cwd(), 'components/collabboard/KnowledgeSourceNotesPanel.tsx'), 'utf8');

let sequence = 0;
function reference(overrides: {
  targetPadletId: string; sourceDocumentId: string; pageStart: number; pageEnd?: number;
  quoteText?: string | null; charStart?: number | null; charEnd?: number | null; region?: NormalizedPageRegion | null;
}): SourceReference {
  sequence += 1;
  return {
    id: `ref-${sequence}`,
    targetPadletId: overrides.targetPadletId,
    sourceDocumentId: overrides.sourceDocumentId,
    pageStart: overrides.pageStart,
    pageEnd: overrides.pageEnd ?? overrides.pageStart,
    quoteText: overrides.quoteText ?? null,
    quoteHash: null,
    charStart: overrides.charStart ?? null,
    charEnd: overrides.charEnd ?? null,
    region: overrides.region ?? null,
    locator: null,
    createdAt: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`,
  } as unknown as SourceReference;
}

function post(id: string, title: string, content = '', metadata: KnowledgeSourceNotePost['metadata'] = null): KnowledgeSourceNotePost {
  return { id, type: 'text', title, content, metadata };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(references: readonly SourceReference[], posts: readonly KnowledgeSourceNotePost[], onOpenNote = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const summaries = buildKnowledgeSourceNoteSummaryIndex(references, posts);
  act(() => {
    root!.render(
      <KnowledgeSourceReferenceProvider index={new Map()} noteSummaries={summaries}>
        <KnowledgeSourceNotesPanel documentId={DOC_A} onOpenNote={onOpenNote} />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  return { container: host, onOpenNote };
}

const items = (c: HTMLElement) => c.querySelectorAll('[data-knowledge-source-note-item]');
const itemButton = (c: HTMLElement, targetPadletId: string) =>
  c.querySelector(`[data-knowledge-source-note-item="${targetPadletId}"] button`) as HTMLButtonElement;

describe('Source Notes panel', () => {
  it('1: renders the Source Notes header', () => {
    const { container } = mount([], []);
    expect(container.textContent).toContain('Source Notes');
  });

  it('2: renders the empty state when nothing cites this document', () => {
    const { container } = mount([], []);
    expect(container.textContent).toContain('No notes linked to this source yet.');
  });

  it('3: one card per summary', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 }),
        reference({ targetPadletId: N2, sourceDocumentId: DOC_A, pageStart: 2 })],
      [post(N1, 'First'), post(N2, 'Second')],
    );
    expect(items(container)).toHaveLength(2);
  });

  it('4: title renders as plain text', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 })],
      [post(N1, 'My Note Title')],
    );
    expect(container.textContent).toContain('My Note Title');
  });

  it('5: the body excerpt renders as visible text', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 })],
      [post(N1, 'Title', 'A distinct body excerpt')],
    );
    expect(container.textContent).toContain('A distinct body excerpt');
  });

  it('6: the accent colour from the summary is applied to the card', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 })],
      [post(N1, 'Title', '', { topStrip: '#ff0000' })],
    );
    const button = itemButton(container, N1);
    expect(button.style.borderLeftColor).toBe('rgb(255, 0, 0)');
  });

  it('7: the aggregated page hint renders', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 }),
        reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 3, pageEnd: 4 })],
      [post(N1, 'Title')],
    );
    expect(container.textContent).toContain('pp. 1, 3–4');
  });

  it('8: an exact-text reference shows a quote detail', () => {
    const { container } = mount(
      [reference({
        targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 2,
        quoteText: 'the selected quote', charStart: 0, charEnd: 19,
      })],
      [post(N1, 'Title')],
    );
    expect(container.textContent).toContain('the selected quote');
  });

  it('9: a page-only reference renders without any quote text', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 5 })],
      [post(N1, 'Title')],
    );
    const text = itemButton(container, N1).textContent ?? '';
    expect(text).toContain('p. 5');
    expect(text).not.toContain('"');
  });

  it('10: an area reference renders as an Area locator with its page', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 3, region: REGION })],
      [post(N1, 'Title')],
    );
    expect(container.textContent).toContain('Area · p. 3');
  });

  it('11: multiple references to this document stay inside the one item', () => {
    const { container } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 }),
        reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 2 }),
        reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 3 })],
      [post(N1, 'Title')],
    );
    expect(items(container)).toHaveLength(1);
    expect(itemButton(container, N1).querySelectorAll('li')).toHaveLength(3);
  });

  it('12: clicking an item calls onOpenNote with the exact target padlet id, and nothing else', () => {
    const { container, onOpenNote } = mount(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 })],
      [post(N1, 'Title')],
    );
    act(() => { itemButton(container, N1).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledWith(N1);
  });

  it('13: no mutation callback exists on the component or in its source', () => {
    for (const forbidden of ['onEdit', 'onDelete', 'onCreate', 'onMutate', 'supabase', '.insert(', '.update(', '.delete(']) {
      expect(componentSource, forbidden).not.toContain(forbidden);
    }
  });

  it('14: no raster component is imported or rendered', () => {
    for (const forbidden of ['KnowledgeDocumentPageImage', 'KnowledgeSourceRegionCrop', 'knowledgePageImageUrl']) {
      expect(componentSource, forbidden).not.toContain(forbidden);
    }
  });

  it('15: never uses dangerouslySetInnerHTML', () => {
    expect(componentSource).not.toContain('dangerouslySetInnerHTML');
  });
});
