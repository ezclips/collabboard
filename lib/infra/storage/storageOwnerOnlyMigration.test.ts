import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-359. A source guard over the storage owner-only-writes migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the six drops, the two new
 * owner-checked policies, the five bucket names, the drift guard and the
 * self-check.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014130000_storage_owner_only_writes.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

const BUCKETS = [
  'padlet-files', 'thumbnails', 'canvas-wallpapers', 'board-backgrounds', 'canvas-icons',
];

const DROPPED = [
  'Give users access to own folder',
  'Users can delete own files',
  'Users can delete their thumbnails',
  'Users can update their thumbnails',
  'Allow authenticated deletes',
  'Allow public uploads fjopzy_0',
];

describe('PATCH-359 storage owner-only-writes migration', () => {
  it('drops the six bucket-only policies by exact name', () => {
    for (const name of DROPPED) {
      expect(source, name).toContain(`DROP POLICY IF EXISTS "${name}" ON storage.objects;`);
    }
  });

  it('creates the two owner-checked permissive policies', () => {
    expect(source).toContain('CREATE POLICY storage_owner_update ON storage.objects');
    expect(source).toContain('CREATE POLICY storage_owner_delete ON storage.objects');
    expect(source).toContain('AS PERMISSIVE FOR UPDATE TO authenticated');
    expect(source).toContain('AS PERMISSIVE FOR DELETE TO authenticated');
    // Both policies check the owner, once per statement.
    expect(source).toContain('owner_id = (select auth.uid())::text');
    expect((source.match(/owner_id = \(select auth\.uid\(\)\)::text/g) ?? []).length).toBe(3);
  });

  it('covers all five buckets', () => {
    for (const bucket of BUCKETS) {
      expect(source, bucket).toContain(bucket);
    }
  });

  it('has the drift guard that aborts on an unexpected live policy', () => {
    expect(source).toContain('DRIFT GUARD');
    expect(source).toContain('p.policyname NOT LIKE \'guest_no_storage_%\'');
    // The six known names are exempted from the guard.
    for (const name of DROPPED) {
      expect(source, name).toContain(`'${name}'`);
    }
    // This migration's own policies are exempted too, so a re-run passes.
    expect(source).toContain("'storage_owner_update'");
    expect(source).toContain("'storage_owner_delete'");
    expect(source).toContain("this migration's own policies: a re-run must pass");
    expect(source).toContain('Re-review before applying');
  });

  it('has the self-check that requires owner_id after the change', () => {
    expect(source).toContain('SELF-CHECK');
    expect(source).toContain('NOT ILIKE \'%owner_id%\'');
    expect(source).toContain('still do not check owner_id');
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
