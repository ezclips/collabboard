import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const deployDir = path.join(root, 'workers/knowledge-query/deploy');
const read = (name: string) => fs.readFileSync(path.join(deployDir, name), 'utf8');
const predeploySource = read('predeploy.mjs');
const deployScript = read('deploy.ps1');
const environmentExample = read('production.env.example');
const readme = read('README.md');

const safeEnv: Record<string, string> = {
  GCP_PROJECT_ID: 'callabboard', GCP_REGION: 'europe-west6', SERVICE_NAME: 'collabboard-knowledge-query',
  SERVICE_ACCOUNT_EMAIL: 'collabboard-query-service@callabboard.iam.gserviceaccount.com',
  QUERY_IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`, TEI_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
  QUERY_CPU: '1', QUERY_MEMORY: '512Mi', TEI_CPU: '2', TEI_MEMORY: '6Gi', QUERY_PORT: '8081',
  KNOWLEDGE_EMBEDDING_TEI_URL: 'http://127.0.0.1:8080',
  CONTAINER_CONCURRENCY: '8', AUTOSCALING_MIN_SCALE: '0', AUTOSCALING_MAX_SCALE: '1',
  REQUEST_TIMEOUT_SECONDS: '180', INGRESS: 'all',
  SUPABASE_URL_SECRET_NAME: 'collabboard-supabase-url', SUPABASE_URL_SECRET_VERSION: '2',
  SUPABASE_ANON_KEY_SECRET_NAME: 'collabboard-supabase-anon-key', SUPABASE_ANON_KEY_SECRET_VERSION: '1',
  SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME: 'collabboard-supabase-service-role-key', SUPABASE_SERVICE_ROLE_KEY_SECRET_VERSION: '3',
};

function runPredeploy(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...safeEnv, ...overrides } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete env[key]; }
  return spawnSync(process.execPath, [path.join(deployDir, 'predeploy.mjs')], { env, encoding: 'utf8' });
}

describe('P6I-H1 predeploy validator -- behavioral', () => {
  it('H1-T1: missing required env fails', () => {
    expect(runPredeploy({ GCP_PROJECT_ID: undefined }).status).not.toBe(0);
  });
  it('H1-T2: bad query digest fails', () => {
    expect(runPredeploy({ QUERY_IMAGE_DIGEST: 'sha256:not-hex' }).status).not.toBe(0);
  });
  it('H1-T3: bad TEI digest fails', () => {
    expect(runPredeploy({ TEI_IMAGE_DIGEST: 'knowledge-embedding-tei:latest' }).status).not.toBe(0);
  });
  it('H1-T4: wrong project fails', () => {
    expect(runPredeploy({ GCP_PROJECT_ID: 'wrong-project' }).status).not.toBe(0);
  });
  it('H1-T5: wrong region fails', () => {
    expect(runPredeploy({ GCP_REGION: 'us-central1' }).status).not.toBe(0);
  });
  it('H1-T6: wrong service name fails', () => {
    expect(runPredeploy({ SERVICE_NAME: 'collabboard-knowledge-embedding-worker' }).status).not.toBe(0);
  });
  it('H1-T7: wrong service account fails', () => {
    expect(runPredeploy({ SERVICE_ACCOUNT_EMAIL: 'someone-else@callabboard.iam.gserviceaccount.com' }).status).not.toBe(0);
  });
  it('H1-T8: wrong query resources fail', () => {
    expect(runPredeploy({ QUERY_CPU: '2' }).status).not.toBe(0);
    expect(runPredeploy({ QUERY_MEMORY: '1Gi' }).status).not.toBe(0);
  });
  it('H1-T9: wrong TEI resources fail', () => {
    expect(runPredeploy({ TEI_CPU: '1' }).status).not.toBe(0);
    expect(runPredeploy({ TEI_MEMORY: '4Gi' }).status).not.toBe(0);
  });
  it('H1-T10: wrong TEI URL fails', () => {
    expect(runPredeploy({ KNOWLEDGE_EMBEDDING_TEI_URL: 'http://127.0.0.1:9090' }).status).not.toBe(0);
  });
  it('H1-T11: non-loopback TEI URL fails', () => {
    expect(runPredeploy({ KNOWLEDGE_EMBEDDING_TEI_URL: 'https://tei.internal:8080' }).status).not.toBe(0);
  });
  it('H1-T12: wrong secret name fails', () => {
    expect(runPredeploy({ SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME: 'wrong-name' }).status).not.toBe(0);
  });
  it('H1-T13: latest/non-integer secret version fails', () => {
    expect(runPredeploy({ SUPABASE_URL_SECRET_VERSION: 'latest' }).status).not.toBe(0);
    expect(runPredeploy({ SUPABASE_ANON_KEY_SECRET_VERSION: '0' }).status).not.toBe(0);
  });
  it('H1-T14: wrong concurrency fails', () => {
    expect(runPredeploy({ CONTAINER_CONCURRENCY: '80' }).status).not.toBe(0);
  });
  it('H1-T15: wrong min/max scaling fails', () => {
    expect(runPredeploy({ AUTOSCALING_MAX_SCALE: '2' }).status).not.toBe(0);
    expect(runPredeploy({ AUTOSCALING_MIN_SCALE: '1' }).status).not.toBe(0);
  });
  it('H1-T16: wrong timeout fails', () => {
    expect(runPredeploy({ REQUEST_TIMEOUT_SECONDS: '300' }).status).not.toBe(0);
  });
  it('H1-T17: live-equivalent configuration passes and emits a safe summary', () => {
    const result = runPredeploy();
    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.status).toBe('predeploy-ok');
    expect(result.stdout).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(result.stdout).not.toContain('76510182918');
  });
});

describe('P6I-H1 static source guards', () => {
  it('H1-T18: predeploy.mjs is import-free and performs no fs/network/process I/O', () => {
    expect(predeploySource).not.toMatch(/^\s*import /m);
    expect(predeploySource).not.toContain('require(');
    expect(predeploySource).not.toContain('fetch(');
    expect(predeploySource).not.toContain('spawn');
    expect(predeploySource).not.toContain('child_process');
    expect(predeploySource).not.toMatch(/\bfs\./);
    expect(predeploySource).not.toContain('gcloud');
  });

  it('H1-T19/H1-M13: no secret payload access, no literal secret env value', () => {
    expect(deployScript).not.toContain('gcloud secrets versions access');
    expect(deployScript).not.toContain('--data-file');
    expect(deployScript).toMatch(/SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,40}valueFrom/);
    expect(deployScript).toMatch(/SUPABASE_ANON_KEY[\s\S]{0,40}valueFrom/);
    expect(deployScript).toMatch(/SUPABASE_URL[\s\S]{0,40}valueFrom/);
  });

  it('H1-T20/H1-M9: no IAM mutation, no allow-unauthenticated flags', () => {
    for (const forbidden of ['add-iam-policy-binding', 'set-iam-policy', '--allow-unauthenticated', '--no-allow-unauthenticated']) {
      expect(deployScript).not.toContain(forbidden);
    }
  });

  it('H1-T21: no image build/push/registry mutation', () => {
    for (const forbidden of ['docker build', 'docker push', 'gcloud builds', 'artifacts repositories create']) {
      expect(deployScript).not.toContain(forbidden);
    }
  });

  it('H1-T22/H1-M10: pre-state capture precedes replace and feeds the generated traffic/tag spec', () => {
    const describeIndex = deployScript.indexOf('gcloud run services describe');
    const replaceIndex = deployScript.indexOf('gcloud run services replace');
    expect(describeIndex).toBeGreaterThan(-1);
    expect(replaceIndex).toBeGreaterThan(describeIndex);
    const parseIndex = deployScript.indexOf('ConvertFrom-Json');
    expect(parseIndex).toBeGreaterThan(describeIndex);
    expect(parseIndex).toBeLessThan(replaceIndex);
    expect(deployScript.indexOf('$tagBlock')).toBeGreaterThan(parseIndex);
  });

  it('H1-T23/H1-M11: temporary spec cleanup happens in a finally block, rollback files are not removed', () => {
    expect(deployScript).toMatch(/finally\s*{\s*[\s\S]*Remove-Item -LiteralPath \$specPath/);
    expect(deployScript).not.toMatch(/Remove-Item[\s\S]{0,60}preStateYamlPath/);
    expect(deployScript).not.toMatch(/Remove-Item[\s\S]{0,60}preStateJsonPath/);
  });

  it('H1-T24/H1-M12: postdeploy verification is read-only and credential-free', () => {
    expect(deployScript).toContain('Invoke-WebRequest');
    expect(deployScript).not.toMatch(/-Headers/);
    expect(deployScript).not.toMatch(/Authorization\s*[:=]|\$accessToken|\$bearerToken/i);
    expect(deployScript).not.toMatch(/knowledge\/search/);
  });

  it('H1-T25/H1-M17: query-service has no committed startupProbe; voyage-tei has the exact probe', () => {
    const queryContainerBlock = deployScript.slice(deployScript.indexOf("name: query-service"), deployScript.indexOf('name: voyage-tei'));
    expect(queryContainerBlock).not.toContain('startupProbe');
    const teiBlock = deployScript.slice(deployScript.indexOf('name: voyage-tei'));
    expect(teiBlock).toContain('path: /health');
    expect(teiBlock).toContain('port: 8080');
    expect(teiBlock).toContain('periodSeconds: 5');
    expect(teiBlock).toContain('timeoutSeconds: 3');
    expect(teiBlock).toContain('failureThreshold: 36');
  });

  it('H1-T26/H1-M16: startup CPU boost is committed true', () => {
    expect(deployScript).toContain("run.googleapis.com/startup-cpu-boost: 'true'");
  });

  it('H1-T27: template maxScale is variable and no service-level maxScale is committed', () => {
    expect(deployScript).toContain('autoscaling.knative.dev/maxScale');
    expect(deployScript).not.toContain('run.googleapis.com/maxScale');
  });

  it('H1-T28/H1-M18: managed-field exclusion sweep', () => {
    for (const forbidden of [
      'ingress-status', 'run.googleapis.com/urls', 'cloud.googleapis.com/location',
      'satisfiesPzs', 'client-name', 'client-version', 'client.knative.dev/nonce', 'startupProbeType',
    ]) {
      expect(deployScript).not.toContain(forbidden);
    }
    for (const file of [deployScript, predeploySource, environmentExample, readme]) {
      expect(file).not.toContain('76510182918');
    }
  });

  it('H1-T29/H1-M14: traffic uses latestRevision and never hardcodes the current revision', () => {
    expect(deployScript).toContain('latestRevision: true');
    expect(deployScript).not.toContain('00008-zg8');
  });

  it('H1-T30/H1-M15: tag entries are sourced from pre-state, "c3c" is never hardcoded', () => {
    expect(deployScript).toContain('$entry.tag');
    expect(deployScript).toContain('$entry.revisionName');
    expect(deployScript).not.toContain('c3c');
  });

  it('H1-T31/H1-M19: no spec.template.metadata.name is committed', () => {
    const templateBlock = deployScript.slice(deployScript.indexOf('template:'), deployScript.indexOf('spec:', deployScript.indexOf('template:')));
    expect(templateBlock).not.toContain('name:');
  });

  it('H1-T32: no run.googleapis.com/secrets annotation is committed', () => {
    expect(deployScript).not.toContain('run.googleapis.com/secrets');
  });

  it('H1-M1/H1-M2: query port is pinned to 8081, not 8080', () => {
    expect(environmentExample).toContain('QUERY_PORT=8081');
    expect(predeploySource).toContain("QUERY_PORT = '8081'");
  });

  it('H1-M3/H1-M4: secret version and image digest patterns reject drift-prone defaults', () => {
    expect(predeploySource).toMatch(/\/\^\\d\+\$\//);
    expect(predeploySource).toContain('sha256:[0-9a-f]{64}');
  });

  it('H1-M5: repository paths are pinned exactly', () => {
    expect(predeploySource).toContain('europe-west6-docker.pkg.dev/callabboard/collabboard-workers/knowledge-query');
    expect(predeploySource).toContain('europe-west6-docker.pkg.dev/callabboard/collabboard-workers/knowledge-embedding-tei');
  });

  it('H1-M6/H1-M7/H1-M8: dependency, TEI probe, and scaling ceiling are pinned in the generated spec', () => {
    expect(deployScript).toContain('"query-service":["voyage-tei"]');
    expect(deployScript).toContain('failureThreshold: 36');
    expect(deployScript).toContain("'$maxScale'");
  });

  it('production.env.example carries no runtime secret payload assignment', () => {
    expect(environmentExample).not.toMatch(/^SUPABASE_URL=/m);
    expect(environmentExample).not.toMatch(/^SUPABASE_ANON_KEY=/m);
    expect(environmentExample).not.toMatch(/^SUPABASE_SERVICE_ROLE_KEY=/m);
    expect(environmentExample).toContain('SUPABASE_URL_SECRET_NAME=');
  });

  it('README documents the traffic semantic delta and the accepted notes', () => {
    for (const marker of [
      'H1_TRAFFIC_SEMANTIC_DELTA', 'H1_SERVICE_MAXSCALE_6_UNEXPLAINED',
      'H1_TAG_FREEZE_NOTE', 'H1_SINGLE_ENVIRONMENT_PACKAGE_DEBT', 'H1_EMBEDDING_PACKAGE_DIVERGENCE_DEBT',
    ]) {
      expect(readme).toContain(marker);
    }
  });
});
