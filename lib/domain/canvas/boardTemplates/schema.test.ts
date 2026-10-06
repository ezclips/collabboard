import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATE_GROUPS } from '@/lib/collabboard/templates/registry';
import { boardTemplateSchema } from './schema';

/**
 * PATCH-301. Every registered template now carries its own words so the new
 * board gallery can describe it without a lookup table.
 */
describe('boardTemplateSchema summary and contents', () => {
  const templates = BOARD_TEMPLATE_GROUPS.flatMap((group) => group.templates);

  it('registers all nineteen templates', () => {
    expect(templates).toHaveLength(19);
  });

  for (const template of templates) {
    it(`${template.id} has a non-empty summary and contents`, () => {
      expect(template.summary?.trim().length ?? 0).toBeGreaterThan(0);
      expect(template.contents?.length ?? 0).toBeGreaterThan(0);
      for (const item of template.contents ?? []) {
        expect(item.trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('still accepts every registered template', () => {
    for (const template of templates) {
      expect(boardTemplateSchema.safeParse(template).success, template.id).toBe(true);
    }
  });

  it('accepts a template without summary or contents', () => {
    const bare = { id: 'bare', name: 'Bare', layout: 'freeform' as const, posts: [] };
    expect(boardTemplateSchema.safeParse(bare).success).toBe(true);
  });
});

describe('boardTemplateSchema upload posts (PATCH-302)', () => {
  const UPLOAD = {
    kind: 'upload' as const,
    title: 'Upload your research',
    html: '<p>Drop a PDF here.</p>',
    x: 470,
    y: 300,
    width: 560,
    height: 340,
  };
  const freeformWith = (posts: unknown[]) => ({ id: 'x', name: 'X', layout: 'freeform' as const, posts });
  const column = { kind: 'column', key: 'c', title: 'C', x: 0, y: 0, width: 100 };

  it('accepts an upload post at freeform root', () => {
    expect(boardTemplateSchema.safeParse(freeformWith([UPLOAD])).success).toBe(true);
  });

  it('rejects an upload post in another layout', () => {
    const columns = {
      id: 'x',
      name: 'X',
      layout: 'columns' as const,
      posts: [{ kind: 'section', key: 's', title: 'S' }, { ...UPLOAD, section: 's' }],
    };
    expect(boardTemplateSchema.safeParse(columns).success).toBe(false);
  });

  it('rejects an upload post with a parent', () => {
    expect(boardTemplateSchema.safeParse(freeformWith([column, { ...UPLOAD, parent: 'c' }])).success).toBe(false);
  });

  it('rejects a second upload post', () => {
    expect(boardTemplateSchema.safeParse(freeformWith([UPLOAD, { ...UPLOAD, x: 1, y: 1 }])).success).toBe(false);
  });

  it('accepts openBoardAiAfterApply on a template', () => {
    expect(boardTemplateSchema.safeParse({ ...freeformWith([]), openBoardAiAfterApply: true }).success).toBe(true);
  });
});
