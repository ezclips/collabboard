import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-360. A source guard over the Kanban share-access migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the guest email CASE, the
 * display_name fallback chain, the revoke/grant, and the backfill's ON CONFLICT.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014140000_kanban_share_access.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('PATCH-360 kanban share-access migration', () => {
  it('withholds email from a guest', () => {
    expect(source).toContain('CASE WHEN (select public.is_guest()) THEN NULL ELSE u.email END');
  });

  it('falls back through name, full_name, display_name, then Member/email', () => {
    expect(source).toContain(
      "COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', CASE WHEN (select public.is_guest()) THEN 'Member' ELSE u.email END)",
    );
  });

  it('keeps the signature, return table and access check', () => {
    expect(source).toContain('get_board_members_with_profile(board_id uuid)');
    expect(source).toContain('RETURNS TABLE(id uuid, canvas_id uuid, user_id uuid');
    expect(source).toContain('STABLE SECURITY DEFINER');
    expect(source).toContain("SET search_path TO 'public', 'auth'");
    // The access check is unchanged: owner OR a Kanban member viewer.
    expect(source).toContain('FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid()');
    expect(source).toContain('FROM kanban_board_members viewer');
  });

  it('revokes from PUBLIC/anon and grants to authenticated/service_role', () => {
    expect(source).toContain(
      'REVOKE EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) FROM PUBLIC, anon;',
    );
    expect(source).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) TO authenticated, service_role;',
    );
  });

  it('backfills kanban membership from board_collaborators, idempotently', () => {
    expect(source).toContain('INSERT INTO public.kanban_board_members (canvas_id, user_id, role, permission_level)');
    expect(source).toContain('FROM public.board_collaborators c');
    expect(source).toContain("WHEN 'editor'    THEN 'edit'");
    expect(source).toContain("WHEN 'commenter' THEN 'comment'");
    expect(source).toContain('ON CONFLICT (canvas_id, user_id) DO NOTHING');
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
