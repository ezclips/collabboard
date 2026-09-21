-- FOLLOWUPS ITEM 17: `authenticated` loses UPDATE on content_sha256.
--
-- WHAT IS WRONG. content_sha256 sits in the `authenticated` UPDATE allowlist on
-- knowledge_documents, and nothing uses it. Searched across tracked sources:
-- application code only ever INSERTs the column (knowledgeIngestionAdapters and
-- knowledgeTextIngestionAdapters), the RPCs only COMPARE it as
-- p_expected_content_sha256 for optimistic concurrency, and no migration or
-- rollout contains `SET content_sha256 =`. It is written once, at insert,
-- through the admin client.
--
-- WHY IT MATTERS. That value is the version. The wiki's staleness signal is a
-- comparison of it, so a client able to write it can:
--
--   * set a DIFFERENT value, marking every citing page stale though nothing
--     changed; or
--   * set it BACK to a previously recorded value, so a genuinely changed source
--     looks unchanged and a page keeps citing text that no longer says what it
--     said. That direction is silent, and it is the worse one.
--
-- It becomes a prerequisite rather than a tidy-up because the transcript work
-- puts cue TIMING inside that hash: the value now also decides whether a
-- citation's timestamp still means what it claimed.
--
-- WHY A REVOKE AND NOT A NARROWER GRANT. Omitting a column from a new GRANT
-- does not remove a grant made earlier -- privileges accumulate. Only a REVOKE
-- removes one, and REVOKE UPDATE at TABLE level removes the table-wide
-- privilege and every column-level UPDATE on that table together. So this
-- takes the house allowlist form: revoke at the table, then grant back exactly
-- the columns that had it, minus one.
--
-- THE ALLOWLIST IS READ FROM THE DATABASE, NOT RETYPED HERE. Listing 21 column
-- names in this file would mean a typo silently dropping a privilege the
-- application needs, and would drift the moment the table changes. The set is
-- captured before the revoke and replayed after it.

DO $$
DECLARE
    kept text;
    removed_count integer;
BEGIN
    -- Captured BEFORE the revoke; afterwards there would be nothing to read.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
      INTO kept
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated'
       AND table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND privilege_type = 'UPDATE'
       AND column_name <> 'content_sha256';

    SELECT count(*)
      INTO removed_count
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated'
       AND table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND privilege_type = 'UPDATE'
       AND column_name = 'content_sha256';

    IF removed_count = 0 THEN
        RAISE NOTICE 'content_sha256 was already not updatable by authenticated; nothing to remove';
    END IF;

    RAISE NOTICE 'authenticated UPDATE allowlist after this migration: %', COALESCE(kept, '(none)');

    -- Removes the table-wide privilege and all column-level UPDATEs at once.
    EXECUTE 'REVOKE UPDATE ON TABLE public.knowledge_documents FROM authenticated';

    IF kept IS NOT NULL THEN
        EXECUTE format(
            'GRANT UPDATE (%s) ON TABLE public.knowledge_documents TO authenticated',
            kept
        );
    END IF;
END $$;

-- service_role is untouched: it is the role the server writes with, and the
-- insert path for content_sha256 runs through it.
