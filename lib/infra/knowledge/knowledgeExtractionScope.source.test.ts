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
const leaseMigration = read('supabase/migrations/20260822_add_knowledge_processing_lease.sql');
const spatialMigration = read('supabase/migrations/20260824_add_knowledge_chunk_provenance.sql');
const chunkingSource = read('lib/domain/knowledge/knowledgeChunking.ts');
const workerSource = read('workers/knowledge-pdf/processKnowledgePdfDocument.ts');

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

describe('P6H scope -- chunk completion only, without retrieval machinery', () => {
  it('allows only the reviewed derived-chunk completion expansion', () => {
    for (const forbidden of [/pgvector/i, /embedding/i, /langchain/i, /openai/i, /anthropic/i, /vector/i]) {
      expect(`${p5aCode}\n${chunkingSource}\n${spatialMigration}`).not.toMatch(forbidden);
    }
    expect(migration).not.toContain('knowledge_chunks');
    expect(spatialMigration).toContain('knowledge_chunks');
    expect(p5aCode).toContain('p_chunks');
    expect(infraSource).toContain('p_chunks: toKnowledgeChunkRecords(completion)');
    expect(workerSource).toContain('buildKnowledgeChunks');
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
    expect([...tables].sort()).toEqual([]);
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

describe('P6H persistence scope -- provenance and privilege guards', () => {
  it('adds one locator array with no child table or secondary index', () => {
    expect(spatialMigration).toContain("ADD COLUMN IF NOT EXISTS source_locators jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(spatialMigration).toContain("CHECK (jsonb_typeof(source_locators) = 'array')");
    expect(spatialMigration).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX/i);
    expect(spatialMigration).not.toMatch(/CREATE TABLE[^;]*knowledge_(?:chunk_)?elements/i);
  });

  it('passes chunks to the same replacement RPC and validates row counts', () => {
    expect(spatialMigration).toContain('p_chunks jsonb');
    expect(spatialMigration).toContain('DELETE FROM public.knowledge_chunks');
    expect(spatialMigration).toContain('inserted_chunks');
    expect(spatialMigration).toContain('jsonb_typeof(c.source_locators) <> \'array\'');
    expect(spatialMigration).toContain("processing_status = 'ready'");
    expect(spatialMigration).toContain('processing_lease_token = NULL');
  });

  it('revokes the exact replacement RPC from every browser role', () => {
    const signature = 'uuid, uuid, integer, jsonb, jsonb, text, text, text, text, text';
    expect(spatialMigration).toContain(`REVOKE ALL ON FUNCTION public.complete_knowledge_extraction(\n    ${signature}\n) FROM PUBLIC, anon, authenticated;`);
    expect(spatialMigration).toContain(`GRANT EXECUTE ON FUNCTION public.complete_knowledge_extraction(\n    ${signature}\n) TO service_role;`);
  });

  it('keeps the expansion server-side and leaves citations independent', () => {
    expect(chunkingSource).not.toMatch(/from ['"](?:@supabase|node:)/);
    expect(p5aSource).not.toContain('source_references');
    expect(spatialMigration).not.toMatch(/chunk_id|originChunkIndex/i);
  });
});

describe('P5C scope -- the state machine is not bypassable', () => {
  it('claim is delegated to the database-time fenced claim RPC', () => {
    expect(infraSource).toMatch(/rpc(?:<[^>]+>)?\('claim_knowledge_extraction'/);
    expect(infraSource).toContain('p_lease_ttl_seconds');
    expect(infraSource).toContain('leaseToken');
  });

  it('fail is delegated to the fenced failure RPC with a lease token', () => {
    expect(infraSource).toMatch(/rpc(?:<[^>]+>)?\('fail_knowledge_extraction'/);
    expect(infraSource).toContain('p_lease_token');
    expect(leaseMigration).toContain('processing_lease_token = NULL');
    expect(leaseMigration).toContain('raw_artifact_path = NULL');
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
