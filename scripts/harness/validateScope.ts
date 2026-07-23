import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { patchManifestSchema } from './manifestSchema';
import { validateScope } from './scopeValidator';

async function main(): Promise<void> {
  const [manifestPath, flag, expectedHead] = process.argv.slice(2);
  if (!manifestPath || (flag && flag !== '--expected-head')) throw new Error('usage: validateScope <manifest-path> [--expected-head <sha>]');
  const manifest = patchManifestSchema.parse(JSON.parse(await readFile(resolve(manifestPath), 'utf8')));
  const result = await validateScope(manifest, { repoRoot: process.cwd(), expectedHead: flag ? expectedHead : undefined });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => { process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'unknown error' })}\n`); process.exitCode = 1; });
