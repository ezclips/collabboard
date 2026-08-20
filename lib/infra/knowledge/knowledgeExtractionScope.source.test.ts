import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P5A scope guards. This patch defines the extraction CONTRACT; it does not
 * execute anything. These pin that boundary so a later change cannot quietly
 * grow a parser, a queue, a chunker or a browser-reachable privileged call
 * into the lifecycle.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** Strips comments: naming a thing to exclude it must not trip a guard. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const P5A_FILES = [
  'lib/domain/knowledge/knowledgeExtraction.ts',
  'lib/infra/knowledge/knowledgeExtractionAdapters.ts',
] as const;

const domainSource = read(P5A_FILES[0]);
const infraSource = read(P5A_FILES[1]);
const p5aSource = `${domainSource}\n${infraSource}`;
const p5aCode = codeOnly(p5aSource);
const migration = read('supabase/migrations/20260821_add_knowledge_extraction_lifecycle.sql');

describe('P5A scope -- no extraction runtime (17, 18)', () => {
  it('contains no parser, JVM, container or subprocess invocation', () => {
    for (const forbidden of [
      /opendataloader/i,
      /\bjava\b/i,
      /spawn\(/,
      /exec\(/,
      /execFile\(/,
      /child_process/,
      /docker/i,
    ]) {
      expect(p5aCode).not.toMatch(forbidden);
    }
  });

  it('does not import PDF.js into the P5A lifecycle -- geometry arrives as an input', () => {
    expect(p5aCode).not.toMatch(/pdf\.?js/i);
    expect(p5aCode).not.toMatch(/pdfjs-dist/);
    // Geometry is supplied to the service, never derived inside it.
    expect(domainSource).toContain('KnowledgePageGeometryInput');
  });

  it('adds no queue, scheduler, webhook or worker deployment', () => {
    for (const forbidden of [
      /bullmq/i,
      /\bredis\b/i,
      /\bcron\b/i,
      /webhook/i,
      /setInterval\(/,
      /pg_boss/i,
      /pgmq/i,
    ]) {
      expect(p5aCode).not.toMatch(forbidden);
    }
  });
});

describe('P5A scope -- no chunking, embeddings or RAG (16)', () => {
  it('never writes knowledge_chunks and adds no vector machinery', () => {
    expect(p5aSource).not.toContain('knowledge_chunks');
    for (const forbidden of [/pgvector/i, /embedding/i, /\bchunk/i, /openai/i, /anthropic/i]) {
      expect(p5aCode).not.toMatch(forbidden);
    }
    expect(migration).not.toContain('knowledge_chunks');
  });

  it('creates no Padlet and no source_reference', () => {
    expect(p5aSource).not.toMatch(/from\(\s*['"]padlets['"]\s*\)/);
    expect(p5aSource).not.toContain('source_references');
    expect(migration).not.toContain('padlets');
    expect(migration).not.toContain('source_references');
  });

  it('touches only knowledge_documents and knowledge_pages', () => {
    const tables = new Set(
      [...p5aSource.matchAll(/from\(\s*['"]([a-z_]+)['"]\s*\)/g)].map((match) => match[1]),
    );
    expect([...tables].sort()).toEqual(['knowledge_documents']);
    // Pages are only ever written inside the transactional function.
    expect(migration).toContain('public.knowledge_pages');
  });
});

describe('P5A scope -- no UI, API or browser surface', () => {
  it('lives entirely under lib/ with no React or Next imports', () => {
    for (const file of P5A_FILES) {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
      expect(file.startsWith('lib/')).toBe(true);
    }
    expect(p5aSource).not.toMatch(/from ['"]react['"]/);
    expect(p5aSource).not.toMatch(/from ['"]next\//);
    expect(p5aSource).not.toMatch(/\.tsx['"]/);
  });

  it('adds no signed-URL endpoint and no storage mutation', () => {
    expect(p5aCode).not.toMatch(/createSignedUrl/);
    expect(p5aCode).not.toMatch(/getPublicUrl/);
    // The original PDF is read by the worker, never rewritten by P5A.
    expect(p5aCode).not.toMatch(/\.upload\(/);
    expect(p5aCode).not.toMatch(/\.remove\(/);
  });

  it('keeps the domain half free of infrastructure (CONVENTIONS.md rule 1)', () => {
    expect(domainSource).not.toMatch(/@supabase/);
    expect(domainSource).not.toMatch(/node:/);
    expect(domainSource).not.toMatch(/from ['"]\.\.\/\.\.\/infra/);
  });
});

describe('P5A scope -- worker privilege boundary', () => {
  it('the completion function is SECURITY INVOKER and revoked from browser roles', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).not.toContain('SECURITY DEFINER');
    // Revoking PUBLIC is not enough on Supabase: ALTER DEFAULT PRIVILEGES
    // hands anon and authenticated an explicit EXECUTE grant on every new
    // public-schema function, so both must be named.
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    expect(migration).not.toMatch(/TO\s+authenticated/);
    expect(migration).not.toMatch(/TO\s+anon/);
  });

  it('does not weaken RLS or touch policies', () => {
    for (const forbidden of [
      /DISABLE ROW LEVEL SECURITY/i,
      /DROP POLICY/i,
      /CREATE POLICY/i,
      /ALTER TABLE .* FORCE/i,
    ]) {
      expect(migration).not.toMatch(forbidden);
    }
  });

  it('the repository factory is server-only', () => {
    expect(infraSource).toContain('getSupabaseAdmin');
    expect(infraSource).toContain('createServerKnowledgeExtractionRepository');
  });
});

describe('P5A scope -- the state machine is not bypassable', () => {
  it('claim is a single conditional update restricted to claimable statuses', () => {
    expect(infraSource).toContain("update({ processing_status: 'processing', processing_error: null })");
    expect(infraSource).toContain(".in('processing_status', KNOWLEDGE_CLAIMABLE_STATUSES)");
  });

  it('fail is restricted to processing and clears the raw artifact pointer', () => {
    expect(infraSource).toContain(".eq('processing_status', 'processing')");
    expect(infraSource).toContain('raw_artifact_path: null');
  });

  it('nothing in P5A can set ready outside the transactional function', () => {
    expect(codeOnly(infraSource)).not.toContain("'ready'");
    expect(migration).toContain("processing_status = 'ready'");
    expect(migration).toContain("current_status <> 'processing'");
  });

  it('the completion function replaces pages inside the same transaction that sets ready', () => {
    const deleteAt = migration.indexOf('DELETE FROM public.knowledge_pages');
    const insertAt = migration.indexOf('INSERT INTO public.knowledge_pages');
    const readyAt = migration.indexOf("processing_status = 'ready'");
    expect(deleteAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(deleteAt);
    expect(readyAt).toBeGreaterThan(insertAt);
    // No explicit COMMIT/subtransaction: one RPC call is one transaction.
    expect(migration).not.toMatch(/^\s*COMMIT;/m);
  });
});
