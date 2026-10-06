import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { PRODUCT_LAUNCH } from './productLaunch';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'product-launch';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  PRODUCT_LAUNCH.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => PRODUCT_LAUNCH.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Product Launch', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(PRODUCT_LAUNCH).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(PRODUCT_LAUNCH.id).toBe(ID);
    expect(PRODUCT_LAUNCH.name).toBe('Product Launch');
    expect(PRODUCT_LAUNCH.layout).toBe('freeform');
    expect(PRODUCT_LAUNCH.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['product', 'plan', 'goals']);
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [460, 360],
      [860, 360],
    ]);
  });

  it('has the expected number of posts per kind', () => {
    expect(ofKind('column')).toHaveLength(3);
    expect(ofKind('image')).toHaveLength(3);
    expect(ofKind('note')).toHaveLength(2);
    expect(ofKind('clipart')).toHaveLength(4);
    expect(ofKind('todo')).toHaveLength(1);
    expect(ofKind('table')).toHaveLength(1);
  });

  it('lists each column\u2019s children in order', () => {
    const children = (key: string) =>
      PRODUCT_LAUNCH.posts
        .filter((post) => post.kind !== 'column' && post.parent === key)
        .map((post) => post.title);
    expect(children('product')).toEqual(['Hydra, in four colours', 'What it is', 'Hydra']);
    expect(children('plan')).toEqual(['Launch workshop', 'Launch checklist', 'Press']);
    expect(children('goals')).toEqual(['Hero shot', 'Targets', 'Sales', 'Launch day']);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Timeline', 1260, 60, 440, 260],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of PRODUCT_LAUNCH.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});
