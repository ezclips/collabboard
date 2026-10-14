import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-358 Addendum 2. A source guard over the guest write-guard migration.
 *
 * The migration is not run by these tests -- app/** and supabase/** are outside
 * vitest's include globs for execution -- so this pins the parts that must not
 * drift: the two allow-lists, the RESTRICTIVE shape, the JWT claim the guard
 * reads, the storage block, and the guest display_name fallback.
 */

const WRITE_ALLOW = [
  'padlets', 'canvas_lines', 'board_sections',
  'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
  'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees',
];

const READ_ALLOW = [
  ...WRITE_ALLOW,
  'boards', 'board_collaborators', 'board_map_settings',
  'freeform_graph_edges', 'freeform_graph_settings', 'kanban_board_members',
  'knowledge_documents', 'knowledge_pages', 'knowledge_chunks',
  'knowledge_source_highlights', 'knowledge_pdf_area_image_placements',
  'source_references', 'board_wiki_pages',
];

const MIGRATION_PATH = 'supabase/migrations/20261014120000_guest_write_guard.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

/** The quoted names inside each `NOT IN ( ... )` allow-list, in order. */
function allowLists(): string[][] {
  return [...source.matchAll(/NOT IN \(([^)]*)\)/g)].map((match) =>
    [...match[1].matchAll(/'([a-z_]+)'/g)].map((name) => name[1]),
  );
}

describe('PATCH-358 Addendum 2 guest write guard migration', () => {
  it('has the two allow-lists exactly as specified', () => {
    const blocks = allowLists();
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual(WRITE_ALLOW);
    expect(blocks[1]).toEqual(READ_ALLOW);
  });

  it('uses RESTRICTIVE policies (three write, one read, three storage)', () => {
    expect(source).toContain('AS RESTRICTIVE');
    expect((source.match(/AS RESTRICTIVE/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(source).toContain('guest_no_insert');
    expect(source).toContain('guest_no_update');
    expect(source).toContain('guest_no_delete');
    expect(source).toContain('guest_no_select');
  });

  it('is_guest reads the is_anonymous JWT claim, invoker and empty search_path', () => {
    expect(source).toContain("auth.jwt() ->> 'is_anonymous'");
    expect(source).toContain('coalesce');
    expect(source).toContain('SECURITY INVOKER');
    expect(source).toContain("SET search_path = ''");
    expect(source).toContain('REVOKE ALL ON FUNCTION public.is_guest() FROM public;');
  });

  it('has the storage.objects block', () => {
    expect(source).toContain('ON storage.objects');
    expect(source).toContain('guest_no_storage_insert');
    expect(source).toContain('guest_no_storage_update');
    expect(source).toContain('guest_no_storage_delete');
  });

  it('adds the display_name fallback to handle_new_user', () => {
    expect(source).toContain(
      "COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', '')",
    );
    expect(source).toContain('SET search_path = public');
    expect(source).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('evaluates is_guest() once per statement, not once per row', () => {
    expect(source).toContain('not (select public.is_guest())');
    // The bare, per-row form must not appear in any policy expression.
    expect(source).not.toContain('not public.is_guest()');
    // Three write (insert 1 + update 2 + delete 1) + one read + three storage
    // (insert 1 + update 2 + delete 1) policy expressions.
    expect((source.match(/not \(select public\.is_guest\(\)\)/g) ?? []).length).toBe(9);
  });

  it('runs in one transaction with a self-check', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
    expect(source).toContain('guest_no_insert policies');
  });
});
