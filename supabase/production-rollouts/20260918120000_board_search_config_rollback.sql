-- ROLLBACK for 20260918120000_board_search_config.sql.
--
-- ------------------------------------------------------------------------
-- NO USER DATA IS DESTROYED BY THIS FILE, AND THAT IS UNUSUAL -- SAY IT PLAINLY.
-- ------------------------------------------------------------------------
-- The forward migration added NO COLUMNS. It created one pure function and two
-- indexes, and an index holds no information that is not derivable from the rows
-- it covers. Dropping all three loses nothing that cannot be rebuilt by running
-- the rollout again. There is nothing to back up first.
--
-- (The trialled `search_config` / `search_text` columns are NOT recreated here.
-- They were rejected before anything read them -- reg* types do not survive a
-- restore as the same config on Supabase, and a stored projection is a second
-- definition that drifts. Restoring them would reinstate a design that was
-- deliberately removed. If a database somehow still carries them, the forward
-- migration drops them; this file leaves them alone.)
--
-- ------------------------------------------------------------------------
-- WHAT THIS COSTS, AND WHEN IT STOPS BEING FREE.
-- ------------------------------------------------------------------------
-- RIGHT NOW: nothing. No application code reads the function or either index, so
-- running this today is invisible to every user.
--
-- ONCE THE SEARCH FUNCTION SHIPS, THE COST CHANGES SHAPE AND IS EASY TO MISS.
-- Dropping an index does NOT make a query fail -- it makes the planner fall back
-- to a SEQUENTIAL SCAN. Board search would keep returning correct results while
-- reading every padlet and every knowledge_chunk row on the board for every
-- turn. The symptom is latency and load, not an error, so nothing will alert and
-- the cause will not be obvious from the application side.
--
-- Dropping the FUNCTION after the search function ships is different again: the
-- padlets index expression depends on it, so this file drops the index first and
-- the function second. If a later object also depends on the function, the DROP
-- will refuse rather than cascade -- that refusal is deliberate. Do not add
-- CASCADE to make it pass; find what depends on it and decide knowingly.
--
-- ------------------------------------------------------------------------
-- ORDER MATTERS. Index first, function second: `padlets_search_gin` is an
-- expression index over `plain_text_from_post_content`, so the function cannot
-- be dropped while the index exists.
-- ------------------------------------------------------------------------
--
-- Re-running is safe: every statement is IF EXISTS.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- The expression index goes first -- it depends on the function below.
DROP INDEX IF EXISTS public.padlets_search_gin;
DROP INDEX IF EXISTS public.knowledge_chunks_search_gin;

-- No CASCADE, on purpose. If something else has come to depend on this, the
-- refusal is the useful outcome; silently dropping that dependent object is not.
DROP FUNCTION IF EXISTS public.plain_text_from_post_content(text);

COMMIT;

-- AFTERWARDS, the verify file is the fastest way to confirm the state: rows 1,
-- 2, 5, 6 and 7 turn to '(absent)' and fail, rows 3, 8 and 9 still pass (the
-- trialled columns are still gone, RLS is untouched, anon still holds no write),
-- and the fixture query ERRORS rather than failing -- the function it calls no
-- longer exists. An error there is the expected post-rollback reading, not a
-- second fault to chase.
