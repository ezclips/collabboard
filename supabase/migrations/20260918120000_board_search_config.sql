-- BOARD_SEARCH_INDEX_1: the text-search foundation, and the three things
-- verification changed before anything could read it.
--
-- ------------------------------------------------------------------------
-- WHAT THIS IS.
-- ------------------------------------------------------------------------
-- The schema half of a toggle that searches the board's own posts and its PDF
-- text, so Board AI is not limited to the four sources a user attaches. This
-- ships the parts that cost real time on a populated database -- the built
-- indexes -- and no reader for them yet. Nothing user-facing changes.
--
-- ------------------------------------------------------------------------
-- THERE ARE NO NEW COLUMNS HERE, AND THAT IS A DELIBERATE REVISION.
-- ------------------------------------------------------------------------
-- An earlier version of this migration added `search_config regconfig NOT NULL`
-- to both tables and a stored `search_text` on padlets. Two findings killed
-- that shape before anything read it:
--
--   * SUPABASE DOES NOT SUPPORT reg* TYPES IN TABLES. Its advisor flags
--     `regconfig` on both tables as `unsupported_reg_types`: a reg* value is an
--     environment-dependent OID, so it does not survive a restore into another
--     project as the same config. This project runs on Supabase, so the config
--     cannot be stored as one.
--   * THE STORED PROJECTION WAS A SECOND DEFINITION THAT DISAGREED. The
--     TypeScript side (plainTextFromPostContent, lib/server/ai/boardAiChatContext.ts)
--     has been live for a while; a faithful SQL port is a different function.
--     They differed on four axes -- tags removed vs replaced by a space, block
--     closers becoming newlines vs spaces, entity decode order, and newline-run
--     collapsing -- and the first fixture set described the SQL behaviour rather
--     than the live one. See below.
--
-- So this is now an EXPRESSION index over the columns that already exist, with
-- the config written as a literal. The per-document config column is deferred to
-- the detection commit, which has to rebuild these indexes anyway -- and that is
-- the honest correction to the earlier "expensive to retrofit" claim: a text
-- column is a metadata-only ADD COLUMN, and the index build is the expense.
--
-- ------------------------------------------------------------------------
-- THE PROJECTION IS PORTED, NOT DESIGNED. TYPESCRIPT IS THE DEFINITION.
-- ------------------------------------------------------------------------
-- plain_text_from_post_content below is a faithful port of the live TS chain,
-- including its imperfections, because the model and the search index must see
-- the same words for the same post:
--
--   * <br> and </p|div|li|h1-6> become NEWLINES; other tags are removed with no
--     replacement, so "foo<strong>bar</strong>" is "foobar", not "foo bar";
--   * entities decode in THIS order: &nbsp; &amp; &lt; &gt; &quot; &#39; --
--     which means "&amp;lt;" decodes TWICE, to "<". That is arguably wrong and
--     it is what the live implementation does; conforming to it is a smaller
--     change than altering what the model has been shown;
--   * runs of three or more newlines collapse to two;
--   * leading and trailing whitespace is trimmed.
--
-- ONE KNOWN, BOUNDED DIFFERENCE: btrim here strips exactly four characters --
-- space, tab, newline and carriage return. JavaScript's trim() strips those and
-- more, in two groups: the ASCII controls form feed (U+000C) and vertical tab
-- (U+000B), which are not Unicode spaces at all; and the Unicode set U+00A0,
-- U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF.
--
-- The bound is narrow all the same. It can only show as a RAW one of those
-- characters at the very start or end of a post body: by the time trimming
-- happens `&nbsp;` has already become a plain space, which both sides strip, and
-- anything in the middle of the text is untouched by either. No fixture covers
-- it, no search depends on it, and it is recorded rather than papered over.
--
-- The fixture list that pins the two together lives in the paired verify file
-- and in a TypeScript test that asserts the same inputs and outputs.
--
-- ------------------------------------------------------------------------
-- WHY THE GRANT TO authenticated, WHEN NOTHING HERE IS A GENERATED COLUMN.
-- ------------------------------------------------------------------------
-- Whether an INDEX expression is evaluated with the privileges of the writing
-- role is not something this migration is willing to guess at, and the failure
-- mode if it is -- every padlet insert and update refused -- is the app breaking
-- for a reason nobody would look for. The function is pure: it reads no table,
-- no row and no session, and returns a transform of its own argument, so the
-- grant costs nothing. PUBLIC and anon are revoked; anon has no write on padlets
-- to need it, and the verify file asserts that.
--
-- ------------------------------------------------------------------------
-- LOCKS. CREATE INDEX builds over every row and holds a lock that blocks writes
-- for the duration. On this database padlets held 2126 rows, so it is seconds;
-- on a larger deployment run it in a quiet window.
-- ------------------------------------------------------------------------
--
-- SAFE TO RE-RUN, AND IT CONVERGES. The removals at the top are IF EXISTS, so a
-- database that still carries the trialled shape is brought to this one, and a
-- database that never had it is unaffected.
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
