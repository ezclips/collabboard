import { describe, expect, it } from 'vitest';
import {
  POST_RESIZE_CONSTRAINTS,
  getManualResizeDimensions,
  getPostResizeCapability,
  getPostResizeConstraints,
  hasValidPostResizeGeometry,
  isImageManuallySized,
  isManuallySizedPost,
} from '@/lib/domain/canvas/postResizePolicy';
import type { Padlet } from '@/types/collabboard';

function post(type: string): Pick<Padlet, 'type'> {
  return { type: type as Padlet['type'] };
}

function sized(type: string, width: number, height: number, metadata?: Record<string, unknown>): Padlet {
  return {
    id: 'p-1',
    board_id: 'b',
    title: '',
    content: '',
    type: type as Padlet['type'],
    position_x: 0,
    position_y: 0,
    width,
    height,
    created_at: '',
    updated_at: '',
    metadata,
  };
}

describe('PATCH POST-RESIZE-B1/B2 capability matrix', () => {
  it('1. image -> box', () => {
    expect(getPostResizeCapability(post('image'))).toBe('box');
  });

  it('2. ai-component -> box', () => {
    expect(getPostResizeCapability(post('ai-component'))).toBe('box');
  });

  it('3. section_heading remains SPECIAL horizontal-only', () => {
    expect(getPostResizeCapability(post('section_heading'))).toBe('horizontal-only');
  });

  it('B2: text/note -> box', () => {
    expect(getPostResizeCapability(post('text'))).toBe('box');
    expect(getPostResizeCapability(post('note'))).toBe('box');
  });

  it('B2: todo -> box', () => {
    expect(getPostResizeCapability(post('todo'))).toBe('box');
  });

  it('B2: link -> horizontal-only', () => {
    expect(getPostResizeCapability(post('link'))).toBe('horizontal-only');
  });

  it('B2: card (Document AND Clipart) -> box', () => {
    expect(getPostResizeCapability(post('card'))).toBe('box');
  });

  it('B2: table -> horizontal-only', () => {
    expect(getPostResizeCapability(post('table'))).toBe('horizontal-only');
  });

  it('B2 exposes nothing else: container/comment/drawing -> none', () => {
    for (const type of ['container', 'comment', 'drawing']) {
      expect(getPostResizeCapability(post(type)), type).toBe('none');
    }
  });

  it('PDF-C1: a file post is the Knowledge PDF placement and resizes as a box', () => {
    // It had no renderer when B2 was written, so it was correctly 'none' then.
    // The placement is now a document viewport whose height decides how much
    // of a page is readable, so both axes matter -- through this same policy,
    // not a PDF-specific resize path.
    expect(getPostResizeCapability(post('file'))).toBe('box');
  });

  it('an unrecognised type still exposes no resize capability', () => {
    expect(getPostResizeCapability(post('something-new'))).toBe('none');
  });
});

describe('PATCH POST-RESIZE-B1 constraints', () => {
  it('ai-component keeps its exact 200x150 production minimum', () => {
    expect(getPostResizeConstraints(post('ai-component'))).toEqual({ minWidth: 200, minHeight: 150 });
    expect(POST_RESIZE_CONSTRAINTS['ai-component']).toEqual({ minWidth: 200, minHeight: 150 });
  });

  it('image has a documented ergonomic minimum of 100x100', () => {
    expect(getPostResizeConstraints(post('image'))).toEqual({ minWidth: 100, minHeight: 100 });
  });

  it('B2: text/note 120x80, todo 160x100, link 240 wide, table 180 wide', () => {
    expect(getPostResizeConstraints(post('text'))).toEqual({ minWidth: 120, minHeight: 80 });
    expect(getPostResizeConstraints(post('note'))).toEqual({ minWidth: 120, minHeight: 80 });
    expect(getPostResizeConstraints(post('todo'))).toEqual({ minWidth: 160, minHeight: 100 });
    expect(getPostResizeConstraints(post('link'))).toEqual({ minWidth: 240, minHeight: 0 });
    expect(getPostResizeConstraints(post('table'))).toEqual({ minWidth: 180, minHeight: 0 });
  });

  it('B2: Document vs Clipart minima differ by the canonical svgUrl distinction', () => {
    expect(getPostResizeConstraints({ type: 'card', metadata: {} })).toEqual({ minWidth: 180, minHeight: 220 });
    expect(getPostResizeConstraints({ type: 'card', metadata: { svgUrl: '/x.svg' } })).toEqual({ minWidth: 100, minHeight: 100 });
  });

  it('types without constraints return null', () => {
    expect(getPostResizeConstraints(post('container'))).toBeNull();
    expect(getPostResizeConstraints(post('something-new'))).toBeNull();
  });

  it('PDF-C1: a file post carries the PDF placement minimum', () => {
    // Below this the card's own header controls wrap and the page viewport
    // shows almost nothing.
    expect(getPostResizeConstraints(post('file'))).toEqual({ minWidth: 180, minHeight: 160 });
  });
});

describe('PATCH POST-RESIZE-B1 legacy geometry detection', () => {
  it('28. a legacy Image (missing/invalid geometry) is NOT canonical-geometry', () => {
    expect(hasValidPostResizeGeometry(undefined, undefined)).toBe(false);
    expect(hasValidPostResizeGeometry(null, null)).toBe(false);
    expect(hasValidPostResizeGeometry(0, 0)).toBe(false);
    expect(hasValidPostResizeGeometry(Number.NaN, 300)).toBe(false);
    expect(hasValidPostResizeGeometry(360, -1)).toBe(false);
    expect(hasValidPostResizeGeometry('360', '220')).toBe(true);
  });

  it('BOTH dimensions must be finite positive for canonical rendering', () => {
    expect(hasValidPostResizeGeometry(360, 220)).toBe(true);
    expect(hasValidPostResizeGeometry(360, undefined)).toBe(false);
    expect(hasValidPostResizeGeometry(undefined, 220)).toBe(false);
  });
});

// PATCH POST-RESIZE-B1.1: the Phase 6 legacy Image compatibility fixture
// matrix (A-K). `hasValidPostResizeGeometry` alone (tested above) is
// deliberately insufficient for Image -- generic template dimensions like
// 300x200/280x350/300x400 are finite and positive but were never proof of
// intentional sizing (the pre-B1 renderer never consumed them, always
// rendering Images at a fixed 360px presentation). Only `isImageManuallySized`
// is the real Image compatibility gate.
function imagePost(overrides: Partial<Pick<Padlet, 'width' | 'height' | 'metadata'>>): Pick<Padlet, 'width' | 'height' | 'metadata'> {
  return { width: undefined as unknown as number, height: undefined as unknown as number, metadata: undefined, ...overrides };
}

describe('PATCH POST-RESIZE-B1.1 legacy Image compatibility fixture matrix', () => {
  it('A. width/height missing -> legacy', () => {
    expect(isImageManuallySized(imagePost({}))).toBe(false);
  });

  it('B. null/invalid width/height -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: null as unknown as number, height: null as unknown as number }))).toBe(false);
    expect(isImageManuallySized(imagePost({ width: Number.NaN, height: Number.NaN }))).toBe(false);
  });

  it('C. width only -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 300, metadata: { manualSize: true } }))).toBe(false);
  });

  it('D. height only -> legacy', () => {
    expect(isImageManuallySized(imagePost({ height: 200, metadata: { manualSize: true } }))).toBe(false);
  });

  it('E. generic 300x200 (no manualSize) -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 300, height: 200 }))).toBe(false);
  });

  it('F. generic 280x350 (no manualSize) -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 280, height: 350 }))).toBe(false);
  });

  it('G. generic 300x400 (no manualSize) -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 300, height: 400 }))).toBe(false);
  });

  it('H. arbitrary positive legacy dimensions (no manualSize) -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 917, height: 1203 }))).toBe(false);
  });

  it('I. valid dimensions + manualSize=false -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 640, height: 480, metadata: { manualSize: false } }))).toBe(false);
  });

  it('J. valid dimensions + manualSize missing -> legacy', () => {
    expect(isImageManuallySized(imagePost({ width: 640, height: 480 }))).toBe(false);
  });

  it('K. valid dimensions + manualSize=true -> canonical (explicit resize)', () => {
    expect(isImageManuallySized(imagePost({ width: 640, height: 480, metadata: { manualSize: true } }))).toBe(true);
  });

  it('manualSize=true WITHOUT valid geometry still stays legacy (marker alone is not enough)', () => {
    expect(isImageManuallySized(imagePost({ metadata: { manualSize: true } }))).toBe(false);
  });
});

// ============================================================ POST-RESIZE-B2
function notePost(width: number, height: number, metadata?: Record<string, unknown>): Padlet {
  return sized('text', width, height, metadata);
}

describe('PATCH POST-RESIZE-B2 marker-gated legacy/manual model', () => {
  it('13. legacy Note: generic stored dimensions WITHOUT manualSize are NOT manual', () => {
    expect(isManuallySizedPost(notePost(300, 200))).toBe(false);
    expect(isManuallySizedPost(notePost(280, 350))).toBe(false);
    expect(getManualResizeDimensions(notePost(300, 200))).toBeNull();
  });

  it('14. manual Note geometry (manualSize=true + valid dims) IS honored', () => {
    const manual = notePost(400, 300, { manualSize: true });
    expect(isManuallySizedPost(manual)).toBe(true);
    expect(getManualResizeDimensions(manual)).toEqual({ width: 400, height: 300 });
  });

  it('manual Note geometry clamps to the type minimum', () => {
    const tiny = notePost(50, 40, { manualSize: true });
    expect(getManualResizeDimensions(tiny)).toEqual({ width: 120, height: 80 });
  });

  it('15. legacy Todo generic dimensions ignored', () => {
    expect(isManuallySizedPost(sized('todo', 300, 400))).toBe(false);
  });

  it('16. manual Todo geometry honored', () => {
    expect(getManualResizeDimensions(sized('todo', 260, 180, { manualSize: true }))).toEqual({ width: 260, height: 180 });
  });

  it('17. legacy Link generic width ignored', () => {
    expect(isManuallySizedPost(sized('link', 500, 400))).toBe(false);
  });

  it('18. manual Link width honored (height untouched by horizontal-only resize)', () => {
    expect(getManualResizeDimensions(sized('link', 420, 300, { manualSize: true }))).toEqual({ width: 420, height: 300 });
  });

  it('19. legacy Table generic width ignored', () => {
    expect(isManuallySizedPost(sized('table', 400, 300))).toBe(false);
  });

  it('20. manual Table width honored', () => {
    expect(getManualResizeDimensions(sized('table', 340, 200, { manualSize: true }))).toEqual({ width: 340, height: 200 });
  });

  it('22/23. legacy Document canonical geometry behavior unchanged (marker NOT required)', () => {
    // Document/Clipart consumed canonical width/height BEFORE B2; the marker
    // must never gate their historical interpretation.
    const doc = sized('card', 640, 480);
    expect(getManualResizeDimensions(doc)).toBeNull(); // marker-gated helper stays out of the way
    expect(POST_RESIZE_CONSTRAINTS.document).toEqual({ minWidth: 180, minHeight: 220 });
  });

  it('24/25. legacy Clipart canonical geometry behavior unchanged (marker NOT required)', () => {
    const clipart = sized('card', 320, 240, { svgUrl: '/x.svg' });
    expect(getManualResizeDimensions(clipart)).toBeNull();
    expect(POST_RESIZE_CONSTRAINTS.clipart).toEqual({ minWidth: 100, minHeight: 100 });
  });

  it('21. zero load-time migration: a pure read never implies a write', () => {
    // The helper set is read-only; nothing here performs persistence.
    const manual = notePost(400, 300, { manualSize: true });
    expect(getManualResizeDimensions(manual)).toEqual({ width: 400, height: 300 });
  });
});
