import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { TRADITIONS_AROUND_THE_WORLD } from './traditionsAroundTheWorld';

const ROOT = path.resolve(__dirname, '../../../../');

describe('Traditions Around the World', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(TRADITIONS_AROUND_THE_WORLD).success).toBe(true);
    expect(TRADITIONS_AROUND_THE_WORLD.id).toBe('traditions-around-the-world');
    expect(TRADITIONS_AROUND_THE_WORLD.name).toBe('Traditions Around the World');
    expect(TRADITIONS_AROUND_THE_WORLD.layout).toBe('map');
    expect(TRADITIONS_AROUND_THE_WORLD.previewUrl).toBe(
      '/templates/map/traditions-around-the-world/preview.jpg',
    );
  });

  it('has the expected number of posts per kind', () => {
    const byKind = (kind: string) =>
      TRADITIONS_AROUND_THE_WORLD.posts.filter((post) => post.kind === kind).length;
    expect({
      column: byKind('column'),
      note: byKind('note'),
      image: byKind('image'),
      clipart: byKind('clipart'),
    }).toEqual({ column: 6, note: 6, image: 6, clipart: 4 });
  });

  it('references only assets that exist and are credited', () => {
    const assets = TRADITIONS_AROUND_THE_WORLD.posts.flatMap((post) =>
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
