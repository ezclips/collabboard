import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const dockerfile = read('workers/knowledge-embedding/Dockerfile');
const predeploy = read('workers/knowledge-embedding/deploy/predeploy.mjs');
const deploy = read('workers/knowledge-embedding/deploy/deploy.ps1');
const environment = read('workers/knowledge-embedding/deploy/production.env.example');
const readme = read('workers/knowledge-embedding/deploy/README.md');
const worker = read('workers/knowledge-embedding/runEmbeddingWorker.ts');
const baselineHead = '21db28b4f49156954cab93f599c3e5427a22ceb3';

describe('P6I-B deployment preparation scope', () => {
  it('packages a non-HTTP, non-PDF Node worker as an immutable runtime', () => {
    expect(dockerfile).toContain('FROM node:22.14.0-bookworm-slim AS build');
    expect(dockerfile).toContain('FROM node:22.14.0-bookworm-slim AS runtime');
    expect(dockerfile).toContain('COPY package.json package-lock.json ./');
    expect(dockerfile).toContain('npm ci');
    expect(dockerfile).toContain('workers/knowledge-embedding/cli.ts');
    expect(dockerfile).toContain('--bundle');
    expect(dockerfile).toContain('--target=node22');
    expect(dockerfile).toContain('USER collabboard');
    expect(dockerfile).toContain('CMD ["node", "/app/dist/knowledgeEmbeddingWorker.mjs"]');
    expect(dockerfile).not.toMatch(/EXPOSE|openjdk|java|opendataloader|pdfjs|http server/i);
  });

  it('targets only the embedding pool with a digest and explicit resources', () => {
    expect(deploy).toContain('collabboard-knowledge-embedding-worker');
    expect(deploy).toContain('knowledge-embedding-worker@');
    expect(deploy).toContain('--instances');
    expect(deploy).toContain("'1'");
    expect(deploy).toContain('--cpu');
    expect(deploy).toContain('--memory');
    expect(deploy).toContain('--service-account');
    expect(deploy).toContain('--image');
    expect(deploy).toContain('$imageDigest');
    expect(deploy).not.toContain('latest');
    expect(deploy).not.toContain('knowledge-pdf-worker');
    expect(deploy).toContain('gcloud');
  });

  it('requires independent pinned secret references and fail-closed cutoff', () => {
    for (const name of [
      'SUPABASE_URL_SECRET_NAME', 'SUPABASE_URL_SECRET_VERSION',
      'SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME', 'SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION',
      'OPENAI_API_KEY_SECRET_NAME', 'OPENAI_API_KEY_SECRET_VERSION',
      'SERVICE_ACCOUNT_EMAIL', 'KNOWLEDGE_EMBEDDING_CREATED_AFTER',
    ]) {
      expect(predeploy).toContain(name);
    }
    expect(deploy).toContain('$urlVersion');
    expect(deploy).toContain('$serviceRoleVersion');
    expect(deploy).toContain('$openAiVersion');
    expect(predeploy).toContain('must be a valid ISO-8601 date-time');
    expect(predeploy).not.toMatch(/CREATED_AFTER[^\n]*(?:default|null|optional)/i);
    expect(environment).toContain('KNOWLEDGE_EMBEDDING_CREATED_AFTER=');
    expect(environment).not.toMatch(/^SUPABASE_URL\s*=/m);
    expect(environment).not.toMatch(/^OPENAI_API_KEY\s*=/m);
  });

  it('pins the approved profile, bounded configuration, and safe predeploy behavior', () => {
    expect(predeploy).toContain('text-embedding-3-small');
    expect(predeploy).toContain('openai:text-embedding-3-small');
    expect(predeploy).toContain("DEFAULT_DIMENSIONS = '1536'");
    expect(predeploy).toContain('120_000');
    expect(predeploy).toContain('2048');
    expect(predeploy).toContain('100');
    expect(predeploy).not.toMatch(/spawn|fetch\(|gcloud/i);
    expect(deploy).toContain('KNOWLEDGE_EMBEDDING_MODEL=');
    expect(deploy).toContain('KNOWLEDGE_EMBEDDING_MODEL_ID=');
    expect(deploy).toContain('KNOWLEDGE_EMBEDDING_DIMENSIONS=');
    expect(deploy).toContain('KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS=');
    expect(deploy).toContain('KNOWLEDGE_EMBEDDING_CREATED_AFTER=');
  });

  it('documents cutoff safety, controlled smoke, and rollback without data reversal', () => {
    expect(readme).toContain('P6I-B prepares');
    expect(readme).toContain('deploys nothing');
    expect(readme).toContain('KNOWLEDGE_EMBEDDING_CREATED_AFTER');
    expect(readme).toMatch(/Backfill requires separate\s+authorization/);
    expect(readme).toContain('new,');
    expect(readme).toContain('non-sensitive disposable PDF');
    expect(readme).not.toMatch(/EMG_checklist/i);
    expect(readme).toMatch(/scale the worker pool to zero/i);
    expect(readme).toContain('Do not drop P6I tables');
    expect(readme).not.toMatch(/supabase\.co|OPENAI_API_KEY\s*=/i);
  });

  it('proves protected files and migrations remain unchanged', () => {
    for (const migration of ['20260824_add_knowledge_chunk_provenance.sql', '20260825_add_knowledge_chunk_embeddings.sql']) {
      const current = read(`supabase/migrations/${migration}`);
      const previous = execFileSync('git', ['show', `${baselineHead}:supabase/migrations/${migration}`], { cwd: root, encoding: 'utf8' });
      expect(current.replace(/\r\n/g, '\n')).toBe(previous.replace(/\r\n/g, '\n'));
    }
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    for (const line of status.split(/\r?\n/).filter(Boolean)) {
      const file = line.slice(3).replace(/^"|"$/g, '');
      expect([
        'scripts/db/bootstrap-local.mjs',
        'workers/knowledge-embedding/',
        'lib/domain/knowledge/knowledgeEmbedding.test.ts',
        'lib/infra/knowledge/knowledgeEmbeddingDeploy.source.test.ts',
      ].some((allowed) => file === allowed || file.startsWith(allowed))).toBe(true);
    }
    expect(status).not.toMatch(/workers[\\/]knowledge-pdf|components|package(-lock)?\.json|middleware|auth/i);
    expect(worker).toContain("event: 'knowledge-embedding-worker-poll-failed'");
    expect(worker).not.toContain('error.message');
    expect(worker).not.toContain('console.error');
  });
});
