// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormatStage from './FormatStage';

let root: Root | null = null;
let host: HTMLElement;

function setMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

type Props = React.ComponentProps<typeof FormatStage>;

async function mount(props: Partial<Props> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FormatStage format="freeform" hovered={null} picked={false} {...props} />);
  });
  return host;
}

async function rerender(props: Partial<Props> = {}) {
  await act(async () => {
    root!.render(<FormatStage format="freeform" hovered={null} picked={false} {...props} />);
  });
}

const name = () => host.querySelector('[data-stage-name]')?.textContent;

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
});

describe('FormatStage', () => {
  it('does not start an interval under prefers-reduced-motion', async () => {
    setMatchMedia(true);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    await mount();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('cycles through the formats, then stops once a format is picked', async () => {
    vi.useFakeTimers();
    setMatchMedia(false);
    await mount();
    expect(name()).toBe('Freeform');

    await act(async () => {
      vi.advanceTimersByTime(2200);
    });
    expect(name()).toBe('Wall');

    await rerender({ picked: true });
    expect(name()).toBe('Freeform');

    await act(async () => {
      vi.advanceTimersByTime(6600);
    });
    expect(name()).toBe('Freeform');
  });

  it('shows the hovered format arrangement before a pick', async () => {
    setMatchMedia(false);
    await mount();
    await rerender({ hovered: 'map' });
    expect(name()).toBe('Map');
    expect(host.querySelector('[data-stage-layout]')?.getAttribute('data-stage-layout')).toBe('map');
  });

  it('reports the template name and the cycling subtitle', async () => {
    setMatchMedia(false);
    await mount({ picked: true, templateName: 'Project Plan' });
    expect(host.querySelector('[data-stage-subtitle]')?.textContent).toBe(
      'From template: Project Plan',
    );
  });

  it('shows "Same posts, every format" while cycling', async () => {
    vi.useFakeTimers();
    setMatchMedia(false);
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(2200);
    });
    expect(host.querySelector('[data-stage-subtitle]')?.textContent).toBe(
      'Same posts, every format',
    );
  });
});
