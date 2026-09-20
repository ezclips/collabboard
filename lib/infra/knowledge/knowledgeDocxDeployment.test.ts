/**
 * Does a PACKAGED deployment carry everything DOCX extraction needs?
 *
 * This is not a theoretical worry, and the answer was no. The extraction worker
 * is loaded by path and is plain CommonJS, so its `require('mammoth')` is
 * invisible to webpack and to Next's file tracing alike. The first version of
 * `outputFileTracingIncludes` named the worker file and stopped there, and the
 * built trace manifest for the upload route then listed the worker plus exactly
 * one package: `next`. A deployment built from that manifest would have started
 * fine, served every other route fine, and failed every DOCX upload -- in
 * production only, with the message a corrupt file gets.
 *
 * A build passing does not detect that, and neither does `next start` in the
 * full checkout, because the checkout has node_modules. These tests use the
 * only two things that can: the dependency closure, and a directory containing
 * nothing but what was packaged.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

const ROUTE = '/api/boards/[id]/knowledge';
const requireFromRepo = createRequire(path.join(process.cwd(), 'package.json'));

/** Every package the worker can reach at runtime, computed rather than listed. */
function mammothRuntimeClosure(): readonly string[] {
  const seen = new Set<string>();
  const walk = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    let manifestPath: string;
    try {
      manifestPath = requireFromRepo.resolve(`${name}/package.json`);
    } catch {
      return; // A built-in, or a package that hides its manifest; neither ships.
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys(manifest.dependencies ?? {})) walk(dependency);
  };
  walk('mammoth');
  return [...seen];
}

describe('deployment tracing for the DOCX extraction worker', () => {
  const included = (nextConfig.outputFileTracingIncludes?.[ROUTE] ?? []) as readonly string[];

  it('names the worker file itself', () => {
    expect(included).toContain('./lib/infra/knowledge/knowledgeDocxWorker.cjs');
  });

  it('names every package the worker can require at runtime', () => {
    // THE GUARD ON A HAND-WRITTEN LIST. If mammoth gains a dependency in a
    // future upgrade, the packaged worker would lose it silently -- the build
    // would still pass and dev would still work. This fails instead, naming
    // exactly what is missing.
    const missing = mammothRuntimeClosure()
      .filter((name) => !included.includes(`./node_modules/${name}/**/*`));
    expect(missing).toEqual([]);
  });

  it('does not ship the whole of node_modules to get there', () => {
    // The lazy fix for the above is a wildcard, which would bloat every
    // deployment and hide what is actually needed.
    expect(included).not.toContain('./node_modules/**/*');
  });
});

/** The trace manifest the BUILD emits for the upload route. */
const MANIFEST = path.join(
  process.cwd(),
  '.next/server/app/api/boards/[id]/knowledge/route.js.nft.json',
);

describe('the worker running from a tree populated by the emitted trace manifest', () => {
  /**
   * WHY THIS READS THE MANIFEST AND NOT next.config.ts.
   *
   * An earlier version of this test copied the packages NAMED IN THE CONFIG
   * into a temp directory. That proves the list is sufficient; it does not
   * prove the build EMITS it. Those are different claims, and only the second
   * one is about what gets deployed -- a glob that matches nothing, or an
   * include attached to the wrong route key, would leave the config looking
   * correct and the manifest empty. So this reads the build's own output.
   *
   * It needs a production build to exist, which a plain `vitest run` after
   * `next dev` does not have -- dev overwrites `.next`. The test therefore
   * skips, loudly and by name, rather than failing the gate for an absent
   * artifact or quietly passing on a fallback. A recorded run of it after a
   * real build is in .agent/docx-live-acceptance.md.
   */
  const built = fs.existsSync(MANIFEST);

  it.skipIf(!built)('extracts a real DOCX with no access to the checkout', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { files: string[] };
    const manifestDir = path.dirname(MANIFEST);

    // Entries are relative to the manifest, and Next emits both slash styles
    // for the same file, so they are resolved and de-duplicated.
    const traced = new Map<string, string>();
    for (const entry of manifest.files) {
      const absolute = path.resolve(manifestDir, entry.split('\\').join('/'));
      const relative = path.relative(process.cwd(), absolute).split('\\').join('/');
      if (relative.startsWith('..') || !fs.existsSync(absolute)) continue;
      if (fs.statSync(absolute).isDirectory()) continue;
      traced.set(relative, absolute);
    }

    // Staged in the OS temp directory, not under the repo, so module
    // resolution cannot walk up into the checkout's node_modules and quietly
    // rescue a package the manifest failed to carry.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-traced-'));
    try {
      for (const [relative, absolute] of traced) {
        const target = path.join(stage, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(absolute, target);
      }

      expect(fs.existsSync(path.join(stage, 'lib/infra/knowledge/knowledgeDocxWorker.cjs'))).toBe(true);

      const fixture = path.join(process.cwd(), 'lib/infra/knowledge/fixtures/docx/structured.docx');
      const driver = path.join(stage, 'run.cjs');
      fs.writeFileSync(driver, [
        "const { Worker } = require('node:worker_threads');",
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        `const bytes = new Uint8Array(fs.readFileSync(${JSON.stringify(fixture)}));`,
        // Where mammoth resolves FROM is the proof that nothing reached back
        // into the repository; it is reported and asserted below.
        "const resolved = require.resolve('mammoth', { paths: [path.join(__dirname, 'lib/infra/knowledge')] });",
        "const w = new Worker(path.join(__dirname, 'lib/infra/knowledge/knowledgeDocxWorker.cjs'), {",
        '  workerData: { bytes },',
        '  resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },',
        '});',
        "w.on('message', (m) => { console.log(JSON.stringify({ ok: m.ok, length: m.value ? m.value.html.length : 0, message: m.message, resolved })); process.exit(0); });",
        "w.on('error', (e) => { console.log(JSON.stringify({ ok: false, message: String(e && e.message), resolved })); process.exit(0); });",
      ].join('\n'));

      const out = execFileSync(process.execPath, [driver], {
        cwd: stage,
        encoding: 'utf8',
        timeout: 120_000,
        // A leaked NODE_PATH would let the staged tree borrow the checkout's
        // modules, which is exactly the rescue this test exists to prevent.
        env: { ...process.env, NODE_PATH: '' },
      });
      const result = JSON.parse(out.trim().split('\n').pop() as string) as {
        ok: boolean; length: number; message?: string; resolved: string;
      };

      expect(result.message ?? null).toBeNull();
      expect(result.ok).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // The decisive assertion: mammoth came from the staged tree.
      expect(result.resolved.split('\\').join('/')).toContain(
        stage.split('\\').join('/'),
      );
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }, 300_000);
});
