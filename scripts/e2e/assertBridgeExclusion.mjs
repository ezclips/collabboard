import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nextDir = path.join(root, '.next');
const buildId = path.join(nextDir, 'BUILD_ID');
const scopes = ['static', 'server'];
const manifests = [
  'app-build-manifest.json',
  'build-manifest.json',
  'fallback-build-manifest.json',
  'server/middleware-build-manifest.js',
  'server/middleware-manifest.json',
  'server/next-font-manifest.json',
  'server/pages-manifest.json',
  'server/app-paths-manifest.json',
];
const forbidden = [
  '__COLLABBOARD_E2E__',
  'COLLABBOARD_E2E_BRIDGE_DIAGNOSTIC',
  'bridgeRegistration.e2e',
  'COLLABBOARD_E2E_REAL_BRIDGE_REGISTRATION_V1',
  'getInteractionState',
  'subscribeToSceneChange',
  'getSceneRevision',
  'drawingResizeFixture.e2e',
  '__drawingResizeFixture',
];

if (!existsSync(nextDir) || !existsSync(buildId)) {
  console.error('Bridge exclusion failed: .next/BUILD_ID is missing');
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else files.push(full);
  }
};

for (const scope of scopes) walk(path.join(nextDir, scope));
for (const manifest of manifests) {
  const full = path.join(nextDir, manifest);
  if (existsSync(full)) files.push(full);
}

const hits = [];
for (const file of [...new Set(files)]) {
  const text = readFileSync(file, 'utf8');
  for (const marker of forbidden) {
    if (text.includes(marker)) hits.push(`${path.relative(root, file)} :: ${marker}`);
  }
}

const markerPath = path.join(nextDir, 'E2E_BRIDGE_BUILD');
if (existsSync(markerPath)) hits.push(`${path.relative(root, markerPath)} :: e2e artifact marker`);

if (hits.length > 0) {
  console.error(`Bridge exclusion failed:\n${hits.join('\n')}`);
  process.exit(1);
}

console.log(`Bridge exclusion proven across ${files.length} emitted files.`);
