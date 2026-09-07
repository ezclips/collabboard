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
       AND thumbnail_url IS NOT DISTINCT FROM p_board_file_url;

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
WITH candidate AS (
    SELECT li.id,
           li.thumbnail_url,
           (regexp_match(li.thumbnail_url,
             '^/api/boards/([0-9a-fA-F-]{36})/padlets/([0-9a-fA-F-]{36})/image$'))[1]::uuid AS board_id,
           (regexp_match(li.thumbnail_url,
             '^/api/boards/([0-9a-fA-F-]{36})/padlets/([0-9a-fA-F-]{36})/image$'))[2]::uuid AS padlet_id,
           li.content -> 'metadata' -> 'source' ->> 'knowledgeDocumentId' AS document_id
      FROM public.library_items li
     WHERE li.knowledge_storage_path IS NULL
       AND li.type = 'image'
       AND li.content -> 'metadata' -> 'source' ->> 'kind' = 'knowledge-pdf-area'
       -- Only the exact legacy board-scoped PDF-area address. A row already
       -- carrying a newer durable/composite URL is current and is not touched.
       AND li.thumbnail_url ~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$'
       AND li.content ->> 'file_url' = li.thumbnail_url
),
verified AS (
    SELECT c.id, c.board_id, c.padlet_id, c.thumbnail_url
      FROM candidate c
      JOIN public.padlets p
        ON p.id = c.padlet_id
       AND p.board_id = c.board_id
       AND p.library_item_id = c.id
       AND p.type = 'image'
       AND p.metadata -> 'source' ->> 'kind' = 'knowledge-pdf-area'
       AND p.metadata -> 'source' ->> 'knowledgeDocumentId' IS NOT DISTINCT FROM c.document_id
     WHERE c.document_id IS NOT NULL
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
   -- Re-checked at write time: nothing may have moved on since the CTE read.
   AND li.thumbnail_url = v.thumbnail_url
   AND li.content ->> 'file_url' = v.thumbnail_url;

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

    -- Every repaired row must have a real, structurally proven origin.
    SELECT count(*) INTO guessed
      FROM public.library_items li
     WHERE li.knowledge_storage_path IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.padlets p
            WHERE p.library_item_id = li.id
              AND li.knowledge_storage_path =
                  'board-derived/' || p.board_id::text || '/pdf-areas/' || p.id::text || '.webp'
       );
    IF guessed > 0 THEN
        RAISE EXCEPTION 'IMAGE-LIBRARY-DURABLE-PREVIEW postflight failed: % row(s) carry a path with no matching placement', guessed;
    END IF;

    RAISE NOTICE 'IMAGE-LIBRARY-DURABLE-PREVIEW: applied. Run the verifier next.';
END;
$postflight$;

COMMIT;
