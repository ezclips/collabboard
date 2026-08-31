import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static analysis of the BYOK foundation migration.
 *
 * LIMITATION, stated deliberately: this repository has no live-database test
 * harness, so these are source-level proofs over the migration SQL rather than
 * executed privilege checks against a running Postgres. They are written
 * structurally -- each table's own CREATE block is sliced out and asserted on
 * in isolation -- so they cannot pass by accident on text that belongs to a
 * different table. A real privilege test belongs in whatever DB-integration
 * harness lands first.
 */

const migrationPath = 'supabase/migrations/20260831120000_create_ai_provider_foundation.sql';
const migration = fs.readFileSync(path.join(process.cwd(), migrationPath), 'utf8');

const domainContract = fs.readFileSync(
  path.join(process.cwd(), 'lib/domain/settings/aiProviderConnection.ts'),
  'utf8',
);

/**
 * The executable SQL with `--` commentary stripped. Absence assertions run
 * against this: the migration's own prose explains what it deliberately omits
 * ("no base URL", "no SECURITY DEFINER"), and matching those explanations
 * would let a comment fail a test that is really about the statements.
 */
const sql = migration
  .split('\n')
  .map((line) => {
    const comment = line.indexOf('--');
    return comment === -1 ? line : line.slice(0, comment);
  })
  .join('\n');

/** The text of one CREATE TABLE statement, from its header to its closing `);`. */
function tableBlock(table: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
  expect(start, `${table} must be created`).toBeGreaterThan(-1);
  const end = sql.indexOf('\n);', start);
  expect(end, `${table} must be a closed statement`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/**
 * Every policy statement targeting one table. Split rather than matched with a
 * spanning regex, so one policy's text can never bleed into the next and make
 * an unrelated command look like it belongs to this table.
 */
function policiesFor(table: string): string[] {
  return sql
    .split('CREATE POLICY')
    .slice(1)
    .map((chunk) => `CREATE POLICY${chunk.slice(0, chunk.indexOf(';') + 1)}`)
    .filter((policy) => policy.includes(`ON public.${table} FOR`));
}

const connections = tableBlock('ai_provider_connections');
const credentials = tableBlock('ai_provider_credentials');
const preferences = tableBlock('ai_role_preferences');

describe('AI provider BYOK foundation migration', () => {
  it('creates exactly the three foundation tables', () => {
    const created = sql.match(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g) ?? [];

    expect(created).toHaveLength(3);
    expect(created.join(' ')).toContain('ai_provider_connections');
    expect(created.join(' ')).toContain('ai_provider_credentials');
    expect(created.join(' ')).toContain('ai_role_preferences');
  });

  it('splits secret material out of the browser-readable metadata table', () => {
    // The metadata table carries no secret of any kind -- not the key, not the
    // ciphertext, and not the IV/tag that would make ciphertext attackable.
    expect(connections).not.toMatch(/api_key/i);
    expect(connections).not.toMatch(/encrypted/i);
    expect(connections).not.toMatch(/\biv\b|auth_tag|nonce/i);
    expect(connections).not.toMatch(/secret|token/i);

    // ...and the secret table carries nothing BUT the secret and its keys.
    expect(credentials).toContain('api_key_encrypted text NOT NULL');
  });

  it('stores no plaintext key column anywhere', () => {
    expect(sql).not.toMatch(/\bapi_key\s+text/);
    expect(sql).not.toMatch(/\bapi_key_plain|plaintext/i);
  });

  it('enables row level security on all three tables', () => {
    for (const table of ['ai_provider_connections', 'ai_provider_credentials', 'ai_role_preferences']) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('gives the credential table NO policy at all -- not even for its owner', () => {
    expect(policiesFor('ai_provider_credentials')).toHaveLength(0);
    expect(sql).not.toMatch(/ON public\.ai_provider_credentials FOR SELECT/);
  });

  it('revokes PostgREST privileges on the credential table from both browser roles', () => {
    expect(sql).toContain('REVOKE ALL ON public.ai_provider_credentials FROM anon;');
    expect(sql).toContain('REVOKE ALL ON public.ai_provider_credentials FROM authenticated;');
  });

  it('exposes no view or function that would leak the ciphertext around those locks', () => {
    expect(sql).not.toMatch(/CREATE\s+(OR REPLACE\s+)?VIEW/i);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);

    const functionBodies = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g) ?? [];
    for (const body of functionBodies) {
      expect(body).not.toContain('api_key_encrypted');
    }
  });

  it('owner-scopes every metadata and preference policy', () => {
    for (const table of ['ai_provider_connections', 'ai_role_preferences']) {
      const policies = policiesFor(table);
      expect(policies).toHaveLength(4);
      for (const policy of policies) {
        expect(policy).toContain('auth.uid() = user_id');
      }
    }
  });

  it('blocks a preference pointing at another user\'s connection at the database level', () => {
    // Enforcement must survive the service role, which bypasses RLS entirely.
    // A trigger does; an RLS WITH CHECK alone would not.
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.ai_role_preferences_enforce_connection_ownership');
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.ai_role_preferences/);
    expect(sql).toMatch(/c\.id = NEW\.connection_id\s*\n\s*AND c\.user_id = NEW\.user_id/);
    expect(sql).toMatch(/RAISE EXCEPTION/);

    // Defence in depth for direct PostgREST writes.
    const writePolicies = policiesFor('ai_role_preferences').filter(
      (policy) => policy.includes('FOR INSERT') || policy.includes('FOR UPDATE'),
    );
    expect(writePolicies).toHaveLength(2);
    for (const policy of writePolicies) {
      expect(policy).toContain('connection_id IS NULL');
      expect(policy).toMatch(/FROM public\.ai_provider_connections c/);
      expect(policy).toMatch(/c\.user_id = auth\.uid\(\)/);
    }
  });

  it('cascades the credential away with its connection, leaving no orphaned ciphertext', () => {
    expect(credentials).toMatch(
      /connection_id uuid PRIMARY KEY REFERENCES public\.ai_provider_connections\(id\) ON DELETE CASCADE/,
    );
  });

  it('resets a preference to CollabBoard Default when its provider is deleted', () => {
    expect(preferences).toMatch(
      /connection_id uuid REFERENCES public\.ai_provider_connections\(id\) ON DELETE SET NULL/,
    );
    // Nullable is what makes "no provider chosen" representable at all.
    expect(preferences).not.toMatch(/connection_id uuid NOT NULL/);
  });

  it('cascades everything from the owning auth user', () => {
    expect(connections).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
    expect(preferences).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
  });

  it('admits only the four shipped provider types, and no custom endpoint', () => {
    expect(connections).toContain(
      "provider_type text NOT NULL CHECK (provider_type IN ('openai', 'anthropic', 'gemini', 'openrouter'))",
    );
    expect(sql).not.toMatch(/custom/i);
    expect(sql).not.toMatch(/base_url|baseurl|endpoint_url/i);
    expect(domainContract).not.toMatch(/base_?url/i);
  });

  it('never materialises CollabBoard Default as a provider row', () => {
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/deepseek/i);
    expect(sql).not.toMatch(/collabboard[_-]?default/i);
  });

  it('keeps role a plain text column so future roles need no migration', () => {
    expect(sql).not.toMatch(/CREATE TYPE/i);
    expect(preferences).toContain('role text NOT NULL');
    expect(preferences).toContain('PRIMARY KEY (user_id, role)');
    // Roles are an application concern; the schema must not pin the list.
    expect(preferences).not.toMatch(/role[^\n]*CHECK[^\n]*IN \(/);
  });

  it('bounds the masked hint too tightly to ever hold a usable key', () => {
    expect(connections).toContain('CHECK (length(key_hint) BETWEEN 1 AND 4)');
  });

  it('bounds the free-text columns without assuming a provider key format', () => {
    expect(connections).toMatch(/length\(btrim\(display_name\)\) > 0 AND length\(display_name\) <= 120/);
    expect(connections).toMatch(/default_model IS NULL OR/);
    expect(preferences).toMatch(/model_id IS NULL OR/);
    expect(connections).toContain('UNIQUE (user_id, display_name)');
    // No provider-specific prefix assumptions belong in the database.
    expect(sql).not.toMatch(/'sk-|sk_live|Bearer /);
  });
});
