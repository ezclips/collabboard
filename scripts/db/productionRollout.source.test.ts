import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rollout = fs.readFileSync(
  path.join(process.cwd(), 'supabase/production-rollouts/20260820_knowledge_pdf_v1.sql'),
  'utf8',
);
const verifier = fs.readFileSync(
  path.join(process.cwd(), 'supabase/production-rollouts/20260820_knowledge_pdf_v1_verify.sql'),
  'utf8',
);
const acceptedSources = [
  '20260820_create_knowledge_data_foundation.sql',
  '20260820_provision_knowledge_documents_bucket.sql',
  '20260821_add_knowledge_extraction_lifecycle.sql',
  '20260822_add_knowledge_processing_lease.sql',
  '20260823_add_knowledge_processing_candidates.sql',
];

describe('production Knowledge rollout artifacts', () => {
  it('contains the exact accepted migrations in dependency order only', () => {
    let previousIndex = -1;
    for (const sourceName of acceptedSources) {
      const sourcePath = path.join(process.cwd(), 'supabase/migrations', sourceName);
      const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n').trim();
      const marker = '-- SOURCE: supabase/migrations/' + sourceName;
      const markerIndex = rollout.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      expect(rollout.slice(markerIndex)).toContain(source);
      previousIndex = markerIndex;
    }

    expect(rollout.match(/^-- SOURCE:/gm)).toHaveLength(acceptedSources.length);
    expect(rollout).not.toContain('001_create_collabboard_schema.sql');
    expect(rollout).not.toContain('schema_snapshot_2026-07-05.sql');
    expect(rollout).not.toContain('20260710_fix_board_sections_wrong_table_rls.sql');
    expect(rollout).not.toContain('20260713_fix_kanban_board_member_policy_recursion.sql');
    expect(rollout).not.toContain('20260726_add_canvas_line_coord_space.sql');
  });

  it('guards the clean install before source migrations and commits assertions atomically', () => {
    expect(rollout.indexOf('BEGIN;')).toBeGreaterThanOrEqual(0);
    expect(rollout.indexOf('DO $preflight$')).toBeLessThan(rollout.indexOf('-- SOURCE:'));
    expect(rollout.indexOf('COMMIT;')).toBeGreaterThan(rollout.indexOf('DO $postflight$'));
    expect(rollout).toContain('public.knowledge_documents');
    expect(rollout).toContain('storage bucket knowledge-documents already exists');
    expect(rollout).toContain('one or more Knowledge RPCs already exist');
    expect(rollout).not.toMatch(/DROP TABLE\s/i);
    expect(rollout).not.toMatch(/DROP EXTENSION\s+vector/i);
    expect(rollout).not.toMatch(/CREATE TABLE[^;]*knowledge_elements/i);
  });

  it('keeps verification read-only and absent-table safe', () => {
    expect(verifier).toContain('to_regclass');
    expect(verifier).toContain('DO $row_counts$');
    expect(verifier).toContain('knowledge_elements');
    expect(verifier).toContain('vector_extension_present');
    expect(verifier).toContain('rollout_readiness');
    expect(verifier).not.toMatch(/CREATE\s+(TABLE|FUNCTION|INDEX|POLICY|EXTENSION)/i);
    expect(verifier).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  });
});
