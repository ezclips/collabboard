-- ROLLBACK item 17: give `authenticated` back UPDATE on content_sha256.
--
-- This is the exact inverse of the migration and needs no snapshot, because
-- the migration removed exactly one column from the allowlist and left every
-- other grant as it found it.
--
-- WHAT ROLLING BACK RESTORES, said plainly so it is a decision and not a
-- reflex: the ability for any client with UPDATE rights on a row to rewrite
-- that row's version. That is the capability the migration removed, and with
-- cue timing inside the hash it also governs whether a citation's timestamp
-- still means what it claimed. Roll back only if removing it broke something
-- that genuinely needs it -- in which case the thing that needs it should be
-- named in the same change.

GRANT UPDATE (content_sha256) ON TABLE public.knowledge_documents TO authenticated;

DO $$
BEGIN
    IF NOT has_column_privilege('authenticated', 'public.knowledge_documents', 'content_sha256', 'UPDATE') THEN
        RAISE EXCEPTION 'rollback did not restore UPDATE on content_sha256';
    END IF;
    RAISE NOTICE 'content_sha256 is client-writable again -- followups item 17 is re-opened';
END $$;
