-- ROLLBACK for
-- supabase/production-rollouts/20260916120000_knowledge_pdf_area_crop_source_reference.sql
--
-- THIS PROJECT'S SUPABASE PLAN HAS NO POINT-IN-TIME RECOVERY. This file is the
-- ONLY undo path for that rollout. It therefore lives in the repository, under
-- review, beside the thing it reverses -- never in a scratch buffer, a chat
-- window or on one person's machine, because none of those survive the day
-- somebody actually needs them.
--
-- THE TWO PARTS ARE INDEPENDENT, AND PART 1 IS THE ONE YOU WILL PROBABLY WANT.
-- The rollout is applied in two stages on purpose: the function replacement
-- first, the backfill only after a new crop has been seen to save AND show its
-- "Source . p. N" chip. If that smoke test fails, ONLY PART 1 has been applied,
-- so only PART 1 need be run -- it needs no ids, no data, and no record of what
-- the apply did.
--
-- PART 1  restores the two pre-change function bodies. Static text, verbatim
--         from the migrations that installed them. Safe to run at any time.
-- PART 2  removes the rows the backfill created. Requires the ids the apply
--         printed. Do not run it unless the backfill was actually applied.
--
-- Run each part as one PostgreSQL statement batch.

-- ===========================================================================
-- PART 1 -- RESTORE THE TWO PRE-CHANGE FUNCTION BODIES
-- ===========================================================================
--
-- Copied verbatim, with their REVOKE/GRANT/COMMENT statements, from:
--   supabase/migrations/20260907120000_library_durable_image_preview.sql
--   supabase/migrations/20260908090000_add_knowledge_pdf_area_image_placement_mapping.sql
--
-- These are the definitions the live catalog held before the rollout, verified
-- byte-for-byte. Nothing here is retyped, improved or reformatted: a rollback
-- that ships a "tidied" body is not a rollback, it is a third version of the
-- function written under pressure.
--
-- Each is CREATE OR REPLACE with the SAME signature, so restoring them changes
-- no grants, breaks no caller, and needs no DROP. Re-running is harmless.
--
-- What this undoes: both functions stop writing a source reference when a crop
-- is created or re-placed. Crops made after this point go back to having their
-- provenance in padlet metadata only -- the original defect. Any reference rows
-- already written stay exactly where they are; removing those is PART 2's job,
-- and only for the ones the BACKFILL created.

-- ---------------------------------------------------------------------------
-- 1a. create_knowledge_pdf_area_image_post_with_library_item
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
    -- The card must actually be what this function exists for. Without this a
    -- caller could mint a durable KNOWLEDGE-bucket path for an ordinary image.
    -- The card must actually be what this function exists for, judged by the
    -- SAME contract the repair and the verifier use -- not a looser kind check,
    -- which would mint a durable KNOWLEDGE-bucket path for metadata the reader
    -- will later refuse.
    IF NOT public.is_knowledge_pdf_area_provenance(p_metadata) THEN
        RAISE EXCEPTION 'create_knowledge_pdf_area_image_post_with_library_item: metadata.source must be valid knowledge-pdf-area provenance';
    END IF;

    -- Derived here, from two ids the caller has already had validated -- never
    -- accepted as an argument. Mirrors knowledgePdfAreaImagePath() exactly.
    v_storage_path := 'board-derived/' || p_board_id::text || '/pdf-areas/' || p_padlet_id::text || '.webp';

    -- Reuse, never reimplement: idempotence, the snapshot shape and the single
    -- transaction all stay owned by the existing function.
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

    -- The Library row points at the DURABLE address; the placement keeps the
    -- board one, written by the call above.
    --
    -- Guarded, not unconditional. On the idempotent retry path the row already
    -- exists and may since have been annotated, and that newer composite is
    -- current -- rewriting it back to the crop would be a downgrade. The guard
    -- fires only while the row is still exactly as this function left it.
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

-- Trusted callers only. A signed-in browser must NOT be able to reach a
-- function whose whole purpose is to write a server-owned location.
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
-- 1b. create_knowledge_pdf_area_image_reuse_placement
-- ---------------------------------------------------------------------------

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
    'Library Image on a board, writing the placement and its server-owned '
    'mapping -- including the authorised board -- in ONE transaction. Re-proves '
    'library ownership and board edit authority. Creates no library row, copies '
    'no storage object, accepts no path. service_role only.';

-- ===========================================================================
-- PART 2 -- UNDO THE BACKFILL, BY ID ONLY
-- ===========================================================================
--
-- ONLY run this if the backfill was applied. Part 1 above is complete without
-- it.
--
-- THE IDS COME FROM THE APPLY. The rollout's final statement ends with
-- `RETURNING id`, so applying it printed the id of every row it created, and
-- those ids are recorded in the PM's apply report. Paste exactly those ids
-- below -- no others, and nothing derived.
--
-- A BROAD PREDICATE IS FORBIDDEN HERE. Deleting by document, by page, by
-- region, by "has no quote", or by created_at window is NOT an acceptable
-- substitute and must never be added to this file, however convenient it looks
-- at the moment of a rollback. The reason is simple and permanent:
--
--   after the rollout, the two creator functions write reference rows that are
--   IDENTICAL IN SHAPE to the backfilled ones -- same columns, same nulls, same
--   region geometry, same document. A row a user created by cropping a PDF five
--   minutes ago is indistinguishable from a row the backfill created, by every
--   column except its id.
--
-- So a predicate wide enough to catch all six backfilled rows is also wide
-- enough to delete real user work, silently and unrecoverably -- and with no
-- point-in-time recovery on this plan, there is nothing to restore it from.
-- The id list is the only safe discriminator. If the ids were not recorded,
-- STOP and reconstruct them from the apply output rather than widening this.
--
-- Expected: 6 ids, matching the 6 rows the dry run predicted. If the count
-- differs, STOP -- the data moved, and this file's assumptions no longer hold.
--
-- The RETURNING clause reports what was actually removed; check it against the
-- list you pasted before treating the rollback as done.
--
-- The list below ships EMPTY on purpose. `IN ()` is a syntax error, so this
-- file cannot delete anything if it is run by accident or pasted whole -- it
-- fails loudly and changes nothing. Leave it empty when committing any future
-- edit to this file.

DELETE FROM public.source_references
 WHERE id IN (
    -- Paste the ids from the apply's RETURNING output here, one per line:
    --   '00000000-0000-0000-0000-000000000000',
 )
RETURNING id;
