import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * BYOK Phase 2A: lib/server must be unreachable from client bundles.
 *
 * lib/server holds plaintext provider API keys, the credential master key and
 * the service-role client. Until now that was protected only by convention.
 *
 * These assertions run the REAL boundary config through ESLint's own API over
 * synthetic sources, rather than reading the config and hoping -- a grep would
 * prove the rule is written, not that it fires.
 */

const ROOT = resolve(__dirname, '../../..');
const CONFIG = resolve(ROOT, 'eslint.boundaries.config.mjs');

async function lint(filePath: string, source: string): Promise<readonly string[]> {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: CONFIG,
    warnIgnored: false,
  });
  const results = await eslint.lintText(source, { filePath });
  return results.flatMap((result) => result.messages.map((message) => message.message));
}

const SERVER_IMPORT_ALIAS = [
  "import { encryptAICredential } from '@/lib/server/ai/credentialCipher';",
  'export function Probe(): string { return encryptAICredential("x"); }',
  '',
].join('\n');

const SERVER_IMPORT_RELATIVE = [
  "import { encryptAICredential } from '../../lib/server/ai/credentialCipher';",
  'export function Probe(): string { return encryptAICredential("x"); }',
  '',
].join('\n');

const ALLOWED_IMPORT = [
  "import { AI_PROVIDER_TYPES } from '@/lib/domain/settings/aiProviderConnection';",
  'export function Probe(): number { return AI_PROVIDER_TYPES.length; }',
  '',
].join('\n');

describe('server-only import boundary', () => {
  it('1. a component importing lib/server by alias is rejected', async () => {
    const messages = await lint(resolve(ROOT, 'components/Probe.tsx'), SERVER_IMPORT_ALIAS);
    expect(messages.join('\n')).toMatch(/lib\/server/);
  });

  it('2. a relative-path import of lib/server is rejected too', async () => {
    const messages = await lint(resolve(ROOT, 'components/Probe.tsx'), SERVER_IMPORT_RELATIVE);
    expect(messages.join('\n')).toMatch(/lib\/server/);
  });

  it('3. an app/ page importing lib/server is rejected', async () => {
    const messages = await lint(resolve(ROOT, 'app/dashboard/settings/ai/Probe.tsx'), SERVER_IMPORT_ALIAS);
    expect(messages.join('\n')).toMatch(/lib\/server/);
  });

  it('4. a component importing only domain code still passes', async () => {
    const messages = await lint(resolve(ROOT, 'components/Probe.tsx'), ALLOWED_IMPORT);
    expect(messages).toEqual([]);
  });

  it('5. an API route handler may still import lib/server', async () => {
    // The global ignores exempt app/api/** and **/route.ts -- the intended
    // path is UI -> fetch -> route handler -> lib/server, so the gate must not
    // break the one place server code is legitimately reachable.
    const messages = await lint(
      resolve(ROOT, 'app/api/settings/ai-providers/route.ts'),
      SERVER_IMPORT_ALIAS,
    );
    expect(messages).toEqual([]);
  });

  it('6. the supabase freeze rule is still enforced alongside it', async () => {
    const messages = await lint(
      resolve(ROOT, 'components/Probe.tsx'),
      "import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n",
    );
    expect(messages.join('\n')).toMatch(/Supabase/i);
  });

  it('7. the config states why the ban exists', () => {
    expect(readFileSync(CONFIG, 'utf8')).toMatch(/lib\/server/);
  });
});
