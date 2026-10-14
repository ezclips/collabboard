import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-364. A source guard over the padlet creator-stamp migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the trigger, the
 * anti-spoof strip on both INSERT and UPDATE, the guest flag and the revoke.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014180000_padlet_creator_stamp.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('PATCH-364 padlet creator-stamp migration', () => {
  it('defines the trigger function and trigger', () => {
    expect(source).toContain('FUNCTION public.stamp_padlet_creator()');
    expect(source).toContain('CREATE TRIGGER padlets_stamp_creator');
    expect(source).toContain('BEFORE INSERT OR UPDATE OF metadata ON public.padlets');
    expect(source).toContain('DROP TRIGGER IF EXISTS padlets_stamp_creator ON public.padlets;');
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
  });

  it('strips any client-sent stamp on INSERT and on UPDATE', () => {
    // Both the INSERT and the UPDATE branch strip the keys.
    expect((source.match(/- 'createdBy' - 'createdByGuest'/g) ?? []).length).toBe(2);
  });

  it('stamps auth.uid() and the guest flag only for a signed-in user', () => {
    expect(source).toContain("jsonb_build_object('createdBy', auth.uid()::text)");
    expect(source).toContain('IF auth.uid() IS NOT NULL THEN');
    expect(source).toContain('IF public.is_guest() THEN');
    expect(source).toContain("jsonb_build_object('createdByGuest', true)");
  });

  it('copies the stored stamp back on UPDATE', () => {
    expect(source).toContain("IF OLD.metadata ? 'createdBy' THEN");
    expect(source).toContain("IF OLD.metadata ? 'createdByGuest' THEN");
    expect(source).toContain("OLD.metadata -> 'createdBy'");
  });

  it('is trigger-only (no EXECUTE for anyone)', () => {
    expect(source).toContain(
      'REVOKE EXECUTE ON FUNCTION public.stamp_padlet_creator() FROM PUBLIC, anon, authenticated;',
    );
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
