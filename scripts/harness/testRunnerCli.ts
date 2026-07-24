import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { patchManifestSchema } from './manifestSchema';
import { runManifestCommands } from './testRunner';
import type { TestRunnerCliResult } from './types';

function fail(reason: TestRunnerCliResult extends infer T ? T : never, exitCode = 1): never {
  console.log(JSON.stringify(reason));
  process.exit(exitCode);
}

function parseArgs(argv: readonly string[]): { manifestPath: string; worktreeId?: string; logDir?: string } {
  const [manifestPath, ...rest] = argv;
  if (!manifestPath) {
    fail({ ok: false, reason: 'invalid-arguments', message: 'usage: vite-node scripts/harness/testRunnerCli.ts <manifest-path> [--use-worktree <id>] [--log-dir <path>]' });
  }
  let worktreeId: string | undefined;
  let logDir: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--use-worktree' && rest[index + 1]) {
      worktreeId = rest[index + 1];
      index += 1;
    } else if (arg === '--log-dir' && rest[index + 1]) {
      logDir = rest[index + 1];
      index += 1;
    } else {
      fail({ ok: false, reason: 'invalid-arguments', message: `unknown or incomplete argument: ${arg}` });
    }
  }
  return { manifestPath, worktreeId, logDir };
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = patchManifestSchema.parse(JSON.parse(await readFile(resolve(args.manifestPath), 'utf8')));
    const bundle = await runManifestCommands(manifest, {
      repoRoot: process.cwd(),
      logDir: args.logDir ? resolve(args.logDir) : undefined,
      useOwnedWorktree: args.worktreeId ? { worktreeId: args.worktreeId } : undefined,
    });
    console.log(JSON.stringify(bundle));
    process.exit(bundle.ok ? 0 : 1);
  } catch (error) {
    fail({
      ok: false,
      reason: 'operation-failed',
      message: error instanceof Error ? error.message : 'unable to run manifest commands',
    });
  }
}

void main();
