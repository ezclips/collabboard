// @vitest-environment jsdom
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  SOURCE_NOTE_PLACEMENT_MIME, serializeKnowledgeSourceNotePlacementDrag,
  parseKnowledgeSourceNotePlacementDrag, canPlaceKnowledgeSourceNote,
} from '@/lib/domain/knowledge/knowledgeSourceNotePlacement';

import CanvasViewport from './canvas/ui/CanvasViewport';
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
  vi.unstubAllGlobals();
});

function mount(references: readonly SourceReference[], posts: readonly KnowledgeSourceNotePost[], onOpenNote = vi.fn(), canDragNote?: (id: string) => boolean) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const summaries = buildKnowledgeSourceNoteSummaryIndex(references, posts);
  act(() => {
    root!.render(
      <KnowledgeSourceReferenceProvider index={new Map()} noteSummaries={summaries}>
        <KnowledgeSourceNotesPanel documentId={DOC_A} onOpenNote={onOpenNote} canDragNote={canDragNote} />
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
    expect(container.textContent).toContain('From this source');
  });

  it('2: renders the empty state when nothing cites this document', () => {
    const { container } = mount([], []);
    expect(container.textContent).toContain('No notes from this source yet.');
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


describe('Source Context placement handle', () => {
  it('filters A/B/A citations and counts only this document', () => {
    const { container } = mount([
      reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 }),
      reference({ targetPadletId: N2, sourceDocumentId: 'document-b', pageStart: 1 }),
      reference({ targetPadletId: 'n3', sourceDocumentId: DOC_A, pageStart: 1 }),
    ], [post(N1, 'First'), post(N2, 'Other document'), post('n3', 'Third')]);
    expect(container.textContent).toContain('Notes · 2');
    expect(container.textContent).not.toContain('Other document');
    expect(container.textContent).not.toContain(N1);
  });

  it.each([true, false])('offers identity-only drag when eligible=%s; click still opens', (eligible) => {
    const { container, onOpenNote } = mount([
      reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1 }),
    ], [post(N1, 'Title', 'Private content')], vi.fn(), () => eligible);
    const button = itemButton(container, N1);
    expect(button.draggable).toBe(eligible);
    const dataTransfer = { setData: vi.fn(), effectAllowed: 'none' };
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    act(() => { button.dispatchEvent(event); });
    expect(onOpenNote).not.toHaveBeenCalled();
    if (eligible) {
      expect(dataTransfer.setData.mock.calls).toEqual([[
        'application/collabboard-source-note-placement', JSON.stringify({ targetPadletId: N1 }),
      ]]);
      expect(dataTransfer.effectAllowed).toBe('move');
    } else {
      expect(dataTransfer.setData).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    }
    act(() => { button.click(); });
    expect(onOpenNote).toHaveBeenCalledExactlyOnceWith(N1);
  });
});

const canvas = readFileSync('app/dashboard/canvas/[id]/CanvasClient.tsx', 'utf8');
const reader = readFileSync('components/collabboard/KnowledgeSourceReaderDrawer.tsx', 'utf8');

// Execute the actual CanvasClient callbacks with local command/state doubles.
// Avoid mounting the legacy controller and its unrelated network integrations.
function callback(name: string, bindings: Record<string, unknown>) {
  const ast = ts.createSourceFile('canvas.tsx', canvas, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name
      && node.initializer && ts.isCallExpression(node.initializer)) {
      body = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(body).not.toBe('');
  const js = ts.transpileModule(`const handler = ${body};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
}

const note = (id = 'N1', type = 'text', metadata = {}) => ({
  id, type, board_id: 'board', width: 280, height: 200,
  position_x: 1, position_y: 2, title: 'Title', content: '<p>Body</p>',
  metadata, library_item_id: null,
});

function harness(options: {
  posts?: ReturnType<typeof note>[]; editable?: boolean; freeform?: boolean;
  presentation?: string; succeeds?: boolean;
} = {}) {
  let posts = options.posts ?? [note()];
  const original = structuredClone(posts);
  const update = vi.fn().mockResolvedValue({ ok: options.succeeds ?? true, error: 'denied' });
  const coordinates = vi.fn().mockReturnValue({ x: 125.2, y: -75.7 });
  const clamp = vi.fn((point) => point);
  const canDrag = callback('canDragSourceNote', {
    canUseFreeformEditButton: options.editable ?? true,
    isFreeformLayout: options.freeform ?? true,
    knowledgeReaderPresentation: options.presentation ?? 'side-panel',
    padlets: posts, canvasId: 'board', canPlaceKnowledgeSourceNote,
  });
  const drop = callback('handleKnowledgeSourceNotePlacementDrop', {
    SOURCE_NOTE_PLACEMENT_MIME, parseKnowledgeSourceNotePlacementDrag,
    canDragSourceNote: canDrag, padlets: posts,
    getCanvasPointFromClient: coordinates, clampRectPositionToFreeformBounds: clamp,
    createUpdatePostPositionCommand: () => update, createPostsRepository: vi.fn(),
    setPadlets: (change: (prev: typeof posts) => typeof posts) => { posts = change(posts); },
    toast: { error: vi.fn() }, console: { error: vi.fn() },
  });
  const event = (raw = serializeKnowledgeSourceNotePlacementDrag('N1'), types = [SOURCE_NOTE_PLACEMENT_MIME]) => ({
    dataTransfer: { types, getData: () => raw }, clientX: 500, clientY: 300,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  });
  return { drop, canDrag, event, update, coordinates, clamp, original, posts: () => posts };
}

describe('source Note placement contract and actual Freeform handler', () => {
  it.each(['', '{', '{}', 'null', '[]', '1', '"N1"', '{"targetPadletId":null}',
    '{"targetPadletId":3}', '{"targetPadletId":""}', '{"targetPadletId":"  "}'])('rejects %s', async (raw) => {
    expect(parseKnowledgeSourceNotePlacementDrag(raw)).toBeNull();
    const h = harness();
    expect(h.drop(h.event(raw))).toBe(true);
    await Promise.resolve();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('moves the same id through position-only authority, preserving everything else', async () => {
    const h = harness();
    const event = h.event();
    expect(h.drop(event)).toBe(true);
    await Promise.resolve();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(h.coordinates).toHaveBeenCalledWith(500, 300);
    expect(h.clamp).toHaveBeenCalledWith({ x: 125.2, y: -75.7, width: 280, height: 200 });
    expect(h.update).toHaveBeenCalledExactlyOnceWith(
      { postId: 'N1', positionX: 125, positionY: -76 }, { userId: null });
    expect(h.posts()).toEqual([{ ...h.original[0], position_x: 125, position_y: -76 }]);
  });

  it.each([
    { editable: false }, { freeform: false }, { presentation: 'workspace' },
    { posts: [] }, { posts: [note('N1', 'image')] }, { posts: [note('N1', 'drawing')] },
    { posts: [note('N1', 'container')] }, { posts: [{ ...note(), board_id: 'other' }] },
    { posts: [note('N1', 'text', { isLocked: true })] },
    { posts: [note('N1', 'text', { parentId: 'owner' })] },
    { posts: [note(), note('owner', 'container', { childPadletIds: ['N1'] })] },
  ])('rejects ineligible current board state: %j', async (options) => {
    const h = harness(options);
    expect(h.canDrag('N1')).toBe(false);
    h.drop(h.event());
    await Promise.resolve();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.posts()).toEqual(h.original);
  });

  it('accepts the legacy note type and rejects a target removed before drop', () => {
    expect(harness({ posts: [note('N1', 'note')] }).canDrag('N1')).toBe(true);
    const posts = [note()];
    const h = harness({ posts });
    posts.pop();
    h.drop(h.event());
    expect(h.update).not.toHaveBeenCalled();
  });

  it('leaves state unchanged when the position command rejects', async () => {
    const h = harness({ succeeds: false });
    h.drop(h.event());
    await Promise.resolve();
    expect(h.posts()).toEqual(h.original);
  });

  it('does not claim Library or other existing drags, including mixed MIME', () => {
    const h = harness();
    for (const types of [['application/collabboard-library'],
      ['application/collabboard-library', SOURCE_NOTE_PLACEMENT_MIME], ['text/padlet-id']]) {
      const event = h.event('{}', types);
      expect(h.drop(event)).toBe(false);
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
    expect(h.update).not.toHaveBeenCalled();
  });

  it('wires capture ahead of container drops and withholds workspace drag at the reader', () => {
    expect(canvas).toContain('onDropCapture={handleKnowledgeSourceNotePlacementDrop}');
    expect(canvas).toContain('canDragSourceNote={canDragSourceNote}');
    expect(reader).toContain('canDragNote={!isWorkspace ? canDragSourceNote : undefined}');
    const start = canvas.indexOf('const handleKnowledgeSourceNotePlacementDrop');
    const end = canvas.indexOf('const handleKnowledgeSourceClipDropOnExistingNote', start);
    const handler = canvas.slice(start, end);
    for (const forbidden of ['createCreatePostCommand', 'persistKnowledgeSourceReference(',
      'crypto.randomUUID', 'updatePostFieldsOrThrow(', 'setSourceNoteReference(']) {
      expect(handler).not.toContain(forbidden);
    }
  });
});


describe('Source Context drop capture on the real viewport', () => {
  it.each([
    ['valid source', serializeKnowledgeSourceNotePlacementDrag('N1'), [SOURCE_NOTE_PLACEMENT_MIME], false],
    ['invalid source', '{}', [SOURCE_NOTE_PLACEMENT_MIME], false],
    ['Library', '{}', ['application/collabboard-library'], true],
  ] as const)('%s keeps the correct drop owner', async (_label, raw, types, reachesChild) => {
    const h = harness();
    vi.stubGlobal('React', React);
    const childDrop = vi.fn();
    const noop = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(
      <CanvasViewport className="" style={{}} containerRef={null}
        onDropCapture={h.drop} onDrop={noop} onDragOver={noop} onWheel={noop}
        onClick={noop} onMouseMove={noop} onMouseUp={noop} onMouseLeave={noop}>
        <div data-drop-child onDrop={childDrop} />
      </CanvasViewport>,
    ));
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: [...types], getData: () => raw } });
    await act(async () => { host!.querySelector('[data-drop-child]')!.dispatchEvent(event); });
    expect(childDrop).toHaveBeenCalledTimes(reachesChild ? 1 : 0);
    expect(noop).toHaveBeenCalledTimes(reachesChild ? 1 : 0);
    expect(h.update).toHaveBeenCalledTimes(_label === 'valid source' ? 1 : 0);
  });
});
