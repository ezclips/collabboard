import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const dockerfile = fs.readFileSync(path.join(root, 'workers/knowledge-pdf/Dockerfile'), 'utf8');
const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');

describe('Knowledge PDF worker container packaging', () => {
  it('uses deterministic multi-stage build inputs and verifies the full artifact hashes', () => {
    expect(dockerfile).toContain('FROM node:22.14.0-bookworm-slim AS build');
    expect(dockerfile).toContain('FROM node:22.14.0-bookworm-slim AS runtime');
    expect(dockerfile).toContain('npm ci');
    expect(dockerfile).toContain('sha256sum --check --strict');
    expect(dockerfile).toContain('738E0A85B8FA82599205F47EDE74DD76B0EDE99E5BC5998B73C5F92320E6DC6B');
    expect(dockerfile).toContain('516CE47832A6726E87CB17DB77C20174CA8CABBE9A6B56DB1418BABC7C9DDCBA');
    expect(dockerfile).toContain('openjdk-17-jre-headless');
    expect(dockerfile).toContain('CMD ["node", "/app/dist/runDispatcher.mjs"]');
  });

  it('runs non-root and keeps secrets/runtime caches out of the build context', () => {
    expect(dockerfile).toContain('useradd --system');
    expect(dockerfile).toContain('USER collabboard');
    expect(dockerfile).not.toMatch(/COPY\s+\.env|ENV\s+SUPABASE_SERVICE_ROLE_KEY|ARG\s+SUPABASE_SERVICE_ROLE_KEY/);
    for (const ignored of ['.env.*', '.git', 'collabboard-opendataloader-p2b', '*.jar', '*.zip']) {
      expect(dockerignore).toContain(ignored);
    }
  });

  it('contains no host-runtime or deployment dependency', () => {
    expect(dockerfile).not.toMatch(/host\.docker\.internal|localhost|docker-compose|kubectl|railway|fly\.io/i);
    expect(dockerfile).not.toContain('npm install');
  });
});
