-- Read-only verification for 20260919120000_create_board_wiki_pages.sql.
--
-- Creates nothing, changes nothing. Runs unchanged inside
-- `BEGIN TRANSACTION READ ONLY`.
--
-- WHAT EACH ROW IS PROTECTING, because a green row here is only worth what its
-- reasoning is worth:
--
-- ROW 1-2  the tables exist. Trivially true after the migration; present so a
--          partial apply is visible rather than inferred from later rows.
--
-- ROW 3    THE OVERWRITE-IMPOSSIBILITY CHECK, and the most important row in the
--          file. `board_wiki_pages` must have EXACTLY ONE text column that can
--          hold page prose. A second one -- `compiled_content`, `draft`,
--          `pending_content` -- is how "recompilation proposes" quietly becomes
--          "recompilation writes somewhere the page can pick up", and nothing
--          else in the system would notice. Proposals live in their own table
--          precisely so this count stays at one.
--
-- ROW 4    no trigger on either table. A trigger is the other path by which a
--          proposal could promote itself, and it would be invisible in the
--          application code that this design's safety argument rests on.
--
-- ROW 5    RLS is enabled on both. A policy on a table without RLS enabled is
--          decoration.
--
-- ROW 6    `anon` holds no privilege on either table. RLS filters rows; grants
--          decide whether a role reaches the table at all, and the two fail
--          independently.
--
-- ROW 7    `authenticated` cannot UPDATE a proposal. The application never does,
--          and a proposal that can be edited in place stops being a record of
--          what was proposed.
--
-- ROW 8    the identity columns of a page are not updatable by a client, so a
--          page cannot be moved to another board or have its authorship
--          rewritten after the fact.
--
-- ROW 9    deleting an ACCOUNT must not delete board content. The page takes
--          SET NULL and the proposal takes CASCADE, and both halves are checked
--          -- getting either backwards is silent until the day an account is
--          actually deleted, which is the worst possible time to find out.
--
-- WHAT THIS FILE CANNOT TELL YOU: whether the APPLICATION honours any of it.
-- Authorization lives in the application layer by design, and the service role
-- bypasses every policy below. These rows prove the backstop is in place, not
-- that the primary gate is correct -- that is what the route and domain tests
-- are for.

SELECT
    'row 1: board_wiki_pages exists' AS check,
    to_regclass('public.board_wiki_pages') IS NOT NULL AS ok;

SELECT
    'row 2: board_wiki_page_proposals exists' AS check,
    to_regclass('public.board_wiki_page_proposals') IS NOT NULL AS ok;

SELECT
    'row 3: exactly one authored content column on the page' AS check,
    count(*) = 1 AS ok,
    count(*) AS found
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'board_wiki_pages'
  AND data_type = 'text'
  AND column_name IN ('content', 'compiled_content', 'draft_content', 'pending_content', 'proposed_content');

SELECT
    'row 4: no triggers on either table' AS check,
    count(*) = 0 AS ok,
    count(*) AS found
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('board_wiki_pages', 'board_wiki_page_proposals')
  AND NOT t.tgisinternal;

SELECT
    'row 5: RLS enabled on both' AS check,
    bool_and(c.relrowsecurity) AS ok
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('board_wiki_pages', 'board_wiki_page_proposals');

SELECT
    'row 6: anon holds no privilege on either table' AS check,
    count(*) = 0 AS ok,
    count(*) AS found
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('board_wiki_pages', 'board_wiki_page_proposals')
  AND grantee = 'anon';

SELECT
    'row 7: authenticated cannot UPDATE a proposal' AS check,
    count(*) = 0 AS ok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'board_wiki_page_proposals'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE';

SELECT
    'row 8: page identity columns are not client-updatable' AS check,
    count(*) = 0 AS ok,
    coalesce(string_agg(column_name, ', '), '(none)') AS still_updatable
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'board_wiki_pages'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE'
  AND column_name IN ('board_id', 'created_by', 'created_at');

-- ROW 9 checks the rule that deleting an ACCOUNT must not delete board
-- content. A wiki page is durable board content other editors have worked on,
-- so `created_by` is SET NULL like knowledge_documents and teams; a proposal is
-- an ephemeral suggestion and keeps CASCADE. Both halves are asserted, because
-- getting either one backwards is silent until the day an account is deleted.
-- `confdeltype` is 'n' for SET NULL and 'c' for CASCADE.
SELECT
    'row 9: created_by -- page SET NULL, proposal CASCADE' AS check,
    bool_and(
        CASE c.relname
            WHEN 'board_wiki_pages' THEN con.confdeltype = 'n'
            WHEN 'board_wiki_page_proposals' THEN con.confdeltype = 'c'
        END
    ) AS ok,
    string_agg(c.relname || '=' || con.confdeltype, ', ' ORDER BY c.relname) AS actual
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
WHERE n.nspname = 'public'
  AND c.relname IN ('board_wiki_pages', 'board_wiki_page_proposals')
  AND con.contype = 'f'
  AND a.attname = 'created_by';
