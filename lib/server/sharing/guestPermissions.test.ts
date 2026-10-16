import { describe, expect, it, vi } from 'vitest';

import { guestMay, recordGuestActivity } from './guestPermissions';

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';
const GUEST = 'aaaaaaaa-0000-4000-8000-000000000001';
const NOW = new Date('2026-03-01T12:00:00.000Z');

type Config = {
  permission?: string | null;
  permissionError?: unknown;
  flag?: boolean;
  flagError?: unknown;
  count?: number;
  countError?: unknown;
  insertError?: unknown;
};

function fakeAdmin(config: Config) {
  const inserted: unknown[] = [];
  const client = {
    rpc: async () => {
      if (config.permissionError) return { data: null, error: config.permissionError };
      return { data: config.permission ?? null, error: null };
    },
    from: (table: string) => {
      if (table === 'boards') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (config.flagError) return { data: null, error: config.flagError };
                return { data: { guest_ai_allowed: config.flag, guest_uploads_allowed: config.flag }, error: null };
              },
            }),
          }),
        };
      }
      // guest_activity
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ gte: async () => {
            if (config.countError) return { count: null, error: config.countError };
            return { count: config.count ?? 0, error: null };
          } }) }) }),
        }),
        insert: async (row: unknown) => {
          inserted.push(row);
          return { error: config.insertError ?? null };
        },
      };
    },
  };
  return { client: client as never, inserted };
}

const may = (config: Config, kind: 'ai' | 'upload' = 'ai') =>
  guestMay({ admin: fakeAdmin(config).client, boardId: BOARD, userId: GUEST, kind, now: NOW });

describe('PATCH-380 guestMay', () => {
  it('allows a guest when the switch is on and the cap is not reached', async () => {
    expect(await may({ permission: 'editor', flag: true, count: 0 })).toEqual({ ok: true });
  });

  it('refuses when the switch is off, with the kind own message', async () => {
    expect(await may({ permission: 'editor', flag: false })).toEqual({
      ok: false,
      refusal: { status: 403, body: { error: 'Create a free account to use AI.', code: 'guest_no_ai' } },
    });
    expect(await may({ permission: 'editor', flag: false }, 'upload')).toEqual({
      ok: false,
      refusal: { status: 403, body: { error: 'Create a free account to upload files.', code: 'guest_no_upload' } },
    });
  });

  it('treats a missing switch as OFF', async () => {
    // `undefined` is not `true`; only an explicit true opens the door.
    expect((await may({ permission: 'editor', flag: undefined })).ok).toBe(false);
  });

  it('refuses anyone who is not an editor of THIS board', async () => {
    for (const permission of [null, 'viewer', 'commenter']) {
      expect((await may({ permission, flag: true })).ok, String(permission)).toBe(false);
    }
    // An admin satisfies editor.
    expect((await may({ permission: 'admin', flag: true })).ok).toBe(true);
  });

  it('refuses with no board and with no user, before any read', async () => {
    const admin = fakeAdmin({ permission: 'editor', flag: true }).client;
    expect((await guestMay({ admin, boardId: null, userId: GUEST, kind: 'ai', now: NOW })).ok).toBe(false);
    expect((await guestMay({ admin, boardId: BOARD, userId: null, kind: 'ai', now: NOW })).ok).toBe(false);
    expect((await guestMay({ admin, boardId: undefined, userId: undefined, kind: 'upload', now: NOW })).ok).toBe(false);
  });

  it('refuses at the cap, with 429 and the limit message', async () => {
    expect(await may({ permission: 'editor', flag: true, count: 20 })).toEqual({
      ok: false,
      refusal: { status: 429, body: { error: 'Guest limit reached. Please try again later.', code: 'guest_limit' } },
    });
    // One below the cap still passes.
    expect((await may({ permission: 'editor', flag: true, count: 19 })).ok).toBe(true);
  });

  it('THROWS on any read failure, so the route can answer 503', async () => {
    // Fail closed: a permission read that fails is never "allowed".
    await expect(may({ permissionError: { message: 'boom' }, flag: true })).rejects.toEqual({ message: 'boom' });
    await expect(may({ permission: 'editor', flagError: { message: 'boom' } })).rejects.toEqual({ message: 'boom' });
    await expect(may({ permission: 'editor', flag: true, countError: { message: 'boom' } })).rejects.toEqual({ message: 'boom' });
  });
});

describe('PATCH-380 recordGuestActivity', () => {
  it('inserts one row for the guest, the board and the kind', async () => {
    const { client, inserted } = fakeAdmin({});
    await recordGuestActivity(client, { boardId: BOARD, userId: GUEST, kind: 'upload', now: NOW });
    expect(inserted).toEqual([{
      board_id: BOARD,
      user_id: GUEST,
      kind: 'upload',
      created_at: NOW.toISOString(),
    }]);
  });

  it('is best effort: a failed insert is logged, not thrown', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeAdmin({ insertError: { message: 'nope' } });
    // The upload already happened; failing here would make the caller retry it.
    await expect(recordGuestActivity(client, { boardId: BOARD, userId: GUEST, kind: 'upload', now: NOW }))
      .resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
