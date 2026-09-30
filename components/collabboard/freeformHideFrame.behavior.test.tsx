// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PostCardContent from './PostCardContent';
import { NotePostContextMenu } from './menus/NotePostContextMenu';
import { ImagePostContextMenu } from './context-menus/ImagePostContextMenu';
import RowColumnContainerCard from './RowColumnContainerCard';
import { actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { stripDrawingPreviewBackground } from '@/lib/domain/canvas/drawingPreview';
import type { Padlet } from '@/types/collabboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Radix opens menu items through pointer handlers; jsdom lacks both.
Element.prototype.scrollIntoView ??= () => {};
(Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture ??= () => false;

// The container measures itself with a ResizeObserver, which jsdom lacks.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mountInto(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(ui); });
  return host;
}

function padlet(overrides: Partial<Padlet>): Padlet {
  return { id: 'p-1', board_id: 'b', title: 'T', content: '', type: 'text', metadata: {}, ...overrides } as Padlet;
}

const SVG_PREFIX = 'data:image/svg+xml;base64,';
const svgUrl = (svg: string) => SVG_PREFIX + btoa(svg);
const decodeSvg = (url: string) => atob(url.slice(SVG_PREFIX.length));
/** Excalidraw's exportBackground:true shape -- a full-size white rect first. */
const WHITE_RECT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">' +
  '<metadata></metadata><defs><style class="style-fonts">.a{}</style></defs>' +
  '<rect fill="#ffffff" height="150" width="200" x="0" y="0"></rect>' +
  '<g><path d="M0 0 L10 10"></path></g></svg>';

/** Opens a Radix context menu by right-clicking its trigger. */
async function openMenu(container: HTMLElement): Promise<HTMLElement> {
  const trigger = container.querySelector('[data-testid="trigger"]') ?? container.firstElementChild!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  });
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, 'context menu did not open').not.toBeNull();
  return menu!;
}

function menuItem(menu: HTMLElement, label: string): HTMLElement {
  const item = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((el) => el.textContent?.includes(label));
  expect(item, `no item labelled "${label}"`).toBeTruthy();
  return item!;
}

describe('PATCH-220 the drawing wrapper drops its box under "Hide frame"', () => {
  const drawing = (fullView: boolean) =>
    padlet({ id: 'd-1', type: 'drawing', metadata: { previewUrl: '', fullView } as never });

  it('with fullView there is no dashed / red-boxed wrapper', () => {
    const c = mountInto(<PostCardContent padlet={drawing(true)} />);
    const wrapper = c.querySelector('[class*="drawing-preview"]') as HTMLElement;
    expect(wrapper.className).not.toContain('border-dashed');
    expect(wrapper.className).not.toContain('border-red-100');
    expect(wrapper.className).not.toContain('bg-red-50/50');
    // PATCH-223: no `onView` (the board case), so the zoom affordance is gone.
    expect(wrapper.className).not.toContain('cursor-zoom-in');
  });

  it('without fullView the wrapper keeps its box', () => {
    const c = mountInto(<PostCardContent padlet={drawing(false)} />);
    const wrapper = c.querySelector('[class*="drawing-preview"]') as HTMLElement;
    expect(wrapper.className).toContain('border-dashed');
    expect(wrapper.className).toContain('border-red-100');
  });

  it("PATCH-222: a fullView drawing's <img> uses the background-stripped preview", () => {
    const original = svgUrl(WHITE_RECT_SVG);
    const c = mountInto(
      <PostCardContent padlet={padlet({ id: 'd-1', type: 'drawing', metadata: { previewUrl: original, fullView: true } as never })} />,
    );
    const src = c.querySelector('img')!.getAttribute('src')!;
    expect(src).toBe(stripDrawingPreviewBackground(original));
    expect(decodeSvg(src)).not.toContain('<rect');
  });

  it("PATCH-222: a framed drawing's <img> uses the stored preview unchanged", () => {
    const original = svgUrl(WHITE_RECT_SVG);
    const c = mountInto(
      <PostCardContent padlet={padlet({ id: 'd-2', type: 'drawing', metadata: { previewUrl: original } as never })} />,
    );
    expect(c.querySelector('img')!.getAttribute('src')).toBe(original);
  });

  it("PATCH-227: a fullView drawing's <img> carries data-graph-anchor=visual; a framed one does not", () => {
    const full = mountInto(
      <PostCardContent padlet={padlet({ id: 'd-3', type: 'drawing', metadata: { previewUrl: 'https://x/y.png', fullView: true } as never })} />,
    );
    expect(full.querySelector('img')!.getAttribute('data-graph-anchor')).toBe('visual');
    act(() => root?.unmount()); host?.remove();

    const framed = mountInto(
      <PostCardContent padlet={padlet({ id: 'd-4', type: 'drawing', metadata: { previewUrl: 'https://x/y.png' } as never })} />,
    );
    expect(framed.querySelector('img')!.getAttribute('data-graph-anchor')).toBeNull();
  });
});

describe('PATCH-220 the menu says Hide frame / Show frame', () => {
  it('Note menu: "Hide frame" without fullView, "Show frame" with it', async () => {
    const without = mountInto(
      <NotePostContextMenu padlet={padlet({})} onSelect={vi.fn()} onToggleFullView={vi.fn()}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    await openMenu(without);
    expect(document.body.textContent).toContain('Hide frame');
    expect(document.body.textContent).not.toContain('Show frame');
    act(() => root?.unmount()); host?.remove();

    const withView = mountInto(
      <NotePostContextMenu padlet={padlet({ metadata: { fullView: true } as never })} onSelect={vi.fn()} onToggleFullView={vi.fn()}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    await openMenu(withView);
    expect(document.body.textContent).toContain('Show frame');
  });

  it('Image menu: "Hide frame" without fullView, "Show frame" with it', async () => {
    const without = mountInto(
      <ImagePostContextMenu padlet={padlet({ type: 'image', metadata: {} as never })} onSelect={vi.fn()}>
        <div data-testid="trigger">post</div>
      </ImagePostContextMenu>,
    );
    await openMenu(without);
    expect(document.body.textContent).toContain('Hide frame');
    act(() => root?.unmount()); host?.remove();

    const withView = mountInto(
      <ImagePostContextMenu padlet={padlet({ type: 'image', metadata: { fullView: true } as never })} onSelect={vi.fn()}>
        <div data-testid="trigger">post</div>
      </ImagePostContextMenu>,
    );
    await openMenu(withView);
    expect(document.body.textContent).toContain('Show frame');
  });

  it('PATCH-222: a Drawing menu says "Hide post frame" / "Show post frame"', async () => {
    const without = mountInto(
      <NotePostContextMenu padlet={padlet({ type: 'drawing' })} onSelect={vi.fn()} onToggleFullView={vi.fn()}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    await openMenu(without);
    expect(document.body.textContent).toContain('Hide post frame');
    act(() => root?.unmount()); host?.remove();

    const withView = mountInto(
      <NotePostContextMenu padlet={padlet({ type: 'drawing', metadata: { fullView: true } as never })} onSelect={vi.fn()} onToggleFullView={vi.fn()}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    await openMenu(withView);
    expect(document.body.textContent).toContain('Show post frame');
  });

  it('PATCH-222: an ai-component still says "Hide frame" (not "post frame")', async () => {
    const c = mountInto(
      <NotePostContextMenu padlet={padlet({ type: 'ai-component' })} onSelect={vi.fn()} onToggleFullView={vi.fn()}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    await openMenu(c);
    expect(document.body.textContent).toContain('Hide frame');
    expect(document.body.textContent).not.toContain('Hide post frame');
  });

  it('PATCH-223: a Drawing menu shows "Hide post frame" then "View full size", in order', async () => {
    const onViewFullSize = vi.fn();
    const c = mountInto(
      <NotePostContextMenu
        padlet={padlet({ type: 'drawing' })}
        onSelect={vi.fn()}
        onToggleFullView={vi.fn()}
        onViewFullSize={onViewFullSize}
      >
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    const menu = await openMenu(c);
    const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent?.trim());
    const frameAt = labels.indexOf('Hide post frame');
    const viewAt = labels.indexOf('View full size');
    expect(frameAt).toBeGreaterThan(-1);
    expect(viewAt, 'View full size sits directly below Hide post frame').toBe(frameAt + 1);

    await act(async () => {
      menuItem(menu, 'View full size').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onViewFullSize).toHaveBeenCalledTimes(1);
  });

  it('PATCH-223: without onViewFullSize there is no "View full size" item', async () => {
    const c = mountInto(
      <NotePostContextMenu padlet={padlet({ type: 'drawing' })} onSelect={vi.fn()} onToggleFullView={vi.fn()}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    const menu = await openMenu(c);
    expect(menu.textContent).toContain('Hide post frame');
    expect(menu.textContent).not.toContain('View full size');
  });

  it('clicking still dispatches post.toggleFullView', async () => {
    const onToggleFullView = vi.fn();
    const execute = vi.spyOn(actionRegistry, 'execute').mockImplementation(() => undefined as never);
    const c = mountInto(
      <NotePostContextMenu padlet={padlet({})} onSelect={vi.fn()} onToggleFullView={onToggleFullView}>
        <div data-testid="trigger">post</div>
      </NotePostContextMenu>,
    );
    const menu = await openMenu(c);
    await act(async () => {
      menuItem(menu, 'Hide frame').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onToggleFullView).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('post.toggleFullView', expect.objectContaining({ scope: 'post' }));
  });
});

describe('PATCH-220 a container shows a fullView drawing without card chrome', () => {
  const child = (overrides: Partial<Padlet>) => padlet(overrides);

  function mountContainer(children: Padlet[]) {
    const container = padlet({
      id: 'container-1', type: 'container',
      metadata: { childPadletIds: children.map((c) => c.id), isContainer: true } as never,
    });
    return mountInto(
      <RowColumnContainerCard
        padlet={container}
        allPadlets={[container, ...children]}
        showHeader={false}
        disableInternalScroll
      />,
    );
  }

  function childWrapper(c: HTMLElement, id: string) {
    // The child wrapper is the element that carries the child key's card chrome.
    return c.querySelector(`[data-child-card="${id}"]`) as HTMLElement | null;
  }

  it('a drawing child with fullView renders no border, no shadow, no orange strip', () => {
    const c = mountContainer([child({ id: 'd-1', type: 'drawing', metadata: { fullView: true, previewUrl: '' } as never })]);
    const wrapper = childWrapper(c, 'd-1');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).not.toContain('border');
    expect(wrapper!.className).not.toContain('shadow-sm');
    expect(wrapper!.querySelector('[class*="h-1.5"]')).toBeNull();
  });

  it('the same drawing WITHOUT fullView keeps its chrome', () => {
    const c = mountContainer([child({ id: 'd-2', type: 'drawing', metadata: { previewUrl: '' } as never })]);
    const wrapper = childWrapper(c, 'd-2');
    expect(wrapper!.className).toContain('border');
    expect(wrapper!.className).toContain('shadow-sm');
  });

  it('a fullView NOTE child keeps the chrome (not an eligible type)', () => {
    const c = mountContainer([child({ id: 'n-1', type: 'text', metadata: { fullView: true } as never })]);
    const wrapper = childWrapper(c, 'n-1');
    expect(wrapper!.className).toContain('border');
    expect(wrapper!.className).toContain('shadow-sm');
  });

  it('a frameless drawing child still calls its click (view) handler', () => {
    const onViewDrawing = vi.fn();
    const drawing = child({ id: 'd-3', type: 'drawing', metadata: { fullView: true, previewUrl: '' } as never });
    const container = padlet({
      id: 'container-1', type: 'container',
      metadata: { childPadletIds: ['d-3'], isContainer: true } as never,
    });
    const c = mountInto(
      <RowColumnContainerCard
        padlet={container}
        allPadlets={[container, drawing]}
        showHeader={false}
        disableInternalScroll
        onViewDrawing={onViewDrawing}
      />,
    );
    const clickable = childWrapper(c, 'd-3')!.querySelector('.cursor-zoom-in')!;
    act(() => {
      clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onViewDrawing).toHaveBeenCalledTimes(1);
  });

  it('a fullView CARD child drops CardPreview\'s own inner frame too', () => {
    const c = mountContainer([
      child({ id: 'c-1', type: 'card', metadata: { fullView: true, svgUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' } as never }),
    ]);
    const wrapper = childWrapper(c, 'c-1');
    expect(wrapper!.className).not.toContain('border');
    const preview = wrapper!.querySelector('.group.relative') as HTMLElement | null;
    expect(preview).not.toBeNull();
    expect(preview!.className).not.toContain('border');
  });
});
