import { describe, expect, it } from 'vitest';
import {
  POST_RESIZE_CONSTRAINTS,
  getPostResizeCapability,
  getPostResizeConstraints,
  hasValidPostResizeGeometry,
  isImageManuallySized,
} from '@/lib/domain/canvas/postResizePolicy';
import type { Padlet } from '@/types/collabboard';

function post(type: string): Pick<Padlet, 'type'> {
  return { type: type as Padlet['type'] };
}

describe('PATCH POST-RESIZE-B1 capability matrix', () => {
  it('1. image -> box', () => {
    expect(getPostResizeCapability(post('image'))).toBe('box');
  });

  it('2. ai-component -> box', () => {
    expect(getPostResizeCapability(post('ai-component'))).toBe('box');
  });

  it('3. section_heading remains SPECIAL horizontal-only', () => {
    expect(getPostResizeCapability(post('section_heading'))).toBe('horizontal-only');
  });

  it('4-11. B1 exposes nothing else: note/todo/link/document/table/clipart/container/comment -> none', () => {
    const none: Array<[string, string]> = [
      ['4', 'text'],
      ['4b', 'note'],
      ['5', 'todo'],
      ['6', 'link'],
      ['7', 'card'],
      ['8', 'table'],
      ['9', 'file'],
      ['10', 'container'],
      ['11', 'comment'],
    ];
    for (const [label, type] of none) {
      expect(getPostResizeCapability(post(type)), `${label} ${type}`).toBe('none');
    }
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

  it('types without constraints return null', () => {
    expect(getPostResizeConstraints(post('todo'))).toBeNull();
    expect(getPostResizeConstraints(post('text'))).toBeNull();
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
