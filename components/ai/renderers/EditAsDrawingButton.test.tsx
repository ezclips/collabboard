// @vitest-environment jsdom
//
// PATCH-278 D. The "Edit as drawing" button: converting state, failure message,
// the Save-derived disabled reason, and that the converted data reaches
// `onDrawing`. `buildDrawingPostData` is mocked; the conversion itself is
// covered by drawingPost.test.ts.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDrawingPostData, type DrawingPostData } from '@/lib/ai/antv/toExcalidraw/drawingPost';
import EditAsDrawingButton from './EditAsDrawingButton';

vi.mock('@/lib/ai/antv/toExcalidraw/drawingPost', () => ({
  buildDrawingPostData: vi.fn(),
  DrawingConversionError: class DrawingConversionError extends Error {},
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const DATA: DrawingPostData = {
  drawingData: 'DATA',
  drawingAppState: 'APP',
  drawingFiles: 'FILES',
  previewUrl: 'data:image/svg+xml;base64,AA==',
  title: 'Pic',
  size: { width: 500, height: 300 },
};

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.mocked(buildDrawingPostData).mockReset();
});

const button = (c: ParentNode) => c.querySelector('[data-ai-edit-as-drawing="true"]') as HTMLButtonElement;
function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('PATCH-278 EditAsDrawingButton', () => {
  it('shows Converting… and disables while the conversion runs, then calls onDrawing', async () => {
    let resolve!: (value: DrawingPostData) => void;
    vi.mocked(buildDrawingPostData).mockReturnValue(new Promise((r) => { resolve = r; }));
    const onDrawing = vi.fn();
    const c = mount(
      <EditAsDrawingButton
        getSvg={() => null}
        getBackground={() => 'rgb(17, 34, 51)'}
        title="Pic"
        onDrawing={onDrawing}
      />,
    );
    click(button(c));
    await act(async () => { await Promise.resolve(); });
    expect(button(c).textContent).toContain('Converting…');
    expect(button(c).disabled).toBe(true);

    await act(async () => { resolve(DATA); await Promise.resolve(); });
    expect(onDrawing).toHaveBeenCalledWith(DATA);
    expect(vi.mocked(buildDrawingPostData)).toHaveBeenCalledWith(null, {
      background: '#112233',
      title: 'Pic',
    });
  });

  it('shows an inline message and keeps the picture when the conversion throws', async () => {
    vi.mocked(buildDrawingPostData).mockRejectedValue(new Error('nope'));
    const onDrawing = vi.fn();
    const c = mount(
      <EditAsDrawingButton getSvg={() => null} getBackground={() => '#ffffff'} onDrawing={onDrawing} />,
    );
    click(button(c));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const error = c.querySelector('[data-ai-edit-as-drawing-error="true"]');
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain('could not be turned into a drawing');
    expect(onDrawing).not.toHaveBeenCalled();
  });

  it('is disabled with the reason when disabledReason is set, and does nothing on click', () => {
    const onDrawing = vi.fn();
    const c = mount(
      <EditAsDrawingButton
        getSvg={() => null}
        getBackground={() => '#ffffff'}
        disabledReason="Make the chart or type your numbers first"
        onDrawing={onDrawing}
      />,
    );
    expect(button(c).disabled).toBe(true);
    expect(button(c).getAttribute('title')).toBe('Make the chart or type your numbers first');
    click(button(c));
    expect(buildDrawingPostData).not.toHaveBeenCalled();
    expect(onDrawing).not.toHaveBeenCalled();
  });

  it('normalises a named/hex background to #rrggbb', async () => {
    // The normaliser is exercised through the call argument above; this pins the
    // hex shortcut as well.
    const c = mount(
      <EditAsDrawingButton getSvg={() => null} getBackground={() => '#ABC'} onDrawing={() => {}} />,
    );
    vi.mocked(buildDrawingPostData).mockResolvedValue(DATA);
    click(button(c));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(vi.mocked(buildDrawingPostData)).toHaveBeenCalledWith(null, {
      background: '#aabbcc',
      title: undefined,
    });
  });
});
