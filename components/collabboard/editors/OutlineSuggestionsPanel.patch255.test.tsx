// @vitest-environment jsdom
//
// PATCH-255. When the panel unmounts while open it reports closed, so the
// editor's side-panel state cannot outlive the panel (switching mode unmounts
// it without going through the close button).
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};
const OPTIONS = suggestDesigns(OUTLINE);

const envelopeFor = (option: (typeof OPTIONS)[number]) => ({
  mode: 'diagram',
  version: 1,
  data: option.envelopeData,
  meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PATCH-255 OutlineSuggestionsPanel unmount', () => {
  it('reports closed on unmount when the panel was open', () => {
    const onSidePanelChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <OutlineSuggestionsPanel
          options={OPTIONS}
          selectedKey={OPTIONS[0].key}
          onSelect={() => {}}
          envelopeFor={envelopeFor}
          outline={OUTLINE}
          onEditOutline={() => {}}
          onThemeChange={() => {}}
          onSidePanelChange={onSidePanelChange}
        />,
      );
    });

    // It opens on Designs (options are present), so it reports open.
    expect(container.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();
    expect(onSidePanelChange).toHaveBeenLastCalledWith(true);

    act(() => { root.unmount(); });
    expect(onSidePanelChange).toHaveBeenLastCalledWith(false);
  });
});
