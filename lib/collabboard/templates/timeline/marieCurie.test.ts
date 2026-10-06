import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { MARIE_CURIE } from './marieCurie';

const ROOT = path.resolve(__dirname, '../../../../');

describe('Marie Curie: A Life in Science', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(MARIE_CURIE).success).toBe(true);
    expect(MARIE_CURIE.id).toBe('marie-curie');
    expect(MARIE_CURIE.name).toBe('Marie Curie: A Life in Science');
    expect(MARIE_CURIE.layout).toBe('timeline');
    expect(MARIE_CURIE.previewUrl).toBe('/templates/timeline/marie-curie/preview.jpg');
  });

  it('has the expected number of posts per kind', () => {
    const byKind = (kind: string) => MARIE_CURIE.posts.filter((post) => post.kind === kind).length;
    expect({
      column: byKind('column'),
      note: byKind('note'),
      image: byKind('image'),
      clipart: byKind('clipart'),
    }).toEqual({ column: 8, note: 8, image: 5, clipart: 6 });
  });

  it('references only assets that exist and are credited', () => {
    const assets = MARIE_CURIE.posts.flatMap((post) =>
      post.kind === 'image' ? [post.src] : post.kind === 'clipart' ? [post.svg] : [],
    );
    expect(assets.length).toBe(11);
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
