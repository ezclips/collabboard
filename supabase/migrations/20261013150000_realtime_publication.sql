-- PATCH-357 Addendum 2. Realtime was never switched on in a fresh database.
--
-- WHY. The two-person live test found the owner's open tab did NOT show the
-- second account's post. Supabase refused the subscription ("Unable to subscribe
-- to changes ... table: padlets") because no table the app listens to was in the
-- `supabase_realtime` publication -- and no migration in the repo had ever added
-- one. This records the fix so a fresh database behaves like the live one.
--
-- SAFE TO RE-RUN. Each table is skipped when it does not exist or is already in
-- the publication, so running this again changes nothing.
--
-- THESE ARE EXACTLY THE TABLES THE APP'S `postgres_changes` SUBSCRIPTIONS USE.
-- A new subscription to another table must add it to this list too, or it will
-- be refused at runtime the same way.
--
-- No data changes: this only adds tables to a publication.

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

        -- Skip a table already published; this is what makes a re-run a no-op.
        IF EXISTS (
            SELECT 1
              FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = tbl
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format('alter publication supabase_realtime add table public.%I', tbl);
    END LOOP;
END $$;
