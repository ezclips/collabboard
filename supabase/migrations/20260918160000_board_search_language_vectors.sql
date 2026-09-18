-- BOARD_SEARCH_READ_4: three text-search configurations per row, and the batch
-- of index changes that were waiting for a rebuild.
--
-- ========================================================================
-- DESIGN C: PARALLEL VECTORS. WHAT IT IS AND WHY IT WON.
-- ========================================================================
-- Every searchable row is indexed THREE TIMES -- under `simple`, `english` and
-- `german` -- and a query is parsed under all three and matched against all
-- three. Rank is the GREATEST of the three.
--
-- THE PROPERTY THAT DECIDED IT: `simple` IS RETAINED UNCHANGED, so no match that
-- exists today can disappear. `simple` stems nothing and drops nothing, so it is
-- a strict superset of what any stemming configuration will match on exact
-- tokens. The two new vectors can only ADD rows. That turns this from "re-tune
-- retrieval" into "add two vectors and measure what they add", and it is why the
-- acceptance criteria below are all of the form "strictly more".
--
-- THE MEASURED GAIN, from the read-only probe run against this board:
--
--   token        simple       english    german
--   Stoßstange   stoßstange   stoßstang  stossstang
--   löse/lösen   löse/lösen   löse/lösen los/los
--   ribbed       ribbed       rib        ribbed
--   Ribbing      ribbing      rib        ribbing
--
--   q10's answering chunk: rank 0.00778 (simple) -> 0.01413 (german) at flag 1,
--   and its lead over the next passage widens from 1.10x to 1.29x.
--
-- The German stemmer also folds ß to ss, so a user typing `Stossstange` and a
-- user typing `Stoßstange` both land on the same rows. That is a real gain on a
-- board that is already bilingual and it is unavailable under any single config.
--
-- ------------------------------------------------------------------------
-- WHAT WAS REJECTED, WITH THE MEASUREMENT THAT REJECTED IT.
-- ------------------------------------------------------------------------
-- DESIGN A, one DETECTED config per row, is rejected twice over. Detection is
-- least reliable exactly where this corpus lives -- the median chunk is 56
-- characters -- and a misdetection is silent and permanent until re-ingestion.
-- It also cannot serve a German chunk that borrows English words, because one
-- row gets one config. And it would need language denormalised onto
-- knowledge_chunks, since an index expression may only reference its own table
-- and the language of a chunk is a property of its document.
--
-- DESIGN B, ONE MERGED VECTOR of all three configs, is rejected on measurement
-- rather than on the theory that was offered against it. The theory -- that a
-- word all three configs agree on appears three times and inflates rank -- was
-- WRONG. Merged/simple rank ratios came back MIXED: answer 1.26x, intro 0.94x,
-- lubricant 0.85x, slideshow 0.79x, title-only post 0.91x. Normalization by
-- query-term count and by length swamps the occurrence tripling, in both
-- directions. B does not inflate rank uniformly; it PERTURBS rank
-- unpredictably, which is a worse property and a harder one to reason about.
--
-- ------------------------------------------------------------------------
-- WHAT C DOES NOT FIX, STATED BEFORE ANYONE READS IT AS A CURE.
-- ------------------------------------------------------------------------
-- 1. q08 DOES NOT FLIP, AND NO DESIGN FLIPS IT. Under `english` the answering
--    paragraph finally MATCHES -- `ribbed` and `Ribbing` both stem to `rib` --
--    and the gap narrows from 3.07x to 1.35x. The introduction still leads.
--    Coverage favours the introduction under `english` too (its three query
--    terms stem to two, which the answer also has), so no lexical rule separates
--    them. What is left is the ranking-versus-semantics problem the battery
--    already showed the whole flag family cannot solve. The ACHIEVEMENT here is
--    that the answer's vocabulary now enters the query at all; the ORDERING
--    remains inverted, and its tripwire still asserts the defect.
--
-- 2. THE `will` COLLISION IS NOT RECOVERED, and an earlier draft of this design
--    claimed it would be. That claim was false: `to_tsvector('german', 'will')`
--    is EMPTY -- the German dictionary carries `will` in its own stopword list,
--    as it does `wollen`. Only the `simple` vector holds the lexeme, and the
--    application drops the term from the query before any configuration sees it.
--    So `will` stays lost, exactly as documented. If it is ever wanted back, the
--    fix is a QUERY-SIDE policy -- retain the term for the `simple` query alone
--    -- and not a vector. The six-word collision set (am, an, in, so, was, will)
--    is restated here so it is not rediscovered a third time.
--
-- ========================================================================
-- THE BATCH. EVERY INDEX CHANGE THAT WAS WAITING FOR A REBUILD.
-- ========================================================================
-- These are bundled because CREATE INDEX is the expensive part and holds a lock
-- that blocks writes. Paying it once is the entire reason they were batched.
--
-- (a) THE LANGUAGE VECTORS -- above.
--
-- (b) R2's TYPE WIDENING, WITH ITS FIXTURE -- and the fixture changed the
--     answer. R2's criterion is that a padlet type qualifies only if its
--     substance is PROSE IN `content`. Surveyed live across 1,000 rows:
--
--       card     PASSES. TipTap HTML prose in `content`, the same shape as
--                `text` and `note`. 152 rows, 43 with content. ADDED.
--       comment  FAILS, and this is the finding. It LOOKS like the strongest
--                candidate -- 42 of 44 rows are HTML -- but `content` holds a
--                rendered SUMMARY of a thread that lives elsewhere, complete
--                with truncation markers: `"<p>one bug left</p>..." (+2 more)`.
--                Indexing it would index truncated text plus the literal token
--                `more`. NOT ADDED -- and it CONFIRMS R3's ceiling with evidence
--                rather than by assertion: the conversation really is not in
--                `padlets.content`.
--       column   FAILS. Plain-text placeholder scaffolding ("Column Header /
--                Item 1 / Item 2 / Add more items..."), 4 rows, no prose.
--       image    FAILS. `content` is a caption on some rows and a raw URL on
--                others. Inconsistent substance is not substance.
--       link     FAILS. `content` is a URL. Not prose.
--       todo, table, drawing, container, date, file  FAIL. Structured JSON or
--                structured text; indexing them would put JSON keys in the index.
--
--     So the predicate becomes type IN ('text', 'note', 'card').
--
-- (c) THE `<br>` REGEX MOVES TO E'' FORM. `'<br\s*/?>'` depends on
--     standard_conforming_strings being on: with it OFF the backslash is an
--     escape and the pattern silently degrades to `<brs*/?>`, which matches
--     nothing, and every <br> stops becoming a newline. E'<br\\s*/?>' is the
--     same pattern under either setting. Behaviour is UNCHANGED on any
--     standard-conforming database; this removes a dependency, not a bug.
--
-- (d) THE DOUBLE EVALUATION OF THE PROJECTION IS GONE. The old padlets index
--     expression called plain_text_from_post_content(content) TWICE -- once in a
--     CASE test and once in its ELSE -- so every insert and update ran the whole
--     regex chain twice per row, per index. The CASE existed to avoid a trailing
--     space on a title-only post. It is replaced by a single call:
--
--         COALESCE(title, '') || ' ' || plain_text_from_post_content(content)
--
--     THE TOKENS ARE IDENTICAL. to_tsvector ignores trailing whitespace, so a
--     title-only post produces exactly the lexemes it produced before. This is
--     three times less work per write with no change to what is matched.
--
-- (e) TITLE WEIGHTS ARE **NOT** IN THIS BATCH, AND THAT IS A CORRECTION TO THE
--     PLAN RATHER THAN AN OMISSION. setweight was batched here on the
--     assumption that it changes the index expression. It does not have to.
--     MATCHING and RANKING can use different vectors: `@@` runs against the
--     indexed unweighted vector, and ts_rank can be handed a DIFFERENT,
--     setweight-ed vector built on the fly for the handful of rows that matched.
--     Both contain the same lexemes, so nothing matchable becomes unrankable.
--
--     That makes title weights a FUNCTION-BODY CHANGE WITH NO REBUILD, which is
--     what unblocks scoring them honestly: they can now be measured on the
--     shipping expressions, across all eleven battery questions, and adopted or
--     dropped without paying this cost again. The same argument applies to the
--     document-filename weight for chunks -- which could never have been indexed
--     anyway, because `original_filename` lives on knowledge_documents and an
--     index expression may only reference its own table.
--
--     scripts/db/boardSearchTitleWeightVariants.sql is the probe that scores it.
--
-- ========================================================================
-- COSTS, PLAINLY.
-- ========================================================================
-- THREE INDEXES PER TABLE INSTEAD OF ONE. The build is trivial at this size --
-- 2,126 padlets and 86 chunks -- and the real price is WRITE AMPLIFICATION:
-- every post edit and every ingestion now maintains three GIN indexes instead of
-- one. That is the standing cost of this design and it does not go away.
--
-- GREATEST() ACROSS THREE CONFIGURATIONS IS A SCALE MIX. A `german` rank and a
-- `simple` rank are not the same quantity, and taking the larger presents an
-- arithmetic maximum as a judgement. It is scored on the battery before it is
-- trusted: the passage SET should be unchanged (because `simple` is retained),
-- so what moves is ORDERING -- and ordering is exactly what the battery
-- measures.
--
-- LOCKS. CREATE INDEX holds a lock that blocks writes on padlets and
-- knowledge_chunks for the duration of each build. At this table size that is
-- seconds. On a larger database, convert these to CREATE INDEX CONCURRENTLY and
-- run them OUTSIDE a transaction -- which is why the index builds are the last
-- statements in the file and are individually re-runnable.
--
-- SAFE TO RE-RUN. Every index is IF NOT EXISTS after an explicit DROP of the one
-- expression that changed; every function is CREATE OR REPLACE.
--
-- VERIFY WITH:
--   20260918160000_board_search_language_vectors_verify.sql
-- UNDO WITH (read its header first):
--   20260918160000_board_search_language_vectors_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- ------------------------------------------------------------------------
-- (c) The projection, with the E'' regex. Nothing else in it changes.
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plain_text_from_post_content(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    WITH br AS (
        -- E'' FORM, DELIBERATE. The plain-string form '<br\s*/?>' means literal
        -- backslash-s only while standard_conforming_strings is on. With it off
        -- the pattern degrades to <brs*/?> and silently stops matching anything.
        SELECT pg_catalog.regexp_replace(COALESCE(p_content, ''), E'<br\\s*/?>', E'\n', 'gi') AS t
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

-- ------------------------------------------------------------------------
-- The posts search, across three configurations.
-- ------------------------------------------------------------------------
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
        -- ONE TERM LIST, THREE QUERIES. The caller sends a single tsquery
        -- EXPRESSION -- `alpha | beta | gamma` -- and each configuration parses
        -- it in its own way. That is the whole of the query-side change: the
        -- application still builds one list of terms.
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    )
    SELECT
        p.id AS padlet_id,
        COALESCE(p.title, '') AS title,
        public.plain_text_from_post_content(p.content) AS text,
        -- GREATEST OF THE THREE. A row that matches under two configurations is
        -- ranked by whichever saw it best, and a row that matches under one is
        -- ranked by that one. Flag 0 on posts, unchanged: a post's rank is the
        -- evidence it carries, not its length. See 20260918150000.
        GREATEST(
            pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                q.q_simple, 0),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                q.q_english, 0),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                q.q_german, 0)
        ) AS rank
      FROM public.padlets AS p, q
     WHERE p.board_id = p_board_id
       -- Written out so the planner can prove it implies the partial indexes.
       -- `card` joins `text` and `note` per R2's fixture; see the header.
       AND p.type IN ('text', 'note', 'card')
       -- THE EXPRESSIONS ARE REPEATED VERBATIM FROM THE INDEX DEFINITIONS, and
       -- they are inline against the base table rather than hidden behind a CTE
       -- for one reason: the planner matches an expression index by comparing
       -- parse trees against the qual. A tidier formulation that the planner
       -- cannot match would turn every search into a sequential scan running the
       -- projection over every post on the board, and the only symptom is
       -- latency.
       AND (pg_catalog.to_tsvector('simple'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_simple
         OR pg_catalog.to_tsvector('english'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_english
         OR pg_catalog.to_tsvector('german'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_german)
     -- Equal evidence, then a body beats no body, then the id. Unchanged from
     -- 20260918150000; the tie-break is why flag 0 is safe here.
     ORDER BY rank DESC, (public.plain_text_from_post_content(p.content) <> '') DESC, p.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text, note and card posts of one board under three configurations (simple, english, german), ranked by the greatest of the three with evidence-only normalization and a body-over-title-only tie-break. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    TO service_role;

-- ------------------------------------------------------------------------
-- The chunk search, across three configurations.
-- ------------------------------------------------------------------------
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
SET search_path = ''
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
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
        -- Flag 1 on chunks, unchanged and deliberately different from posts:
        -- chunk lengths span two orders of magnitude, so length normalization
        -- is load-bearing here and harmful there. The two ranks are never
        -- compared -- the caller takes top-K per source.
        GREATEST(
            pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text),  q.q_simple, 1),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig, c.text), q.q_english, 1),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig, c.text),  q.q_german, 1)
        ) AS rank
      FROM public.knowledge_chunks AS c
      JOIN public.knowledge_documents AS d ON d.id = c.document_id
      CROSS JOIN q
     WHERE d.board_id = p_board_id
       -- Only a finished document has persisted text. Matching an in-flight one
       -- would cite a page that may still change.
       AND d.processing_status = 'ready'
       AND (pg_catalog.to_tsvector('simple'::regconfig, c.text)  @@ q.q_simple
         OR pg_catalog.to_tsvector('english'::regconfig, c.text) @@ q.q_english
         OR pg_catalog.to_tsvector('german'::regconfig, c.text)  @@ q.q_german)
     ORDER BY rank DESC, c.chunk_index ASC, c.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text IS
    'Full-text search the PDF chunks of one board under three configurations (simple, english, german), ranked by the greatest of the three with length normalization. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

-- ------------------------------------------------------------------------
-- THE INDEXES. Six, and the padlets expression changed, so the old one goes.
-- ------------------------------------------------------------------------
-- The chunks `simple` index is UNCHANGED in expression, so it is left in place
-- rather than dropped and rebuilt for nothing.
DROP INDEX IF EXISTS public.padlets_search_gin;

CREATE INDEX IF NOT EXISTS knowledge_chunks_search_en_gin
    ON public.knowledge_chunks
    USING gin (pg_catalog.to_tsvector('english'::regconfig, text));

CREATE INDEX IF NOT EXISTS knowledge_chunks_search_de_gin
    ON public.knowledge_chunks
    USING gin (pg_catalog.to_tsvector('german'::regconfig, text));

CREATE INDEX IF NOT EXISTS padlets_search_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)))
    WHERE type IN ('text', 'note', 'card');

CREATE INDEX IF NOT EXISTS padlets_search_en_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('english'::regconfig,
        COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)))
    WHERE type IN ('text', 'note', 'card');

CREATE INDEX IF NOT EXISTS padlets_search_de_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('german'::regconfig,
        COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)))
    WHERE type IN ('text', 'note', 'card');

COMMIT;
