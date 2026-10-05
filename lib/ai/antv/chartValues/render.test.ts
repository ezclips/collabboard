// @vitest-environment jsdom
//
// PATCH-287. The render shell with the AntV module stubbed: the off-screen
// container must be removed and the instance destroyed on success and on
// failure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

const mocks = vi.hoisted(() => {
  const state = {
    instances: [] as Array<{ destroyed: boolean; options: { container: HTMLElement } }>,
    convertOptions: [] as Array<Record<string, unknown>>,
    behavior: 'loaded' as 'loaded' | 'error' | 'no-svg' | 'never',
  };
  class MockInfographic {
    options: { container: HTMLElement };
    handlers: Record<string, (...args: unknown[]) => void> = {};
    destroyed = false;
    constructor(options: { container: HTMLElement }) {
      this.options = options;
      state.instances.push(this);
    }
    on(event: string, callback: (...args: unknown[]) => void) {
      this.handlers[event] = callback;
      return this;
    }
    render() {
      if (state.behavior === 'never') return;
      if (state.behavior === 'error') {
        this.handlers.error?.(new Error('boom'));
        return;
      }
      if (state.behavior === 'loaded') this.options.container.innerHTML = '<svg></svg>';
      this.handlers.loaded?.();
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { state, MockInfographic: MockInfographic as unknown as new (options: { container: HTMLElement }) => unknown };
});

vi.mock('../load', () => ({
  loadAntv: async () => ({ Infographic: mocks.MockInfographic }),
}));

vi.mock('../toExcalidraw', () => ({
  convertAntvSvg: async (_svg: Element, options: Record<string, unknown>) => {
    mocks.state.convertOptions.push(options);
    return { elements: [{ id: 'e0', type: 'rectangle' }], files: {}, scene: null, report: null };
  },
}));

import { renderAntvToElements } from './render';

const OUTLINE: VisualOutline = {
  title: 'Seasonal plan',
  ordered: true,
  kind: 'list',
  items: [
    { label: 'Spring', value: 24 },
    { label: 'Summer', value: 40 },
  ],
};

beforeEach(() => {
  mocks.state.instances.length = 0;
  mocks.state.convertOptions.length = 0;
  mocks.state.behavior = 'loaded';
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('PATCH-287: renderAntvToElements', () => {
  it('removes its off-screen container and destroys the instance on success', async () => {
    const before = document.body.children.length;
    const result = await renderAntvToElements({
      template: 'chart-pie-donut-pill-badge',
      theme: 'classic',
      outline: OUTLINE,
    });
    expect(result.elements).toHaveLength(1);
    expect(document.body.children.length).toBe(before);
    expect(mocks.state.instances[0].destroyed).toBe(true);
    expect(mocks.state.convertOptions[0].roles).toBe(true);
    expect(mocks.state.convertOptions[0].icons).toBe('strokes');
    expect(mocks.state.convertOptions[0].pill).toBe('polygon');
  });

  it('removes the container and destroys the instance when AntV errors', async () => {
    mocks.state.behavior = 'error';
    const before = document.body.children.length;
    await expect(
      renderAntvToElements({ template: 'chart-column-simple', theme: 'classic', outline: OUTLINE }),
    ).rejects.toThrow();
    expect(document.body.children.length).toBe(before);
    expect(mocks.state.instances[0].destroyed).toBe(true);
  });

  it('removes the container and destroys the instance when no svg is produced', async () => {
    mocks.state.behavior = 'no-svg';
    const before = document.body.children.length;
    await expect(
      renderAntvToElements({ template: 'chart-line-plain-text', theme: 'classic', outline: OUTLINE }),
    ).rejects.toThrow();
    expect(document.body.children.length).toBe(before);
    expect(mocks.state.instances[0].destroyed).toBe(true);
  });

  it('leaves a container it does not own in place', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderAntvToElements({
      template: 'chart-pie-donut-pill-badge',
      theme: 'classic',
      outline: OUTLINE,
      container,
    });
    expect(document.body.contains(container)).toBe(true);
  });

  it('times out, removes the container and destroys the instance when AntV never settles', async () => {
    vi.useFakeTimers();
    mocks.state.behavior = 'never';
    const before = document.body.children.length;
    const promise = renderAntvToElements({
      template: 'chart-column-simple',
      theme: 'classic',
      outline: OUTLINE,
    });
    const rejection = expect(promise).rejects.toThrow('AntV render timed out');
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    expect(document.body.children.length).toBe(before);
    expect(mocks.state.instances[0].destroyed).toBe(true);
  });
});
