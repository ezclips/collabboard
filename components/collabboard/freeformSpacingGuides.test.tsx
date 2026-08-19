// @vitest-environment jsdom
// PATCH SPACE-P1: mounts the REAL, exported FreeformSpacingGuides with
// controlled/test guide state -- proving the render contract (world-unit
// positioning, pointer-events: none, hidden when empty) and the zoom-tier
// display rules from the patch spec (hidden below 50%, bracket-only 50-69%,
// bracket+number at 70%+). Detection itself (which neighbour qualifies,
// what the resolved gap numbers are) is proven separately in
// freeformStageGeometry.test.ts and freeformAlignmentGuideDetection.test.tsx
// -- this file only proves what the component DRAWS given an already-
// resolved guides state, mirroring freeformAlignmentGuides.test.tsx's own
// scope for the sibling FreeformAlignmentGuides component.
import React, { act } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import FreeformSpacingGuides from '@/components/collabboard/canvas/ui/FreeformSpacingGuides';
import type { FreeformSpacingGuideState } from '@/types/collabboard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NO_GAPS: FreeformSpacingGuideState = { horizontalGap: null, verticalGap: null };

async function mount(guides: FreeformSpacingGuideState, canvasZoom: number) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<FreeformSpacingGuides guides={guides} canvasZoom={canvasZoom} />);
  });
  return { host, root: root! };
}

async function unmount(host: HTMLElement, root: Root) {
  await act(async () => { root.unmount(); });
  document.body.removeChild(host);
}

const HORIZONTAL_GAP = { gapStart: 100, gapEnd: 150, crossCenter: 50, distance: 50 };
const VERTICAL_GAP = { gapStart: 200, gapEnd: 260, crossCenter: 30, distance: 60 };

describe('PATCH SPACE-P1 FreeformSpacingGuides: base render contract', () => {
  it('renders nothing when both axes are null', async () => {
    const { host, root } = await mount(NO_GAPS, 0.8);
    expect(host.querySelector('[data-freeform-spacing-guide]')).toBeNull();
    await unmount(host, root);
  });

  it('the horizontal bracket line spans exactly gapStart..gapEnd at crossCenter, pointer-events none', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: null }, 0.8);
    const line = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-line"]');
    expect(line).not.toBeNull();
    expect(line!.style.left).toBe('100px');
    expect(line!.style.width).toBe('50px'); // gapEnd(150) - gapStart(100)
    expect(line!.style.pointerEvents).toBe('none');
    expect(parseFloat(line!.style.top) + parseFloat(line!.style.height) / 2).toBeCloseTo(50, 5); // crossCenter
    await unmount(host, root);
  });

  it('the horizontal bracket has end ticks at both facing edges, perpendicular to the line', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: null }, 0.8);
    const startTick = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-tick-start"]');
    const endTick = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-tick-end"]');
    expect(startTick).not.toBeNull();
    expect(endTick).not.toBeNull();
    // Perpendicular to a horizontal line means taller than wide.
    expect(parseFloat(startTick!.style.height)).toBeGreaterThan(parseFloat(startTick!.style.width));
    expect(parseFloat(startTick!.style.left) + parseFloat(startTick!.style.width) / 2).toBeCloseTo(100, 5); // gapStart
    expect(parseFloat(endTick!.style.left) + parseFloat(endTick!.style.width) / 2).toBeCloseTo(150, 5); // gapEnd
    await unmount(host, root);
  });

  it('the vertical bracket line spans exactly gapStart..gapEnd at crossCenter, on the perpendicular (X) axis', async () => {
    const { host, root } = await mount({ horizontalGap: null, verticalGap: VERTICAL_GAP }, 0.8);
    const line = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="vertical-line"]');
    expect(line).not.toBeNull();
    expect(line!.style.top).toBe('200px');
    expect(line!.style.height).toBe('60px'); // gapEnd(260) - gapStart(200)
    expect(parseFloat(line!.style.left) + parseFloat(line!.style.width) / 2).toBeCloseTo(30, 5); // crossCenter
    await unmount(host, root);
  });

  it('the vertical bracket has end ticks at both facing edges, perpendicular to the line', async () => {
    const { host, root } = await mount({ horizontalGap: null, verticalGap: VERTICAL_GAP }, 0.8);
    const startTick = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="vertical-tick-start"]');
    const endTick = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="vertical-tick-end"]');
    expect(startTick).not.toBeNull();
    expect(endTick).not.toBeNull();
    // Perpendicular to a vertical line means wider than tall.
    expect(parseFloat(startTick!.style.width)).toBeGreaterThan(parseFloat(startTick!.style.height));
    expect(parseFloat(startTick!.style.top) + parseFloat(startTick!.style.height) / 2).toBeCloseTo(200, 5); // gapStart
    expect(parseFloat(endTick!.style.top) + parseFloat(endTick!.style.height) / 2).toBeCloseTo(260, 5); // gapEnd
    await unmount(host, root);
  });

  it('both brackets can render simultaneously, at most one per axis (never more than one horizontal + one vertical)', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: VERTICAL_GAP }, 0.8);
    expect(host.querySelectorAll('[data-freeform-spacing-guide="horizontal-line"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-freeform-spacing-guide="vertical-line"]')).toHaveLength(1);
    await unmount(host, root);
  });
});

describe('PATCH SPACE-P1 FreeformSpacingGuides: adaptive zoom display', () => {
  it('zoom < 0.50: no spacing measurement at all, even with a qualifying gap', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: VERTICAL_GAP }, 0.49);
    expect(host.querySelector('[data-freeform-spacing-guide]')).toBeNull();
    await unmount(host, root);
  });

  it('0.50 <= zoom < 0.70: bracket/ticks render, but NO distance number', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: null }, 0.5);
    expect(host.querySelector('[data-freeform-spacing-guide="horizontal-line"]')).not.toBeNull();
    expect(host.querySelector('[data-freeform-spacing-guide="horizontal-tick-start"]')).not.toBeNull();
    expect(host.querySelector('[data-freeform-spacing-guide="horizontal-label"]')).toBeNull();
    await unmount(host, root);
  });

  it('0.50 <= zoom < 0.70 (upper edge, 0.69): still bracket-only, no number', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: null }, 0.69);
    expect(host.querySelector('[data-freeform-spacing-guide="horizontal-line"]')).not.toBeNull();
    expect(host.querySelector('[data-freeform-spacing-guide="horizontal-label"]')).toBeNull();
    await unmount(host, root);
  });

  it('zoom >= 0.70: bracket/ticks AND the rounded world-unit distance number', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: null }, 0.7);
    expect(host.querySelector('[data-freeform-spacing-guide="horizontal-line"]')).not.toBeNull();
    const label = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-label"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('50');
    await unmount(host, root);
  });

  it('the default 80% zoom shows the number (the patch spec\'s own worked example)', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: VERTICAL_GAP }, 0.8);
    expect(host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-label"]')!.textContent).toBe('50');
    expect(host.querySelector<HTMLElement>('[data-freeform-spacing-guide="vertical-label"]')!.textContent).toBe('60');
    await unmount(host, root);
  });

  it('the distance label is rounded for display', async () => {
    const { host, root } = await mount(
      { horizontalGap: { gapStart: 0, gapEnd: 47.6, crossCenter: 0, distance: 47.6 }, verticalGap: null },
      0.8,
    );
    expect(host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-label"]')!.textContent).toBe('48');
    await unmount(host, root);
  });

  it('the label is pointer-events none, same as the bracket itself', async () => {
    const { host, root } = await mount({ horizontalGap: HORIZONTAL_GAP, verticalGap: null }, 0.8);
    const label = host.querySelector<HTMLElement>('[data-freeform-spacing-guide="horizontal-label"]');
    expect(label!.style.pointerEvents).toBe('none');
    await unmount(host, root);
  });
});
