import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REPAIR_GET_BOARD_PERMISSION_1 -- the shipped artifacts.
 *
 * `[db.migrations] enabled = false` in config.toml and supabase/BASELINE.md
 * records that supabase/migrations/ does NOT rebuild the live database, so a
 * migration reaches production only through its production-rollouts copy. This
 * change ships a TRIO rather than the usual pair, because it is a bug fix AND a
 * security correction and the undo of one must not undo the other.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260916130000_repair_get_board_permission.sql';
const ROLLOUT = 'supabase/production-rollouts/20260916130000_repair_get_board_permission.sql';
const VERIFY = 'supabase/production-rollouts/20260916130000_repair_get_board_permission_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260916130000_repair_get_board_permission_rollback.sql';
const BASELINE = 'supabase/baseline/schema_snapshot_2026-07-05.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');
const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);

/** Statements only. Prose about a verb is not the verb. */
const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const verifierStatements = statementsOf(verifier);
const rollbackStatements = statementsOf(rollbackScript);

/** The plpgsql body of get_board_permission, between its AS $…$ and the close. */
function bodyOf(sql: string): string | null {
  const at = sql.search(/CREATE OR REPLACE FUNCTION\s+"?public"?\.\s*"?get_board_permission"?/);
  if (at < 0) return null;
  const open = sql.slice(at).match(/AS \$(\w*)\$/);
  if (!open) return null;
  const tag = `$${open[1]}$`;
  const from = sql.indexOf(`AS ${tag}`, at) + `AS ${tag}`.length;
  return sql.slice(from, sql.indexOf(`${tag};`, from));
}

describe('the rollout trio ships together', () => {
  it('1. migration, rollout, verifier and rollback all exist', () => {
    for (const [name, text] of [[MIGRATION, migration], [ROLLOUT, rollout],
      [VERIFY, verifier], [ROLLBACK, rollbackScript]] as const) {
      expect(text.length, name).toBeGreaterThan(0);
    }
  });

  it('2. the rollout names the reviewed migration as its source and ships its body', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    expect(bodyOf(rollout), 'byte-faithful function body').toBe(bodyOf(migration));
  });

  it('3. the repaired body reads boards, never canvases', () => {
    const body = bodyOf(migration)!;
    expect(body).toContain('public.boards');
    expect(body).toContain('public.board_collaborators');
    // The point of the repair: `canvases` holds one row and no board in use,
    // so a surviving READ of it is a silent deny waiting to happen.
    //
    // Matched on 'FROM canvases', not the bare word: the body's own comments
    // name `canvases` to explain what it stopped reading and why. A bare-word
    // test would fail correct code -- it would be testing the explanation. The
    // verifier matches the same way against prosrc, for the same reason.
    expect(body).not.toContain('FROM canvases');
    expect(body).not.toContain('canvas_collaborators');
    // The comments that DO name it are the record of the repair; keep them.
    expect(body).toContain('canvases');
  });

  it('3b. the verifier matches the same way, so a correct apply cannot read as FAIL', () => {
    // prosrc includes comments. If the verifier tested the bare word it would
    // report FAIL for a perfectly repaired function -- the worst kind of check,
    // because the reflex is then to "fix" working code.
    expect(verifier).toContain("position('FROM canvases' IN src) = 0");
    expect(verifier).not.toMatch(/position\('canvases' IN src\) = 0/);
  });

  it('4. the repaired body preserves the signature and attributes callers depend on', () => {
    expect(migration).toContain('user_uuid uuid DEFAULT auth.uid()');
    expect(migration).toContain('RETURNS board_permission_level');
    expect(migration).toContain('STABLE SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO 'public'");
  });

  it('5. the migration revokes PUBLIC and anon, and leaves authenticated alone', () => {
    // The security half. A SECURITY DEFINER function answering "what permission
    // does user X have on board Y" must not be reachable without authenticating.
    expect(statementsOf(migration)).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_board_permission\(uuid, uuid\)\s*\n?\s*FROM PUBLIC, anon;/);
    expect(statementsOf(migration)).not.toMatch(/REVOKE[\s\S]*?\bauthenticated\b/);
    // And it grants nothing back.
    expect(statementsOf(migration)).not.toMatch(/\bGRANT\b/);
  });
});

describe('the verifier contract', () => {
  it('6. is genuinely read only, and revokes nothing itself', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd()).toMatch(/ROLLBACK;$/);
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ',
      'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
    expect(verifierStatements, 'a verifier must not change grants').not.toMatch(/\bREVOKE\b/);
  });

  it('7. asserts both halves -- the repair AND the grants', () => {
    // Either half without the other is a bad outcome, so both are pinned.
    expect(verifier).toContain('public.boards');
    expect(verifier).toContain('canvases');
    expect(verifier).toContain("has_function_privilege('anon'");
    expect(verifier).toContain("has_function_privilege('authenticated'");
    expect(verifier).toContain("has_function_privilege('service_role'");
    expect(verifier).toContain('board_permission_level');
    expect(verifier).toContain('DEFAULT auth.uid()');
    expect(verifier).toContain('search_path');
  });

  it('8. ends with a roll-up, and readiness cannot drift from the rows', () => {
    expect(verifier).toContain("THEN 'PASS' ELSE 'FAIL' END");
    expect(verifier).toContain('AS rollup');
    expect(verifier).toContain('AS anon_can_execute');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });
});

describe('the rollback undoes the fix and NOT the security correction', () => {
  it('9. restores the previous body verbatim from the baseline snapshot', () => {
    // A rollback that ships a retyped or "tidied" body is not a rollback.
    expect(bodyOf(rollbackScript)).toBe(bodyOf(read(BASELINE)));
    // Which means it really does re-point at the legacy vertical.
    expect(bodyOf(rollbackScript)).toContain('canvases');
  });

  it('10. NEVER re-grants EXECUTE to PUBLIC or anon', () => {
    // The revoke is a security correction, not part of the bug fix. The hole
    // existed before the rollout and was hidden only by the function being
    // broken; restoring the broken body would hide it again, not close it.
    expect(rollbackStatements, 'a rollback must not re-create an anonymous oracle')
      .not.toMatch(/\bGRANT\b/);
    expect(rollbackStatements).not.toMatch(/\bTO\s+(PUBLIC|anon)\b/);
    expect(rollbackStatements).not.toMatch(/\banon\b/);
  });

  it('11. says plainly that running it re-breaks sharing', () => {
    // Nobody should discover that from a 500 in production.
    expect(rollbackScript).toMatch(/RE-BREAKS SHARING/i);
    expect(rollbackScript).toContain('42703');
    expect(rollbackScript).toMatch(/NOT RE-GRANT PUBLIC OR anon/i);
  });
});
