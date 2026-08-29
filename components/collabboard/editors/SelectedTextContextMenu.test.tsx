// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SelectedTextContextMenu from './SelectedTextContextMenu';
import { TEXT_COLOR_PRESETS, HIGHLIGHT_COLOR_PRESETS } from './textStylePresets';

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
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

// PositionedContextMenu defers attaching its dismissal listeners so the
// interaction that opened the menu cannot immediately close it -- same
// helper/rationale as tableCellContextMenu.characterization.test.tsx.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

function surface() {
  return document.body.querySelector('[data-positioned-menu-surface]') as HTMLElement;
}
function swatch(label: string) {
  return document.body.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
}
// Text color and Highlight now share one palette, so the same hex string
// appears twice (aria-label collides) -- scope to the section that follows
// the given label when a test must click the one from a specific row.
function swatchInSection(sectionLabel: string, color: string) {
  const label = Array.from(document.body.querySelectorAll('[data-slot="context-menu-label"]')).find((el) => el.textContent === sectionLabel)!;
  return (label.nextElementSibling as HTMLElement).querySelector(`[aria-label="${color}"]`) as HTMLElement | null;
}
function noop() { return vi.fn(); }

describe('SelectedTextContextMenu: renders the one shared palette authority', () => {
  // R3A-2: TEXT_COLOR_PRESETS must be the SAME canonical 17-swatch list every
  // surface renders (ColorPickerContent's own default, TextStylePopup's text
  // mode, and this menu) -- not a smaller, independently-curated list.
  it('renders one swatch per canonical preset entry; the palette is the full 17-swatch list, not a reduced curated set', () => {
    expect(TEXT_COLOR_PRESETS).toHaveLength(17);
    expect(HIGHLIGHT_COLOR_PRESETS).toEqual(['transparent', ...TEXT_COLOR_PRESETS]);
    mount(<SelectedTextContextMenu open x={10} y={10} onOpenChange={noop()} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    for (const color of TEXT_COLOR_PRESETS) expect(swatch(color)).not.toBeNull();
    for (const color of HIGHLIGHT_COLOR_PRESETS) expect(swatch(color === 'transparent' ? 'Clear' : color)).not.toBeNull();
  });
});

describe('SelectedTextContextMenu: text color', () => {
  it('clicking a swatch invokes onTextColor with that color, and neither highlight callback', () => {
    const onTextColor = vi.fn();
    const onHighlight = vi.fn();
    const onClearHighlight = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={onTextColor} onHighlight={onHighlight} onClearHighlight={onClearHighlight} />);
    act(() => { swatchInSection('Text color', '#212529')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onTextColor).toHaveBeenCalledWith('#212529');
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onClearHighlight).not.toHaveBeenCalled();
  });

  it('marks the current text color selected and no other swatch in that row', () => {
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} currentTextColor="#40c057" onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    expect(swatchInSection('Text color', '#40c057')!.getAttribute('data-selected')).toBe('');
    expect(swatchInSection('Text color', '#212529')!.hasAttribute('data-selected')).toBe(false);
  });
});

describe('SelectedTextContextMenu: highlight, including Clear', () => {
  it('clicking a real color swatch calls onHighlight, never onClearHighlight', () => {
    const onHighlight = vi.fn();
    const onClearHighlight = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={noop()} onHighlight={onHighlight} onClearHighlight={onClearHighlight} />);
    act(() => { swatchInSection('Highlight', '#fa5252')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onHighlight).toHaveBeenCalledWith('#fa5252');
    expect(onClearHighlight).not.toHaveBeenCalled();
  });

  it('clicking Clear calls onClearHighlight using the same transparent semantics as TextStylePopup, never onHighlight', () => {
    const onHighlight = vi.fn();
    const onClearHighlight = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={noop()} onHighlight={onHighlight} onClearHighlight={onClearHighlight} />);
    act(() => { swatch('Clear')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClearHighlight).toHaveBeenCalledTimes(1);
    expect(onHighlight).not.toHaveBeenCalled();
    expect(HIGHLIGHT_COLOR_PRESETS[0]).toBe('transparent');
  });
});

describe('SelectedTextContextMenu: AI seam is R3-inert', () => {
  it('renders no AI item when onAIAction is omitted', () => {
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    expect(document.body.textContent).not.toContain('Ask AI');
  });

  it('renders the AI item and fires the callback when supplied, with no network calls', () => {
    const onAIAction = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} onAIAction={onAIAction} />);
    const item = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((el) => el.textContent === 'Ask AI') as HTMLElement;
    expect(item).toBeTruthy();
    act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onAIAction).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('SelectedTextContextMenu: dismissal (delegated to PositionedContextMenu, not reimplemented)', () => {
  it('Escape closes the menu', () => {
    const onOpenChange = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={onOpenChange} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    act(() => { surface().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('an outside interaction closes the menu', async () => {
    const onOpenChange = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={onOpenChange} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    await act(async () => { await tick(); });
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('an interaction inside the surface does not close it', async () => {
    const onOpenChange = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={onOpenChange} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    await act(async () => { await tick(); });
    act(() => { surface().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('SelectedTextContextMenu / TextStylePopup / ColorPicker: one text palette authority (source-level)', () => {
  it('textStylePresets.ts re-exports ColorPicker.tsx own SIMPLE_PALETTE; TextStylePopup and the menu both import from it, none redeclares its own copy', () => {
    const menuSrc = fs.readFileSync('components/collabboard/editors/SelectedTextContextMenu.tsx', 'utf8');
    const popupSrc = fs.readFileSync('components/collabboard/editors/TextStylePopup.tsx', 'utf8');
    const pickerSrc = fs.readFileSync('components/collabboard/ColorPicker.tsx', 'utf8');
    const presetsSrc = fs.readFileSync('components/collabboard/editors/textStylePresets.ts', 'utf8');
    expect(menuSrc).toContain("from './textStylePresets'");
    expect(popupSrc).toContain('TEXT_COLOR_PRESETS');
    expect(popupSrc).toContain("from './textStylePresets'");
    expect(pickerSrc).toContain('export const SIMPLE_PALETTE');
    expect(presetsSrc).toContain("SIMPLE_PALETTE } from '../ColorPicker'");
    expect(presetsSrc).toContain('export const TEXT_COLOR_PRESETS');
    expect(popupSrc).not.toMatch(/const\s+(textColors|highlightColors|HIGHLIGHT_COLOR_PRESETS)\s*=/);
    // TextStylePopup wires its text-mode ColorPickerContent to the same constant explicitly.
    expect(popupSrc).toMatch(/presets=\{colorMode === 'text' \? TEXT_COLOR_PRESETS/);
  });
});

describe('R3A-1: Escape isolation -- the menu owns Escape, an ancestor keydown listener never fires for it', () => {
  it('a document-level Escape listener registered after open never receives the menu-consumed keydown', () => {
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    act(() => { surface().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    // PositionedContextMenu calls preventDefault() on its own Escape handling
    // (see components/ui/positioned-context-menu.tsx) -- DocumentEditor's own
    // listener checks e.defaultPrevented to distinguish "the menu handled
    // this" from "nothing did", so a real bubbled native event must report it.
    expect(outer).toHaveBeenCalledTimes(1);
    expect((outer.mock.calls[0][0] as KeyboardEvent).defaultPrevented).toBe(true);
    document.removeEventListener('keydown', outer);
  });
});
