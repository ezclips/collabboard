-- IMAGE-LIBRARY-DURABLE-PREVIEW -- a PDF-area Library Image keeps a picture
-- after the card it was cut from is deleted.
--
-- THE DEFECT. IMAGE-LIBRARY-1 made a saved Image Post durable: deleting the
-- placement leaves `library_items` standing. R6B stored the crop privately at
-- `board-derived/{boardId}/pdf-areas/{padletId}.webp` and gave it exactly one
-- address, `/api/boards/{boardId}/padlets/{padletId}/image`, which proves its
-- authority from that padlet's own provenance. Both are individually right and
-- together they contradict: delete the card and the Library row survives with
-- every preview field pointing at a URL that now 404s. The bytes are still
-- there -- nothing deletes them -- but nothing is allowed to serve them.
--
-- THE CORRECTION. One more ADDRESS for the SAME object. No copy, no second
-- bucket, no signed URL, no public token, and no cleanup at delete time.
--
-- The board route is untouched and remains board-scoped, because a collaborator
-- may read an image on a board they were invited to without owning the Library
-- row behind it. The new route is owner-scoped. Merging them would take that
-- image away from every collaborator, so they stay two routes on purpose.

-- Where the durable object lives. Server-owned: it is a location fact, never
-- client content, and the grants below are what make that true rather than
-- merely intended. NULL is a real answer -- a legacy row whose origin card is
-- already gone cannot have its path proved and keeps NULL rather than a guess.
ALTER TABLE public.library_items
    ADD COLUMN IF NOT EXISTS knowledge_storage_path text;

COMMENT ON COLUMN public.library_items.knowledge_storage_path IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW: private KNOWLEDGE bucket object path for a '
    'PDF-area Image, so the durable object outlives its origin placement. '
    'Server-written only; excluded from every browser-role INSERT/UPDATE grant. '
    'NULL means no durable address has been PROVEN -- never a guess.';

-- ---------------------------------------------------------------------------
-- Browser privileges: the column is only server-owned if it cannot be written.
-- ---------------------------------------------------------------------------
--
-- `GRANT ALL ON TABLE library_items TO anon, authenticated` is the inherited
-- baseline. Under it, a column-level REVOKE on the new column would achieve
-- nothing: table-wide UPDATE already covers every column, including any added
-- later. RLS is row authority and says nothing about which COLUMNS a row's
-- owner may set, so the owner could simply write their own path and point the
-- new route at another user's private crop.
--
-- So the table-wide grants are withdrawn and replaced by exactly the columns
-- the application actually writes today:
--
--   INSERT  lib/collabboard/library.ts addToLibrary(), which spreads the
--           LibraryItem shape minus id/user_id/created_at/updated_at and adds
--           user_id -- plus public.create_image_post_with_library_item, which
--           inserts user_id, title, type, content, thumbnail_url, is_public.
--   UPDATE  lib/infra/collabboard/imageDurableContent.ts
--           persistDurableImageContent(), which sets content, thumbnail_url
--           and updated_at, and is the ONLY update path in the application.
--   DELETE  lib/collabboard/library.ts deleteFromLibrary(), whole-row.
--   SELECT  lib/collabboard/library.ts fetchLibraryItems(), select('*').
--
-- TRUNCATE, REFERENCES and TRIGGER were never used by any client and are not
-- re-granted. Row authority is unchanged: every policy still reads
-- `auth.uid() = user_id`, and none is touched here.
REVOKE ALL ON TABLE public.library_items FROM anon;
REVOKE ALL ON TABLE public.library_items FROM authenticated;

-- anon keeps reading exactly as before -- owner RLS already returns nothing to
-- it, so this changes no result -- and loses every way to write.
GRANT SELECT ON TABLE public.library_items TO anon;

GRANT SELECT, DELETE ON TABLE public.library_items TO authenticated;

GRANT INSERT (user_id, title, description, type, content, thumbnail_url, is_public)
    ON TABLE public.library_items TO authenticated;

GRANT UPDATE (content, thumbnail_url, updated_at)
    ON TABLE public.library_items TO authenticated;

-- service_role keeps table authority: the trusted creation path below and the
-- verified legacy repair both run under it.
GRANT ALL ON TABLE public.library_items TO service_role;

-- ---------------------------------------------------------------------------
-- The canonical PDF-area provenance contract, mirrored once.
-- ---------------------------------------------------------------------------
--
-- A statement-for-statement mirror of parseKnowledgePdfAreaProvenance() and the
-- normalizeStorableRegion()/finalizeRegion() pair it delegates to, in
-- lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts and
-- lib/domain/knowledge/knowledgePageRegionGeometry.ts. The repair, the
-- postflight and the verifier all call this, so none of them can drift from
-- each other or from the reader that must later accept these rows.
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
-- `jsonb_typeof(v) = 'number' AND (v #>> '{}')::numeric > 0` can still raise on
-- client-controlled JSON. Here every cast is a separate statement that runs only
-- after its own type test returned, and the exception block makes "never throws
-- for malformed input" a guarantee rather than an argument.
CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance(p_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    -- finalizeRegion()'s own overhang tolerance (NORMALIZED_REGION_EPSILON).
    eps CONSTANT numeric := 1e-9;
    src jsonb;
    reg jsonb;
    doc text;
    page_number numeric;
    rx numeric; ry numeric; rw numeric; rh numeric;
    r_left numeric; r_top numeric;
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

    -- typeof knowledgeDocumentId === 'string' && UUID.test(...)
    IF jsonb_typeof(src -> 'knowledgeDocumentId') <> 'string' THEN
        RETURN false;
    END IF;
    doc := src ->> 'knowledgeDocumentId';
    IF doc !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;

    -- Number.isInteger(pageNumber) && pageNumber >= 1. The cast runs only after
    -- the type test above returned, so malformed JSON cannot reach it.
    IF jsonb_typeof(src -> 'pageNumber') <> 'number' THEN
        RETURN false;
    END IF;
    page_number := (src -> 'pageNumber')::numeric;
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
    rx := (reg -> 'x')::numeric;
    ry := (reg -> 'y')::numeric;
    rw := (reg -> 'width')::numeric;
    rh := (reg -> 'height')::numeric;

    -- JSON cannot carry NaN or Infinity, so Number.isFinite() needs no mirror.
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
EXCEPTION
    -- Belt and braces. Client-writable JSON must never be able to abort a
    -- rollout; anything unforeseen is simply "not PDF-area provenance".
    WHEN others THEN
        RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb) IS
    'IMAGE-LIBRARY-DURABLE-PREVIEW: SQL mirror of parseKnowledgePdfAreaProvenance '
    '(incl. finalizeRegion epsilon clamping and Number.isInteger page semantics). '
    'Returns false -- never NULL, never an exception -- for anything it rejects.';

-- Internal database machinery: the repair, postflight and the trusted creation
-- function are its only callers. No browser role needs it, and PUBLIC must not
-- inherit EXECUTE by default.
REVOKE ALL ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb)
    TO service_role;

-- ---------------------------------------------------------------------------
-- Trusted creation: one transaction, and no client-supplied location.
-- ---------------------------------------------------------------------------
--
-- Why a dedicated function rather than a path argument on the generic one:
-- `create_image_post_with_library_item` is EXECUTE-able by `authenticated`, so
-- a path parameter there would be client input wearing a server-owned name --
-- any signed-in user could name any object in the private bucket. This wrapper
-- takes STRUCTURAL inputs only and derives the location itself, and only
-- service_role may call it.
--
-- SECURITY INVOKER, like the function it wraps: it reaches for no authority of
-- its own. The route that calls it has already authorised the board edit and
-- authenticated the owner.
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
