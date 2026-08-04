import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { selectDocumentModalDestination } from './documentModalRoute';

const card = (metadata: Record<string, any> = {}) => ({ type: 'card' as const, metadata });
const note = { type: 'text' as const, metadata: {} };
const todo = { type: 'todo' as const, metadata: {} };
const link = { type: 'link' as const, metadata: {} };
const image = { type: 'image' as const, metadata: {} };

describe('selectDocumentModalDestination', () => {
  it('Document + editable capability -> document-editor', () => {
    expect(selectDocumentModalDestination(card(), true)).toBe('document-editor');
  });

  it('Document + read-only capability -> document-viewer', () => {
    expect(selectDocumentModalDestination(card(), false)).toBe('document-viewer');
  });

  it('clipart (svgUrl) -> null, editable', () => {
    expect(selectDocumentModalDestination(card({ svgUrl: 'x.svg' }), true)).toBeNull();
  });

  it('clipart (svgUrl) -> null, read-only', () => {
    expect(selectDocumentModalDestination(card({ svgUrl: 'x.svg' }), false)).toBeNull();
  });

  it('note -> null', () => {
    expect(selectDocumentModalDestination(note, true)).toBeNull();
  });

  it('todo -> null', () => {
    expect(selectDocumentModalDestination(todo, true)).toBeNull();
  });

  it('link -> null', () => {
    expect(selectDocumentModalDestination(link, true)).toBeNull();
  });

  it('image/embed/media -> null', () => {
    expect(selectDocumentModalDestination(image, true)).toBeNull();
  });

  it('null/undefined post -> null', () => {
    expect(selectDocumentModalDestination(null, true)).toBeNull();
    expect(selectDocumentModalDestination(undefined, true)).toBeNull();
  });

  it('a clipart-shaped Document carrying every other Document field still returns null', () => {
    const post = card({ svgUrl: 'x.svg', description: 'has content' });
    expect(selectDocumentModalDestination(post, true)).toBeNull();
    expect(selectDocumentModalDestination(post, false)).toBeNull();
  });

  it('recomputes fresh when svgUrl is added at runtime -- never caches a prior result', () => {
    const post = card();
    expect(selectDocumentModalDestination(post, true)).toBe('document-editor');
    const promoted = { ...post, metadata: { ...post.metadata, svgUrl: 'new.svg' } };
    expect(selectDocumentModalDestination(promoted, true)).toBeNull();
  });

  it('is deterministic and side-effect free', () => {
    const post = card();
    expect(selectDocumentModalDestination(post, true)).toBe(selectDocumentModalDestination(post, true));
  });
});

describe('documentModalRoute.ts: no second clipart discriminator', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/domain/canvas/documentModalRoute.ts'),
    'utf8',
  );

  it('never hard-codes svgUrl itself -- isDocumentPost is the only discriminator', () => {
    expect((source.match(/svgUrl/g) || []).length).toBe(0);
  });

  it('imports and reuses isDocumentPost and selectCardModalRoute, no re-inlined predicate', () => {
    expect(source).toContain("import { isDocumentPost } from './documentPost'");
    expect(source).toContain("import { selectCardModalRoute } from './cardModalRoute'");
    expect(source).toContain('isDocumentPost(post)');
    expect(source).toContain('selectCardModalRoute(canEditWorkspace)');
  });

  it('contains no React, state or persistence', () => {
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/useState|useEffect|useCallback/);
    expect(source).not.toMatch(/supabase|\.from\(/i);
  });
});
