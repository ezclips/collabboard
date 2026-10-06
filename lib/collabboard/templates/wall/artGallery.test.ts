import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { STUDENT_ART_GALLERY } from './artGallery';

const ROOT = path.resolve(__dirname, '../../../../');

describe('Student Art Gallery', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(STUDENT_ART_GALLERY).success).toBe(true);
    expect(STUDENT_ART_GALLERY.id).toBe('art-gallery');
    expect(STUDENT_ART_GALLERY.name).toBe('Student Art Gallery');
    expect(STUDENT_ART_GALLERY.layout).toBe('wall');
    expect(STUDENT_ART_GALLERY.previewUrl).toBe('/templates/wall/art-gallery/preview.jpg');
  });

  it('has the expected number of posts per kind', () => {
    const byKind = (kind: string) =>
      STUDENT_ART_GALLERY.posts.filter((post) => post.kind === kind).length;
    expect({
      column: byKind('column'),
      note: byKind('note'),
      image: byKind('image'),
      clipart: byKind('clipart'),
      todo: byKind('todo'),
    }).toEqual({ column: 6, note: 5, image: 5, clipart: 4, todo: 1 });
  });

  it('references only assets that exist and are credited', () => {
    const assets = STUDENT_ART_GALLERY.posts.flatMap((post) =>
      post.kind === 'image' ? [post.src] : post.kind === 'clipart' ? [post.svg] : [],
    );
    expect(assets.length).toBe(9);
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
