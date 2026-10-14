import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GUEST_ALIAS_SQL } from '@/lib/domain/presence/guestAlias';

/**
 * PATCH-368. A source guard over the hide-guest-names migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the column, the switch
 * guard, the RPC body copied from PATCH-360 with ONLY display_name/avatar_url
 * changed, and the self-check.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014210000_hide_guest_names.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('PATCH-368 hide-guest-names migration', () => {
  it('adds the column and the switch guard', () => {
    expect(source).toContain(
      'ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS hide_guest_names boolean NOT NULL DEFAULT false;',
    );
    expect(source).toContain('FUNCTION public.guard_board_hide_guest_names()');
    expect(source).toContain('BEFORE UPDATE OF hide_guest_names ON public.boards');
    expect(source).toContain('DROP TRIGGER IF EXISTS boards_guard_hide_guest_names ON public.boards;');
    expect(source).toContain('CREATE TRIGGER boards_guard_hide_guest_names');
    expect(source).toContain("USING ERRCODE = '42501'");
    expect(source).toContain('REVOKE EXECUTE ON FUNCTION public.guard_board_hide_guest_names() FROM PUBLIC, anon, authenticated;');
  });

  it('recreates the 360 RPC with the same signature, return table, security and grants', () => {
    expect(source).toContain('FUNCTION public.get_board_members_with_profile(board_id uuid)');
    expect(source).toContain(
      'RETURNS TABLE(id uuid, canvas_id uuid, user_id uuid, role text, permission_level text, sort_by text, sort_order text, group_by text, date_format text, created_at timestamp with time zone, email text, display_name text, avatar_url text)',
    );
    expect(source).toContain('STABLE SECURITY DEFINER');
    expect(source).toContain("SET search_path TO 'public', 'auth'");
    expect(source).toContain('REVOKE EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) FROM PUBLIC, anon;');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) TO authenticated, service_role;');
    // The email rule and the access check are unchanged from 360.
    expect(source).toContain('CASE WHEN (select public.is_guest()) THEN NULL ELSE u.email END');
    expect(source).toContain('FROM kanban_board_members m');
    expect(source).toContain('JOIN auth.users u ON u.id = m.user_id');
    expect(source).toContain('EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid())');
    expect(source).toContain('viewer.canvas_id = board_id AND viewer.user_id = auth.uid()');
  });

  it('hides ONLY another anonymous member, with the alias and no avatar', () => {
    expect(source).toContain(GUEST_ALIAS_SQL);
    expect(source).toContain('u.is_anonymous');
    expect(source).toContain('u.id <> auth.uid()');
    expect(source).toContain('(SELECT b.hide_guest_names FROM public.boards b WHERE b.id = board_id) IS TRUE');
    // Two changes only: the display_name CASE and the avatar_url CASE.
    expect(source).toContain('END AS display_name');
    expect(source).toContain('END AS avatar_url');
    expect(source).toContain("ELSE u.raw_user_meta_data->>'avatar_url'");
  });

  it('self-checks the column, trigger and function', () => {
    expect(source).toContain("column_name = 'hide_guest_names'");
    expect(source).toContain("tgname = 'boards_guard_hide_guest_names'");
    expect(source).toContain("to_regprocedure('public.get_board_members_with_profile(uuid)') IS NULL");
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
