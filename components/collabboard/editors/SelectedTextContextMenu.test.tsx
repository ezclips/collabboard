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
function noop() { return vi.fn(); }

describe('SelectedTextContextMenu: renders the one shared palette authority', () => {
  it('renders one swatch per TEXT_COLOR_PRESETS entry and one per HIGHLIGHT_COLOR_PRESETS entry', () => {
    mount(<SelectedTextContextMenu open x={10} y={10} onOpenChange={noop()} onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    for (const preset of TEXT_COLOR_PRESETS) expect(swatch(preset.label)).not.toBeNull();
    for (const color of HIGHLIGHT_COLOR_PRESETS) expect(swatch(color === 'transparent' ? 'Clear' : color)).not.toBeNull();
  });
});

describe('SelectedTextContextMenu: text color', () => {
  it('clicking a swatch invokes onTextColor with that color, and neither highlight callback', () => {
    const onTextColor = vi.fn();
    const onHighlight = vi.fn();
    const onClearHighlight = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={onTextColor} onHighlight={onHighlight} onClearHighlight={onClearHighlight} />);
    act(() => { swatch('Red')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onTextColor).toHaveBeenCalledWith('#dc2626');
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onClearHighlight).not.toHaveBeenCalled();
  });

  it('marks the current text color selected and no other swatch', () => {
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} currentTextColor="#16a34a" onTextColor={noop()} onHighlight={noop()} onClearHighlight={noop()} />);
    expect(swatch('Green')!.getAttribute('data-selected')).toBe('');
    expect(swatch('Red')!.hasAttribute('data-selected')).toBe(false);
  });
});

describe('SelectedTextContextMenu: highlight, including Clear', () => {
  it('clicking a real color swatch calls onHighlight, never onClearHighlight', () => {
    const onHighlight = vi.fn();
    const onClearHighlight = vi.fn();
    mount(<SelectedTextContextMenu open x={0} y={0} onOpenChange={noop()} onTextColor={noop()} onHighlight={onHighlight} onClearHighlight={onClearHighlight} />);
    act(() => { swatch('#fa5252')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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

describe('SelectedTextContextMenu / TextStylePopup: one palette authority (source-level)', () => {
  it('both import the presets from textStylePresets.ts; TextStylePopup no longer redeclares its own copy', () => {
    const menuSrc = fs.readFileSync('components/collabboard/editors/SelectedTextContextMenu.tsx', 'utf8');
    const popupSrc = fs.readFileSync('components/collabboard/editors/TextStylePopup.tsx', 'utf8');
    expect(menuSrc).toContain("from './textStylePresets'");
    expect(popupSrc).toContain("from './textStylePresets'");
    expect(popupSrc).not.toMatch(/const\s+textColors\s*=/);
    expect(popupSrc).not.toMatch(/const\s+highlightColors\s*=/);
    expect(popupSrc).not.toMatch(/const\s+HIGHLIGHT_COLOR_PRESETS\s*=/);
  });
});
