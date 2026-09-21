-- A DEDICATED, SERVER-OWNED MUTATION REVISION for transcript documents.
--
-- WHY NOT updated_at, decided and recorded rather than assumed:
--
--   * It sits in `authenticated`'s UPDATE allowlist, so a client can move it.
--   * Other lifecycle writes move it without touching transcript content or
--     metadata, so it reports changes that are not the ones being guarded.
--   * A client that can write it can FORGE the expected value, which defeats
--     the compare-and-swap entirely.
--   * Timestamp equality is a weaker token than an incrementing counter: two
--     mutations within one clock tick are indistinguishable.
--
-- So this is a bigint the server owns, incremented under the row lock by the
-- transcript RPCs, and unwritable by any client role.
--
-- WHAT IT IS FOR. content_sha256 cannot act as the compare-and-swap token on
-- its own, because the two same-hash paths -- a metadata-only correction and a
-- same-hash format replacement -- deliberately leave it unchanged. Two edits
-- begun from one observed version would both match it, and the later would
-- silently overwrite the earlier. This column is the thing that differs.
--
-- ============================================================================
-- DEPENDENCIES, STATED, BECAUSE THIS COLUMN IS ONLY AS SAFE AS THEY ARE
-- ============================================================================
--
--   * ITEM 17 must be applied. It replaced `authenticated`'s table-wide UPDATE
--     with a column allowlist. A column allowlist does NOT cover columns added
--     later, so this column is unwritable by default -- but ONLY because the
--     table-wide grant is gone. With it in place, every new column is writable
--     the moment it exists.
--
--   * ITEM 18 must be applied. A table-wide INSERT covers every column,
--     present and future, so while `authenticated` holds it a client can
--     SUPPLY this revision on a row it creates -- which is forging it.
--
-- Both are checked below and this migration refuses to run without them. A
-- revision a client can write is not a revision.
--
-- ============================================================================
-- REPEAT-APPLICABLE, three outcomes and no others
-- ============================================================================
--
--   NEEDS REPAIR   the column is absent -> add it
--   ALREADY DONE   the column exists in exactly the intended shape -> no-op
--   anything else  -> raise, and change nothing
--
-- EXISTING ROWS TAKE THE DEFAULT. A non-transcript document has no transcript
-- to guard, and backfilling a meaningful value for rows that never had one
-- would be inventing history. Transcript creation establishes the first real
-- revision; every replacement and metadata-only update increments it exactly
-- once, inside the same transaction that made the change.
--
-- UNVERIFIED: this migration has not been executed against any database.

DO $revision$
DECLARE
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    col CONSTANT text := 'transcript_mutation_revision';
    existing record;
    writable text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- Prerequisites. Neither is optional, and neither is this migration's to
    -- repair -- they are separate, reviewed changes.
    -- ---------------------------------------------------------------------

    IF has_table_privilege('authenticated', tbl, 'UPDATE') THEN
        RAISE EXCEPTION
            'prerequisite missing: authenticated holds TABLE-WIDE UPDATE (item 17 is not applied), so this column would be client-writable the moment it exists';
    END IF;

    IF has_table_privilege('authenticated', tbl, 'INSERT')
       OR has_table_privilege('anon', tbl, 'INSERT') THEN
        RAISE EXCEPTION
            'prerequisite missing: a client role holds TABLE-WIDE INSERT (item 18 is not applied), so a client could supply this revision on rows it creates';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: the column exists in exactly the intended shape.
    -- ---------------------------------------------------------------------

    SELECT a.atttypid::regtype::text AS type_name,
           a.attnotnull             AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr
      INTO existing
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = tbl AND a.attname = col
       AND a.attnum > 0 AND NOT a.attisdropped;

    IF FOUND THEN
        IF existing.type_name <> 'bigint' OR NOT existing.not_null
           OR coalesce(existing.default_expr, '') NOT LIKE '0%' THEN
            RAISE EXCEPTION
                'unsupported state: % exists as % (not null = %, default = %), which is not the intended bigint NOT NULL DEFAULT 0',
                col, existing.type_name, existing.not_null,
                coalesce(existing.default_expr, '<none>');
        END IF;

        -- The no-op is VERIFIED, not assumed. A column that exists but became
        -- client-writable is not the intended post-state.
        SELECT coalesce(array_agg(role_name || ':' || priv ORDER BY role_name || ':' || priv), ARRAY[]::text[])
          INTO writable
          FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
          CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE']) AS priv
         WHERE has_column_privilege(role_name, tbl, col, priv);

        IF array_length(writable, 1) IS NOT NULL THEN
            RAISE EXCEPTION
                'unsupported state: % already exists but is client-writable by [%]',
                col, array_to_string(writable, ', ');
        END IF;

        RAISE NOTICE 'transcript mutation revision: already applied';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: add it.
    -- ---------------------------------------------------------------------

    RAISE NOTICE 'transcript mutation revision: adding %', col;

    EXECUTE format(
        'ALTER TABLE public.knowledge_documents ADD COLUMN %I bigint NOT NULL DEFAULT 0', col);

    -- The comment is part of the change: a bare bigint column invites someone
    -- to write it from application code.
    EXECUTE format(
        'COMMENT ON COLUMN public.knowledge_documents.%I IS %L', col,
        'Server-owned compare-and-swap token for transcript edits. Incremented under the row lock by the transcript RPCs, exactly once per mutation, including metadata-only and same-hash format changes. Never written by application code and never writable by a client role.');

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction. A
    -- column that a client can write is not a compare-and-swap token, so this
    -- is checked rather than assumed from the grants that were in force.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(role_name || ':' || priv ORDER BY role_name || ':' || priv), ARRAY[]::text[])
      INTO writable
      FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
      CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE']) AS priv
     WHERE has_column_privilege(role_name, tbl, col, priv);

    IF array_length(writable, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'repair failed: the new revision column is client-writable by [%]',
            array_to_string(writable, ', ');
    END IF;

    IF NOT has_column_privilege('service_role', tbl, col, 'UPDATE') THEN
        RAISE EXCEPTION 'repair failed: service_role cannot UPDATE % -- the RPCs could not increment it', col;
    END IF;
END
$revision$;
