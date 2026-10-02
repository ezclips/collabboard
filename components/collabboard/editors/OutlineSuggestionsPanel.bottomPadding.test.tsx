// @vitest-environment jsdom
//
// PATCH-249 -- the scrolling design list gets bottom padding so its last
// element ("Show more", or the Colours row) is fully visible at the end of the
// scroll instead of being clipped by the dashed preview frame.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

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

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

describe('PATCH-249 OutlineSuggestionsPanel scroll padding', () => {
  it('gives the scrolling design list bottom padding', () => {
    const c = mount(
      <OutlineSuggestionsPanel
        options={suggestDesigns(OUTLINE)}
        selectedKey={null}
        onSelect={() => {}}
        envelopeFor={(option) => ({
          mode: 'diagram',
          version: 1,
          data: option.envelopeData,
          meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
        })}
      />,
    );
    const tiles = c.querySelector('[data-ai-outline-tiles]') as HTMLElement;
    expect(tiles).not.toBeNull();
    expect(tiles.className.split(/\s+/)).toContain('pb-4');
  });
});
