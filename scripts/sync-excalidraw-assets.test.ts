import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * PATCH-286. The vendored fork's fonts have to reach the app's own `public/`
 * tree; the copy is a plain Node script so it can run on `predev` and after a
 * production fork build. These tests exercise the REAL script as a child
 * process, against throwaway temp dirs (never the repository's `public/`), so
 * the exit code and the failure message are pinned, not assumed.
 */

const root = path.resolve(__dirname, '..');
const SCRIPT = path.join(root, 'scripts', 'sync-excalidraw-assets.mjs');

let tempDirs: string[] = [];
const makeTemp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'excalidraw-assets-'));
  tempDirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

const write = (file: string, contents: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

function run(source: string, target: string): { status: number; output: string } {
  const env = {
    ...process.env,
    EXCALIDRAW_FONTS_SOURCE: source,
    EXCALIDRAW_ASSETS_TARGET: target,
  };
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', env });
    return { status: 0, output: stdout };
  } catch (error: any) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

describe('PATCH-286: sync-excalidraw-assets', () => {
  it('copies nested .woff2 files with their relative paths and skips other files', () => {
    const source = makeTemp();
    const target = makeTemp();
    write(path.join(source, 'Excalifont', 'Excalifont-Regular-aaaa.woff2'), 'aa');
    write(path.join(source, 'Xiaolai', 'deep', 'Xiaolai-Regular-bbbb.woff2'), 'bb');
    write(path.join(source, 'Excalifont', 'README.md'), 'not a font');
    write(path.join(source, 'Excalifont', 'Excalifont-Regular-cccc.woff'), 'older format');

    const result = run(source, target);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(target, 'Excalifont', 'Excalifont-Regular-aaaa.woff2'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'Xiaolai', 'deep', 'Xiaolai-Regular-bbbb.woff2'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'Excalifont', 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'Excalifont', 'Excalifont-Regular-cccc.woff'))).toBe(false);
  });

  it('removes a stale file that already sits in the target', () => {
    const source = makeTemp();
    const target = makeTemp();
    write(path.join(source, 'Excalifont', 'keep.woff2'), 'keep');
    write(path.join(target, 'Excalifont', 'stale.woff2'), 'stale');

    const result = run(source, target);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(target, 'Excalifont', 'stale.woff2'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'Excalifont', 'keep.woff2'))).toBe(true);
  });

  it('fails with a build instruction when the source fonts folder is missing', () => {
    const source = path.join(makeTemp(), 'does-not-exist');
    const target = makeTemp();

    const result = run(source, target);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('build:fork');
  });

  it('is idempotent', () => {
    const source = makeTemp();
    const target = makeTemp();
    write(path.join(source, 'Excalifont', 'a.woff2'), 'a');

    expect(run(source, target).status).toBe(0);
    expect(run(source, target).status).toBe(0);
    expect(fs.existsSync(path.join(target, 'Excalifont', 'a.woff2'))).toBe(true);
  });
});
