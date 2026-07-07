import fs from 'fs';
import path from 'path';

// E2E credentials come from process.env, falling back to .env.local so local
// runs need no extra setup. Values are never hardcoded here (PATCH-001).
function readEnvLocal(key: string): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return (match?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

// E2E_SKIP_CREDENTIALS=1 forces the "no credentials" path (used to verify
// that authenticated suites skip cleanly, e.g. on CI without secrets).
const forceSkip = process.env.E2E_SKIP_CREDENTIALS === '1';

export const E2E_EMAIL = forceSkip ? '' : process.env.E2E_EMAIL || readEnvLocal('E2E_EMAIL');
export const E2E_PASSWORD = forceSkip ? '' : process.env.E2E_PASSWORD || readEnvLocal('E2E_PASSWORD');

export const hasE2ECredentials = Boolean(E2E_EMAIL && E2E_PASSWORD);

export const AUTH_STATE_PATH = 'e2e/.auth/user.json';
