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
-- of exactly two recognised states.
--
--   PRE    none of the three feature objects present  -> apply
--   POST   all three present                          -> re-apply (idempotent)
--   anything else                                     -> ABORT
--
-- A partial state is never repaired automatically: the operator is told what
-- was found and decides.
DO $preflight$
DECLARE
    prerequisites constant text[] := ARRAY[
        'public.library_items',
        'public.padlets',
        'public.boards'
    ];
    prerequisite text;
    present_objects integer := 0;
    found_column boolean;
    found_function boolean;
    hardened boolean;
BEGIN
    FOREACH prerequisite IN ARRAY prerequisites LOOP
        IF to_regclass(prerequisite) IS NULL THEN
            RAISE EXCEPTION
                'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: prerequisite table % is missing', prerequisite;
        END IF;
    END LOOP;

    -- The durable-identity foundation this correction extends.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'padlets' AND column_name = 'library_item_id'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: padlets.library_item_id is missing -- apply the IMAGE-LIBRARY ownership rollout first';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_image_post_with_library_item'
    ) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: create_image_post_with_library_item is missing -- apply the IMAGE-LIBRARY ownership rollout first';
    END IF;

    found_column := EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'library_items'
           AND column_name = 'knowledge_storage_path'
    );
    found_function := EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'create_knowledge_pdf_area_image_post_with_library_item'
    );
    -- "Hardened" means the table-wide browser write authority is gone. While it
    -- survives, a column-level story about the new column would be fiction.
    hardened := NOT has_table_privilege('authenticated', 'public.library_items', 'TRUNCATE');

    present_objects := (CASE WHEN found_column THEN 1 ELSE 0 END)
                     + (CASE WHEN found_function THEN 1 ELSE 0 END)
                     + (CASE WHEN hardened THEN 1 ELSE 0 END);

    IF present_objects NOT IN (0, 3) THEN
        RAISE EXCEPTION
            'IMAGE-LIBRARY-DURABLE-PREVIEW preflight failed: partial state (column=%, function=%, hardened=%). Resolve by hand; this file will not converge it.',
            found_column, found_function, hardened;
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW preflight: % of 3 feature objects present -- %',
        present_objects, CASE WHEN present_objects = 0 THEN 'PRE state, applying' ELSE 'POST state, re-applying idempotently' END;
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
-- One SQL statement of the same shape parseKnowledgePdfAreaProvenance() accepts
-- in lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts, so the repair and the
-- verifier cannot drift from each other or from the reader that must later
-- consume these rows. Deliberately no stricter than the parser: it is the
-- authority, and a row it would accept must not be rejected here.
--
--   source.kind          exactly 'knowledge-pdf-area'
--   knowledgeDocumentId  canonical 8-4-4-4-12 UUID
--   pageNumber           integer >= 1
--   region               x/y/width/height numbers, normalizeStorableRegion()
--
-- IMMUTABLE and side-effect free: a predicate, never a repair.
CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance(p_metadata jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        p_metadata -> 'source' ->> 'kind' = 'knowledge-pdf-area'
        AND p_metadata -> 'source' ->> 'knowledgeDocumentId'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND jsonb_typeof(p_metadata -> 'source' -> 'pageNumber') = 'number'
        AND (p_metadata -> 'source' ->> 'pageNumber') ~ '^[0-9]+$'
        AND (p_metadata -> 'source' ->> 'pageNumber')::numeric >= 1
        AND jsonb_typeof(p_metadata -> 'source' -> 'region') = 'object'
        AND jsonb_typeof(p_metadata -> 'source' -> 'region' -> 'x') = 'number'
        AND jsonb_typeof(p_metadata -> 'source' -> 'region' -> 'y') = 'number'
        AND jsonb_typeof(p_metadata -> 'source' -> 'region' -> 'width') = 'number'
        AND jsonb_typeof(p_metadata -> 'source' -> 'region' -> 'height') = 'number'
        -- finalizeRegion(): inside the page, positive extent, and not spilling
        -- past the far edge. 1e-9 is the parser's own overhang tolerance.
        AND (p_metadata -> 'source' -> 'region' ->> 'x')::numeric >= 0
        AND (p_metadata -> 'source' -> 'region' ->> 'y')::numeric >= 0
        AND (p_metadata -> 'source' -> 'region' ->> 'x')::numeric <= 1
        AND (p_metadata -> 'source' -> 'region' ->> 'y')::numeric <= 1
        AND (p_metadata -> 'source' -> 'region' ->> 'width')::numeric > 0
        AND (p_metadata -> 'source' -> 'region' ->> 'height')::numeric > 0
        AND (p_metadata -> 'source' -> 'region' ->> 'x')::numeric
          + (p_metadata -> 'source' -> 'region' ->> 'width')::numeric <= 1 + 1e-9
        AND (p_metadata -> 'source' -> 'region' ->> 'y')::numeric
          + (p_metadata -> 'source' -> 'region' ->> 'height')::numeric <= 1 + 1e-9,
        false)
$$;

COMMENT ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb) IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW: SQL mirror of parseKnowledgePdfAreaProvenance. '
    'Returns false (never NULL) for any metadata the TypeScript parser rejects.';

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
    IF p_metadata -> 'source' ->> 'kind' IS DISTINCT FROM 'knowledge-pdf-area' THEN
        RAISE EXCEPTION 'create_knowledge_pdf_area_image_post_with_library_item: metadata.source.kind must be knowledge-pdf-area';
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
