-- Read-only verification for 20260905_image_library_ownership.sql.
-- This file creates no objects and changes no rows. It is safe to run before a
-- rollout, after one, or against a partial state.
--
-- Plain SQL only: the section headers are SELECTs rather than psql
-- metacommands, so this runs unchanged in the Supabase dashboard SQL Editor as
-- well as in psql. Each header returns a single labelled row.
--
-- Every check yields a `pass` boolean so the whole output can be scanned for a
-- single `false`. The last query is a roll-up.
--
-- Check 20 of the gate -- that supabase/migrations/ still matches what this
-- rollout copied -- is a static repository property, not a database one, and is
-- proved in scripts/db/imageLibraryRollout.source.test.ts.

SELECT '== 1. padlets.library_item_id exists, is uuid, and is nullable ==' AS section;
SELECT
    (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'padlets'
        AND column_name = 'library_item_id')                        AS actual_type,
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'padlets'
        AND column_name = 'library_item_id')                        AS actual_nullable,
    -- Nullable is the backward-compatibility promise: writes that never name
    -- this column keep working, so the database may lead the application.
    COALESCE((SELECT data_type = 'uuid' AND is_nullable = 'YES'
                FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'padlets'
                 AND column_name = 'library_item_id'), false)       AS pass;

SELECT '== 2. foreign key targets library_items(id) with ON DELETE SET NULL ==' AS section;
SELECT
    ccu.table_schema || '.' || ccu.table_name || '(' || ccu.column_name || ')' AS references_target,
    rc.delete_rule                                                  AS actual_delete_rule,
    -- Removing a Library item leaves its placements standing with a NULL link;
    -- it must never reach onto a board and delete the card.
    (ccu.table_schema = 'public' AND ccu.table_name = 'library_items'
     AND ccu.column_name = 'id' AND rc.delete_rule = 'SET NULL')    AS pass
FROM information_schema.key_column_usage AS k
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = k.constraint_name
 AND rc.constraint_schema = k.constraint_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = k.constraint_name
 AND ccu.constraint_schema = k.constraint_schema
WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
  AND k.column_name = 'library_item_id';

SELECT '== 3. NO unique restriction: one Library object may be placed many times ==' AS section;
SELECT
    NOT EXISTS (
        SELECT 1 FROM pg_index AS i
         WHERE i.indrelid = to_regclass('public.padlets')
           AND i.indisunique
           AND EXISTS (
                SELECT 1 FROM unnest(i.indkey) AS k(attnum)
                 WHERE k.attnum = (SELECT a.attnum FROM pg_attribute AS a
                                    WHERE a.attrelid = to_regclass('public.padlets')
                                      AND a.attname = 'library_item_id'))
    )                                                               AS no_unique_on_link,
    NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS k
            ON k.constraint_name = tc.constraint_name
           AND k.constraint_schema = tc.constraint_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = 'padlets'
           AND tc.constraint_type = 'UNIQUE'
           AND k.column_name = 'library_item_id'
    )                                                               AS no_unique_constraint,
    (NOT EXISTS (
        SELECT 1 FROM pg_index AS i
         WHERE i.indrelid = to_regclass('public.padlets')
           AND i.indisunique
           AND EXISTS (
                SELECT 1 FROM unnest(i.indkey) AS k(attnum)
                 WHERE k.attnum = (SELECT a.attnum FROM pg_attribute AS a
                                    WHERE a.attrelid = to_regclass('public.padlets')
                                      AND a.attname = 'library_item_id'))))  AS pass;

SELECT '== 4. the supporting partial index exists in its reviewed shape ==' AS section;
SELECT
    indexdef                                                        AS actual_definition,
    (indexdef NOT LIKE '%UNIQUE%'
     AND indexdef LIKE '%(library_item_id)%'
     AND indexdef LIKE '%WHERE (library_item_id IS NOT NULL)')      AS pass
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'padlets'
  AND indexname = 'padlets_library_item_id_idx';

SELECT '== 5. the function exists with the reviewed signature, and alone ==' AS section;
SELECT
    to_regprocedure(
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)') IS NOT NULL                                AS function_exists,
    (SELECT count(*) FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_image_post_with_library_item')       AS overload_count,
    (to_regprocedure(
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)') IS NOT NULL
     AND (SELECT count(*) FROM pg_proc AS p
            JOIN pg_namespace AS n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = 'create_image_post_with_library_item') = 1)  AS pass;

SELECT '== 6. SECURITY INVOKER, never DEFINER, with a pinned search_path ==' AS section;
SELECT
    p.prosecdef                                                     AS is_security_definer,
    p.proconfig                                                     AS settings,
    -- INVOKER is what keeps this a reach rather than an elevation: every row it
    -- writes still faces the same policies a direct write would.
    (NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=public']) AS pass
FROM pg_proc AS p
WHERE p.oid = to_regprocedure(
    'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
    ' double precision, double precision, double precision, double precision,'
    ' text, jsonb)');

SELECT '== 7. execute privileges: signed-in callers only ==' AS section;
-- The oid form throughout: has_function_privilege(role, TEXT signature, ...)
-- RAISES when the function is absent, which would make this file unusable
-- before a rollout. to_regprocedure yields NULL there, and the oid form yields
-- NULL in turn, so a missing function reports rather than errors.
WITH target(fn) AS (
    SELECT to_regprocedure(
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)')::oid
)
SELECT
    has_function_privilege('public', fn, 'EXECUTE')                 AS public_execute,
    has_function_privilege('anon', fn, 'EXECUTE')                   AS anon_execute,
    has_function_privilege('authenticated', fn, 'EXECUTE')          AS authenticated_execute,
    has_function_privilege('service_role', fn, 'EXECUTE')           AS service_role_execute,
    COALESCE(NOT has_function_privilege('public', fn, 'EXECUTE')
     AND NOT has_function_privilege('anon', fn, 'EXECUTE')
     AND has_function_privilege('authenticated', fn, 'EXECUTE')
     AND has_function_privilege('service_role', fn, 'EXECUTE'), false) AS pass
FROM target;

SELECT '== 8. the committed body is the HARDENED one ==' AS section;
WITH body(definition) AS (
    SELECT pg_get_functiondef(to_regprocedure(
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)'))
)
SELECT
    -- The logical actor: a direct caller may not nominate anyone else.
    position('auth.uid() <> p_user_id' IN definition) > 0            AS binds_logical_actor,
    position('p_user_id IS NULL' IN definition) > 0                  AS refuses_null_actor,
    -- Board-write authority: owner, or a collaborator whose role is editor.
    -- Viewer and commenter are absent by construction, not by filtering.
    position('c.role = ''editor''' IN definition) > 0                AS editor_only,
    position('b.user_id = p_user_id' IN definition) > 0              AS owner_branch,
    (position('auth.uid() <> p_user_id' IN definition) > 0
     AND position('p_user_id IS NULL' IN definition) > 0
     AND position('c.role = ''editor''' IN definition) > 0
     AND position('b.user_id = p_user_id' IN definition) > 0)        AS pass
FROM body;

SELECT '== 9. authorization precedes the retry lookup ==' AS section;
WITH body(definition) AS (
    SELECT pg_get_functiondef(to_regprocedure(
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)'))
)
SELECT
    position('public.board_collaborators' IN definition)             AS authority_at,
    position('LEFT JOIN public.library_items' IN definition)         AS retry_lookup_at,
    -- Ordering is the whole point of the hardening: the pre-hardening body
    -- answered a retry before it knew anything about the caller, so a board
    -- viewer could replay a card id and receive the creator's private id.
    -- Catalog metadata cannot express statement order, so this is the one
    -- narrowly targeted body inspection in this file.
    (position('public.board_collaborators' IN definition) > 0
     AND position('LEFT JOIN public.library_items' IN definition) > 0
     AND position('public.board_collaborators' IN definition)
         < position('LEFT JOIN public.library_items' IN definition)) AS pass
FROM body;

SELECT '== 10. a genuine retry must match board, link and library owner ==' AS section;
WITH body(definition) AS (
    SELECT pg_get_functiondef(to_regprocedure(
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)'))
)
SELECT
    position('v_existing_board = p_board_id' IN definition) > 0      AS same_board,
    position('v_existing_library IS NOT NULL' IN definition) > 0     AS link_present,
    position('v_library_owner = p_user_id' IN definition) > 0        AS library_owned_by_actor,
    (position('v_existing_board = p_board_id' IN definition) > 0
     AND position('v_existing_library IS NOT NULL' IN definition) > 0
     AND position('v_library_owner = p_user_id' IN definition) > 0)  AS pass
FROM body;

SELECT '== 11. capability only -- no backfill was performed ==' AS section;
-- Addressed through to_jsonb rather than by naming the column: a plain
-- `WHERE library_item_id IS NOT NULL` fails to PARSE on a database where the
-- rollout has not run, and this file has to stay runnable before, after and
-- against a partial state. It costs one scan of padlets, which is the price of
-- that guarantee; the rollout's own postflight reports the same number from the
-- indexed column at the moment it commits.
WITH linked(n) AS (
    SELECT count(*) FROM public.padlets AS p
     WHERE (to_jsonb(p) ->> 'library_item_id') IS NOT NULL
)
SELECT
    linked.n                                                        AS linked_placements,
    (SELECT count(*) FROM public.library_items)                     AS library_rows,
    CASE
        WHEN linked.n = 0 THEN 'no links yet -- expected before the application is deployed'
        ELSE 'links present -- expected only after the application is deployed'
    END                                                             AS release_gate,
    true                                                            AS pass
FROM linked;

SELECT '== 12. roll-up ==' AS section;
WITH signature(sig) AS (
    VALUES ('public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
            ' double precision, double precision, double precision, double precision,'
            ' text, jsonb)')
), body(definition) AS (
    SELECT CASE WHEN to_regprocedure((SELECT sig FROM signature)) IS NULL THEN ''
                ELSE pg_get_functiondef(to_regprocedure((SELECT sig FROM signature))) END
)
SELECT
    -- Every conjunct is COALESCEd at its source: a missing column, index or
    -- function yields NULL, and one unguarded NULL would print readiness as a
    -- blank cell instead of the `f` the state deserves.
    COALESCE((SELECT data_type = 'uuid' AND is_nullable = 'YES'
                FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'padlets'
                 AND column_name = 'library_item_id'), false)
    AND COALESCE((SELECT bool_or(ccu.table_name = 'library_items'
                                 AND ccu.column_name = 'id'
                                 AND rc.delete_rule = 'SET NULL')
                    FROM information_schema.key_column_usage AS k
                    JOIN information_schema.referential_constraints AS rc
                      ON rc.constraint_name = k.constraint_name
                     AND rc.constraint_schema = k.constraint_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = k.constraint_name
                     AND ccu.constraint_schema = k.constraint_schema
                   WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
                     AND k.column_name = 'library_item_id'), false)
    AND NOT EXISTS (
        SELECT 1 FROM pg_index AS i
         WHERE i.indrelid = to_regclass('public.padlets') AND i.indisunique
           AND EXISTS (SELECT 1 FROM unnest(i.indkey) AS k(attnum)
                        WHERE k.attnum = (SELECT a.attnum FROM pg_attribute AS a
                                           WHERE a.attrelid = to_regclass('public.padlets')
                                             AND a.attname = 'library_item_id')))
    AND COALESCE((SELECT indexdef NOT LIKE '%UNIQUE%'
                         AND indexdef LIKE '%WHERE (library_item_id IS NOT NULL)'
                    FROM pg_indexes
                   WHERE schemaname = 'public' AND tablename = 'padlets'
                     AND indexname = 'padlets_library_item_id_idx'), false)
    AND to_regprocedure((SELECT sig FROM signature)) IS NOT NULL
    AND (SELECT count(*) FROM pg_proc AS p
           JOIN pg_namespace AS n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'create_image_post_with_library_item') = 1
    AND NOT COALESCE((SELECT prosecdef FROM pg_proc
                       WHERE oid = to_regprocedure((SELECT sig FROM signature))), true)
    AND COALESCE((SELECT proconfig @> ARRAY['search_path=public'] FROM pg_proc
                   WHERE oid = to_regprocedure((SELECT sig FROM signature))), false)
    AND NOT COALESCE(has_function_privilege('public', to_regprocedure((SELECT sig FROM signature))::oid, 'EXECUTE'), true)
    AND NOT COALESCE(has_function_privilege('anon', to_regprocedure((SELECT sig FROM signature))::oid, 'EXECUTE'), true)
    AND COALESCE(has_function_privilege('authenticated', to_regprocedure((SELECT sig FROM signature))::oid, 'EXECUTE'), false)
    AND COALESCE(has_function_privilege('service_role', to_regprocedure((SELECT sig FROM signature))::oid, 'EXECUTE'), false)
    AND (SELECT position('auth.uid() <> p_user_id' IN definition) > 0 FROM body)
    AND (SELECT position('c.role = ''editor''' IN definition) > 0 FROM body)
    AND (SELECT position('v_library_owner = p_user_id' IN definition) > 0 FROM body)
    AND (SELECT position('public.board_collaborators' IN definition) > 0
                AND position('public.board_collaborators' IN definition)
                    < position('LEFT JOIN public.library_items' IN definition) FROM body)
                                                                    AS rollout_readiness;
