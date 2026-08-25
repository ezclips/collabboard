import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const hookSrc = read('components/collabboard/canvas/hooks/useCanvasData.ts');
const helperSrc = read('lib/domain/canvas/postHydrationVisibility.ts');

// Comments must never be able to satisfy these guards (a comment-only match is
// how a rewired-away predicate would pass unnoticed).
const codeOf = (src: string) => src.replace(/^\s*\/\/.*$/gm, '');
const hookCode = codeOf(hookSrc);
const helperCode = codeOf(helperSrc);

describe('ENG-CANVAS-HYDRATION-H1: useCanvasData delegates hydration visibility to the domain helper', () => {
  it('imports the helper from the domain module', () => {
    expect(hookCode).toContain(
      "import { isPersistedCanvasPostVisible } from '@/lib/domain/canvas/postHydrationVisibility';",
    );
  });

  it('the hydrated padlet filter is the helper itself, applied once', () => {
    expect(hookCode).toContain('setPadlets(nextPadlets.filter(isPersistedCanvasPostVisible));');
    expect((hookCode.match(/isPersistedCanvasPostVisible/g) || []).length).toBe(2); // import + call
  });

  it('the old inline content-only predicate is no longer the authority', () => {
    // The stripping expressions that formed the removed inline predicate.
    expect(hookCode).not.toContain('&#160;');
    expect(hookCode).not.toMatch(/strippedContent|hasContent|validPadlets/);
    expect(hookCode).not.toMatch(/replace\(\/<\[\^>\]\*>\/g/);
    // No surviving hand-rolled note/text visibility branch.
    expect(hookCode).not.toMatch(/p\.type === 'note' \|\| p\.type === 'text'/);
  });
});

describe('ENG-CANVAS-HYDRATION-H1: the helper stays pure and presentation-independent', () => {
  it('no React, Supabase, browser globals, network or mutation', () => {
    expect(helperCode).not.toMatch(/from 'react'|useState|useEffect|useMemo|useCallback/);
    expect(helperCode).not.toMatch(/supabase|fetch\(|window\.|document\./i);
    expect(helperCode).not.toMatch(/\.push\(|\.splice\(|\.sort\(|=\s*[a-z]+\.\w+\s*=/);
  });

  it('layer ordering is not part of the visibility decision', () => {
    expect(helperCode).not.toMatch(/\.zIndex|zIndex:|\.metadata|metadata\?/);
  });

  it('its input type exposes only type/title/content', () => {
    const start = helperSrc.indexOf('export interface PersistedCanvasPostVisibilityInput');
    const body = helperSrc.slice(start, helperSrc.indexOf('}', start));
    const fields = Array.from(body.matchAll(/readonly (\w+)/g)).map((m) => m[1]);
    expect(fields).toEqual(['type', 'title', 'content']);
  });
});

describe('ENG-CANVAS-HYDRATION-H1: scope boundary', () => {
  it('this correction touched hydration only -- no z-index migration, no Knowledge coupling', () => {
    // Code shapes only -- the helper's prose explains WHICH flow authors
    // title-only posts, and rewording documentation must never be the way a
    // guard is satisfied.
    expect(helperCode).not.toMatch(/from '@\/lib\/(domain|infra)\/knowledge|sourceReference|padletIds/);
    expect(hookCode).not.toMatch(/normalizeZIndexes|zIndexMigrationDoneRef/);
  });
});
