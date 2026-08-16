import { describe, expect, it } from 'vitest';
import {
  POST_RESIZE_CONSTRAINTS,
  getPostResizeCapability,
  getPostResizeConstraints,
  hasValidPostResizeGeometry,
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
