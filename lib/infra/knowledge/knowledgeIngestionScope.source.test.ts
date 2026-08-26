import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P4 scope guards. Ingestion must create the authoritative knowledge document
 * and its stored source -- and nothing else. These pin the boundaries the
 * patch draws so a later change cannot quietly turn ingestion into a
 * layout-specific or extraction-triggering path.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/**
 * Strips comments so the forbidden-token scans below test what the code
 * DOES, not what its documentation says it deliberately avoids -- these
 * files explain at length that OpenDataLoader/workers are out of scope, and
 * naming a thing in order to exclude it must not trip the guard.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const P4_FILES = [
  'lib/domain/knowledge/knowledgeIngestion.ts',
  'lib/infra/knowledge/knowledgeIngestionAdapters.ts',
] as const;

const p4Source = P4_FILES.map(read).join('\n');
const p4Code = codeOnly(p4Source);

describe('P4 scope -- no Padlet creation (13)', () => {
  it('ingestion never inserts into padlets or builds a canvas object', () => {
    expect(p4Source).not.toMatch(/from\(\s*['"]padlets['"]\s*\)/);
    expect(p4Source).not.toMatch(/\bpadlet_id\b/);
    expect(p4Source).not.toMatch(/createPadlet|createPost|addPadlet|insertPadlet/i);
  });

  it('ingestion never touches source_references (that needs a target Padlet)', () => {
    expect(p4Source).not.toContain('source_references');
  });

  it('the only table ingestion writes is knowledge_documents', () => {
    const tables = [...p4Source.matchAll(/from\(\s*['"]([a-z_]+)['"]\s*\)/g)].map((m) => m[1]);
    const written = new Set(tables);
    // boards / board_collaborators are read for authorization only.
    expect([...written].sort()).toEqual(['board_collaborators', 'boards', 'knowledge_documents']);
  });
});

describe('P4 scope -- no extraction runtime (14)', () => {
  it('no OpenDataLoader, Java, Docker, or worker invocation exists in the ingestion path', () => {
    for (const forbidden of [
      /opendataloader/i, /\bjava\b/i, /spawn\(/, /execFile\(/, /child_process/,
      /docker/i, /queue/i, /pdf\.?js/i, /pgvector/i, /embedding/i,
    ]) {
      expect(p4Code).not.toMatch(forbidden);
    }
  });

  it('ingestion never sets a processing status itself -- the schema default owns it', () => {
    const infra = read('lib/infra/knowledge/knowledgeIngestionAdapters.ts');
    // Scope to the INSERT payload -- the row-reader interface and the
    // row->domain mapper legitimately mention these columns when reading.
    const insertStart = infra.indexOf(".insert({");
    const insertEnd = infra.indexOf("})", insertStart);
    expect(insertStart).toBeGreaterThan(-1);
    const insertPayload = infra.slice(insertStart, insertEnd);
    for (const col of [
      'processing_status', 'page_count', 'parser_name', 'parser_version',
      'parser_options_hash', 'raw_artifact_path', 'processing_error',
    ]) {
      expect(insertPayload).not.toContain(col);
    }
  });

  it('defines the uploaded -> processing seam as a contract only, with no implementation', () => {
    const domain = read('lib/domain/knowledge/knowledgeIngestion.ts');
    expect(domain).toContain('export interface KnowledgeProcessingTransition');
    expect(domain).toContain('markProcessing');
    // A contract, not a class/function that could run anything.
    expect(domain).not.toMatch(/class\s+\w*ProcessingTransition/);
  });
});

describe('P4 scope -- no UI/canvas files touched (15)', () => {
  it('ships no React/Next imports and lives entirely outside components/ and app/', () => {
    for (const file of P4_FILES) {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
      expect(file.startsWith('lib/')).toBe(true);
    }
    expect(p4Source).not.toMatch(/from ['"]react['"]/);
    expect(p4Source).not.toMatch(/from ['"]next\//);
    expect(p4Source).not.toMatch(/\.tsx['"]/);
  });

  it('the domain half imports no infrastructure (CONVENTIONS.md rule 1)', () => {
    const domain = read('lib/domain/knowledge/knowledgeIngestion.ts');
    expect(domain).not.toMatch(/@supabase/);
    expect(domain).not.toMatch(/node:crypto/);
    expect(domain).not.toMatch(/from ['"]\.\.\/\.\.\/infra/);
  });
});

describe('P4 scope -- storage destination is private, not the public padlet bucket', () => {
  it('uses a dedicated Knowledge bucket rather than the public padlet-files bucket', () => {
    const infra = read('lib/infra/knowledge/knowledgeIngestionAdapters.ts');
    expect(infra).toContain("KNOWLEDGE_STORAGE_BUCKET = 'knowledge-documents'");
    expect(infra).not.toContain("'padlet-files'");
  });

  it('the storage path is board- and document-scoped and ends in a fixed filename', () => {
    const domain = read('lib/domain/knowledge/knowledgeIngestion.ts');
    expect(domain).toContain('`knowledge/${boardId}/${documentId}/original.pdf`');
  });
});

describe('P4 scope -- deletion lifecycle is deferred, but ingestion cleans up after itself', () => {
  it('no deleteKnowledgeDocument service is implemented in P4', () => {
    expect(p4Source).not.toMatch(/deleteKnowledgeDocument/);
  });

  it('the ingestion path does compensate for its own failed upload', () => {
    const domain = read('lib/domain/knowledge/knowledgeIngestion.ts');
    expect(domain).toContain('await deps.storage.remove(storagePath);');
  });
});

describe('P6J-F9-A0 scope -- derivative policy is pure, and renders nothing', () => {
  const policy = read('lib/domain/knowledge/knowledgePdfRenderPolicy.ts');

  it('carries no renderer, no data layer, no framework, and writes nothing', () => {
    for (const forbidden of [
      'pdfjs-dist', 'pdfjs', 'canvas', '@napi-rs', 'sharp', 'fetch(', '@supabase',
      'react', 'child_process', 'process.env',
      'upload(', '.insert(', '.update(', '.remove(', '.from(',
    ]) {
      expect(codeOnly(policy), `the policy module must not contain ${forbidden}`)
        .not.toContain(forbidden);
    }
  });

  it('pins the PM-locked limits as constants and keeps the path scoped', () => {
    expect(policy).toContain('KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES = 52_428_800');
    expect(policy).toContain('KNOWLEDGE_DERIVATIVE_MAX_PAGES = 200');
    expect(policy).toContain('`knowledge/${boardId}/${documentId}/pages/${pageNumber}');
  });

  it('deletion enumerates derivatives without any Storage listing API', () => {
    const deletion = read('lib/domain/knowledge/knowledgeDeletion.ts');
    expect(deletion).toContain('knowledgePageDerivativePaths');
    // The gateway is upload/remove only; discovering objects is not available
    // and must not be introduced to make cleanup work.
    for (const forbidden of ['.list(', 'listObjects', 'prefix']) {
      expect(codeOnly(deletion), `deletion must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('A0 adds no Storage write anywhere in the ingestion path', () => {
    // The renderer arrives in F9-A1; nothing in A0 may produce a derivative.
    const worker = read('workers/knowledge-pdf/processKnowledgePdfDocument.ts');
    expect(worker).not.toContain('pages/');
    expect(worker).not.toContain('webp');
  });
});
