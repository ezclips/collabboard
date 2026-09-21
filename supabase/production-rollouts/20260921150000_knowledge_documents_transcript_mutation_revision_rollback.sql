-- ROLLBACK the transcript mutation revision column.
--
-- NARROWLY DESCRIBED. This drops the column the migration added. It is an
-- inverse only within the shape the migration validated: a column it created
-- itself, with no other object depending on it.
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
-- THE TRANSCRIPT RPCS MUST BE REMOVED OR REVERTED FIRST. They reference this
-- column; dropping it underneath them replaces a lost update with a hard
-- failure on every transcript edit.
--
-- UNVERIFIED: not executed anywhere.

DO $revisionrollback$
DECLARE
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    col CONSTANT text := 'transcript_mutation_revision';
    dependents text[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute a
         WHERE a.attrelid = tbl AND a.attname = col
           AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
        RAISE NOTICE 'transcript mutation revision: already absent -- nothing to roll back';
        RETURN;
    END IF;

    -- A DROP that cascades is not a rollback, it is a second change nobody
    -- reviewed. Anything depending on this column is reported and the drop is
    -- refused.
    SELECT coalesce(array_agg(DISTINCT c.relname::text ORDER BY c.relname::text), ARRAY[]::text[])
      INTO dependents
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class c ON c.oid = r.ev_class
      JOIN pg_attribute a ON a.attrelid = tbl AND a.attname = col
     WHERE d.refobjid = tbl AND d.refobjsubid = a.attnum
       AND d.classid = 'pg_rewrite'::regclass
       AND c.oid <> tbl;

    IF array_length(dependents, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'refusing to drop %: [%] depend on it. Remove them deliberately first.',
            col, array_to_string(dependents, ', ');
    END IF;

    RAISE NOTICE 'transcript mutation revision: dropping % -- transcript edits lose their compare-and-swap token', col;
    EXECUTE format('ALTER TABLE public.knowledge_documents DROP COLUMN %I', col);
END
$revisionrollback$;
