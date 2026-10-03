// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyKickerToContent,
  readDiagramKicker,
  useDiagramKicker,
  type DiagramKickerController,
} from './useDiagramKicker';

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

const STORED = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: 'Plan',
    code: 'mindmap\n  root((plan))',
  },
  meta: { renderer: 'diagram_code', subtype: 'mindmap', prompt: 'p' },
};

describe('PATCH-264 useDiagramKicker', () => {
  it('reads a kicker out of a stored envelope', () => {
    expect(readDiagramKicker(STORED)).toBeUndefined();
    expect(readDiagramKicker({ ...STORED, data: { ...STORED.data, kicker: '' } })).toBe('');
    expect(readDiagramKicker({ ...STORED, data: { ...STORED.data, kicker: 'Q3' } })).toBe('Q3');
  });

  it('reads nothing from non-diagram content', () => {
    expect(readDiagramKicker({ mode: 'lesson_board', version: 1, data: { type: 'lesson_board', title: 'x', sections: [{ title: 's' }] } })).toBeUndefined();
    expect(readDiagramKicker(null)).toBeUndefined();
  });

  it('applies the kicker to a diagram, fusing into the envelope meta', () => {
    const next = applyKickerToContent(STORED, 'Project files') as typeof STORED;
    expect((next.data as { kicker?: string }).kicker).toBe('Project files');
    expect(next.data.title).toBe('Plan');
    expect(next.meta).toEqual(STORED.meta);

    const cleared = applyKickerToContent(STORED, '') as typeof STORED;
    expect((cleared.data as { kicker?: string }).kicker).toBe('');
  });

  it('leaves non-diagram content untouched', () => {
    const lesson = { mode: 'lesson_board', version: 1, data: { type: 'lesson_board', title: 'x', sections: [{ title: 's' }] } };
    expect(applyKickerToContent(lesson, 'Q3')).toBe(lesson);
  });

  it('the hook exposes state, applies it, and resets', () => {
    let latest: DiagramKickerController | null = null;
    function Harness({ initial }: { initial?: string }) {
      latest = useDiagramKicker(initial);
      return React.createElement('div', null, latest.kicker ?? '__none__');
    }

    const c = mount(React.createElement(Harness, { initial: 'Q3' }));
    expect(c.textContent).toBe('Q3');
    expect(latest!.applyKicker({ title: 'x' })).toEqual({ title: 'x', kicker: 'Q3' });

    act(() => { latest!.onChange(''); });
    expect(c.textContent).toBe('');
    expect(latest!.applyKicker({ title: 'x' })).toEqual({ title: 'x', kicker: '' });

    act(() => { latest!.reset(undefined); });
    expect(c.textContent).toBe('__none__');
  });
});
