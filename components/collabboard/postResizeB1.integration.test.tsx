// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getFallbackMinimapItem } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import type { Padlet } from '@/types/collabboard';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** Source with comments stripped (repo convention -- see sectionHeading tests). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const handleSrc = read('components/collabboard/canvas/ui/PostResizeHandle.tsx');
const policySrc = read('lib/domain/canvas/postResizePolicy.ts');
const drawingSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const sectionHeadingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const aiRendererSrc = read('components/collabboard/AIComponentRenderer.tsx');
const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts');

describe('PATCH POST-RESIZE-B1 shared handle wiring', () => {
  it('14. the shared handle performs NO canvasZoom arithmetic and imports no host internals', () => {
    expect(code(handleSrc)).not.toMatch(/canvasZoom/);
    expect(code(handleSrc)).not.toMatch(/\/\s*canvasZoom|\/\s*zoom/);
    expect(code(handleSrc)).not.toMatch(/CanvasClient|DrawingLayout|excalidraw|supabase|createPostsRepository/);
  });

  it('13. the handle requires the host clientToWorld converter', () => {
    expect(code(handleSrc)).toContain('clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };');
  });

  it('20/21/22. the handle owns pointer capture, the right-button guard and data-no-drag', () => {
    expect(code(handleSrc)).toContain('setPointerCapture?.(event.pointerId)');
    expect(code(handleSrc)).toContain('event.button === 2');
    expect(code(handleSrc)).toContain('data-no-drag="true"');
  });

  it('24/25. previews never persist; ONE commit call on release', () => {
    expect(code(handleSrc)).toContain('onResizePreview(next.width, next.height)');
    expect(code(handleSrc)).toContain('isMeaningfulPostResize(gesture.startWidth, gesture.startHeight, next)');
    expect(code(handleSrc)).toContain('onResizeCommit(next.width, next.height, gesture.startWidth, gesture.startHeight)');
  });
});

describe('PATCH POST-RESIZE-B1 Freeform wiring', () => {
  it('40/41. Freeform mounts the shared handle for AI AND Image -- exactly one grip each', () => {
    const occurrences = code(cardsSrc).split('<PostResizeHandle').length - 1;
    expect(occurrences).toBe(2);
  });

  it('40. the AI grip condition still gates on edit permission and lock', () => {
    expect(code(cardsSrc)).toContain("padlet.type === 'ai-component' && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked");
  });

  it('33/34. the Image grip is selected-only, editable, unlocked', () => {
    expect(code(cardsSrc)).toContain("padlet.type === 'image' && isPadletSelected(padlet.id) && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked");
  });

  it('43. the old duplicate AI handle plumbing is gone (no aiResizeRef, no onResize inside legacyHtmlProps)', () => {
    expect(code(cardsSrc)).not.toContain('aiResizeRef');
    expect(code(cardsSrc)).not.toContain('onResizeEnd');
    expect(code(cardsSrc)).not.toMatch(/onResize: \(w: number, h: number\)/);
    expect(code(cardsSrc)).not.toContain('persistPostFieldsBestEffort');
  });

  it('48. AI commit goes through the honest updatePostFieldsOrThrow with rollback + toast', () => {
    const commit = code(cardsSrc);
    expect(commit).toContain('commitPostResize(padlet.id, w, h, ow, oh)');
    expect(commit).toContain('await updatePostFieldsOrThrow(padletId, {');
    expect(commit).toContain("width: originWidth, height: originHeight");
    expect(commit).toContain("toast.error('Failed to resize post')");
  });

  it('28/31/32. Image rendering switches to canonical geometry only when valid', () => {
    expect(code(cardsSrc)).toContain('hasValidPostResizeGeometry(padlet.width, padlet.height)');
    expect(code(cardsSrc)).toContain("${Math.max(Number(padlet.width), IMAGE_RESIZE_MIN_WIDTH)}px`");
    expect(code(cardsSrc)).toContain("${Math.max(Number(padlet.height), IMAGE_RESIZE_MIN_HEIGHT)}px`");
    // Legacy fallback stays exactly 360px.
    expect(code(cardsSrc)).toContain(": '360px',");
  });

  it('20. children are frozen: Container child cards carry no resize handle', () => {
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
    expect(code(rowColumnSrc)).not.toContain('data-post-resize-handle');
  });

  it('37. the gesture origin is the ACTUAL rendered rectangle via getStartSize', () => {
    expect(code(cardsSrc)).toContain('imageCardRefs.current[padlet.id]');
    expect(code(cardsSrc)).toContain('el.offsetWidth || 360');
    expect(code(cardsSrc)).toContain('el.offsetHeight || 100');
  });
});

describe('PATCH POST-RESIZE-B1 freezes', () => {
  it('58. Drawing is frozen: no shared handle import', () => {
    expect(code(drawingSrc)).not.toContain('PostResizeHandle');
  });

  it('66. Section Heading keeps its own horizontal-only handles', () => {
    expect(code(sectionHeadingSrc)).not.toContain('PostResizeHandle');
    expect(code(sectionHeadingSrc)).not.toContain('data-post-resize-handle');
    expect(policySrc).toContain("case 'section_heading':");
    expect(policySrc).toContain("return 'horizontal-only';");
  });

  it('65. Container orientation code untouched by B1 (no new shrink/expand behavior in the file)', () => {
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
  });

  it('42/43. AIComponentRenderer retains its opt-in internal handle for other hosts', () => {
    expect(code(aiRendererSrc)).toContain('onResize');
    expect(code(aiRendererSrc)).toContain('onResizeEnd');
  });
});

describe('PATCH POST-RESIZE-B1 minimap canonical preference', () => {
  it('36. a resized Image uses canonical geometry in the fallback', () => {
    const resized: Padlet = {
      id: 'img-1',
      board_id: 'b',
      title: '',
      content: '',
      type: 'image',
      position_x: 0,
      position_y: 0,
      width: 640,
      height: 480,
      created_at: '',
      updated_at: '',
    };
    expect(getFallbackMinimapItem(resized)).toMatchObject({ width: 640, height: 480 });
  });

  it('28b. a legacy Image keeps the 360 fallback width', () => {
    const legacy: Padlet = {
      id: 'img-2',
      board_id: 'b',
      title: '',
      content: '',
      type: 'image',
      position_x: 0,
      position_y: 0,
      width: 0,
      height: 0,
      created_at: '',
      updated_at: '',
    };
    expect(getFallbackMinimapItem(legacy)).toMatchObject({ width: 360 });
  });

  it('36b. the minimap fallback module imports the shared policy (no separate image constant)', () => {
    expect(code(minimapSrc)).toContain('postResizePolicy');
  });
});
