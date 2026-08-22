import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260825_add_knowledge_chunk_embeddings.sql');
const baselineHead = 'ef9bd49b55196cbd8e41eb1b11b3bd1243a427e5';
const reviewedHead = 'a49a54d521f31f43403fd751c9fea37cff38b3da';
const previousP6hMigration = execFileSync('git', ['show', `${baselineHead}:supabase/migrations/20260824_add_knowledge_chunk_provenance.sql`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
const reviewedP6iMigration = execFileSync('git', ['show', `${reviewedHead}:supabase/migrations/20260825_add_knowledge_chunk_embeddings.sql`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
const domain = read('lib/domain/knowledge/knowledgeEmbedding.ts');
const adapter = read('lib/infra/knowledge/knowledgeEmbeddingAdapters.ts');
const provider = read('workers/knowledge-embedding/openAIEmbeddingProvider.ts');
const documentWorker = read('workers/knowledge-embedding/embedDocument.ts');
const worker = read('workers/knowledge-embedding/runEmbeddingWorker.ts');
const cli = read('workers/knowledge-embedding/cli.ts');
const integration = read('lib/infra/knowledge/knowledgeEmbedding.integration.test.ts');
const semanticSearchAdapter = read('lib/infra/knowledge/knowledgeSemanticSearchAdapters.ts');
const querySmoke = read('workers/knowledge-embedding/querySmoke.ts');
const querySmokeCli = read('workers/knowledge-embedding/querySmokeCli.ts');
const querySmokeDockerfile = read('workers/knowledge-embedding/Dockerfile');
const newSources = [migration, domain, adapter, provider, documentWorker, worker, cli, integration].join('\n');

describe('P6I-A embedding scope and SQL guards', () => {
  it('keeps P6H immutable and adds only the embedding table/RPC layer', () => {
    expect(read('supabase/migrations/20260824_add_knowledge_chunk_provenance.sql')).toBe(previousP6hMigration);
    expect(migration).toBe(reviewedP6iMigration);
    expect(migration).not.toMatch(/ALTER TABLE public\.knowledge_chunks/i);
    expect(migration).not.toMatch(/complete_knowledge_extraction|source_references/i);
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions');
    expect(migration).toContain('CREATE TABLE public.knowledge_chunk_embeddings');
    expect(migration).toContain('PRIMARY KEY (chunk_id, model_id, dimensions)');
  });

  it('guards embedding table identity, provenance hash, dimensions, and RLS', () => {
    for (const required of [
      'chunk_id uuid NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE',
      'model_id text NOT NULL',
      'dimensions integer NOT NULL',
      'embedding extensions.vector NOT NULL',
      'chunk_text_hash text NOT NULL',
      'extensions.vector_dims(embedding) = dimensions',
      'char_length(model_id) BETWEEN 1 AND 128',
      'ALTER TABLE public.knowledge_chunk_embeddings ENABLE ROW LEVEL SECURITY',
      'REVOKE ALL ON TABLE public.knowledge_chunk_embeddings FROM PUBLIC, anon, authenticated',
    ]) expect(migration).toContain(required);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX|hnsw|ivfflat/i);
  });

  it('guards candidate discovery and service-role-only execution', () => {
    expect(migration).toContain('CREATE FUNCTION public.list_knowledge_embedding_candidates');
    expect(migration).toContain("d.processing_status = 'ready'");
    expect(migration).toContain('e.chunk_id IS NULL OR e.chunk_text_hash <> c.text_hash');
    expect(migration).toContain('LIMIT LEAST(GREATEST(COALESCE(p_limit, 16), 1), 100)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.list_knowledge_embedding_candidates');
    expect(migration).toContain('TO service_role');
  });

  it('isolates search candidates before cosine distance and returns provenance only', () => {
    const searchStart = migration.indexOf('CREATE FUNCTION public.search_board_knowledge_chunks');
    const search = migration.slice(searchStart);
    const returnStart = search.indexOf('RETURNS TABLE');
    const languageStart = search.indexOf('LANGUAGE sql');
    const returnContract = search.slice(returnStart, languageStart);
    expect(search).toContain('WITH candidates AS MATERIALIZED');
    expect(search).toContain('d.board_id = p_board_id');
    expect(search).toContain("d.processing_status = 'ready'");
    expect(search).toContain('e.model_id = p_model_id');
    expect(search).toContain('e.dimensions = extensions.vector_dims(p_query_embedding)');
    expect(search).toContain('e.chunk_text_hash = c.text_hash');
    expect(search).toContain('source_locators');
    expect(search).toContain('<=> p_query_embedding');
    expect(returnContract).not.toContain('embedding');
    expect(search).toContain('LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)');
  });

  it('keeps provider and secret identifiers inside the new worker boundary', () => {
    const apiKeyName = ['OPENAI', 'API_KEY'].join('_');
    expect(domain).not.toMatch(/node:|@supabase|openai|langchain/i);
    expect(adapter).not.toMatch(new RegExp(`${apiKeyName}|OpenAIEmbeddingProvider|langchain`, 'i'));
    expect(newSources).toContain(apiKeyName);
    expect(provider).toContain('dimensions: request.profile.dimensions');
    expect(provider).not.toMatch(/console\.(log|error).*OPENAI|console\.(log|error).*vector/i);
    expect(cli).not.toContain('process.argv[2]');
  });

  it('keeps all changes out of protected application and deployment surfaces', () => {
    const changed = execFileSync('git', ['diff', '--name-only', baselineHead, '--'], { cwd: root, encoding: 'utf8' });
    const historicalEmbeddingChanges = changed.split(/\r?\n/).filter((file) =>
      file
      && !file.startsWith('workers/knowledge-embedding/deploy/')
      && file !== 'workers/knowledge-embedding/Dockerfile'
      && file !== 'workers/knowledge-embedding/tei/Dockerfile'
      && file !== 'app/api/boards/[id]/knowledge/route.ts'
      && file !== 'lib/server/knowledge/knowledgeBoardReadAuthorization.ts'
      && !file.startsWith('scripts/benchmarks/knowledge-retrieval/')
      && file !== 'scripts/db/bootstrap-local.mjs',
    ).join('\n');
    for (const forbidden of [
      'workers/knowledge-pdf/', 'app/api/boards/', 'lib/server/knowledge/', 'components/',
      'middleware.ts', 'package.json', 'package-lock.json', 'deploy/', 'Dockerfile',
    ]) expect(historicalEmbeddingChanges).not.toContain(forbidden);
    expect(newSources).not.toMatch(/pgvector|embedding provider outside|\bAI\b|backfill|Cloud Run|gcloud/i);
  });

  it('structurally cannot mutate the PDF Ready lifecycle', () => {
    const lifecycle = /knowledge_documents|processing_status|processing_error|processing_lease_token|processing_lease_expires_at/i;
    expect(domain).not.toMatch(lifecycle);
    expect(adapter).not.toMatch(lifecycle);
    expect(documentWorker).not.toMatch(lifecycle);
    expect(worker).not.toMatch(lifecycle);
    expect(domain).toContain('KnowledgeEmbeddingRepository');
    expect(integration).toContain('P6I_RUN_LOCAL_INTEGRATION');
    expect(integration).toContain("['127.0.0.1', 'localhost']");
  });

  it('keeps provider diagnostics free of secrets, text, and vectors', () => {
    expect(newSources).not.toMatch(/console\.(log|error)[^\n]*(?:text|vector|secret|API_KEY|SERVICE_ROLE)/i);
    expect(provider).toContain('fetchImpl');
    expect(cli).not.toMatch(/console\.(log|error).*error\.message/i);
  });

  it('keeps the production query smoke surface search-only and safe', () => {
    expect(semanticSearchAdapter).toContain('search_board_knowledge_chunks');
    expect(semanticSearchAdapter).not.toMatch(/INSERT|UPDATE|DELETE|UPSERT|upsert|listCandidateDocumentIds|processing_status|knowledge_documents/i);
    expect(querySmokeCli).not.toMatch(/runEmbeddingWorker|embedDocument|OpenAIEmbeddingProvider|knowledgeEmbeddingAdapters|upsertEmbeddings|listCandidateDocumentIds|processing_status|knowledge_documents/i);
    expect(querySmokeDockerfile).toContain('knowledgeQuerySmoke.mjs');
    expect(querySmokeDockerfile).toContain('CMD ["node", "/app/dist/knowledgeEmbeddingWorker.mjs"]');
    expect(querySmokeCli).not.toMatch(/console\.(log|error)[^\n]*(query|text|vector|documentId|chunkId|filename|error\.message)/i);
    expect(querySmoke).toContain('expectedDocumentFound');
    expect(querySmoke).toContain('forbiddenDocumentPresent');
  });
});
