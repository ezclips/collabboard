import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBoardPermission } from '../../auth/permissions';

/**
 * REPAIR_GET_BOARD_PERMISSION_1.
 *
 * It lives here rather than beside lib/auth/permissions.ts because `lib/auth/**`
 * is not in vitest's include globs -- a test placed there is never collected
 * and would pass CI for the wrong reason. Same reason boardDeleteRoute.test.ts
 * beside it exercises an `app/api/**` route from `lib/server/**`.
 *
 * get_board_permission resolved from `canvases` / `canvas_collaborators` and
 * selected `canvases.workspace_id`, a column the schema does not have, so every
 * call raised 42703 and POST /api/share-link returned 500. `canvases` also
 * holds one row and no board in use, so it would have denied every real board
 * even with the column restored -- which is why the repair re-points it at
 * `boards` / `board_collaborators` rather than patching a column.
 *
 * These pin the CONTRACT AT THE FACADE: the RPC name, its argument names, and
 * the permission each authority resolves to. They deliberately do not attempt
 * to execute plpgsql -- the SQL body is proven by
 * supabase/production-rollouts/20260916130000_repair_get_board_permission_verify.sql
 * against the live catalog. What is provable here is that the TypeScript side
 * asks the right question and faithfully reports the answer, including the
 * deny cases, which are the ones a regression would quietly turn into grants.
 */

/** A client whose rpc() records its call and returns one canned answer. */
function fakeSupabase(answer: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({
    data: answer.data ?? null,
    error: answer.error ?? null,
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const BOARD = 'af02972f-dfde-4545-9fc8-5fcbccb007c3';
const USER = '3f41bc24-435a-4e42-8177-278ececb1107';

describe('getBoardPermission: the RPC contract', () => {
  it('calls get_board_permission by name, with the argument names the function declares', async () => {
    // The migration preserves this signature exactly; renaming either argument
    // here or there breaks every caller with a PostgREST 404, not a type error.
    const { client, rpc } = fakeSupabase({ data: 'admin' });
    await getBoardPermission(client, BOARD, USER);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_board_permission', {
      board_uuid: BOARD,
      user_uuid: USER,
    });
  });

  it('propagates an RPC error rather than degrading to a permission', async () => {
    // This is how the 42703 surfaced: the route's outer handler turned a raise
    // into a 500. A caught error that returned null would have been worse --
    // a silent deny that looks like a policy decision.
    const { client } = fakeSupabase({ error: { code: '42703', message: 'column "workspace_id" does not exist' } });
    await expect(getBoardPermission(client, BOARD, USER)).rejects.toMatchObject({ code: '42703' });
  });
});

describe('getBoardPermission: each authority resolves to its permission', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['the board owner', 'admin', 'admin'],
    ['a workspace owner or admin', 'admin', 'admin'],
    ['a collaborator whose role is editor', 'editor', 'editor'],
    ['a collaborator whose role is commenter', 'commenter', 'commenter'],
    // 'viewer' is the documented collaborator role; 'reader' is the enum member.
    ['a collaborator whose role is viewer', 'reader', 'reader'],
    ['a moderator', 'moderator', 'moderator'],
  ];

  for (const [who, returned, expected] of cases) {
    it(`${who} -> ${expected}`, async () => {
      const { client } = fakeSupabase({ data: returned });
      await expect(getBoardPermission(client, BOARD, USER)).resolves.toBe(expected);
    });
  }

  it('still maps the legacy permission vocabulary', async () => {
    // mapLegacyToBoardPermission is applied to whatever the function returns,
    // and the repair does not change that.
    for (const [legacy, mapped] of [['view', 'reader'], ['comment', 'commenter'], ['edit', 'editor']] as const) {
      const { client } = fakeSupabase({ data: legacy });
      await expect(getBoardPermission(client, BOARD, USER)).resolves.toBe(mapped);
    }
  });
});

describe('getBoardPermission: the deny cases', () => {
  /**
   * Each of these is a NULL from the function, and each must stay a null here.
   * boardPermissionSatisfies treats null as "no permission", so a regression
   * that turned any of them into a string would grant access, not refuse it.
   */
  const denials: ReadonlyArray<readonly [string, unknown]> = [
    ['the board does not exist', null],
    ['the user is a stranger to the board', null],
    // The collaborator CASE has no ELSE, so an unrecognised role yields NULL
    // rather than a guessed permission.
    ['the collaborator role is not one the function recognises', null],
    // Deliberate behaviour change: the visitor branch is not reproduced,
    // because `boards` has no is_public column to reproduce it from.
    ['a visitor to what used to be a public board', null],
  ];

  for (const [when, returned] of denials) {
    it(`${when} -> null`, async () => {
      const { client } = fakeSupabase({ data: returned });
      await expect(getBoardPermission(client, BOARD, USER)).resolves.toBeNull();
    });
  }

  it('an unrecognised permission string is never invented into a valid one', async () => {
    // mapLegacyToBoardPermission returns null for anything it does not know;
    // the facade then falls back to the raw value, so this pins what actually
    // reaches a caller for a value neither layer recognises.
    const { client } = fakeSupabase({ data: 'superuser' });
    const result = await getBoardPermission(client, BOARD, USER);
    expect(['reader', 'commenter', 'editor', 'moderator', 'admin']).not.toContain(result);
  });
});
