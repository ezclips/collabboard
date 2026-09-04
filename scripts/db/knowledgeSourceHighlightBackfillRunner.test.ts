import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertLocalBackfillAllowed } from './knowledgeSourceHighlightBackfillRunner';

/**
 * PDF-R6K-H2A -- the backfill's refusal guards.
 *
 * The guards are the reason this utility can exist in the repository at all.
 * Importing the runner module runs nothing; only the CLI calls it, which is why
 * these can be asserted directly.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RUNNER = read('scripts/db/knowledgeSourceHighlightBackfillRunner.ts');
const CLI = read('scripts/db/backfillKnowledgeSourceHighlights.ts');

const LOCAL: NodeJS.ProcessEnv = {
  ...process.env,
  KNOWLEDGE_HIGHLIGHT_BACKFILL: '1',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'local-key',
};

describe('PDF-R6K-H2A backfill guards', () => {
  it('1. refuses without the explicit confirmation flag', () => {
    expect(() => assertLocalBackfillAllowed({ ...LOCAL, KNOWLEDGE_HIGHLIGHT_BACKFILL: undefined }))
      .toThrow(/KNOWLEDGE_HIGHLIGHT_BACKFILL=1/);
  });

  it('2. refuses without credentials', () => {
    expect(() => assertLocalBackfillAllowed({ ...LOCAL, SUPABASE_URL: undefined }))
      .toThrow(/SUPABASE_URL/);
    expect(() => assertLocalBackfillAllowed({ ...LOCAL, SUPABASE_SERVICE_ROLE_KEY: undefined }))
      .toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('3. refuses ANY non-local host, however it is spelled', () => {
    // The decisive guard: a hosted project URL cannot satisfy it, so the script
    // is structurally incapable of reaching production.
    for (const url of [
      'https://abcdefgh.supabase.co',
      'https://db.abcdefgh.supabase.co:5432',
      'http://10.0.0.5:54321',
      'http://127.0.0.1.evil.example',
    ]) {
      expect(() => assertLocalBackfillAllowed({ ...LOCAL, SUPABASE_URL: url }), url)
        .toThrow(/not a local Supabase stack/);
    }
  });

  it('4. allows only the local stack', () => {
    for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321']) {
      expect(assertLocalBackfillAllowed({ ...LOCAL, SUPABASE_URL: url })).toBe(url);
    }
  });

  it('5. writes highlights and nothing else', () => {
    const code = RUNNER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // The only mutation in the file. Citations, padlets and Notes are read for
    // planning input and never written.
    expect(code.match(/\.insert\(/g) ?? []).toHaveLength(1);
    expect(code).toContain("from('knowledge_source_highlights').insert(");
    expect(code).not.toContain('.delete()');
    expect(code).not.toContain('.update(');
    expect(code).not.toContain('.upsert(');
  });

  it('6. never invents an author for a backfilled highlight', () => {
    // The citation's creator is not recorded anywhere, and attributing the
    // annotation to whoever ran the script would be a fabrication.
    expect(RUNNER).toContain('created_by: null');
  });

  it('7. the CLI is a thin wrapper: every guard lives in the tested module', () => {
    expect(CLI).toContain("import { runBackfill } from './knowledgeSourceHighlightBackfillRunner'");
    expect(CLI).not.toContain('createClient');
    expect(CLI).not.toContain('supabase.co');
  });
});
