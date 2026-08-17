// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getFallbackMinimapItem } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import { getPostResizeCapability } from '@/lib/domain/canvas/postResizePolicy';
import type { Padlet } from '@/types/collabboard';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** Source with comments stripped (repo convention). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const handleSrc = read('components/collabboard/canvas/ui/PostResizeHandle.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts');
const policySrc = read('lib/domain/canvas/postResizePolicy.ts');
const drawingSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');

function padlet(type: string, width: number, height: number, metadata?: Record<string, unknown>): Padlet {
  return {
    id: `post-${type}-${width}-${height}`,
    board_id: 'b',
    title: '',
    content: '',
    type: type as Padlet['type'],
    position_x: 10,
    position_y: 20,
    width,
    height,
    created_at: '',
    updated_at: '',
    metadata,
  };
}

describe('PATCH POST-RESIZE-B2 renderer wiring', () => {
  it('B2 marker-gated render: the generic branch derives width/height from getManualResizeDimensions', () => {
    expect(code(cardsSrc)).toContain('getManualResizeDimensions(padlet)');
    expect(code(cardsSrc)).toContain('const manualGeometry = resizeMode !== \'none\' ? getManualResizeDimensions(padlet) : null;');
  });

  it('13. legacy fixed-layout posts keep their historical fixed widths (link 320, others 180)', () => {
    expect(code(cardsSrc)).toContain("padlet.type === 'link'\n                  ? (manualGeometry ? `${manualGeometry.width}px` : '320px')");
    expect(code(cardsSrc)).toContain(": (manualGeometry ? `${manualGeometry.width}px` : '180px')");
  });

  it('14. box-manual height drives an explicit card height only for box B2 types', () => {
    expect(code(cardsSrc)).toContain('const boxManualHeight = resizeMode === \'box\' && padlet.type !== \'ai-component\' && manualGeometry ? `${manualGeometry.height}px` : undefined;');
    expect(code(cardsSrc)).toContain('height: boxManualHeight,');
  });

  it('10. manually height-resized Note/Todo content scrolls instead of clipping', () => {
    expect(code(cardsSrc)).toContain("needsContentScroll ? 'overflow-y-auto'");
  });

  it('B2 generic-branch handle: selected-only, capability-driven mode, manualSize + mode commit', () => {
    expect(code(cardsSrc)).toContain("(resizeMode === 'box' || resizeMode === 'horizontal-only') && isPadletSelected(padlet.id)");
    expect(code(cardsSrc)).toContain('mode={resizeMode}');
    expect(code(cardsSrc)).toContain("void commitPostResize(padlet.id, w, h, ow, oh, { manualSize: true }, padlet.metadata, m);");
    expect(code(cardsSrc)).toContain('genericCardRefs.current[padlet.id]');
  });

  it('B2R.1 negative-control H: the generic-branch (Note/Todo/Link/Table) gesture origin is the MEASURED DOM rect, not stored padlet.width/height', () => {
    // The existing "genericCardRefs.current[padlet.id]" substring check above
    // is satisfied by the unrelated ref-callback assignment
    // (`ref={(el) => { genericCardRefs.current[padlet.id] = el; }}`) even if
    // getStartSize itself is rewritten to read stored geometry instead of the
    // DOM -- this test targets the getStartSize body specifically so that
    // regression is actually caught.
    expect(code(cardsSrc)).toContain('const el = genericCardRefs.current[padlet.id];');
    expect(code(cardsSrc)).toMatch(/getStartSize=\{\(\) => \{\s*const el = genericCardRefs\.current\[padlet\.id\];\s*if \(!el\) return null;\s*const width = el\.offsetWidth/);
  });

  it('26. box preview writes width+height; horizontal preview writes width only', () => {
    expect(code(cardsSrc)).toContain("if (resizeMode === 'horizontal-only') previewPostResizeWidth(padlet.id, w);");
    expect(code(cardsSrc)).toContain('else previewPostResize(padlet.id, w, h);');
    expect(code(cardsSrc)).toContain('const previewPostResizeWidth = React.useCallback(');
  });

  it('F/G. horizontal-only commit omits height from the persisted write', () => {
    const commit = code(cardsSrc);
    expect(commit).toContain("const horizontalOnly = mode === 'horizontal-only';");
    expect(commit).toContain("...(horizontalOnly ? {} : { height }),");
    expect(commit).toContain("...(horizontalOnly ? {} : { height: originHeight }),");
  });

  it('Document/Clipart handle is selected-only, canonical-aware, and measured from the card DOM', () => {
    expect(code(cardsSrc)).toContain('cardCardRefs.current[padlet.id]');
    expect(code(cardsSrc)).toContain('startWidth={Number(padlet.width) || 180}');
    expect(code(cardsSrc)).toContain('startHeight={Number(padlet.height) || 220}');
  });

  it('the card (Document/Clipart) render keeps its canonical geometry WITHOUT the marker', () => {
    expect(code(cardsSrc)).toContain('width: padlet.width || 180,');
    expect(code(cardsSrc)).toContain('height: padlet.height || 220,');
  });
});

describe('PATCH POST-RESIZE-B2R.2 low-zoom interaction-overlay ownership', () => {
  const stripped = code(cardsSrc);
  const genericContentStart = stripped.indexOf('const content = (');
  const genericContentEnd = stripped.indexOf("if (padlet.type === 'link')", genericContentStart);
  const genericContent = stripped.slice(genericContentStart, genericContentEnd);
  const genericOverlayStart = stripped.indexOf('const resizeHandle =');
  const genericOverlayEnd = genericContentStart;
  const genericOverlay = stripped.slice(genericOverlayStart, genericOverlayEnd);
  const imageCardStart = cardsSrc.indexOf('ref={(el) => { imageCardRefs.current[padlet.id] = el; }}');
  const imageOverlayStart = cardsSrc.indexOf('Resize interaction chrome is a sibling', imageCardStart);
  const imageCard = cardsSrc.slice(imageCardStart, imageOverlayStart);

  it('generic root resize chrome is outside the overflow-hidden semantic card', () => {
    expect(genericContent).toContain('relative overflow-hidden flex flex-col');
    expect(genericContent).not.toContain('<PostResizeHandle');
    expect(genericOverlay.match(/<PostResizeHandle/g)).toHaveLength(3); // Container + AI + B2 generic mode
    expect(stripped.match(/\{content\}\s*\{resizeHandle\}/g)).toHaveLength(4); // Link/Table/Todo/default
  });

  it('Image resize chrome is outside its overflow-hidden semantic card', () => {
    expect(imageCard).toContain('className={`overflow-hidden flex flex-col');
    expect(imageCard).not.toContain('<PostResizeHandle');
    expect(cardsSrc.slice(imageOverlayStart)).toContain('<PostResizeHandle');
  });

  it('content clipping remains intact for Image and generic root content', () => {
    expect(stripped).toContain('className={`overflow-hidden flex flex-col bg-white group relative transition-all');
    expect(stripped).toContain('className={`group group/image-container relative overflow-hidden flex flex-col');
    expect(stripped).toContain("needsContentScroll ? 'overflow-y-auto'");
    expect(stripped).toContain("'overflow-hidden'}`}");
  });

  it('resize-origin refs remain on semantic sized cards, never the interaction overlay', () => {
    expect(genericContent).toContain('ref={(el) => { genericCardRefs.current[padlet.id] = el; }}');
    expect(imageCard).toContain('ref={(el) => { imageCardRefs.current[padlet.id] = el; }}');
    expect(genericOverlay).not.toContain('ref={(el) =>');
    expect(stripped).toMatch(/getStartSize=\{\(\) => \{\s*const el = genericCardRefs\.current\[padlet\.id\]/);
    expect(stripped).toMatch(/getStartSize=\{\(\) => \{\s*const el = imageCardRefs\.current\[padlet\.id\]/);
  });

  it('interaction wrappers add no semantic width/height and the handle remains absolute', () => {
    expect(stripped.match(/<div className="relative">\s*\{content\}\s*\{resizeHandle\}/g)).toHaveLength(4);
    expect(code(handleSrc)).toContain('className={`absolute bottom-0 right-0');
  });

  it('the Image handle uses only local stacking above its selected semantic card', () => {
    const imageOverlay = cardsSrc.slice(imageOverlayStart, cardsSrc.indexOf('{/* Text Style Popup', imageOverlayStart));
    expect(imageOverlay).toContain('className="!z-[1001]"');
    expect(imageOverlay).not.toMatch(/z-\[9999\]|Number\.MAX_SAFE_INTEGER/);
  });

  it('exactly one source mount remains for each established host block', () => {
    expect(stripped.match(/<PostResizeHandle/g)).toHaveLength(5); // Image + Container + AI/B2 overlay + Document/Clipart
    expect(genericOverlay.match(/padlet\.type === 'ai-component'/g)).toHaveLength(1);
    expect(genericOverlay.match(/mode=\{resizeMode\}/g)).toHaveLength(1);
  });

  it('B2 selection gating and AI always-visible behavior remain distinct', () => {
    expect(genericOverlay).toContain("(resizeMode === 'box' || resizeMode === 'horizontal-only') && isPadletSelected(padlet.id)");
    const aiStart = genericOverlay.indexOf("padlet.type === 'ai-component'");
    const aiCondition = genericOverlay.slice(aiStart, genericOverlay.indexOf(") : (resizeMode", aiStart));
    expect(aiCondition).not.toContain('isPadletSelected(padlet.id)');
  });

  it('root-only and frozen renderers still carry no shared handle', () => {
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
    expect(code(drawingSrc)).not.toContain('PostResizeHandle');
    expect(code(drawingSrc)).not.toContain('PostResizeHandle');
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
  });
});

describe('PATCH POST-RESIZE-B2 horizontal-only shared handle', () => {
  it('the shared handle knows the horizontal-only mode and reports it to the host', () => {
    expect(code(handleSrc)).toContain("mode?: 'box' | 'horizontal-only'");
    expect(code(handleSrc)).toContain("deltaY: horizontal ? 0 : point.y - gesture.originPointerWorld.y,");
    expect(code(handleSrc)).toContain("onResizeCommit(next.width, next.height, gesture.startWidth, gesture.startHeight, mode);");
    expect(code(handleSrc)).toContain("cursor-ew-resize");
  });

  it('horizontal-only mode is renderer-neutral: no SectionHeading import', () => {
    expect(code(handleSrc)).not.toMatch(/SectionHeading|sectionHeading|resizeSectionHeading/);
  });
});

describe('PATCH POST-RESIZE-B2 minimap parity', () => {
  it('51. legacy Note (stored 300x200, no marker) maps at the historical 180 width -- not stored width', () => {
    expect(getFallbackMinimapItem(padlet('text', 300, 200))).toMatchObject({ width: 180 });
  });

  it('52. manual Note (400x300 + marker) maps at its canonical geometry', () => {
    expect(getFallbackMinimapItem(padlet('text', 400, 300, { manualSize: true }))).toMatchObject({ width: 400, height: 300 });
  });

  it('53. legacy Link (stored 500x400, no marker) maps at 320 -- not stored width', () => {
    expect(getFallbackMinimapItem(padlet('link', 500, 400))).toMatchObject({ width: 320 });
  });

  it('54. manual Link (420 wide + marker) maps at canonical width', () => {
    expect(getFallbackMinimapItem(padlet('link', 420, 300, { manualSize: true }))).toMatchObject({ width: 420 });
  });

  it('55. legacy Document (640x480, no marker) keeps canonical geometry -- marker never gates it', () => {
    expect(getFallbackMinimapItem(padlet('card', 640, 480))).toMatchObject({ width: 640, height: 480 });
  });

  it('56. legacy Clipart (320x240 svgUrl, no marker) keeps canonical geometry', () => {
    expect(getFallbackMinimapItem(padlet('card', 320, 240, { svgUrl: '/x.svg' }))).toMatchObject({ width: 320, height: 240 });
  });

  it('B1 regression: legacy Image still maps at 360 without the marker', () => {
    expect(getFallbackMinimapItem(padlet('image', 300, 200))).toMatchObject({ width: 360 });
  });

  it('the minimap uses the shared marker/geometry helper (no duplicated condition)', () => {
    expect(code(minimapSrc)).toContain('getManualResizeDimensions');
  });
});

describe('PATCH POST-RESIZE-B2 freezes', () => {
  it('66/67. Image and AI capabilities unchanged by B2', () => {
    expect(getPostResizeCapability({ type: 'image' })).toBe('box');
    expect(getPostResizeCapability({ type: 'ai-component' })).toBe('box');
  });

  it('71/72. File and Comment stay non-resizable', () => {
    expect(getPostResizeCapability({ type: 'file' })).toBe('none');
    expect(getPostResizeCapability({ type: 'comment' })).toBe('none');
  });

  it('69. Container stays non-resizable in B2 (B3 owns it)', () => {
    expect(getPostResizeCapability({ type: 'container' })).toBe('none');
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
  });

  it('70. Drawing host is frozen: no shared handle import', () => {
    expect(code(drawingSrc)).not.toContain('PostResizeHandle');
    expect(code(cardsSrc)).not.toMatch(/viewDrawingPadlet[\s\S]{0,80}PostResizeHandle/);
  });

  it('73/74. Graph/Line and the Excalidraw fork are untouched by B2 (no policy or wiring references)', () => {
    expect(policySrc).not.toMatch(/\b(graph|line|arrow)\b/i);
    expect(code(cardsSrc)).not.toContain('excalidraw_fork');
  });

  it('49. Container children render through child cards that carry no B2 handle', () => {
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
    expect(code(rowColumnSrc)).not.toContain('data-post-resize-handle');
  });
});
