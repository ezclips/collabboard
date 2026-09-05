import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * IMAGE-LIBRARY-1 -- the production rollout artifact for durable Image
 * ownership.
 *
 * This repository does not push migrations: `[db.migrations] enabled = false`
 * and supabase/BASELINE.md records that supabase/migrations/ does not rebuild
 * the live database. Production changes go through a guarded, self-contained
 * batch under supabase/production-rollouts/ plus a read-only verifier.
 *
 * These assertions pin the properties that make THIS artifact safe to run
 * against production: fail-closed guards, one transaction, the reviewed
 * security and cardinality invariants carried across BYTE FOR BYTE, and --
 * load-bearing -- no backfill.
 *
 * The behavioural half (apply, verify, the authorization matrix, drift
 * refusal and re-run safety) is rehearsed against a disposable local
 * PostgreSQL; scripts/db/imagePostLibraryAuthorization.test.ts owns the
 * function's authorization proof against the same source migrations.
 */

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const ROLLOUT_PATH = 'supabase/production-rollouts/20260905_image_library_ownership.sql';
const VERIFY_PATH = 'supabase/production-rollouts/20260905_image_library_ownership_verify.sql';
const SOURCES = [
  '20260905090000_add_padlet_library_item.sql',
  '20260905100000_harden_image_post_library_idempotency.sql',
] as const;

const rollout = read(ROLLOUT_PATH);
const verifier = read(VERIFY_PATH);
const migration = (name: string) => read(`supabase/migrations/${name}`);

/** Statements only: a guarantee must never be satisfied by a comment about it. */
const statements = rollout.replace(/--.*$/gm, '');
/** Statements with both function bodies removed, to reason about the batch itself. */
const outsideFunctionBodies = statements.replace(/AS \$\$[\s\S]*?\n\$\$;/g, 'AS $$<body>$$;');
/**
 * Statements with single-quoted literals blanked. The guards RAISE messages
 * that NAME the postures they reject ("is SECURITY DEFINER"), so a bare
 * substring search would read a refusal as the thing being refused.
 */
const code = statements.replace(/'(?:[^']|'')*'/g, "''");

/** The exact block a marker pair delimits, so "faithful copy" is testable. */
function block(source: string, start: string, end: string): string {
  const i = source.indexOf(start);
  expect(i, `missing start marker: ${start}`).toBeGreaterThan(-1);
  const j = source.indexOf(end, i);
  expect(j, `missing end marker: ${end}`).toBeGreaterThan(-1);
  return source.slice(i, j + end.length);
}

const ACL_END = ') TO authenticated, service_role;';
const FN_END = '\nEND;\n$$;';

describe('IMAGE-LIBRARY-1 rollout artifact', () => {
  it('1. follows the rollout/verify pair convention this repo uses', () => {
    const listed = fs.readdirSync(path.join(ROOT, 'supabase/production-rollouts'));
    expect(listed).toContain('20260905_image_library_ownership.sql');
    expect(listed).toContain('20260905_image_library_ownership_verify.sql');
    // The verifier creates nothing and changes nothing, so it is safe before,
    // after, or against a partial state.
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE',
      'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ', 'DROP ']) {
      expect(verifier, forbidden).not.toContain(forbidden);
    }
  });

  it('2. names the two reviewed migrations as its source, in dependency order', () => {
    let previous = -1;
    for (const name of SOURCES) {
      const at = rollout.indexOf(`supabase/migrations/${name}`);
      expect(at, `${name} must be named in the header`).toBeGreaterThan(previous);
      previous = at;
    }
  });

  it('3. copies every reviewed statement BYTE FOR BYTE', () => {
    const first = migration(SOURCES[0]);
    const second = migration(SOURCES[1]);
    // Schema, in the reviewed wording -- including the "not unique" rationale.
    for (const [start, end] of [
      ['ALTER TABLE public.padlets', 'ON DELETE SET NULL;'],
      ['CREATE INDEX IF NOT EXISTS', 'WHERE library_item_id IS NOT NULL;'],
      ['COMMENT ON COLUMN', "placed many times.';"],
      ['CREATE OR REPLACE FUNCTION', FN_END],
      ['REVOKE ALL ON FUNCTION', ACL_END],
    ] as const) {
      expect(rollout, `${start} must be copied verbatim from ${SOURCES[0]}`)
        .toContain(block(first, start, end));
    }
    // The hardened body and its restated posture.
    expect(rollout, 'the hardened function must be copied verbatim')
      .toContain(block(second, 'CREATE OR REPLACE FUNCTION', FN_END));
    expect(rollout, 'the hardened grants must be copied verbatim')
      .toContain(block(second, 'REVOKE ALL ON FUNCTION', ACL_END));
  });

  it('4. applies the initial function FIRST and the hardened one LAST', () => {
    const initial = rollout.indexOf(block(migration(SOURCES[0]), 'CREATE OR REPLACE FUNCTION', FN_END));
    const hardened = rollout.indexOf(block(migration(SOURCES[1]), 'CREATE OR REPLACE FUNCTION', FN_END));
    expect(initial).toBeGreaterThan(-1);
    expect(hardened).toBeGreaterThan(initial);
    // The committed contract is the hardened body: nothing follows it that
    // could replace the function again.
    expect(rollout.indexOf('CREATE OR REPLACE FUNCTION', hardened + 1)).toBe(-1);
  });

  it('5. is ONE transaction, so the vulnerable body is never visible', () => {
    expect(statements).toMatch(/^\s*BEGIN;/m);
    expect(statements.trimEnd()).toMatch(/COMMIT;$/);
    expect(statements).not.toContain('ROLLBACK');
    // Exactly one transaction: no intermediate COMMIT could publish section B.
    expect(statements.match(/^\s*COMMIT;/gm)).toHaveLength(1);
  });

  it('6. refuses to run before it has proved every assumption', () => {
    expect(statements).toContain('DO $preflight$');
    const preflight = block(rollout, 'DO $preflight$', '$preflight$;');
    for (const guard of [
      'public.padlets', 'public.library_items', 'public.boards',
      'public.board_collaborators', "to_regprocedure('auth.uid()')",
    ]) {
      expect(preflight, `preflight must require ${guard}`).toContain(guard);
    }
    // Drift is never converged silently: each of these aborts.
    for (const drift of [
      'is not uuid',
      'is NOT NULL',
      'exists with no foreign key',
      'expected public.library_items(id)',
      'expected SET NULL',
      'would outlaw reuse',
      'has an unexpected definition',
      'unexpected overload',
      'is SECURITY DEFINER',
    ]) {
      expect(preflight, `preflight must abort on: ${drift}`).toContain(drift);
    }
    // Fail-closed, not repair-in-place.
    expect(preflight).not.toContain('ALTER TABLE');
    expect(preflight).not.toContain('DROP ');
  });

  it('7. refuses to commit unless the resulting state is the reviewed one', () => {
    const postflight = block(rollout, 'DO $postflight$', '$postflight$;');
    for (const check of [
      'is not a nullable uuid',
      'is not ON DELETE SET NULL',
      'UNIQUE index covers padlets.library_item_id',
      'padlets_library_item_id_idx is missing',
      'is SECURITY DEFINER',
      'no pinned search_path',
      'does not bind the logical actor',
      'board authorization does not precede the retry lookup',
      'PUBLIC or anon can execute',
      'authenticated or service_role cannot execute',
    ]) {
      expect(postflight, `postflight must verify: ${check}`).toContain(check);
    }
  });

  it('8. keeps the cardinality that makes a Library object reusable', () => {
    // One durable object, many placements. A unique index would silently
    // outlaw the reuse this whole feature exists for.
    expect(statements).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(statements).not.toMatch(/UNIQUE\s*\(\s*library_item_id\s*\)/i);
    expect(statements).toContain('ON DELETE SET NULL');
    expect(statements).not.toMatch(/library_item_id[\s\S]{0,80}ON DELETE CASCADE/);
    // Nullable, with no default: the currently deployed application keeps
    // working against this database, which is what lets the DB go first.
    expect(statements).toContain('ADD COLUMN IF NOT EXISTS library_item_id uuid');
    expect(statements).not.toMatch(/library_item_id uuid[\s\S]{0,60}NOT NULL/);
    expect(statements).not.toMatch(/library_item_id uuid[\s\S]{0,60}DEFAULT/);
  });

  it('9. carries the reviewed security posture across intact', () => {
    expect(code).toContain('SECURITY INVOKER');
    // Declared posture only -- the guards quote the wording they reject.
    expect(code).not.toContain('SECURITY DEFINER');
    expect(code).toContain('SET search_path = public');
    expect(code).toContain('FROM PUBLIC, anon;');
    expect(code).toContain('TO authenticated, service_role;');
    // Nothing widens authority beyond the two source migrations.
    expect(code).not.toMatch(/GRANT[\s\S]{0,80}\bTO\s+(anon|PUBLIC)\b/);
    expect(code).not.toContain('SET ROLE');
    expect(code).not.toContain('ALTER ROLE');
    expect(code).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/(CREATE|ALTER|DROP)\s+POLICY/i);
  });

  it('10. performs NO backfill and touches no existing row', () => {
    // Both INSERTs live inside the function bodies, where they run per call.
    // The batch itself writes no data at all.
    expect(outsideFunctionBodies).not.toContain('INSERT INTO');
    expect(outsideFunctionBodies).not.toMatch(/\bUPDATE\s+public\./);
    expect(outsideFunctionBodies).not.toMatch(/\bDELETE\s+FROM\b/);
    expect(outsideFunctionBodies).not.toMatch(/\bTRUNCATE\b/);
    expect(outsideFunctionBodies).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|FUNCTION)\b/);
    // And it says so, so an operator cannot mistake this for the data gate.
    expect(rollout).toContain('NO BACKFILL IS PERFORMED OR ATTEMPTED HERE');
  });

  it('11. documents the DB-first release order the application depends on', () => {
    expect(rollout).toContain('DB FIRST, APPLICATION SECOND');
    const order = [
      'UNDEPLOYED',
      'Apply this rollout',
      '20260905_image_library_ownership_verify.sql',
      'Only then deploy',
    ];
    let previous = -1;
    for (const step of order) {
      const at = rollout.indexOf(step);
      expect(at, `runbook step out of order: ${step}`).toBeGreaterThan(previous);
      previous = at;
    }
  });

  it('12. the two source migrations are not modified by this gate', () => {
    // The rollout copies them; it must never become the place they are edited.
    expect(migration(SOURCES[0])).toContain('ADD COLUMN IF NOT EXISTS library_item_id uuid');
    expect(migration(SOURCES[0])).toContain('ON DELETE SET NULL');
    expect(migration(SOURCES[1])).toContain('auth.uid() <> p_user_id');
    expect(migration(SOURCES[1])).toContain("c.role = 'editor'");
    for (const name of SOURCES) {
      expect(migration(name)).toContain('SECURITY INVOKER');
      expect(migration(name)).not.toContain('SECURITY DEFINER');
    }
  });
});

describe('IMAGE-LIBRARY-1 verifier', () => {
  it('13. reports every property the gate requires, and rolls them up', () => {
    for (const check of [
      'library_item_id',
      'is_nullable',
      'delete_rule',
      'no_unique_on_link',
      'padlets_library_item_id_idx',
      'overload_count',
      'is_security_definer',
      'search_path=public',
      'public_execute',
      'anon_execute',
      'authenticated_execute',
      'service_role_execute',
      'binds_logical_actor',
      'authority_at',
      'retry_lookup_at',
      'library_owned_by_actor',
      'rollout_readiness',
    ]) {
      expect(verifier, `verifier must report ${check}`).toContain(check);
    }
  });

  it('14. proves the ordering the catalog cannot express', () => {
    // Statement order is the whole point of the hardening, and no catalog view
    // exposes it -- this is the one narrowly targeted body inspection.
    expect(verifier).toContain('pg_get_functiondef');
    expect(verifier).toContain("position('public.board_collaborators' IN definition)");
    expect(verifier).toContain("position('LEFT JOIN public.library_items' IN definition)");
  });

  it('15. stays runnable against a database where the rollout has not run', () => {
    // has_function_privilege(role, TEXT signature, ...) RAISES on a missing
    // function, and naming the column directly fails to parse before the
    // column exists. Both were real failures caught in local rehearsal.
    expect(verifier).not.toMatch(/has_function_privilege\(\s*'[a-z_]+'\s*,\s*sig\b/);
    expect(verifier).toContain('to_regprocedure');
    expect(verifier).toContain("to_jsonb(p) ->> 'library_item_id'");
  });
});
