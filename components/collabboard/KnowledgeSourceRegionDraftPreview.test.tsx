// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import KnowledgeSourceRegionDraftPreview from './KnowledgeSourceRegionDraftPreview';
import { sourceRegionToDisplayRegion, type NormalizedPageRegion } from '@/lib/domain/knowledge/knowledgePageRegionGeometry';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const REGION: NormalizedPageRegion = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

const componentSource = fs.readFileSync(
  path.join(process.cwd(), 'components/collabboard/KnowledgeSourceRegionDraftPreview.tsx'), 'utf8');

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(props: Partial<React.ComponentProps<typeof KnowledgeSourceRegionDraftPreview>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeSourceRegionDraftPreview
        boardId={BOARD_ID}
        sourceDocumentId={DOCUMENT_ID}
        pageNumber={3}
        region={REGION}
        appliedRotation={0}
        {...props}
      />,
    );
  });
  return host!;
}

/** jsdom never actually loads an <img>: natural size is stubbed by hand, then 'load' is fired. */
function loadImage(container: HTMLElement, naturalWidth: number, naturalHeight: number) {
  const img = container.querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true });
  act(() => { img.dispatchEvent(new Event('load')); });
  return img as HTMLImageElement;
}

const wrapper = (c: HTMLElement) => c.querySelector('[data-knowledge-source-region-draft-preview]') as HTMLElement;
/** jsdom normalises `aspectRatio` to a "W / H" CSS <ratio> string. */
function aspectOf(c: HTMLElement): number {
  const [w, h] = wrapper(c).style.aspectRatio.split('/').map(Number); return w / h;
}

describe('Area Phase 1 -- KnowledgeSourceRegionDraftPreview', () => {
  it('uses the EXISTING authenticated page-image route, no query string, no signed URL', () => {
    const img = mount().querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`/api/boards/${BOARD_ID}/knowledge/${DOCUMENT_ID}/pages/3/image`);
    expect(img.getAttribute('src')).not.toContain('?');
  });

  it('is a plain decorative <img>, never draggable, never a second Knowledge drag source', () => {
    const img = mount().querySelector('img')!;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.draggable).toBe(false);
  });

  it('before the raster loads, reserves a neutral box -- never a guessed aspect ratio', () => {
    const container = mount();
    expect(wrapper(container).style.aspectRatio).toBe('');
    expect(container.querySelector('[data-knowledge-source-region-draft-preview-loading]')).not.toBeNull();
  });

  it('1: portrait raster -- wrapper aspect uses RASTER pixels, not the bare normalised fraction', () => {
    const container = mount({ region: { x: 0, y: 0, width: 0.5, height: 0.5 } });
    loadImage(container, 1000, 1415);
    const aspect = aspectOf(container);
    expect(aspect).toBeCloseTo((0.5 * 1000) / (0.5 * 1415), 4);
    expect(aspect).not.toBeCloseTo(1, 2);
  });

  it('2: a non-square selected region resolves to the exact crop ratio', () => {
    const container = mount({ region: { x: 0.1, y: 0.1, width: 0.25, height: 0.5 } });
    loadImage(container, 1200, 800);
    expect(aspectOf(container)).toBeCloseTo(0.75, 6);
  });

  it('3: rotation 90 uses the TRANSFORMED display region together with the raster', () => {
    const container = mount({ region: REGION, appliedRotation: 90 });
    loadImage(container, 1200, 800);
    const display = sourceRegionToDisplayRegion(REGION, 90)!;
    const expected = (display.width * 1200) / (display.height * 800);
    expect(aspectOf(container)).toBeCloseTo(expected, 6);
  });

  it('4/5: rotation 180 and 270 remain correctly proportioned', () => {
    for (const rotation of [180, 270] as const) {
      const container = mount({ region: REGION, appliedRotation: rotation });
      loadImage(container, 1000, 1415);
      const display = sourceRegionToDisplayRegion(REGION, rotation)!;
      expect(aspectOf(container)).toBeCloseTo((display.width * 1000) / (display.height * 1415), 6);
      act(() => root!.unmount()); host!.remove();
    }
  });

  it('6: a zero or invalid natural size never produces NaN, Infinity, or a negative ratio', () => {
    const container = mount();
    loadImage(container, 0, 0);
    expect(wrapper(container).getAttribute('data-knowledge-source-region-draft-preview-unavailable')).toBe('true');
    expect(container.querySelector('img')).toBeNull();
  });

  it('scales the image so the armed rectangle exactly fills the wrapper (rotation 0)', () => {
    const img = loadImage(mount(), 1000, 1415);
    expect(img.style.width).toBe(`${(1 / REGION.width) * 100}%`);
    expect(img.style.height).toBe(`${(1 / REGION.height) * 100}%`);
    expect(img.style.transform).toBe(`translate(${-REGION.x * 100}%, ${-REGION.y * 100}%)`);
  });

  it('applies sourceRegionToDisplayRegion, not the raw stored rectangle, for a rotated page', () => {
    const img = loadImage(mount({ appliedRotation: 90 }), 1000, 1415);
    const expectedX = 1 - REGION.y - REGION.height;
    const expectedY = REGION.x;
    const expectedWidth = REGION.height;
    const expectedHeight = REGION.width;
    expect(img.style.width).toBe(`${(1 / expectedWidth) * 100}%`);
    expect(img.style.height).toBe(`${(1 / expectedHeight) * 100}%`);
    expect(img.style.transform).toBe(`translate(${-expectedX * 100}%, ${-expectedY * 100}%)`);
  });

  it('7: an image load failure remains soft and never blocks the wrapper from rendering', () => {
    const container = mount();
    act(() => { container.querySelector('img')!.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-knowledge-source-region-draft-preview-unavailable]')).not.toBeNull();
    expect(container.textContent).toContain('unavailable');
    expect(container.querySelector('[data-knowledge-source-region-draft-preview]')).not.toBeNull();
  });

  it('a document/page change resets stale raster dimensions rather than reusing them', () => {
    const container = mount();
    loadImage(container, 1000, 1415);
    const first = wrapper(container).style.aspectRatio;
    act(() => {
      root!.render(
        <KnowledgeSourceRegionDraftPreview
          boardId={BOARD_ID} sourceDocumentId={DOCUMENT_ID} pageNumber={4} region={REGION} appliedRotation={0}
        />,
      );
    });
    // The new page's image hasn't loaded yet: the prior page's aspect must not carry over.
    expect(wrapper(container).style.aspectRatio).toBe('');
    loadImage(container, 1200, 800);
    expect(wrapper(container).style.aspectRatio).not.toBe(first);
  });

  it('8: no Storage, signed URL, canvas, or crop-route authority', () => {
    for (const forbidden of [
      'createSignedUrl', 'getPublicUrl', 'searchParams', '@napi-rs/canvas',
      'createCanvas', '/crop', 'supabase', 'fetch(',
    ]) {
      expect(componentSource, forbidden).not.toContain(forbidden);
    }
  });

  it('9/10: presentation-only -- no TipTap import, no editor content shape, no persisted metadata', () => {
    for (const forbidden of ['tiptap', 'Editor', 'setContent', 'getHTML', 'metadata']) {
      expect(componentSource, forbidden).not.toContain(forbidden);
    }
  });
});
