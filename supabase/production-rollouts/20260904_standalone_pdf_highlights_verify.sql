-- Read-only verification for 20260904_standalone_pdf_highlights.sql.
-- This file creates no persistent objects and does not modify data. It is safe
-- to run before a rollout, after one, or against a partial state.
--
-- Plain SQL only: the section headers are SELECTs rather than psql metacommands,
-- so this runs unchanged in the Supabase dashboard SQL Editor as well as in
-- psql. Each header returns a single labelled row.
--
-- Every check yields a `pass` boolean so the whole output can be scanned for a
-- single `false`. The last query is a roll-up.

SELECT '== 1. table exists, RLS on, and carries NO board_id authority column ==' AS section;
SELECT
    to_regclass('public.knowledge_source_highlights') IS NOT NULL              AS table_exists,
    COALESCE((SELECT relrowsecurity FROM pg_class
               WHERE oid = to_regclass('public.knowledge_source_highlights')), false) AS rls_enabled,
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                   AND column_name = 'board_id')                               AS no_board_id,
    (to_regclass('public.knowledge_source_highlights') IS NOT NULL
     AND COALESCE((SELECT relrowsecurity FROM pg_class
                    WHERE oid = to_regclass('public.knowledge_source_highlights')), false)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                        AND column_name = 'board_id'))                          AS pass;

SELECT '== 2. foreign key actions: document cascades, citation sets null ==' AS section;
WITH expected(column_name, delete_rule) AS (
    VALUES ('source_document_id'::text, 'CASCADE'::text),
           ('source_reference_id',      'SET NULL')
)
SELECT
    e.column_name,
    rc.delete_rule                                        AS actual_rule,
    rc.delete_rule IS NOT DISTINCT FROM e.delete_rule      AS pass
FROM expected AS e
LEFT JOIN information_schema.key_column_usage AS k
       ON k.table_schema = 'public' AND k.table_name = 'knowledge_source_highlights'
      AND k.column_name = e.column_name
LEFT JOIN information_schema.referential_constraints AS rc
       ON rc.constraint_name = k.constraint_name
ORDER BY e.column_name;

SELECT '== 3. indexes: document/page, and the UNIQUE PARTIAL origin index ==' AS section;
SELECT
    indexname,
    indexdef LIKE '%UNIQUE%'                                       AS is_unique,
    indexdef LIKE '%WHERE (source_reference_id IS NOT NULL)%'      AS is_partial,
    CASE indexname
        WHEN 'knowledge_source_highlights_document_page_idx' THEN true
        WHEN 'knowledge_source_highlights_origin_uidx'
            THEN indexdef LIKE '%UNIQUE%'
             AND indexdef LIKE '%WHERE (source_reference_id IS NOT NULL)%'
        ELSE true
    END                                                            AS pass
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'knowledge_source_highlights'
ORDER BY indexname;

SELECT '== 4. no table-wide INSERT/UPDATE/TRUNCATE for browser roles ==' AS section;
WITH roles(grantee) AS (VALUES ('authenticated'::text), ('anon'))
SELECT
    r.grantee,
    NOT EXISTS (
        SELECT 1 FROM information_schema.table_privileges AS t
         WHERE t.table_schema = 'public' AND t.table_name = 'knowledge_source_highlights'
           AND t.grantee = r.grantee
           AND t.privilege_type IN ('INSERT', 'UPDATE', 'TRUNCATE')
    )                                                              AS pass
FROM roles AS r
ORDER BY r.grantee;

SELECT '== 5. authenticated column grants are exactly the reviewed sets ==' AS section;
SELECT
    'INSERT'                                                       AS privilege,
    (SELECT array_agg(column_name::text ORDER BY column_name::text)
       FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
        AND grantee = 'authenticated' AND privilege_type = 'INSERT')  AS actual,
    (SELECT array_agg(column_name::text ORDER BY column_name::text)
       FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
        AND grantee = 'authenticated' AND privilege_type = 'INSERT')
      = ARRAY['char_end','char_start','color','page_number',
              'quote_hash','quote_text','source_document_id','source_reference_id'] AS pass
UNION ALL
SELECT
    'UPDATE',
    (SELECT array_agg(column_name::text ORDER BY column_name::text)
       FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
        AND grantee = 'authenticated' AND privilege_type = 'UPDATE'),
    (SELECT array_agg(column_name::text ORDER BY column_name::text)
       FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
        AND grantee = 'authenticated' AND privilege_type = 'UPDATE') = ARRAY['color'];

SELECT '== 6. anon holds no privilege of any kind on the table ==' AS section;
SELECT
    NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                 WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                   AND grantee = 'anon')                            AS no_table_privilege,
    NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                 WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                   AND grantee = 'anon')                            AS no_column_privilege,
    (NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                  WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                    AND grantee = 'anon')
     AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                      WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                        AND grantee = 'anon'))                      AS pass;

SELECT '== 7. authorship is a database fact: created_by DEFAULT auth.uid() ==' AS section;
-- Scalar subqueries rather than a FROM, and COALESCE rather than a bare LIKE:
-- a column with no default, and a table with no such column, must both read as
-- an explicit `f` on a row that is always returned. A release-critical check
-- may not ask an operator to tell a blank cell from a false one.
SELECT
    COALESCE((SELECT column_default FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                 AND column_name = 'created_by'), '<no default>')   AS column_default,
    COALESCE((SELECT column_default FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                 AND column_name = 'created_by') LIKE '%auth.uid()%',
             false)                                                 AS pass;

SELECT '== 8. RLS policies: read is owner-or-member, write is owner-or-EDITOR ==' AS section;
SELECT
    policyname,
    cmd,
    -- The write policy must NOT lean on role-agnostic membership, and must
    -- carry BOTH halves; the read policy legitimately uses is_board_member.
    CASE policyname
        WHEN 'knowledge_source_highlights_select'
            THEN cmd = 'SELECT' AND qual LIKE '%is_board_member%'
        WHEN 'knowledge_source_highlights_write'
            THEN cmd = 'ALL'
             AND qual NOT LIKE '%is_board_member%'
             AND with_check NOT LIKE '%is_board_member%'
             AND qual LIKE '%editor%'
             AND with_check LIKE '%editor%'
        ELSE false
    END                                                             AS pass
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'knowledge_source_highlights'
ORDER BY policyname;

SELECT '== 9. origin integrity: SECURITY DEFINER trigger, not client-callable ==' AS section;
SELECT
    EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgrelid = to_regclass('public.knowledge_source_highlights')
               AND tgname = 'knowledge_source_highlights_origin_check'
               AND NOT tgisinternal)                                AS trigger_exists,
    COALESCE((SELECT prosecdef FROM pg_proc
               WHERE oid = to_regprocedure('public.knowledge_source_highlight_origin_matches_document()')), false)
                                                                    AS security_definer,
    NOT COALESCE(has_function_privilege('authenticated',
        'public.knowledge_source_highlight_origin_matches_document()', 'EXECUTE'), false)
                                                                    AS authenticated_cannot_execute,
    NOT COALESCE(has_function_privilege('anon',
        'public.knowledge_source_highlight_origin_matches_document()', 'EXECUTE'), false)
                                                                    AS anon_cannot_execute,
    (EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = to_regclass('public.knowledge_source_highlights')
                AND tgname = 'knowledge_source_highlights_origin_check'
                AND NOT tgisinternal)
     AND COALESCE((SELECT prosecdef FROM pg_proc
                    WHERE oid = to_regprocedure('public.knowledge_source_highlight_origin_matches_document()')), false)
     AND NOT COALESCE(has_function_privilege('authenticated',
            'public.knowledge_source_highlight_origin_matches_document()', 'EXECUTE'), false)
     AND NOT COALESCE(has_function_privilege('anon',
            'public.knowledge_source_highlight_origin_matches_document()', 'EXECUTE'), false))
                                                                    AS pass;

SELECT '== 10. atomic citation RPC: SECURITY INVOKER, authenticated only ==' AS section;
WITH fn(sig) AS (
    VALUES ('public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)'::text)
)
SELECT
    to_regprocedure(sig) IS NOT NULL                                AS exists,
    NOT COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(sig)), true)
                                                                    AS security_invoker,
    COALESCE(has_function_privilege('authenticated', sig, 'EXECUTE'), false)
                                                                    AS authenticated_may_execute,
    NOT COALESCE(has_function_privilege('anon', sig, 'EXECUTE'), false)  AS anon_blocked,
    NOT COALESCE(has_function_privilege('public', sig, 'EXECUTE'), false) AS public_blocked,
    (to_regprocedure(sig) IS NOT NULL
     AND NOT COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(sig)), true)
     AND COALESCE(has_function_privilege('authenticated', sig, 'EXECUTE'), false)
     AND NOT COALESCE(has_function_privilege('anon', sig, 'EXECUTE'), false)
     AND NOT COALESCE(has_function_privilege('public', sig, 'EXECUTE'), false))
                                                                    AS pass
FROM fn;

SELECT '== 11. RELEASE GATE: highlight population, and what may deploy next ==' AS section;
SELECT
    (SELECT count(*) FROM public.knowledge_source_highlights)       AS highlight_rows,
    (SELECT count(*) FROM public.source_references
      WHERE char_start IS NOT NULL AND char_end IS NOT NULL
        AND page_start = page_end)                                  AS paintable_citations,
    -- The renderer has NO citation fallback. Until the backfill has run, an
    -- empty (or under-populated) highlight table means deploying the H2B
    -- application code would make existing highlights disappear.
    CASE
        WHEN (SELECT count(*) FROM public.source_references
               WHERE char_start IS NOT NULL AND char_end IS NOT NULL
                 AND page_start = page_end) = 0
            THEN 'no paintable citations exist -- renderer deploy is safe once reviewed'
        WHEN (SELECT count(*) FROM public.knowledge_source_highlights) = 0
            THEN 'BACKFILL NOT RUN -- do NOT deploy the H2B renderer yet'
        ELSE 'highlights present -- verify backfill coverage before deploying the renderer'
    END                                                             AS release_gate;

SELECT '== 12. roll-up ==' AS section;
SELECT
    to_regclass('public.knowledge_source_highlights') IS NOT NULL
    AND COALESCE((SELECT relrowsecurity FROM pg_class
                   WHERE oid = to_regclass('public.knowledge_source_highlights')), false)
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                       AND column_name = 'board_id')
    AND NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                     WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                       AND grantee IN ('authenticated', 'anon')
                       AND privilege_type IN ('INSERT', 'UPDATE', 'TRUNCATE'))
    AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                     WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                       AND grantee = 'anon')
    -- Both of the next two conjuncts are NULL-able at their source: array_agg
    -- over no grants is NULL, and a column with no default is NULL. An
    -- unguarded NULL would turn the whole AND-chain into NULL, and readiness
    -- would print as a blank cell instead of the `f` the state deserves.
    AND COALESCE((SELECT array_agg(column_name::text ORDER BY column_name::text)
                    FROM information_schema.column_privileges
                   WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                     AND grantee = 'authenticated' AND privilege_type = 'UPDATE')
                 = ARRAY['color'], false)
    AND COALESCE((SELECT column_default FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
                     AND column_name = 'created_by') LIKE '%auth.uid()%', false)
    AND NOT COALESCE((SELECT prosecdef FROM pg_proc
        WHERE oid = to_regprocedure('public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)')), true)
                                                                    AS pass;
