// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import KnowledgeDocumentPageImage, {
  knowledgePageDisplayDimensions,
  knowledgePageImageUrl,
} from './KnowledgeDocumentPageImage';

/**
 * P6J-F9-A2b. The page visual is optional enhancement data over canonical
 * text, and the browser must never hold Storage authority. These pin both:
 * the component addresses only the authenticated same-origin route, and any
 * failure removes the image rather than disturbing the reader.
 */

/** React 18+ requires this before act(); several suites here already set it. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const FILENAME = 'report.pdf';

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root!.unmount());
  host.remove();
  root = null;
});

function render(props: Partial<React.ComponentProps<typeof KnowledgeDocumentPageImage>> = {}) {
  act(() => root!.render(
    <KnowledgeDocumentPageImage
      boardId={BOARD_ID}
      documentId={DOCUMENT_ID}
      pageNumber={3}
      originalFilename={FILENAME}
      {...props}
    />,
  ));
  return host.querySelector('img');
}

const componentSource = () =>
  fs.readFileSync(path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentPageImage.tsx'), 'utf8');

/** Strips comments so negative scans test what the component DOES. */
const componentCode = () => componentSource()
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The utility after the last variant colon OUTSIDE brackets/parens: a colon
 * inside `[--foo:p-1]` is an arbitrary-property value, not a variant split. */
function utilityPortion(token: string): string {
  let depth = 0;
  let lastTopLevelColon = -1;
  for (let i = 0; i < token.length; i += 1) {
    const char = token[i];
    if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth = Math.max(0, depth - 1);
    else if (char === ':' && depth === 0) lastTopLevelColon = i;
  }
  return lastTopLevelColon === -1 ? token : token.slice(lastTopLevelColon + 1);
}
const PADDING_UTILITY = /^!?p(?:[trblxyse])?-/;
const hasPaddingUtility = (className: string) =>
  className.split(/\s+/).filter(Boolean).some((token) => PADDING_UTILITY.test(utilityPortion(token)));
const paddingUtilityTokens = ['p-1', 'px-2', 'py-2', 'pt-1', 'pr-1', 'pb-1', 'pl-1', 'ps-2', 'pe-2',
  'md:p-1', 'lg:px-2', 'md:ps-2', 'xl:pe-4', 'hover:px-2', 'focus:ps-2',
  'sm:hover:py-[3px]', 'md:focus:pe-[2px]', 'md:!p-1', 'hover:!ps-2'];
const nonPaddingUtilityTokens = ['md:w-full', 'hover:opacity-90', 'rounded', 'border',
  '[--foo:p-1]', 'hover:[--foo:p-1]', 'md:[--foo:px-2]'];

describe('R1: image URL identity', () => {
  it('addresses the authenticated route with board, document and page only', () => {
    const img = render();
    expect(img).not.toBeNull();
    const src = img!.getAttribute('src')!;
    expect(src).toBe(`/api/boards/${BOARD_ID}/knowledge/${DOCUMENT_ID}/pages/3/image`);
    expect(src).toBe(knowledgePageImageUrl(BOARD_ID, DOCUMENT_ID, 3));
    // Same-origin app route, never a Storage or provider URL.
    expect(src.startsWith('/api/boards/')).toBe(true);
    expect(src).not.toMatch(/supabase|storage|token|signed|https?:/i);
  });

  it('percent-encodes both ids so a crafted id cannot escape its path segment', () => {
    const url = knowledgePageImageUrl('a/../b', 'c?d#e', 7);
    expect(url).toBe('/api/boards/a%2F..%2Fb/knowledge/c%3Fd%23e/pages/7/image');
    // Nine segments: each encoded id stayed inside its own, so the crafted
    // input introduced no extra path boundary.
    expect(url.split('/').length).toBe(9);
  });
});

describe('R2/R3/R11: image element contract', () => {
  it('defers loading, decodes off the main thread and applies no rotation', () => {
    const img = render()!;
    // Every page section mounts at once, so deferral is what stops a 200-page
    // document from fetching 200 images the moment the reader opens.
    expect(img.getAttribute('loading')).toBe('lazy');
    // C7: deferral and reservation are not alternatives -- lazy loading only
    // defers anything if the element already occupies space in the layout.
    expect(img.getAttribute('width')).toBe('3');
    expect(img.getAttribute('height')).toBe('4');
    expect(img.getAttribute('decoding')).toBe('async');
    // A1 rasterises with the page rotation already applied; rotating again
    // client-side would double-apply it.
    expect(img.getAttribute('class') ?? '').not.toMatch(/rotate|-scale|skew/);
    expect(img.getAttribute('style')).toBeNull();
    expect(componentCode()).not.toMatch(/rotate|transform:|page\.rotation/i);
  });

  it('is decorative: the canonical page text below it is the accessible content', () => {
    const img = render()!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
  });

  it('is not draggable, so it can never become a second F8 clip source', () => {
    const img = render()!;
    expect(img.draggable).toBe(false);
  });

  it('B3-6: keeps zero padding on all sides for selector content-box mapping', () => {
    expect(hasPaddingUtility(render()!.className)).toBe(false);
    expect(paddingUtilityTokens.every(hasPaddingUtility)).toBe(true);
    expect(nonPaddingUtilityTokens.some(hasPaddingUtility)).toBe(false);
  });
});

/**
 * P6J-F9-A2b corrective. A real browser run proved loading="lazy" inert here:
 * with no intrinsic size every page section measured 57px, all twelve pages
 * fit one 540px viewport, and Chrome fetched every image at open. HTML
 * width/height restore the aspect-ratio reservation the layout needs.
 */
describe('C2-C6: pre-load layout reservation', () => {
  const reserved = (props: Record<string, unknown>) => {
    const img = render(props)!;
    return [img.getAttribute('width'), img.getAttribute('height')];
  };

  /**
   * A1 rasterises with the page rotation already applied, so a quarter-turn
   * page arrives transposed. Reserving the stored unrotated points for it
   * would describe a shape the derivative never has.
   */
  it.each([
    ['C2', 0, '600', '800'],
    ['C3', 180, '600', '800'],
    ['C4', 90, '800', '600'],
    ['C5', 270, '800', '600'],
  ])('%s: a 600x800 page at rotation %i reserves %s x %s', (_id, rotation, width, height) => {
    expect(reserved({ widthPoints: 600, heightPoints: 800, rotation })).toEqual([width, height]);
  });

  it.each([
    ['both dimensions null', { widthPoints: null, heightPoints: null, rotation: 0 }],
    ['one dimension null', { widthPoints: null, heightPoints: 800, rotation: 0 }],
    ['zero width', { widthPoints: 0, heightPoints: 800, rotation: 0 }],
    ['negative width', { widthPoints: -600, heightPoints: 800, rotation: 0 }],
    ['NaN width', { widthPoints: Number.NaN, heightPoints: 800, rotation: 0 }],
    ['infinite width', { widthPoints: Number.POSITIVE_INFINITY, heightPoints: 800, rotation: 0 }],
    ['no geometry at all', {}],
    ['non-canonical rotation', { widthPoints: 600, heightPoints: 800, rotation: 45 }],
    ['NaN rotation', { widthPoints: 600, heightPoints: 800, rotation: Number.NaN }],
  ])('C6: %s still reserves positive space, never zero', (_label, props) => {
    const [width, height] = reserved(props);
    // The exact ratio is guesswork; that it is POSITIVE is the whole point,
    // because zero is what reproduced the collapse the browser run found.
    expect([width, height]).toEqual(['3', '4']);
    expect(Number(width)).toBeGreaterThan(0);
    expect(Number(height)).toBeGreaterThan(0);
  });

  it('C6: an absent rotation is upright, so real geometry is not discarded', () => {
    // The column is nullable and pre-A1 rows leave it unset. Throwing away a
    // perfectly good 600x800 for the neutral 3x4 would reserve a worse shape.
    expect(reserved({ widthPoints: 600, heightPoints: 800, rotation: null })).toEqual(['600', '800']);
  });

  it('C6: sub-pixel geometry rounds, but never down to zero', () => {
    expect(reserved({ widthPoints: 0.2, heightPoints: 0.4, rotation: 0 })).toEqual(['1', '1']);
    expect(reserved({ widthPoints: 612.4, heightPoints: 792.6, rotation: 0 })).toEqual(['612', '793']);
  });

  it('C6: never throws, whatever malformed row the API surfaces', () => {
    const wild = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1e9,
      '600' as unknown as number, {} as unknown as number];
    for (const width of wild) {
      for (const rotation of wild) {
        expect(() => knowledgePageDisplayDimensions(width, 800, rotation)).not.toThrow();
        const box = knowledgePageDisplayDimensions(width, 800, rotation);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });
});

describe('R4: failure falls back silently', () => {
  it('removes itself when the route reports no derivative', () => {
    const img = render()!;
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(host.querySelector('img')).toBeNull();
    // No error text is substituted for the visual -- the page text is the
    // fallback, and it lives outside this component entirely.
    expect(host.textContent).toBe('');
  });

  it('logs nothing: a missing derivative is an expected, ordinary state', () => {
    // Pre-A1 documents, >50MiB sources and >200-page sources all legitimately
    // have no derivative; logging each one would be routine console noise.
    expect(componentCode()).not.toMatch(/console\.(log|warn|error|info)/);
  });
});

describe('R8: failure state is tied to identity, not to the component instance', () => {
  it('retries for a new document after the previous one failed', () => {
    const first = render({ documentId: DOCUMENT_ID })!;
    act(() => { first.dispatchEvent(new Event('error')); });
    expect(host.querySelector('img')).toBeNull();

    const other = '33333333-3333-4333-8333-333333333333';
    const second = render({ documentId: other });
    // The stale failure must not suppress a perfectly good image for the
    // newly opened document.
    expect(second).not.toBeNull();
    expect(second!.getAttribute('src')).toBe(knowledgePageImageUrl(BOARD_ID, other, 3));
  });

  it('retries for a new page after the previous one failed', () => {
    const first = render({ pageNumber: 3 })!;
    act(() => { first.dispatchEvent(new Event('error')); });
    expect(host.querySelector('img')).toBeNull();

    const second = render({ pageNumber: 4 });
    expect(second).not.toBeNull();
    expect(second!.getAttribute('src')).toBe(knowledgePageImageUrl(BOARD_ID, DOCUMENT_ID, 4));
  });

  it('stays hidden while the identity is unchanged', () => {
    const img = render()!;
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(render()).toBeNull();
  });
});

describe('R9/R10: no client Storage or PDF.js authority', () => {
  it('holds no Supabase Storage client, bucket, object key or signed URL', () => {
    const code = componentCode();
    for (const forbidden of [
      'supabase', 'storage.from', 'createSignedUrl', 'knowledge-documents',
      'getPublicUrl', '.webp', 'blob:', 'data:image',
    ]) {
      expect(code, `the component must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('imports no PDF.js and parses no PDF in the browser', () => {
    expect(componentCode()).not.toMatch(/pdfjs|getDocument|\.pdf['"`]/i);
  });

  it('issues no fetch of its own -- the img element is the only request', () => {
    const code = componentCode();
    expect(code).not.toMatch(/fetch\(|XMLHttpRequest|axios/);
  });
});
