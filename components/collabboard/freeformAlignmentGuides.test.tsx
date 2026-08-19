// @vitest-environment jsdom
// PATCH ALIGN-A: mounts the REAL, exported FreeformAlignmentGuides with
// controlled/test guide state -- proving the render contract (world-unit
// positioning, pointer-events: none, hidden when empty) since ALIGN-B has
// not wired real alignment detection yet.
import React, { act } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import FreeformAlignmentGuides from '@/components/collabboard/canvas/ui/FreeformAlignmentGuides';
import type { FreeformAlignmentGuideKindState } from '@/types/collabboard';
import {
  FREEFORM_SIGNED_WORLD_WIDTH,
  FREEFORM_SIGNED_WORLD_HEIGHT,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(
  guides: { verticalX: number | null; horizontalY: number | null },
  kinds?: FreeformAlignmentGuideKindState,
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<FreeformAlignmentGuides guides={guides} kinds={kinds} />);
  });
  return { host, root: root! };
}

async function unmount(host: HTMLElement, root: Root) {
  await act(async () => { root.unmount(); });
  document.body.removeChild(host);
}

describe('PATCH ALIGN-A FreeformAlignmentGuides', () => {
  it('renders nothing when both axes are null (the state every real drag is in today)', async () => {
    const { host, root } = await mount({ verticalX: null, horizontalY: null });
    expect(host.querySelector('[data-freeform-alignment-guide]')).toBeNull();
    await unmount(host, root);
  });

  it('renders only the vertical guide, positioned at the exact WORLD x, spanning the full signed world height', async () => {
    const { host, root } = await mount({ verticalX: 342, horizontalY: null });
    const vertical = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="vertical"]');
    expect(vertical).not.toBeNull();
    expect(vertical!.style.left).toBe('342px');
    expect(vertical!.style.top).toBe(`${FREEFORM_WORLD_MIN_Y}px`);
    expect(vertical!.style.height).toBe(`${FREEFORM_SIGNED_WORLD_HEIGHT}px`);
    expect(vertical!.style.pointerEvents).toBe('none');
    expect(host.querySelector('[data-freeform-alignment-guide="horizontal"]')).toBeNull();
    await unmount(host, root);
  });

  it('renders only the horizontal guide, positioned at the exact WORLD y, spanning the full signed world width', async () => {
    const { host, root } = await mount({ verticalX: null, horizontalY: -128 });
    const horizontal = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="horizontal"]');
    expect(horizontal).not.toBeNull();
    expect(horizontal!.style.top).toBe('-128px');
    expect(horizontal!.style.left).toBe(`${FREEFORM_WORLD_MIN_X}px`);
    expect(horizontal!.style.width).toBe(`${FREEFORM_SIGNED_WORLD_WIDTH}px`);
    expect(horizontal!.style.pointerEvents).toBe('none');
    expect(host.querySelector('[data-freeform-alignment-guide="vertical"]')).toBeNull();
    await unmount(host, root);
  });

  it('renders both guides simultaneously when both axes are set', async () => {
    const { host, root } = await mount({ verticalX: 10, horizontalY: 20 });
    expect(host.querySelector('[data-freeform-alignment-guide="vertical"]')).not.toBeNull();
    expect(host.querySelector('[data-freeform-alignment-guide="horizontal"]')).not.toBeNull();
    await unmount(host, root);
  });

  it('a negative world coordinate (left/above logical origin) is honoured as-is, not clamped', async () => {
    const { host, root } = await mount({ verticalX: -4321, horizontalY: null });
    const vertical = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="vertical"]');
    expect(vertical!.style.left).toBe('-4321px');
    await unmount(host, root);
  });

  it('omitting `kinds` entirely renders the ordinary line with no marker -- every pre-ALIGN-E2 caller keeps working unchanged', async () => {
    const { host, root } = await mount({ verticalX: 342, horizontalY: 20 });
    expect(host.querySelector('[data-freeform-alignment-guide="vertical-adjacency-marker"]')).toBeNull();
    expect(host.querySelector('[data-freeform-alignment-guide="horizontal-adjacency-marker"]')).toBeNull();
    await unmount(host, root);
  });
});

describe('PATCH ALIGN-E2 FreeformAlignmentGuides: adjacency marker', () => {
  const NO_ADJACENCY: FreeformAlignmentGuideKindState = {
    verticalIsAdjacency: false, horizontalIsAdjacency: false,
    verticalMarkerY: null, horizontalMarkerX: null,
  };

  it('an ordinary (non-adjacency) vertical guide renders no marker, and the line itself is byte-identical to before', async () => {
    const { host, root } = await mount(
      { verticalX: 342, horizontalY: null },
      { ...NO_ADJACENCY },
    );
    const vertical = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="vertical"]');
    expect(vertical!.style.width).toBe('1px');
    expect(vertical!.style.height).toBe(`${FREEFORM_SIGNED_WORLD_HEIGHT}px`);
    expect(host.querySelector('[data-freeform-alignment-guide="vertical-adjacency-marker"]')).toBeNull();
    await unmount(host, root);
  });

  it('an adjacency vertical guide renders a perpendicular marker centered on (verticalX, verticalMarkerY), and the line itself is still unchanged', async () => {
    const { host, root } = await mount(
      { verticalX: 342, horizontalY: null },
      { ...NO_ADJACENCY, verticalIsAdjacency: true, verticalMarkerY: 88 },
    );
    const vertical = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="vertical"]');
    expect(vertical!.style.width).toBe('1px');
    expect(vertical!.style.left).toBe('342px');

    const marker = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="vertical-adjacency-marker"]');
    expect(marker).not.toBeNull();
    // A perpendicular (horizontal) bar: wider than it is tall, centered on
    // the guide's X and the marker's own Y.
    const markerWidth = parseFloat(marker!.style.width);
    const markerHeight = parseFloat(marker!.style.height);
    expect(markerWidth).toBeGreaterThan(markerHeight);
    expect(parseFloat(marker!.style.left) + markerWidth / 2).toBeCloseTo(342, 5);
    expect(parseFloat(marker!.style.top) + markerHeight / 2).toBeCloseTo(88, 5);
    expect(marker!.style.pointerEvents).toBe('none');
    expect(marker!.className).toContain('bg-blue-500');
    await unmount(host, root);
  });

  it('an adjacency horizontal guide renders a perpendicular marker centered on (horizontalMarkerX, horizontalY)', async () => {
    const { host, root } = await mount(
      { verticalX: null, horizontalY: -55 },
      { ...NO_ADJACENCY, horizontalIsAdjacency: true, horizontalMarkerX: 210 },
    );
    const horizontal = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="horizontal"]');
    expect(horizontal!.style.height).toBe('1px');
    expect(horizontal!.style.top).toBe('-55px');

    const marker = host.querySelector<HTMLElement>('[data-freeform-alignment-guide="horizontal-adjacency-marker"]');
    expect(marker).not.toBeNull();
    // A perpendicular (vertical) bar: taller than it is wide.
    const markerWidth = parseFloat(marker!.style.width);
    const markerHeight = parseFloat(marker!.style.height);
    expect(markerHeight).toBeGreaterThan(markerWidth);
    expect(parseFloat(marker!.style.left) + markerWidth / 2).toBeCloseTo(210, 5);
    expect(parseFloat(marker!.style.top) + markerHeight / 2).toBeCloseTo(-55, 5);
    expect(marker!.style.pointerEvents).toBe('none');
    await unmount(host, root);
  });

  it('both axes can show adjacency markers simultaneously, independently positioned', async () => {
    const { host, root } = await mount(
      { verticalX: 100, horizontalY: 200 },
      { verticalIsAdjacency: true, horizontalIsAdjacency: true, verticalMarkerY: 250, horizontalMarkerX: 50 },
    );
    expect(host.querySelector('[data-freeform-alignment-guide="vertical-adjacency-marker"]')).not.toBeNull();
    expect(host.querySelector('[data-freeform-alignment-guide="horizontal-adjacency-marker"]')).not.toBeNull();
    await unmount(host, root);
  });

  it('isAdjacency: true with a null marker position renders no marker (defensive -- should not happen from the hook, but the component must not crash)', async () => {
    const { host, root } = await mount(
      { verticalX: 100, horizontalY: null },
      { ...NO_ADJACENCY, verticalIsAdjacency: true, verticalMarkerY: null },
    );
    expect(host.querySelector('[data-freeform-alignment-guide="vertical-adjacency-marker"]')).toBeNull();
    await unmount(host, root);
  });

  it('a marker never renders for an axis whose guide itself is null, even if isAdjacency were somehow true', async () => {
    const { host, root } = await mount(
      { verticalX: null, horizontalY: null },
      { ...NO_ADJACENCY, verticalIsAdjacency: true, verticalMarkerY: 50 },
    );
    expect(host.querySelector('[data-freeform-alignment-guide]')).toBeNull();
    await unmount(host, root);
  });
});
