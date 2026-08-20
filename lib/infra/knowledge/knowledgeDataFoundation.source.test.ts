import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260820_create_knowledge_data_foundation.sql';
const migration = fs.readFileSync(path.join(process.cwd(), migrationPath), 'utf8');
const packageJson = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
const persistenceDomain = fs.readFileSync(
  path.join(process.cwd(), 'lib/domain/knowledge/knowledgePersistence.ts'),
  'utf8',
);

describe('P3 Knowledge data foundation migration', () => {
  it('keeps knowledge document identity independent from Padlet identity', () => {
    const documentDefinition = migration.slice(0, migration.indexOf('CREATE TABLE IF NOT EXISTS public.knowledge_pages'));

    expect(documentDefinition).toContain('CREATE TABLE IF NOT EXISTS public.knowledge_documents');
    expect(documentDefinition).toContain('board_id uuid NOT NULL');
    expect(documentDefinition).not.toMatch(/padlet_id/i);
  });

  it('cascades pages, chunks, and source references from documents', () => {
    expect(migration).toMatch(
      /document_id uuid NOT NULL REFERENCES public\.knowledge_documents\(id\) ON DELETE CASCADE/g,
    );
    expect(migration).toMatch(
      /source_document_id uuid NOT NULL REFERENCES public\.knowledge_documents\(id\) ON DELETE CASCADE/,
    );
  });

  it('cascades source references when the target Padlet is deleted without deleting documents', () => {
    expect(migration).toMatch(
      /target_padlet_id uuid NOT NULL REFERENCES public\.padlets\(id\) ON DELETE CASCADE/,
    );
    expect(migration).not.toMatch(/knowledge_documents.*REFERENCES public\.padlets/);
  });

  it('pins 1-based page and valid chunk-range constraints without fake geometry defaults', () => {
    expect(migration).toContain('CONSTRAINT knowledge_pages_page_number_check CHECK (page_number >= 1)');
    expect(migration).toContain('CONSTRAINT knowledge_chunks_page_start_check CHECK (page_start >= 1)');
    expect(migration).toContain('CONSTRAINT knowledge_chunks_page_range_check CHECK (page_end >= page_start)');
    expect(migration).toContain('width_points double precision');
    expect(migration).toContain('height_points double precision');
    expect(migration).not.toMatch(/width_points[^\n]*DEFAULT\s+612/i);
    expect(migration).not.toMatch(/height_points[^\n]*DEFAULT\s+792/i);
  });

  it('uses board-derived RLS and no independent Knowledge membership model', () => {
    for (const table of ['knowledge_documents', 'knowledge_pages', 'knowledge_chunks', 'source_references']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain('public.is_board_member(board_id, auth.uid())');
    expect(migration).toContain("role = 'editor'");
    expect(migration).not.toMatch(/knowledge_(members|collaborators|permissions)/i);
  });

  it('defers vector storage and semantic elements', () => {
    expect(migration).not.toMatch(/CREATE EXTENSION[^\n]*vector/i);
    expect(migration).not.toMatch(/\bvector\s*\(/i);
    expect(migration).not.toMatch(/CREATE TABLE[^;]*knowledge_elements/i);
    expect(persistenceDomain).not.toMatch(/from\s+['"]@opendataloader\/pdf['"]|child_process|java\s+-jar|jvm/i);
  });

  it('does not add the OpenDataLoader runtime to the application dependency graph', () => {
    // P5B owns the isolated PDF.js geometry dependency. OpenDataLoader’s Java
    // runtime/JAR remains external and is deliberately not an npm package.
    expect(packageJson).not.toMatch(/@opendataloader\/pdf|opendataloader-pdf/i);
  });

  it('documents the server-authorized worker write path and lifecycle invariants', () => {
    const docs = fs.readFileSync(path.join(process.cwd(), 'docs/knowledge-data-foundation.md'), 'utf8');
    expect(docs).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(docs).toContain('knowledge_elements');
    expect(docs).toContain('content hash');
    expect(docs).toContain('cascade');
  });
});
