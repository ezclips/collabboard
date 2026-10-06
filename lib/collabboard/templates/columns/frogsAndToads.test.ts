import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { FROGS_AND_TOADS } from './frogsAndToads';

const ROOT = path.resolve(__dirname, '../../../../');

describe('Compare and Contrast', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(FROGS_AND_TOADS).success).toBe(true);
    expect(FROGS_AND_TOADS.id).toBe('frogs-and-toads');
    expect(FROGS_AND_TOADS.name).toBe('Compare and Contrast');
    expect(FROGS_AND_TOADS.layout).toBe('columns');
    expect(FROGS_AND_TOADS.previewUrl).toBe('/templates/columns/frogs-and-toads/preview.jpg');
  });

  it('has the expected number of posts per kind', () => {
    const byKind = (kind: string) =>
      FROGS_AND_TOADS.posts.filter((post) => post.kind === kind).length;
    expect({
      section: byKind('section'),
      note: byKind('note'),
      image: byKind('image'),
      clipart: byKind('clipart'),
    }).toEqual({ section: 4, note: 4, image: 5, clipart: 5 });
  });

  it('references only assets that exist and are credited', () => {
    const assets = FROGS_AND_TOADS.posts.flatMap((post) =>
      post.kind === 'image' ? [post.src] : post.kind === 'clipart' ? [post.svg] : [],
    );
    expect(assets.length).toBe(10);
    for (const asset of assets) {
      const filePath = path.join(ROOT, 'public', asset);
      expect(fs.existsSync(filePath), `${asset} should exist under public/`).toBe(true);
      const credits = JSON.parse(
        fs.readFileSync(path.join(path.dirname(filePath), 'credits.json'), 'utf8'),
      ) as Array<{ file: string }>;
      expect(credits.map((entry) => entry.file)).toContain(path.basename(asset));
    }
  });
});
