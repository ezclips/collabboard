-- ROLLBACK the transcript mutation revision column.
--
-- NARROWLY DESCRIBED. This drops the column the migration added. It is an
-- inverse only within the shape the migration validated: a column it created
-- itself, with nothing depending on it and no transcript relying on it.
--
-- WHAT DROPPING IT COSTS, so this is a decision and not a reflex: the
-- transcript compare-and-swap token disappears, and content_sha256 becomes the
-- only thing separating two concurrent edits. That is exactly the lost update
-- this column exists to close -- a metadata-only correction and a same-hash
-- format replacement both leave the hash unchanged, so two edits begun from
-- one observed version would both be accepted and the later would silently
-- overwrite the earlier. Roll back only if the column itself broke something,
-- and name what, in the same change.
--
-- ============================================================================
-- WHY GENERIC DEPENDENCY DISCOVERY IS NOT ENOUGH
-- ============================================================================
--
-- CORRECTED. An earlier version inspected pg_rewrite alone and described that
-- as checking dependents. It is not: pg_rewrite finds views and rules, and
-- nothing else. It cannot find FUNCTIONS, because PostgreSQL DOES NOT RECORD A
-- DEPENDENCY FROM A FUNCTION BODY TO A COLUMN -- a plpgsql body is text, and
-- the column it names is resolved at execution time. So the transcript RPCs,
-- which are the one thing that will certainly break, are invisible to any
-- amount of catalogue walking.
--
-- They are therefore named EXPLICITLY below. The generic check is widened to
-- every pg_depend reference as well, and kept -- it catches views, rules,
-- indexes, constraints and generated columns -- but it is the backstop, not
-- the guarantee.
--
-- The names are reserved for the transcript RPCs whether or not they exist
-- yet: checking for a function that has not been written is harmless, and
-- checking for one that has is the whole point.
--
-- STATUS 2026-09-21: executed on an isolated LOCAL stack ONLY, in a shimmed
-- run that found five defects in this rollout's SQL -- all now fixed. It has
-- NOT been re-run clean, and has NEVER been applied to hosted. See
-- .agent/isolated-sql-verification.md.

DO $revisionrollback$
DECLARE
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    col CONSTANT text := 'transcript_mutation_revision';
    -- Updated when the RPCs landed: the two shared validators are named here
    -- too. They do not reference the column, but they exist only to serve
    -- functions that do, and leaving them behind would be leaving half a
    -- feature installed.
    rpc_names CONSTANT text[] := ARRAY[
        'knowledge_transcript_create_version',
        'knowledge_transcript_replace_version',
        'knowledge_transcript_update_metadata',
        'knowledge_transcript_assert_chunks',
        'knowledge_transcript_assert_representation',
        'knowledge_transcript_assert_version'
    ];
    present_rpcs text[];
    dependents   text[];
    transcripts  bigint;
    attnum_of    smallint;
BEGIN
    SELECT a.attnum INTO attnum_of
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attname = col
       AND a.attnum > 0 AND NOT a.attisdropped;

    IF attnum_of IS NULL THEN
        RAISE NOTICE 'transcript mutation revision: already absent -- nothing to roll back';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- 1. THE RPCS, BY NAME. Dropping the column underneath them replaces a
    --    lost update with a hard failure on every transcript edit.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(DISTINCT p.proname::text ORDER BY p.proname::text), ARRAY[]::text[])
      INTO present_rpcs
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (rpc_names);

    IF array_length(present_rpcs, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'refusing to drop %: the transcript RPCs [%] still exist. Remove or revert them first -- PostgreSQL records no dependency from a function body to a column, so nothing else will stop this.',
            col, array_to_string(present_rpcs, ', ');
    END IF;

    -- ---------------------------------------------------------------------
    -- 2. ANY OTHER CATALOGUED DEPENDENT. Widened from pg_rewrite to every
    --    pg_depend reference to this column: views, rules, indexes,
    --    constraints, generated columns. A DROP that cascades is not a
    --    rollback, it is a second change nobody reviewed.
    -- ---------------------------------------------------------------------

    SELECT coalesce(
             array_agg(DISTINCT format('%s %s', d.classid::regclass::text, d.objid::text)
                       ORDER BY format('%s %s', d.classid::regclass::text, d.objid::text)),
             ARRAY[]::text[])
      INTO dependents
      FROM pg_depend d
     WHERE d.refobjid = tbl
       AND d.refobjsubid = attnum_of
       -- The column's own default and the table itself are not dependents.
       AND d.deptype <> 'i'
       AND NOT (d.classid = 'pg_attrdef'::regclass);

    IF array_length(dependents, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'refusing to drop %: [%] depend on it. Remove them deliberately first.',
            col, array_to_string(dependents, ', ');
    END IF;

    -- ---------------------------------------------------------------------
    -- 3. EXISTING TRANSCRIPTS. This is the check that matters most and was
    --    missing entirely.
    --
    --    Dropping the token beneath transcripts that already exist does not
    --    make them read-only -- it makes them editable ONLY THROUGH AN UNSAFE
    --    CONTRACT, where two concurrent corrections silently merge into one.
    --    That is worse than a hard failure, because nothing reports it.
    -- ---------------------------------------------------------------------

    IF EXISTS (
        SELECT 1 FROM pg_attribute a
         WHERE a.attrelid = tbl AND a.attname = 'transcript_representation'
           AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
        EXECUTE 'SELECT count(*) FROM public.knowledge_documents WHERE transcript_representation IS NOT NULL'
           INTO transcripts;

        IF transcripts > 0 THEN
            RAISE EXCEPTION
                'refusing to drop %: % transcript document(s) exist. Without the revision they remain editable, but only under a contract in which two concurrent corrections merge silently. Remove or migrate them deliberately first.',
                col, transcripts;
        END IF;
    END IF;

    RAISE NOTICE 'transcript mutation revision: dropping % -- no RPCs, no dependents, no transcripts', col;
    EXECUTE format('ALTER TABLE public.knowledge_documents DROP COLUMN %I', col);
END
$revisionrollback$;
