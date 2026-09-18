-- ROLLBACK for 20260918130000_board_search_text_functions.sql.
--
-- READ THIS BEFORE RUNNING IT.
--
-- WHAT THIS UNDOES. It drops the two search functions and nothing else. It does
-- NOT touch `plain_text_from_post_content`, `padlets_search_gin` or
-- `knowledge_chunks_search_gin` -- those belong to 20260918120000 and have their
-- own rollback file. Undoing this one returns the database to the state that
-- rollout left: indexes built, nothing able to read them.
--
-- WHAT BREAKS IF YOU RUN THIS WITH THE APPLICATION STILL DEPLOYED. A user who
-- turns the Board AI search toggle on gets a failed search. The chat itself
-- keeps working and their attachments are unaffected, because the search adapter
-- is a separate call on a separate path -- but the toggle is visibly broken
-- until either this is re-applied or the deploy is rolled back. Prefer rolling
-- the deploy back first.
--
-- NO DATA IS LOST. Both functions are pure reads over existing tables. Nothing
-- here stores anything, so there is nothing to restore -- dropping them removes
-- an ability, not a record. Re-applying the rollout restores it completely.
--
-- THE SIGNATURES ARE SPELLED OUT IN FULL, and that is not decoration. A bare
-- `DROP FUNCTION public.search_board_posts_text` is ambiguous the moment a second
-- overload exists, and PostgreSQL will refuse rather than guess. Naming the
-- argument types drops exactly the function this rollout created and would fail
-- loudly rather than quietly drop something else.
--
-- IT DOES NOT TOUCH THE VECTOR RPC. `search_board_knowledge_chunks` (no `_text`)
-- is the older embedding search and is a different function with a different
-- signature. The names are one suffix apart; check twice before editing this.
--
-- SAFE TO RE-RUN. Both drops are IF EXISTS.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

DROP FUNCTION IF EXISTS public.search_board_posts_text(uuid, text, integer);
DROP FUNCTION IF EXISTS public.search_board_knowledge_chunks_text(uuid, text, integer);

COMMIT;
