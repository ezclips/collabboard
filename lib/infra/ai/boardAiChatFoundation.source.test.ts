import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static analysis of the Board AI Chat migration.
 *
 * LIMITATION, stated deliberately and in the same terms as
 * aiProviderFoundation.source.test.ts: this repository has no live-database
 * test harness, so these are source-level proofs over the migration SQL rather
 * than executed privilege checks against a running Postgres. Each policy is
 * sliced out and asserted in isolation, so a passing test cannot be satisfied
 * by text belonging to a different policy. Executed RLS proof belongs in
 * whatever DB-integration harness lands first; the migration is not applied in
 * this slice.
 */

const migrationPath = 'supabase/migrations/20260902120000_create_board_ai_chat.sql';
const migration = fs.readFileSync(path.join(process.cwd(), migrationPath), 'utf8');

/** Executable SQL with `--` commentary stripped; the prose explains omissions. */
const sql = migration
  .split('\n')
  .map((line) => {
    const comment = line.indexOf('--');
    return comment === -1 ? line : line.slice(0, comment);
  })
  .join('\n');

function tableBlock(table: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
  expect(start, `${table} must be created`).toBeGreaterThan(-1);
  const end = sql.indexOf('\n);', start);
  expect(end, `${table} must be a closed statement`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function policyBlock(name: string): string {
  const start = sql.indexOf(`CREATE POLICY ${name}`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const next = sql.indexOf('CREATE POLICY', start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

/** The board-read test, exactly as knowledge_documents_select spells it. */
const OWNED_BOARD = 'IN (SELECT id FROM public.boards WHERE user_id = auth.uid())';
const MEMBER_BOARD = 'public.is_board_member(';

describe('board_ai_threads schema', () => {
  const block = tableBlock('board_ai_threads');

  it('is board-scoped and user-owned, and cascades from both', () => {
    expect(block).toContain('board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE');
    expect(block).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
  });

  it('has a nullable title and both timestamps', () => {
    expect(block).toMatch(/\n\s+title text,/);
    expect(block).toContain('created_at timestamptz NOT NULL DEFAULT');
    expect(block).toContain('updated_at timestamptz NOT NULL DEFAULT');
  });

  it('carries no visibility, sharing or author column -- privacy is structural', () => {
    expect(block).not.toMatch(/is_public|shared|visibility|author_id/);
  });
});

describe('board_ai_messages schema', () => {
  const block = tableBlock('board_ai_messages');

  it('inherits ownership through its thread and cascades with it', () => {
    expect(block).toContain('thread_id uuid NOT NULL REFERENCES public.board_ai_threads(id) ON DELETE CASCADE');
    // No second ownership column that could disagree with the thread.
    expect(block).not.toContain('user_id');
    expect(block).not.toContain('board_id');
  });

  it('constrains role with a CHECK rather than a Postgres enum', () => {
    expect(block).toContain("CHECK (role IN ('user', 'assistant'))");
    expect(sql).not.toContain('CREATE TYPE');
  });

  it('has the later slices storage without giving it a shape yet', () => {
    expect(block).toContain('context jsonb');
    expect(block).toContain('citations jsonb');
  });

  it('stores provider and model as plain informational text', () => {
    expect(block).toMatch(/\n\s+provider text,/);
    expect(block).toMatch(/\n\s+model text,/);
  });

  it('persists no credential or session material of any kind', () => {
    for (const forbidden of [
      'api_key', 'apikey', 'encrypted', 'ciphertext', 'key_hint',
      'jwt', 'token', 'cookie', 'signed_url', 'endpoint', 'base_url',
    ]) {
      expect(sql.toLowerCase(), `${forbidden} must never be a chat column`).not.toContain(forbidden);
    }
  });
});

describe('RLS is enabled on both tables', () => {
  it('enables row level security', () => {
    expect(sql).toContain('ALTER TABLE public.board_ai_threads ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.board_ai_messages ENABLE ROW LEVEL SECURITY');
  });

  it('adds no SECURITY DEFINER function and no service-role escape', () => {
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).not.toContain('CREATE FUNCTION');
    expect(sql).not.toContain('service_role');
    expect(sql).not.toContain('CREATE TRIGGER');
  });

  it('grants every policy to authenticated only', () => {
    const policies = sql.match(/CREATE POLICY \w+/g) ?? [];
    expect(policies.length, 'four thread and four message policies').toBe(8);
    for (const policy of policies) {
      expect(policyBlock(policy.replace('CREATE POLICY ', ''))).toContain('TO authenticated');
    }
  });
});

describe('A/B/C. thread policies require ownership AND current board read', () => {
  for (const name of [
    'board_ai_threads_select',
    'board_ai_threads_insert',
    'board_ai_threads_update',
    'board_ai_threads_delete',
  ]) {
    it(`${name} tests both conditions`, () => {
      const block = policyBlock(name);
      // Ownership: a collaborator on the same board cannot reach another
      // user's thread, and an insert cannot name someone else's user_id.
      expect(block).toContain('user_id = auth.uid()');
      // Current board readability, re-evaluated on every statement.
      expect(block).toContain(OWNED_BOARD);
      expect(block).toContain(MEMBER_BOARD);
      // Joined with AND, never OR: either alone would be a leak.
      expect(block).toMatch(/user_id = auth\.uid\(\)\s*\n\s*AND \(/);
    });
  }

  it('insert and update both carry a WITH CHECK, so ownership cannot be given away', () => {
    expect(policyBlock('board_ai_threads_insert')).toContain('WITH CHECK');
    const update = policyBlock('board_ai_threads_update');
    expect(update).toContain('USING');
    expect(update).toContain('WITH CHECK');
  });

  it('uses no legacy workspace permission function', () => {
    // knowledgeBoardReadAuthorization documents these as wrong for this schema.
    expect(sql).not.toContain('get_board_permission');
    expect(sql).not.toContain('get_workspace_role');
    expect(sql).not.toContain('workspace_id');
  });
});

describe('D/E. message policies re-check the thread AND the board', () => {
  for (const name of [
    'board_ai_messages_select',
    'board_ai_messages_insert',
    'board_ai_messages_update',
    'board_ai_messages_delete',
  ]) {
    it(`${name} resolves the owning thread and repeats both tests`, () => {
      const block = policyBlock(name);
      expect(block).toContain('FROM public.board_ai_threads t');
      expect(block).toContain('t.id = board_ai_messages.thread_id');
      expect(block).toContain('t.user_id = auth.uid()');
      // The refinement that matters: losing board access must close these
      // reads, so board readability is re-tested here and not assumed from
      // the fact that the caller once created the thread.
      expect(block).toContain('t.board_id ' + OWNED_BOARD);
      expect(block).toContain('public.is_board_member(t.board_id, auth.uid())');
    });
  }

  it('no message policy stops at thread ownership alone', () => {
    for (const name of [
      'board_ai_messages_select',
      'board_ai_messages_insert',
      'board_ai_messages_update',
      'board_ai_messages_delete',
    ]) {
      const block = policyBlock(name);
      const ownership = block.indexOf('t.user_id = auth.uid()');
      const board = block.indexOf('t.board_id');
      expect(board, `${name} must also test the board`).toBeGreaterThan(ownership);
    }
  });
});

describe('F/indexes. cascades and reads', () => {
  it('indexes the two reads this slice actually performs', () => {
    expect(sql).toContain('board_ai_threads_user_board_idx');
    expect(sql).toContain('ON public.board_ai_threads(user_id, board_id, updated_at DESC)');
    expect(sql).toContain('board_ai_messages_thread_idx');
    expect(sql).toContain('ON public.board_ai_messages(thread_id, created_at)');
  });

  it('deleting a board removes threads, and a thread removes its messages', () => {
    expect(tableBlock('board_ai_threads')).toContain('REFERENCES public.boards(id) ON DELETE CASCADE');
    expect(tableBlock('board_ai_messages')).toContain('REFERENCES public.board_ai_threads(id) ON DELETE CASCADE');
  });
});

describe('the slice touches nothing it was not authorized to', () => {
  it('does not relax source_references.target_padlet_id', () => {
    const foundation = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260820_create_knowledge_data_foundation.sql'),
      'utf8',
    );
    expect(foundation).toContain('target_padlet_id uuid NOT NULL');
    expect(sql).not.toContain('source_references');
  });

  it('adds no AI execution role in this slice', () => {
    const roles = fs.readFileSync(path.join(process.cwd(), 'lib/ai/aiRoles.ts'), 'utf8');
    expect(roles).not.toContain('AI_ROLE_CHAT');
  });
});

/**
 * The association columns are immutable after INSERT.
 *
 * This is a PRIVILEGE property, not an RLS one, and the distinction is the
 * whole point of these tests. A policy's WITH CHECK only ever sees the NEW
 * row, so "mine, on a board I can read" is satisfied just as well by a thread
 * whose board_id was changed to a different readable board. RLS cannot express
 * "and it must be the same board it was created on". Removing the privilege
 * can.
 *
 * The ordering assertions matter as much as the presence ones: Supabase grants
 * new public tables to anon and authenticated through ALTER DEFAULT
 * PRIVILEGES, so both start with TABLE-level UPDATE, which authorizes every
 * column. A column-level REVOKE underneath that grant is a no-op. These tests
 * fail if the migration ever drifts back to that shape.
 */
describe('association columns are locked at the privilege layer', () => {
  /** Privilege statements only, in source order. */
  const grants = sql
    .split(/;\s*/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /^(GRANT|REVOKE)\b/i.test(s));

  const stmt = (pattern: RegExp): string | undefined => grants.find((g) => pattern.test(g));
  const indexOfStmt = (pattern: RegExp): number => grants.findIndex((g) => pattern.test(g));

  it('1/6. table-level UPDATE is removed from both PostgREST roles', () => {
    // Named explicitly, not left to a PUBLIC revoke: the default privileges
    // are explicit grants to these two roles.
    const threads = stmt(/^REVOKE UPDATE ON public\.board_ai_threads FROM .*authenticated/i);
    const messages = stmt(/^REVOKE UPDATE ON public\.board_ai_messages FROM .*authenticated/i);
    expect(threads, 'threads must lose table-wide UPDATE').toBeDefined();
    expect(messages, 'messages must lose table-wide UPDATE').toBeDefined();
    expect(threads).toMatch(/\banon\b/);
    expect(messages).toMatch(/\banon\b/);
  });

  it('the fix is NOT a column REVOKE beneath a retained table grant', () => {
    // `REVOKE UPDATE (col) ON t` while the role still holds table-level UPDATE
    // authorizes every column anyway. That shape must never appear here.
    for (const g of grants) {
      expect(g, 'column-level REVOKE UPDATE is the superficial fix').not.toMatch(/^REVOKE UPDATE \(/i);
    }
    // And no table-wide UPDATE is granted back afterwards.
    expect(stmt(/^GRANT UPDATE ON public\.board_ai_(threads|messages)/i)).toBeUndefined();
  });

  it('the table-level REVOKE precedes the column GRANT', () => {
    // Postgres order: revoke the broad privilege first, then grant the narrow
    // one. Reversed, the revoke would strip the grant that was just made.
    const revoke = indexOfStmt(/^REVOKE UPDATE ON public\.board_ai_threads/i);
    const grant = indexOfStmt(/^GRANT UPDATE \(.*\) ON public\.board_ai_threads/i);
    expect(revoke, 'the thread revoke must exist').toBeGreaterThan(-1);
    expect(grant, 'the thread column grant must exist').toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(grant);
  });

  it('2/3/4/5. only title and updated_at are UPDATE-authorized on threads', () => {
    const grant = stmt(/^GRANT UPDATE \(.*\) ON public\.board_ai_threads TO authenticated/i);
    expect(grant, 'threads need exactly one column grant').toBeDefined();
    const columns = grant!.match(/GRANT UPDATE \(([^)]*)\)/i)![1]
      .split(',')
      .map((c) => c.trim())
      .sort();
    expect(columns).toEqual(['title', 'updated_at']);
    // Named individually so a regression reads as the specific column it broke.
    for (const locked of ['board_id', 'user_id', 'id', 'created_at']) {
      expect(columns, `${locked} must not be writable`).not.toContain(locked);
    }
  });

  it('6/7. messages receive no UPDATE privilege at all, so thread_id cannot move', () => {
    // V1 has no message-edit feature, so the smallest correct grant is none.
    expect(grants.filter((g) => /^GRANT UPDATE/i.test(g) && /board_ai_messages/i.test(g)))
      .toHaveLength(0);
  });

  it('8/9. SELECT, INSERT and DELETE privacy is untouched by the correction', () => {
    // Only UPDATE is revoked; the other three still reach their policies.
    for (const verb of ['SELECT', 'INSERT', 'DELETE']) {
      expect(stmt(new RegExp(`^REVOKE ${verb} ON public\\.board_ai_(threads|messages) FROM .*authenticated`, 'i')),
        `${verb} must remain available to authenticated`).toBeUndefined();
    }
    // And the policies that gate them still carry both conditions.
    for (const name of ['board_ai_threads_select', 'board_ai_messages_select']) {
      const block = policyBlock(name);
      expect(block).toContain('auth.uid()');
      expect(block).toContain(MEMBER_BOARD);
    }
  });

  it('anon keeps no privilege on either table', () => {
    expect(stmt(/^REVOKE ALL ON public\.board_ai_threads FROM anon/i)).toBeDefined();
    expect(stmt(/^REVOKE ALL ON public\.board_ai_messages FROM anon/i)).toBeDefined();
  });

  it('10. the correction introduces no service-role or definer bypass', () => {
    expect(grants.filter((g) => /service_role/i.test(g))).toHaveLength(0);
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).not.toContain('CREATE FUNCTION');
    expect(sql).not.toContain('CREATE TRIGGER');
  });
});
