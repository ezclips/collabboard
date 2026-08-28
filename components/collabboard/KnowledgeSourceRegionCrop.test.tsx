// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const REFERENCE_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('next/navigation', () => ({ useParams: vi.fn() }));
import { useParams } from 'next/navigation';
import KnowledgeSourceRegionCrop from './KnowledgeSourceRegionCrop';

const componentSource = fs.readFileSync(
  path.join(process.cwd(), 'components/collabboard/KnowledgeSourceRegionCrop.tsx'), 'utf8');
const eligibilitySource = fs.readFileSync(
  path.join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceCardRegionCrop.ts'), 'utf8');

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.mocked(useParams).mockReturnValue({ id: BOARD_ID } as never);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(referenceId = REFERENCE_ID) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<KnowledgeSourceRegionCrop referenceId={referenceId} />);
  });
  return host!;
}

const EXPECTED_SRC = `/api/boards/${BOARD_ID}/knowledge/references/${REFERENCE_ID}/crop`;

describe('P6J-F9-C2 KnowledgeSourceRegionCrop', () => {
  it('C1: resolved board id + reference id produce the exact same-origin route', () => {
    const img = mount().querySelector('img')!;
    expect(img.getAttribute('src')).toBe(EXPECTED_SRC);
  });

  it('C2/C4/C5/C6/C7: plain img with the required decorative attributes', () => {
    const img = mount().querySelector('img')!;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.draggable).toBe(false);
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
  });

  it('C3: loading is lazy', () => {
    expect(mount().querySelector('img')!.getAttribute('loading')).toBe('lazy');
  });

  it('C8/C9: a fixed reserved wrapper exists, and the image uses object-contain', () => {
    const container = mount();
    const wrapper = container.querySelector('[data-knowledge-source-region-crop]')!;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain('h-20');
    expect(container.querySelector('img')!.className).toContain('object-contain');
  });

  it('C10/C11: an image error hides the crop and does not retry the same src', () => {
    const container = mount();
    const img = container.querySelector('img')!;
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('[data-knowledge-source-region-crop]')).toBeNull();

    // Re-render with the identical referenceId: still suppressed, no retry.
    act(() => { root!.render(<KnowledgeSourceRegionCrop referenceId={REFERENCE_ID} />); });
    expect(container.querySelector('img')).toBeNull();
  });

  it('C12: a changed reference (new src) after a failure renders normally again', () => {
    const container = mount();
    const img = container.querySelector('img')!;
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();

    act(() => { root!.render(<KnowledgeSourceRegionCrop referenceId="44444444-4444-4444-8444-444444444444" />); });
    const revived = container.querySelector('img');
    expect(revived).not.toBeNull();
    expect(revived!.getAttribute('src')).toBe(
      `/api/boards/${BOARD_ID}/knowledge/references/44444444-4444-4444-8444-444444444444/crop`,
    );
  });

  it('C13: a missing board id renders nothing', () => {
    vi.mocked(useParams).mockReturnValue({} as never);
    const container = mount();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('C14: the component never imports next/image', () => {
    expect(componentSource).not.toMatch(/from ['"]next\/image['"]/);
  });

  it('C15: the src carries no query string, and the props/url carry no page/document/region/rotation authority', () => {
    const src = mount().querySelector('img')!.getAttribute('src')!;
    expect(src).not.toContain('?');

    // Narrow to the actual prop contract and the src template, not the file's
    // own prose -- the doc comment legitimately explains what the SERVER
    // resolves, and the data attribute name legitimately says "region".
    expect(componentSource).toContain('export interface KnowledgeSourceRegionCropProps {\n  readonly referenceId: string;\n}');
    const srcLine = componentSource.split('\n').find((line) => line.includes('const src ='))!;
    for (const forbidden of ['documentId', 'pageNumber', 'region', 'rotation', 'storagePath']) {
      expect(srcLine).not.toContain(forbidden);
    }
  });

  it('source guards: no Storage/signed-URL/PDF authority anywhere in the C2 production files', () => {
    for (const forbidden of [
      'createSignedUrl', 'getPublicUrl', 'searchParams', 'naturalWidth', 'naturalHeight',
      'pdfjs', 'PDFDocument', 'sharp',
    ]) {
      expect(componentSource, forbidden).not.toContain(forbidden);
      expect(eligibilitySource, forbidden).not.toContain(forbidden);
    }
    // The eligibility helper is presentational only: it must not talk to
    // Supabase to decide whether a crop MAY be requested.
    const eligibilityLower = eligibilitySource.toLowerCase();
    for (const forbidden of ['supabase', 'createclient', 'fetch(', '.from(']) {
      expect(eligibilityLower, forbidden).not.toContain(forbidden);
    }
  });
});
