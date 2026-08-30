// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';

/**
 * P6J-F9-B2 / Area Phase 1 reader proofs: the Select area mode, the ONE armed
 * rectangle, and the hand-off into the EXISTING Note creation callback via the
 * floating area toolbar (a sibling of the pages container and the region
 * pointer layer, exactly like Text Phase 1's own selection toolbar). Both
 * pages are A4 (595 x 842), drawn inside the 1px border the reader's page
 * image carries.
 */
const PAGES = [
  { pageNumber: 1, text: 'first page text', widthPoints: 595, heightPoints: 842, rotation: 0 },
  { pageNumber: 2, text: 'second page text', widthPoints: 595, heightPoints: 842, rotation: 90 },
];
/** Page 2 is a quarter turn, so A1 drew it transposed: its box and raster are landscape. */
const BOXES: Record<number, { left: number; top: number; width: number; height: number }> = {
  1: { left: 101, top: 201, width: 500, height: 700 },
  2: { left: 101, top: 201, width: 700, height: 500 },
};
const NATURALS: Record<number, { width: number; height: number }> = {
  1: { width: 1000, height: 1415 },
  2: { width: 1415, height: 1000 },
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

const define = (t: object, k: string, v: unknown) => Object.defineProperty(t, k, { value: v, configurable: true });

/** `swapRasters` hands each page the OTHER page's raster shape: a derivative contradicting its geometry. */
function layOutImages(container: HTMLElement, swapRasters = false) {
  for (const image of Array.from(container.querySelectorAll('img'))) {
    const page = Number(image.closest('[data-page-number]')!.getAttribute('data-page-number'));
    const box = BOXES[page];
    const natural = NATURALS[swapRasters ? 3 - page : page];
    const layout: Record<string, unknown> = {
      complete: true, naturalWidth: natural.width, naturalHeight: natural.height,
      clientLeft: 1, clientTop: 1, clientWidth: box.width, clientHeight: box.height,
      offsetLeft: 0, offsetTop: 0,
    };
    for (const [key, value] of Object.entries(layout)) define(image, key, value);
    image.getBoundingClientRect = () => ({
      left: box.left - 1, top: box.top - 1, width: box.width + 2, height: box.height + 2,
      right: box.left + box.width + 1, bottom: box.top + box.height + 1,
      x: box.left - 1, y: box.top - 1, toJSON: () => ({}) }) as DOMRect;
    act(() => { image.dispatchEvent(new Event('load', { bubbles: false })); });
  }
}

function mount(swapRasters = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const onCreateNoteFromPage = vi.fn();
  act(() => {
    root!.render(
      <KnowledgeDocumentDetails
        boardId="board-1"
        documentId="doc-1"
        originalFilename="synthetic.pdf"
        pageCount={2}
        pages={PAGES}
        loading={false}
        error={false}
        onBack={vi.fn()}
        onCreateNoteFromPage={onCreateNoteFromPage}
      />,
    );
  });
  layOutImages(host, swapRasters);
  return { container: host, onCreateNoteFromPage };
}

const buttons = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll('button'))
  .filter((candidate) => candidate.textContent?.trim() === label);
const button = (container: HTMLElement, label: string) => buttons(container, label)[0] ?? null;

const click = (el: Element | null) => act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const layers = (c: HTMLElement) => c.querySelectorAll('[data-knowledge-region-layer]');
const layerFor = (c: HTMLElement, page: number) => c.querySelector(`[data-knowledge-region-layer="${page}"]`);

/** The ONE floating area toolbar -- a sibling of every page, never nested inside one. */
const areaToolbar = (c: HTMLElement) => c.querySelector('[data-knowledge-area-toolbar]');
const notePostButton = (c: HTMLElement) =>
  areaToolbar(c)?.querySelector('button[aria-label^="Create Note from selected area"]') as HTMLButtonElement ?? null;
const clearAreaButton = (c: HTMLElement) =>
  areaToolbar(c)?.querySelector('button[aria-label="Clear selected area"]') as HTMLButtonElement ?? null;
const areaGrip = (c: HTMLElement) =>
  areaToolbar(c)?.querySelector('[aria-label="Drag selected PDF area to the canvas"]') ?? null;
const areaColorSwatch = (c: HTMLElement) =>
  areaToolbar(c)?.querySelector('button[aria-label^="Highlight color"]') as HTMLButtonElement ?? null;

function firePointer(target: Element, type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  for (const [k, v] of Object.entries({ pointerId: 1, isPrimary: true, pointerType: 'mouse' })) define(event, k, v);
  act(() => { target.dispatchEvent(event); });
}

/** Drags display rect (0.1, 0.1, 0.4, 0.5) across the given page. */
function dragPage(container: HTMLElement, page: number) {
  const hit = layerFor(container, page)!;
  const box = BOXES[page];
  const at = (nx: number, ny: number) => [box.left + nx * box.width, box.top + ny * box.height] as const;
  firePointer(hit, 'pointerdown', ...at(0.1, 0.1));
  firePointer(hit, 'pointermove', ...at(0.5, 0.6));
  firePointer(hit, 'pointerup', ...at(0.5, 0.6));
}

function enableMode(container: HTMLElement, swapRasters = false) {
  click(button(container, 'Select area'));
  layOutImages(container, swapRasters);
}

describe('P6J-F9-B2 Select area mode', () => {
  it('D1/D2: one document-level toggle, off by default, above the pages', () => {
    const { container } = mount();
    const toggle = button(container, 'Select area');
    expect(toggle).not.toBeNull();
    expect(buttons(container, 'Select area')).toHaveLength(1);
    expect(toggle!.getAttribute('aria-pressed')).toBe('false');
    expect(layers(container)).toHaveLength(0);
    // Above the scrolling pages region, not inside a page header.
    expect(toggle!.closest('[data-page-number]')).toBeNull();
  });

  it('turns the hit layers on for every ready page and back off again', () => {
    const { container } = mount();
    enableMode(container);
    expect(button(container, 'Select area')!.getAttribute('aria-pressed')).toBe('true');
    expect(layers(container)).toHaveLength(2);
    click(button(container, 'Select area'));
    expect(layers(container)).toHaveLength(0);
  });

  it('D10/D11: every page still renders inside the one scrolling container', () => {
    const { container } = mount();
    enableMode(container);
    expect(container.querySelectorAll('[data-page-number]')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    const scroller = container.querySelector('[data-page-number]')!.parentElement!;
    expect(scroller.className).toContain('overflow-y-auto');
  });
});

describe('Area Phase 1 one armed rectangle, surfaced via the floating area toolbar', () => {
  it('D3/D4: arming a page offers the ONE floating area toolbar, scoped to that page, and no other', () => {
    const { container } = mount();
    enableMode(container);
    expect(areaToolbar(container)).toBeNull();

    dragPage(container, 1);
    expect(container.querySelectorAll('[data-knowledge-area-toolbar]')).toHaveLength(1);
    const post = notePostButton(container)!;
    expect(post).not.toBeNull();
    expect(post.getAttribute('aria-label')).toBe('Create Note from selected area on page 1');
    expect(container.querySelectorAll('[data-knowledge-region-rectangle]')).toHaveLength(1);
  });

  it('D3: arming a second page moves the one selection rather than adding another', () => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);
    dragPage(container, 2);
    expect(container.querySelectorAll('[data-knowledge-area-toolbar]')).toHaveLength(1);
    expect(notePostButton(container)!.getAttribute('aria-label')).toBe('Create Note from selected area on page 2');
    expect(container.querySelectorAll('[data-knowledge-region-rectangle]')).toHaveLength(1);
  });

  it('D5: Clear removes the rectangle and the toolbar, leaving the mode on', () => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);
    click(clearAreaButton(container));
    expect(areaToolbar(container)).toBeNull();
    expect(container.querySelectorAll('[data-knowledge-region-rectangle]')).toHaveLength(0);
    expect(button(container, 'Select area')!.getAttribute('aria-pressed')).toBe('true');
  });

  it.each([
    ['Escape', () => act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })],
    ['leaving the mode', (c: HTMLElement) => { click(button(c, 'Select area')); enableMode(c); }],
  ])('%s abandons whatever was drawn', (_label, abandon) => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);
    abandon(container);
    expect(areaToolbar(container)).toBeNull();
  });

  it('offers no region controls for a page whose raster contradicts its geometry', () => {
    // Each page is handed the other's raster shape, so neither can be trusted.
    const { container } = mount(true);
    enableMode(container, true);
    expect(layers(container)).toHaveLength(0);
  });

  it('the area toolbar lives outside every page and outside the region pointer layer', () => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);
    const toolbar = areaToolbar(container)!;
    expect(toolbar.closest('[data-page-number]')).toBeNull();
    expect(toolbar.closest('[data-knowledge-region-layer]')).toBeNull();
    expect(layerFor(container, 1)!.contains(toolbar)).toBe(false);
  });
});

describe('P6J-F9-B2 hand-off into the existing Note flow', () => {
  it('D6/C1-C4: Note Post calls the one existing callback with a region request', () => {
    const { container, onCreateNoteFromPage } = mount();
    enableMode(container);
    dragPage(container, 1);
    click(notePostButton(container));

    expect(onCreateNoteFromPage).toHaveBeenCalledTimes(1);
    const request = onCreateNoteFromPage.mock.calls[0][0] as Record<string, unknown>;
    expect(request.sourceDocumentId).toBe('doc-1');
    expect(request.pageNumber).toBe(1);
    expect(request.selection).toBeNull();
    // No page text travels with a region: it quotes nothing.
    expect(request.pageText).toBe('');
    const region = request.region as { region: Record<string, number>; appliedRotation: number };
    expect(region.appliedRotation).toBe(0);
    expect(Object.keys(region.region).sort()).toEqual(['height', 'width', 'x', 'y']);
  });

  it('sends the hand-computed SOURCE rectangle for a quarter-turned page', () => {
    // Display rect (0.1, 0.1, 0.4, 0.5) at rotation 90 becomes, by the locked
    // rule x=dy, y=1-dx-dw, w=dh, h=dw: (0.1, 0.5, 0.5, 0.4).
    const { container, onCreateNoteFromPage } = mount();
    enableMode(container);
    dragPage(container, 2);
    click(notePostButton(container));

    const request = onCreateNoteFromPage.mock.calls[0][0] as Record<string, unknown>;
    const { region, appliedRotation } = request.region as
      { region: Record<string, number>; appliedRotation: number };
    expect(appliedRotation).toBe(90);
    for (const [key, value] of Object.entries({ x: 0.1, y: 0.5, width: 0.5, height: 0.4 })) {
      expect(region[key], key).toBeCloseTo(value, 9);
    }
  });

  it('D7/D8: a confirmed region clears the selection and leaves the mode off', () => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);
    click(notePostButton(container));
    expect(button(container, 'Select area')!.getAttribute('aria-pressed')).toBe('false');
    expect(areaToolbar(container)).toBeNull();
    expect(layers(container)).toHaveLength(0);
  });

  it('D9: the page-only path is untouched and still uses the same callback', () => {
    const { container, onCreateNoteFromPage } = mount();
    click(button(container, 'Create Note'));
    const request = onCreateNoteFromPage.mock.calls[0][0] as Record<string, unknown>;
    expect(request.pageText).toBe('first page text');
    expect(request.region).toBeUndefined();
    expect(request.selection).toBeNull();
  });

  it('C12: no crop, thumbnail or Storage authority reaches the request', () => {
    const { container, onCreateNoteFromPage } = mount();
    enableMode(container);
    dragPage(container, 1);
    click(notePostButton(container));
    const serialized = JSON.stringify(onCreateNoteFromPage.mock.calls[0][0]);
    for (const leaked of ['webp', 'storage', 'bucket', 'signed', 'natural', 'dataUrl', 'base64']) {
      expect(serialized.toLowerCase(), leaked).not.toContain(leaked);
    }
  });

  it('the toolbar carries a drag affordance emitting the same area MIME the button posts', () => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);
    const grip = areaGrip(container) as HTMLElement;
    expect(grip).not.toBeNull();
    expect(grip.getAttribute('draggable')).toBe('true');
  });

  it('a toolbar color choice seeds topStripColor on the Note Post call, never a second field', () => {
    const { container, onCreateNoteFromPage } = mount();
    enableMode(container);
    dragPage(container, 1);
    const swatch = areaColorSwatch(container)!;
    click(swatch);
    click(notePostButton(container));
    const request = onCreateNoteFromPage.mock.calls[0][0] as Record<string, unknown>;
    expect(request.topStripColor).toBe(swatch.getAttribute('aria-label')!.replace('Highlight color ', ''));
    expect(Object.keys(request).sort()).toEqual(
      ['originalFilename', 'pageText', 'pageNumber', 'region', 'selection', 'sourceDocumentId', 'topStripColor'].sort(),
    );
  });
});

describe('P6J-F9-B2 F8 isolation', () => {
  const textRoots = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-knowledge-page-text-root]'));

  it('D12/D15: the canonical text roots stay exact, with no region UI and no area toolbar inside them', () => {
    const { container } = mount();
    enableMode(container);
    dragPage(container, 1);

    const roots = textRoots(container);
    expect(roots).toHaveLength(2);
    roots.forEach((root_, index) => {
      expect(root_.textContent).toBe(PAGES[index].text);
      expect(root_.querySelector('[data-knowledge-region-layer]')).toBeNull();
      expect(root_.querySelector('[data-knowledge-region-rectangle]')).toBeNull();
      expect(root_.querySelector('[data-knowledge-area-toolbar]')).toBeNull();
      expect(root_.querySelector('button')).toBeNull();
      expect(root_.querySelector('img')).toBeNull();
    });
  });

  it('D13/D14: mode OFF leaves the reader exactly as F8 left it', () => {
    const { container } = mount();
    // No hit layer exists to intercept a text selection, no area toolbar is
    // mounted, and the page header controls F8 owns are still the ones present.
    expect(layers(container)).toHaveLength(0);
    expect(areaToolbar(container)).toBeNull();
    expect(buttons(container, 'Create Note')).toHaveLength(2);
    expect(container.querySelector('[data-knowledge-clip-chip]')).toBeNull();
    textRoots(container).forEach((root_, index) => {
      expect(root_.textContent).toBe(PAGES[index].text);
    });
  });
});
