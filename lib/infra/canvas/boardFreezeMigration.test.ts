import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-366. A source guard over the board-freeze migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the 12 tables, the
 * restrictive shape, the open-board early return, the frozen_at trigger and the
 * guarded publication.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014190000_board_freeze.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

const TABLES = [
  'padlets', 'canvas_lines', 'board_sections', 'freeform_graph_edges',
  'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
  'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees',
];

describe('PATCH-366 board-freeze migration', () => {
  it('adds the column and the authorizer', () => {
    expect(source).toContain('ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS frozen_at timestamptz;');
    expect(source).toContain('FUNCTION public.board_open_for_write(b uuid)');
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
    // Open board: the early return that keeps the cost to one PK lookup.
    expect(source).toContain('IF board_frozen IS NULL THEN');
    expect(source).toContain('RETURN true;');
    expect(source).toContain("public.get_board_permission(b, auth.uid())::text = 'admin'");
    expect(source).toContain('REVOKE ALL ON FUNCTION public.board_open_for_write(uuid) FROM PUBLIC, anon;');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.board_open_for_write(uuid) TO authenticated, service_role;');
  });

  it('lists exactly the 12 tables', () => {
    for (const table of TABLES) {
      expect(source, table).toContain(`'${table}'`);
    }
    // kanban_board_members and boards are deliberately NOT in the list.
    const listBlock = source.slice(source.indexOf('tables text[] :='), source.indexOf('];', source.indexOf('tables text[] :=')));
    expect(listBlock).not.toContain('kanban_board_members');
    expect(listBlock).not.toContain("'boards'");
  });

  it('uses coalesce for padlets and verifies every column first', () => {
    expect(source).toContain("board_expr := 'coalesce(board_id, canvas_id)'");
    expect(source).toContain("cols := ARRAY['board_id', 'canvas_id']");
    expect(source).toContain('FROM information_schema.columns');
    expect(source).toContain('has no column %');
  });

  it('creates three RESTRICTIVE policies per table', () => {
    expect(source).toContain('AS RESTRICTIVE FOR INSERT TO authenticated');
    expect(source).toContain('AS RESTRICTIVE FOR UPDATE TO authenticated');
    expect(source).toContain('AS RESTRICTIVE FOR DELETE TO authenticated');
    expect(source).toContain('board_frozen_no_insert');
    expect(source).toContain('board_frozen_no_update');
    expect(source).toContain('board_frozen_no_delete');
    expect(source).toContain('public.board_open_for_write(%s)');
  });

  it('guards frozen_at with its own trigger', () => {
    expect(source).toContain('FUNCTION public.guard_board_frozen_at()');
    expect(source).toContain('BEFORE UPDATE OF frozen_at ON public.boards');
    expect(source).toContain('CREATE TRIGGER boards_guard_frozen_at');
    expect(source).toContain('DROP TRIGGER IF EXISTS boards_guard_frozen_at ON public.boards;');
    expect(source).toContain("USING ERRCODE = '42501'");
    expect(source).toContain('REVOKE EXECUTE ON FUNCTION public.guard_board_frozen_at() FROM PUBLIC, anon, authenticated;');
  });

  it('adds boards to the publication with the guarded pattern', () => {
    expect(source).toContain("FROM pg_publication_tables");
    expect(source).toContain("pubname = 'supabase_realtime'");
    expect(source).toContain("EXECUTE 'alter publication supabase_realtime add table public.boards'");
  });

  it('self-checks 36 policies, the trigger and the publication', () => {
    expect(source).toContain('policy_count <> 36');
    expect(source).toContain("tgname = 'boards_guard_frozen_at'");
    expect(source).toContain('boards is not in the supabase_realtime publication');
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
