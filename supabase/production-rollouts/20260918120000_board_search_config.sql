-- PRODUCTION ROLLOUT -- the text-search foundation for board posts and PDF text.
--
-- SOURCE: supabase/migrations/20260918120000_board_search_config.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * this is the SCHEMA half of a toggle that lets Board AI search the board's
--     own posts and its PDF text instead of only the four sources a user
--     attaches. It ships the part that costs real time on a populated database
--     -- the built indexes -- and NO READER for them. Nothing user-facing
--     changes when this is applied;
--   * THERE ARE NO NEW COLUMNS. An earlier trial added `search_config regconfig`
--     to both tables and a stored `search_text` on padlets. Supabase's advisor
--     flags reg* types in tables as unsupported -- a reg* value is an
--     environment-dependent OID that does not survive a restore as the same
--     config -- and the stored projection was a second definition that disagreed
--     with the live TypeScript one. Both were removed before anything read them;
--   * the projection is a PORT, not a design. `plain_text_from_post_content` is
--     a faithful copy of `plainTextFromPostContent` in
--     lib/server/ai/boardAiChatContext.ts, imperfections included, because the
--     index and the model must see the same words for the same post.
--
-- THIS ROLLOUT NEEDS NO APPLICATION DEPLOY, AND THAT IS THE POINT. Nothing in
-- the application reads the function or either index yet. Applying this early is
-- safe and is how the index build cost is paid before the reader exists; the
-- reader ships in a later commit and will depend on these objects.
--
-- CONVERGENCE. The removals at the top are IF EXISTS, so a database still
-- carrying the trialled shape is brought to this one, and a database that never
-- had it is unaffected. Re-running is safe.
--
-- LOCKS. CREATE INDEX builds over every row and holds a lock that blocks writes
-- for the duration. On the database this was applied to, padlets held 2126 rows,
-- so it was seconds; on a larger deployment run it in a quiet window.
--
-- VERIFY WITH:
--   20260918120000_board_search_config_verify.sql
-- UNDO WITH (read its header first):
--   20260918120000_board_search_config_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- CONVERGENCE. A database that ran the earlier version of this migration still
-- carries these; drop them first so this file is correct from either state.
-- The generated column depends on the function, so it goes before the function.
DROP INDEX IF EXISTS public.knowledge_chunks_search_gin;
DROP INDEX IF EXISTS public.padlets_search_gin;
ALTER TABLE public.padlets DROP COLUMN IF EXISTS search_text;
ALTER TABLE public.padlets DROP COLUMN IF EXISTS search_config;
ALTER TABLE public.knowledge_chunks DROP COLUMN IF EXISTS search_config;

-- Strip tags, then decode, then collapse newline runs, then trim. Order is the
-- live implementation's order, not the tidier one. See the header.
CREATE OR REPLACE FUNCTION public.plain_text_from_post_content(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
-- Present so the schema advisor stays clear, and harmless here: the body calls
-- only pg_catalog builtins, fully qualified.
SET search_path = ''
AS $$
    WITH br AS (
        SELECT pg_catalog.regexp_replace(COALESCE(p_content, ''), '<br\s*/?>', E'\n', 'gi') AS t
    ), closers AS (
        SELECT pg_catalog.regexp_replace(t, '</(p|div|li|h[1-6])>', E'\n', 'gi') AS t FROM br
    ), tags AS (
        SELECT pg_catalog.regexp_replace(t, '<[^>]*>', '', 'g') AS t FROM closers
    ), entities AS (
        SELECT pg_catalog.replace(
                 pg_catalog.replace(
                   pg_catalog.replace(
                     pg_catalog.replace(
                       pg_catalog.replace(
                         pg_catalog.replace(t, '&nbsp;', ' '),
                       '&amp;', '&'),
                     '&lt;', '<'),
                   '&gt;', '>'),
                 '&quot;', '"'),
               '&#39;', '''') AS t
          FROM tags
    )
    SELECT pg_catalog.btrim(
             pg_catalog.regexp_replace(t, E'\n{3,}', E'\n\n', 'g'),
             E' \t\n\r')
      FROM entities;
$$;

REVOKE ALL ON FUNCTION public.plain_text_from_post_content(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plain_text_from_post_content(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.plain_text_from_post_content(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plain_text_from_post_content(text) TO service_role;

-- PDF chunks are already plain text. The config is a literal because the row
-- that would carry it cannot be typed regconfig on this platform; see the header.
CREATE INDEX IF NOT EXISTS knowledge_chunks_search_gin
    ON public.knowledge_chunks
    USING gin (pg_catalog.to_tsvector('simple'::regconfig, text));

-- Posts are TipTap HTML, so the expression runs the projection. The title leads,
-- as it does in the resolver, so a search can match a post by its title.
--
-- The predicate keeps non-prose post types out of the index entirely. It is also
-- what the search function will have to repeat in its own WHERE clause for the
-- planner to consider this index.
CREATE INDEX IF NOT EXISTS padlets_search_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector(
        'simple'::regconfig,
        COALESCE(title, '')
        || CASE
               WHEN public.plain_text_from_post_content(content) = '' THEN ''
               ELSE ' ' || public.plain_text_from_post_content(content)
           END))
    WHERE type IN ('text', 'note');

COMMIT;
