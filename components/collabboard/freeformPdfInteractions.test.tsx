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
import { KNOWLEDGE_PDF_INPUT_ID } from './KnowledgePdfUploader';
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

/**
 * Makes the sidebar's own overflow calculation fire in jsdom, which reports
 * every box as 0x0. Groups get a real height and the container a short one, so
 * the component -- not the test -- decides what collapses.
 */
function forceOverflow() {
  const realRect = Element.prototype.getBoundingClientRect;
  const realClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Element.prototype.getBoundingClientRect = function rect(this: Element) {
    const height = this.hasAttribute('data-toolbar-group') ? 120 : 36;
    return { x: 0, y: 0, top: 0, left: 0, right: 36, bottom: height, width: 36, height, toJSON() {} } as DOMRect;
  };
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 160 });
  return () => {
    Element.prototype.getBoundingClientRect = realRect;
    if (realClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', realClientHeight);
    else delete (Element.prototype as unknown as Record<string, unknown>).clientHeight;
  };
}

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

/** The visible Add PDF control, found the way a person finds it: by its label. */
function visibleAddPdfControl(host: HTMLElement): HTMLElement | null {
  const tip = [...host.querySelectorAll('span')].find((el) => el.textContent?.trim() === 'Add PDF');
  return (tip?.closest('[data-toolbar-tool="knowledge-pdf"]') as HTMLElement | null) ?? null;
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

  it('2. the control is a real label bound to the one hidden PDF input', () => {
    // THE fix for "clicking does nothing". A <label htmlFor> makes the BROWSER
    // open the file dialog; a programmatic input.click() is discarded silently
    // whenever the browser no longer treats the click as a user gesture.
    const host = sidebar('freeform');
    const control = visibleAddPdfControl(host)!;
    expect(control.tagName).toBe('LABEL');
    expect(control.getAttribute('for')).toBe(KNOWLEDGE_PDF_INPUT_ID);

    const input = host.querySelector<HTMLInputElement>('input[type="file"][accept*="pdf"]')!;
    expect(input.id).toBe(KNOWLEDGE_PDF_INPUT_ID);
    // jsdom implements label->control activation, so this is the real path.
    const clicks = watchPdfInput(host);
    act(() => { control.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(clicks.count).toBe(1);
  });

  it('3. the PDF tool never leaks into the generic tool handler', () => {
    const handleToolClick = vi.fn();
    const host = sidebar('freeform', { handleToolClick });
    watchPdfInput(host);

    act(() => { visibleAddPdfControl(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // The uploader owns this action; routing it onward would mean a second
    // upload implementation could grow behind the same button. It also must not
    // carry its own onClick, or the label would open two dialogs.
    expect(handleToolClick).not.toHaveBeenCalled();
  });

  it('4. Add PDF lives in Media, marked pinned, and exists exactly once', () => {
    const groups = groupsFor('freeform');
    const owner = groups.find((g) => g.tools.some((t) => t.type === 'knowledge-pdf'))!;
    expect(owner.id, 'Add PDF belongs in Media').toBe('media');

    const tool = owner.tools.find((t) => t.type === 'knowledge-pdf')!;
    // Pinned is what keeps it on the toolbar when Media collapses into More.
    expect(tool.pinned).toBe(true);
    expect(tool.activatesInputId).toBe(KNOWLEDGE_PDF_INPUT_ID);

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

  it('4c. when Media actually collapses, Add PDF stays out on the toolbar', () => {
    // The real failure condition, driven through the component rather than
    // asserted about the registry: jsdom has no layout, so the sidebar is given
    // measurable heights in a short container and its own overflow calculation
    // decides -- and it does collapse Media, exactly as a short window does.
    const restore = forceOverflow();
    try {
      const host = sidebar('freeform');
      expect(host.querySelector('[data-toolbar-group="media"]'), 'Media must have collapsed').toBeNull();

      const control = visibleAddPdfControl(host);
      expect(control, 'Add PDF must survive its group collapsing').not.toBeNull();
      expect(control!.tagName).toBe('LABEL');
      expect(host.querySelector('[data-toolbar-pinned="true"]')).not.toBeNull();

      // Exactly one Add PDF control in the whole toolbar -- never a second copy
      // inside the More menu, whose deferred dispatch cannot open a dialog.
      expect(host.querySelectorAll('[data-toolbar-tool="knowledge-pdf"]')).toHaveLength(1);
    } finally {
      restore();
    }
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
