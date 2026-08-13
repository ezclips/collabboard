import { describe, expect, it } from 'vitest';
import { isDocumentPost, resolveChildCardChrome } from './documentPost';

describe('isDocumentPost (PATCH-149B1a)', () => {
  it('classifies an ordinary card with no svgUrl as a Document', () => {
    expect(isDocumentPost({ type: 'card', metadata: {} })).toBe(true);
  });

  it('excludes a clipart card (has svgUrl)', () => {
    expect(isDocumentPost({ type: 'card', metadata: { svgUrl: '/x.svg' } })).toBe(false);
  });

  it('tolerates missing metadata and still classifies as a Document', () => {
    expect(isDocumentPost({ type: 'card', metadata: undefined })).toBe(true);
  });

  it('excludes a text/note post', () => {
    expect(isDocumentPost({ type: 'text', metadata: {} })).toBe(false);
  });

  it('excludes a todo post', () => {
    expect(isDocumentPost({ type: 'todo', metadata: {} })).toBe(false);
  });

  it('excludes a link post', () => {
    expect(isDocumentPost({ type: 'link', metadata: {} })).toBe(false);
  });

  it('excludes an image post', () => {
    expect(isDocumentPost({ type: 'image', metadata: {} })).toBe(false);
  });

  it('excludes a comment/embedded-media-style post', () => {
    expect(isDocumentPost({ type: 'comment', metadata: {} })).toBe(false);
    expect(isDocumentPost({ type: 'file', metadata: {} })).toBe(false);
  });

  it('is unaffected by geometry, title text, or labels', () => {
    const a = isDocumentPost({ type: 'card', metadata: {} });
    const b = isDocumentPost({ type: 'card', metadata: {} });
    expect(a).toBe(b);
    // The predicate takes only type/metadata — width, height and title are
    // not part of its signature, so they cannot influence the result.
  });

  it('is deterministic and side-effect free across repeated calls', () => {
    const post = { type: 'card' as const, metadata: { svgUrl: '/x.svg' } };
    const results = Array.from({ length: 5 }, () => isDocumentPost(post));
    expect(results.every((r) => r === false)).toBe(true);
    expect(post.metadata.svgUrl).toBe('/x.svg');
  });
});

describe('resolveChildCardChrome (PATCH 9D)', () => {
  it('a Document child reads its OWN backgroundColor/topStripColor fields -- not the generic cardColor/topStrip fields [matrix 5, 6]', () => {
    const doc = {
      type: 'card' as const,
      metadata: { backgroundColor: '#fee2e2', topStripColor: '#ef4444', cardColor: '#000000', topStrip: '#111111' },
    };
    expect(resolveChildCardChrome(doc)).toEqual({ backgroundColor: '#fee2e2', topStripColor: '#ef4444' });
  });

  it('a Document with no explicit color defaults exactly like root CardPreview (white background, indigo strip)', () => {
    const doc = { type: 'card' as const, metadata: {} };
    expect(resolveChildCardChrome(doc)).toEqual({ backgroundColor: '#ffffff', topStripColor: '#4f46e5' });
  });

  it('a Document with topStripColor explicitly "transparent" hides the strip, matching root', () => {
    const doc = { type: 'card' as const, metadata: { topStripColor: 'transparent' } };
    expect(resolveChildCardChrome(doc).topStripColor).toBeNull();
  });

  it('two differently-colored Documents resolve independently [matrix 7]', () => {
    const red = { type: 'card' as const, metadata: { backgroundColor: '#fee2e2', topStripColor: '#ef4444' } };
    const purple = { type: 'card' as const, metadata: { backgroundColor: '#f3e8ff', topStripColor: '#a855f7' } };
    expect(resolveChildCardChrome(red).topStripColor).toBe('#ef4444');
    expect(resolveChildCardChrome(purple).topStripColor).toBe('#a855f7');
  });

  it('a non-Document child (e.g. Note) still uses the generic cardColor/topStrip fields, unaffected by this patch', () => {
    const note = { type: 'text' as const, metadata: { cardColor: '#fbbf24', topStrip: '#f97316', backgroundColor: '#fee2e2', topStripColor: '#ef4444' } };
    expect(resolveChildCardChrome(note)).toEqual({ backgroundColor: '#fbbf24', topStripColor: '#f97316' });
  });

  it('a non-Document child with no topStrip set has no stripe -- no invented default (Document-only default) [matrix 9]', () => {
    const note = { type: 'text' as const, metadata: {} };
    expect(resolveChildCardChrome(note)).toEqual({ backgroundColor: '#ffffff', topStripColor: null });
  });

  it('a Clipart card (has svgUrl) is excluded from the Document branch, using generic fields', () => {
    const clipart = { type: 'card' as const, metadata: { svgUrl: '/x.svg', cardColor: '#e0f2fe', backgroundColor: '#000000' } };
    expect(resolveChildCardChrome(clipart)).toEqual({ backgroundColor: '#e0f2fe', topStripColor: null });
  });
});
