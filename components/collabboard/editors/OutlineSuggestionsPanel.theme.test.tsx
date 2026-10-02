// @vitest-environment jsdom
//
// PATCH-238 -- picking a colour theme re-derives every option locally (no AI
// call) and the preview repaints. The heavy renderer is stubbed to the theme ->
// background contract; the real mapping is pinned in the renderer tests.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import type { VisualThemeId } from '@/lib/ai/visualThemes';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';
import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

vi.mock('@/components/ai/AIContentRenderer', async () => {
  const ReactModule = await import('react');
  const { VISUAL_THEMES } = await import('@/lib/ai/visualThemes');
  return {
    default: ({ content }: { content?: { data?: { theme?: VisualThemeId } } }) => {
      const id = content?.data?.theme ?? 'classic';
      const theme = VISUAL_THEMES[id] ?? VISUAL_THEMES.classic;
      return ReactModule.createElement('div', {
        'data-ai-theme-background': id,
        style: { backgroundColor: theme.background },
      });
    },
  };
});

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
  title: 'Water cycle',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

const THEMED = new Set(['infographic', 'mindmap', 'comparison', 'timeline']);
function withTheme<T extends { subtype: string }>(data: T, id: VisualThemeId): T {
  if (!THEMED.has(data.subtype) || id === 'classic') return data;
  return { ...data, theme: id } as T;
}

function Harness() {
  const [theme, setTheme] = React.useState<VisualThemeId>('classic');
  const options = suggestDesigns(OUTLINE).map((option) => ({
    ...option,
    envelopeData: withTheme(option.envelopeData, theme),
  }));
  const selected = options.find((option) => option.key === 'infographic:stack')!;
  return (
    <OutlineSuggestionsPanel
      options={options}
      selectedKey={selected.key}
      onSelect={() => {}}
      envelopeFor={(option) => ({
        mode: 'diagram',
        version: 1,
        data: option.envelopeData,
        meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
      })}
      theme={theme}
      onThemeChange={setTheme}
    />
  );
}

describe('PATCH-238 OutlineSuggestionsPanel colours', () => {
  it('a swatch click repaints the preview and makes NO fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = mount(<Harness />);

    const before = c.querySelector('[data-ai-outline-preview] [data-ai-theme-background]') as HTMLElement;
    expect(before.getAttribute('data-ai-theme-background')).toBe('classic');

    // PATCH-251: the swatches now live inside the Colours popover.
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    click(c.querySelector('[data-ai-theme="teal-night"]') as HTMLElement);

    const after = c.querySelector('[data-ai-outline-preview] [data-ai-theme-background]') as HTMLElement;
    expect(after.getAttribute('data-ai-theme-background')).toBe('teal-night');
    expect(after.style.backgroundColor).toBe('rgb(30, 77, 70)'); // #1E4D46
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a dark theme notes that Flow keeps its colours', () => {
    const c = mount(<Harness />);
    expect(c.textContent).not.toContain('keeps its colours');
    // PATCH-251: the swatches now live inside the Colours popover.
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    click(c.querySelector('[data-ai-theme="teal-night"]') as HTMLElement);
    expect(c.textContent).toContain('keeps its colours');
  });
});
