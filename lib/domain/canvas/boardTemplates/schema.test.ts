import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATE_GROUPS } from '@/lib/collabboard/templates/registry';
import { boardTemplateSchema } from './schema';

/**
 * PATCH-301. Every registered template now carries its own words so the new
 * board gallery can describe it without a lookup table.
 */
describe('boardTemplateSchema summary and contents', () => {
  const templates = BOARD_TEMPLATE_GROUPS.flatMap((group) => group.templates);

  it('registers all eighteen templates', () => {
    expect(templates).toHaveLength(18);
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
