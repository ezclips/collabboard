import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createKnowledgePdfAreaLibraryReuseHandler,
  type KnowledgePdfAreaLibraryReuseItem,
  type KnowledgePdfAreaLibraryReusePadletRow,
  type KnowledgePdfAreaLibraryReuseSession,
} from './knowledgePdfAreaLibraryReuseRoute';
import { buildKnowledgePdfAreaProvenance } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE, group U -- the trusted reuse write.
 *
 * This route exists because a PDF-area Image cannot be reused by a browser
 * INSERT: its bytes are in the private Knowledge bucket, and the server-owned
 * mapping that later authorises serving them is not a thing a client may write.
 * These pin that the browser contributes a POSITION and nothing else, that
 * every authority is re-established here, and that no second Library object and
 * no second Storage object are ever created.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const LIBRARY_ID = '66666666-6666-4666-8666-666666666666';
const NEW_PADLET_ID = '44444444-4444-4444-8444-444444444444';
const ORIGIN_BOARD_ID = '22222222-2222-4222-8222-222222222222';
const ORIGIN_PADLET_ID = '33333333-3333-4333-8333-333333333333';
const DOC_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-1';

const TARGET_URL = `/api/boards/${BOARD_ID}/padlets/${NEW_PADLET_ID}/image`;
const ORIGIN_URL = `/api/boards/${ORIGIN_BOARD_ID}/padlets/${ORIGIN_PADLET_ID}/image`;
const DURABLE_PATH = `board-derived/${ORIGIN_BOARD_ID}/pdf-areas/${ORIGIN_PADLET_ID}.webp`;

const PROVENANCE = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });

const item = (overrides: Partial<KnowledgePdfAreaLibraryReuseItem> = {}): KnowledgePdfAreaLibraryReuseItem => ({
  id: LIBRARY_ID,
  type: 'image',
  knowledgeStoragePath: DURABLE_PATH,
  title: 'EMG page 3 area',
  content: '',
  width: 320,
  height: 240,
  // Exactly what the durable row holds: the ORIGIN card's address.
  metadata: { imageUrl: ORIGIN_URL, source: PROVENANCE },
  ...overrides,
});

function session(overrides: Partial<KnowledgePdfAreaLibraryReuseSession> = {}): KnowledgePdfAreaLibraryReuseSession {
  return {
    userId: USER_ID,
    canWriteBoard: vi.fn(async () => true),
    findOwnLibraryItem: vi.fn(async () => item()),
    insertReusePlacement: vi.fn(async () => true),
    newPadletId: () => NEW_PADLET_ID,
    ...overrides,
  };
}

const context = (boardId = BOARD_ID, libraryItemId = LIBRARY_ID) =>
  ({ params: Promise.resolve({ id: boardId, libraryItemId }) });

const request = (body: unknown = { positionX: 120, positionY: 340 }) =>
  new Request(`http://localhost/api/boards/${BOARD_ID}/library-items/${LIBRARY_ID}/image-placement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function run(
  sess: KnowledgePdfAreaLibraryReuseSession | null,
  body?: unknown,
  ctx = context(),
) {
  const handler = createKnowledgePdfAreaLibraryReuseHandler({ getAuthenticatedSession: async () => sess });
  return handler(request(body), ctx);
}

const placedRow = async (response: Response): Promise<KnowledgePdfAreaLibraryReusePadletRow> => {
  const body = await response.json() as { padlet: KnowledgePdfAreaLibraryReusePadletRow };
  return body.padlet;
};

describe('U1-U5: every authority is re-established here', () => {
  it('U1 (R9): an unauthenticated caller is 401 and nothing is read', async () => {
    expect((await run(null)).status).toBe(401);
  });

  it('U2 (R10): a viewer/non-editor is 403 before any Library row is read', async () => {
    const sess = session({ canWriteBoard: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(403);
    // A viewer must not even learn whether the Library item exists.
    expect(sess.findOwnLibraryItem).not.toHaveBeenCalled();
    expect(sess.insertReusePlacement).not.toHaveBeenCalled();
  });

  it('U3 (R11): another user\'s Library item is indistinguishable from none', async () => {
    // The lookup runs through the CALLER's client, so owner RLS returns null.
    const sess = session({ findOwnLibraryItem: vi.fn(async () => null) });
    const response = await run(sess);
    expect(response.status).toBe(404);
    expect(sess.insertReusePlacement).not.toHaveBeenCalled();
  });

  it('U4 (R12): an item that is not a PDF-area Image is refused', async () => {
    for (const overrides of [
      { type: 'text' },
      { type: null },
      { metadata: null },
      { metadata: { imageUrl: ORIGIN_URL } },
      { metadata: { source: { kind: 'text' } } },
      { metadata: { source: { kind: 'knowledge-pdf-area' } } },
    ] as Partial<KnowledgePdfAreaLibraryReuseItem>[]) {
      const sess = session({ findOwnLibraryItem: vi.fn(async () => item(overrides)) });
      expect((await run(sess)).status, JSON.stringify(overrides)).toBe(404);
      expect(sess.insertReusePlacement).not.toHaveBeenCalled();
    }
  });

  it('U5 (R13): an item with no PROVEN durable path is refused', async () => {
    for (const knowledgeStoragePath of [null, '']) {
      const sess = session({ findOwnLibraryItem: vi.fn(async () => item({ knowledgeStoragePath })) });
      expect((await run(sess)).status, String(knowledgeStoragePath)).toBe(404);
      expect(sess.insertReusePlacement).not.toHaveBeenCalled();
    }
  });
});

describe('U6-U10: the placement it writes', () => {
  it('U6 (R14): it binds the SAME durable identity, never a new one', async () => {
    const sess = session();
    const response = await run(sess);
    expect(response.status).toBe(201);
    const row = await placedRow(response);
    expect(row.library_item_id).toBe(LIBRARY_ID);
    expect(row.id).toBe(NEW_PADLET_ID);
    expect(row.board_id).toBe(BOARD_ID);
    expect(row.type).toBe('image');
    expect(sess.insertReusePlacement).toHaveBeenCalledTimes(1);
    expect(sess.insertReusePlacement).toHaveBeenCalledWith(row);
  });

  it('U7 (R1, R2, R3): the row and its metadata address the TARGET placement', async () => {
    const row = await placedRow(await run(session()));
    expect(row.file_url).toBe(TARGET_URL);
    expect(row.metadata.imageUrl).toBe(TARGET_URL);
    // The origin card's address is gone; the owner-only Library route is never
    // written into a board placement.
    expect(JSON.stringify(row)).not.toContain(ORIGIN_PADLET_ID);
    expect(JSON.stringify(row)).not.toContain('/api/library/items/');
  });

  it('U8 (R6): the provenance is carried over unchanged', async () => {
    const row = await placedRow(await run(session()));
    expect(row.metadata.source).toEqual(PROVENANCE);
  });

  it('U9 (R15): there is no capability here that could create a second Library object', async () => {
    // Structural, not incidental: the session interface offers exactly one
    // write, and it is the placement + mapping transaction.
    const sess = session();
    await run(sess);
    expect(Object.keys(sess).sort()).toEqual(
      ['canWriteBoard', 'findOwnLibraryItem', 'insertReusePlacement', 'newPadletId', 'userId'],
    );
  });

  it('U10: a failed transaction is 503, and nothing partial is reported as placed', async () => {
    expect((await run(session({ insertReusePlacement: vi.fn(async () => false) }))).status).toBe(503);
    expect((await run(session({
      insertReusePlacement: vi.fn(async () => { throw new Error('down'); }),
    }))).status).toBe(503);
  });
});

describe('U11-U15: the browser contributes a position, and nothing else', () => {
  it('U11: position is taken, clamped and rounded', async () => {
    const row = await placedRow(await run(session(), { positionX: 120.4, positionY: -340.6 }));
    expect(row.position_x).toBe(120);
    expect(row.position_y).toBe(-341);
    const clamped = await placedRow(await run(session(), { positionX: 1e12, positionY: -1e12 }));
    expect(clamped.position_x).toBe(1_000_000);
    expect(clamped.position_y).toBe(-1_000_000);
    const absent = await placedRow(await run(session(), {}));
    expect(absent.position_x).toBe(0);
    expect(absent.position_y).toBe(0);
  });

  it('U12: nothing else in the body reaches the row', async () => {
    const row = await placedRow(await run(session(), {
      positionX: 10,
      positionY: 20,
      // Every field an attacker would want to supply.
      knowledge_storage_path: 'board-derived/victim/pdf-areas/secret.webp',
      knowledgeStoragePath: 'board-derived/victim/pdf-areas/secret.webp',
      library_item_id: '99999999-9999-4999-8999-999999999999',
      metadata: { source: { kind: 'knowledge-pdf-area' }, imageUrl: 'https://evil.test/x.png' },
      file_url: 'https://evil.test/x.png',
      width: 9999,
      title: 'forged',
      board_id: ORIGIN_BOARD_ID,
    }));
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('victim');
    expect(serialized).not.toContain('evil.test');
    expect(serialized).not.toContain('forged');
    expect(serialized).not.toContain('99999999-9999-4999-8999-999999999999');
    expect(row.width).toBe(320);
    expect(row.library_item_id).toBe(LIBRARY_ID);
  });

  it('U13: title and size come from the DURABLE snapshot, clamped', async () => {
    const row = await placedRow(await run(session()));
    expect(row.title).toBe('EMG page 3 area');
    expect(row.width).toBe(320);
    expect(row.height).toBe(240);

    const odd = await placedRow(await run(session({
      findOwnLibraryItem: vi.fn(async () => item({ title: '   ', width: 99999, height: -4 })),
    })));
    expect(odd.title).toBe('PDF area');
    expect(odd.width).toBe(2000);
    // A nonsensical stored height falls back rather than becoming a 0px card.
    expect(odd.height).toBe(240);
  });

  it('U14: malformed ids and bodies are refused before any lookup', async () => {
    const badBoard = session();
    expect((await run(badBoard, undefined, context('../secret'))).status).toBe(400);
    expect(badBoard.canWriteBoard).not.toHaveBeenCalled();

    const badItem = session();
    expect((await run(badItem, undefined, context(BOARD_ID, 'not-a-uuid'))).status).toBe(400);
    expect(badItem.canWriteBoard).not.toHaveBeenCalled();

    const handler = createKnowledgePdfAreaLibraryReuseHandler({
      getAuthenticatedSession: async () => session(),
    });
    const broken = new Request(`http://localhost/api/boards/${BOARD_ID}/library-items/${LIBRARY_ID}/image-placement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    expect((await handler(broken, context())).status).toBe(400);
    for (const body of [null, 'a string', [1, 2]]) {
      expect((await run(session(), body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('U15: infrastructure failures fail closed, never open', async () => {
    expect((await run(session({
      canWriteBoard: vi.fn(async () => { throw new Error('down'); }),
    }))).status).toBe(503);
    expect((await run(session({
      findOwnLibraryItem: vi.fn(async () => { throw new Error('down'); }),
    }))).status).toBe(503);
    const handler = createKnowledgePdfAreaLibraryReuseHandler({
      getAuthenticatedSession: async () => { throw new Error('down'); },
    });
    expect((await handler(request(), context())).status).toBe(503);
  });
});

describe('U16-U17: the module publishes nothing and copies nothing', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/server/knowledge/knowledgePdfAreaLibraryReuseRoute.ts'), 'utf8',
  );

  it('U16 (R15): no Storage call and no second Library row exist in this path', () => {
    for (const forbidden of ['.storage', 'getPublicUrl', 'createSignedUrl', 'upload(', 'copy(',
      "from('library_items').insert", 'create_image_post_with_library_item']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('U17: the trusted RPC is called with no path and no origin identity', () => {
    const rpcAt = source.indexOf("adminClient.rpc('create_knowledge_pdf_area_image_reuse_placement'");
    expect(rpcAt).toBeGreaterThan(-1);
    // The argument list itself: no location, and no origin identity, is sent.
    const args = source.slice(rpcAt, source.indexOf('});', rpcAt));
    expect(args).not.toMatch(/path/i);
    expect(args).not.toMatch(/origin/i);
    for (const forbidden of ['p_storage_path', 'p_origin_board_id', 'p_origin_padlet_id',
      'p_knowledge_storage_path']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    // The board the mapping will record is the ROUTE's board -- the one whose
    // edit authority was just checked -- never a value from the request body.
    expect(args).toContain('p_board_id: row.board_id');
    expect(source).toContain('const { id: boardId, libraryItemId } = await context.params;');
    expect(source).toContain('board_id: boardId,');
    // The board EDIT check precedes the Library read, which precedes the write.
    const edit = source.indexOf('session.canWriteBoard(boardId)');
    const read = source.indexOf('session.findOwnLibraryItem(libraryItemId)');
    const write = source.indexOf('session.insertReusePlacement(row)');
    expect(edit).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(edit);
    expect(write).toBeGreaterThan(read);
  });
});
