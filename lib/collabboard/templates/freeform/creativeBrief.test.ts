import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { CREATIVE_BRIEF } from './creativeBrief';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'creative-brief';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  CREATIVE_BRIEF.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => CREATIVE_BRIEF.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Creative Brief', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(CREATIVE_BRIEF).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(CREATIVE_BRIEF.id).toBe(ID);
    expect(CREATIVE_BRIEF.name).toBe('Creative Brief');
    expect(CREATIVE_BRIEF.layout).toBe('freeform');
    expect(CREATIVE_BRIEF.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['brief', 'visual', 'moments']);
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [460, 360],
      [860, 360],
    ]);
  });

  it('has the expected number of posts per kind', () => {
    expect(ofKind('column')).toHaveLength(3);
    expect(ofKind('image')).toHaveLength(4);
    expect(ofKind('note')).toHaveLength(4);
    expect(ofKind('clipart')).toHaveLength(4);
    expect(ofKind('todo')).toHaveLength(1);
    expect(ofKind('table')).toHaveLength(1);
  });

  it('lists each column\u2019s children in order', () => {
    const children = (key: string) =>
      CREATIVE_BRIEF.posts
        .filter((post) => post.kind !== 'column' && post.parent === key)
        .map((post) => post.title);
    expect(children('brief')).toEqual(['Lumen Bikes · Spring campaign', 'Key message', 'Message', 'Deliverables']);
    expect(children('visual')).toEqual([
      'Real commuters, real streets',
      'Motion, not studio',
      'Tone',
      'Idea',
    ]);
    expect(children('moments')).toEqual(['The ride home', 'Built-in lights', 'Mandatories', 'Timeline']);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Timeline', 1260, 60, 440, 260],
      ['Lumen City', 1260, 360, 180, 220],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of CREATIVE_BRIEF.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});

describe('Creative Brief note titles', () => {
  it('prepends the note title to the body so the name is visible', () => {
    for (const title of ['Lumen Bikes · Spring campaign', 'Tone', 'Mandatories']) {
      const note = CREATIVE_BRIEF.posts.find((post) => post.kind === 'note' && post.title === title);
      const html = note && note.kind === 'note' ? note.html : '';
      expect(html.startsWith(`<p><strong>${title}</strong></p>`), title).toBe(true);
    }
  });
});
