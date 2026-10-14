import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-362. A source guard over the board-access sync migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the two triggers and their
 * functions, the depth guard, the admin/owner exclusion and the revokes.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014160000_board_access_sync.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('PATCH-362 board-access sync migration', () => {
  it('defines both sync functions', () => {
    expect(source).toContain('FUNCTION public.sync_kanban_after_collaborator_change()');
    expect(source).toContain('FUNCTION public.sync_collaborator_after_kanban_member_delete()');
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
  });

  it('creates both triggers', () => {
    expect(source).toContain('CREATE TRIGGER board_collaborators_sync_kanban');
    expect(source).toContain('AFTER DELETE OR UPDATE OF role ON public.board_collaborators');
    expect(source).toContain('CREATE TRIGGER kanban_board_members_sync_collaborator');
    expect(source).toContain('AFTER DELETE ON public.kanban_board_members');
    expect(source).toContain('DROP TRIGGER IF EXISTS');
  });

  it('has the depth guard in both functions (no loop)', () => {
    expect((source.match(/pg_trigger_depth\(\) > 1/g) ?? []).length).toBe(2);
  });

  it('mirrors the role and excludes admin/owner', () => {
    expect(source).toContain("WHEN 'editor'    THEN 'edit'");
    expect(source).toContain("WHEN 'commenter' THEN 'comment'");
    expect(source).toContain("ELSE 'view'");
    expect(source).toContain("permission_level <> 'admin'");
    expect(source).toContain("coalesce(role, '') <> 'owner'");
    // The reverse trigger deletes the collaborator row.
    expect(source).toContain('DELETE FROM public.board_collaborators');
  });

  it('revokes EXECUTE from everyone (trigger-only functions)', () => {
    expect(source).toContain(
      'REVOKE EXECUTE ON FUNCTION public.sync_kanban_after_collaborator_change() FROM PUBLIC, anon, authenticated;',
    );
    expect(source).toContain(
      'REVOKE EXECUTE ON FUNCTION public.sync_collaborator_after_kanban_member_delete() FROM PUBLIC, anon, authenticated;',
    );
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
