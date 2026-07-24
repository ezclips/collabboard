import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import type {
  OwnedWorktreeHandle,
  WorktreeConfig,
  WorktreeCreateResult,
  WorktreeLifecycleOptions,
  WorktreeRemoveResult,
} from './types';

export type {
  OwnedWorktreeHandle,
  WorktreeConfig,
  WorktreeCreateResult,
  WorktreeLifecycleOptions,
  WorktreeRemoveResult,
} from './types';

export interface GitCommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type GitCommandRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<GitCommandResult>;

export interface WorktreeLifecycleTestSeams {
  readonly commandRunner?: GitCommandRunner;
  readonly allocatePort?: () => Promise<number>;
}

type LifecycleOptions = WorktreeLifecycleOptions & {
  readonly testSeams?: WorktreeLifecycleTestSeams;
};

interface OwnershipRecord {
  readonly worktreeId: string;
  readonly path: string;
  readonly branchName: string | null;
  readonly baseCommit: string;
  readonly createdAt: string;
  readonly ownedByHarness: true;
  readonly allocatedPorts: readonly number[];
}

const WORKTREE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BRANCH_PATTERN = /^harness\/worktree\/[a-z0-9][a-z0-9-]{0,63}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const PORT_ATTEMPTS = 3;

function defaultCommandRunner(args: readonly string[], cwd: string): Promise<GitCommandResult> {
  return new Promise((resolveResult) => {
    execFile('git', [...args], { cwd, windowsHide: true }, (error, stdout, stderr) => {
      const code = typeof (error as NodeJS.ErrnoException | null)?.code === 'number'
        ? (error as unknown as { code: number }).code
        : error
          ? 1
          : 0;
      resolveResult({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function defaultAllocatePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address !== 'object' || address === null || address.port === 0) {
          reject(new Error('the OS did not return an ephemeral port'));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function runnerFor(options: LifecycleOptions): GitCommandRunner {
  return options.testSeams?.commandRunner ?? defaultCommandRunner;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left).replace(/[\\/]+$/, '');
  const normalizedRight = resolve(right).replace(/[\\/]+$/, '');
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

function hasTraversalOrAbsoluteSyntax(value: string): boolean {
  return value.includes('\0')
    || isAbsolute(value)
    || win32.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
    || value.split(/[\\/]/).includes('..');
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function canonicalize(path: string): Promise<string> {
  let existingAncestor = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(existingAncestor), ...missingSegments);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      missingSegments.unshift(basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}

async function canonicalOptions(options: LifecycleOptions): Promise<{ repoRoot: string; metadataRoot: string }> {
  const repoRoot = await canonicalize(options.repoRoot);
  const metadataRoot = await canonicalize(options.metadataRoot);
  if (!isWithin(repoRoot, metadataRoot)) {
    throw new Error('metadataRoot must be inside repoRoot');
  }
  return { repoRoot, metadataRoot };
}

function ownershipRecord(handle: OwnedWorktreeHandle): OwnershipRecord {
  return {
    worktreeId: handle.worktreeId,
    path: handle.path,
    branchName: handle.branchName,
    baseCommit: handle.baseCommit,
    createdAt: handle.createdAt,
    ownedByHarness: true,
    allocatedPorts: [...handle.allocatedPorts],
  };
}

function isOwnershipRecord(value: unknown): value is OwnershipRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const expectedKeys = ['allocatedPorts', 'baseCommit', 'branchName', 'createdAt', 'ownedByHarness', 'path', 'worktreeId'];
  const actualKeys = Object.keys(record).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && typeof record.worktreeId === 'string'
    && WORKTREE_ID_PATTERN.test(record.worktreeId)
    && typeof record.path === 'string'
    && (record.branchName === null || (typeof record.branchName === 'string' && BRANCH_PATTERN.test(record.branchName)))
    && typeof record.baseCommit === 'string'
    && COMMIT_PATTERN.test(record.baseCommit)
    && typeof record.createdAt === 'string'
    && !Number.isNaN(Date.parse(record.createdAt))
    && record.ownedByHarness === true
    && Array.isArray(record.allocatedPorts)
    && record.allocatedPorts.every((port) => Number.isInteger(port) && port > 0 && port <= 65_535)
    && new Set(record.allocatedPorts).size === record.allocatedPorts.length;
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function readOwnedHandle(metadataPath: string, roots: { repoRoot: string; metadataRoot: string }): Promise<OwnedWorktreeHandle> {
  const expectedMetadataPath = await canonicalize(metadataPath);
  if (!isWithin(roots.metadataRoot, expectedMetadataPath)) {
    throw new Error('ownership metadata is outside metadataRoot');
  }
  const parsed = JSON.parse(await readFile(expectedMetadataPath, 'utf8')) as unknown;
  if (!isOwnershipRecord(parsed)) throw new Error(`invalid ownership metadata: ${expectedMetadataPath}`);
  const expectedName = `${parsed.worktreeId}.meta.json`;
  if (basename(expectedMetadataPath) !== expectedName) throw new Error(`ownership metadata filename mismatch: ${expectedMetadataPath}`);
  const canonicalPath = await canonicalize(parsed.path);
  if (!samePath(canonicalPath, parsed.path) || !isWithin(roots.repoRoot, canonicalPath)) {
    throw new Error(`ownership path is not canonical and repository-scoped: ${expectedMetadataPath}`);
  }
  return { ...parsed, allocatedPorts: [...parsed.allocatedPorts], metadataPath: expectedMetadataPath };
}

async function allocateDistinctPorts(count: number, options: LifecycleOptions): Promise<readonly number[]> {
  if (!Number.isInteger(count) || count < 0 || count > 64) {
    throw new Error('portCount must be an integer from 0 through 64');
  }
  const allocate = options.testSeams?.allocatePort ?? defaultAllocatePort;
  const ports = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    let allocated = false;
    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
      const port = await allocate();
      if (Number.isInteger(port) && port > 0 && port <= 65_535 && !ports.has(port)) {
        ports.add(port);
        allocated = true;
        break;
      }
    }
    if (!allocated) throw new Error(`unable to allocate distinct port ${index + 1} after ${PORT_ATTEMPTS} attempts`);
  }
  return [...ports];
}

async function resolveEnvironmentFiles(
  files: readonly string[],
  repoRoot: string,
  targetPath: string,
): Promise<readonly { source: string; destination: string }[]> {
  const resolvedFiles: { source: string; destination: string }[] = [];
  for (const file of files) {
    if (!file || hasTraversalOrAbsoluteSyntax(file) || /[*?[\]]/.test(file)) {
      throw new Error(`environment file must be an exact repository-relative filename: ${file}`);
    }
    const source = resolve(repoRoot, file);
    const destination = resolve(targetPath, file);
    if (!isWithin(repoRoot, source) || !isWithin(targetPath, destination) || file.split(/[\\/]/)[0] === '.git') {
      throw new Error(`environment file is outside the allowed repository scope: ${file}`);
    }
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile()) throw new Error(`environment file is not a regular file: ${file}`);
    resolvedFiles.push({ source, destination });
  }
  return resolvedFiles;
}

async function mainWorktreePath(repoRoot: string, runGit: GitCommandRunner): Promise<string> {
  const result = await runGit(['rev-parse', '--show-toplevel'], repoRoot);
  if (result.code !== 0 || !result.stdout.trim()) throw new Error('unable to resolve the main worktree');
  return canonicalize(result.stdout.trim());
}

export async function createWorktree(
  config: WorktreeConfig,
  options: LifecycleOptions,
): Promise<WorktreeCreateResult> {
  if (!WORKTREE_ID_PATTERN.test(config.worktreeId)) {
    return { ok: false, reason: 'invalid-worktree-id', message: 'worktreeId must match ^[a-z0-9][a-z0-9-]{0,63}$' };
  }
  if (!COMMIT_PATTERN.test(config.baseCommit)) {
    return { ok: false, reason: 'invalid-base-commit', message: 'baseCommit must be a 40-character lowercase hexadecimal commit ID' };
  }
  if (!config.parentDir || hasTraversalOrAbsoluteSyntax(config.parentDir)) {
    return { ok: false, reason: 'path-outside-safe-root', message: 'parentDir must be a non-traversing repository-relative path' };
  }
  if (config.branchName !== undefined && !BRANCH_PATTERN.test(config.branchName)) {
    return { ok: false, reason: 'git-worktree-add-failed', message: 'branchName must match ^harness/worktree/[a-z0-9][a-z0-9-]{0,63}$' };
  }

  let roots: { repoRoot: string; metadataRoot: string };
  try {
    roots = await canonicalOptions(options);
  } catch (error) {
    return { ok: false, reason: 'path-outside-safe-root', message: error instanceof Error ? error.message : 'invalid repository paths' };
  }
  const runGit = runnerFor(options);
  const parentPath = await canonicalize(resolve(roots.repoRoot, config.parentDir));
  const targetPath = resolve(parentPath, config.worktreeId);
  const metadataPath = resolve(roots.metadataRoot, `${config.worktreeId}.meta.json`);
  if (!isWithin(roots.repoRoot, parentPath) || !isWithin(roots.repoRoot, targetPath) || !isWithin(roots.metadataRoot, metadataPath)) {
    return { ok: false, reason: 'path-outside-safe-root', message: 'worktree path must remain inside repoRoot' };
  }

  try {
    const mainPath = await mainWorktreePath(roots.repoRoot, runGit);
    if (samePath(targetPath, mainPath)) {
      return { ok: false, reason: 'git-worktree-add-failed', message: 'the main worktree cannot be a create target' };
    }
  } catch (error) {
    return { ok: false, reason: 'git-worktree-add-failed', message: error instanceof Error ? error.message : 'unable to protect the main worktree' };
  }

  if (await exists(targetPath) || await exists(metadataPath)) {
    return { ok: false, reason: 'path-collision', path: targetPath };
  }
  const base = await runGit(['cat-file', '-e', `${config.baseCommit}^{commit}`], roots.repoRoot);
  if (base.code !== 0) {
    return { ok: false, reason: 'invalid-base-commit', message: 'baseCommit does not resolve to a commit' };
  }
  if (config.branchName) {
    const branch = await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${config.branchName}`], roots.repoRoot);
    if (branch.code === 0) return { ok: false, reason: 'branch-collision', branchName: config.branchName };
    if (branch.code !== 1) {
      return { ok: false, reason: 'git-worktree-add-failed', message: 'unable to determine whether the requested branch already exists' };
    }
  }

  let allocatedPorts: readonly number[];
  let environmentFiles: readonly { source: string; destination: string }[];
  try {
    allocatedPorts = await allocateDistinctPorts(config.portCount ?? 0, options);
  } catch (error) {
    return { ok: false, reason: 'port-allocation-failed', message: error instanceof Error ? error.message : 'unable to allocate ports' };
  }
  try {
    environmentFiles = await resolveEnvironmentFiles(config.envFilesToCopy ?? [], roots.repoRoot, targetPath);
  } catch (error) {
    return { ok: false, reason: 'path-outside-safe-root', message: error instanceof Error ? error.message : 'invalid environment file allowlist' };
  }

  const handle: OwnedWorktreeHandle = {
    worktreeId: config.worktreeId,
    path: targetPath,
    branchName: config.branchName ?? null,
    baseCommit: config.baseCommit,
    createdAt: new Date().toISOString(),
    ownedByHarness: true,
    allocatedPorts,
    metadataPath,
  };

  try {
    await atomicWriteJson(metadataPath, ownershipRecord(handle));
    const args = config.branchName
      ? ['worktree', 'add', '-b', config.branchName, targetPath, config.baseCommit]
      : ['worktree', 'add', '--detach', targetPath, config.baseCommit];
    const added = await runGit(args, roots.repoRoot);
    if (added.code !== 0) {
      await rm(metadataPath, { force: true });
      return { ok: false, reason: 'git-worktree-add-failed', message: added.stderr.trim() || 'git worktree add failed' };
    }
    for (const file of environmentFiles) {
      await mkdir(dirname(file.destination), { recursive: true });
      await copyFile(file.source, file.destination);
    }
    return { ok: true, reason: 'created', handle };
  } catch (error) {
    const removal = await runGit(['worktree', 'remove', '--force', targetPath], roots.repoRoot);
    if (config.branchName && removal.code === 0) {
      await runGit(['branch', '-D', config.branchName], roots.repoRoot);
    }
    await rm(metadataPath, { force: true });
    return { ok: false, reason: 'git-worktree-add-failed', message: error instanceof Error ? error.message : 'worktree setup failed' };
  }
}

export async function listOwnedWorktrees(options: LifecycleOptions): Promise<readonly OwnedWorktreeHandle[]> {
  const roots = await canonicalOptions(options);
  if (!await exists(roots.metadataRoot)) return [];
  const names = (await readdir(roots.metadataRoot))
    .filter((name) => name.endsWith('.meta.json'))
    .sort();
  return Promise.all(names.map((name) => readOwnedHandle(resolve(roots.metadataRoot, name), roots)));
}

export async function isWorktreeDirty(
  handle: OwnedWorktreeHandle,
  options: LifecycleOptions,
): Promise<boolean> {
  const roots = await canonicalOptions(options);
  const registered = await readOwnedHandle(handle.metadataPath, roots);
  if (!handlesMatch(handle, registered)) throw new Error('worktree handle does not match its ownership registry entry');
  const status = await runnerFor(options)(['status', '--porcelain', '--untracked-files=all'], registered.path);
  if (status.code !== 0) throw new Error('unable to determine worktree dirty state');
  return status.stdout.length > 0;
}

function handlesMatch(left: OwnedWorktreeHandle, right: OwnedWorktreeHandle): boolean {
  return left.worktreeId === right.worktreeId
    && samePath(left.path, right.path)
    && left.branchName === right.branchName
    && left.baseCommit === right.baseCommit
    && left.createdAt === right.createdAt
    && left.ownedByHarness === true
    && right.ownedByHarness === true
    && samePath(left.metadataPath, right.metadataPath)
    && left.allocatedPorts.length === right.allocatedPorts.length
    && left.allocatedPorts.every((port, index) => port === right.allocatedPorts[index]);
}

export async function removeWorktree(
  handle: OwnedWorktreeHandle,
  options: LifecycleOptions & { readonly force?: boolean },
): Promise<WorktreeRemoveResult> {
  let roots: { repoRoot: string; metadataRoot: string };
  try {
    roots = await canonicalOptions(options);
  } catch {
    return { ok: false, reason: 'not-owned-refused' };
  }
  const runGit = runnerFor(options);
  let mainPath: string;
  try {
    mainPath = await mainWorktreePath(roots.repoRoot, runGit);
  } catch (error) {
    return { ok: false, reason: 'git-worktree-remove-failed', message: error instanceof Error ? error.message : 'unable to protect the main worktree' };
  }
  if (samePath(handle.path, mainPath)) return { ok: false, reason: 'is-main-worktree-refused' };

  let registered: OwnedWorktreeHandle;
  try {
    registered = await readOwnedHandle(handle.metadataPath, roots);
  } catch {
    return { ok: false, reason: 'not-owned-refused' };
  }
  if (!handlesMatch(handle, registered)) return { ok: false, reason: 'not-owned-refused' };
  if (!await exists(registered.path)) return { ok: false, reason: 'not-found' };

  const targetRoot = await runGit(['rev-parse', '--show-toplevel'], registered.path);
  if (targetRoot.code !== 0 || !targetRoot.stdout.trim()) return { ok: false, reason: 'not-found' };
  if (samePath(await canonicalize(targetRoot.stdout.trim()), mainPath)) {
    return { ok: false, reason: 'is-main-worktree-refused' };
  }

  let dirty: boolean;
  try {
    dirty = await isWorktreeDirty(registered, options);
  } catch (error) {
    return { ok: false, reason: 'git-worktree-remove-failed', message: error instanceof Error ? error.message : 'unable to verify worktree state' };
  }
  if (dirty && options.force !== true) return { ok: false, reason: 'dirty-refused' };

  const removeArgs = dirty && options.force === true
    ? ['worktree', 'remove', '--force', registered.path]
    : ['worktree', 'remove', registered.path];
  const removed = await runGit(removeArgs, roots.repoRoot);
  if (removed.code !== 0) {
    return { ok: false, reason: 'git-worktree-remove-failed', message: removed.stderr.trim() || 'git worktree remove failed' };
  }
  if (registered.branchName !== null) {
    if (!BRANCH_PATTERN.test(registered.branchName)) {
      return { ok: false, reason: 'git-worktree-remove-failed', message: 'owned branch is outside the reserved namespace' };
    }
    const branchRemoved = await runGit(['branch', '-D', registered.branchName], roots.repoRoot);
    if (branchRemoved.code !== 0) {
      return { ok: false, reason: 'git-worktree-remove-failed', message: branchRemoved.stderr.trim() || 'owned branch removal failed' };
    }
  }
  await unlink(registered.metadataPath);
  return { ok: true, reason: 'removed' };
}

function worktreePathsFromPorcelain(output: string): readonly string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => resolve(line.slice('worktree '.length).trim()));
}

export async function pruneStaleWorktreeMetadata(
  options: LifecycleOptions,
): Promise<{ readonly prunedCount: number; readonly prunedIds: readonly string[] }> {
  const roots = await canonicalOptions(options);
  const runGit = runnerFor(options);
  const [handles, listed, mainPath] = await Promise.all([
    listOwnedWorktrees(options),
    runGit(['worktree', 'list', '--porcelain'], roots.repoRoot),
    mainWorktreePath(roots.repoRoot, runGit),
  ]);
  if (listed.code !== 0) throw new Error('unable to list Git worktrees');
  const livePaths = worktreePathsFromPorcelain(listed.stdout);
  const prunedIds: string[] = [];
  for (const handle of handles) {
    if (samePath(handle.path, mainPath)) continue;
    if (!livePaths.some((path) => samePath(path, handle.path))) {
      await unlink(handle.metadataPath);
      prunedIds.push(handle.worktreeId);
    }
  }
  return { prunedCount: prunedIds.length, prunedIds };
}
