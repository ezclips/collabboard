// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { DrawnDiagramData } from '@/lib/ai/contracts';
import type { DrawnPicture } from '@/lib/ai/drawn/format';

import DrawnPictureRenderer from './DrawnPictureRenderer';

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

const outline = { title: 'T', ordered: false, kind: 'steps' as const, items: [{ label: 'A' }, { label: 'B' }] };

function data(picture: DrawnPicture): DrawnDiagramData {
  return {
    type: 'diagram',
    subtype: 'drawn',
    renderer: 'drawn',
    title: 'T',
    kind: 'flowchart',
    seed: 1,
    outline,
    picture,
  };
}

const basics: DrawnPicture = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [
    { id: 'card', type: 'rect', x: 10, y: 10, w: 200, h: 80, fill: '#dceef5', stroke: '#2c7da0' },
    { id: 'label', type: 'text', text: 'Hello', x: 20, y: 30, w: 180, size: 16, color: '#111111', in: 'card' },
  ],
};

describe('PATCH-284 DrawnPictureRenderer', () => {
  it('renders the picture with a data-ai-drawn root', () => {
    const c = mount(<DrawnPictureRenderer data={data(basics)} />);
    const root = c.querySelector('[data-ai-drawn="true"]');
    expect(root).not.toBeNull();
    expect(root!.querySelector('svg')).not.toBeNull();
    expect(root!.querySelector('rect')).not.toBeNull();
  });

  it('renders hostile text as inert, escaped text', () => {
    const hostile: DrawnPicture = {
      ...basics,
      elements: [
        {
          id: 'x"/><script>alert(1)</script>',
          type: 'text',
          text: '<script>alert(1)</script> onload=alert(2)',
          x: 20,
          y: 30,
          w: 400,
          size: 16,
          color: '#111111',
        },
      ],
    };
    const c = mount(<DrawnPictureRenderer data={data(hostile)} />);
    const root = c.querySelector('[data-ai-drawn="true"]') as HTMLElement;
    expect(root.querySelector('script')).toBeNull();
    expect(root.innerHTML).not.toContain('<script');
    expect(root.querySelector('[onload]')).toBeNull();
    expect(root.querySelector('[onerror]')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script>');
  });

  it('draws repaired slices for a stored pie whose wedges have no angles', () => {
    const fills = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed'];
    const pie: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: fills.map((fill, item) => ({
        id: `wedge-${item}`,
        type: 'wedge' as const,
        item,
        cx: 300,
        cy: 300,
        r: 160,
        inner: 80,
        fill,
      })),
    };
    const c = mount(
      <DrawnPictureRenderer
        data={{
          type: 'diagram',
          subtype: 'drawn',
          renderer: 'drawn',
          title: 'Budget',
          kind: 'pie',
          seed: 1,
          outline: {
            title: 'Budget',
            ordered: false,
            kind: 'parts',
            items: fills.map((_, index) => ({ label: `I${index}`, value: 10 + index })),
          },
          picture: pie,
        }}
      />,
    );
    const polygons = c.querySelectorAll('[data-ai-drawn] polygon');
    expect(polygons).toHaveLength(5);
    fills.forEach((fill) => {
      expect(Array.from(polygons).some((poly) => poly.getAttribute('fill') === fill)).toBe(true);
    });
  });

  it('never emits a javascript: attribute from text', () => {
    const hostile: DrawnPicture = {
      ...basics,
      elements: [
        { id: 'a', type: 'text', text: 'javascript:alert(1)', x: 20, y: 30, w: 400, size: 16, color: '#111111' },
      ],
    };
    const c = mount(<DrawnPictureRenderer data={data(hostile)} />);
    const root = c.querySelector('[data-ai-drawn="true"]') as HTMLElement;
    expect(root.querySelector('[href*="javascript"]')).toBeNull();
    expect(root.querySelector('[src*="javascript"]')).toBeNull();
    expect(root.textContent).toContain('javascript:alert(1)');
  });
});
