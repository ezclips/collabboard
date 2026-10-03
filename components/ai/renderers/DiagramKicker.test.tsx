// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DiagramKicker, { DiagramKickerEditContext, DiagramKickerReadOnly } from './DiagramKicker';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof (window as any).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  (window as any).PointerEvent = PointerEventPolyfill;
}

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
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function keydown(el: Element, key: string) {
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}

describe('PATCH-264 DiagramKicker', () => {
  it('renders the fallback when the value is undefined', () => {
    const c = mount(<DiagramKicker value={undefined} fallback="mindmap" color="#777" />);
    const label = c.querySelector('[data-ai-kicker]') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('mindmap');
    expect(label.style.color).toBe('rgb(119, 119, 119)');
  });

  it('renders a custom value', () => {
    const c = mount(<DiagramKicker value="Project files" fallback="mindmap" color="#777" />);
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('Project files');
  });

  it('renders nothing for an explicit empty string', () => {
    const c = mount(<DiagramKicker value="" fallback="mindmap" color="#777" />);
    expect(c.querySelector('[data-ai-kicker]')).toBeNull();
    expect(c.textContent).toBe('');
  });

  it('with a provider: clicking the label opens the inline edit', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value={undefined} fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    click(c.querySelector('[data-ai-kicker]')!);
    expect(c.querySelector('[data-ai-kicker-input]')).not.toBeNull();
  });

  it('with a provider: Enter commits the trimmed text', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value={undefined} fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    click(c.querySelector('[data-ai-kicker]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    setInputValue(input, '  Q3 plan  ');
    keydown(input, 'Enter');
    expect(onChange).toHaveBeenCalledWith('Q3 plan');
    expect(c.querySelector('[data-ai-kicker-input]')).toBeNull();
  });

  it('with a provider: a 41+ char commit is truncated to 40', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value={undefined} fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    click(c.querySelector('[data-ai-kicker]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    setInputValue(input, 'K'.repeat(45));
    keydown(input, 'Enter');
    expect(onChange).toHaveBeenCalledWith('K'.repeat(40));
  });

  it('with a provider: Escape cancels without committing', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value={undefined} fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    click(c.querySelector('[data-ai-kicker]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    setInputValue(input, 'Changed');
    keydown(input, 'Escape');
    expect(onChange).not.toHaveBeenCalled();
    expect(c.querySelector('[data-ai-kicker-input]')).toBeNull();
  });

  it('with a provider: committing empty text removes the label', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value={undefined} fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    click(c.querySelector('[data-ai-kicker]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    setInputValue(input, '   ');
    keydown(input, 'Enter');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('with a provider: the x removes the label', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value="Q3" fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    click(c.querySelector('[data-ai-kicker-remove]')!);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('with a provider: the + Add label chip restores the default and opens the edit', () => {
    const onChange = vi.fn();
    const c = mount(
      <DiagramKickerEditContext.Provider value={{ onChange }}>
        <DiagramKicker value="" fallback="mindmap" color="#777" />
      </DiagramKickerEditContext.Provider>,
    );
    const add = c.querySelector('[data-ai-kicker-add]');
    expect(add).not.toBeNull();
    click(add!);
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(c.querySelector('[data-ai-kicker-input]')).not.toBeNull();
  });

  it('with a provider: pointerdown on the label does not reach a parent listener', () => {
    const onPointerDown = vi.fn();
    const container = mount(
      <DiagramKickerEditContext.Provider value={{ onChange: () => {} }}>
        <div onPointerDown={onPointerDown}>
          <DiagramKicker value="Q3" fallback="mindmap" color="#777" />
        </div>
      </DiagramKickerEditContext.Provider>,
    );
    act(() => {
      container.querySelector('[data-ai-kicker]')!.dispatchEvent(
        new (window as any).PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1 }),
      );
    });
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});

// The real bug (PATCH-264 live round 1): clicking "+ Add label" then committing
// left the label removed, because the draft started as the removed '' value.
function StatefulKicker({ onCommit }: { onCommit: (next: string | undefined) => void }) {
  const [value, setValue] = React.useState<string | undefined>('');
  const onChange = React.useCallback(
    (next: string | undefined) => {
      onCommit(next);
      setValue(next);
    },
    [onCommit],
  );
  return (
    <DiagramKickerEditContext.Provider value={{ onChange }}>
      <DiagramKicker value={value} fallback="mindmap" color="#777" />
    </DiagramKickerEditContext.Provider>
  );
}

describe('PATCH-264 DiagramKicker add-back round 1', () => {
  it('+ Add label then Enter restores the default (onChange(undefined), not a custom label)', () => {
    const onCommit = vi.fn();
    const c = mount(<StatefulKicker onCommit={onCommit} />);
    click(c.querySelector('[data-ai-kicker-add]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    expect(input.value).toBe('mindmap');
    keydown(input, 'Enter');
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('mindmap');
    expect(onCommit.mock.calls.at(-1)![0]).toBeUndefined();
  });

  it('+ Add label then blur restores the default too', () => {
    const onCommit = vi.fn();
    const c = mount(<StatefulKicker onCommit={onCommit} />);
    click(c.querySelector('[data-ai-kicker-add]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    expect(input.value).toBe('mindmap');
    act(() => {
      input.focus();
      input.blur();
    });
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('mindmap');
    expect(onCommit.mock.calls.at(-1)![0]).toBeUndefined();
  });

  it('+ Add label, type Q3, Enter stores the custom label', () => {
    const onCommit = vi.fn();
    const c = mount(<StatefulKicker onCommit={onCommit} />);
    click(c.querySelector('[data-ai-kicker-add]')!);
    const input = c.querySelector('[data-ai-kicker-input]') as HTMLInputElement;
    setInputValue(input, 'Q3');
    keydown(input, 'Enter');
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('Q3');
    expect(onCommit.mock.calls.at(-1)![0]).toBe('Q3');
  });
});

describe('PATCH-264 DiagramKicker inside a tile button', () => {
  it('a read-only wrapper inside a tile button renders no nested button on the FIRST render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // renderToStaticMarkup is the first render with no effects, so this catches
    // a read-only decision deferred to useEffect (which drew a nested <button>).
    const html = renderToStaticMarkup(
      <DiagramKickerEditContext.Provider value={{ onChange: () => {} }}>
        <button data-ai-outline-option="tile">
          <DiagramKickerReadOnly>
            <DiagramKicker value="Q3" fallback="mindmap" color="#777" />
          </DiagramKickerReadOnly>
        </button>
      </DiagramKickerEditContext.Provider>,
    );
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('data-ai-kicker-remove');
    expect(html).not.toContain('data-ai-kicker-add');
    expect(html).toContain('Q3');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
