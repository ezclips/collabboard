import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * R6B, group F -- the wiring, and the one property the whole slice exists to
 * hold: a crop of a private Knowledge PDF is never published.
 *
 * Source invariants, in the style this repo already uses for CanvasClient:
 * they pin call shapes and ordering, not formatting.
 */

/** Line comments only -- a block strip would swallow JSX and fake passes. */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

const selector = sourceOf('components/collabboard/KnowledgeDocumentPageRegionSelector.tsx');
const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');

const R6B_FILES = [
  'lib/domain/knowledge/knowledgeSourceClipPayload.ts',
  'lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts',
  'lib/server/knowledge/knowledgePdfAreaImageRoute.ts',
  'lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts',
  'lib/infra/knowledge/knowledgePdfAreaImageClient.ts',
  'app/api/boards/[id]/knowledge/area-image/route.ts',
  'app/api/boards/[id]/padlets/[padletId]/image/route.ts',
  'components/collabboard/KnowledgeDocumentPageRegionSelector.tsx',
] as const;

function after(source: string, anchor: string, count = 900): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

describe('F1-F5: the selected area is itself the drag source', () => {
  it('F1: the armed rectangle is draggable and grabbable, not an inert overlay', () => {
    const rectangle = after(selector, 'data-knowledge-region-rectangle={pageNumber}', 1800);
    expect(rectangle).toContain('draggable={draggableRegion}');
    expect(rectangle).toContain('onDragStart={draggableRegion ? startAreaClipDrag : undefined}');
    expect(rectangle).toContain('cursor-grab');
  });

  it('F2: pressing it does not restart a selection underneath it', () => {
    // The crosshair layer treats any press as a NEW rectangle and clears the
    // armed one, which would destroy the thing being dragged.
    const rectangle = after(selector, 'data-knowledge-region-rectangle={pageNumber}', 1800);
    expect(rectangle).toContain('onPointerDown={draggableRegion ? (event) => event.stopPropagation() : undefined}');
    expect(selector).toContain('if (armedRegion !== null) onClear();');
  });

  it('F3: only a settled rectangle drags -- mid-drag there is no answer yet', () => {
    expect(selector).toContain('const draggableRegion = enabled && armedRegion !== null && live === null;');
    // An unarmed rectangle keeps its old inert behaviour exactly.
    const rectangle = after(selector, 'data-knowledge-region-rectangle={pageNumber}', 1800);
    expect(rectangle).toContain("draggableRegion ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'");
  });

  it('F4: it publishes the area arm on the ONE dedicated type, via the shared builder', () => {
    const dragStart = after(selector, 'const startAreaClipDrag = (', 1200);
    expect(dragStart).toContain('event.dataTransfer.setData(');
    expect(dragStart).toContain('KNOWLEDGE_SOURCE_CLIP_MIME');
    expect(dragStart).toContain('buildKnowledgeSourceClipTransfer({');
    expect(dragStart).toContain("kind: 'area'");
    expect(dragStart).toContain('region: armedRegion');
    // The constant, never a re-typed literal that could drift.
    expect(selector).not.toContain("'application/collabboard-knowledge-clip'");
    // text/plain accompanies every drag on the system; honouring it anywhere
    // would let arbitrary dropped text forge a clip.
    expect(dragStart).not.toContain('text/plain');
  });

  it('F5: the reader publishes no bytes and learns nothing about the canvas', () => {
    const dragStart = after(selector, 'const startAreaClipDrag = (', 1200);
    for (const forbidden of ['toDataURL', 'toBlob', 'canvas', 'fetch(', 'base64', 'storagePath']) {
      expect(dragStart, forbidden).not.toContain(forbidden);
    }
    for (const forbidden of ['padlets', 'board_id', 'position_x', 'getCanvasPointFromClient', '.insert(']) {
      expect(selector, forbidden).not.toContain(forbidden);
    }
  });
});

describe('F6-F10: the canvas asks the server, and claims the drop exactly once', () => {
  it('F6: the area arm is checked ahead of the text arm at EVERY drop site', () => {
    const areaSites = canvasClient.match(/if \(handleKnowledgePdfAreaClipDrop\(e\)\) return;/g) ?? [];
    const textSites = canvasClient.match(/if \(handleKnowledgeSourceClipDrop\(e\)\) return;/g) ?? [];
    expect(areaSites.length).toBe(textSites.length);
    expect(areaSites.length).toBeGreaterThan(0);
    // And each area check literally precedes its text check.
    let cursor = 0;
    for (let i = 0; i < areaSites.length; i += 1) {
      const area = canvasClient.indexOf('if (handleKnowledgePdfAreaClipDrop(e)) return;', cursor);
      const text = canvasClient.indexOf('if (handleKnowledgeSourceClipDrop(e)) return;', cursor);
      expect(area).toBeGreaterThan(-1);
      expect(text).toBeGreaterThan(area);
      cursor = text + 1;
    }
  });

  it('F7: it claims the drop synchronously, before anything can await', () => {
    const handler = after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2200);
    const parse = handler.indexOf('parseKnowledgeSourceAreaClipPayload(');
    const bail = handler.indexOf('if (!payload) return false;');
    const stop = handler.indexOf('event.stopPropagation();');
    const firstAwait = handler.indexOf('await ');
    expect(bail).toBeGreaterThan(parse);
    expect(stop).toBeGreaterThan(bail);
    expect(firstAwait).toBeGreaterThan(stop);
    // The drop point is read while the event is still live.
    expect(handler.indexOf('getCanvasPointFromClient(event.clientX, event.clientY)')).toBeLessThan(firstAwait);
  });

  it('F8: it re-checks the creation capability rather than trusting the drag', () => {
    // A viewer can synthesise a DataTransfer, so the surface that writes must
    // authorise -- the absent grip is not a permission check.
    const handler = after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2200);
    expect(handler).toContain('if (!canUseCanvasToolbar || !canvasId) return true;');
    // Claimed regardless, so a refusal cannot fall through to another handler.
    expect(handler).toContain('return true;');
  });

  it('F9: it reads only the dedicated type and creates nothing itself', () => {
    const handler = after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2200);
    expect(handler).toContain('event.dataTransfer.getData(KNOWLEDGE_SOURCE_CLIP_MIME)');
    expect(handler).not.toContain('text/plain');
    // One transport helper; no direct insert, no upload, no public URL.
    expect(handler).toContain('requestKnowledgePdfAreaImage(canvasId, payload, {');
    for (const forbidden of ['.insert(', '.upload(', 'getPublicUrl', 'storageGateway', 'toDataURL']) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
  });

  it('F10: a refusal places nothing, and only tells the user', () => {
    const handler = after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2200);
    const refusal = handler.indexOf('if (!created.ok)');
    const place = handler.indexOf('setPadlets(prev => [...prev, created.padlet');
    expect(refusal).toBeGreaterThan(-1);
    expect(place).toBeGreaterThan(refusal);
    expect(handler).toContain('toast.error(');
  });
});

describe('F11-F13: nothing in this slice can publish a crop', () => {
  it('F11: no R6B file names a public bucket or mints a public/signed URL', () => {
    for (const file of R6B_FILES) {
      const source = sourceOf(file);
      for (const forbidden of ["'padlet-files'", '"padlet-files"', "from('images')", "from('thumbnails')",
        'getPublicUrl', 'createSignedUrl', 'storage/v1/object/public']) {
        expect(source, `${file} must not ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('F12: no R6B file reaches into the PDF worker or a second image stack', () => {
    // The worker isolation rule: PDF.js lives only in workers/knowledge-pdf.
    for (const file of R6B_FILES) {
      const source = sourceOf(file).toLowerCase();
      for (const forbidden of ['workers/knowledge-pdf', 'pdfjs', 'pdf.js', 'html2canvas',
        'tesseract', 'puppeteer', 'playwright']) {
        expect(source, `${file} must not use ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('F13: this slice adds no migration and no new bucket', () => {
    // The crop lives in the bucket the PDF already lives in, so R6B needed no
    // schema change at all -- provenance rides in the existing metadata jsonb.
    const server = sourceOf('lib/server/knowledge/knowledgePdfAreaImageRoute.ts');
    expect(server).toContain('KNOWLEDGE_STORAGE_BUCKET');
    for (const forbidden of ['createBucket', 'updateBucket', 'alter table', 'ALTER TABLE', 'rpc(']) {
      expect(server, forbidden).not.toContain(forbidden);
    }
  });
});
