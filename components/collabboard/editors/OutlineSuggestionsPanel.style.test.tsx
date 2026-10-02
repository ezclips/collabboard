// @vitest-environment jsdom
//
// PATCH-253. The Colours panel is now "Colours & Fonts": preset themes, a
// background, one colour per used palette slot, the three fonts, and Reset.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';
import type { VisualStyle } from '@/lib/ai/visualStyle';
import type { VisualThemeId } from '@/lib/ai/visualThemes';
import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

vi.mock('@/components/ai/AIContentRenderer', async () => {
  const ReactModule = await import('react');
  return { default: () => ReactModule.createElement('div', { 'data-testid': 'ai-content-stub' }) };
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
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const OUTLINE: VisualOutline = {
  title: 'Water cycle',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

function Harness({ onChange }: { onChange: (style: VisualStyle | undefined) => void }) {
  const [style, setStyle] = React.useState<VisualStyle | undefined>(undefined);
  const [theme, setTheme] = React.useState<VisualThemeId>('classic');
  const options = suggestDesigns(OUTLINE);
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
      outline={OUTLINE}
      onEditOutline={() => {}}
      theme={theme}
      onThemeChange={setTheme}
      visualStyle={style}
      onVisualStyleChange={(next) => { setStyle(next); onChange(next); }}
    />
  );
}

describe('PATCH-253 Colours & Fonts panel', () => {
  it('shows the five sections', () => {
    const c = mount(<Harness onChange={() => {}} />);
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    expect(c.textContent).toContain('Colours & Fonts');
    for (const section of ['themes', 'background', 'elements', 'fonts', 'reset']) {
      expect(c.querySelector(`[data-ai-style-section="${section}"]`), section).not.toBeNull();
    }
    // One colour input per outline item (3), and the three font selects.
    expect(c.querySelectorAll('[data-ai-style-color]')).toHaveLength(3);
    for (const role of ['title', 'label', 'desc']) {
      expect(c.querySelector(`[data-ai-style-font="${role}"]`)).not.toBeNull();
      expect(c.querySelector(`[data-ai-style-weight="${role}"]`)).not.toBeNull();
    }
  });

  it('changing the background reports a style with only that background', () => {
    const calls: Array<VisualStyle | undefined> = [];
    const c = mount(<Harness onChange={(style) => calls.push(style)} />);
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-style-background]') as HTMLInputElement, '#112233');
    expect(calls.at(-1)).toEqual({ background: '#112233' });
  });

  it('a theme swatch click clears the custom style', () => {
    const calls: Array<VisualStyle | undefined> = [];
    const c = mount(<Harness onChange={(style) => calls.push(style)} />);
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-style-background]') as HTMLInputElement, '#112233');
    click(c.querySelector('[data-ai-theme="teal-night"]') as HTMLElement);
    expect(calls.at(-1)).toBeUndefined();
  });

  it('Reset clears the custom style', () => {
    const calls: Array<VisualStyle | undefined> = [];
    const c = mount(<Harness onChange={(style) => calls.push(style)} />);
    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-style-background]') as HTMLInputElement, '#112233');
    click(c.querySelector('[data-ai-style-reset="true"]') as HTMLElement);
    expect(calls.at(-1)).toBeUndefined();
  });
});
