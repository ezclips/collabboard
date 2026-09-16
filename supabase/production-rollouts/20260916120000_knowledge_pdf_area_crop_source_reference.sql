-- CollabBoard KNOWLEDGE_PDF_AREA_CROP_SOURCE_REFERENCE_1 production rollout.
--
-- SOURCE:
--   supabase/migrations/20260916120000_knowledge_pdf_area_crop_source_reference.sql
--
-- The two functions, their grants, their comments and the backfill below are a
-- byte-faithful copy of that reviewed migration -- nothing is improved,
-- reordered or redesigned here. This file exists because
-- `[db.migrations] enabled = false` in config.toml and supabase/BASELINE.md
-- records that supabase/migrations/ does not rebuild the live database. Run it
-- as one PostgreSQL statement batch.
--
-- WHAT IT FIXES. A PDF area crop stored its provenance only in padlet metadata
-- while every consumer -- the "Source . p. N" chip, the region preview, the
-- click-back to the PDF and Board AI citation resolution -- reads
-- public.source_references. The crop therefore showed nothing, while a Note
-- made from the very same region showed all three. Both crop creators now
-- write the region reference in the same transaction as the placement, and the
-- backfill gives the existing crops the reference they never got.
--
-- EXPECTED BACKFILL SIZE: 6 rows on the catalog as read on 2026-09-16. The
-- final statement RETURNs their ids; record them, because reversing this
-- rollout means deleting exactly those ids. Anything other than 6 means the
-- data moved under the plan -- stop and re-check rather than re-running.
--
-- BEFORE APPLYING, the dry run (read-only, returns the same set without
-- writing) is row 9 of the verifier:
--   supabase/production-rollouts/20260916120000_knowledge_pdf_area_crop_source_reference_verify.sql
--
-- AFTER APPLYING, run that verifier. A pass reads "0 crops without a
-- reference".

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. create_knowledge_pdf_area_image_post_with_library_item
-- ---------------------------------------------------------------------------
--
-- The body below is the reviewed function verbatim
-- (supabase/production-rollouts/20260907120000_library_durable_image.sql:483,
-- confirmed against the live catalog) with exactly ONE block added, immediately
-- before the final RETURN QUERY. Nothing else is reordered, relaxed or
-- improved. The signature is unchanged: knowledgePdfAreaImageRoute.ts:359 calls
-- this by name and must keep working untouched.

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

    -- DELIBERATE: this early return writes no source reference. A NULL library
    -- item id means create_image_post_with_library_item did not create the
    -- placement, so there is no padlet for a reference to point at -- and the
    -- target_padlet_id foreign key would reject one anyway. Keep it.
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

    -- The crop is a REGION reference, and the schema already has the exact shape
    -- for one: single page, all four region columns, no char span, no quote. The
    -- source_references_region_* constraints enforce every part of that. Writing
    -- it here is what makes the card's own "Source . p. N" chip, its region
    -- preview and its click-back to the PDF work -- through the shared reference
    -- plumbing rather than a second implementation of any of them.
    --
    -- The casts are safe because is_knowledge_pdf_area_provenance(p_metadata)
    -- above has already validated exactly these fields: a uuid-shaped document
    -- id, an integer page >= 1, and all four region values in range. There is
    -- deliberately no second validator here -- a weaker one would disagree with
    -- the guard, and a stronger one would reject rows the guard admits.
    --
    -- Idempotent: there is no unique constraint on
    -- (target_padlet_id, source_document_id, page, region), so a repeated call
    -- must not mint a second identical row.
    IF NOT EXISTS (
        SELECT 1
          FROM public.source_references r
         WHERE r.target_padlet_id = p_padlet_id
           AND r.source_document_id = (p_metadata -> 'source' ->> 'knowledgeDocumentId')::uuid
           AND r.page_start = (p_metadata -> 'source' ->> 'pageNumber')::int
    ) THEN
        INSERT INTO public.source_references (
            target_padlet_id, source_document_id, page_start, page_end,
            quote_text, quote_hash, char_start, char_end, locator,
            region_x, region_y, region_width, region_height
        ) VALUES (
            p_padlet_id,
            (p_metadata -> 'source' ->> 'knowledgeDocumentId')::uuid,
            (p_metadata -> 'source' ->> 'pageNumber')::int,
            (p_metadata -> 'source' ->> 'pageNumber')::int,
            NULL, NULL, NULL, NULL, NULL,
            (p_metadata -> 'source' -> 'region' ->> 'x')::double precision,
            (p_metadata -> 'source' -> 'region' ->> 'y')::double precision,
            (p_metadata -> 'source' -> 'region' ->> 'width')::double precision,
            (p_metadata -> 'source' -> 'region' ->> 'height')::double precision
        );
    END IF;

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
    'IMAGE-LIBRARY-DURABLE-PREVIEW: creates a PDF-area Image placement, its '
    'durable Library row and its region source reference in ONE transaction, '
    'deriving the private storage path from board+padlet ids. Never accepts a '
    'path. service_role only.';

-- ---------------------------------------------------------------------------
-- 2. create_knowledge_pdf_area_image_reuse_placement
-- ---------------------------------------------------------------------------
--
-- Verbatim from
-- supabase/migrations/20260908090000_add_knowledge_pdf_area_image_placement_mapping.sql:127
-- (confirmed against the live catalog), with the SAME insert and the SAME
-- idempotency guard added between the placements INSERT and the final RETURN
-- QUERY -- the first point at which the padlet exists and every validation in
-- steps 1-5 has passed.
--
-- WHY THIS FUNCTION NEEDS IT TOO: re-placing a Library crop onto a board is
-- also a crop reaching a board. A placement that carried no reference would be
-- a card with the same missing chip, missing preview and dead click-back, and
-- the defect would simply reappear by another route.
--
-- p_metadata's region values are already proven to be the library object's own:
-- step 5 asserts (p_metadata -> 'source') IS NOT DISTINCT FROM
-- (v_library_metadata -> 'source'), so the reference cannot describe a
-- rectangle the Library object does not itself claim.

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
RETURNS TABLE (padlet_id uuid, library_item_id uuid, board_id uuid)
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

    -- 7. The region reference, identical in shape to the creator's. See the
    -- comment there for why this is a region reference and why the casts are
    -- safe: step 4 ran the same is_knowledge_pdf_area_provenance guard over
    -- p_metadata, and step 5 proved it is the Library object's own source.
    --
    -- Idempotent for the same reason: there is no unique constraint on
    -- (target_padlet_id, source_document_id, page, region).
    IF NOT EXISTS (
        SELECT 1
          FROM public.source_references r
         WHERE r.target_padlet_id = p_padlet_id
           AND r.source_document_id = (p_metadata -> 'source' ->> 'knowledgeDocumentId')::uuid
           AND r.page_start = (p_metadata -> 'source' ->> 'pageNumber')::int
    ) THEN
        INSERT INTO public.source_references (
            target_padlet_id, source_document_id, page_start, page_end,
            quote_text, quote_hash, char_start, char_end, locator,
            region_x, region_y, region_width, region_height
        ) VALUES (
            p_padlet_id,
            (p_metadata -> 'source' ->> 'knowledgeDocumentId')::uuid,
            (p_metadata -> 'source' ->> 'pageNumber')::int,
            (p_metadata -> 'source' ->> 'pageNumber')::int,
            NULL, NULL, NULL, NULL, NULL,
            (p_metadata -> 'source' -> 'region' ->> 'x')::double precision,
            (p_metadata -> 'source' -> 'region' ->> 'y')::double precision,
            (p_metadata -> 'source' -> 'region' ->> 'width')::double precision,
            (p_metadata -> 'source' -> 'region' ->> 'height')::double precision
        );
    END IF;

    RETURN QUERY SELECT p_padlet_id, p_library_item_id, p_board_id;
END;
$$;

-- Trusted callers only. A signed-in browser must NOT be able to reach a
-- function whose whole purpose is to write a server-owned authorisation.
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
    'Library Image on a board, writing the placement, its server-owned mapping '
    '-- including the authorised board -- and its region source reference in '
    'ONE transaction. Re-proves library ownership and board edit authority. '
    'Creates no library row, copies no storage object, accepts no path. '
    'service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Backfill -- the crops that already exist
-- ---------------------------------------------------------------------------
--
-- DRIVEN BY THE DATA, NEVER BY A LIST OF IDS. Every row comes from the crop's
-- OWN metadata, so this cannot invent provenance for a card that does not
-- already claim it, and re-running it inserts nothing.
--
-- is_knowledge_pdf_area_provenance is applied as well as the kind check: the
-- kind alone would admit a card whose region or page is malformed, whose casts
-- below would then raise and abort the whole migration. Judged by the same
-- mirror the two functions use, so the backfill cannot admit a row the
-- creators would refuse.
--
-- The NOT EXISTS is deliberately broad -- ANY existing reference for the
-- padlet, not merely a matching one. A crop that already has a reference by
-- some other route is left exactly as it is; this migration's job is the ones
-- that have none, and guessing at a partial repair would be a second, unasked
-- change.
--
-- RETURNING id so the apply prints the rows it created: they are reversible by
-- id, and the report records them.

INSERT INTO public.source_references (
    target_padlet_id, source_document_id, page_start, page_end,
    quote_text, quote_hash, char_start, char_end, locator,
    region_x, region_y, region_width, region_height
)
SELECT p.id,
       (p.metadata -> 'source' ->> 'knowledgeDocumentId')::uuid,
       (p.metadata -> 'source' ->> 'pageNumber')::int,
       (p.metadata -> 'source' ->> 'pageNumber')::int,
       NULL, NULL, NULL, NULL, NULL,
       (p.metadata -> 'source' -> 'region' ->> 'x')::double precision,
       (p.metadata -> 'source' -> 'region' ->> 'y')::double precision,
       (p.metadata -> 'source' -> 'region' ->> 'width')::double precision,
       (p.metadata -> 'source' -> 'region' ->> 'height')::double precision
  FROM public.padlets p
 WHERE p.metadata -> 'source' ->> 'kind' = 'knowledge-pdf-area'
   AND public.is_knowledge_pdf_area_provenance(p.metadata)
   AND NOT EXISTS (
         SELECT 1 FROM public.source_references r
          WHERE r.target_padlet_id = p.id
       )
RETURNING id;

COMMIT;
