-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE production rollout.
--
-- SOURCE:
--   supabase/migrations/20260908090000_add_knowledge_pdf_area_image_placement_mapping.sql
--
-- The table, grants and function below are a faithful copy of that reviewed
-- migration. Nothing is improved or redesigned here; this file adds the exact
-- state machine that makes it safe to run against production. The migration
-- itself is untouched, and so is the CLOSED durable-preview rollout beside it --
-- this file neither reads nor rewrites anything it owns.
--
-- Run this file as one PostgreSQL statement batch. It is intentionally not a
-- Supabase CLI migration: `[db.migrations] enabled = false` in config.toml and
-- supabase/BASELINE.md records that supabase/migrations/ does not rebuild the
-- live database.
--
-- WHAT IT FIXES. A durable PDF-area Library Image could not be REUSED. The
-- reuse drag copied the Library snapshot verbatim, so the new placement
-- inherited `metadata.imageUrl` addressing the origin card -- a URL that 404s
-- once that card is deleted. The correction gives the new placement its own
-- board address and adds the only thing that can authorise serving the private
-- crop behind it: a server-owned mapping recording the padlet, the durable
-- Library object AND the board whose edit authority was proven at creation.
--
-- WHAT IT DOES NOT TOUCH: library_items rows, padlets rows, knowledge_documents,
-- knowledge_pages, source_references, storage buckets, storage objects, the
-- durable-preview column and its grants, or either existing image RPC. No PDF
-- or page content is read. No crop is copied, regenerated or deleted.
--
-- ROW WRITES: NONE. This rollout creates a table, two indexes and a function.
-- It inserts no mapping rows and BACKFILLS NOTHING -- historical PDF-area
-- placements keep serving their own derived object through the board route's
-- unchanged direct branch, which is exactly why no backfill is needed.
--
-- THE STATE MACHINE IS EXACT, AND MUTATION IS GATED BEHIND IT.
--
--   EXACT POST   every condition of the installed contract already holds
--                -> NOTHING runs. Not a CREATE, not a GRANT, not a REVOKE,
--                   not an ALTER. The DDL lives inside EXECUTE strings that
--                   are only reached on the PRE branch, so a released database
--                   cannot be silently "repaired" into a shape nobody reviewed.
--   EXACT PRE    neither owned object exists and every prerequisite is present
--                -> apply, then re-prove the SAME complete fingerprint.
--   ANYTHING ELSE -> ABORT before any mutation.
--
-- The fingerprint is written ONCE, as SQL text evaluated by EXECUTE, so the
-- POST test and the postflight cannot disagree with each other -- they are
-- literally the same query. It reads catalogs only and takes OIDs rather than
-- names for every privilege test, so an absent object yields NULL -> false
-- instead of raising.

BEGIN;

DO $rollout$
DECLARE
    reuse_sig CONSTANT text :=
        'public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)';
    -- THE COMPLETE INSTALLED CONTRACT, as one boolean. Identical to the
    -- verifier's release gate.
    fingerprint CONSTANT text := $fp$
SELECT COALESCE(
       t.oid IS NOT NULL
   AND f.oid IS NOT NULL
   AND (SELECT count(*) = 4 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements')
   AND (SELECT array_agg(column_name::text || ':' || data_type || ':' || is_nullable
                         ORDER BY column_name::text)
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements')
       = ARRAY['board_id:uuid:NO','created_at:timestamp with time zone:NO',
               'library_item_id:uuid:NO','padlet_id:uuid:NO']
   AND (SELECT column_default = 'now()' FROM information_schema.columns
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
           AND column_name='created_at')
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype = 'p'
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='padlet_id')]::int2[])
   AND (SELECT count(*) = 3 FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype = 'f')
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                  AND c.confrelid = to_regclass('public.padlets')
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='padlet_id')]::int2[]
                  AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                          WHERE a.attrelid = to_regclass('public.padlets') AND a.attname='id')]::int2[])
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                  AND c.confrelid = to_regclass('public.library_items')
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='library_item_id')]::int2[]
                  AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                          WHERE a.attrelid = to_regclass('public.library_items') AND a.attname='id')]::int2[])
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                  AND c.confrelid = to_regclass('public.boards')
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='board_id')]::int2[]
                  AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                          WHERE a.attrelid = to_regclass('public.boards') AND a.attname='id')]::int2[])
   AND (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = t.oid)
   AND (SELECT count(*) = 0 FROM pg_policy p WHERE p.polrelid = t.oid)
   AND NOT has_table_privilege('anon', t.oid, 'SELECT')
   AND NOT has_table_privilege('anon', t.oid, 'INSERT')
   AND NOT has_table_privilege('anon', t.oid, 'UPDATE')
   AND NOT has_table_privilege('anon', t.oid, 'DELETE')
   AND NOT has_table_privilege('anon', t.oid, 'TRUNCATE')
   AND NOT has_table_privilege('anon', t.oid, 'REFERENCES')
   AND NOT has_table_privilege('anon', t.oid, 'TRIGGER')
   AND NOT has_table_privilege('anon', t.oid, 'MAINTAIN')
   AND NOT has_table_privilege('authenticated', t.oid, 'SELECT')
   AND NOT has_table_privilege('authenticated', t.oid, 'INSERT')
   AND NOT has_table_privilege('authenticated', t.oid, 'UPDATE')
   AND NOT has_table_privilege('authenticated', t.oid, 'DELETE')
   AND NOT has_table_privilege('authenticated', t.oid, 'TRUNCATE')
   AND NOT has_table_privilege('authenticated', t.oid, 'REFERENCES')
   AND NOT has_table_privilege('authenticated', t.oid, 'TRIGGER')
   AND NOT has_table_privilege('authenticated', t.oid, 'MAINTAIN')
   AND (SELECT COALESCE(count(*) = 0, true) FROM information_schema.table_privileges
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
           AND grantee IN ('PUBLIC','anon','authenticated'))
   AND has_table_privilege('service_role', t.oid, 'SELECT')
   AND has_table_privilege('service_role', t.oid, 'INSERT')
   AND has_table_privilege('service_role', t.oid, 'DELETE')
   AND (SELECT NOT p.prosecdef
                AND l.lanname = 'plpgsql'
                AND COALESCE(p.proconfig, ARRAY[]::text[]) = ARRAY['search_path=public']::text[]
                AND pg_get_function_identity_arguments(p.oid)
                    = 'p_padlet_id uuid, p_board_id uuid, p_user_id uuid, p_library_item_id uuid, p_title text, p_content text, p_position_x double precision, p_position_y double precision, p_width double precision, p_height double precision, p_board_file_url text, p_metadata jsonb'
                AND pg_get_function_result(p.oid)
                    = 'TABLE(padlet_id uuid, library_item_id uuid, board_id uuid)'
                AND md5(p.prosrc) = 'c67271ebcc867aaf7f1d272746c62094'
                AND p.prosrc LIKE '%board_collaborators%'
                AND p.prosrc LIKE '%is_knowledge_pdf_area_provenance%'
                AND p.prosrc LIKE '%INSERT INTO public.padlets%'
                AND p.prosrc LIKE '%INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id, board_id)%'
                AND p.prosrc LIKE '%VALUES (p_padlet_id, p_library_item_id, p_board_id)%'
                AND p.prosrc NOT LIKE '%INSERT INTO public.library_items%'
                AND p.prosrc NOT LIKE '%p_storage_path%'
                AND p.prosrc NOT LIKE '%storage.%'
                AND p.prosrc NOT LIKE '%board-derived/%'
          FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = f.oid)
   AND has_function_privilege('service_role', f.oid, 'EXECUTE')
   AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
   AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
   AND NOT has_function_privilege('public', f.oid, 'EXECUTE')
   AND (SELECT data_type = 'text' FROM information_schema.columns
         WHERE table_schema='public' AND table_name='library_items'
           AND column_name='knowledge_storage_path')
   AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','INSERT')
   AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')
   AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','INSERT')
   AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','UPDATE')
   AND to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)') IS NOT NULL
   , false)
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t,
       (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f
$fp$;
    prerequisites CONSTANT text[] := ARRAY[
        'public.library_items',
        'public.padlets',
        'public.boards',
        'public.board_collaborators'
    ];
    prerequisite text;
    table_oid oid;
    fn_oid oid;
    owned integer := 0;
    is_post boolean;
BEGIN
    -- PREREQUISITES. Objects this correction builds on and does not own. A
    -- missing one is not drift in this feature -- it is the wrong database.
    FOREACH prerequisite IN ARRAY prerequisites LOOP
        IF to_regclass(prerequisite) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: prerequisite table % is missing', prerequisite;
        END IF;
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='library_items'
           AND column_name='knowledge_storage_path' AND data_type='text'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: library_items.knowledge_storage_path is missing -- apply the durable-preview rollout first';
    END IF;
    IF to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)') IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: the shared provenance mirror is missing -- apply the durable-preview rollout first';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='padlets' AND column_name='library_item_id'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: padlets.library_item_id is missing -- apply the IMAGE-LIBRARY ownership rollout first';
    END IF;

    -- EXACT POST? Then this batch performs no mutation whatsoever.
    EXECUTE fingerprint INTO is_post;
    IF COALESCE(is_post, false) THEN
        RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: EXACT POST already released -- no mutation performed';
        RETURN;
    END IF;

    -- Not POST. Then it must be EXACT PRE: neither owned object may exist, in
    -- any partial or drifted form.
    table_oid := to_regclass('public.knowledge_pdf_area_image_placements');
    fn_oid := to_regprocedure(reuse_sig);
    IF table_oid IS NOT NULL THEN owned := owned + 1; END IF;
    IF fn_oid IS NOT NULL THEN owned := owned + 1; END IF;

    IF owned <> 0 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: refusing to mutate -- the feature objects exist but the released contract does not hold (mapping table present=%, reuse function present=%). Resolve by hand.',
            table_oid IS NOT NULL, fn_oid IS NOT NULL;
    END IF;

    -- Also refuse a database carrying an object of ours under a shape we do not
    -- own: an index or constraint left behind by a partial attempt.
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname LIKE 'knowledge_pdf_area_image_placements%') THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: refusing to mutate -- residual objects named after the mapping already exist';
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: EXACT PRE -- applying';

    -- ---------------------------------------------------------------------
    -- The feature. Reached ONLY from the PRE branch above.
    -- ---------------------------------------------------------------------
    EXECUTE $ddl$
        CREATE TABLE public.knowledge_pdf_area_image_placements (
            padlet_id uuid PRIMARY KEY
                REFERENCES public.padlets(id) ON DELETE CASCADE,
            library_item_id uuid NOT NULL
                REFERENCES public.library_items(id) ON DELETE CASCADE,
            board_id uuid NOT NULL
                REFERENCES public.boards(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    $ddl$;

    EXECUTE $ddl$
        COMMENT ON TABLE public.knowledge_pdf_area_image_placements IS
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: server-owned proof that a board '
            'placement may be served the durable private crop of a PDF-area Library '
            'Image, and the board on which that was authorised. Written only by '
            'create_knowledge_pdf_area_image_reuse_placement. No browser role has any '
            'privilege on it; padlets.library_item_id is a consistency hint beside it, '
            'never an authorisation.'
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX knowledge_pdf_area_image_placements_library_item_id_idx
            ON public.knowledge_pdf_area_image_placements (library_item_id)
    $ddl$;

    EXECUTE $ddl$
        CREATE INDEX knowledge_pdf_area_image_placements_board_id_idx
            ON public.knowledge_pdf_area_image_placements (board_id)
    $ddl$;

    EXECUTE $ddl$ ALTER TABLE public.knowledge_pdf_area_image_placements ENABLE ROW LEVEL SECURITY $ddl$;
    EXECUTE $ddl$ REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM PUBLIC $ddl$;
    EXECUTE $ddl$ REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM anon $ddl$;
    EXECUTE $ddl$ REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM authenticated $ddl$;
    EXECUTE $ddl$ GRANT ALL ON TABLE public.knowledge_pdf_area_image_placements TO service_role $ddl$;

    EXECUTE $ddl$
        CREATE FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
            p_padlet_id uuid,
            p_board_id uuid,
            p_user_id uuid,
            p_library_item_id uuid,
            p_title text,
            p_content text,
            p_position_x double precision,
            p_position_y double precision,
            p_width double precision,
            p_height double precision,
            p_board_file_url text,
            p_metadata jsonb
        )
        RETURNS TABLE (padlet_id uuid, library_item_id uuid, board_id uuid)
        LANGUAGE plpgsql
        SECURITY INVOKER
        SET search_path = public
        AS $fn$
DECLARE
    v_owner uuid;
    v_type text;
    v_path text;
    v_library_metadata jsonb;
BEGIN
    -- 1. THE LOGICAL ACTOR. Called through service_role there is no auth.uid(),
    -- and p_user_id is the id the route already authenticated. Called directly
    -- by anyone else, the JWT decides and may not nominate a different user.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized to place this library image'
            USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to place this library image'
            USING ERRCODE = '42501';
    END IF;

    -- 2. BOARD-WRITE AUTHORITY FOR THAT ACTOR -- load-bearing, not decorative.
    -- The `board_id` branch of the padlets INSERT policy, reproduced exactly:
    -- owner of the board, or a collaborator whose role is 'editor'. Nothing is
    -- broadened -- viewer and commenter are absent by construction. This is the
    -- board the mapping will record, so the entitlement can never name a board
    -- whose authority was not proved right here.
    IF NOT EXISTS (
        SELECT 1 FROM public.boards b
         WHERE b.id = p_board_id AND b.user_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.board_collaborators c
         WHERE c.board_id = p_board_id AND c.user_id = p_user_id AND c.role = 'editor'
    ) THEN
        RAISE EXCEPTION 'Not authorized to place this library image'
            USING ERRCODE = '42501';
    END IF;

    -- 3. THE LIBRARY OBJECT MUST BE THIS ACTOR'S OWN, and must genuinely be a
    -- durable PDF-area Image. Ownership is re-proved from the row itself rather
    -- than inherited from the route's RLS-bound read.
    SELECT l.user_id, l.type, l.knowledge_storage_path, l.content -> 'metadata'
      INTO v_owner, v_type, v_path, v_library_metadata
      FROM public.library_items l
     WHERE l.id = p_library_item_id;

    IF v_owner IS NULL OR v_owner <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to place this library image'
            USING ERRCODE = '42501';
    END IF;
    IF v_type IS DISTINCT FROM 'image' THEN
        RAISE EXCEPTION 'Library item is not a placeable PDF-area image'
            USING ERRCODE = '22023';
    END IF;
    -- A durable address must already have been PROVEN. No path is derived, and
    -- none is accepted: without this column there is nothing to serve later.
    IF v_path IS NULL OR length(v_path) = 0 THEN
        RAISE EXCEPTION 'Library item is not a placeable PDF-area image'
            USING ERRCODE = '22023';
    END IF;

    -- 4. BOTH SIDES MUST BE VALID PROVENANCE, judged by the SAME mirror the
    -- creation path, the repair and the verifier use, so none can drift.
    IF NOT public.is_knowledge_pdf_area_provenance(v_library_metadata) THEN
        RAISE EXCEPTION 'Library item is not a placeable PDF-area image'
            USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_knowledge_pdf_area_provenance(p_metadata) THEN
        RAISE EXCEPTION 'Placement metadata is not valid knowledge-pdf-area provenance'
            USING ERRCODE = '22023';
    END IF;

    -- 5. AND THEY MUST BE THE SAME SOURCE. The placement is a rebinding of the
    -- Library object's own provenance, so anything else is a caller inventing a
    -- claim about what these bytes are a crop of. jsonb equality compares
    -- numbers numerically, so 1 and 1.0 are the same page here as they are in
    -- the TypeScript reader.
    IF (p_metadata -> 'source') IS DISTINCT FROM (v_library_metadata -> 'source') THEN
        RAISE EXCEPTION 'Placement provenance does not match the library image'
            USING ERRCODE = '22023';
    END IF;

    -- 6. The placement and its authorisation, in this one transaction. A
    -- failure on either side leaves neither: a placement with no mapping would
    -- render nothing, and a mapping with no placement would be a grant with no
    -- subject. No library_items row is created, and no Storage object is
    -- touched -- there is not a single storage call in this function.
    INSERT INTO public.padlets (
        id, board_id, title, content, type, position_x, position_y,
        width, height, file_url, metadata, library_item_id
    ) VALUES (
        p_padlet_id, p_board_id, p_title, p_content, 'image', p_position_x, p_position_y,
        p_width, p_height, p_board_file_url, p_metadata, p_library_item_id
    );

    INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id, board_id)
    VALUES (p_padlet_id, p_library_item_id, p_board_id);

    RETURN QUERY SELECT p_padlet_id, p_library_item_id, p_board_id;
END;
$fn$
    $ddl$;

    EXECUTE $ddl$
        REVOKE ALL ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
            uuid, uuid, uuid, uuid, text, text, double precision, double precision,
            double precision, double precision, text, jsonb
        ) FROM PUBLIC, anon, authenticated
    $ddl$;

    EXECUTE $ddl$
        GRANT EXECUTE ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
            uuid, uuid, uuid, uuid, text, text, double precision, double precision,
            double precision, double precision, text, jsonb
        ) TO service_role
    $ddl$;

    EXECUTE $ddl$
        COMMENT ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
            uuid, uuid, uuid, uuid, text, text, double precision, double precision,
            double precision, double precision, text, jsonb
        ) IS
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: places an existing durable PDF-area '
            'Library Image on a board, writing the placement and its server-owned '
            'mapping -- including the authorised board -- in ONE transaction. Re-proves '
            'library ownership and board edit authority. Creates no library row, copies '
            'no storage object, accepts no path. service_role only.'
    $ddl$;

    -- ---------------------------------------------------------------------
    -- POSTFLIGHT: the SAME complete fingerprint, re-evaluated. Not a
    -- diagnostic print -- anything short of the full contract aborts the whole
    -- batch, so production never keeps a half-hardened authority model.
    -- ---------------------------------------------------------------------
    EXECUTE fingerprint INTO is_post;
    IF NOT COALESCE(is_post, false) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: the installed objects do not match the reviewed contract';
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: released and re-proved (this rollout wrote no mapping rows)';
END;
$rollout$;

COMMIT;
