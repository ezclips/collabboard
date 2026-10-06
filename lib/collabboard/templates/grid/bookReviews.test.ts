import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';
import { BOOK_REVIEWS } from './bookReviews';

const ROOT = path.resolve(__dirname, '../../../../');

describe('Book Reviews', () => {
  it('validates against the board template schema and names itself', () => {
    expect(boardTemplateSchema.safeParse(BOOK_REVIEWS).success).toBe(true);
    expect(BOOK_REVIEWS.id).toBe('book-reviews');
    expect(BOOK_REVIEWS.name).toBe('Book Reviews');
    expect(BOOK_REVIEWS.layout).toBe('grid');
    expect(BOOK_REVIEWS.previewUrl).toBe('/templates/grid/book-reviews/preview.jpg');
  });

  it('has the expected number of posts per kind', () => {
    const byKind = (kind: string) => BOOK_REVIEWS.posts.filter((post) => post.kind === kind).length;
    expect({
      section: byKind('section'),
      column: byKind('column'),
      note: byKind('note'),
      image: byKind('image'),
      clipart: byKind('clipart'),
    }).toEqual({ section: 2, column: 6, note: 6, image: 5, clipart: 6 });
  });

  it('references only assets that exist and are credited', () => {
    const assets = BOOK_REVIEWS.posts.flatMap((post) =>
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
