import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { patchManifestSchema } from './manifestSchema';
import { validateEvidenceBundle } from './evidenceValidator';
import type { EvidenceValidatorCliResult } from './types';

function printAndExit(result: EvidenceValidatorCliResult): never {
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

function parseArgs(argv: readonly string[]): { manifestPath: string; bundlePath: string; evidenceRoot?: string } {
  const positional: string[] = [];
  const seen = new Set<string>();
  let evidenceRoot: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence-root') {
      if (seen.has(arg)) printAndExit({ ok: false, reason: 'invalid-arguments', message: 'duplicate argument: --evidence-root' });
      seen.add(arg);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) printAndExit({ ok: false, reason: 'invalid-arguments', message: 'missing value for --evidence-root' });
      evidenceRoot = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) printAndExit({ ok: false, reason: 'invalid-arguments', message: `unknown argument: ${arg}` });
    positional.push(arg);
  }
  if (positional.length !== 2) {
    printAndExit({ ok: false, reason: 'invalid-arguments', message: 'usage: vite-node scripts/harness/evidenceValidatorCli.ts <manifest-path> <evidence-bundle-path> [--evidence-root <path>]' });
  }
  return { manifestPath: positional[0], bundlePath: positional[1], evidenceRoot };
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = patchManifestSchema.parse(JSON.parse(await readFile(resolve(args.manifestPath), 'utf8')));
    const bundle = JSON.parse(await readFile(resolve(args.bundlePath), 'utf8')) as unknown;
    const result = await validateEvidenceBundle(manifest, bundle, {
      evidenceRoot: args.evidenceRoot ? resolve(args.evidenceRoot) : resolve(process.cwd(), '.fable5/evidence'),
    });
    printAndExit(result);
  } catch (error) {
    printAndExit({ ok: false, reason: 'operation-failed', message: error instanceof Error ? error.message : 'unable to validate evidence bundle' });
  }
}

void main();
