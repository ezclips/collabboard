// @vitest-environment jsdom
//
// PATCH-264 live round 1. The generator's design tiles are <button>s that live
// inside the edit provider. A tile's label must therefore be read-only on the
// FIRST render, or React draws an invalid nested <button> and hydration warns.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { DiagramKickerEditContext } from '@/components/ai/renderers/DiagramKicker';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';
import type { VisualOutline } from '@/lib/ai/outline';
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
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [{ label: 'Spring' }, { label: 'Summer' }],
};

const OPTION: DesignSuggestion = {
  key: 'infographic:stack',
  label: 'Stack',
  category: 'Hierarchy',
  fit: 1,
  envelopeData: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'stack',
    outline: OUTLINE,
  },
};

describe('PATCH-264 OutlineSuggestionsPanel design tiles', () => {
  it('a tile inside the edit provider renders no nested button and no role=button', () => {
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange: () => {} }}>
        <OutlineSuggestionsPanel
          options={[OPTION]}
          selectedKey={OPTION.key}
          onSelect={() => {}}
          envelopeFor={(option) => ({
            mode: 'diagram',
            version: 1,
            data: option.envelopeData,
            meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
          })}
        />
      </DiagramKickerEditContext.Provider>,
    );

    const tile = c.querySelector('[data-ai-outline-option]') as HTMLElement;
    expect(tile).not.toBeNull();
    expect(tile.querySelector('button')).toBeNull();
    expect(tile.querySelector('[role="button"]')).toBeNull();
    expect(tile.querySelector('[data-ai-kicker]')!.textContent).toBe('infographic');
  });
});
