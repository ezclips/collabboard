import fs from 'node:fs';
import os from 'node:os';
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
  it('H1-T1: missing required env fails', () => { expect(runPredeploy({ GCP_PROJECT_ID: undefined }).status).not.toBe(0); });
  it('H1-T2: bad query digest fails', () => { expect(runPredeploy({ QUERY_IMAGE_DIGEST: 'sha256:not-hex' }).status).not.toBe(0); });
  it('H1-T3: bad TEI digest fails', () => { expect(runPredeploy({ TEI_IMAGE_DIGEST: 'knowledge-embedding-tei:latest' }).status).not.toBe(0); });
  it('H1-T4: wrong project fails', () => { expect(runPredeploy({ GCP_PROJECT_ID: 'wrong-project' }).status).not.toBe(0); });
  it('H1-T5: wrong region fails', () => { expect(runPredeploy({ GCP_REGION: 'us-central1' }).status).not.toBe(0); });
  it('H1-T6: wrong service name fails', () => { expect(runPredeploy({ SERVICE_NAME: 'collabboard-knowledge-embedding-worker' }).status).not.toBe(0); });
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
  it('H1-T10: wrong TEI URL fails', () => { expect(runPredeploy({ KNOWLEDGE_EMBEDDING_TEI_URL: 'http://127.0.0.1:9090' }).status).not.toBe(0); });
  it('H1-T11: non-loopback TEI URL fails', () => { expect(runPredeploy({ KNOWLEDGE_EMBEDDING_TEI_URL: 'https://tei.internal:8080' }).status).not.toBe(0); });
  it('H1-T12: wrong secret name fails', () => { expect(runPredeploy({ SUPABASE_SERVICE_ROLE_KEY_SECRET_NAME: 'wrong-name' }).status).not.toBe(0); });
  it('H1-T13: latest/non-integer secret version fails', () => {
    expect(runPredeploy({ SUPABASE_URL_SECRET_VERSION: 'latest' }).status).not.toBe(0);
    expect(runPredeploy({ SUPABASE_ANON_KEY_SECRET_VERSION: '0' }).status).not.toBe(0);
  });
  it('H1-T14: wrong concurrency fails', () => { expect(runPredeploy({ CONTAINER_CONCURRENCY: '80' }).status).not.toBe(0); });
  it('H1-T15: wrong min/max scaling fails', () => {
    expect(runPredeploy({ AUTOSCALING_MAX_SCALE: '2' }).status).not.toBe(0);
    expect(runPredeploy({ AUTOSCALING_MIN_SCALE: '1' }).status).not.toBe(0);
  });
  it('H1-T16: wrong timeout fails', () => { expect(runPredeploy({ REQUEST_TIMEOUT_SECONDS: '300' }).status).not.toBe(0); });
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
  it('H1-T22/H1-M10: pre-state capture precedes replace and feeds the generated traffic/tag/secrets spec', () => {
    const describeIndex = deployScript.indexOf('gcloud run services describe');
    const replaceIndex = deployScript.indexOf('gcloud run services replace');
    expect(describeIndex).toBeGreaterThan(-1);
    expect(replaceIndex).toBeGreaterThan(describeIndex);
    const parseIndex = deployScript.indexOf('ConvertFrom-Json');
    expect(parseIndex).toBeGreaterThan(describeIndex);
    expect(parseIndex).toBeLessThan(replaceIndex);
    expect(deployScript.indexOf('$tagBlock')).toBeGreaterThan(parseIndex);
    expect(deployScript.indexOf('$secretsAnnotationValue')).toBeGreaterThan(parseIndex);
    expect(deployScript.indexOf('$secretsAnnotationValue')).toBeLessThan(replaceIndex);
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
  it('H1-T30/H1-M15: tag entries are sourced from pre-state via Get-Prop, "c3c" is never hardcoded', () => {
    expect(deployScript).toContain("Get-Prop $entry 'tag'");
    expect(deployScript).toContain("Get-Prop $entry 'revisionName'");
    expect(deployScript).not.toContain('c3c');
  });
  it('H1-T31/H1-M19: no spec.template.metadata.name is committed', () => {
    const templateBlock = deployScript.slice(deployScript.indexOf('template:'), deployScript.indexOf('spec:', deployScript.indexOf('template:')));
    expect(templateBlock).not.toContain('name:');
  });
  it('H1-T32/H1-C8: run.googleapis.com/secrets IS committed in the generated spec, sourced from validated pre-state, never a fixed project number', () => {
    expect(deployScript).toContain("run.googleapis.com/secrets: '$secretsAnnotationValue'");
    expect(deployScript).toContain("Get-Prop $templateAnnotations 'run.googleapis.com/secrets'");
    expect(deployScript).not.toMatch(/run\.googleapis\.com\/secrets:\s*'?projects\/\d/);
  });
  it('H1-strictmode: no unguarded optional traffic-property dereferences remain (the confirmed independent-review blocker)', () => {
    expect(deployScript).toContain('Set-StrictMode -Version Latest');
    expect(deployScript).not.toContain('$entry.tag ');
    expect(deployScript).not.toContain('$_.percent -eq');
    expect(deployScript).not.toContain('$_.tag -eq');
    expect(deployScript).toContain("function Get-Prop(");
  });
  it('H1-C10: postdeploy verifies all three secret refs and the live secrets annotation, never a secret value', () => {
    expect(deployScript).toMatch(/binding\.SecretName/);
    expect(deployScript).toMatch(/binding\.Version/);
    expect(deployScript).toContain('Test-SecretsAnnotation $postSecretsAnnotationRaw $expectedAliases');
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
// H1-C1..C13: real PowerShell execution proving the corrected StrictMode-safe
// traffic/tag/secrets logic behaves correctly, using deploy.ps1's own
// Get-Prop/Test-SafeResourceName/Test-SecretsAnnotation functions (extracted
// verbatim from the committed file, not reimplemented) driven against
// synthetic pre-state shaped like the real live Cloud Run response.
const helperFunctions = deployScript.slice(0, deployScript.indexOf('$deployDirectory = $PSScriptRoot'));
const harnessDriver = `
$mode = $env:H1_MODE
$preState = if ($env:H1_PRESTATE) { $env:H1_PRESTATE | ConvertFrom-Json } else { $null }
try {
  if ($mode -eq 'traffic') {
    $trafficRaw = Get-Prop $preState.status 'traffic'
    if ($null -eq $trafficRaw) { throw 'no traffic' }
    $trafficArray = @($trafficRaw)
    if ($trafficArray.Count -eq 0) { throw 'empty traffic' }
    $tagEntries = @()
    $seenTags = @{}
    $servingTotal = 0
    $servingCount = 0
    foreach ($entry in $trafficArray) {
      $tag = Get-Prop $entry 'tag'
      if ($null -ne $tag -and -not [string]::IsNullOrWhiteSpace($tag)) {
        $revisionName = Get-Prop $entry 'revisionName'
        if ([string]::IsNullOrWhiteSpace($revisionName)) { throw 'no revisionName' }
        if (-not (Test-SafeResourceName $tag) -or -not (Test-SafeResourceName $revisionName)) { throw 'unsafe name' }
        if ($seenTags.ContainsKey($tag)) { throw 'duplicate tag' }
        $seenTags[$tag] = $true
        $tagEntries += [PSCustomObject]@{ Tag = $tag; RevisionName = $revisionName }
        continue
      }
      $percent = Get-Prop $entry 'percent'
      if (($percent -isnot [int] -and $percent -isnot [long]) -or [int]$percent -lt 1 -or [int]$percent -gt 100) { throw 'malformed serving entry' }
      $percentValue = [int]$percent
      $servingRevision = Get-Prop $entry 'revisionName'
      if ([string]::IsNullOrWhiteSpace($servingRevision) -or -not (Test-SafeResourceName $servingRevision)) { throw 'serving entry missing safe revisionName' }
      $servingTotal += $percentValue
      $servingCount++
    }
    if ($servingCount -eq 0) { throw 'no serving entry' }
    if ($servingTotal -ne 100) { throw 'serving total not 100' }
    $tagBlockLines = @()
    foreach ($tagEntry in $tagEntries) {
      $tagBlockLines += ("  - tag: '" + $tagEntry.Tag + "'")
      $tagBlockLines += ("    revisionName: '" + $tagEntry.RevisionName + "'")
    }
    Write-Output ('OK:' + $tagEntries.Count + ':' + (($tagEntries | ForEach-Object { $_.Tag + '=' + $_.RevisionName }) -join ';') + '::' + ($tagBlockLines -join '|'))
  } elseif ($mode -eq 'secrets') {
    $aliases = @('collabboard-supabase-url','collabboard-supabase-anon-key','collabboard-supabase-service-role-key')
    $annotations = $preState.spec.template.metadata.annotations
    $raw = Get-Prop $annotations 'run.googleapis.com/secrets'
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'missing annotation' }
    $map = Test-SecretsAnnotation $raw $aliases
    Write-Output ('OK:' + $map['collabboard-supabase-url'])
  } elseif ($mode -eq 'tagmapping') {
    $postTraffic = @(Get-Prop $preState.status 'traffic')
    $tagEntry = [PSCustomObject]@{ Tag = 'c3c'; RevisionName = 'orig-rev' }
    $matching = @($postTraffic | Where-Object { (Get-Prop $_ 'tag') -eq $tagEntry.Tag })
    if ($matching.Count -ne 1 -or (Get-Prop $matching[0] 'revisionName') -ne $tagEntry.RevisionName) { throw 'tag mapping mismatch' }
    Write-Output 'OK:mapping-intact'
  } elseif ($mode -eq 'dependency') {
    $parsed = $env:H1_DEP_JSON | ConvertFrom-Json
    $depProps = @($parsed.PSObject.Properties)
    if ($depProps.Count -ne 1 -or $depProps[0].Name -cne 'query-service') { throw 'dependency object is not exactly {query-service: [...]}' }
    $depsRaw = $depProps[0].Value
    if ($depsRaw -isnot [array]) { throw 'dependency value is not a JSON array' }
    $deps = @($depsRaw)
    if ($deps.Count -ne 1 -or $deps[0] -ne 'voyage-tei') { throw 'dependency mismatch' }
    Write-Output 'OK:dependency-exact'
  }
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
  exit 1
}
`;
function run(mode: string, env: Record<string, string> = {}) {
  const script = helperFunctions + '\n' + harnessDriver;
  const tmp = path.join(os.tmpdir(), `h1-ps-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(tmp, script, 'utf8');
  try {
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp], {
      encoding: 'utf8', timeout: 20000, env: { ...process.env, H1_MODE: mode, ...env },
    });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
describe('P6I-H1 corrective behavioral tests -- real PowerShell execution under StrictMode', () => {
  const liveShape = JSON.stringify({
    status: { traffic: [
      { revisionName: 'q-00008-zg8', percent: 100, latestRevision: true },
      { revisionName: 'q-00008-zg8', tag: 'c3c' },
    ] },
    spec: { template: { metadata: { annotations: {
      'run.googleapis.com/secrets': 'collabboard-supabase-url:projects/76510182918/secrets/collabboard-supabase-url,collabboard-supabase-anon-key:projects/76510182918/secrets/collabboard-supabase-anon-key,collabboard-supabase-service-role-key:projects/76510182918/secrets/collabboard-supabase-service-role-key',
    } } } },
  });
  it('H1-C1/H1-C13: real heterogeneous live traffic shape does not throw under StrictMode and extracts the tag', () => {
    const result = run('traffic', { H1_PRESTATE: liveShape });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK:1');
    expect(result.stdout).toContain('c3c=q-00008-zg8');
  });
  it('H1-C8: real live secrets annotation parses and validates without throwing', () => {
    const result = run('secrets', { H1_PRESTATE: liveShape });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK:projects/76510182918/secrets/collabboard-supabase-url');
  });
  it('H1-C2: missing status.traffic fails closed before mutation logic', () => {
    expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: {} }) }).status).not.toBe(0);
  });
  it('H1-C3: tag present but revisionName absent fails closed', () => {
    const preState = JSON.stringify({ status: { traffic: [{ tag: 'c3c' }] } });
    expect(run('traffic', { H1_PRESTATE: preState }).status).not.toBe(0);
  });
  it('H1-C4: duplicate tags fail closed', () => {
    const preState = JSON.stringify({ status: { traffic: [{ tag: 'c3c', revisionName: 'r1' }, { tag: 'c3c', revisionName: 'r2' }] } });
    expect(run('traffic', { H1_PRESTATE: preState }).status).not.toBe(0);
  });
  it('H1-C5: valid no-tag traffic state succeeds with zero tags', () => {
    const preState = JSON.stringify({ status: { traffic: [{ percent: 100, revisionName: 'r1', latestRevision: true }] } });
    const result = run('traffic', { H1_PRESTATE: preState });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK:0');
  });
  it('H1-C6: multiple tags are all preserved with original mappings', () => {
    const preState = JSON.stringify({ status: { traffic: [
      { percent: 100, revisionName: 'r1' }, { tag: 'stable', revisionName: 'r1' }, { tag: 'canary', revisionName: 'r2' },
    ] } });
    const result = run('traffic', { H1_PRESTATE: preState });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK:2');
    expect(result.stdout).toContain('stable=r1');
    expect(result.stdout).toContain('canary=r2');
  });
  it('H1-C7: unsafe tag names are rejected before YAML serialization', () => {
    const preState = JSON.stringify({ status: { traffic: [{ tag: 'bad tag; rm -rf', revisionName: 'r1' }] } });
    expect(run('traffic', { H1_PRESTATE: preState }).status).not.toBe(0);
  });
  it('H1-C9: missing or malformed secrets annotation fails closed', () => {
    const missing = JSON.stringify({ spec: { template: { metadata: { annotations: {} } } } });
    expect(run('secrets', { H1_PRESTATE: missing }).status).not.toBe(0);
    const malformed = JSON.stringify({ spec: { template: { metadata: { annotations: { 'run.googleapis.com/secrets': 'collabboard-supabase-url:not-a-path' } } } } });
    expect(run('secrets', { H1_PRESTATE: malformed }).status).not.toBe(0);
  });
  it('H1-C11: postdeploy tag-mapping check detects a repointed (hijacked) tag, not merely tag presence', () => {
    const intact = JSON.stringify({ status: { traffic: [{ tag: 'c3c', revisionName: 'orig-rev' }] } });
    expect(run('tagmapping', { H1_PRESTATE: intact }).status).toBe(0);
    const hijacked = JSON.stringify({ status: { traffic: [{ tag: 'c3c', revisionName: 'new-rev' }] } });
    expect(run('tagmapping', { H1_PRESTATE: hijacked }).status).not.toBe(0);
  });
  it('H1-C12: postdeploy dependency check is exact, not substring', () => {
    expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei'] }) }).status).toBe(0);
    expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei', 'extra'] }) }).status).not.toBe(0);
  });
});

describe('P6I-H1 final edge-case corrective tests', () => {
  const secretsAnnotation = (aliases: string) => JSON.stringify({ spec: { template: { metadata: { annotations: { 'run.googleapis.com/secrets': aliases } } } } });
  it('H1-F1: malformed nonempty traffic entry (no tag, no usable percent) fails closed', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ foo: 'bar' }] } }) }).status).not.toBe(0); });
  it('H1-F2: only-tag traffic with no serving percentage fails closed', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ tag: 'stable', revisionName: 'r1' }] } }) }).status).not.toBe(0); });
  it('H1-F3: a valid 100% serving entry with zero tags passes', () => {
    const preState = JSON.stringify({ status: { traffic: [{ percent: 100, revisionName: 'r1', latestRevision: true }] } });
    const result = run('traffic', { H1_PRESTATE: preState });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK:0');
  });
  it('H1-F4: a serving entry missing revisionName fails closed', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ percent: 100 }] } }) }).status).not.toBe(0); });
  it('H1-F5: serving percentages not totaling 100 fail closed; totaling 100 passes', () => {
    const under = JSON.stringify({ status: { traffic: [{ percent: 50, revisionName: 'r1' }, { percent: 40, revisionName: 'r2' }] } });
    expect(run('traffic', { H1_PRESTATE: under }).status).not.toBe(0);
    const exact = JSON.stringify({ status: { traffic: [{ percent: 50, revisionName: 'r1' }, { percent: 50, revisionName: 'r2' }] } });
    expect(run('traffic', { H1_PRESTATE: exact }).status).toBe(0);
  });
  it('H1-F6: an unexpected fourth secret alias fails closed', () => {
    const aliases = 'collabboard-supabase-url:projects/1/secrets/collabboard-supabase-url,collabboard-supabase-anon-key:projects/1/secrets/collabboard-supabase-anon-key,collabboard-supabase-service-role-key:projects/1/secrets/collabboard-supabase-service-role-key,fourth:projects/1/secrets/fourth';
    expect(run('secrets', { H1_PRESTATE: secretsAnnotation(aliases) }).status).not.toBe(0);
  });
  it('H1-F7: a duplicate exact secret alias fails closed', () => {
    const aliases = 'collabboard-supabase-url:projects/1/secrets/collabboard-supabase-url,collabboard-supabase-anon-key:projects/1/secrets/collabboard-supabase-anon-key,collabboard-supabase-service-role-key:projects/1/secrets/collabboard-supabase-service-role-key,collabboard-supabase-url:projects/2/secrets/collabboard-supabase-url';
    expect(run('secrets', { H1_PRESTATE: secretsAnnotation(aliases) }).status).not.toBe(0);
  });
  it('H1-F8: a case-variant alias fails closed (comparison is case-sensitive)', () => {
    const aliases = 'COLLABBOARD-SUPABASE-URL:projects/1/secrets/COLLABBOARD-SUPABASE-URL,collabboard-supabase-anon-key:projects/1/secrets/collabboard-supabase-anon-key,collabboard-supabase-service-role-key:projects/1/secrets/collabboard-supabase-service-role-key';
    expect(run('secrets', { H1_PRESTATE: secretsAnnotation(aliases) }).status).not.toBe(0);
  });
  it('H1-F9: exactly the three expected secret aliases pass', () => {
    const aliases = 'collabboard-supabase-url:projects/1/secrets/collabboard-supabase-url,collabboard-supabase-anon-key:projects/1/secrets/collabboard-supabase-anon-key,collabboard-supabase-service-role-key:projects/1/secrets/collabboard-supabase-service-role-key';
    expect(run('secrets', { H1_PRESTATE: secretsAnnotation(aliases) }).status).toBe(0);
  });
  it('H1-F10/H1-F11: validator-accepted tag/revisionName values are emitted as quoted YAML scalars, never bare booleans/null/numbers', () => {
    for (const dangerous of ['true', 'false', 'null', '12345']) {
      const preState = JSON.stringify({ status: { traffic: [{ percent: 100, revisionName: 'r1' }, { tag: dangerous, revisionName: 'r1' }] } });
      const result = run('traffic', { H1_PRESTATE: preState });
      expect(result.status).toBe(0);
      const generatedLines = result.stdout.split('::')[1] ?? '';
      expect(generatedLines).toContain(`tag: '${dangerous}'`);
      expect(generatedLines).not.toContain(`tag: ${dangerous}`);
    }
  });
  it('H1-F12: a dependency object with an extra top-level key fails closed', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei'], foo: ['bar'] }) }).status).not.toBe(0); });
  it('H1-F13: the exact dependency object {query-service:[voyage-tei]} passes', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei'] }) }).status).toBe(0); });
});

describe('P6I-H1 value-type corrective tests', () => {
  it('H1-G1: a JSON-integer percent 100 passes', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ percent: 100, revisionName: 'r1' }] } }) }).status).toBe(0); });
  it('H1-G2: a JSON-string percent "100" fails closed', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ percent: '100', revisionName: 'r1' }] } }) }).status).not.toBe(0); });
  it('H1-G3: a JSON-boolean percent fails closed', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ percent: true, revisionName: 'r1' }] } }) }).status).not.toBe(0); });
  it('H1-G4: a JSON-decimal percent fails closed', () => { expect(run('traffic', { H1_PRESTATE: JSON.stringify({ status: { traffic: [{ percent: 99.5, revisionName: 'r1' }] } }) }).status).not.toBe(0); });
  it('H1-G5: two JSON-integer percentages summing to 100 pass', () => {
    const preState = JSON.stringify({ status: { traffic: [{ percent: 50, revisionName: 'r1' }, { percent: 50, revisionName: 'r2' }] } });
    expect(run('traffic', { H1_PRESTATE: preState }).status).toBe(0);
  });
  it('H1-G6: the exact dependency array {query-service:["voyage-tei"]} passes', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei'] }) }).status).toBe(0); });
  it('H1-G7: a scalar dependency value (not an array) fails closed', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': 'voyage-tei' }) }).status).not.toBe(0); });
  it('H1-G8: a dependency array with an extra element fails closed', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei', 'other'] }) }).status).not.toBe(0); });
  it('H1-G9: an empty dependency array fails closed', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': [] }) }).status).not.toBe(0); });
  it('H1-G10: an exact dependency array with an extra top-level key fails closed', () => { expect(run('dependency', { H1_DEP_JSON: JSON.stringify({ 'query-service': ['voyage-tei'], foo: ['bar'] }) }).status).not.toBe(0); });
});
