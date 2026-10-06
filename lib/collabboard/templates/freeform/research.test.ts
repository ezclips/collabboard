import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema, type TemplatePost } from '@/lib/domain/canvas/boardTemplates';
import { RESEARCH } from './research';

const ROOT = path.resolve(__dirname, '../../../..');
const ID = 'research';

const ofKind = <K extends TemplatePost['kind']>(kind: K) =>
  RESEARCH.posts.filter((post): post is Extract<TemplatePost, { kind: K }> => post.kind === kind);
const free = () => RESEARCH.posts.filter((post) => post.kind !== 'column' && post.parent === undefined);

describe('Research', () => {
  it('validates against the board template schema', () => {
    expect(boardTemplateSchema.safeParse(RESEARCH).success).toBe(true);
  });

  it('names itself, its layout, preview and the Board AI opening flag', () => {
    expect(RESEARCH.id).toBe(ID);
    expect(RESEARCH.name).toBe('Research');
    expect(RESEARCH.layout).toBe('freeform');
    expect(RESEARCH.previewUrl).toBe(`/templates/freeform/${ID}/preview.jpg`);
    expect(RESEARCH.openBoardAiAfterApply).toBe(true);
  });

  it('has the drop zone between the question and findings columns', () => {
    const upload = ofKind('upload');
    expect(upload).toHaveLength(1);
    expect(upload[0]).toMatchObject({ title: 'Upload your research', x: 470, y: 300, width: 560, height: 340 });
  });

  it('has two columns at width 360 with their children in order', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['question', 'findings']);
    expect(columns.map((column) => [column.x, column.width])).toEqual([
      [60, 360],
      [1080, 360],
    ]);
    const children = (key: string) =>
      RESEARCH.posts.filter((post) => post.kind !== 'column' && post.parent === key).map((post) => post.title);
    expect(children('question')).toEqual(['Question', 'Research question', 'Why it matters', 'Where the sources are']);
    expect(children('findings')).toEqual([
      'Findings',
      'Key findings',
      'Quotes and evidence',
      'Open questions',
      'Open questions',
    ]);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y])).toEqual([
      ['Read, mark, collect', 470, 60],
      ['Upload your research', 470, 300],
      ['Ask Board AI', 470, 670],
      ['Sources', 1490, 60],
      ['Taking notes', 1490, 310],
      ['Reading list', 1490, 640],
      ['Ask Board AI', 1700, 640],
    ]);
  });

  it('gives the Sources table three columns so "Year" is not cut off', () => {
    const table = RESEARCH.posts.find((post) => post.kind === 'table');
    if (!table || table.kind !== 'table') throw new Error('expected a table');
    expect(table.rows).toHaveLength(4);
    expect(table.rows[0]).toEqual(['Title', 'Author', 'Year']);
    expect(table.rows[1]).toEqual(['Your first PDF', '', '']);
    for (const row of table.rows) expect(row).toHaveLength(3);
  });

  it('references only assets that exist and are credited', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const files = credits.map((entry) => entry.file);
    for (const post of RESEARCH.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (!asset) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', asset)), `${asset} should exist`).toBe(true);
      expect(files).toContain(path.basename(asset));
    }
  });
});
