// @vitest-environment jsdom
//
// PATCH 9B: "Crop Image to Fit Dot Grid" rendering consumer for Image posts
// nested in a Container/Map/Drawing layout (PostCardContent.tsx). The
// metadata.cropToGrid boolean already existed (toggle + checkmark UI) but
// had no rendering consumer anywhere -- this locks in the new one, using the
// same shared IMAGE_CROP_TO_GRID_HEIGHT_PX constant as the root-level
// Freeform card (FreeformPadletCards.tsx).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import PostCardContent from './PostCardContent';
import { IMAGE_CROP_TO_GRID_HEIGHT_PX } from './canvas/engine/utils';

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

function imagePadlet(metadata: Record<string, unknown> = {}) {
  return {
    id: 'img-1',
    title: 'Beach Photo',
    content: '',
    type: 'image',
    metadata: {
      imageUrl: 'https://example.com/x.png',
      ...metadata,
    },
  } as any;
}

describe('PostCardContent image rendering -- cropToGrid (PATCH 9B)', () => {
  it('cropToGrid: true switches to object-cover at the canonical grid-multiple height', () => {
    const c = mount(<PostCardContent padlet={imagePadlet({ cropToGrid: true })} />);
    const img = c.querySelector('img[alt="preview"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.className).toContain('object-cover');
    expect(img.className).not.toContain('object-contain');
    expect(img.style.height).toBe(`${IMAGE_CROP_TO_GRID_HEIGHT_PX}px`);
    expect(IMAGE_CROP_TO_GRID_HEIGHT_PX).toBe(216);
  });

  it('cropToGrid: false (default) preserves the exact prior object-contain rendering', () => {
    const c = mount(<PostCardContent padlet={imagePadlet()} />);
    const img = c.querySelector('img[alt="preview"]') as HTMLImageElement;
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
    expect(img.style.height).toBe('');
    expect(img.style.maxHeight).toBe('200px');
  });

  it('cropToGrid applies identically inside a Container (isInContainer branch)', () => {
    const c = mount(<PostCardContent padlet={imagePadlet({ cropToGrid: true, parentId: 'container-1' })} />);
    const img = c.querySelector('img[alt="preview"]') as HTMLImageElement;
    expect(img.className).toContain('object-cover');
    expect(img.style.height).toBe(`${IMAGE_CROP_TO_GRID_HEIGHT_PX}px`);
  });

  it('repeated toggle stays stable (idempotent): re-mounting with the same flag produces the same style twice', () => {
    const first = mount(<PostCardContent padlet={imagePadlet({ cropToGrid: true })} />);
    const firstImg = first.querySelector('img[alt="preview"]') as HTMLImageElement;
    const firstHeight = firstImg.style.height;

    const second = mount(<PostCardContent padlet={imagePadlet({ cropToGrid: true })} />);
    const secondImg = second.querySelector('img[alt="preview"]') as HTMLImageElement;

    expect(secondImg.style.height).toBe(firstHeight);
  });

  it('unrelated metadata (caption, comments) survives alongside cropToGrid -- caption renders via the drawing-container binding it already required', () => {
    const c = mount(
      <PostCardContent
        padlet={imagePadlet({
          cropToGrid: true,
          parentId: 'container-1',
          caption: 'A lovely beach',
          detachedComments: [{ id: 'dc1', text: 'nice', userId: 'u1', userName: 'A', timestamp: 1 }],
        })}
        canvasContext="drawing"
      />,
    );
    const img = c.querySelector('img[alt="preview"]') as HTMLImageElement;
    expect(img.className).toContain('object-cover');
    expect(c.textContent).toContain('A lovely beach');
  });
});
