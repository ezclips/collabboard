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

  it('has two columns at width 360 and height 1100 with their children in order', () => {
    const columns = ofKind('column');
    expect(columns.map((column) => column.key)).toEqual(['question', 'findings']);
    expect(columns.map((column) => [column.x, column.width, column.height])).toEqual([
      [60, 360, 1100],
      [1080, 360, 1100],
    ]);
    const children = (key: string) =>
      RESEARCH.posts.filter((post) => post.kind !== 'column' && post.parent === key).map((post) => post.title);
    expect(children('question')).toEqual(['Question', 'Research question', 'Why it matters', 'Where the sources are']);
    const findings = children('findings');
    expect(findings.slice(-1)).toEqual(['Sources']);
    expect(findings).toEqual([
      'Findings',
      'Key findings',
      'Quotes and evidence',
      'Open questions',
      'Open questions',
      'Sources',
    ]);
  });

  it('places the free posts exactly', () => {
    expect(free().map((post) => [post.title, post.x, post.y])).toEqual([
      ['Read, mark, collect', 470, 60],
      ['Upload your research', 470, 300],
      ['Read it beside your board', 470, 670],
      ['Ask Board AI, keep it in the wiki', 470, 930],
    ]);
  });

  it('leaves the strip under the Board AI panel free', () => {
    for (const post of RESEARCH.posts) {
      if (post.x !== undefined) expect(post.x).toBeLessThan(1440);
    }
    for (const post of free()) {
      expect((post.x ?? 0) + (post.width ?? 0)).toBeLessThanOrEqual(1440);
    }
  });

  it('gives the Sources table three columns so "Year" is not cut off', () => {
    const table = RESEARCH.posts.find((post) => post.kind === 'table');
    if (!table || table.kind !== 'table') throw new Error('expected a table');
    expect(table.rows).toHaveLength(4);
    expect(table.rows[0]).toEqual(['Title', 'Author', 'Year']);
    expect(table.rows[1]).toEqual(['Your first PDF', '', '']);
    for (const row of table.rows) expect(row).toHaveLength(3);
  });

  it('explains the reading workflow and the Board Wiki', () => {
    const reading = RESEARCH.posts.find((post) => post.kind === 'note' && post.title === 'Read it beside your board');
    if (!reading || reading.kind !== 'note') throw new Error('expected the reading note');
    expect(reading.html).toContain('Save as Note');
    expect(reading.html).toContain('Create Note from area');
    expect(reading.html).toContain('Add to side panel');
    expect(reading.html).toContain('Select area');

    const wiki = RESEARCH.posts.find(
      (post) => post.kind === 'note' && post.title === 'Ask Board AI, keep it in the wiki',
    );
    if (!wiki || wiki.kind !== 'note') throw new Error('expected the Board AI note');
    expect(wiki.html).toContain('Board Wiki');
    expect(wiki.html).toContain('Save to wiki');
  });

  it('lists five contents and names the Board Wiki', () => {
    expect(RESEARCH.contents).toHaveLength(5);
    expect(RESEARCH.contents?.some((entry) => entry.includes('Board Wiki'))).toBe(true);
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

  it('has no stale credits', () => {
    const folder = path.join(ROOT, 'public/templates/freeform', ID);
    const credits = JSON.parse(fs.readFileSync(path.join(folder, 'credits.json'), 'utf8')) as Array<{
      file: string;
    }>;
    const referenced = new Set<string>(['preview.jpg', 'inbox-tray.svg']);
    for (const post of RESEARCH.posts) {
      const asset = post.kind === 'image' ? post.src : post.kind === 'clipart' ? post.svg : null;
      if (asset) referenced.add(path.basename(asset));
    }
    for (const entry of credits) expect(referenced.has(entry.file), `${entry.file} is stale`).toBe(true);
  });
});
