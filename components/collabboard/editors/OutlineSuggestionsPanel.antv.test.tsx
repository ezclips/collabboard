// @vitest-environment jsdom
//
// PATCH-241 -- the suggestions panel shows the AntV library with a per-category
// cap + "Show more", and a "Similar visuals" row for the selected design.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { similarTemplates } from '@/lib/ai/antv/catalog';
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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

const OPTIONS = suggestDesigns(OUTLINE);
const ANTV_SELECTED = OPTIONS.find((option) => option.key.startsWith('antv:'))!;

function render(selectedKey = ANTV_SELECTED.key) {
  return mount(
    <OutlineSuggestionsPanel
      options={OPTIONS}
      selectedKey={selectedKey}
      onSelect={() => {}}
      envelopeFor={(option) => ({
        mode: 'diagram',
        version: 1,
        data: option.envelopeData,
        meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
      })}
    />,
  );
}

describe('PATCH-241 OutlineSuggestionsPanel AntV library', () => {
  it('offers the suggested AntV tiles', () => {
    const c = render();
    expect(c.querySelector('[data-ai-outline-option^="antv:"]')).not.toBeNull();
  });

  it('caps a family at 12 tiles and reveals the rest with Show more', () => {
    const c = render();
    const showMore = c.querySelector('[data-ai-show-more="hierarchy"]') as HTMLElement;
    expect(showMore).not.toBeNull();

    // PATCH-246: headings group by picture family, so count the tiles inside
    // this group (the Show more button's parent), not by key prefix.
    const group = showMore.parentElement as HTMLElement;
    const count = () => group.querySelectorAll('[data-ai-outline-option]').length;
    const before = count();
    expect(before).toBe(12);
    click(showMore);
    expect(count()).toBeGreaterThan(before);
  });

  it('shows a similar-visuals row for the selected AntV design', () => {
    const c = render();
    const name = ANTV_SELECTED.key.slice('antv:'.length);
    const expected = similarTemplates(name).filter((candidate) =>
      OPTIONS.some((option) => option.key === `antv:${candidate}`),
    );
    expect(expected.length).toBeGreaterThan(0);

    const toggle = c.querySelector('[data-ai-similar-toggle="true"]') as HTMLElement;
    expect(toggle).not.toBeNull();
    expect(c.querySelector('[data-ai-similar-row]')).toBeNull();
    click(toggle);

    const row = c.querySelector('[data-ai-similar-row="true"]') as HTMLElement;
    expect(row).not.toBeNull();
    const shown = Array.from(row.querySelectorAll('[data-ai-similar-template]')).map((el) =>
      el.getAttribute('data-ai-similar-template'),
    );
    expect(shown).toEqual(expected);
    expect(shown).not.toContain(name);
  });

  it('shows no similar row for one of our own designs', () => {
    const c = render('infographic:stack');
    expect(c.querySelector('[data-ai-similar-toggle="true"]')).toBeNull();
  });
});
