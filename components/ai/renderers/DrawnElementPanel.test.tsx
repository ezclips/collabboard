// @vitest-environment jsdom
//
// PATCH-285. The drawn element panel: one panel per object, the picture's own
// colours as stable swatches, text that applies on blur, clamped size, and a
// Reset picture that asks inside the panel before restoring.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DrawnPicture } from '@/lib/ai/drawn/format';
import type { VisualOutline } from '@/lib/ai/outline';

import { DrawnElementPanel } from './DrawnElementPanel';

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
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function blur(el: Element) {
  act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'steps',
  items: [{ label: 'A' }],
};

function basePicture(): DrawnPicture {
  return {
    version: 1,
    width: 800,
    height: 600,
    background: '#ffffff',
    elements: [
      { id: 'card', type: 'rect', x: 10, y: 10, w: 200, h: 80, fill: '#dceef5', stroke: '#2c7da0' },
      { id: 'label', type: 'text', text: 'Hello', x: 20, y: 30, w: 180, size: 16, color: '#111111', in: 'card' },
      { id: 'free', type: 'text', text: 'Free', x: 400, y: 30, w: 120, size: 16, color: '#111111' },
    ],
  };
}

/** A controlled host so a commit round-trips like the renderer does. */
function Harness({
  selectedId,
  onChange,
  picture: initial = basePicture(),
  base = basePicture(),
}: {
  selectedId: string | null;
  onChange: (next: DrawnPicture) => void;
  picture?: DrawnPicture;
  base?: DrawnPicture;
}) {
  const [picture, setPicture] = React.useState(initial);
  return (
    <DrawnElementPanel
      picture={picture}
      basePicture={base}
      outline={OUTLINE}
      kind="flowchart"
      selectedId={selectedId}
      onChange={(next) => {
        onChange(next);
        setPicture(next);
      }}
      onSelect={() => {}}
      onClose={() => {}}
    />
  );
}

describe('PATCH-285 DrawnElementPanel', () => {
  it('shows Background with the current colour ringed for the picture', () => {
    const c = mount(<Harness selectedId={null} onChange={() => {}} />);
    expect(c.querySelector('[data-drawn-section="background"]')).not.toBeNull();
    const swatch = c.querySelector('[data-drawn-swatch="background"][data-drawn-swatch-value="#ffffff"]') as HTMLElement;
    expect(swatch).not.toBeNull();
    expect(swatch.style.outline).toContain('2px');
  });

  it('picking a fill swatch calls onChange once and never reorders the row', () => {
    const onChange = vi.fn();
    const c = mount(<Harness selectedId="card" onChange={onChange} />);
    const before = Array.from(c.querySelectorAll('[data-drawn-swatch="fill"]')).map((el) =>
      el.getAttribute('data-drawn-swatch-value'),
    );
    const teal = c.querySelector('[data-drawn-swatch="fill"][data-drawn-swatch-value="#2c7da0"]') as Element;
    // Pick a swatch that exists in the palette (the border colour is in the palette).
    const target = c.querySelector('[data-drawn-swatch="fill"][data-drawn-swatch-value="#dceef5"]') as Element;
    click(target);
    expect(onChange).toHaveBeenCalledTimes(1);
    const after = Array.from(c.querySelectorAll('[data-drawn-swatch="fill"]')).map((el) =>
      el.getAttribute('data-drawn-swatch-value'),
    );
    expect(after).toEqual(before);
    expect(teal).not.toBeNull();
  });

  it('applies a text edit on blur', () => {
    const onChange = vi.fn();
    const c = mount(<Harness selectedId="free" onChange={onChange} />);
    const area = c.querySelector('[data-drawn-text-input="true"]') as HTMLTextAreaElement;
    setTextareaValue(area, 'Changed');
    expect(onChange).not.toHaveBeenCalled();
    blur(area);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].elements.find((el: { id: string }) => el.id === 'free').text).toBe('Changed');
  });

  it('clamps the size stepper at 9 and 72', () => {
    const onChange = vi.fn();
    const c = mount(<Harness selectedId="free" onChange={onChange} />);
    const dec = c.querySelector('[data-drawn-font-size-dec="true"]') as Element;
    const inc = c.querySelector('[data-drawn-font-size-inc="true"]') as Element;
    for (let i = 0; i < 10; i += 1) click(dec);
    const low = onChange.mock.calls.at(-1)![0].elements.find((el: { id: string }) => el.id === 'free').size;
    expect(low).toBe(9);
    for (let i = 0; i < 40; i += 1) click(inc);
    const high = onChange.mock.calls.at(-1)![0].elements.find((el: { id: string }) => el.id === 'free').size;
    expect(high).toBe(72);
  });

  it('freezes the swatch row for the open selection and recomputes only on selection change', () => {
    const onChange = vi.fn();
    const c = mount(<Harness selectedId="card" onChange={onChange} />);
    const values = () =>
      Array.from(c.querySelectorAll('[data-drawn-swatch="fill"]')).map((el) => el.getAttribute('data-drawn-swatch-value'));
    const before = values();

    // Pick the last swatch of the row.
    const swatches = Array.from(c.querySelectorAll('[data-drawn-swatch="fill"]')) as Element[];
    click(swatches[swatches.length - 1]);
    expect(values()).toEqual(before);

    // Pick a hex that is not in the row.
    setInputValue(c.querySelector('[data-drawn-hex="fill"]') as HTMLInputElement, '#123456');
    expect(values()).toEqual(before);

    // Pick via the native input.
    setInputValue(c.querySelector('[data-drawn-colour-input="fill"]') as HTMLInputElement, '#654321');
    expect(values()).toEqual(before);

    // Selecting another element recomputes once, now carrying the picked colour.
    act(() => { mounted[0].root.render(<Harness selectedId="free" onChange={onChange} />); });
    const recomputed = Array.from(c.querySelectorAll('[data-drawn-swatch="text"]')).map((el) =>
      el.getAttribute('data-drawn-swatch-value'),
    );
    expect(recomputed).not.toEqual(before);
    expect(recomputed).toContain('#654321');
  });

  it('Reset picture asks inside the panel, then restores the original', () => {
    const edited = basePicture();
    (edited.elements[0] as { fill: string }).fill = '#ff0000';
    const onChange = vi.fn();
    const c = mount(<Harness selectedId="card" onChange={onChange} picture={edited} />);
    click(c.querySelector('[data-drawn-reset-picture="true"]') as Element);
    expect(c.querySelector('[data-drawn-reset-confirm="true"]')).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    click(c.querySelector('[data-drawn-reset-confirm-yes="true"]') as Element);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0].elements[0] as { fill: string }).fill).toBe('#dceef5');
  });
});
