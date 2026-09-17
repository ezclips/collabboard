import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NARROW_PUBLIC_POLICIES_AND_CLOSE_ANON_SURFACE_1 -- the shipped artifacts.
 *
 * This migration is policy role changes plus grant changes, so there is no
 * behaviour to exercise from a test runner: the artifacts ARE the change. What
 * can be proven here is the claim the migration actually makes -- that it
 * changes ROLES ONLY and preserves the one anonymous branch verbatim.
 *
 * The dangerous failure mode is not a missing statement. It is a "role-only"
 * change that quietly restates a predicate, or an anonymous branch that gets
 * re-typed slightly differently and so silently widens or narrows what an
 * unauthenticated visitor can read. Both are checked below, the second against
 * the live expression as recorded in the baseline snapshot rather than against
 * a copy of itself.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260916150000_narrow_public_policies_and_close_anon_surface.sql';
const ROLLOUT = 'supabase/production-rollouts/20260916150000_narrow_public_policies_and_close_anon_surface.sql';
const VERIFY = 'supabase/production-rollouts/20260916150000_narrow_public_policies_and_close_anon_surface_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260916150000_narrow_public_policies_and_close_anon_surface_rollback.sql';
const BASELINE = 'supabase/baseline/schema_snapshot_2026-07-05.sql';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);
const baseline = read(BASELINE);

/** Statements only. Prose naming a verb is not the verb. */
const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const migrationStatements = statementsOf(migration);
const verifierStatements = statementsOf(verifier);
const rollbackStatements = statementsOf(rollbackScript);

const linesWith = (sql: string, needle: string) =>
  statementsOf(sql).split('\n').filter((l) => l.includes(needle));

/** The twenty-five narrowed policies, as (table, policy). */
const NARROWED: ReadonlyArray<readonly [string, string]> = [
  ['freeform_graph_settings', 'Users can select freeform settings of their boards'],
  ['freeform_graph_settings', 'Users can insert freeform settings of their boards'],
  ['freeform_graph_settings', 'Users can update freeform settings of their boards'],
  ['customers', 'Workspace managers can manage customers'],
  ['customers', 'Workspace members can view customers'],
  ['subscriptions', 'Workspace managers can manage subscriptions'],
  ['subscriptions', 'Workspace members can view subscriptions'],
  ['teams', 'Workspace managers can delete teams'],
  ['teams', 'Workspace managers can insert teams'],
  ['teams', 'Workspace managers can update teams'],
  ['teams', 'Workspace managers can view teams'],
  ['workspace_members', 'Workspace managers can delete memberships'],
  ['workspace_members', 'Workspace managers can insert memberships'],
  ['workspace_members', 'Workspace managers can update memberships'],
  ['workspace_members', 'Workspace members can view memberships'],
  ['workspace_settings', 'Workspace managers can insert workspace settings'],
  ['workspace_settings', 'Workspace managers can update workspace settings'],
  ['workspace_settings', 'Workspace members can view workspace settings'],
  ['workspace_settings', 'Workspace owners can delete workspace settings'],
  ['workspaces', 'Users can view workspaces they belong to'],
  ['platform_admins', 'Platform admins can delete platform admins'],
  ['platform_admins', 'Platform admins can insert platform admins'],
  ['platform_admins', 'Platform admins can update platform admins'],
  ['platform_admins', 'Platform admins can view platform admins'],
  ['webhook_events', 'Platform admins can view webhook events'],
] as const;

const INVITATIONS_POLICY = 'Workspace managers can view invitations';
const ADDED_POLICY = 'Anyone can view an active link invitation';

/** The six revoked, by exact signature. is_platform_admin takes ONE argument. */
const SIX = [
  'public.can_access_board(uuid, uuid)',
  'public.can_edit_board(uuid, uuid)',
  'public.can_manage_workspace(uuid, uuid)',
  'public.get_workspace_role(uuid, uuid)',
  'public.has_workspace_access(uuid, uuid)',
  'public.is_platform_admin(uuid)',
] as const;

/** Every double-quoted policy name in a statement block. */
const quotedNames = (sql: string) =>
  [...statementsOf(sql).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/**
 * Drop pg_dump's identifier quoting and the two files' layouts, and nothing
 * else. Whitespace around parentheses goes too, because one file indents its
 * predicate across five lines and the other is a single dumped line; every
 * other character is compared as written.
 */
const flatten = (sql: string) => sql
  .replace(/"/g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([()])\s*/g, '$1')
  .trim();

/** The balanced parenthesised group beginning at `from`. */
const balancedAt = (sql: string, from: number): string => {
  const open = sql.indexOf('(', from);
  if (open < 0) throw new Error('no parenthesised group found');
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    else if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced parentheses');
};

/** The body of the first `USING ( ... )` in a statement. */
const usingBody = (sql: string) => {
  const at = sql.indexOf('USING (');
  if (at < 0) throw new Error('no USING clause found');
  return balancedAt(sql, at);
};

/**
 * The anonymous link branch as the LIVE policy carries it, read out of the
 * baseline snapshot rather than out of the migration -- so the comparison is
 * against the thing being preserved, not against a copy of itself.
 */
const liveLinkBranch = (): string => {
  const live = baseline.split('\n').find((l) =>
    l.startsWith('CREATE POLICY "Workspace managers can view invitations"'));
  if (!live) throw new Error('the invitations policy is absent from the baseline');
  const qual = usingBody(live);
  const at = qual.indexOf(' OR ');
  if (at < 0) throw new Error('the live policy is no longer manager OR link');
  return flatten(balancedAt(qual, at));
};

describe('the migration changes roles only', () => {
  it('1. there are exactly twenty-six ALTER POLICY statements', () => {
    const alters = migrationStatements.match(/^ALTER POLICY /gm) ?? [];
    expect(alters).toHaveLength(NARROWED.length + 1);
    expect(alters).toHaveLength(26);
  });

  it('2. each of the twenty-five is narrowed on its own table', () => {
    for (const [table, policy] of NARROWED) {
      expect(migrationStatements, `${table}.${policy}`)
        .toContain(`ALTER POLICY "${policy}" ON public.${table} TO authenticated;`);
    }
  });

  it('3. the invitations manager policy is the twenty-sixth', () => {
    expect(migrationStatements).toContain(
      `ALTER POLICY "${INVITATIONS_POLICY}" ON public.workspace_invitations TO authenticated;`,
    );
  });

  it('4. no policy outside the list is named anywhere in the statements', () => {
    const allowed = new Set<string>([
      ...NARROWED.map(([, policy]) => policy),
      INVITATIONS_POLICY,
      ADDED_POLICY,
    ]);
    for (const name of quotedNames(migration)) {
      expect(allowed.has(name), `unexpected policy named: ${name}`).toBe(true);
    }
  });

  it('5. no ALTER POLICY restates a USING or WITH CHECK clause', () => {
    // This is the whole safety claim. ALTER POLICY ... TO <role> changes the
    // roles and nothing else; the moment a predicate is retyped alongside it,
    // a "role-only" migration has become a behaviour change that nobody read.
    for (const line of [...linesWith(migration, 'ALTER POLICY'), ...linesWith(rollout, 'ALTER POLICY')]) {
      expect(line, line).not.toMatch(/\bUSING\b/);
      expect(line, line).not.toMatch(/WITH CHECK/);
    }
  });

  it('6. it narrows before it revokes', () => {
    // Revoking first would leave `TO public` policies calling functions anon
    // cannot execute -- anonymous queries would ERROR, not return zero rows.
    expect(migrationStatements.indexOf('ALTER POLICY'))
      .toBeLessThan(migrationStatements.indexOf('REVOKE EXECUTE'));
    expect(migrationStatements.lastIndexOf('ALTER POLICY'))
      .toBeLessThan(migrationStatements.indexOf('REVOKE EXECUTE'));
  });

  it('7. it is one transaction, so a partial apply is impossible', () => {
    expect(migrationStatements).toMatch(/^BEGIN;$/m);
    expect(migrationStatements).toMatch(/^COMMIT;$/m);
  });
});

describe('the migration closes the six', () => {
  it('8. every one of the six is revoked from PUBLIC and anon', () => {
    for (const sig of SIX) {
      expect(migrationStatements, sig)
        .toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, anon;`);
    }
    expect(migrationStatements.match(/^REVOKE EXECUTE ON FUNCTION/gm) ?? []).toHaveLength(6);
  });

  it('9. it GRANTS nothing, and never revokes authenticated or service_role', () => {
    expect(migrationStatements).not.toMatch(/\bGRANT\b/);
    for (const role of ['authenticated', 'service_role']) {
      for (const line of linesWith(migration, 'REVOKE')) {
        expect(line, `${role} must keep EXECUTE`).not.toContain(role);
      }
    }
  });

  it('10. PostGIS is untouched, and the header says why', () => {
    expect(migrationStatements).not.toContain('st_estimatedextent');
    expect(migration).toContain('st_estimatedextent');
  });

  it('11. the header carries the safety argument, not just the statements', () => {
    const prose = migration.replace(/^\s*--\s?/gm, '').replace(/\s+/g, ' ');
    expect(prose).toMatch(/auth\.uid\(\) is NULL for anon/i);
    expect(prose).toMatch(/removes a false evaluation, not a grant/i);
    // And the finding it deliberately does not decide.
    expect(prose).toMatch(/anonymous caller can read active link invitations/i);
  });
});

describe('the preserved anonymous branch', () => {
  it('12. exactly one policy is added, and it is SELECT TO public', () => {
    expect(migrationStatements.match(/^CREATE POLICY /gm) ?? []).toHaveLength(1);
    expect(migrationStatements).toContain(`CREATE POLICY "${ADDED_POLICY}"`);
    expect(migrationStatements).toContain('FOR SELECT TO public');
  });

  it('13. its predicate is character-identical to the live link branch', () => {
    // Compared against the branch as the LIVE policy carries it (recorded in
    // the baseline snapshot), not against another copy of itself. Only
    // pg_dump's identifier quoting and the two files' layouts are normalised
    // away; every other character must match, because any difference here is a
    // silent change to what an unauthenticated visitor may read.
    const added = migrationStatements.slice(migrationStatements.indexOf(`CREATE POLICY "${ADDED_POLICY}"`));
    expect(flatten(usingBody(added))).toBe(liveLinkBranch());
  });

  it('14. the verifier pins the same predicate, character for character', () => {
    // The verifier compares the DEPARSED policy to a literal; that literal must
    // be the same branch, or the verifier would bless a changed predicate.
    const row4 = verifier.slice(
      verifier.indexOf("'the added policy''s predicate"),
      verifier.indexOf('UNION ALL SELECT 5'),
    );
    const tail = row4.slice(row4.lastIndexOf('flat_qual FROM link_policy) ='));
    const chunks = [...tail.matchAll(/'((?:[^']|'')*)'/g)]
      .map((m) => m[1].replace(/''/g, "'"))
      .filter((s) => s.length > 0);
    expect(flatten(chunks.join(''))).toBe(liveLinkBranch());
  });
});

describe('the rollout, verifier and rollback', () => {
  it('15. the rollout names its source migration and ships the same statements', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    const body = (sql: string) => statementsOf(sql)
      .slice(statementsOf(sql).indexOf('BEGIN;'), statementsOf(sql).lastIndexOf('COMMIT;'))
      .replace(/\s+/g, ' ').trim();
    expect(body(rollout)).toBe(body(migration));
  });

  it('16. the verifier is genuinely read only, and changes nothing itself', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd()).toMatch(/ROLLBACK;$/);
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'CREATE POLICY', 'ALTER POLICY', 'INSERT INTO', 'UPDATE ', 'DELETE FROM',
      'TRUNCATE', 'GRANT ', 'REVOKE ', 'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
  });

  it('17. the verifier checks every narrowed policy and every revoked function', () => {
    for (const [table, policy] of NARROWED) {
      expect(verifier, policy).toContain(`'${policy}'`);
      expect(verifier, table).toContain(`'${table}'`);
    }
    expect(verifier).toContain(`'${INVITATIONS_POLICY}'`);
    expect(verifier).toContain(`'${ADDED_POLICY}'`);
    for (const sig of SIX) expect(verifier, sig).toContain(sig);
  });

  it('18. the verifier pins the surface as an EMPTY SET, printed not counted', () => {
    expect(verifier).toContain("ARRAY['authenticated']::name[]");
    expect(verifier).toContain("ARRAY['public']::name[]");
    expect(verifier).toContain('NOT EXISTS (SELECT 1 FROM remaining)');
    expect(verifier).toContain('AS remaining_surface');
    expect(verifier).toContain('AS public_policies_still_calling_the_six');
    expect(verifier).toContain("THEN 'PASS' ELSE 'FAIL' END");
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
    // Extension-owned functions are excluded, so PostGIS never appears.
    expect(verifier).toContain('pg_extension');
    expect(verifier).toContain("d.deptype = 'e'");
  });

  it('19. the verifier keeps the two non-policy callers executable', () => {
    expect(verifier).toContain("has_function_privilege('authenticated'");
    expect(verifier).toContain("has_function_privilege('service_role'");
    expect(verifier).toContain('get_workspace_role');
    expect(verifier).toContain('is_platform_admin');
  });

  it('20. the rollback revokes nothing and grants back exactly the six', () => {
    expect(rollbackStatements).not.toMatch(/\bREVOKE\b/);
    for (const sig of SIX) {
      expect(rollbackStatements, sig).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO PUBLIC, anon;`);
    }
    expect(rollbackStatements.match(/^GRANT EXECUTE ON FUNCTION/gm) ?? []).toHaveLength(6);
  });

  it('21. the rollback widens exactly the twenty-six and drops only the added policy', () => {
    for (const [table, policy] of NARROWED) {
      expect(rollbackStatements, policy)
        .toContain(`ALTER POLICY "${policy}" ON public.${table} TO public;`);
    }
    expect(rollbackStatements).toContain(
      `ALTER POLICY "${INVITATIONS_POLICY}" ON public.workspace_invitations TO public;`);
    expect(rollbackStatements.match(/^ALTER POLICY /gm) ?? []).toHaveLength(26);
    const drops = rollbackStatements.match(/^DROP POLICY /gm) ?? [];
    expect(drops).toHaveLength(1);
    expect(rollbackStatements).toContain(
      `DROP POLICY IF EXISTS "${ADDED_POLICY}" ON public.workspace_invitations;`);
  });

  it('22. the rollback grants before it widens, and says plainly what it re-opens', () => {
    expect(rollbackStatements.indexOf('GRANT EXECUTE'))
      .toBeLessThan(rollbackStatements.indexOf('ALTER POLICY'));
    expect(rollbackScript).toMatch(/RE-OPENS AN ANONYMOUS ORACLE SURFACE/i);
    expect(rollbackScript).toMatch(/platform admin/i);
    expect(rollbackScript).toMatch(/only to undo/i);
    expect(rollbackScript).toMatch(/never to PUBLIC or anon/i);
  });
});
