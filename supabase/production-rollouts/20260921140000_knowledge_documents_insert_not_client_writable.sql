-- FOLLOWUPS ITEM 18: `authenticated` and `anon` lose INSERT on
-- knowledge_documents.
--
-- A PREREQUISITE, NOT A TIDY-UP. An earlier note argued INSERT could not defeat
-- the staleness guarantee because it creates new rows with new ids. THAT WAS
-- WRONG, and the live schema says why:
--
--   * `id` carries a gen_random_uuid() DEFAULT. is_identity = NO,
--     is_generated = NEVER -- so a caller MAY SUPPLY AN EXPLICIT id.
--   * The INSERT policy checks `created_by = auth.uid()` and board ownership or
--     an editor role. It says nothing about `id`.
--
-- So a permitted client can recreate a DELETED document under its OLD id with a
-- chosen content_sha256 and, once the column exists, a chosen
-- transcript_representation. A wiki source shown as gone would appear present
-- and unchanged. Provenance and staleness fall together.
--
-- WHY REVOKE RATHER THAN ALLOWLIST. Every production INSERT runs through the
-- admin (service_role) client in lib/infra/knowledge/*Adapters.ts; no
-- component, hook or other client path inserts. The capability is unused, so
-- removal is the narrowest correct repair. An allowlist would still let clients
-- create rows, and would have to exclude `id` and `created_by` anyway.
--
-- RLS IS NOT A SUBSTITUTE, and vice versa. They are independent layers: the
-- policy denies `anon` today while the grant still permits it. This closes the
-- grant side.
--
-- ============================================================================
-- REPEAT-APPLICABLE, AND CLASSIFIED BY EFFECTIVE COLUMN-LEVEL ACCESS
-- ============================================================================
--
-- Three outcomes, and no others:
--
--   NEEDS REPAIR   the supported pre-state -> revoke from both client roles
--   ALREADY DONE   the exact intended post-state -> verified no-op
--   anything else  -> raise, and change nothing
--
-- CORRECTED. An earlier version decided all three from
-- has_table_privilege(role, ..., 'INSERT') -- a TABLE-level question -- and
-- read "no client role holds table INSERT" as the intended post-state. That was
-- wrong in the direction that matters: INSERT reaching a client role only at
-- COLUMN level -- through a column grant to PUBLIC, through role membership, or
-- through a direct column grant -- answers that table-level question FALSE. The
-- classifier therefore returned a VERIFIED NO-OP while a client could still
-- insert selected columns, which is the whole attack: `id`, `created_by` and
-- `content_sha256` are all a recycled document needs.
--
-- So access is now derived over EVERY LIVE COLUMN for BOTH client roles with
-- has_column_privilege, which answers what a role can actually do whatever the
-- path, and the no-op requires BOTH effective sets to be EMPTY.
--
-- THE PRE-STATE IS ALSO THE SHAPE THE ROLLBACK RESTORES. The rollback re-grants
-- table-wide INSERT to the two client roles, and that is an inverse only if the
-- access removed was exactly that: direct table grants, no grant options, no
-- separate column-level INSERT grants to anyone (PUBLIC included), and nothing
-- arriving through role membership. Each is checked, because an unchecked one
-- would be silently destroyed by the revoke and silently not restored by the
-- rollback.
--
-- The three adversarial shapes are exercised by
-- production-rollouts/20260921140000_..._adversarial.sql.

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

    effective_roles := ARRAY[]::text[];
    IF array_length(effective_anon, 1) IS NOT NULL THEN
        effective_roles := effective_roles || 'anon';
    END IF;
    IF array_length(effective_auth, 1) IS NOT NULL THEN
        effective_roles := effective_roles || 'authenticated';
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
