// @vitest-environment jsdom
//
// PATCH-278 E (Edit window). "Edit as drawing" appears in the footer only for an
// AntV infographic when onEditAsDrawing is given; Save's disabled rule is
// shared; clicking calls onEditAsDrawing.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIContentEditModal from './AIContentEditModal';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

vi.mock('@/components/ai/renderers/EditAsDrawingButton', () => ({
  default: ({ disabledReason, title, onDrawing }: any) =>
    React.createElement('button', {
      'data-ai-edit-as-drawing': 'true',
      'data-title': title ?? '',
      'data-disabled': disabledReason ?? '',
      onClick: () => onDrawing({ drawingData: 'D' }),
    }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function drawButton(c: ParentNode): HTMLButtonElement | null {
  return c.querySelector('[data-ai-edit-as-drawing="true"]') as HTMLButtonElement | null;
}

function envelope(template: unknown, title = 'T') {
  return {
    mode: 'diagram',
    version: 1,
    data: {
      type: 'diagram',
      subtype: 'infographic',
      renderer: 'infographic',
      title,
      template,
      outline: { title, ordered: false, items: [{ label: 'A' }, { label: 'B' }] },
    },
    meta: { renderer: 'infographic', subtype: 'infographic', prompt: '' },
  } as never;
}

describe('PATCH-278 Edit window Edit as drawing', () => {
  it('shows the button for an AntV infographic when onEditAsDrawing is given', () => {
    const c = mount(
      <AIContentEditModal
        isOpen
        onClose={() => {}}
        envelope={envelope('antv:list-grid-badge-card')}
        onSave={() => {}}
        onEditAsDrawing={() => {}}
      />,
    );
    expect(drawButton(c)).not.toBeNull();
  });

  it('hides the button without onEditAsDrawing and for our own designs', () => {
    const withoutProp = mount(
      <AIContentEditModal
        isOpen
        onClose={() => {}}
        envelope={envelope('antv:list-grid-badge-card')}
        onSave={() => {}}
      />,
    );
    expect(drawButton(withoutProp)).toBeNull();

    const own = mount(
      <AIContentEditModal
        isOpen
        onClose={() => {}}
        envelope={envelope('pyramid')}
        onSave={() => {}}
        onEditAsDrawing={() => {}}
      />,
    );
    expect(drawButton(own)).toBeNull();
  });

  it('clicking calls onEditAsDrawing', () => {
    const onEditAsDrawing = vi.fn();
    const c = mount(
      <AIContentEditModal
        isOpen
        onClose={() => {}}
        envelope={envelope('antv:list-grid-badge-card')}
        onSave={() => {}}
        onEditAsDrawing={onEditAsDrawing}
      />,
    );
    click(drawButton(c)!);
    expect(onEditAsDrawing).toHaveBeenCalledTimes(1);
    expect(onEditAsDrawing.mock.calls[0][0]).toEqual({ drawingData: 'D' });
  });

  it('PATCH-279: passes the picture title to the drawing', () => {
    const c = mount(
      <AIContentEditModal
        isOpen
        onClose={() => {}}
        envelope={envelope('antv:list-grid-badge-card')}
        onSave={() => {}}
        onEditAsDrawing={() => {}}
      />,
    );
    expect(drawButton(c)!.getAttribute('data-title')).toBe('T');
  });

  it('PATCH-279: with no title, the button passes no title', () => {
    const c = mount(
      <AIContentEditModal
        isOpen
        onClose={() => {}}
        envelope={envelope('antv:list-grid-badge-card', '')}
        onSave={() => {}}
        onEditAsDrawing={() => {}}
      />,
    );
    expect(drawButton(c)!.getAttribute('data-title')).toBe('');
  });
});
