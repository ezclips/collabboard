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
-- RELEASE ORDER -- DB FIRST, APPLICATION SECOND. Do not reverse it:
--   1. Confirm the reviewed application code is still UNDEPLOYED.
--   2. Apply this rollout.
--   3. Run 20260905_image_library_ownership_verify.sql.
--   4. Require every section's `pass` to be true and rollout_readiness true.
--   5. Only then deploy the reviewed application code (PDF-area Image
--      ownership, ordinary NEW Image ownership, Freeform Library reuse, and
--      the non-Freeform layout reuse links).
--   6. After deployment, run the manual runtime smoke proof.
-- The application calls create_image_post_with_library_item and writes
-- padlets.library_item_id; deploying it first would call a function and a
-- column production does not yet have.
--
-- Backward compatible with the CURRENTLY deployed application: the column is
-- nullable with no default, so existing INSERTs that never name it keep
-- working, existing readers never see it, and a function nothing calls yet is
-- inert.

BEGIN;

-- Fail before any schema or privilege mutation unless production is in a state
-- this rollout recognises.
--
--   PRE-IMAGE-LIBRARY   column, FK, index and function absent  -> apply
--   POST-IMAGE-LIBRARY  all present in the EXACT reviewed form -> re-apply
--   anything else                                              -> ABORT
--
-- Re-application is deliberately safe: every statement below is idempotent.
-- What is NOT safe is converging a state this rollout did not author, so drift
-- aborts and the operator decides. A column present WITHOUT its foreign key can
-- never come from this file -- the two land in one transaction -- so that state
-- is foreign drift, not a partial run.
DO $preflight$
DECLARE
    prerequisites constant text[] := ARRAY[
        'public.padlets',
        'public.library_items',
        'public.boards',
        'public.board_collaborators'
    ];
    prerequisite text;
    expected_signature constant text :=
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)';
    missing text;
    link_type text;
    link_nullable text;
    fk_rule text;
    fk_target text;
    index_definition text;
    overloads integer;
BEGIN
    -- The live tables this feature hangs off. Every one is a foreign key
    -- target, an authorization join target, or an insert target.
    FOREACH prerequisite IN ARRAY prerequisites LOOP
        IF to_regclass(prerequisite) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: % is missing', prerequisite;
        END IF;
    END LOOP;

    -- The hardened body binds the logical actor to the JWT subject.
    IF to_regprocedure('auth.uid()') IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: auth.uid() is missing';
    END IF;

    -- Key types must match or the foreign key cannot be created.
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets'
           AND column_name = 'id') IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: public.padlets.id is not uuid';
    END IF;
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = 'id') IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: public.library_items.id is not uuid';
    END IF;

    -- Every column the function names: a missing one would otherwise surface as
    -- a runtime failure on the first real save.
    SELECT string_agg(required, ', ' ORDER BY required) INTO missing
      FROM unnest(ARRAY[
            'id', 'board_id', 'title', 'content', 'type', 'position_x',
            'position_y', 'width', 'height', 'file_url', 'metadata'
           ]) AS required
     WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets'
           AND column_name = required);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: public.padlets is missing %', missing;
    END IF;

    SELECT string_agg(required, ', ' ORDER BY required) INTO missing
      FROM unnest(ARRAY[
            'id', 'user_id', 'title', 'type', 'content', 'thumbnail_url', 'is_public'
           ]) AS required
     WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = required);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: public.library_items is missing %', missing;
    END IF;

    -- The board-authority branch the hardened body reproduces.
    SELECT string_agg(required, ', ' ORDER BY required) INTO missing
      FROM unnest(ARRAY['board_id', 'user_id', 'role']) AS required
     WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'board_collaborators'
           AND column_name = required);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: public.board_collaborators is missing %', missing;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'boards'
           AND column_name = 'user_id') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: public.boards.user_id is missing';
    END IF;

    -- An already-present link column must be EXACTLY the reviewed one. A
    -- different type or a NOT NULL would break every existing INSERT that
    -- omits it, which is the backward-compatibility promise of this gate.
    SELECT data_type, is_nullable INTO link_type, link_nullable
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

        -- ADD COLUMN IF NOT EXISTS carries its REFERENCES clause only when it
        -- actually adds the column, so an existing column with no foreign key
        -- would silently stay unlinked. Both land together here or not at all.
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

        IF fk_rule IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY rollout preflight failed: padlets.library_item_id exists with no foreign key';
        END IF;
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

    -- Cardinality is load-bearing: a unique constraint or index would silently
    -- outlaw reuse, so it aborts whether or not this rollout ran.
    IF EXISTS (
        SELECT 1 FROM pg_index AS i
          JOIN pg_class AS c ON c.oid = i.indexrelid
         WHERE i.indrelid = to_regclass('public.padlets')
           AND i.indisunique
           AND EXISTS (
                SELECT 1 FROM unnest(i.indkey) AS k(attnum)
                 WHERE k.attnum = (
                    SELECT a.attnum FROM pg_attribute AS a
                     WHERE a.attrelid = to_regclass('public.padlets')
                       AND a.attname = 'library_item_id'))
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: a UNIQUE index covers padlets.library_item_id, which would outlaw reuse';
    END IF;

    -- CREATE INDEX IF NOT EXISTS matches on NAME alone, so an index holding
    -- this name with a different shape would be silently kept.
    SELECT indexdef INTO index_definition
      FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'padlets_library_item_id_idx';
    IF index_definition IS NOT NULL
       AND index_definition NOT LIKE '%(library_item_id)%WHERE (library_item_id IS NOT NULL)' THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: padlets_library_item_id_idx has an unexpected definition: %',
            index_definition;
    END IF;

    -- Replacement is BY SIGNATURE: a same-named function with other argument
    -- types would stand beside the reviewed one as a reachable overload.
    SELECT count(*) INTO overloads
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_image_post_with_library_item'
       AND p.oid <> COALESCE(to_regprocedure(expected_signature), 0);
    IF overloads > 0 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: % unexpected overload(s) of create_image_post_with_library_item',
            overloads;
    END IF;

    -- Replacing a SECURITY DEFINER copy would tighten rather than widen, but it
    -- is still a body nobody here authored: fail closed.
    IF to_regprocedure(expected_signature) IS NOT NULL
       AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(expected_signature)) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY rollout preflight failed: existing create_image_post_with_library_item is SECURITY DEFINER';
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
-- one. Every check below reads the catalog it just wrote.
DO $postflight$
DECLARE
    expected_signature constant text :=
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
        ' double precision, double precision, double precision, double precision,'
        ' text, jsonb)';
    body text;
    authority_at integer;
    retry_at integer;
BEGIN
    -- Column: present, uuid, and still nullable for the deployed application.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets'
           AND column_name = 'library_item_id'
           AND data_type = 'uuid' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: padlets.library_item_id is not a nullable uuid';
    END IF;

    -- A Library deletion must NULL the link, never delete the placement.
    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.key_column_usage AS k
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = k.constraint_name
           AND rc.constraint_schema = k.constraint_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = k.constraint_name
           AND ccu.constraint_schema = k.constraint_schema
         WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
           AND k.column_name = 'library_item_id'
           AND ccu.table_schema = 'public' AND ccu.table_name = 'library_items'
           AND ccu.column_name = 'id'
           AND rc.delete_rule = 'SET NULL') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: the library_items foreign key is missing or is not ON DELETE SET NULL';
    END IF;

    -- Reuse must stay possible: one durable object, many placements.
    IF EXISTS (
        SELECT 1 FROM pg_index AS i
         WHERE i.indrelid = to_regclass('public.padlets')
           AND i.indisunique
           AND EXISTS (
                SELECT 1 FROM unnest(i.indkey) AS k(attnum)
                 WHERE k.attnum = (
                    SELECT a.attnum FROM pg_attribute AS a
                     WHERE a.attrelid = to_regclass('public.padlets')
                       AND a.attname = 'library_item_id'))
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: a UNIQUE index covers padlets.library_item_id';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'padlets'
           AND indexname = 'padlets_library_item_id_idx') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: padlets_library_item_id_idx is missing';
    END IF;

    -- Function: present, and SECURITY INVOKER so it reaches but never elevates.
    IF to_regprocedure(expected_signature) IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: create_image_post_with_library_item is missing';
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(expected_signature)) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: create_image_post_with_library_item is SECURITY DEFINER';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
         WHERE oid = to_regprocedure(expected_signature)
           AND proconfig @> ARRAY['search_path=public']) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: create_image_post_with_library_item has no pinned search_path';
    END IF;

    -- The committed body must be the HARDENED one, not section B's.
    body := pg_get_functiondef(to_regprocedure(expected_signature));
    IF position('auth.uid() <> p_user_id' IN body) = 0 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: the committed body does not bind the logical actor';
    END IF;

    authority_at := position('public.board_collaborators' IN body);
    retry_at := position('LEFT JOIN public.library_items' IN body);
    IF authority_at = 0 OR retry_at = 0 OR authority_at > retry_at THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: board authorization does not precede the retry lookup';
    END IF;

    -- Signed-in callers only.
    IF has_function_privilege('public', expected_signature, 'EXECUTE')
       OR has_function_privilege('anon', expected_signature, 'EXECUTE') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: PUBLIC or anon can execute the function';
    END IF;
    IF NOT has_function_privilege('authenticated', expected_signature, 'EXECUTE')
       OR NOT has_function_privilege('service_role', expected_signature, 'EXECUTE') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY postflight failed: authenticated or service_role cannot execute the function';
    END IF;

    -- Nothing was backfilled here. A first application leaves this at zero.
    RAISE NOTICE 'IMAGE-LIBRARY rollout applied. Linked placements present: %. No backfill was performed -- deploy the application code only after the verifier is green.',
        (SELECT count(*) FROM public.padlets WHERE library_item_id IS NOT NULL);
END;
$postflight$;

COMMIT;
