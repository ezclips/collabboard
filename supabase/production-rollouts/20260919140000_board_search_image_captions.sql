-- BOARD_SEARCH_IMAGE_CAPTIONS_1: an image on the board becomes findable.
--
-- WHAT WAS WRONG. An image post was not poorly indexed; it was not indexed at
-- all. `search_board_posts_text` filtered `p.type IN ('text','note','card')`
-- and the three padlets GIN indexes carried the same partial predicate, so an
-- image was never a candidate for any query. Meanwhile the one piece of
-- human-written text describing it -- `metadata.caption` -- was read by
-- nothing. A user who captions an image and later asks the assistant about it
-- gets nothing back, and no part of the product says why.
--
-- WHAT THE CORPUS ACTUALLY LOOKS LIKE, measured over all 2,126 padlets rather
-- than assumed. These numbers decided the rules below:
--
--   image posts                         320
--   titled literally "Image"            254
--   content empty / non-empty           293 / 27
--   carrying a caption key              277
--   caption actually NON-EMPTY           29
--   captions shaped like a filename       0
--
-- SO AN IMAGE'S `content` IS NOT INDEXED, and that is the least obvious
-- decision here. Of the 27 image rows with non-empty content, 4 hold a raw
-- image URL and the rest hold editor placeholder text -- "Click to add a
-- caption...", or an empty `<p></p>`. Indexing that would make every such image
-- match "click", "add" and "caption", which is not a retrieval improvement but
-- a noise injection into the corpus every other post shares. An image's
-- substance is its title and its caption; its `content` is machinery.
--
-- ONLY `caption`, NOT `photographer` OR `source`. Those are stock attribution
-- and they are not a marginal addition: `photographer` is present on 249 of the
-- 320 rows this migration admits, against 29 non-empty captions. Indexing them
-- would make attribution the dominant signal in the newly admitted set. Some
-- attribution leaks in through `caption` anyway ("Photo by Pixabay"), which is
-- an argument for holding the line here rather than widening it.
--
-- WHAT THE TRADE BUYS, STATED HONESTLY. 320 rows enter the indexed set and 29
-- of them carry human-written text today. The win is not corpus size: it is
-- that a captioned image can be retrieved at all, and that every image created
-- from here on is findable the moment someone captions it. The cost is write
-- amplification -- three GIN indexes maintained on every post edit, already
-- recorded as this design's standing price in .agent/retrieval-followups.md --
-- now over 320 more rows.
--
-- ONE DOCUMENT EXPRESSION, WHICH IS ALSO A REPAIR. The indexes and the search
-- function each spelled the searchable document out by hand, identically, in
-- four places. They had to match exactly or the planner could not prove the
-- bitmap scans, and nothing enforced that. Both now call
-- `public.searchable_post_document(...)`, so they cannot drift apart.
--
-- NON-IMAGE POSTS ARE UNCHANGED, BYTE FOR BYTE. For a post that is not an image
-- and carries no caption, the new function produces exactly the string the old
-- expression produced, so existing vectors, ranks and orderings do not move. A
-- source test asserts this rather than asserting that it was intended.
--
-- LOCKS. `CREATE INDEX` blocks writes on padlets for the duration of each
-- build. At 2,126 rows that is seconds. The builds are the LAST statements in
-- this file and are individually re-runnable, so on a larger database they can
-- be converted to `CREATE INDEX CONCURRENTLY` and run OUTSIDE the transaction
-- -- the same accommodation 20260918160000 makes, for the same reason.
--
-- SAFE TO RE-RUN. Every function is CREATE OR REPLACE; every index is
-- IF NOT EXISTS after an explicit DROP of the one expression that changed.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- The searchable document of one post: what the indexes index and what the
-- search function matches against. IMMUTABLE is not stylistic -- a
-- non-immutable expression cannot be indexed at all.
--
-- The title leads, as it did before and as the resolver still assumes.
CREATE OR REPLACE FUNCTION public.searchable_post_document(
    p_type text,
    p_title text,
    p_content text,
    p_metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
-- Present so the schema advisor stays clear, and harmless here: the body calls
-- only pg_catalog builtins and one IMMUTABLE function of ours, fully qualified.
SET search_path = ''
AS $$
    SELECT COALESCE(p_title, '')
        || CASE
               -- The caption, for any post that has one. In practice only an
               -- image does; written for all types so a caption added to
               -- another type later is not silently unsearchable.
               WHEN pg_catalog.btrim(COALESCE(p_metadata ->> 'caption', '')) = '' THEN ''
               ELSE ' ' || pg_catalog.btrim(p_metadata ->> 'caption')
           END
        || CASE
               -- An image's `content` is machinery: a raw URL, or the editor's
               -- "Click to add a caption..." placeholder. Never prose, and
               -- indexing it would inject those words into every board.
               WHEN p_type = 'image' THEN ''
               WHEN public.plain_text_from_post_content(p_content) = '' THEN ''
               ELSE ' ' || public.plain_text_from_post_content(p_content)
           END;
$$;

REVOKE ALL ON FUNCTION public.searchable_post_document(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.searchable_post_document(text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.searchable_post_document(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.searchable_post_document(text, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.searchable_post_document(text, text, text, jsonb) IS
    'BOARD_SEARCH_IMAGE_CAPTIONS_1: the searchable document of one post -- title, then metadata.caption when present, then the projected content except for images, whose content is a URL or editor placeholder. The single expression the padlets search indexes and search_board_posts_text both use, so they cannot drift apart.';

-- The displayed excerpt of one post. Separate from the document above because
-- the document leads with the title and an excerpt must not repeat it. For an
-- image this is the caption, which is the only readable thing it has.
CREATE OR REPLACE FUNCTION public.searchable_post_excerpt(
    p_type text,
    p_content text,
    p_metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE
               WHEN p_type = 'image'
                   THEN pg_catalog.btrim(COALESCE(p_metadata ->> 'caption', ''))
               ELSE public.plain_text_from_post_content(p_content)
           END;
$$;

REVOKE ALL ON FUNCTION public.searchable_post_excerpt(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.searchable_post_excerpt(text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.searchable_post_excerpt(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.searchable_post_excerpt(text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- The search function: same shape, same ranking, one wider predicate and one
-- shared document expression. Every rank decision below is 20260918180000's,
-- unchanged.
-- ---------------------------------------------------------------------------

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
SET search_path = ''
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    ),
    -- FILTERED FIRST, DELIBERATELY. The qual below is spelled exactly as the
    -- three padlets indexes are, and nothing from the laterals appears in it, so
    -- the planner can still prove the bitmap index scans. Everything expensive
    -- happens afterwards, on the rows that survived.
    matched AS (
        SELECT p.id, p.title, p.type, p.content, p.metadata,
               q.q_simple, q.q_english, q.q_german
          FROM public.padlets AS p, q
         WHERE p.board_id = p_board_id
           AND p.type IN ('text', 'note', 'card', 'image')
           AND (pg_catalog.to_tsvector('simple'::regconfig,
                    public.searchable_post_document(p.type, p.title, p.content, p.metadata)) @@ q.q_simple
             OR pg_catalog.to_tsvector('english'::regconfig,
                    public.searchable_post_document(p.type, p.title, p.content, p.metadata)) @@ q.q_english
             OR pg_catalog.to_tsvector('german'::regconfig,
                    public.searchable_post_document(p.type, p.title, p.content, p.metadata)) @@ q.q_german)
    )
    SELECT
        m.id AS padlet_id,
        COALESCE(m.title, '') AS title,
        body.text,
        -- ONE TERM IS NOT A RANKING. Where `simple` saw two or more terms it has
        -- a real view and it governs. Where it saw one or none, a stemmed view
        -- that strictly sees more supersedes it. Flag 0: a post's rank is the
        -- evidence it carries, not its length (20260918150000).
        CASE WHEN n.n_simple >= 2
               THEN pg_catalog.ts_rank(v.v_simple, m.q_simple, 0)
             WHEN GREATEST(n.n_english, n.n_german) > n.n_simple
               THEN GREATEST(pg_catalog.ts_rank(v.v_english, m.q_english, 0),
                             pg_catalog.ts_rank(v.v_german,  m.q_german,  0))
             ELSE pg_catalog.ts_rank(v.v_simple, m.q_simple, 0)
        END AS rank
      FROM matched AS m
      -- The excerpt runs ONCE per matched row here, instead of repeatedly in
      -- the qual and the rank as it did before.
      CROSS JOIN LATERAL (
          SELECT public.searchable_post_excerpt(m.type, m.content, m.metadata) AS text
      ) AS body
      CROSS JOIN LATERAL (
          SELECT public.searchable_post_document(m.type, m.title, m.content, m.metadata) AS document
      ) AS d
      CROSS JOIN LATERAL (
          SELECT pg_catalog.to_tsvector('simple'::regconfig, d.document)  AS v_simple,
                 pg_catalog.to_tsvector('english'::regconfig, d.document) AS v_english,
                 pg_catalog.to_tsvector('german'::regconfig, d.document)  AS v_german
      ) AS v
      -- How many DISTINCT query terms each configuration matches, counted
      -- against the vectors above rather than by rebuilding one per term.
      CROSS JOIN LATERAL (
          SELECT pg_catalog.count(*) FILTER (
                     WHERE v.v_simple @@ pg_catalog.to_tsquery('simple'::regconfig, t.term))::int AS n_simple,
                 pg_catalog.count(*) FILTER (
                     WHERE v.v_english @@ pg_catalog.to_tsquery('english'::regconfig, t.term))::int AS n_english,
                 pg_catalog.count(*) FILTER (
                     WHERE v.v_german @@ pg_catalog.to_tsquery('german'::regconfig, t.term))::int AS n_german
            FROM (
                SELECT pg_catalog.btrim(raw) AS term
                  FROM pg_catalog.unnest(pg_catalog.string_to_array(p_query, '|')) AS raw
                 -- An empty term would make to_tsquery raise a syntax error, so
                 -- a trailing separator must not become a query.
                 WHERE pg_catalog.btrim(raw) <> ''
            ) AS t
      ) AS n
     ORDER BY rank DESC, (body.text <> '') DESC, m.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text, note, card and image posts of one board under three configurations. An image is matched on its title and metadata.caption; its content is a URL or editor placeholder and is deliberately not indexed. Ranked by simple where simple matched two or more query terms; otherwise by the stemmed configuration that strictly matched more. Evidence-only normalization, with a body-over-title-only tie-break. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- INDEX BUILDS. Last, outside the transaction above, and individually
-- re-runnable -- so they can be converted to CREATE INDEX CONCURRENTLY on a
-- database where seconds of blocked writes on padlets is not acceptable.
--
-- The expression and the predicate must match the search function's qual
-- EXACTLY or the planner cannot prove the bitmap scans. That is now one
-- function call in both places rather than a spelling to keep in sync.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.padlets_search_gin;
DROP INDEX IF EXISTS public.padlets_search_en_gin;
DROP INDEX IF EXISTS public.padlets_search_de_gin;

CREATE INDEX IF NOT EXISTS padlets_search_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('simple'::regconfig,
        public.searchable_post_document(type, title, content, metadata)))
    WHERE type IN ('text', 'note', 'card', 'image');

CREATE INDEX IF NOT EXISTS padlets_search_en_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('english'::regconfig,
        public.searchable_post_document(type, title, content, metadata)))
    WHERE type IN ('text', 'note', 'card', 'image');

CREATE INDEX IF NOT EXISTS padlets_search_de_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('german'::regconfig,
        public.searchable_post_document(type, title, content, metadata)))
    WHERE type IN ('text', 'note', 'card', 'image');
