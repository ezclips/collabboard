// @vitest-environment jsdom
//
// PATCH-374 -- the facilitator menu: host-only, presets + custom minutes, and
// "Bring everyone here" (disabled on Map). Addendum 1 adds the stacking checks
// for the Freeform defect: the menu must out-rank the navigation/minimap
// control (z-40) AND be mounted outside CanvasViewport's `isolation: isolate`,
// which is what actually trapped its z-index.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacilitatorMenu from './FacilitatorMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: ReturnType<typeof render> | null = null;
const handlers = { onStart: vi.fn(), onSummon: vi.fn(), onClose: vi.fn() };

function renderMenu(overrides: Partial<React.ComponentProps<typeof FacilitatorMenu>> = {}) {
  mounted = render(
    <FacilitatorMenu
      open
      canControl
      isMapLayout={false}
      onStart={handlers.onStart}
      onSummon={handlers.onSummon}
      onClose={handlers.onClose}
      {...overrides}
    />,
  );
}

const menu = () => document.querySelector('[data-facilitator-menu="true"]') as HTMLElement | null;
const preset = (seconds: number) => document.querySelector(`[data-facilitate-timer-preset="${seconds}"]`) as HTMLElement | null;
const customInput = () => document.querySelector('[data-facilitate-timer-custom="true"]') as HTMLInputElement;
const customStart = () => document.querySelector('[data-facilitate-timer-start="true"]') as HTMLElement;
const summonButton = () => document.querySelector('[data-facilitate-summon="true"]') as HTMLButtonElement;

beforeEach(() => {
  Object.values(handlers).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  if (mounted) act(() => { mounted!.unmount(); });
  cleanup();
  mounted = null;
  vi.restoreAllMocks();
});

describe('A. who sees it', () => {
  it('renders nothing when closed', () => {
    renderMenu({ open: false });
    expect(menu()).toBeNull();
  });

  it('renders nothing for anyone who is not a host, even if mounted', () => {
    renderMenu({ canControl: false });
    expect(menu()).toBeNull();
  });
});

describe('B. the timer', () => {
  it('starts a preset and closes', () => {
    renderMenu();
    expect(preset(60)?.textContent).toBe('1:00');
    expect(preset(180)?.textContent).toBe('3:00');
    expect(preset(300)?.textContent).toBe('5:00');
    expect(preset(600)?.textContent).toBe('10:00');

    act(() => { fireEvent.click(preset(300)!); });
    expect(handlers.onStart).toHaveBeenCalledWith(300);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('starts custom minutes as seconds', () => {
    renderMenu();
    act(() => { fireEvent.change(customInput(), { target: { value: '7' } }); });
    act(() => { fireEvent.click(customStart()); });
    expect(handlers.onStart).toHaveBeenCalledWith(420);
  });

  it('refuses a custom value the SQL would refuse, and starts nothing', () => {
    renderMenu();
    act(() => { fireEvent.change(customInput(), { target: { value: '200' } }); });
    act(() => { fireEvent.click(customStart()); });

    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(document.querySelector('[data-facilitate-timer-error="true"]')?.textContent)
      .toBe('Choose between 10 seconds and 2 hours');
  });

  it('refuses an empty or non-positive custom value', () => {
    renderMenu();
    act(() => { fireEvent.click(customStart()); });
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(document.querySelector('[data-facilitate-timer-error="true"]')?.textContent)
      .toBe('Enter a number of minutes');
  });
});

describe('C. bring everyone here', () => {
  it('summons and closes', () => {
    renderMenu();
    const button = summonButton();
    expect(button.disabled).toBe(false);

    act(() => { fireEvent.click(button); });
    expect(handlers.onSummon).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('is disabled with an explanation on a Map board', () => {
    renderMenu({ isMapLayout: true });
    const button = summonButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Not available on Map boards');

    act(() => { fireEvent.click(button); });
    expect(handlers.onSummon).not.toHaveBeenCalled();
  });
});

describe('D. closing', () => {
  it('closes from the close button', () => {
    renderMenu();
    act(() => { fireEvent.click(document.querySelector('[data-facilitate-close="true"]') as HTMLElement); });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

// == E. stacking (Addendum 1) ======================================

describe('E. it out-ranks the Freeform navigation control', () => {
  it('carries a z-index above the minimap control\'s z-40', () => {
    renderMenu();
    const className = menu()!.className;
    const match = className.match(/z-\[(\d+)\]/);
    expect(match, 'the panel must state an explicit z-index').not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(40);
  });

  it('is anchored away from the bottom-left corner the minimap control owns', () => {
    // `[data-freeform-navigation-control]` is `absolute bottom-4 left-[72px]`.
    renderMenu();
    const className = menu()!.className;
    expect(className).not.toContain('bottom-');
    expect(className).toContain('top-16');
    expect(className).toContain('left-16');
  });

  // jsdom has no layout or paint, so it cannot prove the REAL cause. That was a
  // stacking context, not a number: CanvasViewport sets `isolation: 'isolate'`,
  // which trapped the panel's z-index inside it so a z-40 sibling could paint
  // over it whatever it asked for. The fix is the DOM relocation, so assert it.
  it('is mounted as a SIBLING of CanvasViewport, not a descendant', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app', 'dashboard', 'canvas', '[id]', 'CanvasClient.tsx'),
      'utf8',
    );
    const viewportClose = source.indexOf('</CanvasViewport>');
    const menuMount = source.indexOf('<FacilitatorMenu');
    expect(viewportClose, 'CanvasViewport must close somewhere').toBeGreaterThan(-1);
    expect(menuMount, 'FacilitatorMenu must be mounted').toBeGreaterThan(-1);
    expect(menuMount).toBeGreaterThan(viewportClose);
  });
});
