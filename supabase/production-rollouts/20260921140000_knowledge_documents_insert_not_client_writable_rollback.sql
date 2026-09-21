-- ROLLBACK item 18: restore table-wide INSERT to anon and authenticated.
--
-- NARROWLY DESCRIBED, as item 17's rollback now is. This restores INSERT as a
-- table-wide grant to both roles, which is the shape the migration required as
-- its starting state and verified before changing anything. It does not
-- reconstruct grant options or inherited paths, and it is an inverse only
-- within that validated shape.
--
-- WHAT RESTORING IT RESTORES, so this is a decision and not a reflex: a
-- permitted client can again create knowledge_documents rows choosing their
-- own `id`, `content_sha256` and `transcript_representation` -- and therefore
-- recreate a deleted document under its old id so that a wiki source shown as
-- gone appears present and unchanged. Roll back only if removing INSERT broke
-- a client workflow, and name that workflow in the same change.

GRANT INSERT ON TABLE public.knowledge_documents TO authenticated;
GRANT INSERT ON TABLE public.knowledge_documents TO anon;

DO $$
BEGIN
    IF NOT has_table_privilege('authenticated', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION 'rollback did not restore INSERT for authenticated';
    END IF;
    RAISE NOTICE 'client INSERT on knowledge_documents is restored -- followups item 18 is re-opened';
END $$;
