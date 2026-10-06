import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { EVENT_PLAN } from './eventPlan';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'event-plan';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  EVENT_PLAN.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => EVENT_PLAN.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Event Plan', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(EVENT_PLAN).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(EVENT_PLAN.id).toBe(ID);
    expect(EVENT_PLAN.name).toBe('Event Plan');
    expect(EVENT_PLAN.layout).toBe('freeform');
    expect(EVENT_PLAN.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['party', 'food', 'todo']);
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
      EVENT_PLAN.posts
        .filter((post) => post.kind !== 'column' && post.parent === key)
        .map((post) => post.title);
    expect(children('party')).toEqual(['Lights on at eight', 'Summer garden party', "Let's celebrate"]);
    expect(children('food')).toEqual(['Sharing platters', 'One long table', 'Menu', 'Cake']);
    expect(children('todo')).toEqual(['Checklist', 'Playlist', 'Decorations']);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Budget', 1260, 60, 440, 260],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of EVENT_PLAN.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});

describe('Event Plan note titles', () => {
  it('prepends the note title to the body so the name is visible', () => {
    for (const title of ['Summer garden party', 'Menu']) {
      const note = EVENT_PLAN.posts.find((post) => post.kind === 'note' && post.title === title);
      const html = note && note.kind === 'note' ? note.html : '';
      expect(html.startsWith(`<p><strong>${title}</strong></p>`), title).toBe(true);
    }
  });
});
