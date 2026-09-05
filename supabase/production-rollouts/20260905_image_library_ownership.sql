-- CollabBoard IMAGE-LIBRARY-1 durable Image ownership production rollout.
--
-- SOURCE, in this exact order:
--   1. supabase/migrations/20260905090000_add_padlet_library_item.sql
--   2. supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql
--
-- The DDL, function bodies and grants below are copied BYTE FOR BYTE from those
-- two reviewed migrations. Nothing is improved, reordered or redesigned; this
-- file only adds the preflight and postflight that make it safe to run against
-- production. The migrations themselves are untouched.
--
-- Run as one PostgreSQL statement batch. It is intentionally not a Supabase CLI
-- migration: `[db.migrations] enabled = false` in config.toml, and
-- supabase/BASELINE.md records that supabase/migrations/ does not rebuild the
-- live database.
--
-- Both function versions are applied, in source order, inside ONE transaction.
-- The first is the vulnerable pre-hardening body: no other session ever sees
-- it, because nothing commits until the hardened body has replaced it.
--
-- It does NOT touch: any padlets or library_items row, any policy on either
-- table, board or collaborator policies, storage, or any other function. It
-- adds one nullable column, one foreign key, one partial index, one column
-- comment and one function.
--
-- NO BACKFILL IS PERFORMED OR ATTEMPTED HERE. No Library item is created for an
-- existing image padlet and no existing placement acquires a link. Ownership
-- cannot be inferred from a file URL -- two deliberate crops of one area are
-- two distinct objects -- so inventing relationships would manufacture
-- provenance nobody asserted. A backfill would be a SEPARATE reviewed gate.
--
-- ENTRY STATES. Exactly two are accepted, and NOTHING is ever repaired:
--
--   ABSENT   link column and function both missing        -> install
--   EXACT    every object already in the reviewed form,   -> re-apply
--            including the function's canonical body
--            digest, owner, configuration and full ACL
--
-- Anything else ABORTS before the first mutation and the operator decides. The
-- initial pre-hardening function body is deliberately NOT an accepted entry
-- state: this batch is transactional, so a failed run leaves nothing behind and
-- that body can never be a legitimate resting state in production.
--
-- NO OPERATOR RE-PINNING. A digest, catalog or type mismatch means STOP. The
-- expected values here are a reviewed code change, never something to edit
-- during a rollout to make it proceed.
--
-- CANONICAL FUNCTION IDENTITY. Keyword checks cannot tell a hardened body from
-- a weakened one that still mentions the same identifiers, so the authority
-- here is md5(pg_proc.prosrc) -- the stored body, byte for byte as the reviewed
-- migration wrote it -- pinned below and re-derived from that migration file by
-- scripts/db/imageLibraryRollout.source.test.ts. Signature, result columns,
-- security posture, configuration, owner and the complete ACL (including
-- grantability) are asserted alongside it, because a body digest alone says
-- nothing about who may call it.
--
-- VERSION INDEPENDENCE. No load-bearing comparison reads a catalog-RENDERED
-- statement. Argument and result types come from pg_type.typname, the index is
-- compared structurally, and the one expression that is rendered -- the partial
-- index predicate -- is whitespace- and parenthesis-normalised before
-- comparison. There is therefore no PostgreSQL-major-specific formatting this
-- artifact can be fooled or falsely blocked by; it was proven on 17.6.
--
-- RELEASE ORDER -- DB FIRST, APPLICATION SECOND. Do not reverse it:
--   1. Confirm the reviewed application code is still UNDEPLOYED.
--   2. Apply this rollout.
--   3. Run 20260905_image_library_ownership_verify.sql.
--   4. Require rollout_readiness true; it is the conjunction of every check.
--   5. Only then deploy the reviewed application code (PDF-area Image
--      ownership, ordinary NEW Image ownership, Freeform Library reuse, and
--      the non-Freeform layout reuse links).
--   6. After deployment, run the manual runtime smoke proof.
-- The application calls create_image_post_with_library_item and writes
-- padlets.library_item_id; deploying it first would call a function and a
-- column production does not yet have.
--
-- Backward compatible with the CURRENTLY deployed application: the column is
-- nullable AND carries NO DEFAULT, so existing INSERTs that never name it keep
-- writing NULL. A default would generate an id with no library_items row behind
-- it and every such INSERT would fail the foreign key -- which is why a
-- pre-existing default is refused rather than accepted.

BEGIN;

DO $preflight$
DECLARE
    -- The canonical body of the FINAL hardened function. Derived from
    -- supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql
    -- and re-derived from that same file by the source test, so it can never
    -- drift into an unexplained constant.
    expected_body_md5 constant text := 'e5b8ce9de5a443313593af4ee71c28b8';
    -- Structural, never catalog-rendered prose: pg_type.typname is a stored
    -- identifier, while pg_get_function_identity_arguments would render
    -- "double precision" in a format this file would then depend on.
    expected_argtypes constant text[] := ARRAY[
        'uuid', 'uuid', 'uuid', 'text', 'text', 'float8', 'float8', 'float8',
        'float8', 'text', 'jsonb'];
    expected_out_columns constant text[] := ARRAY['padlet_id:uuid', 'library_item_id:uuid'];
    expected_owner constant text := 'postgres';
    expected_config constant text[] := ARRAY['search_path=public'];
    -- grantee:privilege:is_grantable. WITH GRANT OPTION is a delegation right:
    -- without is_grantable here, `authenticated` could hand EXECUTE to anyone.
    expected_acl constant text[] := ARRAY[
        'authenticated:EXECUTE:false', 'postgres:EXECUTE:false', 'service_role:EXECUTE:false'];
    signature constant text :=
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)';
    fn oid;
    link_attnum smallint;
    missing text;
    actual text;
    actual_list text[];
    link_type text;
    link_nullable text;
    link_default text;
    fk_count integer;
    fk_rule text;
    fk_target text;
    overloads integer;
BEGIN
    -- 1. PREREQUISITES, WITH TYPES. Every relation, column and callable the
    -- FINAL hardened function depends on, traced from that function. Existence
    -- is not enough: a boards.user_id of type text passes an existence check
    -- and then fails at runtime with "operator does not exist: text = uuid",
    -- long after this rollout reported success.
    --
    -- Type classes rather than exact type names where the function genuinely
    -- does not care: the authority keys must be uuid, the JSONB payloads must
    -- be jsonb, and the text/numeric columns accept their whole family, which
    -- is what production actually carries (padlets.type is varchar(50),
    -- position_x is integer, width is numeric).
    FOREACH actual IN ARRAY ARRAY[
        'public.padlets', 'public.library_items',
        'public.boards', 'public.board_collaborators'
    ] LOOP
        IF to_regclass(actual) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: % is missing', actual;
        END IF;
    END LOOP;

    -- The actor binding calls this, and compares its result to a uuid.
    IF to_regprocedure('auth.uid()') IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: auth.uid() is missing';
    END IF;
    IF (SELECT prorettype FROM pg_proc WHERE oid = to_regprocedure('auth.uid()'))
         <> 'uuid'::regtype THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: auth.uid() returns %, expected uuid',
            (SELECT prorettype::regtype::text FROM pg_proc
              WHERE oid = to_regprocedure('auth.uid()'));
    END IF;

    SELECT string_agg(req.t || '.' || req.c || ' (' || req.k || ', found '
                      || COALESCE(col.udt_name, 'nothing') || ')', ', ' ORDER BY req.t, req.c)
      INTO missing
      FROM (VALUES
            ('boards','id','uuid'),('boards','user_id','uuid'),
            ('board_collaborators','board_id','uuid'),
            ('board_collaborators','user_id','uuid'),
            ('board_collaborators','role','text'),
            ('padlets','id','uuid'),('padlets','board_id','uuid'),
            ('padlets','title','text'),('padlets','content','text'),
            ('padlets','type','text'),('padlets','position_x','numeric'),
            ('padlets','position_y','numeric'),('padlets','width','numeric'),
            ('padlets','height','numeric'),('padlets','file_url','text'),
            ('padlets','metadata','jsonb'),
            ('library_items','id','uuid'),('library_items','user_id','uuid'),
            ('library_items','title','text'),('library_items','type','text'),
            ('library_items','content','jsonb'),
            ('library_items','thumbnail_url','text'),
            ('library_items','is_public','bool')
           ) AS req(t, c, k)
      LEFT JOIN information_schema.columns AS col
             ON col.table_schema = 'public' AND col.table_name = req.t
            AND col.column_name = req.c
     WHERE col.column_name IS NULL
        OR NOT CASE req.k
                WHEN 'uuid'    THEN col.udt_name = 'uuid'
                WHEN 'jsonb'   THEN col.udt_name = 'jsonb'
                WHEN 'bool'    THEN col.udt_name = 'bool'
                WHEN 'text'    THEN col.udt_name IN ('text', 'varchar', 'bpchar')
                WHEN 'numeric' THEN col.udt_name IN ('int2', 'int4', 'int8',
                                                     'numeric', 'float4', 'float8')
                ELSE false
               END;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: unusable prerequisite column(s): %', missing;
    END IF;

    -- 2. THE LINK COLUMN. Present means it must ALREADY be exactly right.
    SELECT data_type, is_nullable, column_default
      INTO link_type, link_nullable, link_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'padlets'
       AND column_name = 'library_item_id';

    IF link_type IS NOT NULL THEN
        IF link_type <> 'uuid' THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id is %, expected uuid',
                link_type;
        END IF;
        IF link_nullable <> 'YES' THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id is NOT NULL';
        END IF;
        -- A default would hand every legacy INSERT a library id with no row
        -- behind it, and the foreign key would reject the write.
        IF link_default IS NOT NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id has DEFAULT %, expected none',
                link_default;
        END IF;

        -- Exactly ONE foreign key, and the right one. Counting matters: an
        -- extra CASCADE key alongside the correct SET NULL key would delete
        -- board placements when a personal Library item is removed.
        SELECT count(*) INTO fk_count
          FROM information_schema.key_column_usage AS k
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = k.constraint_name
           AND rc.constraint_schema = k.constraint_schema
         WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
           AND k.column_name = 'library_item_id';
        IF fk_count <> 1 THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id has % foreign keys, expected exactly 1',
                fk_count;
        END IF;

        SELECT rc.delete_rule,
               ccu.table_schema || '.' || ccu.table_name || '(' || ccu.column_name || ')'
          INTO fk_rule, fk_target
          FROM information_schema.key_column_usage AS k
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = k.constraint_name
           AND rc.constraint_schema = k.constraint_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = k.constraint_name
           AND ccu.constraint_schema = k.constraint_schema
         WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
           AND k.column_name = 'library_item_id';
        IF fk_target IS DISTINCT FROM 'public.library_items(id)' THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id references %, expected public.library_items(id)',
                fk_target;
        END IF;
        IF fk_rule <> 'SET NULL' THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id delete rule is %, expected SET NULL',
                fk_rule;
        END IF;
    END IF;

    -- Cardinality is load-bearing product behaviour: one durable Library object
    -- may be placed many times. Detection is by CATALOG DEPENDENCY, not by
    -- reading index key columns: an expression index such as
    -- UNIQUE ((library_item_id::text)) stores 0 in indkey and would slip past
    -- an attnum comparison while still outlawing the second placement.
    SELECT a.attnum INTO link_attnum FROM pg_attribute AS a
     WHERE a.attrelid = to_regclass('public.padlets') AND a.attname = 'library_item_id';
    IF link_attnum IS NOT NULL THEN
        SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO actual
          FROM pg_index AS i JOIN pg_class AS c ON c.oid = i.indexrelid
         WHERE i.indrelid = to_regclass('public.padlets')
           AND i.indisunique
           AND EXISTS (
                SELECT 1 FROM pg_depend AS d
                 WHERE d.classid = 'pg_class'::regclass AND d.objid = i.indexrelid
                   AND d.refclassid = 'pg_class'::regclass AND d.refobjid = i.indrelid
                   AND d.refobjsubid = link_attnum);
        IF actual IS NOT NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: UNIQUE index(es) % constrain padlets.library_item_id, which would outlaw reuse',
                actual;
        END IF;

        -- Unique and exclusion CONSTRAINTS reach the same outcome by another
        -- route, so they fail closed too.
        SELECT string_agg(con.conname, ', ' ORDER BY con.conname) INTO actual
          FROM pg_constraint AS con
         WHERE con.conrelid = to_regclass('public.padlets')
           AND con.contype IN ('u', 'x', 'p')
           AND link_attnum = ANY (con.conkey);
        IF actual IS NOT NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: constraint(s) % constrain padlets.library_item_id',
                actual;
        END IF;
    END IF;

    -- The supporting index, checked STRUCTURALLY. pg_get_indexdef renders a
    -- whole statement whose formatting is a PostgreSQL-major detail; indisunique,
    -- the access method and the key attnum are stored facts. Only the partial
    -- predicate is rendered, and it is normalised before comparison.
    SELECT (CASE WHEN i.indisunique THEN 'unique' ELSE 'non-unique' END)
           || ' ' || am.amname
           || ' keys=' || COALESCE((SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                                      FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                                      LEFT JOIN pg_attribute AS a
                                             ON a.attrelid = i.indrelid AND a.attnum = k.attnum), '(expression)')
           || ' natts=' || i.indnatts::text
           || ' expr=' || (i.indexprs IS NOT NULL)::text
           || ' pred=' || lower(regexp_replace(COALESCE(pg_get_expr(i.indpred, i.indrelid), ''),
                                               '[\s()]', '', 'g'))
      INTO actual
      FROM pg_index AS i
      JOIN pg_class AS c ON c.oid = i.indexrelid
      JOIN pg_am AS am ON am.oid = c.relam
     WHERE i.indrelid = to_regclass('public.padlets')
       AND c.relname = 'padlets_library_item_id_idx';
    -- Absent is acceptable ONLY on a fresh install, where section A creates
    -- it. Once the link column exists this batch has already run, so a missing
    -- or reshaped index is drift, and silently re-creating one nobody dropped
    -- on purpose would be exactly the unattended repair this preflight refuses.
    IF actual IS DISTINCT FROM 'non-unique btree keys=library_item_id natts=1 expr=false pred=library_item_idisnotnull'
       AND NOT (actual IS NULL AND link_type IS NULL) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: padlets_library_item_id_idx is [%], expected [%]',
            COALESCE(actual, 'absent'), 'non-unique btree keys=library_item_id natts=1 expr=false pred=library_item_idisnotnull';
    END IF;

    -- 3. THE FUNCTION. Absent, or byte-for-byte the reviewed final contract.
    SELECT count(*) INTO overloads
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_image_post_with_library_item'
       AND p.oid <> COALESCE(to_regprocedure(signature), 0);
    IF overloads > 0 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: % unexpected overload(s) of create_image_post_with_library_item',
            overloads;
    END IF;

    fn := to_regprocedure(signature);
    IF fn IS NOT NULL THEN
        -- The body. This is what a keyword check cannot do: a viewer-allowing,
        -- retry-bypassing or reordered body still mentions every identifier the
        -- hardened one does, and still differs here on the first byte changed.
        SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = fn;
        IF actual <> expected_body_md5 THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: existing function body digest is %, expected % -- refusing to overwrite an unreviewed function',
                actual, expected_body_md5;
        END IF;

        SELECT array_agg(t.typname::text ORDER BY k.ord) INTO actual_list
          FROM pg_proc AS p, unnest(p.proargtypes) WITH ORDINALITY AS k(argtype, ord)
          JOIN pg_type AS t ON t.oid = k.argtype
         WHERE p.oid = fn;
        IF actual_list IS DISTINCT FROM expected_argtypes THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: function argument types are %, expected %',
                actual_list, expected_argtypes;
        END IF;

        SELECT array_agg(k.argname || ':' || t.typname ORDER BY k.ord) INTO actual_list
          FROM pg_proc AS p,
               unnest(p.proallargtypes, p.proargmodes, p.proargnames)
                 WITH ORDINALITY AS k(argtype, argmode, argname, ord)
          JOIN pg_type AS t ON t.oid = k.argtype
         WHERE p.oid = fn AND k.argmode = 't';
        IF actual_list IS DISTINCT FROM expected_out_columns
           OR NOT (SELECT proretset FROM pg_proc WHERE oid = fn) THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: function result columns are %, expected %',
                actual_list, expected_out_columns;
        END IF;

        IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: existing function is SECURITY DEFINER';
        END IF;
        IF (SELECT COALESCE(proconfig, ARRAY[]::text[]) FROM pg_proc WHERE oid = fn)
             IS DISTINCT FROM expected_config THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: function configuration is %, expected %',
                (SELECT proconfig FROM pg_proc WHERE oid = fn), expected_config;
        END IF;

        -- Owner. The repo's schema is owned by postgres throughout, and the
        -- owner can replace the body at will, so an unexpected owner is an
        -- authority change even when today's body still matches.
        SELECT pg_get_userbyid(proowner) INTO actual FROM pg_proc WHERE oid = fn;
        IF actual <> expected_owner THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: function owner is %, expected %',
                actual, expected_owner;
        END IF;

        -- The COMPLETE explicit ACL including GRANTABILITY. An extra EXECUTE
        -- holder is a caller nobody reviewed; WITH GRANT OPTION is worse still,
        -- because the holder can then hand EXECUTE to anyone at all.
        SELECT array_agg(entry ORDER BY entry) INTO actual_list FROM (
            SELECT (CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                         ELSE pg_get_userbyid(a.grantee) END)
                   || ':' || a.privilege_type || ':' || a.is_grantable::text AS entry
              FROM pg_proc AS p, aclexplode(p.proacl) AS a
             WHERE p.oid = fn) AS acl;
        IF COALESCE(actual_list, ARRAY[]::text[]) IS DISTINCT FROM expected_acl THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: function ACL is %, expected %',
                COALESCE(actual_list, ARRAY[]::text[]), expected_acl;
        END IF;
    END IF;
END;
$preflight$;

-- A. The link column, index and comment.
--    Source: 20260905090000_add_padlet_library_item.sql
--    NULLABLE by design and DELIBERATELY NOT UNIQUE -- one durable object may
--    be placed many times; per-request idempotence is the padlet primary key.
ALTER TABLE public.padlets
    ADD COLUMN IF NOT EXISTS library_item_id uuid
    REFERENCES public.library_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS padlets_library_item_id_idx
    ON public.padlets (library_item_id)
    WHERE library_item_id IS NOT NULL;

COMMENT ON COLUMN public.padlets.library_item_id IS
    'IMAGE-LIBRARY-1: the durable library_items row this placement shows. NULL '
    'for posts with no library identity. Not unique: one library object may be '
    'placed many times.';

-- B. The initial atomic function, exactly as first reviewed.
--    Source: 20260905090000_add_padlet_library_item.sql
--    Superseded in place by section C below, in this same transaction.
CREATE OR REPLACE FUNCTION public.create_image_post_with_library_item(
    p_padlet_id uuid,
    p_board_id uuid,
    p_user_id uuid,
    p_title text,
    p_content text,
    p_position_x double precision,
    p_position_y double precision,
    p_width double precision,
    p_height double precision,
    p_file_url text,
    p_metadata jsonb
)
RETURNS TABLE (padlet_id uuid, library_item_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_library_item_id uuid;
    v_existing uuid;
BEGIN
    -- Idempotence, owned by the padlet's own primary key: a retry that carries
    -- the id of a placement already created returns what exists instead of
    -- minting a second Library object for one saved Image Post. Nothing is
    -- deduplicated by image content -- two deliberate crops of one area stay
    -- two distinct objects.
    SELECT p.library_item_id INTO v_existing
      FROM public.padlets p WHERE p.id = p_padlet_id;
    IF FOUND THEN
        RETURN QUERY SELECT p_padlet_id, v_existing;
        RETURN;
    END IF;

    -- The durable object first, so the placement can carry its id. Its content
    -- is the same snapshot shape the existing "Add to library" gesture writes,
    -- so the Library panel renders it with the ordinary image card and it can be
    -- dragged back onto a canvas exactly like a hand-saved one.
    INSERT INTO public.library_items (user_id, title, type, content, thumbnail_url, is_public)
    VALUES (
        p_user_id,
        p_title,
        'image',
        jsonb_build_object(
            'title', p_title,
            'content', p_content,
            'type', 'image',
            'width', p_width,
            'height', p_height,
            'file_url', p_file_url,
            'metadata', p_metadata
        ),
        p_file_url,
        false
    )
    RETURNING id INTO v_library_item_id;

    INSERT INTO public.padlets (
        id, board_id, title, content, type, position_x, position_y,
        width, height, file_url, metadata, library_item_id
    ) VALUES (
        p_padlet_id, p_board_id, p_title, p_content, 'image', p_position_x, p_position_y,
        p_width, p_height, p_file_url, p_metadata, v_library_item_id
    );

    RETURN QUERY SELECT p_padlet_id, v_library_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) TO authenticated, service_role;

-- C. The hardened body. THIS is the production contract.
--    Source: 20260905100000_harden_image_post_library_idempotency.sql
--    Idempotency must not bypass authorization: logical actor, then board-write
--    authority, then and only then "is this a genuine retry". No success and no
--    identity leaves this function before authorization.
CREATE OR REPLACE FUNCTION public.create_image_post_with_library_item(
    p_padlet_id uuid,
    p_board_id uuid,
    p_user_id uuid,
    p_title text,
    p_content text,
    p_position_x double precision,
    p_position_y double precision,
    p_width double precision,
    p_height double precision,
    p_file_url text,
    p_metadata jsonb
)
RETURNS TABLE (padlet_id uuid, library_item_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_library_item_id uuid;
    v_existing_board uuid;
    v_existing_library uuid;
    v_library_owner uuid;
    v_found boolean;
BEGIN
    -- 1. THE LOGICAL ACTOR.
    -- Called directly, the caller is whoever the JWT says, and may not nominate
    -- anyone else. Called by the trusted route through service_role there is no
    -- auth.uid(), and p_user_id is the id that route already authenticated --
    -- which is why step 2 below still has to be run against it.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;

    -- 2. BOARD-WRITE AUTHORITY FOR THAT ACTOR -- load-bearing, not decorative.
    -- service_role bypasses RLS, so without this the route's own check would be
    -- the only thing standing between a delegated id and someone else's board.
    --
    -- This is the `board_id` branch of the padlets INSERT policy, reproduced
    -- exactly: owner of the board, or a collaborator whose role is 'editor'.
    -- Nothing is broadened -- viewer and commenter are absent by construction.
    -- `can_edit_board()` is deliberately NOT used: it resolves the CANVASES
    -- authority model (it reads public.canvases and workspace roles), which is
    -- the other half of the padlets policy and not the half that governs an
    -- image placement created with a board_id.
    IF NOT EXISTS (
        SELECT 1 FROM public.boards b
         WHERE b.id = p_board_id AND b.user_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.board_collaborators c
         WHERE c.board_id = p_board_id AND c.user_id = p_user_id AND c.role = 'editor'
    ) THEN
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;

    -- 3. ONLY NOW: is this a genuine retry of THIS actor's own request?
    -- Every part of the identity must agree -- same placement, same board, a
    -- library object that exists, and one belonging to this actor. Anything
    -- else (another creator's card, a card from a different board, a placement
    -- with no library identity) fails closed with the SAME generic message, so
    -- a caller cannot tell the cases apart, and no id is ever returned.
    SELECT true, p.board_id, p.library_item_id, l.user_id
      INTO v_found, v_existing_board, v_existing_library, v_library_owner
      FROM public.padlets p
      LEFT JOIN public.library_items l ON l.id = p.library_item_id
     WHERE p.id = p_padlet_id;

    IF v_found THEN
        IF v_existing_board = p_board_id
           AND v_existing_library IS NOT NULL
           AND v_library_owner = p_user_id
        THEN
            RETURN QUERY SELECT p_padlet_id, v_existing_library;
            RETURN;
        END IF;
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;

    -- 4. The durable object and its placement, in this one transaction.
    INSERT INTO public.library_items (user_id, title, type, content, thumbnail_url, is_public)
    VALUES (
        p_user_id,
        p_title,
        'image',
        jsonb_build_object(
            'title', p_title,
            'content', p_content,
            'type', 'image',
            'width', p_width,
            'height', p_height,
            'file_url', p_file_url,
            'metadata', p_metadata
        ),
        p_file_url,
        false
    )
    RETURNING id INTO v_library_item_id;

    INSERT INTO public.padlets (
        id, board_id, title, content, type, position_x, position_y,
        width, height, file_url, metadata, library_item_id
    ) VALUES (
        p_padlet_id, p_board_id, p_title, p_content, 'image', p_position_x, p_position_y,
        p_width, p_height, p_file_url, p_metadata, v_library_item_id
    );

    RETURN QUERY SELECT p_padlet_id, v_library_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) TO authenticated, service_role;

-- Nothing leaves this transaction unless the committed state is the reviewed
-- one. Every check re-queries the catalog; nothing here reuses a boolean the
-- preflight computed, because a prerequisite can be dropped between the two.
DO $postflight$
DECLARE
    -- The canonical body of the FINAL hardened function. Derived from
    -- supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql
    -- and re-derived from that same file by the source test, so it can never
    -- drift into an unexplained constant.
    expected_body_md5 constant text := 'e5b8ce9de5a443313593af4ee71c28b8';
    -- Structural, never catalog-rendered prose: pg_type.typname is a stored
    -- identifier, while pg_get_function_identity_arguments would render
    -- "double precision" in a format this file would then depend on.
    expected_argtypes constant text[] := ARRAY[
        'uuid', 'uuid', 'uuid', 'text', 'text', 'float8', 'float8', 'float8',
        'float8', 'text', 'jsonb'];
    expected_out_columns constant text[] := ARRAY['padlet_id:uuid', 'library_item_id:uuid'];
    expected_owner constant text := 'postgres';
    expected_config constant text[] := ARRAY['search_path=public'];
    -- grantee:privilege:is_grantable. WITH GRANT OPTION is a delegation right:
    -- without is_grantable here, `authenticated` could hand EXECUTE to anyone.
    expected_acl constant text[] := ARRAY[
        'authenticated:EXECUTE:false', 'postgres:EXECUTE:false', 'service_role:EXECUTE:false'];
    signature constant text :=
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)';
    fn oid;
    link_attnum smallint;
    missing text;
    actual text;
    actual_list text[];
BEGIN
    -- 1. PREREQUISITES, WITH TYPES. Every relation, column and callable the
    -- FINAL hardened function depends on, traced from that function. Existence
    -- is not enough: a boards.user_id of type text passes an existence check
    -- and then fails at runtime with "operator does not exist: text = uuid",
    -- long after this rollout reported success.
    --
    -- Type classes rather than exact type names where the function genuinely
    -- does not care: the authority keys must be uuid, the JSONB payloads must
    -- be jsonb, and the text/numeric columns accept their whole family, which
    -- is what production actually carries (padlets.type is varchar(50),
    -- position_x is integer, width is numeric).
    FOREACH actual IN ARRAY ARRAY[
        'public.padlets', 'public.library_items',
        'public.boards', 'public.board_collaborators'
    ] LOOP
        IF to_regclass(actual) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY postflight failed: % is missing', actual;
        END IF;
    END LOOP;

    -- The actor binding calls this, and compares its result to a uuid.
    IF to_regprocedure('auth.uid()') IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: auth.uid() is missing';
    END IF;
    IF (SELECT prorettype FROM pg_proc WHERE oid = to_regprocedure('auth.uid()'))
         <> 'uuid'::regtype THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: auth.uid() returns %, expected uuid',
            (SELECT prorettype::regtype::text FROM pg_proc
              WHERE oid = to_regprocedure('auth.uid()'));
    END IF;

    SELECT string_agg(req.t || '.' || req.c || ' (' || req.k || ', found '
                      || COALESCE(col.udt_name, 'nothing') || ')', ', ' ORDER BY req.t, req.c)
      INTO missing
      FROM (VALUES
            ('boards','id','uuid'),('boards','user_id','uuid'),
            ('board_collaborators','board_id','uuid'),
            ('board_collaborators','user_id','uuid'),
            ('board_collaborators','role','text'),
            ('padlets','id','uuid'),('padlets','board_id','uuid'),
            ('padlets','title','text'),('padlets','content','text'),
            ('padlets','type','text'),('padlets','position_x','numeric'),
            ('padlets','position_y','numeric'),('padlets','width','numeric'),
            ('padlets','height','numeric'),('padlets','file_url','text'),
            ('padlets','metadata','jsonb'),
            ('library_items','id','uuid'),('library_items','user_id','uuid'),
            ('library_items','title','text'),('library_items','type','text'),
            ('library_items','content','jsonb'),
            ('library_items','thumbnail_url','text'),
            ('library_items','is_public','bool')
           ) AS req(t, c, k)
      LEFT JOIN information_schema.columns AS col
             ON col.table_schema = 'public' AND col.table_name = req.t
            AND col.column_name = req.c
     WHERE col.column_name IS NULL
        OR NOT CASE req.k
                WHEN 'uuid'    THEN col.udt_name = 'uuid'
                WHEN 'jsonb'   THEN col.udt_name = 'jsonb'
                WHEN 'bool'    THEN col.udt_name = 'bool'
                WHEN 'text'    THEN col.udt_name IN ('text', 'varchar', 'bpchar')
                WHEN 'numeric' THEN col.udt_name IN ('int2', 'int4', 'int8',
                                                     'numeric', 'float4', 'float8')
                ELSE false
               END;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: unusable prerequisite column(s): %', missing;
    END IF;

    -- Column: uuid, nullable, and no default, so a legacy INSERT still writes
    -- NULL rather than a fabricated id the foreign key would reject.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets'
           AND column_name = 'library_item_id'
           AND data_type = 'uuid' AND is_nullable = 'YES'
           AND column_default IS NULL) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: padlets.library_item_id is not a nullable uuid with no default';
    END IF;

    IF (SELECT count(*) FROM information_schema.key_column_usage AS k
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = k.constraint_name
           AND rc.constraint_schema = k.constraint_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = k.constraint_name
           AND ccu.constraint_schema = k.constraint_schema
         WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
           AND k.column_name = 'library_item_id'
           AND ccu.table_schema = 'public' AND ccu.table_name = 'library_items'
           AND ccu.column_name = 'id' AND rc.delete_rule = 'SET NULL') <> 1
       OR (SELECT count(*) FROM information_schema.key_column_usage AS k
             JOIN information_schema.referential_constraints AS rc
               ON rc.constraint_name = k.constraint_name
              AND rc.constraint_schema = k.constraint_schema
            WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
              AND k.column_name = 'library_item_id') <> 1 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: padlets.library_item_id does not carry exactly one ON DELETE SET NULL key to library_items(id)';
    END IF;

    -- Cardinality is load-bearing product behaviour: one durable Library object
    -- may be placed many times. Detection is by CATALOG DEPENDENCY, not by
    -- reading index key columns: an expression index such as
    -- UNIQUE ((library_item_id::text)) stores 0 in indkey and would slip past
    -- an attnum comparison while still outlawing the second placement.
    SELECT a.attnum INTO link_attnum FROM pg_attribute AS a
     WHERE a.attrelid = to_regclass('public.padlets') AND a.attname = 'library_item_id';
    IF link_attnum IS NOT NULL THEN
        SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO actual
          FROM pg_index AS i JOIN pg_class AS c ON c.oid = i.indexrelid
         WHERE i.indrelid = to_regclass('public.padlets')
           AND i.indisunique
           AND EXISTS (
                SELECT 1 FROM pg_depend AS d
                 WHERE d.classid = 'pg_class'::regclass AND d.objid = i.indexrelid
                   AND d.refclassid = 'pg_class'::regclass AND d.refobjid = i.indrelid
                   AND d.refobjsubid = link_attnum);
        IF actual IS NOT NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY postflight failed: UNIQUE index(es) % constrain padlets.library_item_id, which would outlaw reuse',
                actual;
        END IF;

        -- Unique and exclusion CONSTRAINTS reach the same outcome by another
        -- route, so they fail closed too.
        SELECT string_agg(con.conname, ', ' ORDER BY con.conname) INTO actual
          FROM pg_constraint AS con
         WHERE con.conrelid = to_regclass('public.padlets')
           AND con.contype IN ('u', 'x', 'p')
           AND link_attnum = ANY (con.conkey);
        IF actual IS NOT NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY postflight failed: constraint(s) % constrain padlets.library_item_id',
                actual;
        END IF;
    END IF;

    -- The supporting index, checked STRUCTURALLY. pg_get_indexdef renders a
    -- whole statement whose formatting is a PostgreSQL-major detail; indisunique,
    -- the access method and the key attnum are stored facts. Only the partial
    -- predicate is rendered, and it is normalised before comparison.
    SELECT (CASE WHEN i.indisunique THEN 'unique' ELSE 'non-unique' END)
           || ' ' || am.amname
           || ' keys=' || COALESCE((SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                                      FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                                      LEFT JOIN pg_attribute AS a
                                             ON a.attrelid = i.indrelid AND a.attnum = k.attnum), '(expression)')
           || ' natts=' || i.indnatts::text
           || ' expr=' || (i.indexprs IS NOT NULL)::text
           || ' pred=' || lower(regexp_replace(COALESCE(pg_get_expr(i.indpred, i.indrelid), ''),
                                               '[\s()]', '', 'g'))
      INTO actual
      FROM pg_index AS i
      JOIN pg_class AS c ON c.oid = i.indexrelid
      JOIN pg_am AS am ON am.oid = c.relam
     WHERE i.indrelid = to_regclass('public.padlets')
       AND c.relname = 'padlets_library_item_id_idx';
    IF actual IS DISTINCT FROM 'non-unique btree keys=library_item_id natts=1 expr=false pred=library_item_idisnotnull' THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: padlets_library_item_id_idx is [%], expected [%]',
            COALESCE(actual, 'absent'), 'non-unique btree keys=library_item_id natts=1 expr=false pred=library_item_idisnotnull';
    END IF;

    fn := to_regprocedure(signature);
    IF fn IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: create_image_post_with_library_item is missing';
    END IF;
    IF (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'create_image_post_with_library_item') <> 1 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: unexpected overloads of create_image_post_with_library_item';
    END IF;

    SELECT md5(prosrc) INTO actual FROM pg_proc WHERE oid = fn;
    IF actual <> expected_body_md5 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: committed function body digest is %, expected %',
            actual, expected_body_md5;
    END IF;

    SELECT array_agg(t.typname::text ORDER BY k.ord) INTO actual_list
      FROM pg_proc AS p, unnest(p.proargtypes) WITH ORDINALITY AS k(argtype, ord)
      JOIN pg_type AS t ON t.oid = k.argtype
     WHERE p.oid = fn;
    IF actual_list IS DISTINCT FROM expected_argtypes THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: function argument types are %, expected %',
            actual_list, expected_argtypes;
    END IF;

    SELECT array_agg(k.argname || ':' || t.typname ORDER BY k.ord) INTO actual_list
      FROM pg_proc AS p,
           unnest(p.proallargtypes, p.proargmodes, p.proargnames)
             WITH ORDINALITY AS k(argtype, argmode, argname, ord)
      JOIN pg_type AS t ON t.oid = k.argtype
     WHERE p.oid = fn AND k.argmode = 't';
    IF actual_list IS DISTINCT FROM expected_out_columns
       OR NOT (SELECT proretset FROM pg_proc WHERE oid = fn) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: function result columns are %, expected %',
            actual_list, expected_out_columns;
    END IF;

    IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: function is SECURITY DEFINER';
    END IF;
    IF (SELECT COALESCE(proconfig, ARRAY[]::text[]) FROM pg_proc WHERE oid = fn)
         IS DISTINCT FROM expected_config THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: function configuration is not exactly %', expected_config;
    END IF;
    SELECT pg_get_userbyid(proowner) INTO actual FROM pg_proc WHERE oid = fn;
    IF actual <> expected_owner THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: function owner is %, expected %', actual, expected_owner;
    END IF;

    SELECT array_agg(entry ORDER BY entry) INTO actual_list FROM (
        SELECT (CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                     ELSE pg_get_userbyid(a.grantee) END)
               || ':' || a.privilege_type || ':' || a.is_grantable::text AS entry
          FROM pg_proc AS p, aclexplode(p.proacl) AS a
         WHERE p.oid = fn) AS acl;
    IF COALESCE(actual_list, ARRAY[]::text[]) IS DISTINCT FROM expected_acl THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: function ACL is %, expected exactly %',
            COALESCE(actual_list, ARRAY[]::text[]), expected_acl;
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY rollout applied. Linked placements present: %. No backfill was performed -- deploy the application code only after the verifier reports rollout_readiness true.',
        (SELECT count(*) FROM public.padlets WHERE library_item_id IS NOT NULL);
END;
$postflight$;

COMMIT;
