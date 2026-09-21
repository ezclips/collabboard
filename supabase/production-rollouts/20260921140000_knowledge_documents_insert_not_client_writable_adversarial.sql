-- ADVERSARIAL CHECKS for item 18's state classifier.
--
-- WHY THIS FILE EXISTS. The classifier's dangerous failure is not a false
-- alarm, it is a FALSE NO-OP: a state in which a client can still insert some
-- columns, reported as "already applied". Three shapes produce exactly that if
-- access is judged at table level, and all three are now rejected. These cases
-- prove the rejection instead of asserting it.
--
-- Each case builds its shape ON TOP OF AN OTHERWISE POST-STATE ACL -- client
-- table-wide INSERT already revoked -- so that a classifier which looked only
-- at table privileges would answer "already applied" and change nothing.
--
-- HOW TO RUN. psql, FROM THE REPOSITORY ROOT, against the ISOLATED test
-- database, as a role that may GRANT, REVOKE and CREATE ROLE:
--
--     psql "$ISOLATED_DATABASE_URL" -f supabase/production-rollouts/20260921140000_knowledge_documents_insert_not_client_writable_adversarial.sql
--
-- EVERY CASE IS WRAPPED IN A TRANSACTION THAT IS ROLLED BACK. Nothing here
-- survives the script, including the probe role, because CREATE ROLE is
-- transactional. It still must not be pointed at a production database: a
-- rolled-back transaction is not the same as a read-only one, and an
-- interrupted session would leave the shapes in place.
--
-- PASS CRITERION: five PASS lines and no line beginning with ***.
--
-- UNVERIFIED. This file has not been executed anywhere.

\set ON_ERROR_STOP off
\echo ''
\echo '=== item 18 adversarial checks ==='

-- ---------------------------------------------------------------------------
-- CASE 1 -- a COLUMN-level INSERT grant to PUBLIC.
-- has_table_privilege(client, ..., INSERT) is FALSE here, and every role on the
-- server can still insert that column. Revoking from anon and authenticated
-- would not remove it, so this may never be repaired or no-opped.
-- ---------------------------------------------------------------------------
BEGIN;
REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated;
REVOKE INSERT ON TABLE public.knowledge_documents FROM anon;
GRANT INSERT (content_sha256) ON TABLE public.knowledge_documents TO PUBLIC;
\i supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql
\if :ERROR
\echo 'PASS   case 1 -- PUBLIC column-level INSERT rejected'
\else
\echo '*** FAIL case 1 -- the classifier accepted a PUBLIC column-level INSERT grant'
\endif
ROLLBACK;

-- ---------------------------------------------------------------------------
-- CASE 2 -- INSERT inherited through another role.
-- authenticated holds no grant of its own; it is a member of a role that does.
-- This migration cannot revoke somebody else's grant.
-- ---------------------------------------------------------------------------
BEGIN;
REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated;
REVOKE INSERT ON TABLE public.knowledge_documents FROM anon;
CREATE ROLE item18_probe_parent NOLOGIN;
GRANT INSERT ON TABLE public.knowledge_documents TO item18_probe_parent;
GRANT item18_probe_parent TO authenticated;
\i supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql
\if :ERROR
\echo 'PASS   case 2 -- inherited INSERT rejected'
\else
\echo '*** FAIL case 2 -- the classifier accepted INSERT arriving through role membership'
\endif
ROLLBACK;

-- ---------------------------------------------------------------------------
-- CASE 3 -- a direct client COLUMN-level grant in an otherwise post-state ACL.
-- A table revoke would destroy this grant without the rollback restoring it,
-- and until then the client can insert the columns a recycled document needs.
-- ---------------------------------------------------------------------------
BEGIN;
REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated;
REVOKE INSERT ON TABLE public.knowledge_documents FROM anon;
GRANT INSERT (id, created_by, board_id, content_sha256) ON TABLE public.knowledge_documents TO authenticated;
\i supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql
\if :ERROR
\echo 'PASS   case 3 -- direct client column-level INSERT rejected'
\else
\echo '*** FAIL case 3 -- the classifier accepted a direct column-level INSERT grant'
\endif
ROLLBACK;

-- ---------------------------------------------------------------------------
-- CASE 4 -- POSITIVE CONTROL: the genuine post-state must be a no-op.
-- Without this, a classifier that rejected EVERYTHING would pass cases 1-3.
-- Expect the NOTICE "item 18: already applied".
-- ---------------------------------------------------------------------------
BEGIN;
REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated;
REVOKE INSERT ON TABLE public.knowledge_documents FROM anon;
\i supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql
\if :ERROR
\echo '*** FAIL case 4 -- the classifier rejected its own intended post-state'
\else
\echo 'PASS   case 4 -- the intended post-state is a verified no-op'
\endif
ROLLBACK;

-- ---------------------------------------------------------------------------
-- CASE 5 -- POSITIVE CONTROL: the supported pre-state must repair.
-- This one asserts the outcome rather than only the absence of an error: the
-- migration must leave neither client role able to insert any column.
-- ---------------------------------------------------------------------------
BEGIN;
GRANT INSERT ON TABLE public.knowledge_documents TO authenticated;
GRANT INSERT ON TABLE public.knowledge_documents TO anon;
\i supabase/migrations/20260921140000_knowledge_documents_insert_not_client_writable.sql
\if :ERROR
\echo '*** FAIL case 5 -- the classifier rejected the supported pre-state'
\else
DO $case5$
DECLARE
    still text[];
BEGIN
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));
    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION '*** FAIL case 5 -- INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;
    RAISE NOTICE 'PASS   case 5 -- the supported pre-state was repaired';
END
$case5$;
\endif
ROLLBACK;

\echo ''
\echo 'item 18 adversarial checks complete -- five PASS lines and no *** line is the pass criterion'
\set ON_ERROR_STOP on
