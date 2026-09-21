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

  it('computes its own verdict rather than leaving it to be eyeballed', () => {
    expect(adversarial).toContain("'*** INCOMPLETE -- '");
    expect(adversarial).toContain("count(*) <> 5");
    expect(adversarial).toContain("'ALL PASS -- 5 of 5'");
  });

  it('records that none of this SQL has been executed', () => {
    expect(adversarial).toContain('UNVERIFIED');
    expect(migration).toContain('has not been executed');
  });
});
