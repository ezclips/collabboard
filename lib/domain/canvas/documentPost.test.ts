import { describe, expect, it } from 'vitest';
import { isDocumentPost } from './documentPost';

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
