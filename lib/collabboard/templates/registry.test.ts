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

  it('returns null for a layout with no group', () => {
    expect(templatesForLayout('wall')).toBeNull();
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
