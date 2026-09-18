-- READ-ONLY: the ADMISSION rules, scored per row with stemmed term counts.
--
-- ------------------------------------------------------------------------
-- WHY THIS IS SQL AND NOT TYPESCRIPT.
-- ------------------------------------------------------------------------
-- Every candidate here turns on HOW MANY QUERY TERMS A ROW MATCHES UNDER EACH
-- CONFIGURATION. That is a stemming question, so counting it in TypeScript would
-- mean re-implementing three snowball stemmers -- which is the exact error the
-- battery exists to prevent, and the reason the battery's own `coverage` column
-- is an EXACT-token count and cannot answer this.
--
-- ------------------------------------------------------------------------
-- THE PROBLEM BEING SCORED.
-- ------------------------------------------------------------------------
-- Design C grew the result set on 6 of 11 questions. NINE OF THE TEN ADDED
-- PASSAGES ARE RATED IRRELEVANT, and eight of those nine are SINGLE-TERM
-- cross-language collisions:
--
--   `bumper` -> de `bump`    matches a knitting page's "horizontal bump"
--   `note`   -> de `not`     matches every English "not" in a device manual
--   `linked` -> en `link`    meets German "links" (= left) in a car-repair post
--   `fix`    -> en `fix`     matches "5 fixed stimulation gears" -- and breaks
--                            q06, the CONTROL question, which must return nothing
--   `year`   -> en `year`    matches "In recent years"
--
-- CANDIDATE (a), THE TWO-TERM RULE: a row admitted SOLELY by english or german
-- must match at least TWO query terms under that configuration. It is the only
-- candidate aimed at the measured mechanism rather than at a proxy for it.
--
-- ITS COST, STATED BEFORE THE NUMBERS ARRIVE so the result is not read as free:
-- it sacrifices SINGLE-TERM INFLECTION RECALL. A German plural whose singular is
-- the query term, matching nothing else, would no longer be admitted. That is a
-- real loss and this board may simply not contain an example of it -- absence
-- here is not evidence of absence generally.
--
-- IT ALSO DOES NOT REACH q10's two German additions. Those are legitimate
-- same-language matches on `lösen`/`Stoßstange` that merely fail to answer the
-- question, so no admission rule keyed on term COUNT will exclude them. They are
-- a relevance problem, not an admission problem.
--
-- CANDIDATE (b), NON-ASCII GATE for `german` -- admit a german-only row only if
-- it contains a non-ASCII character. Weaker on inspection: q09's Audi post
-- contains "Möchte", so the collision that tops that block survives it.
--
-- CANDIDATE (c), MINIMUM STEM LENGTH for `english` -- ignore query terms under
-- five characters. Weaker on inspection: it kills `year`/`years`, which is real
-- inflection recall, to catch `fix`.
--
-- ------------------------------------------------------------------------
-- WHAT THIS FILE DOES **NOT** SCORE, AND IT IS THE BIGGER FINDING.
-- ------------------------------------------------------------------------
-- q07's rated-relevant passage -- the one genuine gain design C bought -- IS NOT
-- A SOLELY-ADDED ROW, so no admission rule protects it and none of the three
-- candidates restores it. It contains "a single pulse", so it matches `single`
-- under `simple`; it contains "stimulators", which only `english` stems together
-- with the query's `stimulator`. Under GREATEST it was ranked by english (two
-- terms) and entered the top-K. Under the additive rank (20260918170000) it is
-- ranked by `simple` alone (one term) and falls out.
--
-- SO THE ADDITIVE RANK DROPS A RATED-RELEVANT PASSAGE, which is disqualifying
-- under this project's own bar. Fixing that is a RANKING question -- how a row
-- that matches simple weakly and english strongly should be scored -- and it is
-- upstream of every candidate below.
--
-- ------------------------------------------------------------------------
-- HOW TO READ THE RESULT.
--   admitted_by     which configurations match the row at all.
--   n_simple/en/de  how many DISTINCT query terms match under each.
--   solely_added    true when `simple` does not match -- the rows (a) governs.
--   passes_two_term true when the row would survive candidate (a).
-- A row with solely_added = true and passes_two_term = false is one the rule
-- would REMOVE. Check each against scripts/db/boardSearchTuningRatings.json: the
-- rule is disqualified the moment it removes one rated relevant.
--
-- The tsquery term lists come from the real query builder; regenerate with
--     npx vite-node scripts/db/boardSearchTuningBattery.ts
-- and copy each `terms:` line if the builder ever changes.

BEGIN TRANSACTION READ ONLY;

WITH q(id, terms) AS (
    VALUES
      ('q01-iran',        'iran | oil | headlines'),
      ('q02-audi-horn',   'remove | bumper | audi | a2 | change | horn'),
      ('q03-trump-note',  'trump | note | post'),
      ('q04-bike-chain',  'look | bike | chain | lube'),
      ('q05-hypermodern', 'hypermodernism | chess | openings'),
      ('q06-absent',      'fix | leaking | roof | garden | shed'),
      ('q07-tens',        'single | channel | tens | stimulator | module'),
      ('q08-knitting',    'knit | ribbed | pattern'),
      ('q09-watson',      'news | website | linked | slideshow'),
      ('q10-spreizniete', 'wie | löse | ich | die | spreizniete | der | stoßstange'),
      ('q11-noise-only',  'won | chess | tournament | berlin | last | year')
),
-- One row per (question, single term), so each term can be tested on its own.
term AS (
    SELECT q.id, pg_catalog.btrim(t) AS term
      FROM q, pg_catalog.unnest(pg_catalog.string_to_array(q.terms, '|')) AS t
),
board AS (SELECT 'af02972f-dfde-4545-9fc8-5fcbccb007c3'::uuid AS id),
-- Every searchable body on the board, posts and chunks in one shape.
doc AS (
    SELECT 'chunk'::text AS kind,
           d.original_filename || ' — chunk ' || c.chunk_index AS label,
           c.text AS body
      FROM board
      JOIN public.knowledge_documents AS d ON d.board_id = board.id AND d.processing_status = 'ready'
      JOIN public.knowledge_chunks AS c ON c.document_id = d.id
    UNION ALL
    SELECT CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN 'post (TITLE ONLY)' ELSE 'post' END,
           COALESCE(p.title, ''),
           COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)
      FROM board
      JOIN public.padlets AS p ON p.board_id = board.id AND p.type IN ('text', 'note', 'card')
),
scored AS (
    SELECT
        term.id AS query_id,
        doc.kind,
        doc.label,
        pg_catalog.length(doc.body) AS chars,
        pg_catalog.count(*) FILTER (
            WHERE pg_catalog.to_tsvector('simple'::regconfig, doc.body)
                  @@ pg_catalog.to_tsquery('simple'::regconfig, term.term)) AS n_simple,
        pg_catalog.count(*) FILTER (
            WHERE pg_catalog.to_tsvector('english'::regconfig, doc.body)
                  @@ pg_catalog.to_tsquery('english'::regconfig, term.term)) AS n_english,
        pg_catalog.count(*) FILTER (
            WHERE pg_catalog.to_tsvector('german'::regconfig, doc.body)
                  @@ pg_catalog.to_tsquery('german'::regconfig, term.term)) AS n_german
      FROM term
      CROSS JOIN doc
     GROUP BY term.id, doc.kind, doc.label, doc.body
)
SELECT
    query_id,
    kind,
    label,
    chars,
    n_simple,
    n_english,
    n_german,
    (CASE WHEN n_simple  > 0 THEN 's' ELSE '-' END ||
     CASE WHEN n_english > 0 THEN 'e' ELSE '-' END ||
     CASE WHEN n_german  > 0 THEN 'g' ELSE '-' END) AS admitted_by,
    (n_simple = 0)                                   AS solely_added,
    -- Candidate (a). A row `simple` already admits is unaffected by the rule.
    (n_simple > 0 OR GREATEST(n_english, n_german) >= 2) AS passes_two_term
  FROM scored
 -- Only rows the shipped functions actually admit.
 WHERE n_simple > 0 OR n_english > 0 OR n_german > 0
 ORDER BY query_id, solely_added DESC, GREATEST(n_simple, n_english, n_german) DESC, label;

ROLLBACK;
