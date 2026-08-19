// @vitest-environment jsdom
// PATCH ALIGN-A: mounts the REAL, exported FreeformAlignmentGuides with
// controlled/test guide state -- proving the render contract (world-unit
// positioning, pointer-events: none, hidden when empty) since ALIGN-B has
// not wired real alignment detection yet.
import React, { act } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import FreeformAlignmentGuides from '@/components/collabboard/canvas/ui/FreeformAlignmentGuides';
import {
  FREEFORM_SIGNED_WORLD_WIDTH,
  FREEFORM_SIGNED_WORLD_HEIGHT,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(guides: { verticalX: number | null; horizontalY: number | null }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<FreeformAlignmentGuides guides={guides} />);
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
});
