// @vitest-environment jsdom
//
// PATCH-246 -- the suggestions gallery filters by picture family with local
// chips (no fetch), keeps the selected design when it stays visible, and offers
// the "make a chart" affordance when the Chart chip has no designs to show.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';
import { pictureFamily } from '@/lib/ai/pictureFamilies';

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
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const OUTLINE: VisualOutline = {
  title: 'Ordered list',
  ordered: true,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
};
const OPTIONS = suggestDesigns(OUTLINE);

function envelopeFor(option: (typeof OPTIONS)[number]) {
  return {
    mode: 'diagram',
    version: 1,
    data: option.envelopeData,
    meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
  };
}

function Harness({
  options = OPTIONS,
  initialKey = OPTIONS[0].key,
  onMakeChart,
}: {
  options?: typeof OPTIONS;
  initialKey?: string;
  onMakeChart?: (subtype: 'pie_chart' | 'bar_chart') => void;
}) {
  const [selectedKey, setSelectedKey] = React.useState(initialKey);
  return (
    <OutlineSuggestionsPanel
      options={options}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      envelopeFor={envelopeFor}
      onMakeChart={onMakeChart}
    />
  );
}

function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
}
function pressedKeys(c: ParentNode): string[] {
  return tiles(c)
    .filter((el) => el.getAttribute('aria-pressed') === 'true')
    .map((el) => el.getAttribute('data-ai-outline-option') ?? '');
}

describe('PATCH-246 OutlineSuggestionsPanel family chips', () => {
  it('renders a chip for each family present, plus Chart whenever there are results', () => {
    const c = mount(<Harness />);
    expect(c.querySelector('[data-ai-family-chip="all"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-family-chip="flow"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-family-chip="timeline"]')).not.toBeNull();
    // Chart has no designs to show, but its chip is always there once there are results.
    expect(c.querySelector('[data-ai-family-chip="chart"]')).not.toBeNull();
  });

  it('hides a family chip when no design belongs to it', () => {
    const withoutTimeline = OPTIONS.filter((option) => pictureFamily(option) !== 'timeline');
    const c = mount(<Harness options={withoutTimeline} />);
    expect(c.querySelector('[data-ai-family-chip="timeline"]')).toBeNull();
    expect(c.querySelector('[data-ai-family-chip="flow"]')).not.toBeNull();
  });

  it('clicking Timeline shows only timeline tiles and makes NO fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = mount(<Harness />);

    click(c.querySelector('[data-ai-family-chip="timeline"]') as HTMLElement);

    const shown = tiles(c);
    expect(shown.length).toBeGreaterThan(0);
    for (const tile of shown) {
      const key = tile.getAttribute('data-ai-outline-option') ?? '';
      expect(pictureFamily({ key })).toBe('timeline');
    }
    expect((c.querySelector('[data-ai-family-chip="timeline"]') as HTMLElement).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the selected design when it stays visible across a chip change', () => {
    const comparison = OPTIONS.find((option) => pictureFamily(option) === 'comparison')!;
    const c = mount(<Harness initialKey={comparison.key} />);
    expect(pressedKeys(c)).toEqual([comparison.key]);

    click(c.querySelector('[data-ai-family-chip="comparison"]') as HTMLElement);
    expect(pressedKeys(c)).toEqual([comparison.key]);
  });

  it('selects the first visible design when the old selection is filtered out', () => {
    const comparison = OPTIONS.find((option) => pictureFamily(option) === 'comparison')!;
    const firstTimeline = OPTIONS.find((option) => pictureFamily(option) === 'timeline')!;
    const c = mount(<Harness initialKey={comparison.key} />);

    click(c.querySelector('[data-ai-family-chip="timeline"]') as HTMLElement);
    expect(pressedKeys(c)).toEqual([firstTimeline.key]);
  });

  it('"All" restores every tile', () => {
    const c = mount(<Harness />);
    const total = tiles(c).length;

    click(c.querySelector('[data-ai-family-chip="timeline"]') as HTMLElement);
    expect(tiles(c).length).toBeLessThan(total);

    click(c.querySelector('[data-ai-family-chip="all"]') as HTMLElement);
    expect(tiles(c).length).toBe(total);
    expect((c.querySelector('[data-ai-family-chip="all"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('Chart with no chart designs shows the note and both make-chart buttons', () => {
    const onMakeChart = vi.fn();
    const c = mount(<Harness onMakeChart={onMakeChart} />);

    click(c.querySelector('[data-ai-family-chip="chart"]') as HTMLElement);

    expect(tiles(c)).toHaveLength(0);
    expect(c.textContent).toContain('Charts need numbers.');
    const pie = c.querySelector('[data-ai-make-chart="pie"]') as HTMLElement;
    const bar = c.querySelector('[data-ai-make-chart="bar"]') as HTMLElement;
    expect(pie).not.toBeNull();
    expect(bar).not.toBeNull();

    click(pie);
    expect(onMakeChart).toHaveBeenCalledWith('pie_chart');
  });
});
