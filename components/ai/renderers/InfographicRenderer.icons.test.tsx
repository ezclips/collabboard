// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';
import { VISUAL_ICON_MAP, getVisualIcon } from './visualIconMap';
import InfographicRenderer from './InfographicRenderer';
import type { InfographicDiagramData, InfographicTemplate } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

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

describe('PATCH-237 visualIconMap', () => {
  it('every VISUAL_ICON_NAMES entry maps to a component', () => {
    for (const name of VISUAL_ICON_NAMES) {
      expect(VISUAL_ICON_MAP[name], `no component for ${name}`).toBeTruthy();
    }
  });

  it('getVisualIcon returns null for an unknown name', () => {
    expect(getVisualIcon('not-a-real-icon')).toBeNull();
    expect(getVisualIcon(undefined)).toBeNull();
  });
});

function data(template: InfographicTemplate, outline: VisualOutline): InfographicDiagramData {
  return { type: 'diagram', subtype: 'infographic', renderer: 'infographic', title: outline.title, template, outline };
}

const withIcons: VisualOutline = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'Spring', icon: 'sun' },
    { label: 'Winter', icon: 'snowflake' },
    { label: 'Autumn' },
  ],
};

describe('PATCH-237 InfographicRenderer icons', () => {
  it('renders one svg icon per item that has one', () => {
    const c = mount(<InfographicRenderer data={data('stack', withIcons)} />);
    expect(c.querySelector('[data-infographic-icon="sun"]')).not.toBeNull();
    expect(c.querySelector('[data-infographic-icon="snowflake"]')).not.toBeNull();
    expect(c.querySelectorAll('[data-infographic-icon]')).toHaveLength(2);
  });

  it('an unknown icon name renders nothing', () => {
    const outline: VisualOutline = {
      title: 'T', ordered: false, kind: 'list',
      items: [{ label: 'A', icon: 'not-a-real-icon' }, { label: 'B' }, { label: 'C' }],
    };
    const c = mount(<InfographicRenderer data={data('stack', outline)} />);
    expect(c.querySelectorAll('[data-infographic-icon]')).toHaveLength(0);
  });
});
