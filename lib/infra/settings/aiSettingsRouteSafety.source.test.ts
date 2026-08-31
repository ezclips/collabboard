import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-wide safety scan across the Phase 2A Settings routes.
 *
 * Behavioural proof lives in the route tests; this is the structural backstop
 * that a future edit cannot quietly reintroduce secret material into a
 * response, log a request body, or open a custom-endpoint surface.
 */

const ROOT = resolve(__dirname, '../../..');

const ROUTES = [
  'app/api/settings/ai-providers/route.ts',
  'app/api/settings/ai-providers/[id]/route.ts',
  'app/api/settings/ai-providers/[id]/key/route.ts',
  'app/api/settings/ai-providers/[id]/test/route.ts',
  'app/api/settings/ai-roles/route.ts',
] as const;

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

/** Statements only: the routes' comments discuss keys and ciphertext by design. */
function code(relativePath: string): string {
  return source(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/**
 * Every `NextResponse.json(...)` payload in a file. Encrypting into a local
 * `apiKeyEncrypted` variable is correct and expected -- what must never happen
 * is that value (or any sibling) reaching a response, so the assertions below
 * look at what is actually serialized rather than at the whole file.
 */
function responsePayloads(relativePath: string): readonly string[] {
  return [...code(relativePath).matchAll(/NextResponse\.json\(([\s\S]*?)\)\s*;/g)].map((m) => m[1]);
}

describe('Phase 2A settings routes -- response safety', () => {
  for (const route of ROUTES) {
    it(`1. ${route} never serializes credential material`, () => {
      const payloads = responsePayloads(route);
      expect(payloads.length).toBeGreaterThan(0);
      for (const payload of payloads) {
        expect(payload).not.toMatch(/api_key|apiKey|encrypted|ciphertext|credential\.value/i);
      }
    });

    it(`2. ${route} never logs or echoes the request body`, () => {
      const body = code(route);
      expect(body).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(body).not.toMatch(/JSON\.stringify\(\s*(body|parsed|request)/);
    });

    it(`3. ${route} derives the user from the authenticated session`, () => {
      const body = code(route);
      expect(body).toContain('authenticateSettingsRequest');
      // No route may read an identity from the payload.
      expect(body).not.toMatch(/body\.userId|parsed\.data\.userId|\.user_id\s*=\s*body/);
    });

    it(`4. ${route} introduces no custom endpoint surface`, () => {
      expect(code(route)).not.toMatch(/base_url|baseUrl|endpoint\s*:/i);
    });
  }
});

describe('Phase 2A settings routes -- ordering guarantees', () => {
  it('5. create encrypts before it calls the database', () => {
    const body = code('app/api/settings/ai-providers/route.ts');
    expect(body.indexOf('encryptAICredential')).toBeGreaterThan(-1);
    expect(body.indexOf('encryptAICredential')).toBeLessThan(body.indexOf('createConnectionWithCredential'));
  });

  it('6. key replacement encrypts before it calls the database', () => {
    const body = code('app/api/settings/ai-providers/[id]/key/route.ts');
    expect(body.indexOf('encryptAICredential')).toBeLessThan(body.indexOf('replaceCredential'));
  });

  it('7. only the test route reaches a provider adapter', () => {
    for (const route of ROUTES) {
      const body = code(route);
      const usesAdapter = body.includes('getAIProviderAdapter');
      expect(usesAdapter).toBe(route.endsWith('test/route.ts'));
    }
  });

  it('8. verified_at is never written from a request-supplied value', () => {
    for (const route of ROUTES) {
      expect(code(route)).not.toMatch(/verified_at\s*:|verifiedAt\s*:\s*(body|parsed)/);
    }
  });
});
