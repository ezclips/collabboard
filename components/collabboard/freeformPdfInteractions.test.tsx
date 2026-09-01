// @vitest-environment jsdom

import React, { createRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasSidebar, { type SidebarToolGroup } from './canvas/ui/CanvasSidebar';
import {
  buildCanvasToolbarGroups,
  isDirectPdfCanvasLayout,
} from './canvas/ui/canvasToolbarRegistry';
import { KnowledgeSourceMarker } from './PostCardContent';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

/**
 * Freeform PDF click completion. Both halves of this suite start from the
 * element a person actually clicks, because the two defects it pins were
 * invisible to every test that started one layer lower: the upload path worked
 * when driven through the hidden input, and the reader opened when driven
 * through the board handler. What was broken was the wiring in between.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '33333333-3333-4333-8333-333333333333';
const PADLET_ID = '44444444-4444-4444-8444-444444444444';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: BOARD_ID }) }));

/**
 * jsdom ships no ResizeObserver, and the sidebar measures itself with one to
 * decide overflow. The stub never fires: these tests assert on the inline
 * toolbar, whose contents come from the registry, not from measurement.
 */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;

/** Mirrors CanvasSidebar's CORE_GROUP_PRIORITIES: groups it never overflows. */
const CORE_GROUP_PRIORITIES = [1, 2];

let mounted: Array<{ root: Root; host: HTMLElement }> = [];

function mount(node: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  mounted.push({ root, host });
  return host;
}

afterEach(() => {
  for (const { root, host } of mounted) {
    act(() => root.unmount());
    host.remove();
  }
  mounted = [];
});

/** The real registry output for a layout, exactly as the shell builds it. */
function groupsFor(layout: string): SidebarToolGroup[] {
  return buildCanvasToolbarGroups({
    isMapLayout: layout === 'map',
    isFreeformLayout: layout === 'freeform',
    isFreeformGraphMode: false,
    isTimelineLayout: layout === 'timeline',
    chronoMode: null,
    canManageCanvasShare: true,
    canUseFreeformEditButton: true,
    isDrawingLayout: layout === 'drawing',
    isDirectPdfLayout: isDirectPdfCanvasLayout(layout),
  });
}

function sidebar(layout: string, extra: Partial<React.ComponentProps<typeof CanvasSidebar>> = {}) {
  return mount(
    <CanvasSidebar
      groups={groupsFor(layout)}
      isLineMode={false}
      isGraphConnectMode={false}
      handleToolClick={extra.handleToolClick ?? vi.fn()}
      onBack={vi.fn()}
      {...extra}
    />,
  );
}

/** The visible Add PDF control: the element carrying the click, not the label. */
function visibleAddPdfControl(host: HTMLElement): HTMLElement | null {
  const label = [...host.querySelectorAll('span')].find((el) => el.textContent?.trim() === 'Add PDF');
  return (label?.closest('[class*="w-9"]') as HTMLElement | null) ?? null;
}

/**
 * Spies on the ONE hidden PDF input the uploader owns. Returns a counter, so a
 * test proves the picker opened exactly once rather than merely at least once.
 */
function watchPdfInput(host: HTMLElement) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"][accept*="pdf"]');
  expect(input, 'the uploader must mount exactly one hidden PDF input').not.toBeNull();
  const clicks = { count: 0 };
  input!.addEventListener('click', (event) => {
    // jsdom would otherwise report a navigation-ish default; the count is the assertion.
    event.preventDefault();
    clicks.count += 1;
  });
  return clicks;
}

describe('1-4. Add PDF works from the element a person clicks', () => {
  it('1. Freeform renders a visible Add PDF control', () => {
    const host = sidebar('freeform');
    expect(visibleAddPdfControl(host)).not.toBeNull();
  });

  it('2. clicking the visible inline control opens the picker exactly once', () => {
    const host = sidebar('freeform');
    const clicks = watchPdfInput(host);
    const control = visibleAddPdfControl(host)!;

    act(() => { control.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(clicks.count).toBe(1);
  });

  it('3. the PDF tool never leaks into the generic tool handler', () => {
    const handleToolClick = vi.fn();
    const host = sidebar('freeform', { handleToolClick });
    watchPdfInput(host);

    act(() => { visibleAddPdfControl(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // The uploader owns this action; routing it onward would mean a second
    // upload implementation could grow behind the same button.
    expect(handleToolClick).not.toHaveBeenCalled();
  });

  it('4. Add PDF is pinned to a group the overflow calculation can never move', () => {
    // THE fix. Overflow moves whole GROUPS, so while Add PDF lived in Media it
    // collapsed into the More menu at ordinary window heights -- and the menu
    // dispatches after it closes, once the browser's user activation is gone,
    // so the native picker was silently ignored. Pinning it to a core,
    // always-visible group is what keeps it a direct control.
    const groups = groupsFor('freeform');
    const owner = groups.find((g) => g.tools.some((t) => t.type === 'knowledge-pdf'))!;
    expect(owner, 'some group must own Add PDF').toBeDefined();
    expect(CORE_GROUP_PRIORITIES).toContain(owner.priority);
    expect(owner.alwaysVisible).toBe(true);

    // Exactly one Add PDF anywhere in the toolbar -- never a second copy in More.
    const total = groups.flatMap((g) => g.tools).filter((t) => t.type === 'knowledge-pdf');
    expect(total).toHaveLength(1);
  });

  it('4b. the menu no longer carries a gesture special case, and still defers', () => {
    const source = readSidebarSource();
    // The workaround existed only because Add PDF could reach the menu.
    expect(source).not.toContain('USER_GESTURE_TOOL_TYPES');
    // The Canvas-settings deferral it was bolted onto must survive untouched.
    expect(source).toContain('dispatchTool(pending);');
    const onSelect = slice(source, 'onSelect={() => {', '}}');
    expect(onSelect).toContain('pendingToolRef.current = tool.type;');
  });

  it('4c. Add PDF survives an overflow that genuinely collapses other groups', () => {
    // Simulates the real failure condition: the sidebar decides Media, Blocks
    // and Draw must overflow. Add PDF must still render directly, and must not
    // appear among the overflowed tools.
    const groups = groupsFor('freeform');
    const overflowIds = new Set(['media', 'structure', 'draw']);
    const stillVisible = groups.filter((g) => !overflowIds.has(g.id));
    const overflowed = groups.filter((g) => overflowIds.has(g.id));

    expect(stillVisible.flatMap((g) => g.tools).some((t) => t.type === 'knowledge-pdf')).toBe(true);
    expect(overflowed.flatMap((g) => g.tools).some((t) => t.type === 'knowledge-pdf')).toBe(false);
    // The groups that legitimately overflow still do -- this pins one tool, it
    // does not disable overflow.
    expect(overflowed.flatMap((g) => g.tools).length).toBeGreaterThan(0);
  });
});

describe('5-6. unsupported layouts stay closed', () => {
  it('5. Drawing renders no visible Add PDF control', () => {
    expect(visibleAddPdfControl(sidebar('drawing'))).toBeNull();
  });

  it('5b. no structured layout renders one either', () => {
    for (const layout of ['wall', 'columns', 'grid', 'timeline', 'scheduler', 'map', 'kanban', 'gantt']) {
      expect(visibleAddPdfControl(sidebar(layout)), `${layout} must not offer Add PDF`).toBeNull();
    }
  });

  it('6. the placement guard still blocks a stale unsupported invocation', () => {
    const client = readClientSource();
    const handler = client.slice(
      client.indexOf('const handleKnowledgePdfUploaded'),
      client.indexOf('const handleKnowledgePdfSettled'),
    );
    const guardAt = handler.indexOf('if (!canPlaceDirectPdf) {');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(handler.indexOf('requestPlacementIfRequiredRef.current'));
    expect(guardAt).toBeLessThan(handler.indexOf('crypto.randomUUID()'));
  });
});

const reference = (over: Partial<SourceReference> = {}): SourceReference => ({
  id: 'ref-1',
  targetPadletId: PADLET_ID,
  sourceDocumentId: DOC_ID,
  pageStart: 4,
  pageEnd: 4,
  quoteText: 'synthetic quote',
  quoteHash: 'hash',
  charStart: null,
  charEnd: null,
  regionX: null,
  regionY: null,
  regionWidth: null,
  regionHeight: null,
  locator: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
} as unknown as SourceReference);

function markerHost(refs: SourceReference[], onOpenSourceReference: ((r: SourceReference) => void) | null) {
  return mount(
    <KnowledgeSourceReferenceProvider
      index={new Map([[PADLET_ID, refs]]) as never}
      onOpenSourceReference={onOpenSourceReference}
    >
      <KnowledgeSourceMarker padletId={PADLET_ID} noteContent="" />
    </KnowledgeSourceReferenceProvider>,
  );
}

describe('7-11. the Note source/page reference opens the reader', () => {
  it('7. the source/page reference renders and names its page', () => {
    const host = markerHost([reference()], vi.fn());
    const marker = host.querySelector('[data-knowledge-source-marker]');
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toContain('p. 4');
  });

  it('8. clicking it reaches the reader-open authority with the exact document', () => {
    const onOpen = vi.fn();
    const host = markerHost([reference()], onOpen);
    const marker = host.querySelector<HTMLElement>('[data-knowledge-source-open="true"]');
    expect(marker, 'the marker must be a real control, not a label').not.toBeNull();

    act(() => { marker!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].sourceDocumentId).toBe(DOC_ID);
  });

  it('9. page/source context is preserved, not flattened to the document', () => {
    const onOpen = vi.fn();
    const host = markerHost([reference({ pageStart: 7, pageEnd: 9 })], onOpen);

    act(() => {
      host.querySelector<HTMLElement>('[data-knowledge-source-open="true"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const sent = onOpen.mock.calls[0][0];
    expect(sent.pageStart).toBe(7);
    expect(sent.pageEnd).toBe(9);
    expect(sent.id).toBe('ref-1');
  });

  it('10. the click does not reach the parent card, and starts no drag', () => {
    const onOpen = vi.fn();
    const parentClick = vi.fn();
    const parentDoubleClick = vi.fn();
    const parentPointerDown = vi.fn();
    const parentMouseDown = vi.fn();

    const host = mount(
      <div
        onClick={parentClick}
        onDoubleClick={parentDoubleClick}
        onPointerDown={parentPointerDown}
        onMouseDown={parentMouseDown}
      >
        <KnowledgeSourceReferenceProvider
          index={new Map([[PADLET_ID, [reference()]]]) as never}
          onOpenSourceReference={onOpen}
        >
          <KnowledgeSourceMarker padletId={PADLET_ID} noteContent="" />
        </KnowledgeSourceReferenceProvider>
      </div>,
    );

    const marker = host.querySelector<HTMLElement>('[data-knowledge-source-open="true"]')!;
    act(() => {
      marker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    // Selection/edit must not fire, and the hosts start dragging from the down
    // event -- so that one matters as much as the click.
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentDoubleClick).not.toHaveBeenCalled();
    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it('11. without a board opener the marker stays the inert label it always was', () => {
    const host = markerHost([reference()], null);
    expect(host.querySelector('[data-knowledge-source-marker]')).not.toBeNull();
    expect(host.querySelector('[data-knowledge-source-open="true"]')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
  });

  it('12. the board wires its existing reference-level opener, not a new one', () => {
    const client = readClientSource();
    expect(client).toContain('onOpenSourceReference={requestKnowledgeSourceOpen}');
    // One reader, one provenance authority: no second drawer or modal.
    expect(client).not.toContain('KnowledgeSourceReaderDrawerV2');
    const marker = readPostCardSource();
    expect(marker).toContain('useKnowledgeSourceOpen');
    expect(marker).not.toContain('createPortal');
  });
});

// -- source helpers, declared last so the behavioural tests read first --
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const readFile = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readSidebarSource = () => readFile('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const readClientSource = () => readFile('app/dashboard/canvas/[id]/CanvasClient.tsx');
const readPostCardSource = () => readFile('components/collabboard/PostCardContent.tsx');

function slice(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  expect(start, `expected to find ${from}`).toBeGreaterThan(-1);
  const end = source.indexOf(to, start);
  return source.slice(start, end + to.length);
}
