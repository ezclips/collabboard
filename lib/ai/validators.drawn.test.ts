import { describe, expect, it } from 'vitest';

import { safeValidateStoredDiagramData, StoredDrawnDiagramSchema } from './validators';
import type { DrawnPicture } from './drawn/format';

const outline = {
  title: 'Launch plan',
  ordered: false,
  kind: 'steps',
  items: [{ label: 'Research' }, { label: 'Build' }, { label: 'Ship' }],
};

const picture: DrawnPicture = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [
    { id: 'a', type: 'rect', x: 10, y: 10, w: 120, h: 60, fill: '#aabbcc', stroke: '#000000' },
    { id: 'b', type: 'text', text: 'Hello', x: 16, y: 24, w: 100, size: 16, color: '#111111', in: 'a' },
  ],
};

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    type: 'diagram',
    subtype: 'drawn',
    title: 'Launch plan',
    renderer: 'drawn',
    kind: 'flowchart',
    seed: 4,
    outline,
    picture,
    ...overrides,
  };
}

describe('PATCH-284 drawn validation', () => {
  it('accepts a valid stored drawn envelope', () => {
    const result = StoredDrawnDiagramSchema.safeParse(envelope());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subtype).toBe('drawn');
      expect(result.data.picture.elements).toHaveLength(2);
    }
  });

  it('cleans a picture with more than 150 elements down to the cap', () => {
    const many: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: Array.from({ length: 151 }, (_, index) => ({
        id: `r${index}`,
        type: 'rect' as const,
        x: index,
        y: 0,
        w: 10,
        h: 10,
        fill: '#aabbcc',
        stroke: '#000000',
      })),
    };
    const result = StoredDrawnDiagramSchema.safeParse(envelope({ picture: many }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.picture.elements).toHaveLength(150);
  });

  it('drops an element with a bad colour instead of rejecting the post', () => {
    const result = StoredDrawnDiagramSchema.safeParse(
      envelope({
        picture: {
          ...picture,
          elements: [
            { id: 'bad', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: 'red', stroke: '#000000' },
            picture.elements[0],
          ],
        },
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.picture.elements.map((element) => element.id)).not.toContain('bad');
      expect(result.data.picture.elements).toHaveLength(1);
    }
  });

  it('drops an unknown icon instead of rejecting the post', () => {
    const result = StoredDrawnDiagramSchema.safeParse(
      envelope({
        picture: {
          ...picture,
          elements: [
            { id: 'icon', type: 'icon', name: 'not-a-real-icon', x: 0, y: 0, size: 24, color: '#123456' },
            picture.elements[0],
          ],
        },
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.picture.elements.map((element) => element.id)).toEqual(['a']);
  });

  it('treats a non-object picture as invalid content', () => {
    const result = safeValidateStoredDiagramData('drawn', envelope({ picture: 'nope' }));
    expect(result.success).toBe(false);
  });

  it('treats an empty picture as invalid content', () => {
    const result = safeValidateStoredDiagramData('drawn', envelope({ picture: { elements: [] } }));
    expect(result.success).toBe(false);
  });
});
