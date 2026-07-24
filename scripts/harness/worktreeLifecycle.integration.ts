import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createWorktree, isWorktreeDirty, removeWorktree } from './worktreeLifecycle';

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function git(cwd: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile('git', [...args], { cwd, windowsHide: true }, (error, stdout, stderr) => {
      resolveResult({
        code: error ? Number((error as unknown as { code?: number }).code ?? 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr),
      });
    });
  });
}

const fixtureRoot = await mkdtemp(join(tmpdir(), 'patch-107-integration-'));
let result: Record<string, unknown>;

try {
  assert.equal((await git(fixtureRoot, ['init'])).code, 0);
  assert.equal((await git(fixtureRoot, ['config', 'user.email', 'patch-107@example.invalid'])).code, 0);
  assert.equal((await git(fixtureRoot, ['config', 'user.name', 'PATCH-107 Fixture'])).code, 0);
  await writeFile(join(fixtureRoot, '.gitignore'), '.fable5/worktrees/\n', 'utf8');
  await writeFile(join(fixtureRoot, 'fixture.txt'), 'main fixture\n', 'utf8');
  assert.equal((await git(fixtureRoot, ['add', '.gitignore', 'fixture.txt'])).code, 0);
  assert.equal((await git(fixtureRoot, ['commit', '-m', 'fixture base'])).code, 0);
  const base = (await git(fixtureRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  assert.match(base, /^[0-9a-f]{40}$/);

  const metadataRoot = join(fixtureRoot, '.fable5', 'worktrees');
  const options = { repoRoot: fixtureRoot, metadataRoot };
  const created = await createWorktree({
    baseCommit: base,
    worktreeId: 'integration',
    parentDir: '.fable5/worktrees',
    branchName: 'harness/worktree/integration',
    portCount: 1,
  }, options);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('worktree creation failed');

  const metadata = JSON.parse(await readFile(created.handle.metadataPath, 'utf8')) as { ownedByHarness?: unknown };
  assert.equal(metadata.ownedByHarness, true);
  await writeFile(join(created.handle.path, 'fixture.txt'), 'isolated edit\n', 'utf8');
  assert.equal(await readFile(join(fixtureRoot, 'fixture.txt'), 'utf8'), 'main fixture\n');
  assert.equal(await isWorktreeDirty(created.handle, options), true);
  assert.equal((await git(fixtureRoot, ['status', '--porcelain', '--untracked-files=all'])).stdout, '');
  assert.match((await git(created.handle.path, ['status', '--porcelain', '--untracked-files=all'])).stdout, /fixture\.txt/);

  await writeFile(join(created.handle.path, 'fixture.txt'), 'main fixture\n', 'utf8');
  assert.equal(await isWorktreeDirty(created.handle, options), false);
  assert.deepEqual(await removeWorktree(created.handle, options), { ok: true, reason: 'removed' });
  const remainingWorktreePaths = (await git(fixtureRoot, ['worktree', 'list', '--porcelain'])).stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => resolve(line.slice('worktree '.length)));
  assert.equal(remainingWorktreePaths.some((path) => path === resolve(created.handle.path)), false);
  assert.equal((await git(fixtureRoot, ['branch', '--list', 'harness/worktree/integration'])).stdout.trim(), '');
  await assert.rejects(stat(created.handle.path), { code: 'ENOENT' });
  await assert.rejects(stat(created.handle.metadataPath), { code: 'ENOENT' });

  result = {
    ok: true,
    fixtureInitialized: true,
    baseCommit: base,
    worktreeCreated: true,
    isolationProven: true,
    mainStatusClean: true,
    worktreeStatusIndependent: true,
    ownershipMetadataProven: true,
    allocatedPorts: created.handle.allocatedPorts,
    worktreeRemoved: true,
    branchRemoved: true,
    metadataRemoved: true,
    worktreeDirectoryRemoved: true,
  };
} catch (error) {
  result = { ok: false, error: error instanceof Error ? error.message : 'unknown integration failure' };
  process.exitCode = 1;
} finally {
  const canonicalFixture = await realpath(fixtureRoot);
  const canonicalTemp = await realpath(tmpdir());
  const fixtureRelative = relative(canonicalTemp, canonicalFixture);
  if (!fixtureRelative || fixtureRelative.startsWith('..') || resolve(canonicalTemp, fixtureRelative) !== canonicalFixture) {
    throw new Error('refusing to clean a fixture outside the system temporary directory');
  }
  await rm(canonicalFixture, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ ...result, fixtureDirectoryRemoved: true })}\n`);
