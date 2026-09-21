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
-- REPEAT-APPLICABLE, AND THE PRE-STATE IS THE SHAPE THE ROLLBACK RESTORES
-- ============================================================================
--
-- Three outcomes, and no others:
--
--   NEEDS REPAIR   the supported pre-state -> revoke from both client roles
--   ALREADY DONE   the exact intended post-state -> verified no-op
--   anything else  -> raise, and change nothing
--
-- The pre-state is validated as a COMPLETE ACL SHAPE, not just "who holds
-- INSERT". The rollback re-grants table-wide INSERT to the two client roles,
-- and that is an inverse only if the access removed was exactly that: direct
-- table grants, no grant options, no separate column-level INSERT grants, and
-- nothing arriving through PUBLIC or role membership. Each is checked, because
-- an unchecked one would be silently destroyed by the revoke and silently not
-- restored by the rollback.

DO $item18$
DECLARE
    client_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    table_holders   text[];
    grantable       integer;
    column_grants   text[];
    public_insert   boolean;
    effective_roles text[];
    inherited       text[];
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
     WHERE c.oid = 'public.knowledge_documents'::regclass
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- Grant options on any client-role INSERT, table or column.
    SELECT count(*) INTO grantable
      FROM (
        SELECT acl.is_grantable
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = 'public.knowledge_documents'::regclass
           AND acl.privilege_type = 'INSERT' AND acl.is_grantable
           AND r.rolname = ANY (client_roles)
        UNION ALL
        SELECT acl.is_grantable
          FROM pg_attribute a
          CROSS JOIN LATERAL aclexplode(a.attacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE a.attrelid = 'public.knowledge_documents'::regclass
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
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (client_roles);

    -- INSERT granted to PUBLIC reaches every role and cannot be revoked from
    -- the client roles individually.
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE c.oid = 'public.knowledge_documents'::regclass
           AND acl.privilege_type = 'INSERT'
           AND acl.grantee = 0
    ) INTO public_insert;

    -- What each client role can ACTUALLY do, whatever the path.
    SELECT coalesce(array_agg(role_name ORDER BY role_name), ARRAY[]::text[])
      INTO effective_roles
      FROM unnest(client_roles) AS role_name
     WHERE has_table_privilege(role_name, 'public.knowledge_documents', 'INSERT');

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state.
    -- ---------------------------------------------------------------------

    IF public_insert THEN
        RAISE EXCEPTION
            'unsupported state: INSERT on knowledge_documents is granted to PUBLIC; revoking from the client roles would not remove it';
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

    -- Effective access beyond the direct table grants means role membership is
    -- supplying INSERT, which this migration cannot revoke here.
    SELECT array_agg(role_name ORDER BY role_name) INTO inherited
      FROM unnest(effective_roles) AS role_name
     WHERE NOT (role_name = ANY (table_holders));

    IF inherited IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: [%] hold effective INSERT without a direct table grant (role membership)',
            array_to_string(inherited, ', ');
    END IF;

    -- The server must keep INSERT in both states, or ingestion stops.
    IF NOT has_table_privilege('service_role', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION
            'unsupported state: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: no client role holds INSERT by any path.
    -- ---------------------------------------------------------------------

    IF array_length(effective_roles, 1) IS NULL THEN
        RAISE NOTICE 'item 18: already applied -- no client role can INSERT knowledge_documents';
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: exactly anon and authenticated hold direct table INSERT.
    -- ---------------------------------------------------------------------

    IF NOT (table_holders @> client_roles AND table_holders <@ client_roles) THEN
        RAISE EXCEPTION
            'unsupported state: expected direct table INSERT for exactly [%], found [%]',
            array_to_string(client_roles, ', '),
            array_to_string(table_holders, ', ');
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
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END
$item18$;
