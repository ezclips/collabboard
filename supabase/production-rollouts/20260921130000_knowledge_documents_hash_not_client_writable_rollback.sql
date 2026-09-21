-- ROLLBACK item 17: give `authenticated` back UPDATE on content_sha256.
--
-- WHAT THIS IS, STATED NARROWLY. It restores hash-WRITE access as a direct,
-- non-grantable column privilege. It is not, in general, an "exact inverse":
-- restoring a grant cannot reconstruct HOW the access originally arrived --
-- table-wide grant, column grant, inherited through a role, or carrying a
-- grant option -- and an earlier version of this file claimed otherwise.
--
-- It is equivalent to an inverse ONLY within the starting shape the migration
-- refuses to run without, and which it asserts before changing anything:
-- no table-wide UPDATE for `authenticated`, UPDATE reaching it by direct
-- column grants only, and no grant options. Under exactly those conditions the
-- prior state was a set of plain column grants, so re-granting this one column
-- returns the ACL to what it was. Outside them, this restores access without
-- restoring shape, and the difference matters to anyone auditing later.
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
