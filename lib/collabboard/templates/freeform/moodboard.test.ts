import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { MOODBOARD } from './moodboard';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'moodboard';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  MOODBOARD.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => MOODBOARD.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Moodboard', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(MOODBOARD).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(MOODBOARD.id).toBe(ID);
    expect(MOODBOARD.name).toBe('Moodboard');
    expect(MOODBOARD.layout).toBe('freeform');
    expect(MOODBOARD.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['mood', 'textures', 'objects']);
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [460, 360],
      [860, 360],
    ]);
  });

  it('has the expected number of posts per kind', () => {
    expect(ofKind('column')).toHaveLength(3);
    expect(ofKind('image')).toHaveLength(7);
    expect(ofKind('note')).toHaveLength(2);
    expect(ofKind('clipart')).toHaveLength(4);
    expect(ofKind('todo')).toHaveLength(1);
    expect(ofKind('table')).toHaveLength(1);
  });

  it('lists each column\u2019s children in order', () => {
    const children = (key: string) =>
      MOODBOARD.posts.filter((post) => post.kind !== 'column' && post.parent === key).map((post) => post.title);
    expect(children('mood')).toEqual(['Evening light', 'Feeling', 'Candlelight', 'Soft layers']);
    expect(children('textures')).toEqual(['Washed linen', 'Jute rug', 'Materials', 'Little details']);
    expect(children('objects')).toEqual(['Blush vase', 'Clay collection', 'More green', 'Pampas by the window']);
  });

  it('places the free posts exactly', () => {
    const posts = free();
    expect(posts.map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Palette', 1260, 60, 440, 220],
      ['Shopping list', 1260, 320, 300, 260],
      ['Art wall', 1600, 320, 180, 220],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of MOODBOARD.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});
