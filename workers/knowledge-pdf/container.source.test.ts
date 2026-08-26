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

  /**
   * P6J-F9-A1b. The runtime stage copies no general node_modules, so the native
   * canvas backend has to be packaged deliberately -- and proven at build time,
   * because a missing or wrong-arch codec would otherwise only surface on the
   * first real ingest.
   */
  describe('native canvas packaging', () => {
    it('keeps the native addon out of the esbuild bundle', () => {
      expect(dockerfile).toContain('--external:@napi-rs/canvas');
      // The existing PDF.js externalization must survive alongside it.
      expect(dockerfile).toContain('--external:pdfjs-dist/legacy/build/pdf.mjs');
    });

    it('copies the @napi-rs scope into the runtime stage, not all of node_modules', () => {
      expect(dockerfile).toContain('COPY --from=build /app/node_modules/@napi-rs /app/node_modules/@napi-rs');
      expect(dockerfile).toContain('COPY --from=build /app/node_modules/pdfjs-dist /app/node_modules/pdfjs-dist');
      expect(dockerfile).not.toMatch(/COPY\s+--from=build\s+\/app\/node_modules\s/);
    });

    it('fails the image build unless a real WebP encode succeeds', () => {
      expect(dockerfile).toContain("import { createCanvas } from '@napi-rs/canvas'");
      // Drawing and encoding must actually execute -- importing is not enough.
      expect(dockerfile).toContain("canvas.encode('webp'");
      expect(dockerfile).toContain('fillRect');
      expect(dockerfile).toContain("'RIFFWEBP'");
      expect(dockerfile).toContain('process.exit(1)');
    });
  });
});
