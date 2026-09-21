// Generates the item 18 adversarial checks as PLAIN SQL, executable through a
// single statement-runner call (the Supabase MCP's execute_sql, for instance)
// with no psql meta-commands.
//
// WHY GENERATED. Each case has to run THE REAL CLASSIFIER, not a paraphrase of
// it -- a hand-copied classifier would pass its own tests while the migration
// drifted away underneath. The psql version could `\i` the migration; a plain
// SQL file cannot include anything, so the migration's DO block is embedded
// VERBATIM, five times, by this script. knowledgeItem18Sql.source.test.ts
// fails if the embedded copies stop matching the migration.
//
//   node scripts/db/generate-item18-adversarial.mjs
//
// Re-run it after ANY edit to the item 18 migration.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = join(
  root,
  'supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql',
);
const OUT = join(
  root,
  'supabase/production-rollouts/20260921140000_knowledge_documents_insert_not_client_writable_adversarial.sql',
);

const source = readFileSync(MIGRATION, 'utf8');
const start = source.indexOf('DO $item18$');
const end = source.indexOf('$item18$;', start);
if (start < 0 || end < 0) {
  throw new Error('could not find the DO $item18$ ... $item18$; block in the migration');
}
const body = source.slice(start, end + '$item18$;'.length);
if (body.includes('$mig$')) {
  throw new Error('the migration body contains the $mig$ tag used to quote it here');
}

const TABLE = 'public.knowledge_documents';
const revokeBoth = [
  `REVOKE INSERT ON TABLE ${TABLE} FROM authenticated`,
  `REVOKE INSERT ON TABLE ${TABLE} FROM anon`,
];

/** @type {{ n: number, title: string, why: string, shape: string[], expect: 'reject' | 'accept', extra?: string }[]} */
const cases = [
  {
    n: 1,
    title: 'a column-level INSERT grant to PUBLIC',
    expectMessage: 'unsupported state: column-level INSERT is granted to PUBLIC%',
    why: 'has_table_privilege(client, INSERT) is FALSE here and every role on the server can still insert that column; revoking from anon and authenticated would not remove it',
    shape: [...revokeBoth, `GRANT INSERT (content_sha256) ON TABLE ${TABLE} TO PUBLIC`],
    expect: 'reject',
  },
  {
    n: 2,
    title: 'INSERT inherited through another role',
    expectMessage: 'unsupported state: INSERT reaches a client role through role membership%',
    why: 'authenticated holds no grant of its own; it is a member of a role that does, and this migration cannot revoke another role’s grant',
    shape: [
      ...revokeBoth,
      'CREATE ROLE item18_probe_parent NOLOGIN',
      `GRANT INSERT ON TABLE ${TABLE} TO item18_probe_parent`,
      'GRANT item18_probe_parent TO authenticated',
    ],
    expect: 'reject',
  },
  {
    n: 3,
    title: 'a direct client column-level grant in an otherwise post-state ACL',
    expectMessage: 'unsupported state: separate column-level INSERT grants exist%',
    why: 'a table revoke would destroy this grant without the rollback restoring it, and until then the client can insert exactly the columns a recycled document needs',
    shape: [
      ...revokeBoth,
      `GRANT INSERT (id, created_by, board_id, content_sha256) ON TABLE ${TABLE} TO authenticated`,
    ],
    expect: 'reject',
  },
  {
    n: 4,
    title: 'POSITIVE CONTROL -- the genuine post-state must be a verified no-op',
    why: 'without this, a classifier that rejected EVERYTHING would pass cases 1-3',
    shape: [...revokeBoth],
    expect: 'accept',
  },
  {
    n: 5,
    title: 'POSITIVE CONTROL -- the supported pre-state must repair',
    why: 'asserted on the OUTCOME, not merely on the absence of an error',
    shape: [
      `GRANT INSERT ON TABLE ${TABLE} TO authenticated`,
      `GRANT INSERT ON TABLE ${TABLE} TO anon`,
    ],
    expect: 'accept',
    extra: `        SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
          INTO still
          FROM pg_attribute a
         WHERE a.attrelid = '${TABLE}'::regclass
           AND a.attnum > 0 AND NOT a.attisdropped
           AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
                OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));
        IF array_length(still, 1) IS NOT NULL THEN
            RAISE EXCEPTION 'INSERT still reaches a client role on: %', array_to_string(still, ', ')
                USING ERRCODE = 'ZZ002';
        END IF;
`,
  },
];

const caseSql = (c) => {
  const shape = c.shape.map((s) => `        EXECUTE '${s.replace(/'/g, "''")}';`).join('\n');
  const verdict =
    c.expect === 'reject'
      ? `        -- REJECTION IS NOT ENOUGH; IT MUST BE THE INTENDED REJECTION.
        -- An earlier revision scored a PASS on ANY error, so a plain
        -- malformed-array-literal BUG inside the classifier collected three
        -- of them -- the shape was refused for a reason having nothing to do
        -- with the shape. A broken classifier must never read as
        -- adversarially sound, so both the SQLSTATE and the specific check
        -- that must catch this shape are pinned.
        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'FAIL';
            detail  := 'the classifier ACCEPTED this state instead of rejecting it';
        ELSIF SQLSTATE <> 'P0001' THEN
            outcome := 'FAIL';
            detail  := 'refused by a FAULT, not by a check -- SQLSTATE '
                       || SQLSTATE || ': ' || SQLERRM;
        ELSIF SQLERRM NOT LIKE '${c.expectMessage.replace(/'/g, "''")}' THEN
            outcome := 'FAIL';
            detail  := 'refused by the WRONG check: ' || SQLERRM;
        ELSE
            outcome := 'PASS';
            detail  := 'refused as intended: ' || SQLERRM;
        END IF;`
      : `        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'PASS';
            detail  := 'accepted, as intended';
        ELSE
            outcome := 'FAIL';
            detail  := 'the classifier refused this state: ' || SQLERRM;
        END IF;`;

  return `-- ---------------------------------------------------------------------------
-- CASE ${c.n} -- ${c.title}.
-- ${c.why}.
-- ---------------------------------------------------------------------------
DO $case${c.n}$
DECLARE
    outcome text;
    detail  text;
    still   text[];
BEGIN
    -- The inner block is a SUBTRANSACTION. Whichever way it ends it ends by
    -- RAISING, so the shape applied below is ALWAYS rolled back -- nothing this
    -- case grants can outlive it, including the probe role.
    BEGIN
${shape}

        EXECUTE $mig$
${body}
$mig$;

${c.extra ?? ''}        RAISE EXCEPTION 'the classifier ran to completion' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
${verdict}
    END;

    INSERT INTO item18_adversarial_result (case_no, outcome, title, detail)
    VALUES (${c.n}, outcome, '${c.title.replace(/'/g, "''")}', detail);
END
$case${c.n}$;
`;
};

const header = `-- ADVERSARIAL CHECKS for item 18's state classifier. PLAIN SQL -- no psql
-- meta-commands, so a statement runner (Supabase MCP execute_sql) can run it.
--
-- GENERATED FILE. Do not edit by hand:
--     node scripts/db/generate-item18-adversarial.mjs
-- The migration's DO block is embedded VERBATIM below, five times, so every
-- case exercises THE REAL CLASSIFIER rather than a paraphrase of it.
-- knowledgeItem18Sql.source.test.ts fails if the copies drift.
--
-- WHY THIS FILE EXISTS. The classifier's dangerous failure is not a false
-- alarm, it is a FALSE NO-OP: a state in which a client can still insert some
-- columns, reported as "already applied". Three shapes produce exactly that if
-- access is judged at table level. Each is built ON TOP OF AN OTHERWISE
-- POST-STATE ACL, so a table-level classifier would answer "already applied"
-- and change nothing. Two positive controls sit beside them, because a
-- classifier that rejected everything would pass the other three.
--
-- NOTHING HERE PERSISTS. Every case applies its shape inside a PL/pgSQL
-- subtransaction that always ends by raising, so the shape is always rolled
-- back -- on the accepting path too, which is why the success path raises
-- ZZ001 deliberately rather than returning. CREATE ROLE and GRANT are
-- transactional, so the probe role and every grant go with it, and an
-- interrupted session is no exception: PostgreSQL rolls back the active
-- transaction, role and ACL changes included.
--
-- RUN IT AS ONE CALL. The temp table is session-scoped; a runner that splits
-- these statements across connections will fail loudly on the final SELECT
-- rather than quietly report success.
--
-- RUN IT AGAINST THE ISOLATED DATABASE ONLY, as a role that may GRANT, REVOKE
-- and CREATE ROLE. Not because the rollback is in doubt -- it is not -- but
-- because this file deliberately exercises privileged ACL and role mutations
-- on a live table, which is not something to point at a production database
-- whatever its cleanup guarantees.
--
-- PASS CRITERION: five rows, every outcome PASS, and the final verdict row
-- reading ALL PASS.
--
-- STATUS 2026-09-21: executed on an isolated LOCAL stack ONLY. That run
-- reported ALL PASS -- 5 of 5, and the result was WORTHLESS: the classifier
-- carried a malformed-array-literal fault, and cases 1-3 counted that fault
-- as a refusal. A classifier that could not run at all read as adversarially
-- sound. Both are fixed -- the fault, and the verdict that excused it -- but
-- this file has NOT been re-run since, and has NEVER been applied to hosted.
-- See .agent/isolated-sql-verification.md.

CREATE TEMP TABLE item18_adversarial_result (
    case_no integer PRIMARY KEY,
    outcome text NOT NULL,
    title   text NOT NULL,
    detail  text NOT NULL
);
`;

const footer = `-- ---------------------------------------------------------------------------
-- SUMMARY. The verdict is computed, not eyeballed: a missing case is a failure.
-- ---------------------------------------------------------------------------
SELECT
    CASE
        WHEN count(*) <> 5 THEN '*** INCOMPLETE -- ' || count(*)::text || ' of 5 cases reported'
        WHEN count(*) FILTER (WHERE outcome <> 'PASS') > 0
            THEN '*** FAIL -- ' || count(*) FILTER (WHERE outcome <> 'PASS')::text || ' case(s) failed'
        ELSE 'ALL PASS -- 5 of 5'
    END AS verdict
FROM item18_adversarial_result;

SELECT case_no, outcome, title, detail
  FROM item18_adversarial_result
 ORDER BY case_no;

DROP TABLE item18_adversarial_result;
`;

const out = [header, ...cases.map(caseSql), footer].join('\n');
writeFileSync(OUT, out, 'utf8');
console.log(`wrote ${OUT} (${out.split('\n').length} lines, ${cases.length} cases)`);
