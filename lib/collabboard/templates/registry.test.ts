import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATE_GROUPS, templatesForLayout } from './registry';

const ROOT = path.resolve(__dirname, '../../..');

describe('templatesForLayout', () => {
  it('returns the freeform group with its label and the Project Plan', () => {
    const group = templatesForLayout('freeform');
    expect(group).not.toBeNull();
    expect(group?.label).toBe('Freeform canvas');
    expect(group?.templates.map((template) => template.id)).toContain('project-plan');
  });

  it('lists the eight finished templates in order', () => {
    const group = templatesForLayout('freeform');
    expect(group?.templates.map((template) => template.id)).toEqual([
      'project-plan',
      'moodboard',
      'creative-brief',
      'character-profile',
      'weekly-plan',
      'trip-planner',
      'event-plan',
      'product-launch',
    ]);
  });

  it('has unique template ids and names', () => {
    const group = templatesForLayout('freeform');
    const ids = group?.templates.map((template) => template.id) ?? [];
    const names = group?.templates.map((template) => template.name) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('returns null for a layout with no group', () => {
    expect(templatesForLayout('kanban')).toBeNull();
  });
});

describe('layout groups', () => {
  it('lists every group in order with its label', () => {
    expect(BOARD_TEMPLATE_GROUPS.map((group) => group.layout)).toEqual([
      'freeform',
      'columns',
      'grid',
      'wall',
      'map',
      'timeline',
    ]);
    expect(BOARD_TEMPLATE_GROUPS.map((group) => group.label)).toEqual([
      'Freeform canvas',
      'Columns canvas',
      'Grid canvas',
      'Wall canvas',
      'Map canvas',
      'Timeline canvas',
    ]);
  });

  it('lists the two templates in each new group, in order', () => {
    expect(templatesForLayout('columns')?.templates.map((template) => template.id)).toEqual([
      'brainstorming',
      'frogs-and-toads',
    ]);
    expect(templatesForLayout('grid')?.templates.map((template) => template.id)).toEqual([
      'science-vocabulary',
      'book-reviews',
    ]);
    expect(templatesForLayout('wall')?.templates.map((template) => template.id)).toEqual([
      'birthday-wall',
      'art-gallery',
    ]);
    expect(templatesForLayout('map')?.templates.map((template) => template.id)).toEqual([
      'world-volcanoes',
      'traditions-around-the-world',
    ]);
    expect(templatesForLayout('timeline')?.templates.map((template) => template.id)).toEqual([
      'history-of-flight',
      'marie-curie',
    ]);
  });
});

describe('template assets', () => {
  for (const group of BOARD_TEMPLATE_GROUPS) {
    for (const template of group.templates) {
      for (const post of template.posts) {
        const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
        if (!asset) continue;

        it(`${template.id} references ${asset}, which exists and is credited`, () => {
          const filePath = path.join(ROOT, 'public', asset);
          expect(fs.existsSync(filePath), `${asset} should exist under public/`).toBe(true);

          const folder = path.dirname(filePath);
          const creditsPath = path.join(folder, 'credits.json');
          expect(fs.existsSync(creditsPath), `credits.json should exist in ${folder}`).toBe(true);
          const credits = JSON.parse(fs.readFileSync(creditsPath, 'utf8')) as Array<{ file: string }>;
          expect(credits.map((entry) => entry.file)).toContain(path.basename(asset));
        });
      }
    }
  }
});

describe('template previews', () => {
  for (const group of BOARD_TEMPLATE_GROUPS) {
    for (const template of group.templates) {
      it(`${template.id} has a previewUrl whose file exists and is credited`, () => {
        const preview = template.previewUrl;
        expect(preview).toBe(`/templates/${group.layout}/${template.id}/preview.jpg`);
        if (!preview) throw new Error('expected a previewUrl');
        const filePath = path.join(ROOT, 'public', preview);
        expect(fs.existsSync(filePath), `${preview} should exist under public/`).toBe(true);
        const credits = JSON.parse(
          fs.readFileSync(path.join(path.dirname(filePath), 'credits.json'), 'utf8'),
        ) as Array<{ file: string }>;
        expect(credits.map((entry) => entry.file)).toContain('preview.jpg');
      });
    }
  }
});
