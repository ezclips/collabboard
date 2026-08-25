import { describe, expect, it } from 'vitest';
import {
  isPersistedCanvasPostVisible,
  type PersistedCanvasPostVisibilityInput,
} from './postHydrationVisibility';

const post = (
  type: string,
  title: string | null | undefined,
  content: string | null | undefined,
): PersistedCanvasPostVisibilityInput => ({ type, title, content });

describe('ENG-CANVAS-HYDRATION-H1: a meaningful title alone keeps a persisted post', () => {
  it('A: text + meaningful title + empty content -> KEEP', () => {
    expect(isPersistedCanvasPostVisible(post('text', 'Sammelmappe1.pdf', ''))).toBe(true);
  });

  it('B: note + meaningful title + empty content -> KEEP', () => {
    expect(isPersistedCanvasPostVisible(post('note', 'Reading notes', ''))).toBe(true);
  });

  it('C: text + meaningful title + whitespace content -> KEEP', () => {
    expect(isPersistedCanvasPostVisible(post('text', 'Reading notes', '   \n\t '))).toBe(true);
  });

  it('D: text + meaningful title + <p>&nbsp;</p> -> KEEP', () => {
    expect(isPersistedCanvasPostVisible(post('text', 'Reading notes', '<p>&nbsp;</p>'))).toBe(true);
  });
});

describe('ENG-CANVAS-HYDRATION-H1: a meaningful body alone still keeps a persisted post', () => {
  it('E: note + empty title + meaningful content -> KEEP', () => {
    expect(isPersistedCanvasPostVisible(post('note', '', '<p>Real body</p>'))).toBe(true);
  });

  it('F: text + whitespace title + meaningful content -> KEEP', () => {
    expect(isPersistedCanvasPostVisible(post('text', '   ', 'Real body'))).toBe(true);
  });

  it('body cleanup semantics are unchanged: entities alone are not a body', () => {
    expect(isPersistedCanvasPostVisible(post('note', '', '&nbsp;&#160;'))).toBe(false);
    expect(isPersistedCanvasPostVisible(post('note', '', '<p>&#160;x</p>'))).toBe(true);
  });
});

describe('ENG-CANVAS-HYDRATION-H1: ghost cleanup is preserved', () => {
  it('G: note + empty title + empty content -> FILTER', () => {
    expect(isPersistedCanvasPostVisible(post('note', '', ''))).toBe(false);
  });

  it('H: text + whitespace title + whitespace content -> FILTER', () => {
    expect(isPersistedCanvasPostVisible(post('text', '   ', '  \n '))).toBe(false);
  });

  it('I: note + whitespace title + <p>&nbsp;</p> -> FILTER', () => {
    expect(isPersistedCanvasPostVisible(post('note', '   ', '<p>&nbsp;</p>'))).toBe(false);
  });

  it('null/undefined title and body are not meaningful', () => {
    expect(isPersistedCanvasPostVisible(post('text', null, null))).toBe(false);
    expect(isPersistedCanvasPostVisible(post('note', undefined, undefined))).toBe(false);
  });
});

describe('ENG-CANVAS-HYDRATION-H1: non-note/text types are untouched', () => {
  it('J: a blank non-note/text post still hydrates', () => {
    for (const type of ['image', 'file', 'table', 'link', 'todo', 'container', 'comment', 'drawing', 'card', 'ai-component', 'section_heading']) {
      expect(isPersistedCanvasPostVisible(post(type, '', ''))).toBe(true);
    }
  });
});

describe('ENG-CANVAS-HYDRATION-H1: the P6J-F6-B4-RUNTIME-1 regression fixture', () => {
  // The exact persisted row that vanished on reload: a Knowledge-authored
  // source Note, title only, no layer-order field of any kind.
  const runtimeRegressionRow = { type: 'text', title: 'Sammelmappe1.pdf', content: '' };

  it('K: it hydrates, and it carries no presentation fields at all', () => {
    expect(Object.keys(runtimeRegressionRow)).toEqual(['type', 'title', 'content']);
    expect(isPersistedCanvasPostVisible(runtimeRegressionRow)).toBe(true);
  });

  it('the decision reads type/title/content and nothing else', () => {
    // Negative control with teeth: any other property access throws, so a
    // visibility rule that consulted layer order could not return at all.
    const allowed = new Set(['type', 'title', 'content']);
    const guarded = new Proxy(runtimeRegressionRow as Record<string, unknown>, {
      get(target, key) {
        if (typeof key === 'string' && !allowed.has(key)) {
          throw new Error(`postHydrationVisibility read a forbidden field: ${key}`);
        }
        return target[key as string];
      },
    }) as unknown as PersistedCanvasPostVisibilityInput;
    expect(isPersistedCanvasPostVisible(guarded)).toBe(true);
  });

  it('the same row decides identically whatever presentation fields accompany it', () => {
    const withLayerOrder = { ...runtimeRegressionRow, metadata: { zIndex: 12 } };
    const withoutAny = { ...runtimeRegressionRow };
    expect(isPersistedCanvasPostVisible(withLayerOrder)).toBe(
      isPersistedCanvasPostVisible(withoutAny),
    );
    expect(isPersistedCanvasPostVisible(withLayerOrder)).toBe(true);
  });
});

describe('ENG-CANVAS-HYDRATION-H1: the decision is pure', () => {
  it('L: the input object is not mutated', () => {
    const input = { type: 'text', title: 'Sammelmappe1.pdf', content: '<p>&nbsp;</p>' };
    const before = JSON.stringify(input);
    isPersistedCanvasPostVisible(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('a frozen input is accepted', () => {
    const frozen = Object.freeze({ type: 'note', title: 'Titled', content: '' });
    expect(isPersistedCanvasPostVisible(frozen)).toBe(true);
    expect(Object.isFrozen(frozen)).toBe(true);
  });
});
