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
      'function argument types are',
      'function result columns are',
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

  it('10. compares the COMPLETE privilege set INCLUDING grantability', () => {
    // aclexplode enumerates every grantee; has_function_privilege can only
    // answer about roles someone thought to name. And WITH GRANT OPTION is a
    // delegation right, so is_grantable is part of the identity of a grant:
    // without it, `authenticated` could hand EXECUTE to anyone.
    expect(statements).toContain('aclexplode');
    expect(verifier).toContain('aclexplode');
    expect(verifier).toContain('exact ACL set, none grantable');
    for (const gate of [block(rollout, 'DO $preflight$', '$preflight$;'),
                        block(rollout, 'DO $postflight$', '$postflight$;'), verifier]) {
      expect(gate).toContain('a.is_grantable');
      expect(gate).toContain("'authenticated:EXECUTE:false'");
      expect(gate).toContain("'service_role:EXECUTE:false'");
      expect(gate).toContain("'postgres:EXECUTE:false'");
    }
    // A grantable variant can never satisfy the expected set.
    expect(rollout).not.toContain("'authenticated:EXECUTE:true'");
    expect(verifier).not.toContain("'authenticated:EXECUTE:true'");
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

  it('12c. exclusion constraints are found through their BACKING INDEX', () => {
    // EXCLUDE USING btree ((library_item_id::text) WITH =) stores 0 in conkey
    // AND its backing index is not indisunique, so neither the conkey scan nor
    // the uniqueness scan sees it -- while it still outlaws the second
    // placement. The backing index is what actually reads the column.
    for (const gate of [block(rollout, 'DO $preflight$', '$preflight$;'),
                        block(rollout, 'DO $postflight$', '$postflight$;'), verifier]) {
      expect(gate).toContain('con.conindid');
      expect(gate).toMatch(/contype = 'x'/);
      // ...and the direct-conkey path is kept as well, for a plain column key.
      expect(gate).toMatch(/contype IN \('u', ?'x', ?'p'\)/);
      expect(gate).toContain('ANY (con.conkey)');
    }
    expect(verifier).toContain('no unique/exclusion constraint constrains the link');
  });

  it('12b. detects UNIQUE by catalog DEPENDENCY, so expression indexes cannot hide', () => {
    // UNIQUE ((library_item_id::text)) stores 0 in indkey, so an attnum
    // comparison misses it while it still outlaws the second placement.
    // pg_depend records the column an index key or predicate actually reads.
    for (const gate of [block(rollout, 'DO $preflight$', '$preflight$;'),
                        block(rollout, 'DO $postflight$', '$postflight$;'), verifier]) {
      expect(gate).toContain('pg_depend');
      expect(gate).toContain('refobjsubid');
      expect(gate).toContain('indisunique');
    }
    // Unique/exclusion CONSTRAINTS reach the same outcome by another route.
    for (const gate of [block(rollout, 'DO $preflight$', '$preflight$;'),
                        block(rollout, 'DO $postflight$', '$postflight$;'), verifier]) {
      expect(gate).toContain('pg_constraint');
    }
    expect(verifier).toContain('no UNIQUE index depends on the link column');
    // A NON-unique expression index is a performance index, not a cardinality
    // restriction: the guard is scoped to unique ones only.
    expect(verifier).not.toMatch(/indexprs IS NOT NULL[\s\S]{0,40}RAISE/);
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

  const preflight = () => block(rollout, 'DO $preflight$', '$preflight$;');
  const postflight = () => block(rollout, 'DO $postflight$', '$postflight$;');
  /** The three places the same contract has to hold. */
  const allThreeGates = () => [preflight(), postflight(), verifier];

  it('14. every column the function touches is in ALL THREE typed manifests', () => {
    const referenced = referencedColumns(hardenedBody);
    expect(referenced.size).toBeGreaterThan(15);
    for (const ref of referenced) {
      const [table, column] = ref.split('.');
      // The rollout creates this one, so rows 1-4 assert its shape instead.
      if (ref === 'padlets.library_item_id') continue;
      // Typed entries carry the exact typname AND the exact atttypmod.
      const entry = new RegExp(`\\('${table}','${column}','\\w+',-?\\d+\\)`);
      for (const [i, gate] of allThreeGates().entries()) {
        expect(gate, `gate ${i} manifest is missing ${ref}`).toMatch(entry);
      }
    }
  });

  it('15. the manifest is TYPED and TYPMOD-EXACT, and authority keys are uuid', () => {
    // Existence is not enough: boards.user_id as text passes an existence
    // check and then fails at runtime with "operator does not exist: text =
    // uuid" -- after the rollout has already reported success.
    for (const gate of allThreeGates()) {
      for (const uuidKey of [
        "('boards','id','uuid',-1)", "('boards','user_id','uuid',-1)",
        "('board_collaborators','board_id','uuid',-1)",
        "('board_collaborators','user_id','uuid',-1)",
        "('padlets','id','uuid',-1)", "('padlets','board_id','uuid',-1)",
        "('library_items','id','uuid',-1)", "('library_items','user_id','uuid',-1)",
      ]) {
        expect(gate, `missing typed authority key ${uuidKey}`).toContain(uuidKey);
      }
      expect(gate).toContain("('padlets','metadata','jsonb',-1)");
      expect(gate).toContain("('library_items','content','jsonb',-1)");
      expect(gate).toContain("('library_items','is_public','bool',-1)");
      // C3-B: the BOUNDED column is pinned to its canonical typmod. The RPC
      // inserts the literal 'image', and a re-bound to varchar(1) both breaks
      // that and passes any type-family check.
      expect(gate).toContain("('padlets','type','varchar',54)");
      expect(gate).toContain("('library_items','type','text',-1)");
      expect(gate).toContain("('padlets','position_x','int4',-1)");
      expect(gate).toContain("('padlets','width','numeric',-1)");
      // Structural comparison of both the type and its modifier.
      expect(gate).toContain('a.atttypmod');
      expect(gate).toContain('cur.ty <> req.ty OR cur.tm <> req.tm');
      // No loose family matching survives.
      expect(gate).not.toContain("udt_name IN ('text'");
    }
  });

  it('16. auth.uid() is checked as a callable dependency, in all three gates', () => {
    for (const gate of allThreeGates()) {
      expect(gate).toContain("to_regprocedure('auth.uid()')");
      // Not a body-text search: the actual catalog entry, and its return type,
      // because the actor comparison is against a uuid.
      expect(gate).toContain('uuid');
    }
    for (const gate of [preflight(), postflight()]) {
      expect(gate).toContain("<> 'uuid'::regtype");
    }
    expect(verifier).toContain('auth.uid() exists, takes no arguments, returns uuid');
    expect(verifier).toContain('pronargs = 0');
  });

  it('17. postflight RE-QUERIES the catalog rather than trusting preflight', () => {
    // A prerequisite can be dropped between the two phases; the C1 artifact
    // committed anyway because postflight never looked again.
    const post = postflight();
    expect(post).toContain('unusable prerequisite column(s)');
    expect(post).toContain('information_schema.columns');
    expect(post).toContain("to_regclass(actual) IS NULL");
    // No cached boolean carried across from preflight.
    expect(post).not.toContain('preflight_ok');
    // The two gates run the same manifest, so they cannot drift apart.
    const manifestOf = (s: string) =>
      (s.match(/\('(?:boards|board_collaborators|padlets|library_items)','\w+','\w+',-?\d+\)/g) ?? []).sort();
    expect(manifestOf(preflight())).toEqual(manifestOf(post));
    expect(manifestOf(preflight())).toEqual(manifestOf(verifier));
    expect(manifestOf(preflight()).length).toBe(23);
  });

  it('17b. the pinned bound admits every fixed literal the RPC inserts', () => {
    // atttypmod for varchar(N) is N + 4. padlets.type is the only bounded
    // column the function writes, and it writes the literal 'image'.
    const literals = [...hardenedBody.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(literals).toContain('image');
    const bound = /\('padlets','type','varchar',(\d+)\)/.exec(rollout);
    expect(bound, 'padlets.type must be pinned with a typmod').not.toBeNull();
    const maxLength = Number(bound![1]) - 4;
    expect(maxLength).toBe(50);
    for (const literal of ['image']) {
      expect(literal.length, `${literal} must fit varchar(${maxLength})`)
        .toBeLessThanOrEqual(maxLength);
    }
  });
});

describe('C3: predicate identity and version disposition', () => {
  it('17c. the supporting-index predicate is compared EXACTLY, never normalised', () => {
    // Stripping parentheses and whitespace made `library_item_id IS NOT NULL`
    // and a call to a function literally named `library_item_idisnotnull()`
    // collapse onto the same token, so a predicate returning FALSE verified as
    // the reviewed one. Exact comparison is what keeps parse trees apart.
    for (const gate of [rollout, verifier]) {
      expect(gate).not.toContain("regexp_replace");
      expect(gate).not.toContain("'[\\s()]'");
      expect(gate).toContain('pg_get_expr(i.indpred, i.indrelid, false)');
      expect(gate).toContain('pred=(library_item_id IS NOT NULL)');
    }
    // The malicious spelling must not be what the artifact expects.
    for (const gate of [rollout, verifier]) {
      expect(gate).not.toContain('pred=library_item_idisnotnull');
    }
    // Provenance: the expected predicate is the one the reviewed migration's
    // own CREATE INDEX produces.
    expect(migration(SOURCES[0])).toContain('WHERE library_item_id IS NOT NULL');
  });

  it('18. no load-bearing comparison reads a catalog-RENDERED STATEMENT', () => {
    // pg_get_function_identity_arguments renders "double precision"; typname
    // stores "float8". pg_get_indexdef renders a whole statement. Neither is
    // used to decide anything here -- checked against STATEMENTS, since the
    // headers name these functions precisely to explain why they are avoided.
    for (const gate of [statements, verifierStatements]) {
      expect(gate).not.toContain('pg_get_function_identity_arguments');
      expect(gate).not.toContain('pg_get_function_result');
      expect(gate).not.toContain('pg_get_functiondef');
      expect(gate).not.toContain('pg_get_indexdef');
    }
    // Structural replacements.
    for (const gate of [rollout, verifier]) {
      expect(gate).toContain('proargtypes');
      expect(gate).toContain('proallargtypes');
      expect(gate).toContain('proargmodes');
      expect(gate).toContain('t.typname');
      expect(gate).toContain('indisunique');
      expect(gate).toContain('am.amname');
    }
    expect(rollout).toContain("'float8'");
    expect(verifier).toContain("'float8'");
  });

  it('19. the deparsed predicate is covered by an explicit PostgreSQL 17 guard', () => {
    // The predicate comparison is exact rather than normalised, which is what
    // fixes the collision -- but deparser output is still a major-version
    // detail, so all three gates fail closed anywhere but major 17. The guard
    // does not mask the collision; it makes the representation safe to trust.
    for (const gate of [block(rollout, 'DO $preflight$', '$preflight$;'),
                        block(rollout, 'DO $postflight$', '$postflight$;'), verifier]) {
      expect(gate).toContain("current_setting('server_version_num')");
      expect(gate).toContain('170000 AND 179999');
    }
    // In the verifier it is a LOAD-BEARING invariant row, not a diagnostic.
    const versionRow = verifierStatements.split('\n')
      .find((line) => line.includes("'compatibility'")) ?? '';
    expect(versionRow).toContain('PostgreSQL major 17');
    expect(verifierStatements).not.toContain("current_setting('server_version_num'), true");
    // And both artifacts say so plainly, so nobody re-pins it during an apply.
    expect(rollout).toContain('certified for PostgreSQL major 17 only');
    expect(verifier).toContain('POSTGRESQL MAJOR 17 ONLY');
  });
});

describe('C1: verifier contract', () => {
  it('16. is genuinely read only', () => {
    // Checked against STATEMENTS: the header explains why WITH GRANT OPTION is
    // rejected, and prose about a verb is not the verb.
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ',
      'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    // And nothing that would write even if it parsed as a read.
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
    expect(verifierStatements).not.toContain('nextval');
  });

  it('17. readiness is the conjunction of the same rows it prints', () => {
    // One list, one aggregate: there is no second roll-up expression that could
    // report true while a row above it reports false.
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
    expect(verifierStatements.match(/rollout_readiness/g)).toHaveLength(1);
    expect(verifier).toContain('FROM invariants');
    // Every load-bearing invariant is a row of that one list.
    const invariants = verifier.slice(verifier.indexOf('invariants(ord, section'));
    for (const check of [
      'padlets.library_item_id exists', 'type is uuid', 'is nullable', 'has NO default',
      'exactly one foreign key on the link', 'targets public.library_items(id)',
      'delete action is SET NULL, and only that',
      'PostgreSQL major 17 (this artifact is certified for it only)',
      'no UNIQUE index depends on the link column',
      'no unique/exclusion constraint constrains the link',
      'supporting index matches structurally, predicate exactly',
      'exists with the reviewed signature',
      'no other overload of the same name', 'canonical body digest matches the reviewed migration',
      'argument types match (structural)', 'result columns match (structural)',
      'SECURITY INVOKER, never DEFINER', 'configuration is exactly search_path=public',
      'owner is the expected deployment role', 'PUBLIC cannot execute', 'anon cannot execute',
      'authenticated can execute', 'service_role can execute',
      'exact ACL set, none grantable', 'required relations exist',
      'every column the function uses has the canonical type and typmod',
      'auth.uid() exists, takes no arguments, returns uuid',
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
