-- PATCH-357 Addendum 3. Deletes did not reach other people live.
--
-- WHY. After Addendum 2, the live two-account re-test showed the second
-- account's new post appear for the owner live and a moved post move live -- but
-- a DELETED post did NOT disappear. Supabase docs (Realtime -> Postgres Changes
-- -> Limitations -> Delete events): "You can only filter Delete events ... if
-- the table has the replica identity set to full." Every subscription in the app
-- is filtered (`board_id=eq....` for posts, `canvas_id=eq....` for Kanban), so
-- with the default replica identity no delete event is ever delivered. The
-- client already handles DELETE (`useCanvasData` removes the post; Kanban
-- reconciles); this is the server half.
--
-- COST. `replica identity full` makes Postgres write the WHOLE old row to the
-- WAL on every update and delete of these tables, not just the primary key.
-- Acceptable at the current size; revisit if these tables grow very write-heavy.
--
-- RLS ON DELETE EVENTS. Supabase does NOT apply RLS to DELETE events. It does
-- still apply the subscription's filter, so a subscriber to a board receives the
-- deleted row of THAT board only -- no other board's rows.
--
-- Naturally idempotent: setting the same replica identity again is a no-op.

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'padlets',
        'kanban_cards',
        'kanban_columns',
        'kanban_swimlanes',
        'kanban_column_groups',
        'kanban_links',
        'kanban_comments',
        'kanban_votes',
        'kanban_card_assignees',
        'kanban_board_members'
    ]
    LOOP
        -- Skip a table this database does not have.
        IF to_regclass(format('public.%I', tbl)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('alter table public.%I replica identity full', tbl);
    END LOOP;
END $$;
