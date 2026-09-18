-- ROLLBACK for 20260918140000_board_search_rank_normalization.sql.
--
-- READ THIS BEFORE RUNNING IT.
--
-- THIS IS A REVERT, NOT A DROP, and that is the important difference from the
-- rollback beside it. 20260918140000 REPLACED two functions that already
-- existed; dropping them would leave the application calling functions that are
-- gone, which is a harder failure than the one being undone. So this restores
-- the 20260918130000 bodies exactly -- `SET search_path = public` and ts_rank
-- with no normalization argument.
--
-- WHAT YOU ARE CHOOSING BY RUNNING IT. You are restoring the DEFAULT
-- normalization flag 0, which ignores document length. On these corpora that
-- means longer text outranks shorter text largely by being longer: posts have a
-- median of 13 characters and PDF chunks reach 6,000, so a note reading exactly
-- "Iran oil headlines" loses to a chunk mentioning oil eight times.
--
-- THERE IS NO ERROR WHEN THIS TAKES EFFECT. Every query still succeeds and every
-- row still comes back; only the ORDER changes, and it changes toward worse
-- answers. If you run this, note it somewhere a person will read -- the symptom
-- is "board search returns odd results", which nobody traces to a rollback.
--
-- IF YOU ARE ROLLING BACK THE WHOLE FEATURE, do not run this file: run
-- 20260918130000_board_search_text_functions_rollback.sql, which drops both
-- functions outright. This file is for reverting the ranking correction alone
-- while leaving search in place.
--
-- NO DATA IS LOST either way. Both functions are pure reads over existing
-- tables; nothing here stores anything, so there is nothing to restore.
--
-- THE SIGNATURES ARE UNCHANGED, so the grants survive CREATE OR REPLACE and are
-- restated below only to keep this file a complete definition of the state it
-- produces.
--
-- IT DOES NOT TOUCH THE VECTOR RPC. `search_board_knowledge_chunks` (no `_text`)
-- is the older embedding search, a different function with a different
-- signature. The names are one suffix apart; check twice before editing this.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

CREATE OR REPLACE FUNCTION public.search_board_posts_text(
    p_board_id uuid,
    p_query text,
    p_limit integer DEFAULT 4
)
RETURNS TABLE(
    padlet_id uuid,
    title text,
    text text,
    rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query) AS query
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    ),
    matched AS (
        SELECT
            p.id AS padlet_id,
            COALESCE(p.title, '') AS title,
            public.plain_text_from_post_content(p.content) AS text,
            pg_catalog.to_tsvector(
                'simple'::regconfig,
                COALESCE(p.title, '')
                || CASE
                       WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                       ELSE ' ' || public.plain_text_from_post_content(p.content)
                   END) AS document
          FROM public.padlets AS p
         WHERE p.board_id = p_board_id
           AND p.type IN ('text', 'note')
    )
    SELECT
        matched.padlet_id,
        matched.title,
        matched.text,
        -- REVERTED to the default normalization, which ignores document length.
        pg_catalog.ts_rank(matched.document, q.query) AS rank
      FROM matched, q
     WHERE matched.document @@ q.query
     ORDER BY rank DESC, matched.padlet_id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

REVOKE ALL ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    TO service_role;

CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks_text(
    p_board_id uuid,
    p_query text,
    p_limit integer DEFAULT 4
)
RETURNS TABLE(
    chunk_id uuid,
    document_id uuid,
    original_filename text,
    page_start integer,
    page_end integer,
    chunk_index integer,
    text text,
    source_locators jsonb,
    rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query) AS query
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    )
    SELECT
        c.id AS chunk_id,
        c.document_id,
        d.original_filename,
        c.page_start,
        c.page_end,
        c.chunk_index,
        c.text,
        c.source_locators,
        -- REVERTED to the default normalization.
        pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query) AS rank
      FROM public.knowledge_chunks AS c
      JOIN public.knowledge_documents AS d ON d.id = c.document_id
      CROSS JOIN q
     WHERE d.board_id = p_board_id
       AND d.processing_status = 'ready'
       AND pg_catalog.to_tsvector('simple'::regconfig, c.text) @@ q.query
     ORDER BY rank DESC, c.chunk_index ASC, c.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

COMMIT;
