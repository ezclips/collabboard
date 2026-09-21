import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Item 18's prepared SQL exists in three copies that MUST agree, and drift
// between them has already happened once: the production-rollouts mirror was
// left behind when the migration's classifier was corrected, so the two files
// disagreed about what a client could insert.
//
// NONE of this SQL has been executed anywhere. These tests check the files
// against each other, which is the only thing a test can honestly check here --
// whether the classifier is CORRECT is settled by running it in the isolated
// database, not by this suite.

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const MIGRATION = 'supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql';
const MIRROR = 'supabase/production-rollouts/20260921140000_knowledge_documents_insert_not_client_writable.sql';
const ADVERSARIAL =
  'supabase/production-rollouts/20260921140000_knowledge_documents_insert_not_client_writable_adversarial.sql';

const migration = read(MIGRATION);
const mirror = read(MIRROR);
const adversarial = read(ADVERSARIAL);

const classifier = (() => {
  const start = migration.indexOf('DO $item18$');
  const end = migration.indexOf('$item18$;', start);
  expect(start, 'the migration must contain a DO $item18$ block').toBeGreaterThanOrEqual(0);
  expect(end, 'the migration must close its DO $item18$ block').toBeGreaterThan(start);
  return migration.slice(start, end + '$item18$;'.length);
})();

const CASE_COUNT = 5;

describe('item 18 prepared SQL', () => {
  it('keeps the rollout mirror byte-identical to the migration', () => {
    expect(mirror).toBe(migration);
  });

  it('embeds the migration classifier verbatim in every adversarial case', () => {
    const occurrences = adversarial.split(classifier).length - 1;
    expect(
      occurrences,
      'regenerate: node scripts/db/generate-item18-adversarial.mjs',
    ).toBe(CASE_COUNT);
  });

  it('declares the adversarial file generated, so nobody edits it by hand', () => {
    expect(adversarial).toContain('GENERATED FILE');
    expect(adversarial).toContain('node scripts/db/generate-item18-adversarial.mjs');
  });

  it('uses no psql meta-commands, so a statement runner can execute it', () => {
    // The earlier version depended on \i, \if and :ERROR, which the MCP's
    // execute_sql cannot run at all.
    for (const meta of ['\\i ', '\\if', '\\else', '\\endif', '\\echo', '\\set', ':ERROR']) {
      expect(adversarial, `the plain-SQL file must not use ${meta}`).not.toContain(meta);
    }
  });

  it('covers the three shapes that would otherwise reach a false no-op', () => {
    // Each is invisible to a table-level privilege question, which is exactly
    // how the classifier used to report "already applied" while a client could
    // still insert selected columns.
    expect(adversarial).toContain('GRANT INSERT (content_sha256) ON TABLE public.knowledge_documents TO PUBLIC');
    expect(adversarial).toContain('GRANT item18_probe_parent TO authenticated');
    expect(adversarial).toContain(
      'GRANT INSERT (id, created_by, board_id, content_sha256) ON TABLE public.knowledge_documents TO authenticated',
    );
  });

  it('carries positive controls, so rejecting everything cannot pass', () => {
    expect(adversarial).toContain('POSITIVE CONTROL -- the genuine post-state must be a verified no-op');
    expect(adversarial).toContain('POSITIVE CONTROL -- the supported pre-state must repair');
  });

  it('ends every case by raising, so no shape can outlive its subtransaction', () => {
    const raises = adversarial.split("USING ERRCODE = 'ZZ001'").length - 1;
    expect(raises).toBe(CASE_COUNT);
  });

  // THE ISOLATED RUN CAUGHT A BUG THIS FILE DID NOT. The classifier carried a
  // `malformed array literal` fault, and cases 1-3 scored PASS on it: they
  // accepted ANY error as a refusal, so a classifier that could not run at all
  // looked adversarially sound. A rejection now has to be THE rejection.
  it('fails a case refused by a fault rather than by a check', () => {
    // P0001 is what a plain RAISE EXCEPTION produces. Anything else -- 22P02
    // for the malformed array literal, 42703 for a missing column -- is the
    // classifier breaking, not judging.
    expect(adversarial).toContain("ELSIF SQLSTATE <> 'P0001' THEN");
    expect(adversarial).toContain('refused by a FAULT, not by a check');
  });

  it('pins each shape to the specific check that must catch it', () => {
    // Not merely 'some unsupported state' -- the one named for this shape. A
    // shape refused by a different check is refused by accident.
    for (const expected of [
      'unsupported state: column-level INSERT is granted to PUBLIC%',
      'unsupported state: INSERT reaches a client role through role membership%',
      'unsupported state: separate column-level INSERT grants exist%',
    ]) {
      expect(adversarial, `no case pins: ${expected}`).toContain(`SQLERRM NOT LIKE '${expected}'`);
    }
    expect(adversarial).toContain('refused by the WRONG check');
  });

  it('pins the refusal messages to text the classifier actually raises', () => {
    // The pin is worthless if it names a message no longer in the migration:
    // the LIKE would never match and every case would FAIL. Check both ends.
    for (const prefix of [
      'unsupported state: column-level INSERT is granted to PUBLIC',
      'unsupported state: INSERT reaches a client role through role membership',
      'unsupported state: separate column-level INSERT grants exist',
    ]) {
      expect(classifier, `the classifier no longer raises: ${prefix}`).toContain(prefix);
    }
  });
  it('computes its own verdict rather than leaving it to be eyeballed', () => {
    expect(adversarial).toContain("'*** INCOMPLETE -- '");
    expect(adversarial).toContain("count(*) <> 5");
    expect(adversarial).toContain("'ALL PASS -- 5 of 5'");
  });

  // CHANGED TWICE, BOTH TIMES DELIBERATELY. It first asserted 'has not been
  // executed'; then, after the shimmed run, that no clean run had happened.
  // Both stopped being true. The test survives because the requirement never
  // changed: these files must state their execution status, and it must be the
  // CURRENT one. A stale line understates what is known; a generous one
  // overstates what is safe -- and the second error is the one that ends with
  // SQL applied to a database nobody verified it against.
  it('states a current execution status that stops short of hosted', () => {
    for (const [name, sql] of [['adversarial', adversarial], ['migration', migration]] as const) {
      expect(sql, `${name} must carry a dated status`).toContain('STATUS 2026-09-21');
      expect(sql, `${name} must name where it ran`).toContain('isolated LOCAL stack');
      expect(sql, `${name} must record the clean run commit`).toContain('571b19b6');
      expect(sql, `${name} must not claim hosted application`).toContain('NEVER applied to hosted');
      expect(sql, `${name} must not claim a hosted run`).toContain('NOT yet run against the hosted database');
    }
  });
});
