-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW production rollout.
--
-- SOURCE:
--   supabase/migrations/20260907120000_library_durable_image_preview.sql
--
-- The schema, grants and function below are a faithful copy of that reviewed
-- migration. Nothing is improved or redesigned here; this file adds the
-- preflight, the verified legacy repair and the postflight that make it safe to
-- run once against production. The migration itself is untouched.
--
-- Run this file as one PostgreSQL statement batch. It is intentionally not a
-- Supabase CLI migration: `[db.migrations] enabled = false` in config.toml and
-- supabase/BASELINE.md records that supabase/migrations/ does not rebuild the
-- live database.
--
-- WHAT IT FIXES. A PDF-area Image is a durable Library object from birth, but
-- its only address was `/api/boards/{boardId}/padlets/{padletId}/image`, which
-- proves its authority from that padlet. Delete the card and the Library row
-- survives with every preview field pointing at a URL that now 404s, while the
-- bytes sit untouched in the private bucket. This gives the same object a
-- second, owner-scoped address and records where it lives.
--
-- WHAT IT DOES NOT TOUCH: padlets rows, knowledge_documents, knowledge_pages,
-- source_references, storage buckets, storage objects, or the board-scoped
-- image route's authority. No PDF or page content is read. No crop is copied,
-- regenerated or deleted.
--
-- ROW WRITES. Exactly one class: `library_items` rows that are PDF-area images
-- whose origin placement can be PROVEN by structural join. Rows whose origin is
-- already gone are left with knowledge_storage_path NULL -- deliberately, since
-- nothing surviving proves the owner was ever entitled to that object. They are
-- never given a guessed path.

BEGIN;

-- Fail before any schema, privilege or row mutation unless production is in one
-- of exactly two RECOGNISED states.
--
--   PRE    none of this correction's owned objects exist, AND the database is
--          the exact legacy shape this rollout was reviewed against
--   POST   all owned objects exist, AND every hardened release condition holds
--   anything else -> ABORT
--
-- Zero owned objects is NOT by itself PRE. A database whose grants or policies
-- have already drifted is not the one this file was designed to harden, and
-- normalising it silently would be this rollout inventing an authority model
-- nobody reviewed. The legacy fingerprint below is the baseline's own:
-- GRANT ALL to anon and authenticated, four owner-scoped policies, and the
-- generic image RPC as SECURITY INVOKER granted to authenticated+service_role.
--
-- POST is likewise more than "the objects exist". A database where all three
-- are present but a browser role can write the trusted path, execute the
-- helper, or either function has become SECURITY DEFINER is PARTIAL -- and is
-- reported, never re-created over.
--
-- POST does NOT require any origin placement to still exist: durable rows
-- outliving their placements is the entire point of the feature.
DO $preflight$
DECLARE
    prerequisites CONSTANT text[] := ARRAY[
        'public.library_items',
        'public.padlets',
        'public.boards'
    ];
    prerequisite text;
    helper_sig CONSTANT text := 'public.is_knowledge_pdf_area_provenance(jsonb)';
    trusted_sig CONSTANT text :=
        'public.create_knowledge_pdf_area_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)';
    generic_sig CONSTANT text :=
        'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)';
    full_privileges CONSTANT text[] :=
        ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
    helper_oid oid;
    trusted_oid oid;
    generic_oid oid;
    owned integer := 0;
    has_column boolean;
    has_helper boolean;
    has_trusted boolean;
    policies_exact boolean;
    generic_ok boolean;
    legacy_grants boolean;
    grants_hardened boolean;
    functions_hardened boolean;
    rls_on boolean;
    anon_privileges text[];
    auth_privileges text[];
    insert_columns text[];
    update_columns text[];
BEGIN
    FOREACH prerequisite IN ARRAY prerequisites LOOP
        IF to_regclass(prerequisite) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: prerequisite table % is missing', prerequisite;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets' AND column_name = 'library_item_id'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: padlets.library_item_id is missing -- apply the IMAGE-LIBRARY ownership rollout first';
    END IF;

    -- to_regprocedure returns NULL rather than raising for an absent function,
    -- so a missing prerequisite is a decision here, never an error.
    helper_oid  := to_regprocedure(helper_sig);
    trusted_oid := to_regprocedure(trusted_sig);
    generic_oid := to_regprocedure(generic_sig);

    -- The generic image RPC is a PREREQUISITE this rollout does not own: it must
    -- be present in its expected security and execution state, and drift in it
    -- is not something this file may repair.
    generic_ok := generic_oid IS NOT NULL
        AND NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = generic_oid)
        AND has_function_privilege('authenticated', generic_oid, 'EXECUTE')
        AND has_function_privilege('service_role', generic_oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', generic_oid, 'EXECUTE')
        AND NOT has_function_privilege('public', generic_oid, 'EXECUTE');
    IF NOT COALESCE(generic_ok, false) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: create_image_post_with_library_item is missing or its security/execution state is not the reviewed one -- resolve the IMAGE-LIBRARY ownership rollout first';
    END IF;

    -- Row authority must be the accepted owner-scoped set in BOTH states, proved
    -- by identity as well as predicate: a renamed policy, one narrowed to
    -- another role, or a RESTRICTIVE one, is not the reviewed model.
    rls_on := COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relname = 'library_items'), false);
    policies_exact := COALESCE((
        SELECT count(*) = 4
           AND count(*) FILTER (WHERE policyname='Users can view their own library items'
                 AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles='{public}'::name[]
                 AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
           AND count(*) FILTER (WHERE policyname='Users can insert their own library items'
                 AND cmd='INSERT' AND permissive='PERMISSIVE' AND roles='{public}'::name[]
                 AND qual IS NULL AND replace(with_check,' ','')='(auth.uid()=user_id)') = 1
           AND count(*) FILTER (WHERE policyname='Users can update their own library items'
                 AND cmd='UPDATE' AND permissive='PERMISSIVE' AND roles='{public}'::name[]
                 AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
           AND count(*) FILTER (WHERE policyname='Users can delete their own library items'
                 AND cmd='DELETE' AND permissive='PERMISSIVE' AND roles='{public}'::name[]
                 AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
          FROM pg_policies WHERE schemaname='public' AND tablename='library_items'), false);
    IF NOT rls_on OR NOT policies_exact THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: library_items row authority is not the accepted owner-scoped set (rls=%, policies_exact=%)',
            rls_on, policies_exact;
    END IF;

    has_column := EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = 'knowledge_storage_path');
    has_helper := helper_oid IS NOT NULL;
    has_trusted := trusted_oid IS NOT NULL;
    owned := (CASE WHEN has_column THEN 1 ELSE 0 END)
           + (CASE WHEN has_helper THEN 1 ELSE 0 END)
           + (CASE WHEN has_trusted THEN 1 ELSE 0 END);

    SELECT COALESCE(array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text), ARRAY[]::text[])
      INTO anon_privileges
      FROM information_schema.table_privileges
     WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'library_items';
    SELECT COALESCE(array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text), ARRAY[]::text[])
      INTO auth_privileges
      FROM information_schema.table_privileges
     WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'library_items';

    IF owned = 0 THEN
        -- PRE is a fingerprint, not an absence. The reviewed starting point is
        -- the inherited GRANT ALL baseline; anything else is a database this
        -- rollout has never been reasoned about against.
        legacy_grants := anon_privileges = full_privileges
                     AND auth_privileges = full_privileges;
        IF NOT COALESCE(legacy_grants, false) THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: no owned objects, but library_items privileges are not the recognised legacy state (anon=%, authenticated=%). Resolve by hand.',
                anon_privileges, auth_privileges;
        END IF;
        RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW preflight: PRE state (0 of 3 owned objects, recognised legacy authority) -- applying';
        RETURN;
    END IF;

    IF owned <> 3 THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: partial state (column=%, helper=%, trusted_rpc=%). Resolve by hand; this file will not converge it.',
            has_column, has_helper, has_trusted;
    END IF;

    SELECT COALESCE(array_agg(DISTINCT column_name::text ORDER BY column_name::text), ARRAY[]::text[])
      INTO insert_columns
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated' AND table_schema = 'public'
       AND table_name = 'library_items' AND privilege_type = 'INSERT';
    SELECT COALESCE(array_agg(DISTINCT column_name::text ORDER BY column_name::text), ARRAY[]::text[])
      INTO update_columns
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated' AND table_schema = 'public'
       AND table_name = 'library_items' AND privilege_type = 'UPDATE';

    grants_hardened :=
        anon_privileges = ARRAY['SELECT']
    AND auth_privileges = ARRAY['DELETE','SELECT']
    AND NOT has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'UPDATE')
    AND NOT has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'INSERT')
    AND NOT has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'UPDATE')
    AND insert_columns = ARRAY['content','description','is_public','thumbnail_url','title','type','user_id']
    AND update_columns = ARRAY['content','thumbnail_url','updated_at'];

    -- Both owned functions must still be SECURITY INVOKER. A DEFINER rewrite is
    -- an authority change, so it is reported rather than replaced.
    functions_hardened :=
        NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = helper_oid)
    AND NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = trusted_oid)
    AND NOT has_function_privilege('public', helper_oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', helper_oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', helper_oid, 'EXECUTE')
    AND has_function_privilege('service_role', helper_oid, 'EXECUTE')
    AND NOT has_function_privilege('public', trusted_oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', trusted_oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', trusted_oid, 'EXECUTE')
    AND has_function_privilege('service_role', trusted_oid, 'EXECUTE');

    IF NOT COALESCE(grants_hardened, false) OR NOT COALESCE(functions_hardened, false) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: all objects exist but the hardened contract does not hold (grants=%, functions=%). Resolve by hand.',
            COALESCE(grants_hardened, false), COALESCE(functions_hardened, false);
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW preflight: POST state (3 of 3 owned objects, hardened) -- re-applying idempotently';
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The server-owned location column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.library_items
    ADD COLUMN IF NOT EXISTS knowledge_storage_path text;

COMMENT ON COLUMN public.library_items.knowledge_storage_path IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW: private KNOWLEDGE bucket object path for a '
    'PDF-area Image, so the durable object outlives its origin placement. '
    'Server-written only; excluded from every browser-role INSERT/UPDATE grant. '
    'NULL means no durable address has been PROVEN -- never a guess.';

-- ---------------------------------------------------------------------------
-- 2. Browser privileges. The column is only server-owned if it cannot be written.
-- ---------------------------------------------------------------------------
--
-- The inherited baseline is `GRANT ALL ON TABLE library_items TO anon,
-- authenticated`. Under it a column-level REVOKE achieves nothing: table-wide
-- UPDATE already covers every column, including ones added later. RLS decides
-- WHICH ROWS, never which columns, so a row's owner could write their own path
-- and aim the new route at another user's private crop.
--
-- Replaced by exactly the columns the application writes today:
--   INSERT  addToLibrary() (lib/collabboard/library.ts) and
--           create_image_post_with_library_item, which runs SECURITY INVOKER
--           as the signed-in caller.
--   UPDATE  persistDurableImageContent() (lib/infra/collabboard/
--           imageDurableContent.ts) -- content, thumbnail_url, updated_at, and
--           the only update path in the application.
--   DELETE  deleteFromLibrary(), whole-row.
--   SELECT  fetchLibraryItems(), select('*').
-- TRUNCATE, REFERENCES and TRIGGER were never used by a client.
REVOKE ALL ON TABLE public.library_items FROM anon;
REVOKE ALL ON TABLE public.library_items FROM authenticated;

GRANT SELECT ON TABLE public.library_items TO anon;
GRANT SELECT, DELETE ON TABLE public.library_items TO authenticated;
GRANT INSERT (user_id, title, description, type, content, thumbnail_url, is_public)
    ON TABLE public.library_items TO authenticated;
GRANT UPDATE (content, thumbnail_url, updated_at)
    ON TABLE public.library_items TO authenticated;
GRANT ALL ON TABLE public.library_items TO service_role;

-- ---------------------------------------------------------------------------
-- The canonical PDF-area provenance contract, mirrored once.
-- ---------------------------------------------------------------------------
--
-- A statement-for-statement mirror of parseKnowledgePdfAreaProvenance() and the
-- normalizeStorableRegion()/finalizeRegion() pair it delegates to, in
-- lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts and
-- lib/domain/knowledge/knowledgePageRegionGeometry.ts. The repair, the
-- postflight, the trusted creation function and the verifier all call this, so
-- none of them can drift from each other or from the reader that must later
-- accept these rows.
--
-- IEEE-754 IS THE CONTRACT, NOT ARBITRARY PRECISION. The parser is JavaScript,
-- where every number is a float64, so the comparisons below are made in
-- `double precision`. `numeric` would silently disagree at the edges: jsonb
-- stores 1e400 happily and numeric keeps it finite and integral, while
-- Number('1e400') is Infinity and Number.isInteger rejects it -- so a numeric
-- mirror would call that valid provenance and hand a durable path to a row the
-- reader refuses. The same applies downward, where a tiny positive width
-- underflows to 0 in float64 and stops being a selection.
--
-- DELIBERATELY NO STRICTER THAN THE PARSER. A row TypeScript accepts must be
-- accepted here, or the repair would refuse rows the product considers valid:
--   * pageNumber uses Number.isInteger, so JSON 1.0 is as valid as 1. The type
--     authority is jsonb_typeof, never the serialized text -- a digits-only
--     regex rejects 1.0 and would silently strand those rows.
--   * finalizeRegion CLAMPS a coordinate a hair below zero (> -1e-9) to 0
--     before range-testing it, so a small negative x is valid input, not a
--     reject. It also trims width/height to the remaining page and rejects only
--     if nothing is left.
--
-- WRITTEN IN PLPGSQL FOR EVALUATION ORDER. In a single SQL expression Postgres
-- may evaluate a cast before the AND-branch that was meant to guard it, so
-- `jsonb_typeof(v) = 'number' AND (v ->> ...)::float8 > 0` can still raise on
-- client JSON. Here every conversion is its own statement, and the ONLY
-- exception handlers wrap those conversions -- deliberately narrow, so a
-- release defect elsewhere in this function still surfaces instead of being
-- silently reported as "not provenance".
CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance(p_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    -- finalizeRegion()'s own overhang tolerance (NORMALIZED_REGION_EPSILON).
    eps CONSTANT double precision := 1e-9;
    src jsonb;
    reg jsonb;
    doc text;
    page_number double precision;
    rx double precision; ry double precision; rw double precision; rh double precision;
    r_left double precision; r_top double precision;
BEGIN
    -- parseKnowledgePdfAreaProvenance: metadata and source must both be plain
    -- objects. jsonb_typeof reports 'array' for arrays, so this rejects them.
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
        RETURN false;
    END IF;
    src := p_metadata -> 'source';
    IF src IS NULL OR jsonb_typeof(src) <> 'object' THEN
        RETURN false;
    END IF;
    IF jsonb_typeof(src -> 'kind') <> 'string'
       OR src ->> 'kind' <> 'knowledge-pdf-area' THEN
        RETURN false;
    END IF;

    -- typeof knowledgeDocumentId === 'string' && UUID.test(...). Compared as
    -- text: no ::uuid cast exists here, so a malformed id cannot raise.
    IF jsonb_typeof(src -> 'knowledgeDocumentId') <> 'string' THEN
        RETURN false;
    END IF;
    doc := src ->> 'knowledgeDocumentId';
    IF doc !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;

    -- Number(pageNumber) as float64. Out-of-range JSON (1e400) raises here and
    -- is rejected, matching Number.isInteger(Infinity) === false.
    IF jsonb_typeof(src -> 'pageNumber') <> 'number' THEN
        RETURN false;
    END IF;
    BEGIN
        page_number := (src ->> 'pageNumber')::double precision;
    EXCEPTION
        WHEN numeric_value_out_of_range OR invalid_text_representation THEN
            RETURN false;
    END;
    -- Number.isFinite, then Number.isInteger, then the canonical range.
    IF page_number IS NULL
       OR page_number <> page_number
       OR page_number = 'Infinity'::double precision
       OR page_number = '-Infinity'::double precision THEN
        RETURN false;
    END IF;
    IF page_number <> trunc(page_number) OR page_number < 1 THEN
        RETURN false;
    END IF;

    -- normalizeStorableRegion: object, then finalizeRegion on four numbers.
    reg := src -> 'region';
    IF reg IS NULL OR jsonb_typeof(reg) <> 'object' THEN
        RETURN false;
    END IF;
    IF jsonb_typeof(reg -> 'x') <> 'number'
       OR jsonb_typeof(reg -> 'y') <> 'number'
       OR jsonb_typeof(reg -> 'width') <> 'number'
       OR jsonb_typeof(reg -> 'height') <> 'number' THEN
        RETURN false;
    END IF;
    BEGIN
        rx := (reg ->> 'x')::double precision;
        ry := (reg ->> 'y')::double precision;
        rw := (reg ->> 'width')::double precision;
        rh := (reg ->> 'height')::double precision;
    EXCEPTION
        WHEN numeric_value_out_of_range OR invalid_text_representation THEN
            RETURN false;
    END;

    -- Number.isFinite(x) && ... on every coordinate, exactly as finalizeRegion
    -- does before it clamps anything.
    IF rx IS NULL OR ry IS NULL OR rw IS NULL OR rh IS NULL
       OR rx <> rx OR ry <> ry OR rw <> rw OR rh <> rh
       OR rx IN ('Infinity'::double precision, '-Infinity'::double precision)
       OR ry IN ('Infinity'::double precision, '-Infinity'::double precision)
       OR rw IN ('Infinity'::double precision, '-Infinity'::double precision)
       OR rh IN ('Infinity'::double precision, '-Infinity'::double precision) THEN
        RETURN false;
    END IF;

    r_left := CASE WHEN rx < 0 AND rx > -eps THEN 0 ELSE rx END;
    r_top  := CASE WHEN ry < 0 AND ry > -eps THEN 0 ELSE ry END;
    IF r_left < 0 OR r_top < 0 OR r_left > 1 OR r_top > 1 THEN
        RETURN false;
    END IF;
    IF rw <= 0 OR rh <= 0 THEN
        RETURN false;
    END IF;
    IF r_left + rw > 1 + eps OR r_top + rh > 1 + eps THEN
        RETURN false;
    END IF;
    -- A rectangle whose whole area was epsilon overhang is not a selection.
    IF least(rw, 1 - r_left) <= 0 OR least(rh, 1 - r_top) <= 0 THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb) IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW: SQL mirror of parseKnowledgePdfAreaProvenance '
    '(float64 semantics, finalizeRegion epsilon clamping, Number.isInteger pages). '
    'Returns false -- never NULL -- for anything it rejects; conversions of '
    'untrusted JSON scalars are the only guarded operations.';

-- Internal database machinery: the repair, postflight and the trusted creation
-- function are its only callers. No browser role needs it, and PUBLIC must not
-- inherit EXECUTE by default.
REVOKE ALL ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb)
    TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Trusted creation. One transaction, and no client-supplied location.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_knowledge_pdf_area_image_post_with_library_item(
    p_padlet_id uuid,
    p_board_id uuid,
    p_user_id uuid,
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
    v_library_item_id uuid;
    v_storage_path text;
    v_library_url text;
BEGIN
    -- The card must actually be what this function exists for, judged by the
    -- SAME contract the repair and the verifier use -- not a looser kind check,
    -- which would mint a durable KNOWLEDGE-bucket path for metadata the reader
    -- will later refuse.
    IF NOT public.is_knowledge_pdf_area_provenance(p_metadata) THEN
        RAISE EXCEPTION 'create_knowledge_pdf_area_image_post_with_library_item: metadata.source must be valid knowledge-pdf-area provenance';
    END IF;

    v_storage_path := 'board-derived/' || p_board_id::text || '/pdf-areas/' || p_padlet_id::text || '.webp';

    SELECT c.library_item_id INTO v_library_item_id
      FROM public.create_image_post_with_library_item(
             p_padlet_id, p_board_id, p_user_id, p_title, p_content,
             p_position_x, p_position_y, p_width, p_height,
             p_board_file_url, p_metadata
           ) AS c;

    IF v_library_item_id IS NULL THEN
        RETURN QUERY SELECT p_padlet_id, NULL::uuid;
        RETURN;
    END IF;

    v_library_url := '/api/library/items/' || v_library_item_id::text || '/image';

    UPDATE public.library_items
       SET knowledge_storage_path = v_storage_path,
           thumbnail_url = v_library_url,
           content = jsonb_set(content, '{file_url}', to_jsonb(v_library_url), true)
     WHERE id = v_library_item_id
       AND knowledge_storage_path IS NULL
       AND thumbnail_url IS NOT DISTINCT FROM p_board_file_url
       AND content ->> 'file_url' IS NOT DISTINCT FROM p_board_file_url
       -- resolveLibraryImagePreviewSrc reads thumbnail_url and content.file_url
       -- BEFORE content.metadata.drawing / previewUrl. A row that carries either
       -- of those has a newer composite that those two fields do not yet show --
       -- the resolver's own documented legacy case -- so repointing the fields
       -- above it would hide the current picture behind the original crop.
       AND content -> 'metadata' ->> 'drawing' IS NULL
       AND content -> 'metadata' ->> 'previewUrl' IS NULL;

    RETURN QUERY SELECT p_padlet_id, v_library_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_knowledge_pdf_area_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_knowledge_pdf_area_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.create_knowledge_pdf_area_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW: creates a PDF-area Image placement and its '
    'durable Library row in ONE transaction, deriving the private storage path '
    'from board+padlet ids. Never accepts a path. service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Legacy repair -- structural proof only, never a URL taken on trust.
-- ---------------------------------------------------------------------------
--
-- A Library row's thumbnail_url is owner-writable, so the board URL sitting in
-- it is a HINT and nothing more: believed alone, it would let anyone hand
-- themselves a path to another user's private crop. It is therefore used only
-- to propose a (boardId, padletId) pair, which must then survive a join proving
-- the placement really is this row's origin:
--
--   the padlet exists, and IS the parsed id
--   its board IS the parsed board
--   it points back at THIS library row (padlets.library_item_id)
--   it is an image
--   its own provenance is knowledge-pdf-area
--   and names the SAME knowledge document as the library snapshot
--
-- Rows whose origin placement is already deleted match nothing here and keep
-- NULL. That is the intended outcome: no surviving fact proves entitlement, so
-- no path is invented. Their preview stays absent and the UI will say so.
WITH hint AS (
    -- STRICT extraction. The URL is owner-writable, so it is parsed with the
    -- canonical 8-4-4-4-12 shape rather than a loose 36-character class: a
    -- forged hint must fall out of the candidate set, never reach a ::uuid cast
    -- and abort the whole rollout. Nothing is cast in this CTE.
    SELECT li.id,
           li.thumbnail_url,
           (regexp_match(
              li.thumbnail_url,
              '^/api/boards/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/padlets/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/image$'
           ))[1] AS board_text,
           (regexp_match(
              li.thumbnail_url,
              '^/api/boards/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/padlets/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/image$'
           ))[2] AS padlet_text,
           li.content -> 'metadata' -> 'source' ->> 'knowledgeDocumentId' AS document_id
      FROM public.library_items li
     WHERE li.knowledge_storage_path IS NULL
       AND li.type = 'image'
       -- The full canonical contract, not just source.kind.
       AND public.is_knowledge_pdf_area_provenance(li.content -> 'metadata')
       -- Only the exact legacy board-scoped PDF-area address is repairable. A
       -- row already carrying a newer durable/composite URL is current.
       AND li.content ->> 'file_url' = li.thumbnail_url
       -- No newer representation may be masked. resolveLibraryImagePreviewSrc
       -- reads thumbnail_url and content.file_url ABOVE content.metadata.drawing
       -- and previewUrl, so a row carrying either of those has a composite the
       -- two fields do not yet show -- the resolver's own documented legacy
       -- case. Repointing above it would hide the current picture.
       AND li.content -> 'metadata' ->> 'drawing' IS NULL
       AND li.content -> 'metadata' ->> 'previewUrl' IS NULL
),
candidate AS (
    -- Only now, once both groups are known-canonical UUIDs, is a cast safe.
    SELECT h.id, h.thumbnail_url, h.document_id,
           h.board_text::uuid AS board_id,
           h.padlet_text::uuid AS padlet_id
      FROM hint h
     WHERE h.board_text IS NOT NULL
       AND h.padlet_text IS NOT NULL
       AND h.document_id IS NOT NULL
),
verified AS (
    -- The hint proposed a pair; the join is what PROVES it. Every one of these
    -- is required, and a failure means "skip", never "abort".
    SELECT c.id, c.board_id, c.padlet_id, c.thumbnail_url
      FROM candidate c
      JOIN public.padlets p
        ON p.id = c.padlet_id
       AND p.board_id = c.board_id
       AND p.library_item_id = c.id
       AND p.type = 'image'
       AND public.is_knowledge_pdf_area_provenance(p.metadata)
       AND p.metadata -> 'source' ->> 'knowledgeDocumentId' = c.document_id
)
UPDATE public.library_items li
   SET knowledge_storage_path =
           'board-derived/' || v.board_id::text || '/pdf-areas/' || v.padlet_id::text || '.webp',
       -- Repointed together with the path, because filling the path alone would
       -- leave resolveLibraryImagePreviewSrc still preferring the stale board
       -- URL it reads first -- the row would be durable and still look broken.
       thumbnail_url = '/api/library/items/' || li.id::text || '/image',
       content = jsonb_set(li.content, '{file_url}',
                           to_jsonb('/api/library/items/' || li.id::text || '/image'), true),
       updated_at = timezone('utc'::text, now())
  FROM verified v
 WHERE li.id = v.id
   -- Re-checked at write time: nothing may have moved on since the CTE read,
   -- including a composite arriving between the read and this statement.
   AND li.thumbnail_url = v.thumbnail_url
   AND li.content ->> 'file_url' = v.thumbnail_url
   AND li.content -> 'metadata' ->> 'drawing' IS NULL
   AND li.content -> 'metadata' ->> 'previewUrl' IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Postflight. Refuse to commit anything that is not what was reviewed.
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
    insert_columns text[];
    update_columns text[];
    expected_insert constant text[] := ARRAY['content','description','is_public','thumbnail_url','title','type','user_id'];
    expected_update constant text[] := ARRAY['content','thumbnail_url','updated_at'];
    guessed integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = 'knowledge_storage_path' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: knowledge_storage_path missing';
    END IF;

    -- No table-wide browser write authority may survive, in any form.
    FOR i IN 1..1 LOOP
        IF has_table_privilege('authenticated', 'public.library_items', 'INSERT')
           OR has_table_privilege('authenticated', 'public.library_items', 'UPDATE')
           OR has_table_privilege('authenticated', 'public.library_items', 'TRUNCATE')
           OR has_table_privilege('authenticated', 'public.library_items', 'REFERENCES')
           OR has_table_privilege('authenticated', 'public.library_items', 'TRIGGER') THEN
            RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: authenticated retains table-wide write authority';
        END IF;
        IF has_table_privilege('anon', 'public.library_items', 'INSERT')
           OR has_table_privilege('anon', 'public.library_items', 'UPDATE')
           OR has_table_privilege('anon', 'public.library_items', 'DELETE')
           OR has_table_privilege('anon', 'public.library_items', 'TRUNCATE') THEN
            RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: anon retains write authority';
        END IF;
    END LOOP;

    -- The new column must be outside every browser mutation grant.
    IF has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'INSERT')
       OR has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'UPDATE')
       OR has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'INSERT')
       OR has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'UPDATE') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: knowledge_storage_path is browser-writable';
    END IF;

    SELECT array_agg(DISTINCT column_name::text ORDER BY column_name::text) INTO insert_columns
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated' AND table_schema = 'public'
       AND table_name = 'library_items' AND privilege_type = 'INSERT';
    SELECT array_agg(DISTINCT column_name::text ORDER BY column_name::text) INTO update_columns
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated' AND table_schema = 'public'
       AND table_name = 'library_items' AND privilege_type = 'UPDATE';

    IF insert_columns IS DISTINCT FROM expected_insert THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: unexpected INSERT columns %', insert_columns;
    END IF;
    IF update_columns IS DISTINCT FROM expected_update THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: unexpected UPDATE columns %', update_columns;
    END IF;

    -- The trusted function exists, and no browser role may execute it.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'create_knowledge_pdf_area_image_post_with_library_item'
    ) THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: trusted creation function missing';
    END IF;
    IF has_function_privilege('authenticated',
         'public.create_knowledge_pdf_area_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)', 'EXECUTE')
       OR has_function_privilege('anon',
         'public.create_knowledge_pdf_area_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: browser role can execute the trusted creation function';
    END IF;

    -- The generic image function is untouched and still reachable.
    IF NOT has_function_privilege('authenticated',
         'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: existing image function lost its grant';
    END IF;

    -- Owner RLS unchanged: four owner-scoped policies, no new visibility.
    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'library_items'
           AND qual IS NOT NULL AND qual NOT LIKE '%uid()%') > 0 THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: a non-owner-scoped policy exists on library_items';
    END IF;

    -- Durable rows are checked on facts that SURVIVE placement deletion.
    --
    -- Trust is established once, at repair or creation time, by the structural
    -- join above -- and the whole point of the feature is that the object stays
    -- valid after every placement is gone. Requiring a live padlet here would
    -- make the feature fail exactly when it is doing its job, so this asserts
    -- only what remains true forever: canonical path shape, an image row, and
    -- provenance the reader will still accept.
    SELECT count(*) INTO guessed
      FROM public.library_items li
     WHERE li.knowledge_storage_path IS NOT NULL
       AND NOT (
           li.knowledge_storage_path ~
             '^board-derived/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/pdf-areas/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.webp$'
           AND li.type = 'image'
           AND public.is_knowledge_pdf_area_provenance(li.content -> 'metadata')
       );
    IF guessed > 0 THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: % durable row(s) fail the canonical path/provenance contract', guessed;
    END IF;

    -- No row may have been repaired into a state the reader cannot use: a
    -- repaired row's preview must be ITS OWN Library address.
    SELECT count(*) INTO guessed
      FROM public.library_items li
     WHERE li.knowledge_storage_path IS NOT NULL
       AND li.thumbnail_url ~ '^/api/boards/'
       AND li.thumbnail_url IS DISTINCT FROM '/api/library/items/' || li.id::text || '/image';
    IF guessed > 0 THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: % durable row(s) still preview through a board-scoped URL', guessed;
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW: applied. Run the verifier next.';
END;
$postflight$;

COMMIT;
