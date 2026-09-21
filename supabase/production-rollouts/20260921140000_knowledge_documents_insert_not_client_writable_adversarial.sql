-- ADVERSARIAL CHECKS for item 18's state classifier. PLAIN SQL -- no psql
-- meta-commands, so a statement runner (Supabase MCP execute_sql) can run it.
--
-- GENERATED FILE. Do not edit by hand:
--     node scripts/db/generate-item18-adversarial.mjs
-- The migration's DO block is embedded VERBATIM below, five times, so every
-- case exercises THE REAL CLASSIFIER rather than a paraphrase of it.
-- knowledgeItem18Sql.source.test.ts fails if the copies drift.
--
-- WHY THIS FILE EXISTS. The classifier's dangerous failure is not a false
-- alarm, it is a FALSE NO-OP: a state in which a client can still insert some
-- columns, reported as "already applied". Three shapes produce exactly that if
-- access is judged at table level. Each is built ON TOP OF AN OTHERWISE
-- POST-STATE ACL, so a table-level classifier would answer "already applied"
-- and change nothing. Two positive controls sit beside them, because a
-- classifier that rejected everything would pass the other three.
--
-- NOTHING HERE PERSISTS. Every case applies its shape inside a PL/pgSQL
-- subtransaction that always ends by raising, so the shape is always rolled
-- back -- on the accepting path too, which is why the success path raises
-- ZZ001 deliberately rather than returning. CREATE ROLE and GRANT are
-- transactional, so the probe role and every grant go with it, and an
-- interrupted session is no exception: PostgreSQL rolls back the active
-- transaction, role and ACL changes included.
--
-- RUN IT AS ONE CALL. The temp table is session-scoped; a runner that splits
-- these statements across connections will fail loudly on the final SELECT
-- rather than quietly report success.
--
-- RUN IT AGAINST THE ISOLATED DATABASE ONLY, as a role that may GRANT, REVOKE
-- and CREATE ROLE. Not because the rollback is in doubt -- it is not -- but
-- because this file deliberately exercises privileged ACL and role mutations
-- on a live table, which is not something to point at a production database
-- whatever its cleanup guarantees.
--
-- PASS CRITERION: five rows, every outcome PASS, and the final verdict row
-- reading ALL PASS.
--
-- STATUS 2026-09-21: executed on an isolated LOCAL stack ONLY. That run
-- reported ALL PASS -- 5 of 5, and the result was WORTHLESS: the classifier
-- carried a malformed-array-literal fault, and cases 1-3 counted that fault
-- as a refusal. A classifier that could not run at all read as adversarially
-- sound. Both are fixed -- the fault, and the verdict that excused it -- but
-- this file has NOT been re-run since, and has NEVER been applied to hosted.
-- See .agent/isolated-sql-verification.md.

CREATE TEMP TABLE item18_adversarial_result (
    case_no integer PRIMARY KEY,
    outcome text NOT NULL,
    title   text NOT NULL,
    detail  text NOT NULL
);

-- ---------------------------------------------------------------------------
-- CASE 1 -- a column-level INSERT grant to PUBLIC.
-- has_table_privilege(client, INSERT) is FALSE here and every role on the server can still insert that column; revoking from anon and authenticated would not remove it.
-- ---------------------------------------------------------------------------
DO $case1$
DECLARE
    outcome text;
    detail  text;
    still   text[];
BEGIN
    -- The inner block is a SUBTRANSACTION. Whichever way it ends it ends by
    -- RAISING, so the shape applied below is ALWAYS rolled back -- nothing this
    -- case grants can outlive it, including the probe role.
    BEGIN
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';
        EXECUTE 'GRANT INSERT (content_sha256) ON TABLE public.knowledge_documents TO PUBLIC';

        EXECUTE $mig$
DO $item18$
DECLARE
    client_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    table_holders   text[];
    grantable       integer;
    column_grants   text[];
    public_table_insert  boolean;
    public_column_insert text[];
    inherited       text[];
    effective_anon  text[];
    effective_auth  text[];
    effective_roles text[];
    still           text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- Facts, gathered once.
    -- ---------------------------------------------------------------------

    -- Direct TABLE-level INSERT grants held by the client roles.
    SELECT coalesce(array_agg(DISTINCT r.rolname::text ORDER BY r.rolname::text), ARRAY[]::text[])
      INTO table_holders
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE c.oid = tbl
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- Grant options on any client-role INSERT, table or column.
    SELECT count(*) INTO grantable
      FROM (
        SELECT acl.is_grantable
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
        UNION ALL
        SELECT acl.is_grantable
          FROM pg_attribute a
          CROSS JOIN LATERAL aclexplode(a.attacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE a.attrelid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
      ) g;

    -- Separate COLUMN-level INSERT grants to the client roles. A revoke at the
    -- table removes these too, and the rollback would not bring them back.
    SELECT coalesce(array_agg(DISTINCT (r.rolname || '.' || a.attname)::text ORDER BY (r.rolname || '.' || a.attname)::text), ARRAY[]::text[])
      INTO column_grants
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- INSERT granted to PUBLIC reaches every role and cannot be revoked from
    -- the client roles individually. BOTH levels are asked: a COLUMN-level
    -- grant to PUBLIC leaves has_table_privilege false while still letting a
    -- client insert that column.
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT'
           AND acl.grantee = 0
    ) INTO public_table_insert;

    SELECT coalesce(array_agg(DISTINCT a.attname::text ORDER BY a.attname::text), ARRAY[]::text[])
      INTO public_column_insert
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND acl.grantee = 0;

    -- Roles the client roles are MEMBERS of that hold a direct INSERT grant at
    -- either level. Membership is transitive, and this migration cannot revoke
    -- a grant held by another role.
    SELECT coalesce(array_agg(DISTINCT (cr.role_name || ' <- ' || r.rolname)::text ORDER BY (cr.role_name || ' <- ' || r.rolname)::text), ARRAY[]::text[])
      INTO inherited
      FROM unnest(client_roles) AS cr(role_name)
      JOIN pg_roles r
        ON r.rolname::text <> cr.role_name
       AND pg_has_role(cr.role_name::name, r.oid, 'USAGE')
     WHERE EXISTS (
             SELECT 1 FROM pg_class c
               CROSS JOIN LATERAL aclexplode(c.relacl) acl
              WHERE c.oid = tbl
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid)
        OR EXISTS (
             SELECT 1 FROM pg_attribute a
               CROSS JOIN LATERAL aclexplode(a.attacl) acl
              WHERE a.attrelid = tbl
                AND a.attnum > 0 AND NOT a.attisdropped
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid);

    -- WHAT EACH CLIENT ROLE CAN ACTUALLY DO, COLUMN BY COLUMN. This, and not a
    -- table-level question, is what the classification below turns on.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_anon
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('anon', a.attrelid, a.attname, 'INSERT');

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_auth
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT');

    -- array_append, NOT `|| 'anon'`. With an untyped literal PostgreSQL
    -- resolves `text[] || unknown` as array-to-array concatenation and tries to
    -- read the literal as an array, which fails with `malformed array literal`.
    -- array_append(anyarray, anyelement) forces the element reading.
    effective_roles := ARRAY[]::text[];
    IF array_length(effective_anon, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'anon');
    END IF;
    IF array_length(effective_auth, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'authenticated');
    END IF;

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state. Every one of these
    -- is a path the repair cannot close, so none of them may reach the no-op.
    -- ---------------------------------------------------------------------

    IF public_table_insert THEN
        RAISE EXCEPTION
            'unsupported state: INSERT on knowledge_documents is granted to PUBLIC; revoking from the client roles would not remove it';
    END IF;

    IF array_length(public_column_insert, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: column-level INSERT is granted to PUBLIC on [%]; every role including anon and authenticated holds it, and revoking from the client roles would not remove it',
            array_to_string(public_column_insert, ', ');
    END IF;

    IF grantable > 0 THEN
        RAISE EXCEPTION
            'unsupported state: % client-role INSERT grant(s) are WITH GRANT OPTION', grantable;
    END IF;

    IF array_length(column_grants, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: separate column-level INSERT grants exist ([%]); a table revoke would destroy them and the rollback would not restore them',
            array_to_string(column_grants, ', ');
    END IF;

    IF array_length(inherited, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: INSERT reaches a client role through role membership ([%]); this migration cannot revoke a grant held by another role',
            array_to_string(inherited, ', ');
    END IF;

    -- The server must keep INSERT in both states, or ingestion stops.
    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION
            'unsupported state: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: neither client role can insert ANY column, by ANY path.
    -- ---------------------------------------------------------------------

    IF array_length(effective_roles, 1) IS NULL THEN
        RAISE NOTICE 'item 18: already applied -- neither anon nor authenticated can INSERT any column of knowledge_documents';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: exactly anon and authenticated hold direct table INSERT,
    -- and that grant is the WHOLE of their effective access -- which the
    -- invariants above have just established, because every other path raises.
    -- ---------------------------------------------------------------------

    IF NOT (table_holders @> client_roles AND table_holders <@ client_roles) THEN
        RAISE EXCEPTION
            'unsupported state: expected direct table INSERT for exactly [%], found [%] while [%] hold effective INSERT',
            array_to_string(client_roles, ', '),
            array_to_string(table_holders, ', '),
            array_to_string(effective_roles, ', ');
    END IF;

    RAISE NOTICE 'item 18: removing INSERT on knowledge_documents from anon and authenticated';

    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END
$item18$;
$mig$;

        RAISE EXCEPTION 'the classifier ran to completion' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        -- REJECTION IS NOT ENOUGH; IT MUST BE THE INTENDED REJECTION.
        -- An earlier revision scored a PASS on ANY error, so a plain
        -- malformed-array-literal BUG inside the classifier collected three
        -- of them -- the shape was refused for a reason having nothing to do
        -- with the shape. A broken classifier must never read as
        -- adversarially sound, so both the SQLSTATE and the specific check
        -- that must catch this shape are pinned.
        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'FAIL';
            detail  := 'the classifier ACCEPTED this state instead of rejecting it';
        ELSIF SQLSTATE <> 'P0001' THEN
            outcome := 'FAIL';
            detail  := 'refused by a FAULT, not by a check -- SQLSTATE '
                       || SQLSTATE || ': ' || SQLERRM;
        ELSIF SQLERRM NOT LIKE 'unsupported state: column-level INSERT is granted to PUBLIC%' THEN
            outcome := 'FAIL';
            detail  := 'refused by the WRONG check: ' || SQLERRM;
        ELSE
            outcome := 'PASS';
            detail  := 'refused as intended: ' || SQLERRM;
        END IF;
    END;

    INSERT INTO item18_adversarial_result (case_no, outcome, title, detail)
    VALUES (1, outcome, 'a column-level INSERT grant to PUBLIC', detail);
END
$case1$;

-- ---------------------------------------------------------------------------
-- CASE 2 -- INSERT inherited through another role.
-- authenticated holds no grant of its own; it is a member of a role that does, and this migration cannot revoke another role’s grant.
-- ---------------------------------------------------------------------------
DO $case2$
DECLARE
    outcome text;
    detail  text;
    still   text[];
BEGIN
    -- The inner block is a SUBTRANSACTION. Whichever way it ends it ends by
    -- RAISING, so the shape applied below is ALWAYS rolled back -- nothing this
    -- case grants can outlive it, including the probe role.
    BEGIN
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';
        EXECUTE 'CREATE ROLE item18_probe_parent NOLOGIN';
        EXECUTE 'GRANT INSERT ON TABLE public.knowledge_documents TO item18_probe_parent';
        EXECUTE 'GRANT item18_probe_parent TO authenticated';

        EXECUTE $mig$
DO $item18$
DECLARE
    client_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    table_holders   text[];
    grantable       integer;
    column_grants   text[];
    public_table_insert  boolean;
    public_column_insert text[];
    inherited       text[];
    effective_anon  text[];
    effective_auth  text[];
    effective_roles text[];
    still           text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- Facts, gathered once.
    -- ---------------------------------------------------------------------

    -- Direct TABLE-level INSERT grants held by the client roles.
    SELECT coalesce(array_agg(DISTINCT r.rolname::text ORDER BY r.rolname::text), ARRAY[]::text[])
      INTO table_holders
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE c.oid = tbl
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- Grant options on any client-role INSERT, table or column.
    SELECT count(*) INTO grantable
      FROM (
        SELECT acl.is_grantable
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
        UNION ALL
        SELECT acl.is_grantable
          FROM pg_attribute a
          CROSS JOIN LATERAL aclexplode(a.attacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE a.attrelid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
      ) g;

    -- Separate COLUMN-level INSERT grants to the client roles. A revoke at the
    -- table removes these too, and the rollback would not bring them back.
    SELECT coalesce(array_agg(DISTINCT (r.rolname || '.' || a.attname)::text ORDER BY (r.rolname || '.' || a.attname)::text), ARRAY[]::text[])
      INTO column_grants
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- INSERT granted to PUBLIC reaches every role and cannot be revoked from
    -- the client roles individually. BOTH levels are asked: a COLUMN-level
    -- grant to PUBLIC leaves has_table_privilege false while still letting a
    -- client insert that column.
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT'
           AND acl.grantee = 0
    ) INTO public_table_insert;

    SELECT coalesce(array_agg(DISTINCT a.attname::text ORDER BY a.attname::text), ARRAY[]::text[])
      INTO public_column_insert
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND acl.grantee = 0;

    -- Roles the client roles are MEMBERS of that hold a direct INSERT grant at
    -- either level. Membership is transitive, and this migration cannot revoke
    -- a grant held by another role.
    SELECT coalesce(array_agg(DISTINCT (cr.role_name || ' <- ' || r.rolname)::text ORDER BY (cr.role_name || ' <- ' || r.rolname)::text), ARRAY[]::text[])
      INTO inherited
      FROM unnest(client_roles) AS cr(role_name)
      JOIN pg_roles r
        ON r.rolname::text <> cr.role_name
       AND pg_has_role(cr.role_name::name, r.oid, 'USAGE')
     WHERE EXISTS (
             SELECT 1 FROM pg_class c
               CROSS JOIN LATERAL aclexplode(c.relacl) acl
              WHERE c.oid = tbl
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid)
        OR EXISTS (
             SELECT 1 FROM pg_attribute a
               CROSS JOIN LATERAL aclexplode(a.attacl) acl
              WHERE a.attrelid = tbl
                AND a.attnum > 0 AND NOT a.attisdropped
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid);

    -- WHAT EACH CLIENT ROLE CAN ACTUALLY DO, COLUMN BY COLUMN. This, and not a
    -- table-level question, is what the classification below turns on.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_anon
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('anon', a.attrelid, a.attname, 'INSERT');

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_auth
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT');

    -- array_append, NOT `|| 'anon'`. With an untyped literal PostgreSQL
    -- resolves `text[] || unknown` as array-to-array concatenation and tries to
    -- read the literal as an array, which fails with `malformed array literal`.
    -- array_append(anyarray, anyelement) forces the element reading.
    effective_roles := ARRAY[]::text[];
    IF array_length(effective_anon, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'anon');
    END IF;
    IF array_length(effective_auth, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'authenticated');
    END IF;

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state. Every one of these
    -- is a path the repair cannot close, so none of them may reach the no-op.
    -- ---------------------------------------------------------------------

    IF public_table_insert THEN
        RAISE EXCEPTION
            'unsupported state: INSERT on knowledge_documents is granted to PUBLIC; revoking from the client roles would not remove it';
    END IF;

    IF array_length(public_column_insert, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: column-level INSERT is granted to PUBLIC on [%]; every role including anon and authenticated holds it, and revoking from the client roles would not remove it',
            array_to_string(public_column_insert, ', ');
    END IF;

    IF grantable > 0 THEN
        RAISE EXCEPTION
            'unsupported state: % client-role INSERT grant(s) are WITH GRANT OPTION', grantable;
    END IF;

    IF array_length(column_grants, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: separate column-level INSERT grants exist ([%]); a table revoke would destroy them and the rollback would not restore them',
            array_to_string(column_grants, ', ');
    END IF;

    IF array_length(inherited, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: INSERT reaches a client role through role membership ([%]); this migration cannot revoke a grant held by another role',
            array_to_string(inherited, ', ');
    END IF;

    -- The server must keep INSERT in both states, or ingestion stops.
    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION
            'unsupported state: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: neither client role can insert ANY column, by ANY path.
    -- ---------------------------------------------------------------------

    IF array_length(effective_roles, 1) IS NULL THEN
        RAISE NOTICE 'item 18: already applied -- neither anon nor authenticated can INSERT any column of knowledge_documents';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: exactly anon and authenticated hold direct table INSERT,
    -- and that grant is the WHOLE of their effective access -- which the
    -- invariants above have just established, because every other path raises.
    -- ---------------------------------------------------------------------

    IF NOT (table_holders @> client_roles AND table_holders <@ client_roles) THEN
        RAISE EXCEPTION
            'unsupported state: expected direct table INSERT for exactly [%], found [%] while [%] hold effective INSERT',
            array_to_string(client_roles, ', '),
            array_to_string(table_holders, ', '),
            array_to_string(effective_roles, ', ');
    END IF;

    RAISE NOTICE 'item 18: removing INSERT on knowledge_documents from anon and authenticated';

    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END
$item18$;
$mig$;

        RAISE EXCEPTION 'the classifier ran to completion' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        -- REJECTION IS NOT ENOUGH; IT MUST BE THE INTENDED REJECTION.
        -- An earlier revision scored a PASS on ANY error, so a plain
        -- malformed-array-literal BUG inside the classifier collected three
        -- of them -- the shape was refused for a reason having nothing to do
        -- with the shape. A broken classifier must never read as
        -- adversarially sound, so both the SQLSTATE and the specific check
        -- that must catch this shape are pinned.
        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'FAIL';
            detail  := 'the classifier ACCEPTED this state instead of rejecting it';
        ELSIF SQLSTATE <> 'P0001' THEN
            outcome := 'FAIL';
            detail  := 'refused by a FAULT, not by a check -- SQLSTATE '
                       || SQLSTATE || ': ' || SQLERRM;
        ELSIF SQLERRM NOT LIKE 'unsupported state: INSERT reaches a client role through role membership%' THEN
            outcome := 'FAIL';
            detail  := 'refused by the WRONG check: ' || SQLERRM;
        ELSE
            outcome := 'PASS';
            detail  := 'refused as intended: ' || SQLERRM;
        END IF;
    END;

    INSERT INTO item18_adversarial_result (case_no, outcome, title, detail)
    VALUES (2, outcome, 'INSERT inherited through another role', detail);
END
$case2$;

-- ---------------------------------------------------------------------------
-- CASE 3 -- a direct client column-level grant in an otherwise post-state ACL.
-- a table revoke would destroy this grant without the rollback restoring it, and until then the client can insert exactly the columns a recycled document needs.
-- ---------------------------------------------------------------------------
DO $case3$
DECLARE
    outcome text;
    detail  text;
    still   text[];
BEGIN
    -- The inner block is a SUBTRANSACTION. Whichever way it ends it ends by
    -- RAISING, so the shape applied below is ALWAYS rolled back -- nothing this
    -- case grants can outlive it, including the probe role.
    BEGIN
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';
        EXECUTE 'GRANT INSERT (id, created_by, board_id, content_sha256) ON TABLE public.knowledge_documents TO authenticated';

        EXECUTE $mig$
DO $item18$
DECLARE
    client_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    table_holders   text[];
    grantable       integer;
    column_grants   text[];
    public_table_insert  boolean;
    public_column_insert text[];
    inherited       text[];
    effective_anon  text[];
    effective_auth  text[];
    effective_roles text[];
    still           text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- Facts, gathered once.
    -- ---------------------------------------------------------------------

    -- Direct TABLE-level INSERT grants held by the client roles.
    SELECT coalesce(array_agg(DISTINCT r.rolname::text ORDER BY r.rolname::text), ARRAY[]::text[])
      INTO table_holders
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE c.oid = tbl
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- Grant options on any client-role INSERT, table or column.
    SELECT count(*) INTO grantable
      FROM (
        SELECT acl.is_grantable
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
        UNION ALL
        SELECT acl.is_grantable
          FROM pg_attribute a
          CROSS JOIN LATERAL aclexplode(a.attacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE a.attrelid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
      ) g;

    -- Separate COLUMN-level INSERT grants to the client roles. A revoke at the
    -- table removes these too, and the rollback would not bring them back.
    SELECT coalesce(array_agg(DISTINCT (r.rolname || '.' || a.attname)::text ORDER BY (r.rolname || '.' || a.attname)::text), ARRAY[]::text[])
      INTO column_grants
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- INSERT granted to PUBLIC reaches every role and cannot be revoked from
    -- the client roles individually. BOTH levels are asked: a COLUMN-level
    -- grant to PUBLIC leaves has_table_privilege false while still letting a
    -- client insert that column.
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT'
           AND acl.grantee = 0
    ) INTO public_table_insert;

    SELECT coalesce(array_agg(DISTINCT a.attname::text ORDER BY a.attname::text), ARRAY[]::text[])
      INTO public_column_insert
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND acl.grantee = 0;

    -- Roles the client roles are MEMBERS of that hold a direct INSERT grant at
    -- either level. Membership is transitive, and this migration cannot revoke
    -- a grant held by another role.
    SELECT coalesce(array_agg(DISTINCT (cr.role_name || ' <- ' || r.rolname)::text ORDER BY (cr.role_name || ' <- ' || r.rolname)::text), ARRAY[]::text[])
      INTO inherited
      FROM unnest(client_roles) AS cr(role_name)
      JOIN pg_roles r
        ON r.rolname::text <> cr.role_name
       AND pg_has_role(cr.role_name::name, r.oid, 'USAGE')
     WHERE EXISTS (
             SELECT 1 FROM pg_class c
               CROSS JOIN LATERAL aclexplode(c.relacl) acl
              WHERE c.oid = tbl
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid)
        OR EXISTS (
             SELECT 1 FROM pg_attribute a
               CROSS JOIN LATERAL aclexplode(a.attacl) acl
              WHERE a.attrelid = tbl
                AND a.attnum > 0 AND NOT a.attisdropped
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid);

    -- WHAT EACH CLIENT ROLE CAN ACTUALLY DO, COLUMN BY COLUMN. This, and not a
    -- table-level question, is what the classification below turns on.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_anon
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('anon', a.attrelid, a.attname, 'INSERT');

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_auth
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT');

    -- array_append, NOT `|| 'anon'`. With an untyped literal PostgreSQL
    -- resolves `text[] || unknown` as array-to-array concatenation and tries to
    -- read the literal as an array, which fails with `malformed array literal`.
    -- array_append(anyarray, anyelement) forces the element reading.
    effective_roles := ARRAY[]::text[];
    IF array_length(effective_anon, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'anon');
    END IF;
    IF array_length(effective_auth, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'authenticated');
    END IF;

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state. Every one of these
    -- is a path the repair cannot close, so none of them may reach the no-op.
    -- ---------------------------------------------------------------------

    IF public_table_insert THEN
        RAISE EXCEPTION
            'unsupported state: INSERT on knowledge_documents is granted to PUBLIC; revoking from the client roles would not remove it';
    END IF;

    IF array_length(public_column_insert, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: column-level INSERT is granted to PUBLIC on [%]; every role including anon and authenticated holds it, and revoking from the client roles would not remove it',
            array_to_string(public_column_insert, ', ');
    END IF;

    IF grantable > 0 THEN
        RAISE EXCEPTION
            'unsupported state: % client-role INSERT grant(s) are WITH GRANT OPTION', grantable;
    END IF;

    IF array_length(column_grants, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: separate column-level INSERT grants exist ([%]); a table revoke would destroy them and the rollback would not restore them',
            array_to_string(column_grants, ', ');
    END IF;

    IF array_length(inherited, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: INSERT reaches a client role through role membership ([%]); this migration cannot revoke a grant held by another role',
            array_to_string(inherited, ', ');
    END IF;

    -- The server must keep INSERT in both states, or ingestion stops.
    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION
            'unsupported state: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: neither client role can insert ANY column, by ANY path.
    -- ---------------------------------------------------------------------

    IF array_length(effective_roles, 1) IS NULL THEN
        RAISE NOTICE 'item 18: already applied -- neither anon nor authenticated can INSERT any column of knowledge_documents';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: exactly anon and authenticated hold direct table INSERT,
    -- and that grant is the WHOLE of their effective access -- which the
    -- invariants above have just established, because every other path raises.
    -- ---------------------------------------------------------------------

    IF NOT (table_holders @> client_roles AND table_holders <@ client_roles) THEN
        RAISE EXCEPTION
            'unsupported state: expected direct table INSERT for exactly [%], found [%] while [%] hold effective INSERT',
            array_to_string(client_roles, ', '),
            array_to_string(table_holders, ', '),
            array_to_string(effective_roles, ', ');
    END IF;

    RAISE NOTICE 'item 18: removing INSERT on knowledge_documents from anon and authenticated';

    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END
$item18$;
$mig$;

        RAISE EXCEPTION 'the classifier ran to completion' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        -- REJECTION IS NOT ENOUGH; IT MUST BE THE INTENDED REJECTION.
        -- An earlier revision scored a PASS on ANY error, so a plain
        -- malformed-array-literal BUG inside the classifier collected three
        -- of them -- the shape was refused for a reason having nothing to do
        -- with the shape. A broken classifier must never read as
        -- adversarially sound, so both the SQLSTATE and the specific check
        -- that must catch this shape are pinned.
        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'FAIL';
            detail  := 'the classifier ACCEPTED this state instead of rejecting it';
        ELSIF SQLSTATE <> 'P0001' THEN
            outcome := 'FAIL';
            detail  := 'refused by a FAULT, not by a check -- SQLSTATE '
                       || SQLSTATE || ': ' || SQLERRM;
        ELSIF SQLERRM NOT LIKE 'unsupported state: separate column-level INSERT grants exist%' THEN
            outcome := 'FAIL';
            detail  := 'refused by the WRONG check: ' || SQLERRM;
        ELSE
            outcome := 'PASS';
            detail  := 'refused as intended: ' || SQLERRM;
        END IF;
    END;

    INSERT INTO item18_adversarial_result (case_no, outcome, title, detail)
    VALUES (3, outcome, 'a direct client column-level grant in an otherwise post-state ACL', detail);
END
$case3$;

-- ---------------------------------------------------------------------------
-- CASE 4 -- POSITIVE CONTROL -- the genuine post-state must be a verified no-op.
-- without this, a classifier that rejected EVERYTHING would pass cases 1-3.
-- ---------------------------------------------------------------------------
DO $case4$
DECLARE
    outcome text;
    detail  text;
    still   text[];
BEGIN
    -- The inner block is a SUBTRANSACTION. Whichever way it ends it ends by
    -- RAISING, so the shape applied below is ALWAYS rolled back -- nothing this
    -- case grants can outlive it, including the probe role.
    BEGIN
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
        EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

        EXECUTE $mig$
DO $item18$
DECLARE
    client_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    table_holders   text[];
    grantable       integer;
    column_grants   text[];
    public_table_insert  boolean;
    public_column_insert text[];
    inherited       text[];
    effective_anon  text[];
    effective_auth  text[];
    effective_roles text[];
    still           text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- Facts, gathered once.
    -- ---------------------------------------------------------------------

    -- Direct TABLE-level INSERT grants held by the client roles.
    SELECT coalesce(array_agg(DISTINCT r.rolname::text ORDER BY r.rolname::text), ARRAY[]::text[])
      INTO table_holders
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE c.oid = tbl
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- Grant options on any client-role INSERT, table or column.
    SELECT count(*) INTO grantable
      FROM (
        SELECT acl.is_grantable
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
        UNION ALL
        SELECT acl.is_grantable
          FROM pg_attribute a
          CROSS JOIN LATERAL aclexplode(a.attacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE a.attrelid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
      ) g;

    -- Separate COLUMN-level INSERT grants to the client roles. A revoke at the
    -- table removes these too, and the rollback would not bring them back.
    SELECT coalesce(array_agg(DISTINCT (r.rolname || '.' || a.attname)::text ORDER BY (r.rolname || '.' || a.attname)::text), ARRAY[]::text[])
      INTO column_grants
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- INSERT granted to PUBLIC reaches every role and cannot be revoked from
    -- the client roles individually. BOTH levels are asked: a COLUMN-level
    -- grant to PUBLIC leaves has_table_privilege false while still letting a
    -- client insert that column.
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT'
           AND acl.grantee = 0
    ) INTO public_table_insert;

    SELECT coalesce(array_agg(DISTINCT a.attname::text ORDER BY a.attname::text), ARRAY[]::text[])
      INTO public_column_insert
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND acl.grantee = 0;

    -- Roles the client roles are MEMBERS of that hold a direct INSERT grant at
    -- either level. Membership is transitive, and this migration cannot revoke
    -- a grant held by another role.
    SELECT coalesce(array_agg(DISTINCT (cr.role_name || ' <- ' || r.rolname)::text ORDER BY (cr.role_name || ' <- ' || r.rolname)::text), ARRAY[]::text[])
      INTO inherited
      FROM unnest(client_roles) AS cr(role_name)
      JOIN pg_roles r
        ON r.rolname::text <> cr.role_name
       AND pg_has_role(cr.role_name::name, r.oid, 'USAGE')
     WHERE EXISTS (
             SELECT 1 FROM pg_class c
               CROSS JOIN LATERAL aclexplode(c.relacl) acl
              WHERE c.oid = tbl
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid)
        OR EXISTS (
             SELECT 1 FROM pg_attribute a
               CROSS JOIN LATERAL aclexplode(a.attacl) acl
              WHERE a.attrelid = tbl
                AND a.attnum > 0 AND NOT a.attisdropped
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid);

    -- WHAT EACH CLIENT ROLE CAN ACTUALLY DO, COLUMN BY COLUMN. This, and not a
    -- table-level question, is what the classification below turns on.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_anon
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('anon', a.attrelid, a.attname, 'INSERT');

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_auth
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT');

    -- array_append, NOT `|| 'anon'`. With an untyped literal PostgreSQL
    -- resolves `text[] || unknown` as array-to-array concatenation and tries to
    -- read the literal as an array, which fails with `malformed array literal`.
    -- array_append(anyarray, anyelement) forces the element reading.
    effective_roles := ARRAY[]::text[];
    IF array_length(effective_anon, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'anon');
    END IF;
    IF array_length(effective_auth, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'authenticated');
    END IF;

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state. Every one of these
    -- is a path the repair cannot close, so none of them may reach the no-op.
    -- ---------------------------------------------------------------------

    IF public_table_insert THEN
        RAISE EXCEPTION
            'unsupported state: INSERT on knowledge_documents is granted to PUBLIC; revoking from the client roles would not remove it';
    END IF;

    IF array_length(public_column_insert, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: column-level INSERT is granted to PUBLIC on [%]; every role including anon and authenticated holds it, and revoking from the client roles would not remove it',
            array_to_string(public_column_insert, ', ');
    END IF;

    IF grantable > 0 THEN
        RAISE EXCEPTION
            'unsupported state: % client-role INSERT grant(s) are WITH GRANT OPTION', grantable;
    END IF;

    IF array_length(column_grants, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: separate column-level INSERT grants exist ([%]); a table revoke would destroy them and the rollback would not restore them',
            array_to_string(column_grants, ', ');
    END IF;

    IF array_length(inherited, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: INSERT reaches a client role through role membership ([%]); this migration cannot revoke a grant held by another role',
            array_to_string(inherited, ', ');
    END IF;

    -- The server must keep INSERT in both states, or ingestion stops.
    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION
            'unsupported state: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: neither client role can insert ANY column, by ANY path.
    -- ---------------------------------------------------------------------

    IF array_length(effective_roles, 1) IS NULL THEN
        RAISE NOTICE 'item 18: already applied -- neither anon nor authenticated can INSERT any column of knowledge_documents';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: exactly anon and authenticated hold direct table INSERT,
    -- and that grant is the WHOLE of their effective access -- which the
    -- invariants above have just established, because every other path raises.
    -- ---------------------------------------------------------------------

    IF NOT (table_holders @> client_roles AND table_holders <@ client_roles) THEN
        RAISE EXCEPTION
            'unsupported state: expected direct table INSERT for exactly [%], found [%] while [%] hold effective INSERT',
            array_to_string(client_roles, ', '),
            array_to_string(table_holders, ', '),
            array_to_string(effective_roles, ', ');
    END IF;

    RAISE NOTICE 'item 18: removing INSERT on knowledge_documents from anon and authenticated';

    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END
$item18$;
$mig$;

        RAISE EXCEPTION 'the classifier ran to completion' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'PASS';
            detail  := 'accepted, as intended';
        ELSE
            outcome := 'FAIL';
            detail  := 'the classifier refused this state: ' || SQLERRM;
        END IF;
    END;

    INSERT INTO item18_adversarial_result (case_no, outcome, title, detail)
    VALUES (4, outcome, 'POSITIVE CONTROL -- the genuine post-state must be a verified no-op', detail);
END
$case4$;

-- ---------------------------------------------------------------------------
-- CASE 5 -- POSITIVE CONTROL -- the supported pre-state must repair.
-- asserted on the OUTCOME, not merely on the absence of an error.
-- ---------------------------------------------------------------------------
DO $case5$
DECLARE
    outcome text;
    detail  text;
    still   text[];
BEGIN
    -- The inner block is a SUBTRANSACTION. Whichever way it ends it ends by
    -- RAISING, so the shape applied below is ALWAYS rolled back -- nothing this
    -- case grants can outlive it, including the probe role.
    BEGIN
        EXECUTE 'GRANT INSERT ON TABLE public.knowledge_documents TO authenticated';
        EXECUTE 'GRANT INSERT ON TABLE public.knowledge_documents TO anon';

        EXECUTE $mig$
DO $item18$
DECLARE
    client_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    table_holders   text[];
    grantable       integer;
    column_grants   text[];
    public_table_insert  boolean;
    public_column_insert text[];
    inherited       text[];
    effective_anon  text[];
    effective_auth  text[];
    effective_roles text[];
    still           text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- Facts, gathered once.
    -- ---------------------------------------------------------------------

    -- Direct TABLE-level INSERT grants held by the client roles.
    SELECT coalesce(array_agg(DISTINCT r.rolname::text ORDER BY r.rolname::text), ARRAY[]::text[])
      INTO table_holders
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE c.oid = tbl
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- Grant options on any client-role INSERT, table or column.
    SELECT count(*) INTO grantable
      FROM (
        SELECT acl.is_grantable
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
        UNION ALL
        SELECT acl.is_grantable
          FROM pg_attribute a
          CROSS JOIN LATERAL aclexplode(a.attacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE a.attrelid = tbl
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
      ) g;

    -- Separate COLUMN-level INSERT grants to the client roles. A revoke at the
    -- table removes these too, and the rollback would not bring them back.
    SELECT coalesce(array_agg(DISTINCT (r.rolname || '.' || a.attname)::text ORDER BY (r.rolname || '.' || a.attname)::text), ARRAY[]::text[])
      INTO column_grants
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- INSERT granted to PUBLIC reaches every role and cannot be revoked from
    -- the client roles individually. BOTH levels are asked: a COLUMN-level
    -- grant to PUBLIC leaves has_table_privilege false while still letting a
    -- client insert that column.
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE c.oid = tbl
           AND acl.privilege_type = 'INSERT'
           AND acl.grantee = 0
    ) INTO public_table_insert;

    SELECT coalesce(array_agg(DISTINCT a.attname::text ORDER BY a.attname::text), ARRAY[]::text[])
      INTO public_column_insert
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND acl.grantee = 0;

    -- Roles the client roles are MEMBERS of that hold a direct INSERT grant at
    -- either level. Membership is transitive, and this migration cannot revoke
    -- a grant held by another role.
    SELECT coalesce(array_agg(DISTINCT (cr.role_name || ' <- ' || r.rolname)::text ORDER BY (cr.role_name || ' <- ' || r.rolname)::text), ARRAY[]::text[])
      INTO inherited
      FROM unnest(client_roles) AS cr(role_name)
      JOIN pg_roles r
        ON r.rolname::text <> cr.role_name
       AND pg_has_role(cr.role_name::name, r.oid, 'USAGE')
     WHERE EXISTS (
             SELECT 1 FROM pg_class c
               CROSS JOIN LATERAL aclexplode(c.relacl) acl
              WHERE c.oid = tbl
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid)
        OR EXISTS (
             SELECT 1 FROM pg_attribute a
               CROSS JOIN LATERAL aclexplode(a.attacl) acl
              WHERE a.attrelid = tbl
                AND a.attnum > 0 AND NOT a.attisdropped
                AND acl.privilege_type = 'INSERT' AND acl.grantee = r.oid);

    -- WHAT EACH CLIENT ROLE CAN ACTUALLY DO, COLUMN BY COLUMN. This, and not a
    -- table-level question, is what the classification below turns on.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_anon
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('anon', a.attrelid, a.attname, 'INSERT');

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_auth
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT');

    -- array_append, NOT `|| 'anon'`. With an untyped literal PostgreSQL
    -- resolves `text[] || unknown` as array-to-array concatenation and tries to
    -- read the literal as an array, which fails with `malformed array literal`.
    -- array_append(anyarray, anyelement) forces the element reading.
    effective_roles := ARRAY[]::text[];
    IF array_length(effective_anon, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'anon');
    END IF;
    IF array_length(effective_auth, 1) IS NOT NULL THEN
        effective_roles := array_append(effective_roles, 'authenticated');
    END IF;

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state. Every one of these
    -- is a path the repair cannot close, so none of them may reach the no-op.
    -- ---------------------------------------------------------------------

    IF public_table_insert THEN
        RAISE EXCEPTION
            'unsupported state: INSERT on knowledge_documents is granted to PUBLIC; revoking from the client roles would not remove it';
    END IF;

    IF array_length(public_column_insert, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: column-level INSERT is granted to PUBLIC on [%]; every role including anon and authenticated holds it, and revoking from the client roles would not remove it',
            array_to_string(public_column_insert, ', ');
    END IF;

    IF grantable > 0 THEN
        RAISE EXCEPTION
            'unsupported state: % client-role INSERT grant(s) are WITH GRANT OPTION', grantable;
    END IF;

    IF array_length(column_grants, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: separate column-level INSERT grants exist ([%]); a table revoke would destroy them and the rollback would not restore them',
            array_to_string(column_grants, ', ');
    END IF;

    IF array_length(inherited, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: INSERT reaches a client role through role membership ([%]); this migration cannot revoke a grant held by another role',
            array_to_string(inherited, ', ');
    END IF;

    -- The server must keep INSERT in both states, or ingestion stops.
    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION
            'unsupported state: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: neither client role can insert ANY column, by ANY path.
    -- ---------------------------------------------------------------------

    IF array_length(effective_roles, 1) IS NULL THEN
        RAISE NOTICE 'item 18: already applied -- neither anon nor authenticated can INSERT any column of knowledge_documents';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: exactly anon and authenticated hold direct table INSERT,
    -- and that grant is the WHOLE of their effective access -- which the
    -- invariants above have just established, because every other path raises.
    -- ---------------------------------------------------------------------

    IF NOT (table_holders @> client_roles AND table_holders <@ client_roles) THEN
        RAISE EXCEPTION
            'unsupported state: expected direct table INSERT for exactly [%], found [%] while [%] hold effective INSERT',
            array_to_string(client_roles, ', '),
            array_to_string(table_holders, ', '),
            array_to_string(effective_roles, ', ');
    END IF;

    RAISE NOTICE 'item 18: removing INSERT on knowledge_documents from anon and authenticated';

    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = tbl
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END
$item18$;
$mig$;

        SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
          INTO still
          FROM pg_attribute a
         WHERE a.attrelid = 'public.knowledge_documents'::regclass
           AND a.attnum > 0 AND NOT a.attisdropped
           AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
                OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));
        IF array_length(still, 1) IS NOT NULL THEN
            RAISE EXCEPTION 'INSERT still reaches a client role on: %', array_to_string(still, ', ')
                USING ERRCODE = 'ZZ002';
        END IF;
        RAISE EXCEPTION 'the classifier ran to completion' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN
            outcome := 'PASS';
            detail  := 'accepted, as intended';
        ELSE
            outcome := 'FAIL';
            detail  := 'the classifier refused this state: ' || SQLERRM;
        END IF;
    END;

    INSERT INTO item18_adversarial_result (case_no, outcome, title, detail)
    VALUES (5, outcome, 'POSITIVE CONTROL -- the supported pre-state must repair', detail);
END
$case5$;

-- ---------------------------------------------------------------------------
-- SUMMARY. The verdict is computed, not eyeballed: a missing case is a failure.
-- ---------------------------------------------------------------------------
SELECT
    CASE
        WHEN count(*) <> 5 THEN '*** INCOMPLETE -- ' || count(*)::text || ' of 5 cases reported'
        WHEN count(*) FILTER (WHERE outcome <> 'PASS') > 0
            THEN '*** FAIL -- ' || count(*) FILTER (WHERE outcome <> 'PASS')::text || ' case(s) failed'
        ELSE 'ALL PASS -- 5 of 5'
    END AS verdict
FROM item18_adversarial_result;

SELECT case_no, outcome, title, detail
  FROM item18_adversarial_result
 ORDER BY case_no;

DROP TABLE item18_adversarial_result;
