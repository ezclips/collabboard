import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'scripts/db/bootstrap-local.mjs'), 'utf8');
const baseline = fs.readFileSync(path.join(process.cwd(), 'supabase/BASELINE.md'), 'utf8');
const config = fs.readFileSync(path.join(process.cwd(), 'supabase/config.toml'), 'utf8');

describe('reproducible local database bootstrap', () => {
  it('uses the formal baseline strategy and explicit post-baseline sequence', () => {
    expect(source).toContain("strategy: 'BASELINE'");
    expect(source).toContain('20260710_fix_board_sections_wrong_table_rls.sql');
    expect(source).toContain('20260713_fix_kanban_board_member_policy_recursion.sql');
    expect(source).toContain('20260726_add_canvas_line_coord_space.sql');
    expect(source).toContain('20260820_create_knowledge_data_foundation.sql');
    expect(source).toContain('20260820_provision_knowledge_documents_bucket.sql');
    expect(source).toContain('20260821_add_knowledge_extraction_lifecycle.sql');
    expect(source).toContain('20260822_add_knowledge_processing_lease.sql');
    expect(source).toContain('workers/knowledge-pdf/knowledgePdfWorker.integration.test.ts');
    expect(source).not.toContain('001_create_collabboard_schema.sql');
    expect(source).not.toContain('120260710_fix_board_sections_wrong_table_rls.sql');
  });

  it('is local-only and destroys the disposable project after validation', () => {
    expect(source).toContain('docker');
    expect(source).toContain('supabase');
    expect(source).toContain("['stop', '--project-id', projectId, '--no-backup']");
    expect(source).not.toContain('--linked');
    expect(source).toContain('SERVICE_ROLE_KEY');
    expect(source).not.toContain('db push');
    expect(source).not.toContain('migration repair');
    expect(source).toContain("status: 'blocked'");
  });

  it('documents the cutoff, local command, and historical-chain boundary', () => {
    expect(baseline).toContain('node scripts/db/bootstrap-local.mjs 2');
    expect(baseline).toContain('baseline/schema_snapshot_2026-07-05.sql');
    expect(baseline).toContain('direct `supabase db reset --local`');
    expect(config).toContain('project_id = "collabboard"');
    expect(config).toContain('enabled = false');
  });
});
