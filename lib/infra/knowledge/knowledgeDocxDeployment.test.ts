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

describe('the worker running from a tree containing only what was packaged', () => {
  it('extracts a real DOCX with no repository around it', () => {
    // THE POINT. The worker and its declared closure are copied into an empty
    // directory -- no repo, no .next, no wider node_modules -- and run there.
    // If the closure in next.config.ts is wrong, this fails the way production
    // would, which is the failure the other tests cannot see.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-package-'));
    try {
      const included = (nextConfig.outputFileTracingIncludes?.[ROUTE] ?? []) as readonly string[];
      const packages = included
        .map((entry) => entry.match(/^\.\/node_modules\/(.+)\/\*\*\/\*$/)?.[1])
        .filter((name): name is string => typeof name === 'string');

      fs.mkdirSync(path.join(stage, 'node_modules'), { recursive: true });
      for (const name of packages) {
        fs.cpSync(
          path.join(process.cwd(), 'node_modules', name),
          path.join(stage, 'node_modules', name),
          { recursive: true },
        );
      }
      fs.copyFileSync(
        path.join(process.cwd(), 'lib/infra/knowledge/knowledgeDocxWorker.cjs'),
        path.join(stage, 'worker.cjs'),
      );

      const fixture = path.join(process.cwd(), 'lib/infra/knowledge/fixtures/docx/structured.docx');
      const driver = path.join(stage, 'run.cjs');
      fs.writeFileSync(driver, [
        "const { Worker } = require('node:worker_threads');",
        "const fs = require('node:fs');",
        `const bytes = new Uint8Array(fs.readFileSync(${JSON.stringify(fixture)}));`,
        "const w = new Worker(require('node:path').join(__dirname, 'worker.cjs'), {",
        '  workerData: { bytes },',
        '  resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },',
        '});',
        "w.on('message', (m) => { console.log(JSON.stringify({ ok: m.ok, length: m.value ? m.value.html.length : 0, message: m.message })); process.exit(0); });",
        "w.on('error', (e) => { console.log(JSON.stringify({ ok: false, message: String(e && e.message) })); process.exit(0); });",
      ].join('\n'));

      // cwd is the staged directory, so a stray resolution back into the repo
      // would not accidentally rescue a missing package.
      const out = execFileSync(process.execPath, [driver], {
        cwd: stage,
        encoding: 'utf8',
        timeout: 60_000,
      });
      const result = JSON.parse(out.trim().split('\n').pop() as string) as {
        ok: boolean; length: number; message?: string;
      };

      expect(result.message ?? null).toBeNull();
      expect(result.ok).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }, 180_000);
});
