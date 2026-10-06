import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { CHARACTER_PROFILE } from './characterProfile';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'character-profile';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  CHARACTER_PROFILE.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => CHARACTER_PROFILE.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Character Profile', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(CHARACTER_PROFILE).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(CHARACTER_PROFILE.id).toBe(ID);
    expect(CHARACTER_PROFILE.name).toBe('Character Profile');
    expect(CHARACTER_PROFILE.layout).toBe('freeform');
    expect(CHARACTER_PROFILE.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['who', 'personality', 'world']);
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [460, 360],
      [860, 360],
    ]);
  });

  it('has the expected number of posts per kind', () => {
    expect(ofKind('column')).toHaveLength(3);
    expect(ofKind('image')).toHaveLength(5);
    expect(ofKind('note')).toHaveLength(3);
    expect(ofKind('clipart')).toHaveLength(4);
    expect(ofKind('todo')).toHaveLength(1);
    expect(ofKind('table')).toHaveLength(1);
  });

  it('lists each column\u2019s children in order', () => {
    const children = (key: string) =>
      CHARACTER_PROFILE.posts
        .filter((post) => post.kind !== 'column' && post.parent === key)
        .map((post) => post.title);
    expect(children('who')).toEqual(['Mara Quill, 34', 'At a glance', 'Navigator']);
    expect(children('personality')).toEqual(['Quick to laugh', 'Traits', 'Voice', 'Backstory']);
    expect(children('world')).toEqual([
      'Her charts',
      'The storm belt at dusk',
      'Festival day in Low Wick',
      'Places',
    ]);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Story beats', 1260, 60, 320, 260],
      ['Relationships', 1260, 360, 440, 200],
      ['Rivalries', 1620, 60, 180, 220],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of CHARACTER_PROFILE.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});
