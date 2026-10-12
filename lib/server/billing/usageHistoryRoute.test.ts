import { describe, expect, it, vi } from 'vitest';

import type { BillingActor } from './stripeBilling';
import {
  createUsageHistoryHandler,
  type AiCreditUsageRow,
  type UsageHistoryHandlerDependencies,
} from './usageHistoryRoute';

/**
 * PATCH-344. The usage history route, with injected deps so no test reaches a
 * database: the ordering (auth -> workspace -> membership -> reads), the query
 * contract, the limit+1 hasMore, one board-title read, and the privacy rule
 * (no user_id anywhere in the response).
 */

const WORKSPACE = '11111111-1111-4111-8111-111111111111';

const actor: BillingActor = {
  userId: 'user-1',
  email: 'member@example.com',
  supabase: {} as never,
  supabaseAdmin: {} as never,
};

// The REAL Postgres `timestamptz` shape: six-digit fraction and `+00:00`, not a
// `Z`. The route returns `created_at` verbatim as its cursor, so a fixture with
// a `Z` would never exercise the cursor it actually produces.
function row(over: Partial<AiCreditUsageRow> = {}): AiCreditUsageRow {
  return {
    id: 'r1',
    board_id: 'b1',
    user_id: 'user-1',
    feature: 'board_chat',
    credits: 1,
    bucket: 'allowance',
    created_at: '2026-10-11T10:00:00.000000+00:00',
    ...over,
  };
}

function deps(overrides: Partial<UsageHistoryHandlerDependencies> = {}): UsageHistoryHandlerDependencies {
  return {
    getAuthenticatedSession: vi.fn(async () => actor),
    resolveWorkspace: vi.fn(async () => ({ workspaceId: WORKSPACE })),
    workspaceRole: vi.fn(async () => 'member'),
    readLedger: vi.fn(async () => [row()]),
    readBoardTitles: vi.fn(async () => new Map([['b1', 'Brainstorm']])),
    ...overrides,
  };
}

const request = (query = '') => new Request(`http://localhost/api/billing/usage/history${query}`);

describe('PATCH-344 GET /api/billing/usage/history', () => {
  it('401 without an actor, and a throw from auth is 401 too', async () => {
    const missing = createUsageHistoryHandler(deps({ getAuthenticatedSession: async () => null }));
    expect((await missing(request())).status).toBe(401);

    const thrown = createUsageHistoryHandler(deps({
      getAuthenticatedSession: async () => { throw new Error('down'); },
    }));
    expect((await thrown(request())).status).toBe(401);
  });

  it('400 with no active workspace', async () => {
    const handler = createUsageHistoryHandler(deps({ resolveWorkspace: async () => null }));
    const res = await handler(request());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No active workspace' });
  });

  it('403 for a non-member, and the ledger is never read', async () => {
    const d = deps({ workspaceRole: async () => null });
    const res = await createUsageHistoryHandler(d)(request());
    expect(res.status).toBe(403);
    expect(d.readLedger).not.toHaveBeenCalled();
    expect(d.readBoardTitles).not.toHaveBeenCalled();
  });

  it('503 on a role-read failure, a ledger failure, or a board-title failure', async () => {
    const roleThrow = createUsageHistoryHandler(deps({ workspaceRole: async () => { throw new Error('down'); } }));
    expect((await roleThrow(request())).status).toBe(503);

    const ledgerThrow = createUsageHistoryHandler(deps({ readLedger: async () => { throw new Error('down'); } }));
    expect((await ledgerThrow(request())).status).toBe(503);

    const titlesThrow = createUsageHistoryHandler(deps({ readBoardTitles: async () => { throw new Error('down'); } }));
    expect((await titlesThrow(request())).status).toBe(503);
  });

  it('400 for a bad limit or before', async () => {
    const handler = createUsageHistoryHandler(deps());
    expect((await handler(request('?limit=abc'))).status).toBe(400);
    expect((await handler(request('?limit=0'))).status).toBe(400);
    expect((await handler(request('?limit=101'))).status).toBe(400);
    expect((await handler(request('?before=not-a-date'))).status).toBe(400);
  });

  it('asks the ledger for limit+1, defaults to 50, and caps at 100', async () => {
    const def = deps();
    await createUsageHistoryHandler(def)(request());
    expect(def.readLedger).toHaveBeenCalledWith(actor, WORKSPACE, { before: null, limit: 51 });

    const max = deps();
    await createUsageHistoryHandler(max)(request('?limit=100'));
    expect(max.readLedger).toHaveBeenCalledWith(actor, WORKSPACE, { before: null, limit: 101 });

    const withBefore = deps();
    const iso = '2026-10-11T09:00:00.000000+00:00';
    await createUsageHistoryHandler(withBefore)(request(`?before=${encodeURIComponent(iso)}`));
    expect(withBefore.readLedger).toHaveBeenCalledWith(actor, WORKSPACE, { before: iso, limit: 51 });
  });

  it('accepts the cursor it returns verbatim (Postgres timestamptz)', async () => {
    // The exact live failure: `+00:00` with a microsecond fraction was rejected.
    const cursor = '2026-10-05T09:18:14.950477+00:00';
    const d = deps();
    const res = await createUsageHistoryHandler(d)(request(`?before=${encodeURIComponent(cursor)}`));
    expect(res.status).toBe(200);
    expect(d.readLedger).toHaveBeenCalledWith(actor, WORKSPACE, { before: cursor, limit: 51 });
  });

  it('round-trips page 1\'s nextBefore into page 2', async () => {
    const boundary = '2026-10-11T11:00:00.123456+00:00';
    const first = deps({
      readLedger: async () => [
        row({ id: 'r3', created_at: '2026-10-11T12:00:00.000000+00:00' }),
        row({ id: 'r2', created_at: boundary }),
        row({ id: 'r1', created_at: '2026-10-11T10:00:00.000000+00:00' }),
      ],
    });
    const page1 = await (await createUsageHistoryHandler(first)(request('?limit=2'))).json();
    expect(page1.nextBefore).toBe(boundary);

    const second = deps({ readLedger: vi.fn(async () => [row({ id: 'r0' })]) });
    const res = await createUsageHistoryHandler(second)(
      request(`?limit=2&before=${encodeURIComponent(page1.nextBefore)}`),
    );
    expect(res.status).toBe(200);
    expect(second.readLedger).toHaveBeenCalledWith(actor, WORKSPACE, { before: boundary, limit: 3 });
  });

  it('reports hasMore via limit+1 and sets nextBefore to the last entry', async () => {
    const d = deps({
      readLedger: async () => [
        row({ id: 'r3', created_at: '2026-10-11T12:00:00.000000+00:00' }),
        row({ id: 'r2', created_at: '2026-10-11T11:00:00.000000+00:00' }),
        row({ id: 'r1', created_at: '2026-10-11T10:00:00.000000+00:00' }),
      ],
    });
    const body = await (await createUsageHistoryHandler(d)(request('?limit=2'))).json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['r3', 'r2']);
    expect(body.nextBefore).toBe('2026-10-11T11:00:00.000000+00:00');

    // A full-but-not-more page has no nextBefore.
    const noMore = deps({ readLedger: async () => [row({ id: 'r1' })] });
    expect((await (await createUsageHistoryHandler(noMore)(request('?limit=2'))).json()).nextBefore).toBeNull();
  });

  it('reads board titles once for the distinct ids', async () => {
    const readBoardTitles = vi.fn(
      async (_actor: BillingActor, _boardIds: string[]) => new Map([['b1', 'Brainstorm'], ['b2', 'Plan']]),
    );
    const d = deps({
      readLedger: async () => [
        row({ id: 'r3', board_id: 'b2' }),
        row({ id: 'r2', board_id: 'b1' }),
        row({ id: 'r1', board_id: 'b1' }),
      ],
      readBoardTitles,
    });
    await createUsageHistoryHandler(d)(request());
    expect(readBoardTitles).toHaveBeenCalledTimes(1);
    expect(readBoardTitles.mock.calls[0][1].sort()).toEqual(['b1', 'b2']);
  });

  it('marks a deleted or unreadable board as boardGone with a null title', async () => {
    const d = deps({
      readLedger: async () => [
        row({ id: 'deleted', board_id: null }),
        row({ id: 'unreadable', board_id: 'b9' }),
      ],
      readBoardTitles: async () => new Map(),
    });
    const body = await (await createUsageHistoryHandler(d)(request())).json();
    const byId = new Map(body.entries.map((e: { id: string }) => [e.id, e]));
    expect(byId.get('deleted')).toMatchObject({ boardGone: true, boardTitle: null, boardId: null });
    expect(byId.get('unreadable')).toMatchObject({ boardGone: true, boardTitle: null, boardId: 'b9' });
  });

  it('byYou is true only for the actor, and no user_id is returned', async () => {
    const d = deps({
      readLedger: async () => [
        row({ id: 'mine', user_id: 'user-1' }),
        row({ id: 'theirs', user_id: 'user-2' }),
        row({ id: 'ghost', user_id: null }),
      ],
    });
    const res = await createUsageHistoryHandler(d)(request());
    const body = await res.json();
    const byId = new Map(body.entries.map((e: { id: string }) => [e.id, e]));
    expect(byId.get('mine')).toMatchObject({ byYou: true });
    expect(byId.get('theirs')).toMatchObject({ byYou: false });
    expect(byId.get('ghost')).toMatchObject({ byYou: false });
    for (const entry of body.entries) {
      expect(entry).not.toHaveProperty('user_id');
      expect(entry).not.toHaveProperty('userId');
    }
    expect(JSON.stringify(body)).not.toContain('user-2');
    expect(JSON.stringify(body)).not.toContain('member@example.com');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('labels the feature and the bucket', async () => {
    const d = deps({
      readLedger: async () => [
        row({ id: 'a', feature: 'notes_to_cards', bucket: 'grant' }),
        row({ id: 'b', feature: 'future_feature', bucket: 'allowance' }),
      ],
    });
    const body = await (await createUsageHistoryHandler(d)(request())).json();
    const byId = new Map(body.entries.map((e: { id: string }) => [e.id, e]));
    expect(byId.get('a')).toMatchObject({ featureLabel: 'Suggest cards', bucket: 'grant' });
    expect(byId.get('b')).toMatchObject({ featureLabel: 'AI feature', bucket: 'allowance' });
  });
});
