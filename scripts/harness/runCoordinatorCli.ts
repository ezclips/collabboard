import { resolve } from 'node:path';
import { runCoordinated } from './runCoordinator';
import type { CoordinatorCliResult } from './types';

function printAndExit(result: CoordinatorCliResult): never {
  console.log(JSON.stringify(result));
  process.exit(result.reason === 'completed' && result.ok ? 0 : 1);
}

function parseArgs(argv: readonly string[]): {
  readonly patchId?: string;
  readonly manifestPath?: string;
  readonly isolated?: boolean;
  readonly worktreeId?: string;
  readonly logDir?: string;
} {
  const parsed: {
    patchId?: string;
    manifestPath?: string;
    isolated?: boolean;
    worktreeId?: string;
    logDir?: string;
  } = {};
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (seen.has(arg)) {
      printAndExit({ ok: false, reason: 'invalid-arguments', message: `duplicate argument: ${arg}` });
    }
    if (arg === '--patch' || arg === '--manifest' || arg === '--worktree-id' || arg === '--log-dir') {
      seen.add(arg);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        printAndExit({ ok: false, reason: 'invalid-arguments', message: `missing value for ${arg}` });
      }
      if (arg === '--patch') parsed.patchId = value;
      if (arg === '--manifest') parsed.manifestPath = value;
      if (arg === '--worktree-id') parsed.worktreeId = value;
      if (arg === '--log-dir') parsed.logDir = value;
      index += 1;
      continue;
    }
    if (arg === '--isolated') {
      seen.add(arg);
      parsed.isolated = true;
      continue;
    }
    printAndExit({ ok: false, reason: 'invalid-arguments', message: `unknown argument: ${arg}` });
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await runCoordinated({
      repoRoot: process.cwd(),
      patchId: args.patchId,
      manifestPath: args.manifestPath,
      isolated: args.isolated,
      worktreeId: args.worktreeId,
      logDir: args.logDir ? resolve(args.logDir) : undefined,
    });
    printAndExit(result);
  } catch (error) {
    printAndExit({ ok: false, reason: 'invalid-arguments', message: error instanceof Error ? error.message : 'coordinator failed' });
  }
}

void main();
