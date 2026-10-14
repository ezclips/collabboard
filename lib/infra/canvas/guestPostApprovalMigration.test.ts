import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-367. A source guard over the guest-post-approval migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the column, the reviewer
 * authorizer, the guest + flag condition on insert, the reviewer-only removal on
 * update, the restrictive SELECT policy with its short-circuit first term, the
 * switch guard, and the self-check.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014200000_guest_post_approval.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('PATCH-367 guest-post-approval migration', () => {
  it('adds the column and the reviewer authorizer', () => {
    expect(source).toContain(
      'ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS guest_posts_need_approval boolean NOT NULL DEFAULT false;',
    );
    expect(source).toContain('FUNCTION public.can_review_board_posts(b uuid)');
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
    expect(source).toContain('IF board_user = auth.uid() THEN');
    expect(source).toContain("public.get_board_permission(b, auth.uid())::text = 'admin'");
    expect(source).toContain('REVOKE ALL ON FUNCTION public.can_review_board_posts(uuid) FROM PUBLIC, anon;');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.can_review_board_posts(uuid) TO authenticated, service_role;');
  });

  it('stamps a guest post pending on INSERT only when the board asks for it', () => {
    expect(source).toContain('FUNCTION public.guard_padlet_approval()');
    expect(source).toContain("NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'pendingApproval';");
    expect(source).toContain('IF public.is_guest() AND needs_approval IS TRUE THEN');
    expect(source).toContain("jsonb_build_object('pendingApproval', true)");
    // Service role passes unchanged.
    expect(source).toContain('IF auth.uid() IS NULL THEN');
  });

  it('lets only a reviewer remove the key on UPDATE, and forces it back for everyone else', () => {
    expect(source).toContain('IF public.can_review_board_posts(coalesce(NEW.board_id, NEW.canvas_id)) THEN');
    expect(source).toContain("IF OLD.metadata ? 'pendingApproval' THEN");
    expect(source).toContain("jsonb_build_object('pendingApproval', OLD.metadata -> 'pendingApproval')");
  });

  it('creates the restrictive SELECT policy with the short-circuit first term', () => {
    expect(source).toContain('DROP POLICY IF EXISTS padlets_pending_hidden ON public.padlets;');
    expect(source).toContain('CREATE POLICY padlets_pending_hidden ON public.padlets');
    expect(source).toContain('AS RESTRICTIVE FOR SELECT TO authenticated');
    // The normal-post term comes FIRST, so a function call is skipped unless pending.
    const using = source.slice(source.indexOf('USING ('));
    const firstTerm = using.slice(0, using.indexOf('OR'));
    expect(firstTerm).toContain("(metadata->>'pendingApproval') IS NULL");
    expect(source).toContain("metadata->>'createdBy' = (select auth.uid())::text");
    expect(source).toContain('public.can_review_board_posts(coalesce(board_id, canvas_id))');
  });

  it('guards the switch with its own trigger (owner/admin only)', () => {
    expect(source).toContain('FUNCTION public.guard_board_guest_approval()');
    expect(source).toContain('BEFORE UPDATE OF guest_posts_need_approval ON public.boards');
    expect(source).toContain('DROP TRIGGER IF EXISTS boards_guard_guest_approval ON public.boards;');
    expect(source).toContain('CREATE TRIGGER boards_guard_guest_approval');
    expect(source).toContain("USING ERRCODE = '42501'");
    expect(source).toContain('REVOKE EXECUTE ON FUNCTION public.guard_board_guest_approval() FROM PUBLIC, anon, authenticated;');
  });

  it('creates the padlets approval trigger', () => {
    expect(source).toContain('DROP TRIGGER IF EXISTS padlets_guard_approval ON public.padlets;');
    expect(source).toContain('CREATE TRIGGER padlets_guard_approval');
    expect(source).toContain('BEFORE INSERT OR UPDATE OF metadata ON public.padlets');
    expect(source).toContain('EXECUTE FUNCTION public.guard_padlet_approval();');
  });

  it('self-checks the column, functions, triggers and policy', () => {
    expect(source).toContain("column_name = 'guest_posts_need_approval'");
    expect(source).toContain("to_regprocedure('public.can_review_board_posts(uuid)') IS NULL");
    expect(source).toContain("to_regprocedure('public.guard_padlet_approval()') IS NULL");
    expect(source).toContain("to_regprocedure('public.guard_board_guest_approval()') IS NULL");
    expect(source).toContain("tgname = 'padlets_guard_approval'");
    expect(source).toContain("tgname = 'boards_guard_guest_approval'");
    expect(source).toContain("policyname = 'padlets_pending_hidden'");
    expect(source).toContain("policy_kind <> 'RESTRICTIVE'");
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
