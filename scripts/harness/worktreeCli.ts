import { resolve } from 'node:path';
import {
  createWorktree,
  listOwnedWorktrees,
  pruneStaleWorktreeMetadata,
  removeWorktree,
} from './worktreeLifecycle';
import type { WorktreeCliResult } from './types';

interface ParsedArguments {
  readonly values: ReadonlyMap<string, string>;
  readonly envFiles: readonly string[];
  readonly force: boolean;
}

function parseArguments(args: readonly string[]): ParsedArguments {
  const values = new Map<string, string>();
  const envFiles: string[] = [];
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force') {
      if (force) throw new Error('--force may be supplied only once');
      force = true;
      continue;
    }
    if (!['--base', '--id', '--branch', '--ports', '--env-file'].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
    index += 1;
    if (argument === '--env-file') {
      envFiles.push(value);
    } else {
      if (values.has(argument)) throw new Error(`${argument} may be supplied only once`);
      values.set(argument, value);
    }
  }
  return { values, envFiles, force };
}

function rejectUnexpected(parsed: ParsedArguments, allowed: readonly string[], allowForce = false): void {
  for (const key of parsed.values.keys()) {
    if (!allowed.includes(key)) throw new Error(`${key} is not valid for this operation`);
  }
  if (parsed.envFiles.length > 0 && !allowed.includes('--env-file')) {
    throw new Error('--env-file is not valid for this operation');
  }
  if (parsed.force && !allowForce) throw new Error('--force is not valid for this operation');
}

function required(parsed: ParsedArguments, key: string): string {
  const value = parsed.values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function writeResult(result: WorktreeCliResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

async function run(): Promise<void> {
  const operation = process.argv[2];
  if (!['create', 'remove', 'list', 'prune'].includes(operation)) {
    throw new Error('usage: worktreeCli <create|remove|list|prune>');
  }
  const parsed = parseArguments(process.argv.slice(3));
  const repoRoot = resolve(process.cwd());
  const options = { repoRoot, metadataRoot: resolve(repoRoot, '.fable5', 'worktrees') };

  if (operation === 'create') {
    rejectUnexpected(parsed, ['--base', '--id', '--branch', '--ports', '--env-file']);
    const portText = parsed.values.get('--ports') ?? '0';
    if (!/^\d+$/.test(portText)) throw new Error('--ports must be a nonnegative integer');
    const result = await createWorktree({
      baseCommit: required(parsed, '--base'),
      worktreeId: required(parsed, '--id'),
      parentDir: '.fable5/worktrees',
      branchName: parsed.values.get('--branch'),
      portCount: Number(portText),
      envFilesToCopy: parsed.envFiles,
    }, options);
    writeResult(result);
    return;
  }

  if (operation === 'remove') {
    rejectUnexpected(parsed, ['--id'], true);
    const id = required(parsed, '--id');
    const handle = (await listOwnedWorktrees(options)).find((candidate) => candidate.worktreeId === id);
    if (!handle) {
      writeResult({ ok: false, reason: 'not-found' });
      return;
    }
    writeResult(await removeWorktree(handle, { ...options, force: parsed.force }));
    return;
  }

  rejectUnexpected(parsed, []);
  if (operation === 'list') {
    writeResult({ ok: true, reason: 'listed', handles: await listOwnedWorktrees(options) });
    return;
  }
  const result = await pruneStaleWorktreeMetadata(options);
  writeResult({ ok: true, reason: 'pruned', ...result });
}

run().catch((error) => {
  writeResult({
    ok: false,
    reason: error instanceof Error && /argument|required|usage|--/.test(error.message)
      ? 'invalid-arguments'
      : 'operation-failed',
    message: error instanceof Error ? error.message : 'unknown worktree lifecycle error',
  });
});
