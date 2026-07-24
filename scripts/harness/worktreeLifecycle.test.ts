import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorktree,
  listOwnedWorktrees,
  pruneStaleWorktreeMetadata,
  removeWorktree,
  type GitCommandRunner,
} from './worktreeLifecycle';
import type { OwnedWorktreeHandle, WorktreeConfig } from './types';

const BASE = 'a'.repeat(40);
const temporaryRoots: string[] = [];

interface FakeGit {
  readonly calls: string[];
  readonly branches: Set<string>;
  readonly worktrees: Set<string>;
  readonly dirtyPaths: Set<string>;
  readonly runner: GitCommandRunner;
  mainPath: string;
}

async function fixture(): Promise<{
  readonly root: string;
  readonly metadataRoot: string;
  readonly git: FakeGit;
  readonly options: {
    readonly repoRoot: string;
    readonly metadataRoot: string;
    readonly testSeams: {
      readonly commandRunner: GitCommandRunner;
      readonly allocatePort: () => Promise<number>;
    };
  };
}> {
  const root = await mkdtemp(join(tmpdir(), 'patch-107-unit-'));
  temporaryRoots.push(root);
  const metadataRoot = join(root, '.fable5', 'worktrees');
  const calls: string[] = [];
  const branches = new Set<string>();
  const worktrees = new Set<string>();
  const dirtyPaths = new Set<string>();
  let nextPort = 41_000;
  const git: FakeGit = {
    calls,
    branches,
    worktrees,
    dirtyPaths,
    mainPath: root,
    runner: async (args, cwd) => {
      const key = args.join(' ');
      calls.push(`${cwd}|${key}`);
      if (key === 'rev-parse --show-toplevel') {
        return { code: 0, stdout: `${cwd === root ? git.mainPath : resolve(cwd)}\n`, stderr: '' };
      }
      if (args[0] === 'cat-file') {
        return { code: args[2] === `${BASE}^{commit}` ? 0 : 1, stdout: '', stderr: '' };
      }
      if (args[0] === 'show-ref') {
        const branch = String(args[3]).replace('refs/heads/', '');
        return { code: branches.has(branch) ? 0 : 1, stdout: '', stderr: '' };
      }
      if (args[0] === 'worktree' && args[1] === 'add') {
        const branchIndex = args.indexOf('-b');
        const target = resolve(args[branchIndex >= 0 ? branchIndex + 2 : 3]);
        if (branchIndex >= 0) branches.add(args[branchIndex + 1]);
        worktrees.add(target);
        await mkdir(target, { recursive: true });
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'status') {
        return { code: 0, stdout: dirtyPaths.has(resolve(cwd)) ? ' M fixture.txt\n' : '', stderr: '' };
      }
      if (args[0] === 'worktree' && args[1] === 'remove') {
        const target = resolve(args[args.length - 1]);
        worktrees.delete(target);
        await rm(target, { recursive: true, force: true });
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'branch' && args[1] === '-D') {
        branches.delete(args[2]);
        return { code: 0, stdout: '', stderr: '' };
      }
      if (key === 'worktree list --porcelain') {
        const paths = [root, ...worktrees];
        return { code: 0, stdout: paths.map((path) => `worktree ${path}\nHEAD ${BASE}\n`).join('\n'), stderr: '' };
      }
      return { code: 1, stdout: '', stderr: `unexpected fake git call: ${key}` };
    },
  };
  return {
    root,
    metadataRoot,
    git,
    options: {
      repoRoot: root,
      metadataRoot,
      testSeams: {
        commandRunner: git.runner,
        allocatePort: async () => {
          nextPort += 1;
          return nextPort;
        },
      },
    },
  };
}

function config(id = 'unit-one', branch = 'harness/worktree/unit-one'): WorktreeConfig {
  return {
    baseCommit: BASE,
    worktreeId: id,
    parentDir: '.fable5/worktrees',
    branchName: branch,
  };
}

async function createdHandle(
  setup: Awaited<ReturnType<typeof fixture>>,
  override: Partial<WorktreeConfig> = {},
): Promise<OwnedWorktreeHandle> {
  const result = await createWorktree({ ...config(), ...override }, setup.options);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`fixture create failed: ${result.reason}`);
  return result.handle;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('worktree lifecycle', () => {
  it('creates from an exact valid base commit and returns the governed handle', async () => {
    const setup = await fixture();
    const result = await createWorktree(config(), setup.options);
    expect(result).toMatchObject({
      ok: true,
      reason: 'created',
      handle: {
        worktreeId: 'unit-one',
        branchName: 'harness/worktree/unit-one',
        baseCommit: BASE,
        ownedByHarness: true,
        allocatedPorts: [],
      },
    });
    if (result.ok) expect((await stat(result.handle.path)).isDirectory()).toBe(true);
  });

  it('rejects an invalid or non-existent base commit', async () => {
    const setup = await fixture();
    expect(await createWorktree({ ...config(), baseCommit: 'bad' }, setup.options)).toMatchObject({ ok: false, reason: 'invalid-base-commit' });
    expect(await createWorktree({ ...config(), baseCommit: 'b'.repeat(40) }, setup.options)).toMatchObject({ ok: false, reason: 'invalid-base-commit' });
  });

  it('refuses a target path collision', async () => {
    const setup = await fixture();
    await mkdir(join(setup.metadataRoot, 'unit-one'), { recursive: true });
    expect(await createWorktree(config(), setup.options)).toEqual({ ok: false, reason: 'path-collision', path: join(setup.metadataRoot, 'unit-one') });
  });

  it('refuses an existing branch collision', async () => {
    const setup = await fixture();
    setup.git.branches.add('harness/worktree/unit-one');
    expect(await createWorktree(config(), setup.options)).toEqual({ ok: false, reason: 'branch-collision', branchName: 'harness/worktree/unit-one' });
  });

  it('writes ownership metadata that exactly represents the returned handle', async () => {
    const setup = await fixture();
    const handle = await createdHandle(setup);
    const parsed = JSON.parse(await readFile(handle.metadataPath, 'utf8')) as Record<string, unknown>;
    const { metadataPath: _metadataPath, ...expected } = handle;
    expect(parsed).toEqual(expected);
    expect(await listOwnedWorktrees(setup.options)).toEqual([handle]);
  });

  it('allocates distinct nonzero ephemeral ports', async () => {
    const setup = await fixture();
    const handle = await createdHandle(setup, { portCount: 3 });
    expect(handle.allocatedPorts).toHaveLength(3);
    expect(new Set(handle.allocatedPorts).size).toBe(3);
    expect(handle.allocatedPorts.every((port) => port > 0)).toBe(true);
  });

  it('protects the main worktree during create and remove', async () => {
    const setup = await fixture();
    const target = join(setup.metadataRoot, 'unit-one');
    setup.git.mainPath = target;
    expect(await createWorktree(config(), setup.options)).toMatchObject({ ok: false, reason: 'git-worktree-add-failed' });

    setup.git.mainPath = setup.root;
    const handle = await createdHandle(setup);
    setup.git.mainPath = handle.path;
    expect(await removeWorktree(handle, setup.options)).toEqual({ ok: false, reason: 'is-main-worktree-refused' });
  });

  it('refuses to remove a dirty worktree without force', async () => {
    const setup = await fixture();
    const handle = await createdHandle(setup);
    setup.git.dirtyPaths.add(handle.path);
    expect(await removeWorktree(handle, setup.options)).toEqual({ ok: false, reason: 'dirty-refused' });
  });

  it('removes a clean owned worktree, its branch, and its metadata', async () => {
    const setup = await fixture();
    const handle = await createdHandle(setup);
    expect(await removeWorktree(handle, setup.options)).toEqual({ ok: true, reason: 'removed' });
    expect(setup.git.branches.has(String(handle.branchName))).toBe(false);
    expect(await listOwnedWorktrees(setup.options)).toEqual([]);
    await expect(stat(handle.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses an unowned directory', async () => {
    const setup = await fixture();
    const path = join(setup.metadataRoot, 'unowned');
    await mkdir(path, { recursive: true });
    const handle: OwnedWorktreeHandle = {
      worktreeId: 'unowned',
      path,
      branchName: null,
      baseCommit: BASE,
      createdAt: new Date().toISOString(),
      ownedByHarness: true,
      allocatedPorts: [],
      metadataPath: join(setup.metadataRoot, 'unowned.meta.json'),
    };
    expect(await removeWorktree(handle, setup.options)).toEqual({ ok: false, reason: 'not-owned-refused' });
  });

  it('prunes stale metadata while retaining live ownership entries', async () => {
    const setup = await fixture();
    const live = await createdHandle(setup);
    const staleResult = await createWorktree({
      baseCommit: BASE,
      worktreeId: 'unit-stale',
      parentDir: '.fable5/worktrees',
    }, setup.options);
    expect(staleResult.ok).toBe(true);
    if (!staleResult.ok) throw new Error(`fixture create failed: ${staleResult.reason}`);
    const stale = staleResult.handle;
    setup.git.worktrees.delete(stale.path);
    expect(await pruneStaleWorktreeMetadata(setup.options)).toEqual({ prunedCount: 1, prunedIds: ['unit-stale'] });
    expect((await listOwnedWorktrees(setup.options)).map((handle) => handle.worktreeId)).toEqual([live.worktreeId]);
  });

  it('rejects traversal, absolute paths, drive letters, and invalid IDs before Git', async () => {
    const setup = await fixture();
    const before = setup.git.calls.length;
    expect(await createWorktree({ ...config(), worktreeId: '../escape' }, setup.options)).toMatchObject({ ok: false, reason: 'invalid-worktree-id' });
    expect(await createWorktree({ ...config(), parentDir: '../escape' }, setup.options)).toMatchObject({ ok: false, reason: 'path-outside-safe-root' });
    expect(await createWorktree({ ...config(), parentDir: 'C:\\escape' }, setup.options)).toMatchObject({ ok: false, reason: 'path-outside-safe-root' });
    expect(setup.git.calls).toHaveLength(before);
  });

  it('normalizes mixed Windows path separators to one absolute path', async () => {
    const setup = await fixture();
    const handle = await createdHandle(setup, { parentDir: '.fable5\\worktrees' });
    expect(handle.path).toBe(resolve(setup.root, '.fable5', 'worktrees', 'unit-one'));
    expect(handle.metadataPath).toBe(resolve(setup.metadataRoot, 'unit-one.meta.json'));
  });

  it('returns JSON-serializable structured union members', async () => {
    const setup = await fixture();
    const created = await createWorktree(config(), setup.options);
    expect(() => JSON.parse(JSON.stringify(created))).not.toThrow();
    if (!created.ok) throw new Error('expected create success');
    setup.git.dirtyPaths.add(created.handle.path);
    const refused = await removeWorktree(created.handle, setup.options);
    expect(JSON.parse(JSON.stringify(refused))).toEqual({ ok: false, reason: 'dirty-refused' });
  });
});
