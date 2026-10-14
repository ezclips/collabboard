import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-361. A source guard over the avatars upload-policies migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the four policies, the
 * insert name check, the owner checks and the drift guard.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014150000_avatars_upload_policies.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

const POLICIES = [
  'avatars_insert_own_name',
  'avatars_select_own',
  'avatars_update_own',
  'avatars_delete_own',
];

describe('PATCH-361 avatars upload-policies migration', () => {
  it('creates the four permissive policies for the avatars bucket', () => {
    for (const name of POLICIES) {
      expect(source, name).toContain(`CREATE POLICY ${name} ON storage.objects`);
      expect(source, name).toContain(`DROP POLICY IF EXISTS ${name} ON storage.objects;`);
    }
    expect(source).toContain('AS PERMISSIVE FOR INSERT TO authenticated');
    expect(source).toContain('AS PERMISSIVE FOR SELECT TO authenticated');
    expect(source).toContain('AS PERMISSIVE FOR UPDATE TO authenticated');
    expect(source).toContain('AS PERMISSIVE FOR DELETE TO authenticated');
  });

  it('requires the caller id to appear in the object name on INSERT', () => {
    expect(source).toContain('position((select auth.uid())::text in name) > 0');
  });

  it('checks owner_id on SELECT, UPDATE and DELETE', () => {
    expect(source).toContain('owner_id = (select auth.uid())::text');
    // SELECT (1) + UPDATE (USING + WITH CHECK = 2) + DELETE (1).
    expect((source.match(/owner_id = \(select auth\.uid\(\)\)::text/g) ?? []).length).toBe(4);
  });

  it('targets the avatars bucket', () => {
    expect((source.match(/bucket_id = 'avatars'/g) ?? []).length).toBe(5);
  });

  it('has the drift guard that aborts on an unexpected live policy', () => {
    expect(source).toContain('DRIFT GUARD');
    expect(source).toContain('ILIKE \'%avatars%\'');
    for (const name of POLICIES) {
      expect(source, name).toContain(`'${name}'`);
    }
    expect(source).toContain('Re-review before applying');
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
