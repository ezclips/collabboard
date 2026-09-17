import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NARROW_STORAGE_WRITE_POLICIES_1 -- the shipped artifacts.
 *
 * This migration is six role changes, so there is no behaviour to exercise from
 * a test runner: the artifacts ARE the change. What can be proven here is what
 * the migration claims -- that it changes ROLES ONLY, touches no seventh
 * policy, and leaves the public READ policies alone.
 *
 * The test that earns its place is the last one. The verifier's invariant --
 * "no anon-reachable write policy on storage.objects without an auth.role()
 * gate" -- is the only artifact here that would catch this class of bug AGAIN,
 * in a policy nobody has written yet. Rescoping six policies by name proves one
 * migration applied; the invariant is what keeps the finding closed. So the
 * invariant's own expression is pinned, and a future edit that quietly drops
 * the auth.role() requirement, or narrows which commands count as a write,
 * fails here.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260916160000_narrow_storage_write_policies.sql';
const ROLLOUT = 'supabase/production-rollouts/20260916160000_narrow_storage_write_policies.sql';
const VERIFY = 'supabase/production-rollouts/20260916160000_narrow_storage_write_policies_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260916160000_narrow_storage_write_policies_rollback.sql';

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

const alterLines = (sql: string) =>
  statementsOf(sql).split('\n').filter((l) => l.includes('ALTER POLICY'));

/** Group 1 was `TO public`: narrowing removes anon and nothing else. */
const GROUP_1 = [
  'Give users access to own folder',
  'Allow public uploads',
  'Allow uploads for any user',
] as const;

/** Group 2 was `TO anon` only: narrowing also GRANTS `authenticated`. */
const GROUP_2 = [
  'Allow public uploads fjopzy_0',
  'Allow public uploads fjopzy_1',
  'Allow public uploads on board-backgrounds',
] as const;

const SIX = [...GROUP_1, ...GROUP_2];

/** Public reads, and the two already-gated writes. None may be rescoped. */
const MUST_NOT_ALTER = [
  'Files are publicly accessible',
  'Allow public read',
  'Allow public downloads',
  'Allow public read access',
  'Allow public read access on canvas-icons',
  'Public read ai-component-assets',
  'Public read import previews',
  'Public thumbnail access',
  'Users can upload files',
  'Users can delete own files',
] as const;

describe('the migration narrows exactly six policies', () => {
  it('1. there are exactly six ALTER POLICY statements', () => {
    const alters = migrationStatements.match(/^ALTER POLICY /gm) ?? [];
    expect(alters).toHaveLength(SIX.length);
    expect(alters).toHaveLength(6);
  });

  it('2. each of the six is narrowed on storage.objects', () => {
    for (const policy of SIX) {
      expect(migrationStatements, policy)
        .toContain(`ALTER POLICY "${policy}" ON storage.objects TO authenticated;`);
    }
  });

  it('3. no seventh policy is named anywhere in the statements', () => {
    const allowed = new Set<string>(SIX);
    for (const name of [...migrationStatements.matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
      expect(allowed.has(name), `unexpected policy named: ${name}`).toBe(true);
    }
  });

  it('4. the policies that must not move are not named in any statement', () => {
    // Named explicitly rather than left to the count above: these are the ones
    // whose rescoping would either stop the public buckets serving reads, or
    // silently rescope a write policy that was already doing its job.
    for (const policy of MUST_NOT_ALTER) {
      expect(migrationStatements, policy).not.toContain(policy);
    }
  });

  it('5. no statement restates a USING or WITH CHECK clause', () => {
    // This is the whole safety claim. ALTER POLICY ... TO <role> changes the
    // roles and nothing else; the moment a predicate is retyped alongside it, a
    // "role-only" migration has become a behaviour change nobody reviewed.
    for (const line of [...alterLines(migration), ...alterLines(rollout), ...alterLines(rollbackScript)]) {
      expect(line, line).not.toMatch(/\bUSING\b/);
      expect(line, line).not.toMatch(/WITH CHECK/);
    }
    // And nothing is created, dropped or renamed here.
    for (const sql of [migrationStatements, rollbackStatements]) {
      expect(sql).not.toMatch(/\bCREATE POLICY\b/);
      expect(sql).not.toMatch(/\bDROP POLICY\b/);
      expect(sql).not.toMatch(/\bRENAME\b/);
      expect(sql).not.toMatch(/\bGRANT\b/);
      expect(sql).not.toMatch(/\bREVOKE\b/);
    }
  });

  it('6. it is one transaction, so a partial apply is impossible', () => {
    expect(migrationStatements).toMatch(/^BEGIN;$/m);
    expect(migrationStatements).toMatch(/^COMMIT;$/m);
  });

  it('7. the header records the ownership finding, not just the statements', () => {
    // The name of the policy being narrowed promises a check the data cannot
    // express. A reader who does not learn that will assume this closed it.
    const prose = migration.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/owner \/ owner_id\s*:?\s*null on every sampled object|owner` is null|owner is null/i);
    expect(prose).toMatch(/flat, no\s*user prefix|flat with no user prefix/i);
    expect(prose).toMatch(/NARROWS THE EXPOSURE AND RECORDS THE OWNERSHIP GAP/i);
    expect(prose).toMatch(/any AUTHENTICATED user can still overwrite or delete/i);
  });

  it('8. the header calls out that group 2 GRANTS authenticated something new', () => {
    // Three of the six were anon-only. Narrowing them is not purely a removal,
    // and a report that implies otherwise would be wrong.
    const prose = migration.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/HANDS `?authenticated`? A CAPABILITY IT DID NOT HAVE/i);
    for (const policy of GROUP_2) expect(migration, policy).toContain(policy);
  });
});

describe('the rollout and rollback', () => {
  it('9. the rollout names its source migration and ships the same statements', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    const body = (sql: string) => statementsOf(sql)
      .slice(statementsOf(sql).indexOf('BEGIN;'), statementsOf(sql).lastIndexOf('COMMIT;'))
      .replace(/\s+/g, ' ').trim();
    expect(body(rollout)).toBe(body(migration));
  });

  it('10. the rollback only widens, and restores each group to where it was', () => {
    for (const policy of GROUP_1) {
      expect(rollbackStatements, policy)
        .toContain(`ALTER POLICY "${policy}" ON storage.objects TO public;`);
    }
    for (const policy of GROUP_2) {
      // `anon`, NOT `public`. Widening group 2 to public would grant
      // `authenticated` something it did not have before the migration either.
      expect(rollbackStatements, policy)
        .toContain(`ALTER POLICY "${policy}" ON storage.objects TO anon;`);
    }
    expect(rollbackStatements.match(/^ALTER POLICY /gm) ?? []).toHaveLength(6);
    expect(rollbackStatements).not.toContain('TO authenticated');
  });

  it('11. the rollback says plainly what it re-opens', () => {
    expect(rollbackScript).toMatch(/RE-OPENS ANONYMOUS WRITE TO STORAGE/i);
    expect(rollbackScript).toMatch(/60 objects in `?padlet-files`?/i);
    expect(rollbackScript).toMatch(/\bINSERT, UPDATE and DELETE\b/);
    expect(rollbackScript).toMatch(/only to undo/i);
  });
});

describe('the verifier', () => {
  it('12. it is genuinely read only, and changes no policy itself', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd()).toMatch(/ROLLBACK;$/);
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'CREATE POLICY', 'ALTER POLICY', 'DROP POLICY', 'INSERT INTO', 'UPDATE ',
      'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ', 'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
  });

  it('13. it checks all six by name and pins them to exactly {authenticated}', () => {
    for (const policy of SIX) expect(verifier, policy).toContain(`'${policy}'`);
    expect(verifier).toContain("ARRAY['authenticated']::name[]");
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
    expect(verifier).toContain("THEN 'PASS' ELSE 'FAIL' END");
  });

  it('14. it proves the public reads survived, still anon-reachable and still SELECT', () => {
    for (const policy of MUST_NOT_ALTER.slice(0, 8)) {
      expect(verifier, policy).toContain(`'${policy}'`);
    }
    expect(verifier).toContain("cmd <> 'SELECT'");
  });

  it('15. THE INVARIANT: anon-reachable writes must carry an auth.role() gate', () => {
    // The single assertion in this file that would catch the original bug in a
    // policy nobody has written yet. Each clause is pinned separately so the
    // failure message says which one was weakened.
    const inv = verifier.slice(verifier.indexOf('write_exposure AS ('));
    expect(inv, 'the invariant must scope to storage.objects')
      .toContain("schemaname = 'storage'");
    expect(inv, 'the invariant must scope to storage.objects')
      .toContain("tablename = 'objects'");
    // Every write command, including ALL -- the original offender was FOR ALL,
    // so dropping any one of these would reopen exactly this finding.
    expect(inv, 'all four write commands must count as writes')
      .toContain("cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')");
    // Anon-reachable means TO public (role oid 0) or naming anon outright.
    expect(inv, 'both anon-reachable role forms must be covered')
      .toContain("roles && ARRAY['public', 'anon']::name[]");
    // And the gate itself, checked across BOTH expressions: a USING-only check
    // would miss an INSERT policy, which carries only WITH CHECK.
    expect(inv, 'the auth.role() gate is the point of the invariant')
      .toContain("position('auth.role()' IN (COALESCE(qual, '') || COALESCE(with_check, ''))) = 0");
    // Offenders are reported BY NAME. A count would pass while one policy was
    // swapped for another, and a name is what someone can act on.
    expect(verifier).toContain('AS anon_write_offenders');
    expect(verifier).toContain("string_agg(policyname || ' (' || cmd || ' ' || roles || ')'");
    expect(verifier).toContain('NOT EXISTS (SELECT 1 FROM write_exposure)');
  });

  it('16. the verifier states the limit of its own invariant, and the open gap', () => {
    // A pass here is a floor, not a proof: the invariant detects a MISSING
    // auth.role() gate, not a wrong one, and it says nothing about ownership.
    const prose = verifier.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/detects a MISSING lock, not a WRONG one/i);
    expect(prose).toMatch(/auth\.role\(\) = 'anon'/i);
    expect(prose).toMatch(/WHAT A PASS DOES NOT MEAN/i);
    expect(verifier).toContain('AS recorded_gap');
  });
});
