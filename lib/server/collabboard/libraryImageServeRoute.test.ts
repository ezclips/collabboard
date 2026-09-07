import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createLibraryImageServeHandler,
  type LibraryImageServeRow,
  type LibraryImageServeSession,
} from './libraryImageServeRoute';
import { buildKnowledgePdfAreaProvenance } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

/**
 * The durable address of a private PDF crop.
 *
 * What makes this route worth having is the case the board route cannot serve:
 * the origin placement is GONE, the Library object is not, and the bytes are
 * still in the private bucket. Every test below therefore either proves that
 * case works or proves the route did not become a general reader of that
 * bucket on the way.
 */

const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER_ITEM = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const BOARD = '44444444-4444-4444-8444-444444444444';
const PADLET = '55555555-5555-4555-8555-555555555555';
const PATH = `board-derived/${BOARD}/pdf-areas/${PADLET}.webp`;
const PROVENANCE = buildKnowledgePdfAreaProvenance(DOC, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });

const row = (over: Partial<LibraryImageServeRow> = {}): LibraryImageServeRow => ({
  id: ITEM,
  type: 'image',
  knowledgeStoragePath: PATH,
  metadata: { source: PROVENANCE },
  ...over,
});

function session(over: Partial<LibraryImageServeSession> = {}) {
  const base: LibraryImageServeSession = {
    userId: 'user-1',
    findOwnLibraryItem: vi.fn(async () => row()),
    downloadDurableImage: vi.fn(async () => ({ kind: 'ok', bytes: new Uint8Array([1, 2, 3]) } as const)),
    ...over,
  };
  return base;
}

const call = (s: LibraryImageServeSession | null, libraryItemId = ITEM) =>
  createLibraryImageServeHandler({ getAuthenticatedSession: async () => s })(
    new Request('http://localhost/x'),
    { params: Promise.resolve({ libraryItemId }) },
  );

describe('1-3. the durable address serves the owner, placement or no placement', () => {
  it('1. serves the owner a PDF-area Library image', async () => {
    const sess = session();
    const response = await call(sess);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    // Private and unretained, exactly like the board route beside it.
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('2. still serves when the origin placement no longer exists', async () => {
    // The whole point. Nothing in this route reads `padlets`, so a deleted card
    // is not an input it could even notice -- proven by serving a 200 from a
    // session that has no padlet lookup at all.
    const sess = session();
    expect(sess).not.toHaveProperty('findPadlet');
    const response = await call(sess);
    expect(response.status).toBe(200);
    expect(sess.downloadDurableImage).toHaveBeenCalledWith(PATH);
  });

  it('3. the object it fetches is the one the crop was always stored at', async () => {
    // Same private object, second address: no copy is implied anywhere.
    const sess = session();
    await call(sess);
    expect(sess.downloadDurableImage).toHaveBeenCalledExactlyOnceWith(
      `board-derived/${BOARD}/pdf-areas/${PADLET}.webp`);
  });
});

describe('4-8. it never becomes a reader of the private bucket', () => {
  it('4. another user\'s item is indistinguishable from one that does not exist', async () => {
    // Owner RLS returns nothing, so the route sees null -- and answers 404
    // rather than 403, which would confirm the row exists.
    const sess = session({ findOwnLibraryItem: vi.fn(async () => null) });
    const response = await call(sess, OTHER_ITEM);
    expect(response.status).toBe(404);
    expect(sess.downloadDurableImage).not.toHaveBeenCalled();
  });

  it('5. a non-image item is refused', async () => {
    const sess = session({ findOwnLibraryItem: vi.fn(async () => row({ type: 'note' })) });
    const response = await call(sess);
    expect(response.status).toBe(404);
    expect(sess.downloadDurableImage).not.toHaveBeenCalled();
  });

  it('6. an item with no proven durable path is refused, never guessed at', async () => {
    // A legacy row that could not be verified keeps NULL. It reads as "no
    // durable address" -- the route does not reconstruct one from anything.
    for (const value of [null, '']) {
      const sess = session({ findOwnLibraryItem: vi.fn(async () => row({ knowledgeStoragePath: value })) });
      const response = await call(sess);
      expect(response.status, String(value)).toBe(404);
      expect(sess.downloadDurableImage).not.toHaveBeenCalled();
    }
  });

  it('6b. an image whose snapshot is not PDF-area provenance is refused', async () => {
    for (const metadata of [null, {}, { source: { kind: 'upload' } }, { source: { ...PROVENANCE, kind: 'x' } }]) {
      const sess = session({ findOwnLibraryItem: vi.fn(async () => row({ metadata })) });
      const response = await call(sess);
      expect(response.status, JSON.stringify(metadata)).toBe(404);
      expect(sess.downloadDurableImage).not.toHaveBeenCalled();
    }
  });

  it('7. the request cannot choose a storage path', async () => {
    // The only input is an id. A path-shaped id is not a path: it fails the
    // UUID gate before any lookup happens.
    const sess = session();
    for (const attempt of [
      `../../${PATH}`,
      'board-derived/x/pdf-areas/y.webp',
      `${ITEM}/../other`,
      'not-a-uuid',
    ]) {
      const response = await call(sess, attempt);
      expect(response.status, attempt).toBe(404);
    }
    expect(sess.findOwnLibraryItem).not.toHaveBeenCalled();
    expect(sess.downloadDurableImage).not.toHaveBeenCalled();
  });

  it('8. is_public is not consulted anywhere in this route', async () => {
    // A public flag must never hand out a private PDF crop. The route does not
    // select the column, so it cannot branch on it.
    const source = fs.readFileSync(path.join(__dirname, 'libraryImageServeRoute.ts'), 'utf8');
    const executable = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(executable).not.toContain('is_public');
    expect(executable).toContain("select('id, type, knowledge_storage_path, content')");
  });
});

describe('9-11. authority order and failure behaviour', () => {
  it('9. an unauthenticated caller never reaches a lookup', async () => {
    const response = await call(null);
    expect(response.status).toBe(401);
  });

  it('10. the owner read happens through the caller, and storage only after it', async () => {
    const source = fs.readFileSync(path.join(__dirname, 'libraryImageServeRoute.ts'), 'utf8');
    // The row is read with the SESSION client; only the download uses admin.
    expect(source).toContain('sessionClient\n        .from(\'library_items\')');
    const readAt = source.indexOf('findOwnLibraryItem(libraryItemId)');
    const downloadAt = source.indexOf('downloadDurableImage(objectPath)');
    expect(readAt).toBeGreaterThan(-1);
    expect(downloadAt).toBeGreaterThan(readAt);
    // No user_id filter is written by hand: the policy is the authority.
    expect(source).not.toContain(".eq('user_id'");
  });

  it('11. a missing object is 404 and a broken backend is 503', async () => {
    const missing = await call(session({
      downloadDurableImage: vi.fn(async () => ({ kind: 'missing' } as const)),
    }));
    expect(missing.status).toBe(404);
    const down = await call(session({
      downloadDurableImage: vi.fn(async () => ({ kind: 'unavailable' } as const)),
    }));
    expect(down.status).toBe(503);
    const threw = await call(session({
      findOwnLibraryItem: vi.fn(async () => { throw new Error('rls down'); }),
    }));
    expect(threw.status).toBe(503);
  });
});

describe('12. the board route is left alone', () => {
  const boardRoute = fs.readFileSync(
    path.join(__dirname, '..', 'knowledge', 'knowledgePdfAreaImageServeRoute.ts'), 'utf8');

  it('12. board serving still requires the padlet and its board authority', () => {
    // Load-bearing negative control. A collaborator reads a shared board's
    // image without owning the Library row behind it, so the board route must
    // NOT be replaced by this owner-scoped one.
    expect(boardRoute).toContain('canReadBoard(boardId)');
    expect(boardRoute).toContain('if (!padlet) return notFound();');
    expect(boardRoute).not.toContain('knowledge_storage_path');
    expect(boardRoute).not.toContain('library_items');
  });
});
