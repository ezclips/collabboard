import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural proof for the Phase 2A atomic functions.
 *
 * This repository has no live-database harness, so privilege and transaction
 * behaviour is asserted against the migration SQL rather than executed. That
 * limitation is deliberate and recorded: a real EXECUTE/RLS privilege test
 * needs a DB-integration harness that does not exist yet, and applying this
 * migration is explicitly out of scope for this phase.
 */

const ROOT = resolve(__dirname, '../../..');
const MIGRATION = resolve(ROOT, 'supabase/migrations/20260831140000_add_ai_provider_atomic_functions.sql');
const FOUNDATION = resolve(ROOT, 'supabase/migrations/20260831120000_create_ai_provider_foundation.sql');

const sql = readFileSync(MIGRATION, 'utf8');

/**
 * Executable SQL only. The header comment deliberately explains why these
 * functions are NOT security definers, and a prose mention of the phrase must
 * not read as a definition of one.
 */
const executableSql = sql.replace(/--[^\n]*/g, '');

/** The body of one CREATE FUNCTION block, so assertions cannot drift across functions. */
function functionBlock(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

const CREATE_FN = 'create_ai_provider_connection_atomic';
const REPLACE_FN = 'replace_ai_provider_credential_atomic';

describe('Phase 2A atomic functions -- shape', () => {
  it('1. both functions exist', () => {
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${CREATE_FN}`);
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${REPLACE_FN}`);
  });

  it('2. neither function is SECURITY DEFINER', () => {
    expect(executableSql).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(functionBlock(CREATE_FN)).toMatch(/SECURITY\s+INVOKER/i);
    expect(functionBlock(REPLACE_FN)).toMatch(/SECURITY\s+INVOKER/i);
  });

  it('3. both pin an empty search_path and fully qualify their tables', () => {
    for (const name of [CREATE_FN, REPLACE_FN]) {
      const block = functionBlock(name);
      expect(block).toMatch(/SET\s+search_path\s*=\s*''/);
      expect(block).toContain('public.ai_provider_connections');
    }
    expect(functionBlock(CREATE_FN)).toContain('public.ai_provider_credentials');
    expect(functionBlock(REPLACE_FN)).toContain('public.ai_provider_credentials');
  });

  it('4. neither function accepts a plaintext key parameter', () => {
    for (const name of [CREATE_FN, REPLACE_FN]) {
      const block = functionBlock(name);
      expect(block).toContain('p_api_key_encrypted');
      expect(block).not.toMatch(/p_api_key\b(?!_encrypted)/);
      expect(block).not.toMatch(/p_plain|plaintext_key|p_raw/i);
    }
  });

  it('5. no base URL or custom provider is introduced', () => {
    expect(sql).not.toMatch(/base_url|p_base_url|custom_provider/i);
  });
});

describe('Phase 2A atomic functions -- transactional behaviour', () => {
  it('6. create inserts BOTH rows in one function body', () => {
    const block = functionBlock(CREATE_FN);
    expect(block).toMatch(/INSERT INTO public\.ai_provider_connections/);
    expect(block).toMatch(/INSERT INTO public\.ai_provider_credentials/);
    expect(block).toMatch(/RETURNING id INTO/);
  });

  it('7. replace proves ownership through its WHERE clause', () => {
    const block = functionBlock(REPLACE_FN);
    expect(block).toMatch(/WHERE id = p_connection_id\s+AND user_id = p_user_id/);
    expect(block).toMatch(/IF NOT FOUND THEN\s+RETURN false;/);
  });

  it('8. replace updates the secret and the hint together', () => {
    const block = functionBlock(REPLACE_FN);
    expect(block).toMatch(/SET key_hint = p_key_hint/);
    expect(block).toMatch(/api_key_encrypted = EXCLUDED\.api_key_encrypted/);
  });

  it('9. replace clears verified_at', () => {
    expect(functionBlock(REPLACE_FN)).toMatch(/verified_at = NULL/);
  });
});

describe('Phase 2A atomic functions -- execution privileges', () => {
  const signatures: ReadonlyArray<[string, string]> = [
    [CREATE_FN, 'uuid, text, text, text, text, text'],
    [REPLACE_FN, 'uuid, uuid, text, text'],
  ];

  for (const [name, args] of signatures) {
    const normalized = (value: string) => value.replace(/\s+/g, ' ');
    const flat = normalized(sql);

    it(`10. ${name} revokes EXECUTE from PUBLIC`, () => {
      expect(flat).toContain(normalized(`REVOKE EXECUTE ON FUNCTION public.${name}( ${args} ) FROM PUBLIC`));
    });

    it(`11. ${name} revokes EXECUTE from anon`, () => {
      expect(flat).toContain(normalized(`REVOKE EXECUTE ON FUNCTION public.${name}( ${args} ) FROM anon`));
    });

    it(`12. ${name} revokes EXECUTE from authenticated`, () => {
      expect(flat).toContain(normalized(`REVOKE EXECUTE ON FUNCTION public.${name}( ${args} ) FROM authenticated`));
    });

    it(`13. ${name} grants EXECUTE to service_role only`, () => {
      expect(flat).toContain(normalized(`GRANT EXECUTE ON FUNCTION public.${name}( ${args} ) TO service_role`));
      expect(flat).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[^;]*TO (anon|authenticated|PUBLIC)`));
    });
  }
});

describe('Phase 2A does not disturb the Phase 1A foundation', () => {
  it('14. the foundation migration still splits secrets from metadata', () => {
    const foundation = readFileSync(FOUNDATION, 'utf8');
    expect(foundation).toContain('CREATE TABLE IF NOT EXISTS public.ai_provider_credentials');
    expect(foundation).toContain('REVOKE ALL ON public.ai_provider_credentials FROM authenticated;');
  });

  it('15. the new migration creates no table and alters no existing one', () => {
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });
});
