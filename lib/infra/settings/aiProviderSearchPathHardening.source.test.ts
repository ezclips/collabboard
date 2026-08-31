import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural proof for the BYOK search_path hardening migration.
 *
 * Production's security advisor flagged `function_search_path_mutable` on the
 * Phase 1A ownership trigger while the Phase 2A atomic functions already
 * pinned `search_path`. This suite locks in the correction AND the reason it
 * was safe: the migration alters configuration only, so the reviewed function
 * body, its trigger binding and its privileges are untouched.
 *
 * Source-level, like its neighbours: this repository has no live-database
 * harness, so the behavioural half (the trigger still rejecting a cross-user
 * connection under an empty search_path) was proven against a disposable local
 * Supabase during the release gate, not here.
 */

const ROOT = resolve(__dirname, '../../..');
const MIGRATIONS = 'supabase/migrations';
const HARDENING = '20260831200442_harden_ai_role_preferences_search_path.sql';
const FOUNDATION = '20260831120000_create_ai_provider_foundation.sql';
const ATOMIC = '20260831140000_add_ai_provider_atomic_functions.sql';

const FUNCTION = 'public.ai_role_preferences_enforce_connection_ownership()';

function read(file: string): string {
  return readFileSync(resolve(ROOT, MIGRATIONS, file), 'utf8');
}

/** Executable SQL only: the migration's prose names the constructs it avoids. */
function executable(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const comment = line.indexOf('--');
      return comment === -1 ? line : line.slice(0, comment);
    })
    .join('\n')
    .trim();
}

const sql = executable(read(HARDENING));

describe('BYOK ownership trigger search_path hardening', () => {
  it('1. is a forward-only migration ordered after both deployed BYOK migrations', () => {
    const version = HARDENING.slice(0, HARDENING.indexOf('_'));
    expect(version).toMatch(/^\d{14}$/);
    expect(Number(version)).toBeGreaterThan(20260831140000);
  });

  it('2. pins an empty search_path on the ownership trigger function', () => {
    expect(sql).toContain(`ALTER FUNCTION ${FUNCTION}`);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*''/);
  });

  it('3. alters configuration only -- it never redefines the function', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toContain('DROP FUNCTION');
    // The reviewed body must not be restated here in any form.
    expect(sql).not.toContain('RAISE EXCEPTION');
    expect(sql).not.toContain('BEGIN');
  });

  it('4. leaves the trigger binding alone', () => {
    expect(sql).not.toContain('CREATE TRIGGER');
    expect(sql).not.toContain('DROP TRIGGER');
  });

  it('5. changes no table, policy or privilege', () => {
    for (const forbidden of [
      'CREATE TABLE',
      'ALTER TABLE',
      'DROP TABLE',
      'CREATE POLICY',
      'DROP POLICY',
      'GRANT',
      'REVOKE',
    ]) {
      expect(sql, `${forbidden} is out of scope for this migration`).not.toContain(forbidden);
    }
  });

  it('6. does not introduce SECURITY DEFINER', () => {
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  it('7. is exactly one statement', () => {
    const statements = sql.split(';').filter((part) => part.trim().length > 0);
    expect(statements).toHaveLength(1);
  });

  it('8. leaves the already-deployed migrations untouched', () => {
    // Both are applied in production; editing either would desynchronise
    // migration history rather than correct it.
    const foundation = read(FOUNDATION);
    expect(foundation).toContain(
      'CREATE OR REPLACE FUNCTION public.ai_role_preferences_enforce_connection_ownership()',
    );
    // The fix deliberately did NOT go into the original file.
    expect(executable(foundation)).not.toMatch(
      /ALTER FUNCTION public\.ai_role_preferences_enforce_connection_ownership/,
    );
    expect(read(ATOMIC)).toContain('SECURITY INVOKER');
  });

  it('9. brings every BYOK function to one search_path standard', () => {
    const atomic = executable(read(ATOMIC));
    // The two atomic functions already pinned it; the trigger now matches.
    expect(atomic.match(/SET search_path = ''/g)).toHaveLength(2);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*''/);
  });
});
