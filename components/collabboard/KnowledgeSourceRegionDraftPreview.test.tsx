// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import KnowledgeSourceRegionDraftPreview from './KnowledgeSourceRegionDraftPreview';
import type { NormalizedPageRegion } from '@/lib/domain/knowledge/knowledgePageRegionGeometry';

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

  it('scales the image so the armed rectangle exactly fills the wrapper (rotation 0)', () => {
    const img = mount().querySelector('img') as HTMLImageElement;
    // width/height% = 1/display.<dim>; rotation 0 leaves the region unchanged.
    expect(img.style.width).toBe(`${(1 / REGION.width) * 100}%`);
    expect(img.style.height).toBe(`${(1 / REGION.height) * 100}%`);
    expect(img.style.transform).toBe(`translate(${-REGION.x * 100}%, ${-REGION.y * 100}%)`);
  });

  it('applies sourceRegionToDisplayRegion, not the raw stored rectangle, for a rotated page', () => {
    // 90deg turn: display = (1 - s.y - s.height, s.x, s.height, s.width).
    const img = mount({ appliedRotation: 90 }).querySelector('img') as HTMLImageElement;
    const expectedX = 1 - REGION.y - REGION.height;
    const expectedY = REGION.x;
    const expectedWidth = REGION.height;
    const expectedHeight = REGION.width;
    expect(img.style.width).toBe(`${(1 / expectedWidth) * 100}%`);
    expect(img.style.height).toBe(`${(1 / expectedHeight) * 100}%`);
    expect(img.style.transform).toBe(`translate(${-expectedX * 100}%, ${-expectedY * 100}%)`);
  });

  it('an image load failure shows a neutral unavailable state instead of a broken image', () => {
    const container = mount();
    const img = container.querySelector('img')!;
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-knowledge-source-region-draft-preview-unavailable]')).not.toBeNull();
    expect(container.textContent).toContain('unavailable');
  });

  it('never blocks on a load failure: the wrapper element still renders', () => {
    const container = mount();
    act(() => { container.querySelector('img')!.dispatchEvent(new Event('error')); });
    expect(container.querySelector('[data-knowledge-source-region-draft-preview]')).not.toBeNull();
  });

  it('source guards: no Storage, signed URL, canvas, or crop-route authority', () => {
    for (const forbidden of [
      'createSignedUrl', 'getPublicUrl', 'searchParams', '@napi-rs/canvas',
      'createCanvas', '/crop', 'supabase', 'fetch(',
    ]) {
      expect(componentSource, forbidden).not.toContain(forbidden);
    }
  });

  it('is presentation-only: no TipTap import, no editor content shape', () => {
    for (const forbidden of ['tiptap', 'Editor', 'setContent', 'getHTML']) {
      expect(componentSource, forbidden).not.toContain(forbidden);
    }
  });
});
