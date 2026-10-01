// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

vi.mock('./AntvInfographicRenderer', () => ({
  default: (props: { data: InfographicDiagramData }) =>
    React.createElement('div', { 'data-testid': 'antv-renderer', 'data-template': props.data.template }),
}));

import InfographicRenderer from './InfographicRenderer';

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

const outline: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }],
};

function data(template: InfographicDiagramData['template']): InfographicDiagramData {
  return { type: 'diagram', subtype: 'infographic', renderer: 'infographic', title: 'T', template, outline };
}

describe('PATCH-241 InfographicRenderer dispatch', () => {
  it('routes an antv: template to the AntV renderer', () => {
    const c = mount(<InfographicRenderer data={data('antv:list-grid-badge-card')} />);
    const antv = c.querySelector('[data-testid="antv-renderer"]');
    expect(antv).not.toBeNull();
    expect(antv?.getAttribute('data-template')).toBe('antv:list-grid-badge-card');
    expect(c.querySelector('[data-infographic-svg]')).toBeNull();
  });

  it('keeps our six designs on the original renderer', () => {
    const c = mount(<InfographicRenderer data={data('stack')} />);
    expect(c.querySelector('[data-testid="antv-renderer"]')).toBeNull();
    expect(c.querySelector('[data-infographic-svg="stack"]')).not.toBeNull();
  });

  it('a board/thumbnail render carries no PictureStage (only the editor and panel stage it)', () => {
    const our = mount(<InfographicRenderer data={data('stack')} />);
    expect(our.querySelector('[data-picture-stage]')).toBeNull();
    const antv = mount(<InfographicRenderer data={data('antv:list-grid-badge-card')} />);
    expect(antv.querySelector('[data-picture-stage]')).toBeNull();
  });
});
