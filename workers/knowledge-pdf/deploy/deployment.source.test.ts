import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const deployDirectory = path.join(process.cwd(), 'workers/knowledge-pdf/deploy');
const deployScript = fs.readFileSync(path.join(deployDirectory, 'deploy.ps1'), 'utf8');
const predeployScript = fs.readFileSync(path.join(deployDirectory, 'predeploy.mjs'), 'utf8');
const environmentExample = fs.readFileSync(path.join(deployDirectory, 'production.env.example'), 'utf8');
const readme = fs.readFileSync(path.join(deployDirectory, 'README.md'), 'utf8');

describe('Cloud Run Knowledge worker deployment preparation', () => {
  it('uses one immutable-digest Worker Pool deployment path', () => {
    expect(deployScript).toContain('beta');
    expect(deployScript).toContain('run');
    expect(deployScript).toContain('worker-pools');
    expect(deployScript).toContain('deploy');
    expect(deployScript).toContain('--image');
    expect(deployScript).toContain('knowledge-pdf-worker@');
    expect(deployScript).toContain('$imageDigest');
    expect(deployScript).toContain('--instances');
    expect(deployScript).toContain("'1'");
    expect(deployScript).toContain('--cpu');
    expect(deployScript).toContain('--memory');
    expect(deployScript).toContain('--service-account');
    expect(deployScript).toContain('--update-secrets');
    expect(deployScript).not.toContain('docker push');
    expect(deployScript).not.toContain('gcloud artifacts repositories create');
    expect(deployScript).not.toContain('gcloud secrets create');
    expect(deployScript).not.toContain('--port');
  });

  it('keeps secrets outside the repository and preflight side-effect free', () => {
    expect(environmentExample).not.toMatch(/^SUPABASE_URL\s*=/m);
    expect(environmentExample).not.toMatch(/^SUPABASE_SERVICE_ROLE_KEY\s*=/m);
    expect(environmentExample).toContain('SUPABASE_URL_SECRET_NAME=');
    expect(environmentExample).toContain('SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME=');
    expect(predeployScript).not.toContain('spawn');
    expect(predeployScript).not.toContain('fetch(');
    expect(predeployScript).not.toContain('gcloud');
    expect(predeployScript).toContain('IMAGE_DIGEST');
    expect(predeployScript).toContain('SUPABASE_SECRET_VERSION');
  });

  it('documents production preflight, smoke, rollback, and non-HTTP operation', () => {
    expect(readme).toContain('20260820_knowledge_pdf_v1_verify.sql');
    expect(readme).toContain('PUBLIC=false');
    expect(readme).toContain('service_role=true');
    expect(readme).toContain('uploaded -> processing -> ready');
    expect(readme).toContain('page_count');
    expect(readme).toContain('raw_artifact_path');
    expect(readme).toContain('--instances=0');
    expect(readme).toContain('no HTTP server');
    expect(readme).toContain('SIGTERM');
  });
});
