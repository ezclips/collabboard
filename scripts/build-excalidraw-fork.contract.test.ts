import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Build-contract guards for the vendored Excalidraw fork.
 *
 * The defect these protect against is invisible on a developer machine that
 * already has a locally built `dist/`: the app resolves `@excalidraw/*` to
 * generated output that is gitignored, so only a fresh checkout reveals it.
 * These tests pin the wiring that makes a fresh checkout buildable, plus the
 * artifact contract the generator enforces.
 *
 * The generator's *verification* behavior is exercised for real against a
 * throwaway fixture, so the checks are proven to bite rather than assumed to.
 */

const root = path.resolve(__dirname, '..');
const SCRIPT = path.join(root, 'scripts', 'build-excalidraw-fork.mjs');
const MARKER = 'customContextMenuRenderer';

const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkgJson = () => JSON.parse(read('package.json'));

// ─────────────────────────────────────────────────────────────────────────
// Root package wiring
// ─────────────────────────────────────────────────────────────────────────
describe('root build contract', () => {
  it('exposes build:fork', () => {
    expect(pkgJson().scripts['build:fork']).toBe('node scripts/build-excalidraw-fork.mjs');
  });

  it('runs build:fork before the app build via the prebuild lifecycle', () => {
    expect(pkgJson().scripts.prebuild).toBe('npm run build:fork');
  });

  it('leaves the app build itself a plain next build', () => {
    expect(pkgJson().scripts.build).toBe('next build');
  });

  it('introduces no postinstall — installs stay lightweight', () => {
    const scripts = pkgJson().scripts;
    for (const hook of ['postinstall', 'preinstall', 'install', 'prepare']) {
      expect(scripts[hook], `${hook} must not be introduced`).toBeUndefined();
    }
  });

  it('covers the e2e build path too', () => {
    expect(pkgJson().scripts['prebuild:e2e']).toBe('npm run build:fork');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// CI ordering
// ─────────────────────────────────────────────────────────────────────────
describe('CI build contract', () => {
  it('generates the fork before the early typecheck', () => {
    const ci = read('.github/workflows/ci.yml');
    const forkStep = ci.indexOf('npm run build:fork');
    const tscStep = ci.indexOf('npx tsc --noEmit');
    expect(forkStep, 'ci.yml must run build:fork').toBeGreaterThan(-1);
    expect(tscStep, 'ci.yml must still typecheck').toBeGreaterThan(-1);
    expect(forkStep).toBeLessThan(tscStep);
  });

  it('generates the fork after dependencies are installed', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci.indexOf('npm ci')).toBeLessThan(ci.indexOf('npm run build:fork'));
  });

  it('leaves the ai-quality workflows alone — prebuild already covers them', () => {
    for (const workflow of ['ai-quality.yml', 'ai-quality-nightly.yml']) {
      const source = read(`.github/workflows/${workflow}`);
      // They touch the fork only via `npm run build`, whose prebuild hook runs first.
      expect(source).not.toContain('build:fork');
      expect(source).toContain('npm run build');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Generator source contract
// ─────────────────────────────────────────────────────────────────────────
describe('generator source contract', () => {
  const script = () => fs.readFileSync(SCRIPT, 'utf8');

  it('builds all four vendored packages in dependency order', () => {
    const order = Array.from(script().matchAll(/name:\s*"(@excalidraw\/[a-z]+)"/g)).map(
      (match) => match[1]
    );
    // common has no siblings; math needs common; element needs common+math;
    // excalidraw needs all three.
    expect(order).toEqual([
      '@excalidraw/common',
      '@excalidraw/math',
      '@excalidraw/element',
      '@excalidraw/excalidraw',
    ]);
  });

  it('requires both runtime bundles and declarations for every package', () => {
    const source = script();
    for (const required of [
      'dist/prod/index.js',
      'dist/dev/index.js',
      'dist/prod/index.css',
      'dist/dev/index.css',
      'dist/types/common/src/index.d.ts',
      'dist/types/math/src/index.d.ts',
      'dist/types/element/src/index.d.ts',
      'dist/types/excalidraw/index.d.ts',
      'dist/types/excalidraw/types.d.ts',
    ]) {
      expect(source, `must verify ${required}`).toContain(required);
    }
  });

  it('checks the 6A marker in both bundles and the public declarations', () => {
    const source = script();
    expect(source).toContain(`const MARKER = "${MARKER}"`);
    const markerBlock = source.slice(source.indexOf('markerFiles:'));
    expect(markerBlock).toContain('dist/prod/index.js');
    expect(markerBlock).toContain('dist/dev/index.js');
    expect(markerBlock).toContain('dist/types/excalidraw/types.d.ts');
  });

  it('treats emptiness as failure, not just absence', () => {
    expect(script()).toContain('statSync(absolute).size > 0');
  });

  it('does not use a bare file count as the success signal', () => {
    expect(script()).not.toMatch(/length\s*<\s*\d{2,}/);
  });

  it('never touches .gitignore or stages anything', () => {
    // Code only: the doc comments legitimately explain *why* the fork's dist and
    // env files are gitignored, and describing a rule is not editing it.
    const code = script()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('.gitignore');
    expect(code).not.toContain('git add');
    expect(code).not.toMatch(/\bgit\b.*\bcommit\b/);
  });

  it('creates the untracked fork env files the bundler requires, without overwriting', () => {
    const source = script();
    expect(source).toContain('.env.development');
    expect(source).toContain('.env.production');
    // Existing files are left alone, and only an empty file is ever written.
    const block = source.slice(source.indexOf('const ensureForkEnvFiles'));
    expect(block.slice(0, 400)).toContain('if (existsSync(file)) continue');
    expect(block.slice(0, 400)).toContain('writeFileSync(file, "")');
  });

  it('resolves its paths from its own location, not the caller cwd', () => {
    const source = script();
    expect(source).toContain('fileURLToPath(import.meta.url)');
    expect(source).not.toContain('process.cwd()');
  });

  it('puts the root bin directory on PATH for the packages\' rimraf', () => {
    const source = script();
    expect(source).toContain('node_modules", ".bin"');
    expect(source).toContain('PATH:');
  });

  it('is Windows-compatible in how it spawns the generator', () => {
    expect(script()).toContain('shell: process.platform === "win32"');
  });

  it('tolerates a non-zero generator exit only as a warning before verifying', () => {
    const source = script();
    const branch = source.slice(source.indexOf('if (result.status !== 0)'));
    expect(branch.slice(0, 400)).toContain('warn(');
    // Verification is what actually decides success.
    expect(branch.indexOf('verifyPackage')).toBeGreaterThan(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The verifier, exercised for real against a disposable fixture
// ─────────────────────────────────────────────────────────────────────────
describe('generator verification behavior', () => {
  let fixture: string | null = null;

  afterEach(() => {
    if (fixture) fs.rmSync(fixture, { recursive: true, force: true });
    fixture = null;
  });

  const PACKAGE_FILES: Record<string, string[]> = {
    common: ['dist/prod/index.js', 'dist/dev/index.js', 'dist/types/common/src/index.d.ts'],
    math: ['dist/prod/index.js', 'dist/dev/index.js', 'dist/types/math/src/index.d.ts'],
    element: ['dist/prod/index.js', 'dist/dev/index.js', 'dist/types/element/src/index.d.ts'],
    excalidraw: [
      'dist/prod/index.js',
      'dist/dev/index.js',
      'dist/prod/index.css',
      'dist/dev/index.css',
      'dist/types/excalidraw/index.d.ts',
      'dist/types/excalidraw/types.d.ts',
    ],
  };

  /**
   * A tree the real script accepts: every required artifact present, non-empty,
   * and newer than its package source, so the script takes its up-to-date path
   * and runs verification without invoking any package manager.
   */
  function makeFixture(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-contract-'));
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'build-excalidraw-fork.mjs'));

    const packages = path.join(dir, 'components/collabboard/canvas/excalidraw_fork/packages');
    const future = new Date(Date.now() + 60_000);

    for (const [name, files] of Object.entries(PACKAGE_FILES)) {
      const pkgDir = path.join(packages, name);
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name }));
      for (const relative of files) {
        const full = path.join(pkgDir, relative);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        // The excalidraw bundles and public types must carry the 6A marker.
        const carriesMarker =
          name === 'excalidraw' &&
          ['dist/prod/index.js', 'dist/dev/index.js', 'dist/types/excalidraw/types.d.ts'].includes(
            relative
          );
        fs.writeFileSync(full, carriesMarker ? `export const x = "${MARKER}";` : 'export {};');
        fs.utimesSync(full, future, future);
      }
    }
    return dir;
  }

  function run(dir: string): { status: number; output: string } {
    try {
      const stdout = execFileSync(
        process.execPath,
        [path.join(dir, 'scripts', 'build-excalidraw-fork.mjs')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return { status: 0, output: stdout };
    } catch (error: any) {
      return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
  }

  it('accepts a complete artifact set', () => {
    fixture = makeFixture();
    const result = run(fixture);
    expect(result.output).toContain('artifact contract verified');
    expect(result.status).toBe(0);
  });

  it('fails when a required runtime bundle is missing', () => {
    fixture = makeFixture();
    fs.rmSync(
      path.join(
        fixture,
        'components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/prod/index.js'
      )
    );
    const result = run(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('missing required runtime output');
  });

  it('fails when a required declaration is missing', () => {
    fixture = makeFixture();
    fs.rmSync(
      path.join(
        fixture,
        'components/collabboard/canvas/excalidraw_fork/packages/element/dist/types/element/src/index.d.ts'
      )
    );
    const result = run(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('missing required type output');
  });

  it('fails when a required artifact exists but is empty', () => {
    fixture = makeFixture();
    const empty = path.join(
      fixture,
      'components/collabboard/canvas/excalidraw_fork/packages/math/dist/prod/index.js'
    );
    fs.writeFileSync(empty, '');
    const result = run(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('missing required runtime output');
  });

  it('fails when generated output predates the 6A renderer hook', () => {
    fixture = makeFixture();
    const bundle = path.join(
      fixture,
      'components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/prod/index.js'
    );
    const future = new Date(Date.now() + 60_000);
    fs.writeFileSync(bundle, 'export const x = "some other build";');
    fs.utimesSync(bundle, future, future);
    const result = run(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(MARKER);
    expect(result.output).toContain('native one');
  });

  it('fails when a whole vendored package is absent', () => {
    fixture = makeFixture();
    fs.rmSync(
      path.join(fixture, 'components/collabboard/canvas/excalidraw_fork/packages/math'),
      { recursive: true, force: true }
    );
    const result = run(fixture);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('vendored package is missing');
  });
});
