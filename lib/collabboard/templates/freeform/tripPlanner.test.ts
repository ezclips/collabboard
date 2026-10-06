import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { TRIP_PLANNER } from './tripPlanner';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'trip-planner';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  TRIP_PLANNER.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => TRIP_PLANNER.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Trip Planner', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(TRIP_PLANNER).success).toBe(true);
  });

  it('names itself and its layout', () => {
    expect(TRIP_PLANNER.id).toBe(ID);
    expect(TRIP_PLANNER.name).toBe('Trip Planner');
    expect(TRIP_PLANNER.layout).toBe('freeform');
    expect(TRIP_PLANNER.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
  });

  it('has three columns at width 360 at x 60 / 460 / 860', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['plan', 'see', 'eat']);
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [460, 360],
      [860, 360],
    ]);
  });

  it('has the expected number of posts per kind', () => {
    expect(ofKind('column')).toHaveLength(3);
    expect(ofKind('image')).toHaveLength(3);
    expect(ofKind('note')).toHaveLength(3);
    expect(ofKind('clipart')).toHaveLength(4);
    expect(ofKind('todo')).toHaveLength(1);
    expect(ofKind('table')).toHaveLength(1);
  });

  it('lists each column\u2019s children in order', () => {
    const children = (key: string) =>
      TRIP_PLANNER.posts
        .filter((post) => post.kind !== 'column' && post.parent === key)
        .map((post) => post.title);
    expect(children('plan')).toEqual(['Tram 28', 'Five days in Lisbon', 'Flights', 'Before we go']);
    expect(children('see')).toEqual(['Sunset at a miradouro', 'Must-sees', 'Photo spots', 'Tram routes']);
    expect(children('eat')).toEqual(['Pastéis de nata, still warm', 'Try']);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y, post.width, post.height])).toEqual([
      ['Itinerary', 1260, 60, 520, 260],
      ['Packing list', 1260, 360, 180, 220],
    ]);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of TRIP_PLANNER.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});

describe('Trip Planner note titles', () => {
  it('prepends the note title to the body so the name is visible', () => {
    for (const title of ['Five days in Lisbon', 'Must-sees', 'Try']) {
      const note = TRIP_PLANNER.posts.find((post) => post.kind === 'note' && post.title === title);
      const html = note && note.kind === 'note' ? note.html : '';
      expect(html.startsWith(`<p><strong>${title}</strong></p>`), title).toBe(true);
    }
  });
});
