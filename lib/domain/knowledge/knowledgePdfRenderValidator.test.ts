import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_PDF_RENDERER_VERSION,
  knowledgeETagMatches,
  knowledgePageImageETag,
  knowledgePagesETag,
} from './knowledgePdfRenderPolicy';

const SHA = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('33,34,35. the validator is built from server identity alone', () => {
  it('33. different source bytes are a different representation', () => {
    expect(knowledgePageImageETag(SHA, 1)).not.toBe(knowledgePageImageETag(OTHER, 1));
  });

  it('34. different pages are different representations', () => {
    expect(knowledgePageImageETag(SHA, 1)).not.toBe(knowledgePageImageETag(SHA, 2));
  });

  it('35. the renderer version is part of it', () => {
    const current = knowledgePageImageETag(SHA, 1);
    expect(current).toBe(knowledgePageImageETag(SHA, 1, KNOWLEDGE_PDF_RENDERER_VERSION));
    // Bumping the renderer invalidates every cached page without a purge.
    expect(current).not.toBe(knowledgePageImageETag(SHA, 1, '2'));
  });

  it('is a syntactically valid strong ETag', () => {
    const etag = knowledgePageImageETag(SHA, 7)!;
    expect(etag.startsWith('"')).toBe(true);
    expect(etag.endsWith('"')).toBe(true);
    // Nothing inside may need escaping, which is why the inputs are validated
    // rather than sanitised.
    expect(etag.slice(1, -1)).not.toContain('"');
    expect(etag).toBe(`"${SHA}:7:${KNOWLEDGE_PDF_RENDERER_VERSION}"`);
  });

  it('refuses to build a validator from anything unverified', () => {
    for (const bad of ['', 'not-a-hash', `${SHA}extra`, 'zz'.repeat(32)]) {
      expect(knowledgePageImageETag(bad, 1), bad).toBeNull();
    }
    for (const page of [0, -1, 1.5, Number.NaN]) {
      expect(knowledgePageImageETag(SHA, page), String(page)).toBeNull();
    }
    // A version with quote or comma characters could break the header.
    for (const version of ['1"2', 'a,b', '', 'x'.repeat(40)]) {
      expect(knowledgePageImageETag(SHA, 1, version), version).toBeNull();
    }
  });
});

describe('37. the pages validator tracks the same bytes', () => {
  it('changes with the hash and with the page count', () => {
    expect(knowledgePagesETag(SHA, 3)).not.toBe(knowledgePagesETag(OTHER, 3));
    expect(knowledgePagesETag(SHA, 3)).not.toBe(knowledgePagesETag(SHA, 4));
    // A document whose count is not yet known is its own distinct state.
    expect(knowledgePagesETag(SHA, null)).not.toBe(knowledgePagesETag(SHA, 0));
  });

  it('is distinct from an image validator for the same document', () => {
    expect(knowledgePagesETag(SHA, 1)).not.toBe(knowledgePageImageETag(SHA, 1));
  });
});

describe('30. conditional matching follows the header grammar', () => {
  const etag = knowledgePageImageETag(SHA, 1)!;

  it('matches the exact validator, in a list, and in weak form', () => {
    expect(knowledgeETagMatches(etag, etag)).toBe(true);
    expect(knowledgeETagMatches(`"other", ${etag}`, etag)).toBe(true);
    expect(knowledgeETagMatches(`W/${etag}`, etag)).toBe(true);
  });

  it('does not match a different or absent validator', () => {
    expect(knowledgeETagMatches(null, etag)).toBe(false);
    expect(knowledgeETagMatches('', etag)).toBe(false);
    expect(knowledgeETagMatches(knowledgePageImageETag(SHA, 2)!, etag)).toBe(false);
    // A bare hash without quotes is not this representation.
    expect(knowledgeETagMatches(SHA, etag)).toBe(false);
  });

  it('treats a wildcard as no match, because it asks a different question', () => {
    // `*` means "if any representation exists" -- a precondition, not the
    // revalidation this serves. Honouring it would 304 a deleted derivative.
    expect(knowledgeETagMatches('*', etag)).toBe(false);
  });
});
