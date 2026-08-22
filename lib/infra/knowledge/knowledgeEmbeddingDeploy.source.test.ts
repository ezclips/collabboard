import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const dockerfile = read('workers/knowledge-embedding/tei/Dockerfile');
const predeploy = read('workers/knowledge-embedding/deploy/predeploy.mjs');
const deploy = read('workers/knowledge-embedding/deploy/deploy.ps1');
const environment = read('workers/knowledge-embedding/deploy/production.env.example');
const readme = read('workers/knowledge-embedding/deploy/README.md');
const worker = read('workers/knowledge-embedding/runEmbeddingWorker.ts');
const baselineHead = '21db28b4f49156954cab93f599c3e5427a22ceb3';
const cutoff = '2026-08-21T22:06:19Z';
const teiDigest = 'sha256:' + 'b'.repeat(64);

const safePredeployEnv: Record<string, string> = {
  GCP_PROJECT_ID: 'callabboard', GCP_REGION: 'europe-west6',
  IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`, TEI_IMAGE_DIGEST: teiDigest,
  WORKER_POOL_NAME: 'collabboard-knowledge-embedding-worker',
  SERVICE_ACCOUNT_EMAIL: 'collabboard-embed-worker@callabboard.iam.gserviceaccount.com',
  SUPABASE_URL_SECRET_NAME: 'test-url', SUPABASE_URL_SECRET_VERSION: '1',
  SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME: 'test-service-role', SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION: '2',
  KNOWLEDGE_EMBEDDING_PROVIDER: 'local-tei',
  KNOWLEDGE_EMBEDDING_TEI_URL: 'http://127.0.0.1:8080',
  KNOWLEDGE_EMBEDDING_MODEL: 'voyageai/voyage-4-nano',
  KNOWLEDGE_EMBEDDING_MODEL_ID: 'local:voyage-4-nano',
  KNOWLEDGE_EMBEDDING_DIMENSIONS: '1024', GCP_WORKER_INSTANCES: '0',
  KNOWLEDGE_EMBEDDING_CREATED_AFTER: cutoff,
};

function runPredeploy(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...safePredeployEnv, ...overrides } as NodeJS.ProcessEnv;
  if (!Object.prototype.hasOwnProperty.call(overrides, 'OPENAI_API_KEY_SECRET_NAME')) delete env.OPENAI_API_KEY_SECRET_NAME;
  if (!Object.prototype.hasOwnProperty.call(overrides, 'OPENAI_API_KEY_SECRET_VERSION')) delete env.OPENAI_API_KEY_SECRET_VERSION;
  return spawnSync(process.execPath, [path.join(root, 'workers/knowledge-embedding/deploy/predeploy.mjs')], {
    cwd: root, encoding: 'utf8', env,
  });
}

describe('P6I-D3 local Voyage Worker Pool preparation', () => {
  it('pins the TEI base image, model revision, local model path, and bounded runtime', () => {
    expect(dockerfile).toContain('ghcr.io/huggingface/text-embeddings-inference@sha256:ad950d30878eceb72aaf32024d26fa2b1d04a75304fa0b4776b49aa1941fea07');
    expect(dockerfile).toContain('67fabc9bef010dabc5f6024aa1b1b6b93410426f');
    expect(dockerfile).toContain("repo_id='voyageai/voyage-4-nano'");
    expect(dockerfile).toContain("--model-id\", \"/model");
    expect(dockerfile).toContain('--port", "8080');
    for (const argument of ['--max-batch-tokens", "4096', '--max-concurrent-requests", "8', '--max-client-batch-size", "8', '--tokenization-workers", "2']) {
      expect(dockerfile).toContain(argument);
    }
    expect(dockerfile).toContain('HF_HUB_OFFLINE=1');
    expect(dockerfile).not.toContain('HF_TOKEN');
    expect(dockerfile).not.toContain('OPENAI');
  });

  it('validates the exact local profile, immutable deployment images, cutoff, and secret isolation', () => {
    const result = runPredeploy();
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.provider).toBe('local-tei');
    expect(parsed.model).toBe('voyageai/voyage-4-nano');
    expect(parsed.modelId).toBe('local:voyage-4-nano');
    expect(parsed.dimensions).toBe('1024');
    expect(parsed.teiUrl).toBe('http://127.0.0.1:8080');
    expect(parsed.instances).toBe('0');
    expect(parsed.createdAfter).toBe(cutoff);
    expect(parsed.nodeDigest).toBe(safePredeployEnv.IMAGE_DIGEST);
    expect(parsed.teiDigest).toBe(teiDigest);
    expect(predeploy).toContain('TEI_IMAGE_DIGEST');
    expect(predeploy).toContain('must be sha256:<64 lowercase hex characters>');
    expect(predeploy).toContain('OpenAI secrets must be absent');
    expect(environment).not.toMatch(/^OPENAI_API_KEY/m);
    expect(environment).toContain('SUPABASE_URL_SECRET_VERSION=1');
    expect(environment).toContain('SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION=3');
    expect(deploy).not.toMatch(/OPENAI_API_KEY/);
  });

  it('rejects floating image references and unsafe deployment overrides', () => {
    expect(runPredeploy({ IMAGE_DIGEST: 'latest' }).status).not.toBe(0);
    expect(runPredeploy({ TEI_IMAGE_DIGEST: 'ghcr.io/example/tei:latest' }).status).not.toBe(0);
    expect(runPredeploy({ GCP_WORKER_INSTANCES: '1' }).status).not.toBe(0);
    expect(runPredeploy({ GCP_TEI_MEMORY: '3Gi' }).status).not.toBe(0);
    expect(runPredeploy({ KNOWLEDGE_EMBEDDING_TEI_URL: 'http://tei:8080' }).status).not.toBe(0);
    expect(runPredeploy({ OPENAI_API_KEY_SECRET_NAME: 'legacy-openai' }).status).not.toBe(0);
  });

  it('represents the supported two-container Worker Pool topology and readiness dependency', () => {
    expect(deploy).toContain('kind: WorkerPool');
    expect(deploy).toContain('name: knowledge-worker');
    expect(deploy).toContain('name: voyage-tei');
    expect(deploy).toContain('run.googleapis.com/container-dependencies');
    expect(deploy).toContain('knowledge-worker":["voyage-tei"]');
    expect(deploy).toContain('startupProbe:');
    expect(deploy).not.toContain('containerPort:');
    expect(deploy).not.toContain('ports:');
    expect(deploy).toContain('httpGet:');
    expect(deploy).toContain('path: /health');
    expect(deploy).toContain('port: 8080');
    expect(deploy).toContain('periodSeconds: 5');
    expect(deploy).toContain('failureThreshold: 36');
    expect(deploy).toContain('manualInstanceCount: "0"');
    expect(deploy).not.toMatch(/manualInstanceCount:\s*["']?1/);
    expect(deploy).toContain('gcloud run worker-pools replace');
  });

  it('pins per-container resources and the loopback local provider configuration', () => {
    expect(deploy).toContain('cpu: "$nodeCpu"');
    expect(deploy).toContain('memory: "$nodeMemory"');
    expect(deploy).toContain('cpu: "$teiCpu"');
    expect(deploy).toContain('memory: "$teiMemory"');
    expect(environment).toContain('GCP_WORKER_CPU=1');
    expect(environment).toContain('GCP_WORKER_MEMORY=1Gi');
    expect(environment).toContain('GCP_TEI_CPU=2');
    expect(environment).toContain('GCP_TEI_MEMORY=4Gi');
    expect(predeploy).toContain("const DEFAULT_TEI_MEMORY = '4Gi'");
    expect(deploy).toContain("$teiMemory = '4Gi'");
    expect(readme).toContain('2 CPU, 4Gi');
    for (const value of [
      'KNOWLEDGE_EMBEDDING_PROVIDER=local-tei',
      'KNOWLEDGE_EMBEDDING_TEI_URL=http://127.0.0.1:8080',
      'KNOWLEDGE_EMBEDDING_MODEL=voyageai/voyage-4-nano',
      'KNOWLEDGE_EMBEDDING_MODEL_ID=local:voyage-4-nano',
      'KNOWLEDGE_EMBEDDING_DIMENSIONS=1024',
    ]) expect(environment).toContain(value);
    expect(worker).toContain("const LOCAL_EMBEDDING_MODEL = 'voyageai/voyage-4-nano'");
    expect(worker).toContain("const LOCAL_EMBEDDING_MODEL_ID = 'local:voyage-4-nano'");
  });

  it('documents no deployment side effects, exact cutoff, and safe scale-zero operation', () => {
    expect(readme).toContain('does not deploy');
    expect(readme).toContain('instances=0');
    expect(readme).toContain(cutoff);
    expect(readme).toContain('no Google Cloud operation');
    expect(readme).toMatch(/no OpenAI secret/i);
    expect(readme).not.toMatch(/EMG_checklist\.pdf/i);
    expect(readme).not.toMatch(/Good\.pdf/i);
    expect(readme).toContain('gcloud run worker-pools update collabboard-knowledge-embedding-worker --instances=0');
  });

  it('keeps migrations, protected worker code, and unrelated files unchanged', () => {
    for (const migration of ['20260824_add_knowledge_chunk_provenance.sql', '20260825_add_knowledge_chunk_embeddings.sql']) {
      const current = read(`supabase/migrations/${migration}`);
      const previous = execFileSync('git', ['show', `${baselineHead}:supabase/migrations/${migration}`], { cwd: root, encoding: 'utf8' });
      expect(current.replace(/\r\n/g, '\n')).toBe(previous.replace(/\r\n/g, '\n'));
    }
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    for (const line of status.split(/\r?\n/).filter(Boolean)) {
      const file = line.slice(3).replace(/^"|"$/g, '');
      expect([
        'workers/knowledge-embedding/',
        'lib/infra/knowledge/knowledgeEmbeddingDeploy.source.test.ts',
        'lib/infra/knowledge/knowledgeEmbeddingScope.source.test.ts',
      ].some((allowed) => file === allowed || file.startsWith(allowed))).toBe(true);
    }
    expect(status).not.toMatch(/workers[\\/]knowledge-pdf|components|package(-lock)?\.json|middleware|auth/i);
    expect(worker).toContain("event: 'knowledge-embedding-worker-poll-failed'");
    expect(worker).not.toContain('error.message');
    expect(worker).not.toContain('console.error');
  });
});
