import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * INVITE_CREDENTIALS_SERVER_SIDE_1 -- the shipped SQL artifacts.
 *
 * This migration is the one in the series that DOES restate a policy
 * expression, because here the expression is the defect: the link branch is
 * what published link_code and the plaintext password. Every other migration in
 * this series is guarded against restating a predicate; this one is guarded the
 * other way -- the new predicate must be exactly the manager check, with no
 * trace of the branch it replaces.
 *
 * The behaviour half of the unit (the preview route, the page, the code
 * generator) is tested in lib/server/invitations/invitePreviewRoute.test.ts.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260916170000_invite_credentials_server_side.sql';
const ROLLOUT = 'supabase/production-rollouts/20260916170000_invite_credentials_server_side.sql';
const VERIFY = 'supabase/production-rollouts/20260916170000_invite_credentials_server_side_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260916170000_invite_credentials_server_side_rollback.sql';

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

/** Comment prose wraps, so claims are matched against a flattened header. */
const proseOf = (sql: string) => sql.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
const rollbackProse = proseOf(rollbackScript);

const LINK_POLICY = 'Anyone can view an active link invitation';
const MANAGER_POLICY = 'Workspace managers can view invitations';

describe('the migration closes the anonymous read', () => {
  it('1. anon loses every privilege on the table, not only SELECT', () => {
    // The default ACL grants ALL. Revoking SELECT alone would leave an
    // anonymous caller able to INSERT and UPDATE invitations.
    expect(migrationStatements)
      .toContain('REVOKE ALL ON TABLE public.workspace_invitations FROM anon;');
    expect(migrationStatements.match(/^REVOKE /gm) ?? []).toHaveLength(1);
  });

  it('2. the anonymous link-branch policy is dropped, and loudly', () => {
    expect(migrationStatements)
      .toContain(`DROP POLICY "${LINK_POLICY}" ON public.workspace_invitations;`);
    // No IF EXISTS: this migration depends on 20260916150000 having created
    // that policy, and an out-of-order apply must fail rather than silently
    // leave the link branch serving credentials.
    expect(migrationStatements).not.toContain('DROP POLICY IF EXISTS');
    expect(migration, 'and the header must say why').toContain('20260916150000');
  });

  it('3. the manager policy is rewritten to the manager check alone', () => {
    const alters = migrationStatements.match(/ALTER POLICY /g) ?? [];
    expect(alters).toHaveLength(1);
    expect(migrationStatements).toContain(`ALTER POLICY "${MANAGER_POLICY}"`);
    expect(migrationStatements).toContain('USING (can_manage_workspace(workspace_id));');
  });

  it('4. no statement leaves a link branch or a credential column behind', () => {
    // The point of the migration. After it, no predicate on this table may
    // mention the bearer code, the password, or the link type.
    const afterDrop = migrationStatements.slice(migrationStatements.indexOf('ALTER POLICY'));
    expect(afterDrop).not.toContain('link_code');
    expect(afterDrop).not.toContain('password');
    expect(afterDrop).not.toContain("'link'");
    expect(afterDrop).not.toContain('max_uses');
    expect(afterDrop).not.toContain('redeemed_at');
  });

  it('5. it grants nothing and touches no other table', () => {
    expect(migrationStatements).not.toMatch(/\bGRANT\b/);
    expect(migrationStatements).not.toMatch(/\bCREATE POLICY\b/);
    const tables = [...migrationStatements.matchAll(/public\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(['workspace_invitations']));
  });

  it('6. it is one transaction, so a partial apply is impossible', () => {
    expect(migrationStatements).toMatch(/^BEGIN;$/m);
    expect(migrationStatements).toMatch(/^COMMIT;$/m);
  });

  it('7. the header records both findings and what is already correct', () => {
    const prose = migration.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    // F1 -- the row publishes its own key.
    expect(prose).toMatch(/plaintext `?password`?/i);
    // F2 -- the code was not credential-grade.
    expect(prose).toMatch(/Math\.random\(\)/);
    expect(prose).toMatch(/crypto\.randomBytes/);
    // The route that must NOT be rebuilt.
    expect(prose).toMatch(/accept\/route\.ts is sound and unchanged/i);
    // Why a narrower policy and column grants were both rejected.
    expect(prose).toMatch(/`?authenticated`? is trivially obtainable/i);
    expect(prose).toMatch(/Column-level grants cannot fix it/i);
    // And the deliberate exception to the series' own rule.
    expect(prose).toMatch(/DELIBERATELY RESTATES A POLICY EXPRESSION/i);
  });
});

describe('the rollout and rollback', () => {
  it('8. the rollout names its source migration and ships the same statements', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    const body = (sql: string) => statementsOf(sql)
      .slice(statementsOf(sql).indexOf('BEGIN;'), statementsOf(sql).lastIndexOf('COMMIT;'))
      .replace(/\s+/g, ' ').trim();
    expect(body(rollout)).toBe(body(migration));
  });

  it('9. the rollout warns that the application change must ship with it', () => {
    // Once anon loses SELECT, an undeployed page renders every link "invalid".
    const prose = rollout.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/MUST BE PAIRED WITH THE APPLICATION CHANGE/i);
    expect(prose).toMatch(/api\/invitations\/preview/);
  });

  it('10. the rollback restores the privileges, the policy and the predicate', () => {
    expect(rollbackStatements)
      .toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_invitations TO anon;');
    expect(rollbackStatements).toContain(`CREATE POLICY "${LINK_POLICY}"`);
    expect(rollbackStatements).toContain(`ALTER POLICY "${MANAGER_POLICY}"`);
    expect(rollbackStatements).toContain('can_manage_workspace(workspace_id)');
    // Restored manager predicate is manager OR link, as it was.
    expect(rollbackStatements).toContain("(type = 'link'::text)");
  });

  it('11. the rollback revokes nothing and reintroduces no PRNG', () => {
    expect(rollbackStatements).not.toMatch(/\bREVOKE\b/);
    // Scoped to the STATEMENTS: the header names Math.random precisely to say
    // it is not coming back, so the prose must be allowed to mention it.
    expect(rollbackStatements).not.toContain('Math.random');
    expect(rollbackProse, 'and it should say the generator is not rolled back')
      .toMatch(/does not and must not reintroduce Math\.random/i);
  });

  it('12. the rollback says plainly what it republishes', () => {
    expect(rollbackProse).toMatch(/REPUBLISHES INVITE CREDENTIALS TO ANONYMOUS CALLERS/i);
    expect(rollbackProse).toMatch(/link_code/);
    expect(rollbackProse).toMatch(/IN PLAINTEXT/i);
    expect(rollbackProse).toMatch(/only to undo/i);
    // And it points at the narrower remedy rather than leaving one to guess.
    expect(rollbackProse).toMatch(/restore the MANAGER policy alone/i);
  });
});

describe('the verifier', () => {
  it('13. it is genuinely read only, and changes nothing itself', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd()).toMatch(/ROLLBACK;$/);
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'CREATE POLICY', 'ALTER POLICY', 'DROP POLICY', 'INSERT INTO', 'UPDATE ',
      'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ', 'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
  });

  it('14. it proves anon holds no privilege, by each one and by acl entry', () => {
    expect(verifier).toContain("has_table_privilege('anon'");
    expect(verifier).toContain("ARRAY['SELECT','INSERT','UPDATE','DELETE']");
    // PUBLIC is checked separately: it is the entry that makes every FUTURE
    // role readable by default, so it must be visibly absent.
    expect(verifier).toContain('aclexplode');
    expect(verifier).toContain('a.grantee = 0');
  });

  it('15. it proves the link policy is gone and the manager predicate is exact', () => {
    expect(verifier).toContain(`'${LINK_POLICY}'`);
    expect(verifier).toContain(`'${MANAGER_POLICY}'`);
    expect(verifier).toContain("'can_manage_workspace(workspace_id)'");
    expect(verifier).toContain("ARRAY['authenticated']::name[]");
    // Stated separately so a failure says which half broke.
    expect(verifier).toContain("raw_qual !~ '(link_code|password|''link'')'");
  });

  it('16. THE STANDING RULE: no anon-reachable policy exposes an invite credential', () => {
    // The one assertion here that would catch this class of bug again, in a
    // policy nobody has written yet. Each clause is pinned separately so a
    // failure names the weakened one.
    const inv = verifier.slice(verifier.indexOf('credential_exposure AS ('));
    expect(inv, 'the sweep must cover the whole public schema, not one table')
      .toContain("schemaname = 'public'");
    expect(inv, 'both anon-reachable role forms must be covered')
      .toContain("roles && ARRAY['public', 'anon']::name[]");
    expect(inv, 'the credential columns are the point of the sweep')
      .toContain("~ '(link_code|password)'");
    expect(inv, 'and no anon-reachable policy may touch the table at all')
      .toContain("tablename = 'workspace_invitations'");
    // Offenders by name, not by count.
    expect(verifier).toContain('AS credential_exposure_offenders');
    expect(verifier).toContain('NOT EXISTS (SELECT 1 FROM credential_exposure)');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('17. it keeps the callers that must still work, and states the open gap', () => {
    expect(verifier).toContain("has_table_privilege('authenticated'");
    expect(verifier).toContain("has_table_privilege('service_role'");
    expect(verifier).toContain('relrowsecurity');
    // A pass must not be read as "the invite password is now safe".
    const prose = verifier.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/WHAT A PASS DOES NOT MEAN/i);
    expect(prose).toMatch(/still stored in PLAINTEXT/i);
    expect(verifier).toContain('AS recorded_gap');
  });
});
