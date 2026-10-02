// @vitest-environment jsdom
//
// PATCH-253. The AntV renderer passes `data.style` into `toAntvOptions`, paints
// the style background, and re-creates the engine when the style changes.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

interface FakeInstance {
  options: Record<string, any>;
}

const h = vi.hoisted(() => {
  const instances: FakeInstance[] = [];
  class FakeInfographic implements FakeInstance {
    options: Record<string, any>;
    constructor(options: Record<string, any>) {
      this.options = options;
      instances.push(this as unknown as FakeInstance);
    }
    on() {}
    render() {}
    update() {}
    destroy() {}
  }
  return { instances, FakeInfographic };
});

vi.mock('@/lib/ai/antv/load', () => ({
  loadAntv: async () => ({ Infographic: h.FakeInfographic }),
}));

import AntvInfographicRenderer from './AntvInfographicRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
beforeEach(() => { h.instances.length = 0; });
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

const outline: VisualOutline = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [{ label: 'Spring' }, { label: 'Summer' }],
};

function data(background: string): InfographicDiagramData {
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'antv:list-grid-badge-card',
    outline,
    style: {
      background,
      colors: ['#ff0000', '#00ff00'],
      fonts: { title: { family: 'serif', weight: 700 }, label: { family: 'mono', weight: 500 } },
    },
  };
}

describe('PATCH-253 AntvInfographicRenderer style', () => {
  it('paints the style background and passes the style into the engine options', async () => {
    const { container } = mount(<AntvInfographicRenderer data={data('#112233')} />);
    const block = container.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.style.backgroundColor).toBe('rgb(17, 34, 51)'); // #112233
    await flush();
    const options = h.instances[0].options;
    expect(options.themeConfig.colorBg).toBe('#112233');
    expect(options.themeConfig.palette).toEqual(['#ff0000', '#00ff00']);
    expect(options.themeConfig.title).toMatchObject({ 'font-weight': 700 });
    expect(options.themeConfig.item.label).toMatchObject({ 'font-weight': 500 });
  });

  it('re-creates the engine when the style changes', async () => {
    const { root, container } = mount(<AntvInfographicRenderer data={data('#112233')} />);
    await flush();
    expect(h.instances.length).toBe(1);
    act(() => { root.render(<AntvInfographicRenderer data={data('#445566')} />); });
    await flush();
    expect(h.instances.length).toBe(2);
    expect((container.querySelector('[data-ai-theme-background]') as HTMLElement).style.backgroundColor).toBe(
      'rgb(68, 85, 102)',
    );
  });
});
