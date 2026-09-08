-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE production rollout.
--
-- SOURCE:
--   supabase/migrations/20260908090000_add_knowledge_pdf_area_image_placement_mapping.sql
--
-- The table, grants and function below are a faithful copy of that reviewed
-- migration. Nothing is improved or redesigned here; this file adds the
-- preflight and postflight that make it safe to run once against production.
-- The migration itself is untouched, and so is the CLOSED durable-preview
-- rollout beside it -- this file neither reads nor rewrites anything it owns.
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
-- crop behind it: a server-owned mapping no browser role may write or read.
--
-- WHAT IT DOES NOT TOUCH: library_items rows, padlets rows, knowledge_documents,
-- knowledge_pages, source_references, storage buckets, storage objects, the
-- durable-preview column and its grants, or either existing image RPC. No PDF
-- or page content is read. No crop is copied, regenerated or deleted.
--
-- ROW WRITES: NONE. This rollout creates a table, an index and a function. It
-- inserts no mapping rows and BACKFILLS NOTHING -- historical PDF-area
-- placements keep serving their own derived object through the board route's
-- unchanged direct branch, which is exactly why no backfill is needed.

BEGIN;

-- Fail before any schema or privilege change unless production is in one of
-- exactly two RECOGNISED states.
--
--   PRE    neither owned object exists, AND every prerequisite this correction
--          builds on is present in its expected shape
--   POST   both owned objects exist, AND every hardened release condition holds
--   anything else -> ABORT
--
-- One of two present is PARTIAL: it is reported, never completed over, because
-- a half-applied authority model is not a state anybody reviewed.
DO $preflight$
DECLARE
    prerequisites CONSTANT text[] := ARRAY[
        'public.library_items',
        'public.padlets',
        'public.boards',
        'public.board_collaborators'
    ];
    prerequisite text;
    mapping_table CONSTANT text := 'public.knowledge_pdf_area_image_placements';
    helper_sig CONSTANT text := 'public.is_knowledge_pdf_area_provenance(jsonb)';
    reuse_sig CONSTANT text :=
        'public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)';
    mapping_oid oid;
    reuse_oid oid;
    owned integer := 0;
    rls_on boolean;
    policy_count integer;
    pk_ok boolean;
    fk_ok boolean;
    grants_ok boolean;
    function_ok boolean;
BEGIN
    FOREACH prerequisite IN ARRAY prerequisites LOOP
        IF to_regclass(prerequisite) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight failed: prerequisite table % is missing', prerequisite;
        END IF;
    END LOOP;

    -- The durable-preview correction is a PREREQUISITE this rollout does not
    -- own. Without the server-owned path column there is no durable object for
    -- a mapping to point at, and without the shared provenance mirror the
    -- trusted function below cannot judge what it is placing.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = 'knowledge_storage_path'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight failed: library_items.knowledge_storage_path is missing -- apply the durable-preview rollout first';
    END IF;
    IF to_regprocedure(helper_sig) IS NULL THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight failed: % is missing -- apply the durable-preview rollout first', helper_sig;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets' AND column_name = 'library_item_id'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight failed: padlets.library_item_id is missing -- apply the IMAGE-LIBRARY ownership rollout first';
    END IF;

    -- to_regclass/to_regprocedure return NULL rather than raising for absent
    -- objects, so a missing one is a decision here, never an error.
    mapping_oid := to_regclass(mapping_table);
    reuse_oid := to_regprocedure(reuse_sig);
    IF mapping_oid IS NOT NULL THEN owned := owned + 1; END IF;
    IF reuse_oid IS NOT NULL THEN owned := owned + 1; END IF;

    IF owned = 0 THEN
        RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight: PRE state (0 of 2 owned objects) -- applying';
        RETURN;
    END IF;

    IF owned = 1 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight failed: PARTIAL state (mapping table present=%, reuse function present=%). Resolve by hand.',
            mapping_oid IS NOT NULL, reuse_oid IS NOT NULL;
    END IF;

    -- Both present. POST is more than existence: a database where a browser
    -- role can read or write the mapping, or where the function has become
    -- SECURITY DEFINER or executable by a browser role, is NOT the released
    -- state and must not be silently re-created over.
    SELECT c.relrowsecurity INTO rls_on
      FROM pg_class c WHERE c.oid = mapping_oid;
    SELECT count(*) INTO policy_count
      FROM pg_policy p WHERE p.polrelid = mapping_oid;

    pk_ok := EXISTS (
        SELECT 1 FROM pg_constraint con
         WHERE con.conrelid = mapping_oid AND con.contype = 'p'
           AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                    WHERE a.attrelid = mapping_oid AND a.attname = 'padlet_id')]::int2[]
    );
    -- Both foreign keys must cascade: the grant dies with the placement, and
    -- with the durable object it points at.
    fk_ok := (
        SELECT count(*) = 2 FROM pg_constraint con
         WHERE con.conrelid = mapping_oid AND con.contype = 'f' AND con.confdeltype = 'c'
    );

    grants_ok :=
        NOT has_table_privilege('anon', mapping_table, 'SELECT')
    AND NOT has_table_privilege('anon', mapping_table, 'INSERT')
    AND NOT has_table_privilege('anon', mapping_table, 'UPDATE')
    AND NOT has_table_privilege('anon', mapping_table, 'DELETE')
    AND NOT has_table_privilege('anon', mapping_table, 'MAINTAIN')
    AND NOT has_table_privilege('authenticated', mapping_table, 'SELECT')
    AND NOT has_table_privilege('authenticated', mapping_table, 'INSERT')
    AND NOT has_table_privilege('authenticated', mapping_table, 'UPDATE')
    AND NOT has_table_privilege('authenticated', mapping_table, 'DELETE')
    AND NOT has_table_privilege('authenticated', mapping_table, 'MAINTAIN')
    AND has_table_privilege('service_role', mapping_table, 'SELECT')
    AND has_table_privilege('service_role', mapping_table, 'INSERT');

    function_ok :=
        (SELECT NOT p.prosecdef FROM pg_proc p WHERE p.oid = reuse_oid)
    AND has_function_privilege('service_role', reuse_oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', reuse_oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', reuse_oid, 'EXECUTE')
    AND NOT has_function_privilege('public', reuse_oid, 'EXECUTE');

    IF COALESCE(rls_on, false)
       AND policy_count = 0
       AND COALESCE(pk_ok, false)
       AND COALESCE(fk_ok, false)
       AND COALESCE(grants_ok, false)
       AND COALESCE(function_ok, false) THEN
        RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight: POST state already released -- re-running is a no-op';
        RETURN;
    END IF;

    RAISE EXCEPTION
        'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE preflight failed: both objects exist but the released posture does not hold (rls=%, policies=%, pk=%, cascade=%, grants=%, function=%). Resolve by hand.',
        rls_on, policy_count, pk_ok, fk_ok, grants_ok, function_ok;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- The server-owned mapping. A faithful copy of the reviewed migration.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_pdf_area_image_placements (
    padlet_id uuid PRIMARY KEY
        REFERENCES public.padlets(id) ON DELETE CASCADE,
    library_item_id uuid NOT NULL
        REFERENCES public.library_items(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.knowledge_pdf_area_image_placements IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: server-owned proof that a board '
    'placement may be served the durable private crop of a PDF-area Library '
    'Image. Written only by create_knowledge_pdf_area_image_reuse_placement. '
    'No browser role has any privilege on it; padlets.library_item_id is a '
    'consistency hint beside it, never an authorisation.';

COMMENT ON COLUMN public.knowledge_pdf_area_image_placements.padlet_id IS
    'The placement this authorisation belongs to. Primary key: one placement, '
    'one durable object. Cascades on padlet delete so the grant dies with it.';

COMMENT ON COLUMN public.knowledge_pdf_area_image_placements.library_item_id IS
    'The durable library_items row whose knowledge_storage_path may be served '
    'for this placement.';

CREATE INDEX IF NOT EXISTS knowledge_pdf_area_image_placements_library_item_id_idx
    ON public.knowledge_pdf_area_image_placements (library_item_id);

-- Fail closed twice over: RLS with ZERO policies, and no privileges at all.
ALTER TABLE public.knowledge_pdf_area_image_placements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM PUBLIC;
REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM anon;
REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM authenticated;

GRANT ALL ON TABLE public.knowledge_pdf_area_image_placements TO service_role;

CREATE OR REPLACE FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
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
RETURNS TABLE (padlet_id uuid, library_item_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
    -- broadened -- viewer and commenter are absent by construction.
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

    -- 5. AND THEY MUST BE THE SAME SOURCE.
    IF (p_metadata -> 'source') IS DISTINCT FROM (v_library_metadata -> 'source') THEN
        RAISE EXCEPTION 'Placement provenance does not match the library image'
            USING ERRCODE = '22023';
    END IF;

    -- 6. The placement and its authorisation, in this one transaction. No
    -- library_items row is created, and no Storage object is touched.
    INSERT INTO public.padlets (
        id, board_id, title, content, type, position_x, position_y,
        width, height, file_url, metadata, library_item_id
    ) VALUES (
        p_padlet_id, p_board_id, p_title, p_content, 'image', p_position_x, p_position_y,
        p_width, p_height, p_board_file_url, p_metadata, p_library_item_id
    );

    INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id)
    VALUES (p_padlet_id, p_library_item_id);

    RETURN QUERY SELECT p_padlet_id, p_library_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
    uuid, uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
    uuid, uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement(
    uuid, uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE: places an existing durable PDF-area '
    'Library Image on a board, writing the placement and its server-owned '
    'mapping in ONE transaction. Re-proves library ownership and board edit '
    'authority. Creates no library row, copies no storage object, accepts no '
    'path. service_role only.';

-- ---------------------------------------------------------------------------
-- Postflight: the released posture, re-proved inside the same transaction.
-- ---------------------------------------------------------------------------
--
-- Anything short of it aborts the whole batch, so production never keeps a
-- half-hardened authority model.
DO $postflight$
DECLARE
    mapping_table CONSTANT text := 'public.knowledge_pdf_area_image_placements';
    reuse_sig CONSTANT text :=
        'public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)';
    mapping_oid oid;
    reuse_oid oid;
    policy_count integer;
    fk_count integer;
    row_count bigint;
BEGIN
    mapping_oid := to_regclass(mapping_table);
    IF mapping_oid IS NULL THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: mapping table missing';
    END IF;
    reuse_oid := to_regprocedure(reuse_sig);
    IF reuse_oid IS NULL THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: reuse function missing';
    END IF;

    -- Structure.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'knowledge_pdf_area_image_placements'
           AND column_name = 'padlet_id' AND data_type = 'uuid' AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'knowledge_pdf_area_image_placements'
           AND column_name = 'library_item_id' AND data_type = 'uuid' AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: mapping columns are not the reviewed shape';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
         WHERE con.conrelid = mapping_oid AND con.contype = 'p'
           AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                    WHERE a.attrelid = mapping_oid AND a.attname = 'padlet_id')]::int2[]
    ) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: padlet_id is not the primary key';
    END IF;

    SELECT count(*) INTO fk_count FROM pg_constraint con
     WHERE con.conrelid = mapping_oid AND con.contype = 'f' AND con.confdeltype = 'c';
    IF fk_count <> 2 THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: expected 2 cascading foreign keys, found %', fk_count;
    END IF;

    -- Authority.
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = mapping_oid) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: RLS is not enabled on the mapping';
    END IF;
    SELECT count(*) INTO policy_count FROM pg_policy p WHERE p.polrelid = mapping_oid;
    IF policy_count <> 0 THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: the mapping must have ZERO policies, found %', policy_count;
    END IF;

    IF has_table_privilege('anon', mapping_table, 'SELECT')
       OR has_table_privilege('anon', mapping_table, 'INSERT')
       OR has_table_privilege('anon', mapping_table, 'UPDATE')
       OR has_table_privilege('anon', mapping_table, 'DELETE')
       OR has_table_privilege('anon', mapping_table, 'TRUNCATE')
       OR has_table_privilege('anon', mapping_table, 'REFERENCES')
       OR has_table_privilege('anon', mapping_table, 'TRIGGER')
       OR has_table_privilege('anon', mapping_table, 'MAINTAIN') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: anon retains privileges on the mapping';
    END IF;
    IF has_table_privilege('authenticated', mapping_table, 'SELECT')
       OR has_table_privilege('authenticated', mapping_table, 'INSERT')
       OR has_table_privilege('authenticated', mapping_table, 'UPDATE')
       OR has_table_privilege('authenticated', mapping_table, 'DELETE')
       OR has_table_privilege('authenticated', mapping_table, 'TRUNCATE')
       OR has_table_privilege('authenticated', mapping_table, 'REFERENCES')
       OR has_table_privilege('authenticated', mapping_table, 'TRIGGER')
       OR has_table_privilege('authenticated', mapping_table, 'MAINTAIN') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: authenticated retains privileges on the mapping';
    END IF;
    IF NOT has_table_privilege('service_role', mapping_table, 'INSERT')
       OR NOT has_table_privilege('service_role', mapping_table, 'SELECT') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: service_role cannot maintain the mapping';
    END IF;

    IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = reuse_oid) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: the reuse function is SECURITY DEFINER';
    END IF;
    IF NOT has_function_privilege('service_role', reuse_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', reuse_oid, 'EXECUTE')
       OR has_function_privilege('anon', reuse_oid, 'EXECUTE')
       OR has_function_privilege('public', reuse_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: the reuse function is not service_role-only';
    END IF;

    -- The durable-preview column this correction depends on is untouched.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = 'knowledge_storage_path' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: the durable-preview column changed';
    END IF;
    IF has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'UPDATE')
       OR has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'UPDATE') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight failed: the durable-preview column became browser-writable';
    END IF;

    -- NO BACKFILL. Every mapping row is written by the trusted path, one drop
    -- at a time; this rollout must never have invented one.
    SELECT count(*) INTO row_count FROM public.knowledge_pdf_area_image_placements;
    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE postflight: released. mapping rows = % (this rollout wrote none)', row_count;
END;
$postflight$;

COMMIT;
