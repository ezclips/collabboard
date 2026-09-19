import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createBoardWikiCreateHandler,
  createBoardWikiDeleteHandler,
  createBoardWikiListHandler,
  createBoardWikiReadHandler,
  createBoardWikiSaveHandler,
  type BoardWikiSession,
} from './boardWikiPageRoute';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import { boardAiCitationIdentityKey } from '../../domain/ai/boardAiChatCitation';
import type { BoardWikiPageSource } from '../../domain/wiki/boardWikiPageSources';
import type { BoardAiCitationItem } from '../../domain/ai/boardAiChatCitation';

const BOARD = 'board-1';
const PAGE = 'page-1';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const docSource: BoardWikiPageSource = {
  item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6, label: 'doc — page 6' },
  version: { kind: 'document', contentSha256: 'sha-1', updatedAt: '2026-09-01T00:00:00Z' },
};
const postSource: BoardWikiPageSource = {
  item: { type: 'padlet', padletId: POST, label: 'a board post' },
  version: { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' },
};

const storedPage = {
  id: PAGE,
  slug: 'horn-replacement',
  title: 'Horn replacement',
  content: 'Authored by a person.',
  sources: [docSource, postSource],
  compiledAt: null,
  updatedAt: '2026-09-19T10:00:00Z',
};

function session(overrides: Partial<BoardWikiSession> = {}): BoardWikiSession {
  return {
    userId: 'user-1',
    listPages: vi.fn(async () => ok([])),
    readPage: vi.fn(async () => ok({ page: storedPage, currentVersions: new Map() })),
    createPage: vi.fn(async () => ok(storedPage)),
    savePage: vi.fn(async () => ok(storedPage)),
    deletePage: vi.fn(async () => ok({ deleted: true as const })),
    ...overrides,
  } as BoardWikiSession;
}

const itemContext = { params: Promise.resolve({ id: BOARD, pageId: PAGE }) };
const boardContext = { params: Promise.resolve({ id: BOARD }) };

const post = (body: unknown) => new Request('http://test/api', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const patch = (body: unknown) => new Request('http://test/api', {
  method: 'PATCH',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('an unauthenticated caller reaches nothing', () => {
  it('is 401 on every handler, including when the session factory throws', () => {
    const list = createBoardWikiListHandler({ getAuthenticatedSession: async () => null });
    // A session factory that THROWS is 401 too, not 500: a broken cookie jar
    // must not read as a server fault the caller might retry into.
    const read = createBoardWikiReadHandler({
      getAuthenticatedSession: async () => { throw new Error('cookie jar'); },
    });
    return Promise.all([
      list(new Request('http://test/api'), boardContext).then((r) => expect(r.status).toBe(401)),
      read(new Request('http://test/api'), itemContext).then((r) => expect(r.status).toBe(401)),
    ]);
  });
});

describe('reading a page derives its source states rather than storing them', () => {
  it('reports current, stale and gone from the versions the session read', async () => {
    const current = new Map([
      [boardAiCitationIdentityKey(docSource.item), { kind: 'document' as const, contentSha256: 'sha-2', updatedAt: 'x' }],
    ]);
    const handler = createBoardWikiReadHandler({
      getAuthenticatedSession: async () => session({
        readPage: vi.fn(async () => ok({ page: storedPage, currentVersions: current })),
      }),
    });

    const body = await (await handler(new Request('http://test/api'), itemContext)).json();

    // The document's hash moved; the post is absent from the map entirely.
    expect(body.sources.map((source: { state: string }) => source.state)).toEqual(['stale', 'gone']);
    expect(body.freshness).toBe('sources-gone');
  });

  it('sends the sources chain with the page, never separately or on request', async () => {
    // P1's mitigation: the chain is shown WITH the page, so a page cannot be
    // read without what it was compiled from. One response, not two.
    const handler = createBoardWikiReadHandler({ getAuthenticatedSession: async () => session() });
    const body = await (await handler(new Request('http://test/api'), itemContext)).json();
    expect(body.page.content).toBe('Authored by a person.');
    expect(body.sources).toHaveLength(2);
    expect(body.freshness).toBe('sources-gone');
  });

  it('a page the caller cannot reach is 404, never 403', async () => {
    // 403 confirms the id exists somewhere, which is the leak the knowledge
    // routes already refuse to make.
    const handler = createBoardWikiReadHandler({
      getAuthenticatedSession: async () => session({
        readPage: vi.fn(async () => err(domainError('not_found', 'Wiki page was not found'))),
      }),
    });
    expect((await handler(new Request('http://test/api'), itemContext)).status).toBe(404);
  });
});

describe('creating a page accepts a title and nothing else', () => {
  it('passes only the trimmed title through', async () => {
    const createPage = vi.fn(async () => ok(storedPage));
    const handler = createBoardWikiCreateHandler({
      getAuthenticatedSession: async () => session({ createPage }),
    });

    const response = await handler(
      post({ title: '  Horn replacement  ', content: 'smuggled', slug: 'chosen-by-caller', createdBy: 'someone-else' }),
      boardContext,
    );

    expect(response.status).toBe(201);
    // Content, slug and authorship are the server's to decide. A body that
    // carried them would be a body the server had to distrust field by field.
    expect(createPage).toHaveBeenCalledWith({ boardId: BOARD, userId: 'user-1', title: 'Horn replacement' });
  });

  it('refuses a blank title rather than storing one the schema would reject', async () => {
    const handler = createBoardWikiCreateHandler({ getAuthenticatedSession: async () => session() });
    for (const body of [{ title: '   ' }, { title: 42 }, {}, 'not json at all']) {
      expect((await handler(post(body), boardContext)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('a duplicate name is a conflict the user can act on, not a silent rename', async () => {
    const handler = createBoardWikiCreateHandler({
      getAuthenticatedSession: async () => session({
        createPage: vi.fn(async () => err(domainError('conflict', 'A page with this name already exists'))),
      }),
    });
    expect((await handler(post({ title: 'Horn replacement' }), boardContext)).status).toBe(409);
  });
});

describe('saving takes text, and the concurrency token travels with it', () => {
  it('forwards the parsed request including the base it was drafted from', async () => {
    const savePage = vi.fn(async () => ok(storedPage));
    const handler = createBoardWikiSaveHandler({
      getAuthenticatedSession: async () => session({ savePage }),
    });

    const response = await handler(patch({
      title: 'Horn replacement',
      content: 'Edited by a person.',
      sources: [docSource.item],
      baseUpdatedAt: '2026-09-19T10:00:00Z',
    }), itemContext);

    expect(response.status).toBe(200);
    expect(savePage).toHaveBeenCalledWith(expect.objectContaining({
      boardId: BOARD,
      pageId: PAGE,
      userId: 'user-1',
      request: {
        title: 'Horn replacement',
        content: 'Edited by a person.',
        sources: [docSource.item],
        baseUpdatedAt: '2026-09-19T10:00:00Z',
      },
    }));
  });

  it('takes source identities as untrusted input and refuses to carry a VERSION', async () => {
    // A version sent from a browser would let a page declare itself fresh over
    // sources nobody re-read. Entries are re-built field by field, so neither a
    // version nor any other smuggled key survives the boundary.
    const savePage = vi.fn(async () => ok(storedPage));
    const handler = createBoardWikiSaveHandler({
      getAuthenticatedSession: async () => session({ savePage }),
    });

    await handler(patch({
      title: 'T',
      content: 'C',
      baseUpdatedAt: 'base',
      sources: [
        { type: 'padlet', padletId: POST, label: 'ok', forged: 'x', version: { kind: 'post', updatedAt: '2099' } },
        { type: 'padlet', label: 'no identity at all' },
      ],
    }), itemContext);

    const sent = (savePage.mock.calls as unknown as readonly [{ request: { sources: readonly BoardAiCitationItem[] } }][])[0][0].request.sources;
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).sort()).toEqual(['label', 'padletId', 'type']);
  });

  it('refuses a save with no base, rather than treating it as a fresh one', async () => {
    // A save with no base is a last-write-wins save wearing a different name.
    const handler = createBoardWikiSaveHandler({ getAuthenticatedSession: async () => session() });
    for (const body of [
      { title: 'T', content: 'C' },
      { title: 'T', content: 'C', baseUpdatedAt: '' },
      { title: '  ', content: 'C', baseUpdatedAt: 'base' },
      { title: 'T', baseUpdatedAt: 'base' },
    ]) {
      expect((await handler(patch(body), itemContext)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('a page that moved underneath the draft is 409, never a quiet success', async () => {
    const handler = createBoardWikiSaveHandler({
      getAuthenticatedSession: async () => session({
        savePage: vi.fn(async () => err(domainError('conflict', 'moved'))),
      }),
    });
    const response = await handler(patch({
      title: 'T', content: 'C', baseUpdatedAt: 'stale-base',
    }), itemContext);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('This page changed while you were editing it');
  });
});

describe('deleting a page (Unit 2b)', () => {
  it('names the page from the PATH and reads no body at all', async () => {
    const deletePage = vi.fn(async () => ok({ deleted: true as const }));
    const handler = createBoardWikiDeleteHandler({
      getAuthenticatedSession: async () => session({ deletePage }),
    });

    // A body is sent and must be ignored entirely: there is nothing a request
    // could say that should change which page this removes.
    const response = await handler(
      new Request('http://test/api', { method: 'DELETE', body: JSON.stringify({ pageId: 'some-other-page' }) }),
      itemContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(deletePage).toHaveBeenCalledWith({ boardId: BOARD, pageId: PAGE, userId: 'user-1' });
  });

  it('a viewer is refused, and told not-found rather than forbidden', async () => {
    // A user who may not write this board may not learn whether the page
    // exists -- the same rule create and save already follow.
    const handler = createBoardWikiDeleteHandler({
      getAuthenticatedSession: async () => session({
        deletePage: vi.fn(async () => err(domainError('not_found', 'Wiki page was not found'))),
      }),
    });
    const response = await handler(new Request('http://test/api', { method: 'DELETE' }), itemContext);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('Wiki page was not found');
  });

  it('an unauthenticated caller deletes nothing', async () => {
    const handler = createBoardWikiDeleteHandler({ getAuthenticatedSession: async () => null });
    expect((await handler(new Request('http://test/api', { method: 'DELETE' }), itemContext)).status).toBe(401);
  });

  it('an outage is 503, never a reported success', async () => {
    // The one thing that must not happen is telling a user their page is gone
    // when it is still there.
    const handler = createBoardWikiDeleteHandler({
      getAuthenticatedSession: async () => session({
        deletePage: vi.fn(async () => { throw new Error('down'); }),
      }),
    });
    expect((await handler(new Request('http://test/api', { method: 'DELETE' }), itemContext)).status).toBe(503);
  });

  it('the session distinguishes "deleted" from "there was nothing there"', () => {
    const sessionSource = readFileSync(resolve(process.cwd(), 'lib/server/wiki/boardWikiPageSession.ts'), 'utf8');
    const remove = sessionSource.slice(sessionSource.indexOf('async deletePage('));
    const body = remove.slice(0, remove.indexOf('return ok('));
    // Board-scoped, and the deleted row is read back: a delete that matched
    // nothing must not report success.
    expect(body).toContain(".eq('board_id', boardId)");
    expect(body).toContain(".select('id')");
    expect(body).toMatch(/if \(!data\) return err\(domainError\('not_found'/);
  });
});

describe('NO SERVER PATH WRITES COMPILE OUTPUT TO A PAGE', () => {
  const routeSource = readFileSync(resolve(process.cwd(), 'lib/server/wiki/boardWikiPageRoute.ts'), 'utf8');
  const sessionSource = readFileSync(resolve(process.cwd(), 'lib/server/wiki/boardWikiPageSession.ts'), 'utf8');

  it('exports no handler that takes a proposal', () => {
    // THE ACCEPTANCE CRITERION at the HTTP edge. "POST a proposal id, the
    // server copies its content onto the page" is one request away from being
    // called by a scheduler, a retry, or a refresh-all button -- so it must not
    // exist, rather than merely not be called.
    const handlers = [...routeSource.matchAll(/export function (create\w+Handler)/g)].map((m) => m[1]);
    // Enumerated, not pattern-matched: adding a handler has to be a deliberate
    // edit here, which is what caught Unit 2b's delete on the first run.
    expect(handlers).toEqual([
      'createBoardWikiListHandler',
      'createBoardWikiCreateHandler',
      'createBoardWikiReadHandler',
      'createBoardWikiSaveHandler',
      'createBoardWikiDeleteHandler',
    ]);
    // The word appears only in the header that explains why the endpoint is
    // absent; no executable line names one.
    const executable = routeSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(executable).not.toMatch(/proposal/i);
  });

  it('the session exposes exactly five commands, none of them about proposals', () => {
    const commands = [...routeSource.matchAll(/^ {2}(\w+)\(input: \{/gm)].map((m) => m[1]);
    expect(commands.sort()).toEqual(['createPage', 'deletePage', 'listPages', 'readPage', 'savePage']);
  });

  it('nothing writes to the proposals table from the page surface', () => {
    // Unit 3 will write proposals. Nothing in the SURFACE's server path may
    // read one and turn it into page content.
    expect(sessionSource).not.toContain('board_wiki_page_proposals');
  });

  it('the page surface never reaches for an admin client', () => {
    // A service role bypasses every policy, and nothing here needs one: a wiki
    // page is one row with no blobs and no children the caller cannot see. The
    // caller's own client keeps RLS behind the explicit checks rather than
    // leaving the explicit check as the only thing standing.
    expect(sessionSource).not.toContain('getSupabaseAdmin');
    expect(sessionSource).toContain('createRouteHandlerClient');
  });

  it('the save writes no compiled_at, so authored text never dates itself as compiled', () => {
    const save = sessionSource.slice(sessionSource.indexOf('async savePage('));
    expect(save.slice(0, save.indexOf('return ok('))).not.toContain('compiled_at');
  });
});
