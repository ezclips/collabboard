/**
 * IMAGE-LIBRARY-1 -- the migration that gives a saved Image Post a durable
 * Library identity.
 *
 * These pin the properties that are load-bearing for the product rule and easy
 * to lose in a later edit: the relationship is nullable and NOT unique (a
 * Library object is reusable content, so it may back several placements), the
 * function adds no authority of its own, and deleting either side never
 * destroys the other.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/20260905090000_add_padlet_library_item.sql';
const sql = fs.readFileSync(path.join(process.cwd(), MIGRATION), 'utf8').replace(/\r\n/g, '\n');
/** Statements only: a guarantee must never be satisfied by a comment about it. */
const statements = sql.replace(/--.*$/gm, '');

describe('IMAGE-LIBRARY-1 migration', () => {
  it('1. adds a nullable placement -> Library relationship that survives deletion', () => {
    expect(statements).toMatch(
      /ALTER TABLE public\.padlets\s+ADD COLUMN IF NOT EXISTS library_item_id uuid/,
    );
    // Deleting a Library item must not delete the boards showing it.
    expect(statements).toMatch(
      /REFERENCES public\.library_items\(id\) ON DELETE SET NULL/,
    );
    // Nullable: every pre-existing padlet keeps a NULL rather than a fake identity.
    expect(statements).not.toMatch(/library_item_id uuid[\s\S]{0,80}NOT NULL/);
    // And nothing cascades from padlets into library_items in either direction.
    expect(statements).not.toMatch(/library_items[\s\S]{0,60}ON DELETE CASCADE/);
  });

  it('2. does NOT make the relationship unique -- a Library object is reusable', () => {
    // UNIQUE (library_item_id) would outlaw placing one library image on two
    // boards, which is what a library is for. The idempotence the product needs
    // is owned by the padlet primary key inside the function instead.
    expect(statements).not.toMatch(/UNIQUE[\s\S]{0,60}library_item_id/i);
    expect(statements).toMatch(/CREATE INDEX IF NOT EXISTS padlets_library_item_id_idx/);
  });

  it('3. creates object and placement in ONE function, so neither can be orphaned', () => {
    const fn = statements.slice(
      statements.indexOf('CREATE OR REPLACE FUNCTION public.create_image_post_with_library_item'),
      statements.indexOf('REVOKE ALL ON FUNCTION'),
    );
    expect(fn).toMatch(/INSERT INTO public\.library_items/);
    expect(fn).toMatch(/INSERT INTO public\.padlets/);
    expect(fn).toMatch(/RETURNS TABLE \(padlet_id uuid, library_item_id uuid\)/);
    // The placement carries the id of the object created in the same call.
    expect(fn).toMatch(/RETURNING id INTO v_library_item_id/);
    expect(fn).toMatch(/library_item_id\s*\n?\s*\)\s*VALUES|v_library_item_id\s*\)/);
  });

  it('4. adds no authority of its own', () => {
    expect(statements).toMatch(/SECURITY INVOKER/);
    expect(statements).not.toMatch(/SECURITY DEFINER/);
    expect(statements).toMatch(/SET search_path = public/);
    // Signed-in callers only; the anonymous role can never reach it.
    expect(statements).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon/);
    expect(statements).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO authenticated, service_role/);
  });

  it('5. is idempotent on a retry of the same placement, without content dedup', () => {
    const fn = statements.slice(statements.indexOf('AS $$'));
    // A retry carrying an id that already exists returns what is there.
    expect(fn).toMatch(/FROM public\.padlets p WHERE p\.id = p_padlet_id/);
    expect(fn).toMatch(/IF FOUND THEN[\s\S]{0,120}RETURN;/);
    // Never by image bytes: two deliberate crops of one area stay two objects.
    expect(statements).not.toMatch(/md5|sha256|digest|content_hash/i);
  });

  it('5b. C1: authorization is established BEFORE any retry can be answered', () => {
    // The first version answered a retry by id alone, so a board viewer could
    // replay a card and receive the creator's private library id. Behaviour is
    // proved in imagePostLibraryAuthorization.test.ts; this pins the ORDER, so
    // the early-return can never drift back above the authorization checks.
    const hardening = fs.readFileSync(path.join(process.cwd(),
      'supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql'), 'utf8')
      .replace(/\r\n/g, '\n').replace(/--.*$/gm, '');
    const actorCheck = hardening.indexOf('auth.uid() <> p_user_id');
    const boardCheck = hardening.indexOf('FROM public.board_collaborators c');
    const retryLookup = hardening.indexOf('LEFT JOIN public.library_items l');
    expect(actorCheck).toBeGreaterThan(-1);
    expect(boardCheck).toBeGreaterThan(actorCheck);
    expect(retryLookup).toBeGreaterThan(boardCheck);
    // A retry is only honoured for the same board AND the same creator.
    expect(hardening).toMatch(/v_existing_board = p_board_id/);
    expect(hardening).toMatch(/v_library_owner = p_user_id/);
    // The posture the independent review passed is restated, never widened.
    expect(hardening).toMatch(/SECURITY INVOKER/);
    expect(hardening).not.toMatch(/SECURITY DEFINER/);
    expect(hardening).toMatch(/FROM PUBLIC, anon/);
  });

  it('6. is a new migration and edits no historical one', () => {
    expect(fs.existsSync(path.join(process.cwd(), MIGRATION))).toBe(true);
    expect(statements).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/);
    // Additive only: no existing padlet or library row is rewritten.
    expect(statements).not.toMatch(/UPDATE public\.(padlets|library_items)/);
  });
});
