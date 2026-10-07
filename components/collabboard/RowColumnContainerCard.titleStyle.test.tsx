// @vitest-environment jsdom
//
// PATCH-318. A container's header shows the style set in its Text style panel
// (metadata.titleStyle), resolved by the same helper the editor uses.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RowColumnContainerCard from './RowColumnContainerCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

const containerPadlet = (metadata: Record<string, unknown> = {}) => ({
  id: 'container-1',
  title: 'My Container',
  content: '',
  type: 'container',
  metadata,
});

const header = (el: HTMLElement) => el.querySelector('h3') as HTMLElement | null;

describe('PATCH-318: the container header shows metadata.titleStyle', () => {
  it('applies the saved title style inline', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={containerPadlet({
          titleStyle: { color: '#fa5252', fontStyle: 'italic', fontWeight: '700', underline: true, textAlign: 'left' },
        }) as any}
        allPadlets={[] as any}
      />,
    );

    const h3 = header(el)!;
    expect(h3).not.toBeNull();
    expect(h3.style.color).toBe('rgb(250, 82, 82)');
    expect(h3.style.fontStyle).toBe('italic');
    expect(h3.style.fontWeight).toBe('700');
    expect(h3.style.textDecoration).toBe('underline');
    expect(h3.style.textAlign).toBe('left');
  });

  it('looks as before when no titleStyle is set', () => {
    const el = mount(<RowColumnContainerCard padlet={containerPadlet() as any} allPadlets={[] as any} />);

    const h3 = header(el)!;
    expect(h3).not.toBeNull();
    // textColor for a white container is the shared badge helper's dark text.
    expect(h3.style.color).toBe('rgb(15, 23, 42)');
    expect(h3.style.fontStyle).toBe('');
    expect(h3.style.textDecoration).toBe('');
  });
});
