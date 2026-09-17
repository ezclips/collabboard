import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REVOKE_ANON_EXECUTE_SECURITY_DEFINER_1 -- the shipped artifacts.
 *
 * This migration is nothing but grant changes, so there is no body to digest
 * and no behaviour to exercise: the artifacts ARE the change. What can be
 * proven here is that it revokes exactly the thirteen provably-safe signatures
 * and not one more -- in particular that no Group B name and no PostGIS
 * function is caught up in it, since revoking a Group B function without first
 * narrowing its policies would turn anonymous reads into errors rather than
 * empty results.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260916140000_revoke_anon_execute_security_definer.sql';
const ROLLOUT = 'supabase/production-rollouts/20260916140000_revoke_anon_execute_security_definer.sql';
const VERIFY = 'supabase/production-rollouts/20260916140000_revoke_anon_execute_security_definer_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260916140000_revoke_anon_execute_security_definer_rollback.sql';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);

/** Statements only. Prose naming a verb is not the verb. */
const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const migrationStatements = statementsOf(migration);
const verifierStatements = statementsOf(verifier);
const rollbackStatements = statementsOf(rollbackScript);

/** The thirteen, exactly as the migration must name them. */
const GROUP_A = [
  'public.is_board_member(uuid, uuid)',
  'public.can_read_board(uuid, uuid)',
  'public.can_comment_board(uuid, uuid)',
  'public.can_manage_board(uuid, uuid)',
  'public.can_edit_workspace(uuid, uuid)',
  'public.get_board_members_with_profile(uuid)',
  'public.log_canvas_activity(uuid, uuid, text, jsonb)',
  'public.handle_new_user()',
  'public.handle_new_canvas()',
  'public.is_canvas_admin(uuid, uuid)',
  'public.get_canvas_with_permission(uuid, uuid)',
  'public.check_canvas_permission(uuid, uuid, public.permission_level)',
  'public.check_canvas_permission(uuid, uuid, text)',
] as const;

/** Left anon-executable ON PURPOSE: live policies TO public reference them. */
const GROUP_B = [
  'can_access_board', 'can_edit_board', 'can_manage_workspace',
  'get_workspace_role', 'has_workspace_access', 'is_platform_admin',
] as const;

describe('the migration revokes exactly the thirteen', () => {
  it('1. every Group A signature is revoked from PUBLIC and anon', () => {
    for (const sig of GROUP_A) {
      expect(migrationStatements, sig)
        .toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, anon;`);
    }
  });

  it('2. there are exactly thirteen REVOKE statements -- no more, no fewer', () => {
    const revokes = migrationStatements.match(/^REVOKE EXECUTE ON FUNCTION/gm) ?? [];
    expect(revokes).toHaveLength(GROUP_A.length);
    expect(revokes).toHaveLength(13);
  });

  it('3. it GRANTS nothing -- this migration only takes away', () => {
    expect(migrationStatements).not.toMatch(/\bGRANT\b/);
  });

  it('4. no Group B name appears in any REVOKE', () => {
    // Revoking one of these would not deny an anonymous query -- it would make
    // it ERROR during policy evaluation. That is a behaviour change and it
    // belongs to its own unit, after the policies are narrowed.
    for (const name of GROUP_B) {
      for (const line of migrationStatements.split('\n')) {
        if (line.includes('REVOKE')) {
          expect(line, `${name} must not be revoked here`).not.toContain(name);
        }
      }
    }
  });

  it('5. PostGIS is untouched', () => {
    // st_estimatedextent is the extension's, not ours to re-grant.
    expect(migrationStatements).not.toContain('st_estimatedextent');
    expect(migration, 'and the header should say why').toContain('st_estimatedextent');
  });

  it('6. authenticated and service_role are never revoked', () => {
    // Policy expressions evaluate as the INVOKING role, and the app's own RPC
    // calls run on session clients. Revoking either would break real callers.
    for (const role of ['authenticated', 'service_role']) {
      for (const line of migrationStatements.split('\n')) {
        if (line.includes('REVOKE')) {
          expect(line, `${role} must keep EXECUTE`).not.toContain(role);
        }
      }
    }
  });

  it('7. both check_canvas_permission overloads are named explicitly', () => {
    // Revoking one signature leaves the other reachable; the enum is
    // schema-qualified so the right overload resolves regardless of search_path.
    expect(migrationStatements).toContain('check_canvas_permission(uuid, uuid, public.permission_level)');
    expect(migrationStatements).toContain('check_canvas_permission(uuid, uuid, text)');
  });

  it('8. the header records what is NOT closed', () => {
    // A reader must not come away believing the surface is shut.
    for (const name of GROUP_B) expect(migration, name).toContain(name);
    // Comment prose wraps, so compare against the header with its `--` markers
    // and line breaks flattened -- the claim is the words, not the layout.
    const prose = migration.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/DOES NOT CLAIM THE SURFACE IS CLOSED/i);
    expect(prose).toMatch(/six functions remain anon-executable/i);
  });
});

describe('the rollout and verifier', () => {
  it('9. the rollout names its source migration and ships the same revokes', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    for (const sig of GROUP_A) {
      expect(statementsOf(rollout), sig)
        .toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, anon;`);
    }
    expect((statementsOf(rollout).match(/^REVOKE EXECUTE ON FUNCTION/gm) ?? [])).toHaveLength(13);
  });

  it('10. the verifier is genuinely read only, and changes no grant itself', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd()).toMatch(/ROLLBACK;$/);
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ',
      'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
  });

  it('11. the verifier checks all thirteen, plus the two the app calls', () => {
    for (const sig of GROUP_A) expect(verifier, sig).toContain(sig);
    expect(verifier).toContain("has_function_privilege('anon'");
    expect(verifier).toContain("has_function_privilege('authenticated'");
    expect(verifier).toContain("has_function_privilege('service_role'");
  });

  it('12. the verifier PINS the remaining surface by equality, not by count', () => {
    // A count would pass while one name was swapped for another.
    for (const name of GROUP_B) expect(verifier, name).toContain(name);
    expect(verifier).toContain('EXCEPT SELECT proname FROM expected_remaining');
    expect(verifier).toContain('EXCEPT SELECT proname FROM remaining');
    expect(verifier).toContain("THEN 'PASS' ELSE 'FAIL' END");
    expect(verifier).toContain('AS remaining_surface');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('13. the verifier excludes extension-owned functions, so PostGIS never appears', () => {
    expect(verifier).toContain('pg_extension');
    expect(verifier).toContain("d.deptype = 'e'");
  });
});

describe('the rollback re-grants only', () => {
  it('14. it grants back exactly the thirteen, with the same signatures', () => {
    for (const sig of GROUP_A) {
      expect(rollbackStatements, sig)
        .toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO PUBLIC, anon;`);
    }
    expect((rollbackStatements.match(/^GRANT EXECUTE ON FUNCTION/gm) ?? [])).toHaveLength(13);
  });

  it('15. it revokes nothing -- a rollback undoes, it does not also change', () => {
    expect(rollbackStatements).not.toMatch(/\bREVOKE\b/);
  });

  it('16. it says plainly that running it re-opens an anonymous oracle surface', () => {
    // Nobody should reach for this file without reading what it does.
    expect(rollbackScript).toMatch(/RE-OPENS AN ANONYMOUS ORACLE SURFACE/i);
    expect(rollbackScript).toMatch(/member list/i);
    expect(rollbackScript).toMatch(/only to undo/i);
    // And it points at the safe alternative rather than leaving one to guess.
    expect(rollbackScript).toMatch(/never to PUBLIC or anon/i);
  });
});
