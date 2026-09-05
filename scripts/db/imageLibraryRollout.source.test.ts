import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * IMAGE-LIBRARY-1 -- the production rollout artifact for durable Image
 * ownership, and its C1 fail-closed hardening.
 *
 * This repository does not push migrations: `[db.migrations] enabled = false`
 * and supabase/BASELINE.md records that supabase/migrations/ does not rebuild
 * the live database. Production changes go through a guarded, self-contained
 * batch under supabase/production-rollouts/ plus a read-only verifier.
 *
 * These assertions pin the properties that make the artifact safe to run
 * against production: fail-closed entry gates, one transaction, the reviewed
 * statements carried across BYTE FOR BYTE, a canonical function fingerprint
 * whose provenance is re-derived here rather than trusted, a complete privilege
 * and prerequisite contract, and -- load-bearing -- no backfill.
 *
 * The behavioural half (apply, verify, the authorization matrix, every drift
 * refusal, atomic rollback and re-run safety) is rehearsed against disposable
 * local PostgreSQL databases; scripts/db/imagePostLibraryAuthorization.test.ts
 * owns the function's authorization proof against the same source migrations.
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
/** Verifier statements only, for counts that must not be met by prose. */
const verifierStatements = verifier.replace(/--.*$/gm, '');

const FN_END = '\nEND;\n$$;';
const ACL_END = ') TO authenticated, service_role;';

/** The exact block a marker pair delimits, so "faithful copy" is testable. */
function block(source: string, start: string, end: string): string {
  const i = source.indexOf(start);
  expect(i, `missing start marker: ${start}`).toBeGreaterThan(-1);
  const j = source.indexOf(end, i);
  expect(j, `missing end marker: ${end}`).toBeGreaterThan(-1);
  return source.slice(i, j + end.length);
}

/**
 * PostgreSQL stores a dollar-quoted body verbatim, so pg_proc.prosrc is exactly
 * the text between the delimiters in the migration. That is what makes the
 * pinned digest reproducible offline instead of a constant nobody can check.
 */
const hardenedSource = migration(SOURCES[1]);
const hardenedBody = hardenedSource.slice(
  hardenedSource.indexOf('AS $$') + 'AS $$'.length,
  hardenedSource.lastIndexOf('$$;'),
);
const expectedBodyMd5 = crypto.createHash('md5').update(hardenedBody, 'utf8').digest('hex');

describe('IMAGE-LIBRARY-1 rollout artifact', () => {
  it('1. follows the rollout/verify pair convention this repo uses', () => {
    const listed = fs.readdirSync(path.join(ROOT, 'supabase/production-rollouts'));
    expect(listed).toContain('20260905_image_library_ownership.sql');
    expect(listed).toContain('20260905_image_library_ownership_verify.sql');
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
    expect(rollout, 'the hardened function must be copied verbatim')
      .toContain(block(hardenedSource, 'CREATE OR REPLACE FUNCTION', FN_END));
    expect(rollout, 'the hardened grants must be copied verbatim')
      .toContain(block(hardenedSource, 'REVOKE ALL ON FUNCTION', ACL_END));
  });

  it('4. applies the initial function FIRST and the hardened one LAST', () => {
    const initial = rollout.indexOf(block(migration(SOURCES[0]), 'CREATE OR REPLACE FUNCTION', FN_END));
    const hardened = rollout.indexOf(block(hardenedSource, 'CREATE OR REPLACE FUNCTION', FN_END));
    expect(initial).toBeGreaterThan(-1);
    expect(hardened).toBeGreaterThan(initial);
    expect(rollout.indexOf('CREATE OR REPLACE FUNCTION', hardened + 1)).toBe(-1);
  });

  it('5. is ONE transaction, so the vulnerable body is never visible', () => {
    expect(statements).toMatch(/^\s*BEGIN;/m);
    expect(statements.trimEnd()).toMatch(/COMMIT;$/);
    expect(statements).not.toContain('ROLLBACK');
    expect(statements.match(/^\s*COMMIT;/gm)).toHaveLength(1);
  });
});

describe('C1: canonical function integrity', () => {
  it('6. the pinned digest is re-derived from the reviewed migration, not invented', () => {
    // Provenance, computed here rather than trusted: change the hardened
    // migration and this recomputation moves, forcing the constants to be
    // re-pinned deliberately instead of drifting.
    expect(hardenedBody).toContain('auth.uid() <> p_user_id');
    expect(hardenedBody.length).toBeGreaterThan(1000);
    expect(rollout, 'rollout must pin the migration-derived body digest')
      .toContain(expectedBodyMd5);
    expect(verifier, 'verifier must pin the SAME digest')
      .toContain(expectedBodyMd5);
    // One digest, used by both gates -- they cannot disagree about identity.
    expect(rollout.match(new RegExp(expectedBodyMd5, 'g'))).toHaveLength(2); // preflight + postflight
    expect(verifier.match(new RegExp(expectedBodyMd5, 'g'))).toHaveLength(1);
  });

  it('7. both gates compare the stored body, not keywords', () => {
    expect(statements).toContain('md5(prosrc)');
    expect(verifier).toContain('md5(p.prosrc)');
    // Keyword checks survive only as labelled diagnostics.
    expect(verifier).toContain("'diagnostic'");
    const diagnosticsStart = verifier.indexOf("'diagnostic'");
    expect(verifier.indexOf("position('auth.uid() <> p_user_id'"))
      .toBeGreaterThan(diagnosticsStart);
  });

  it('8. entry states are ABSENT or EXACT -- the initial body is not accepted', () => {
    const preflight = block(rollout, 'DO $preflight$', '$preflight$;');
    expect(preflight).toContain('refusing to overwrite an unreviewed function');
    for (const drift of [
      'existing function body digest is',
      'function arguments are',
      'function result is',
      'existing function is SECURITY DEFINER',
      'function configuration is',
      'function owner is',
      'function ACL is',
      'unexpected overload',
    ]) {
      expect(preflight, `preflight must abort on: ${drift}`).toContain(drift);
    }
    // The pre-hardening body is deliberately not whitelisted as an entry state.
    const initialBodyMd5 = crypto.createHash('md5').update(
      (() => {
        const s = migration(SOURCES[0]);
        return s.slice(s.indexOf('AS $$') + 'AS $$'.length, s.lastIndexOf('$$;'));
      })(), 'utf8').digest('hex');
    expect(initialBodyMd5).not.toBe(expectedBodyMd5);
    expect(rollout).not.toContain(initialBodyMd5);
    expect(verifier).not.toContain(initialBodyMd5);
    // Fail closed, never repair.
    expect(preflight).not.toContain('ALTER TABLE');
    expect(preflight).not.toContain('DROP ');
  });
});

describe('C1: posture, privilege and column contracts', () => {
  it('9. pins one exact function owner in both gates', () => {
    expect(block(rollout, 'DO $preflight$', '$preflight$;')).toContain("expected_owner constant text := 'postgres'");
    expect(block(rollout, 'DO $postflight$', '$postflight$;')).toContain("expected_owner constant text := 'postgres'");
    expect(verifier).toContain("'postgres'::text                                             AS owner");
    expect(verifier).toContain('owner is the expected deployment role');
  });

  it('10. checks the COMPLETE privilege set, not four spot checks', () => {
    // aclexplode enumerates every grantee; has_function_privilege can only
    // answer about roles someone thought to name.
    expect(statements).toContain('aclexplode');
    expect(verifier).toContain('aclexplode');
    expect(verifier).toContain('no unexpected EXECUTE holder');
    for (const gate of [block(rollout, 'DO $preflight$', '$preflight$;'),
                        block(rollout, 'DO $postflight$', '$postflight$;')]) {
      expect(gate).toContain('aclexplode');
      expect(gate).toContain("'authenticated:EXECUTE'");
      expect(gate).toContain("'service_role:EXECUTE'");
    }
  });

  it('11. requires the link column to carry NO default', () => {
    expect(block(rollout, 'DO $preflight$', '$preflight$;')).toContain('has DEFAULT');
    expect(block(rollout, 'DO $postflight$', '$postflight$;')).toContain('column_default IS NULL');
    expect(verifier).toContain('has NO default');
    expect(verifier).toContain('column_default IS NULL');
    // The reviewed migration creates none, so none may be accepted.
    expect(migration(SOURCES[0])).not.toMatch(/library_item_id uuid[\s\S]{0,80}DEFAULT/);
  });

  it('12. keeps the cardinality that makes a Library object reusable', () => {
    expect(statements).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(statements).not.toMatch(/UNIQUE\s*\(\s*library_item_id\s*\)/i);
    expect(statements).toContain('ON DELETE SET NULL');
    expect(statements).toContain('ADD COLUMN IF NOT EXISTS library_item_id uuid');
    expect(statements).not.toMatch(/library_item_id uuid[\s\S]{0,60}NOT NULL/);
    // Exactly one key: an extra CASCADE key would delete placements.
    expect(statements).toContain('foreign keys, expected exactly 1');
    expect(verifier).toContain('exactly one foreign key on the link');
    expect(verifier).toContain('delete action is SET NULL, and only that');
  });

  it('13. carries the reviewed security posture across intact', () => {
    expect(statements).toContain('SECURITY INVOKER');
    // Matched as a DECLARATION line. The guards quote the wording they reject
    // ("existing function is SECURITY DEFINER"), so a bare substring search
    // would read a refusal as the thing being refused.
    expect(statements).not.toMatch(/^\s*SECURITY DEFINER\s*$/m);
    expect(statements).toContain('SET search_path = public');
    expect(statements).toContain('FROM PUBLIC, anon;');
    expect(statements).toContain('TO authenticated, service_role;');
    expect(statements).not.toMatch(/GRANT[\s\S]{0,80}\bTO\s+(anon|PUBLIC)\b/);
    expect(statements).not.toMatch(/^\s*SET ROLE\b/m);
    expect(statements).not.toMatch(/^\s*ALTER ROLE\b/m);
    expect(statements).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(statements).not.toMatch(/(CREATE|ALTER|DROP)\s+POLICY/i);
  });
});

describe('C1: prerequisite manifest tracks the function', () => {
  /**
   * Every relation.column the FINAL hardened function actually touches, derived
   * from its body: aliases from FROM/JOIN, the columns used through them, and
   * both INSERT column lists. If the function grows a dependency, this set
   * grows and the manifest below must be updated deliberately.
   */
  function referencedColumns(body: string): Set<string> {
    const aliases = new Map<string, string>();
    for (const m of body.matchAll(/(?:FROM|JOIN)\s+public\.(\w+)\s+(?:AS\s+)?(\w+)/g)) {
      if (!['ON', 'WHERE', 'SET'].includes(m[2].toUpperCase())) aliases.set(m[2], m[1]);
    }
    const found = new Set<string>();
    for (const [alias, table] of aliases) {
      for (const m of body.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, 'g'))) {
        found.add(`${table}.${m[1]}`);
      }
    }
    for (const m of body.matchAll(/INSERT INTO public\.(\w+)\s*\(([^)]*)\)/g)) {
      for (const raw of m[2].split(',')) {
        const col = raw.trim();
        if (col) found.add(`${m[1]}.${col}`);
      }
    }
    return found;
  }

  it('14. every column the function touches is in both prerequisite manifests', () => {
    const referenced = referencedColumns(hardenedBody);
    expect(referenced.size).toBeGreaterThan(15);
    const preflight = block(rollout, 'DO $preflight$', '$preflight$;');
    for (const ref of referenced) {
      const [table, column] = ref.split('.');
      // The rollout creates this one, so rows 1-4 assert its shape instead.
      if (ref === 'padlets.library_item_id') continue;
      const entry = `('${table}', '${column}')`;
      const verifierEntry = `('${table}','${column}')`;
      expect(preflight, `preflight manifest is missing ${ref}`).toContain(entry);
      expect(verifier, `verifier manifest is missing ${ref}`).toContain(verifierEntry);
    }
  });

  it('15. the authority tables and key types are preflighted', () => {
    const preflight = block(rollout, 'DO $preflight$', '$preflight$;');
    for (const table of ['public.padlets', 'public.library_items', 'public.boards',
                         'public.board_collaborators']) {
      expect(preflight, `preflight must require ${table}`).toContain(table);
    }
    expect(preflight).toContain("to_regprocedure('auth.uid()')");
    // boards.id is the join key Astro removed while both gates still passed.
    expect(preflight).toContain("'padlets.id', 'library_items.id', 'boards.id'");
    expect(verifier).toContain("('boards','id')");
  });
});

describe('C1: verifier contract', () => {
  it('16. is genuinely read only', () => {
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ', 'DROP ',
      'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifier, forbidden).not.toContain(forbidden);
    }
    // CREATE INDEX is absent from that list on purpose: the verifier carries
    // the expected index definition as a comparison VALUE, not as a statement
    // it runs. Pin that it appears exactly once, and only as a literal.
    expect(verifierStatements.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(verifierStatements).toContain("('CREATE INDEX padlets_library_item_id_idx");
  });

  it('17. readiness is the conjunction of the same rows it prints', () => {
    // One list, one aggregate: there is no second roll-up expression that could
    // report true while a row above it reports false.
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
    expect(verifierStatements.match(/rollout_readiness/g)).toHaveLength(1);
    expect(verifier).toContain('FROM invariants');
    // Every invariant is a row of that one list.
    const invariants = verifier.slice(verifier.indexOf('invariants(ord, section'));
    for (const check of [
      'padlets.library_item_id exists', 'type is uuid', 'is nullable', 'has NO default',
      'exactly one foreign key on the link', 'targets public.library_items(id)',
      'delete action is SET NULL, and only that', 'no UNIQUE index covers the link',
      'supporting index matches exactly', 'exists with the reviewed signature',
      'no other overload of the same name', 'canonical body digest matches the reviewed migration',
      'identity arguments match', 'result type matches', 'SECURITY INVOKER, never DEFINER',
      'configuration is exactly search_path=public', 'owner is the expected deployment role',
      'PUBLIC cannot execute', 'anon cannot execute', 'authenticated can execute',
      'service_role can execute', 'no unexpected EXECUTE holder',
      'every table/column the function uses exists',
    ]) {
      expect(invariants, `missing invariant row: ${check}`).toContain(check);
    }
  });

  it('18. stays runnable against a database where the rollout has not run', () => {
    // has_function_privilege(role, TEXT signature, ...) RAISES on a missing
    // function, and naming the column directly fails to parse before the
    // column exists. Both were real failures caught in local rehearsal.
    expect(verifier).not.toMatch(/has_function_privilege\(\s*'[a-z_]+'\s*,\s*sig\b/);
    expect(verifier).toContain('to_regprocedure');
    expect(verifier).toContain('COALESCE');
  });
});

describe('C1: release safety', () => {
  it('19. performs NO backfill and touches no existing row', () => {
    expect(outsideFunctionBodies).not.toContain('INSERT INTO');
    expect(outsideFunctionBodies).not.toMatch(/\bUPDATE\s+public\./);
    expect(outsideFunctionBodies).not.toMatch(/\bDELETE\s+FROM\b/);
    expect(outsideFunctionBodies).not.toMatch(/\bTRUNCATE\b/);
    expect(outsideFunctionBodies).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|FUNCTION)\b/);
    expect(rollout).toContain('NO BACKFILL IS PERFORMED OR ATTEMPTED HERE');
  });

  it('20. documents the DB-first release order, never application-first', () => {
    expect(rollout).toContain('DB FIRST, APPLICATION SECOND');
    const order = ['UNDEPLOYED', 'Apply this rollout',
                   '20260905_image_library_ownership_verify.sql', 'Only then deploy'];
    let previous = -1;
    for (const step of order) {
      const at = rollout.indexOf(step);
      expect(at, `runbook step out of order: ${step}`).toBeGreaterThan(previous);
      previous = at;
    }
    expect(rollout).toContain('rollout_readiness');
  });

  it('21. the two source migrations are not modified by this gate', () => {
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
