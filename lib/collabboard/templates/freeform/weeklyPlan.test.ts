import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { WEEKLY_PLAN } from './weeklyPlan';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'weekly-plan';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  WEEKLY_PLAN.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => WEEKLY_PLAN.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Weekly Plan', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(WEEKLY_PLAN).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(WEEKLY_PLAN.id).toBe(ID);
    expect(WEEKLY_PLAN.name).toBe('Weekly Plan');
    expect(WEEKLY_PLAN.layout).toBe('freeform');
    expect(WEEKLY_PLAN.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['week', 'work', 'health']);
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
    expect(ofKind('todo')).toHaveLength(2);
    expect(ofKind('table')).toHaveLength(1);
  });

  it('lists each column\u2019s children in order', () => {
    const children = (key: string) =>
      WEEKLY_PLAN.posts
        .filter((post) => post.kind !== 'column' && post.parent === key)
        .map((post) => post.title);
    expect(children('week')).toEqual(['Plan on Sunday evening', 'Focus', 'Week 12']);
    expect(children('work')).toEqual(['Work', 'Notes', 'Reading']);
    expect(children('health')).toEqual(['Breakfast prep', 'Runs: Mon · Wed · Sat', '5 km', 'Meal plan']);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Meal plan', 1260, 60, 440, 260],
      ['Home', 1260, 360, 300, 240],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of WEEKLY_PLAN.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});
