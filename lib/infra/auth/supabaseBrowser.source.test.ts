import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// AUTH-H1 (P6J-F6 governance style): source-level pins on the browser
// Supabase singleton. Line-comment-only stripping, never the unsafe
// block-comment regex that has previously deleted live code in this repo.
const source = (() => {
  const raw = readFileSync(resolve(process.cwd(), 'lib/supabase/browser.ts'), 'utf8');
  return raw.replace(/^\s*\/\/.*$/gm, '');
})();

function after(text: string, anchor: string, count: number): string {
  const index = text.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return text.slice(index, index + anchor.length + count);
}

describe('AUTH-H1 supabaseBrowser HMR-stable singleton', () => {
  it('A: the browser client is anchored on an HMR-stable global scope, not only a module-local let', () => {
    const scope = after(source, 'const globalScope = window as BrowserGlobalScope;', 200);
    expect(scope).toContain('globalScope[GLOBAL_KEY]');
  });

  it('B: a module-local singleton alone is no longer the sole identity boundary', () => {
    // The server-side fallback is the ONLY plain module-local `let` left; the
    // browser path must go through the global scope instead.
    const browserBranch = after(source, 'export const supabaseBrowser', 900);
    expect(browserBranch).toContain('globalScope[GLOBAL_KEY]');
    expect(browserBranch).not.toMatch(/if \(!supabaseInstance\)/);
  });

  it('C: createClientComponentClient remains the client-side anon/session client', () => {
    expect(source).toContain('createClientComponentClient<any>({');
    expect(source).toContain('import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";');
  });

  it('D: the guarded fetch (circuit breaker) still wraps the client', () => {
    expect(source).toContain('createAuthTokenCircuitBreaker');
    expect(source).toContain('options: { global: { fetch: guardedFetch } }');
  });

  it('E: stale-session cleanup still runs before the first client is created', () => {
    const create = after(source, 'function createBrowserSupabaseClient(): BrowserSupabaseClient {', 300);
    const cleanupIndex = create.indexOf('clearStaleSessionOnLoginPage();');
    const clientIndex = create.indexOf('createClientComponentClient<any>({');
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(clientIndex).toBeGreaterThan(cleanupIndex);
  });

  it('F: no admin client is imported', () => {
    expect(source).not.toContain('getSupabaseAdmin');
    expect(source).not.toContain('createServerComponentClient');
    expect(source).not.toContain('createRouteHandlerClient');
  });

  it('G: no service-role import or secret reference exists', () => {
    for (const forbidden of ['service_role', 'SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('H: no auth token is manually persisted -- only the backoff timestamp goes to storage', () => {
    expect(source).not.toContain('localStorage.setItem');
    expect(source).not.toContain('access_token');
    expect(source).not.toContain('refresh_token');
    // The only storage this module hands to the breaker is localStorage,
    // and the breaker itself (not this file) is what writes to it.
    expect(source).toContain('storage: typeof window !== "undefined" ? window.localStorage : null');
  });
});
