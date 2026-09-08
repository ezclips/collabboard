-- IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE -- a durable PDF-area Library Image can
-- be placed AGAIN, and the new card renders.
--
-- THE DEFECT. IMAGE-LIBRARY-DURABLE-PREVIEW made the crop outlive its origin
-- placement: the Library row keeps a picture after the card it was cut from is
-- deleted. Reuse then broke on the other side. Dragging that Library item onto
-- a board copied the snapshot verbatim, so the new placement inherited
-- `metadata.imageUrl` pointing at the ORIGIN card's board address -- a URL that
-- 404s the moment that card is gone. Runtime proved it: a card whose Library
-- object was perfectly healthy rendered nothing at all.
--
-- WHY THIS NEEDS A TABLE AT ALL. The correction is to give the new placement
-- its OWN board address and let the board route resolve the durable object
-- behind it. But the board route serves bytes out of the PRIVATE Knowledge
-- bucket, so something must say -- with authority -- which private object this
-- placement is entitled to. `padlets.library_item_id` cannot: it is a browser
-- writable column, so it is an identity HINT and never an authorisation. Any
-- signed-in user could set it to a stranger's library UUID and ask the board
-- route for the bytes.
--
-- So this adds the missing TRUSTED half: one narrow, server-owned mapping that
-- only the trusted reuse function below ever writes, and that no browser role
-- may insert, update, delete or even read.
--
-- WHAT IT IS NOT. No second Storage object -- the same private crop is served.
-- No second library_items row -- the same durable object is referenced. No
-- backfill: historical placements keep their own derived object at
-- `board-derived/{boardId}/pdf-areas/{padletId}.webp`, the board route still
-- tries that path FIRST, and nothing already working needs a mapping.

-- ---------------------------------------------------------------------------
-- The server-owned mapping.
-- ---------------------------------------------------------------------------
--
-- `padlet_id` is the primary key, not merely unique: a placement shows exactly
-- one durable object, and two rows for one card would be two answers to a
-- question that must have one. The cascade is what keeps this table honest --
-- deleting the card removes its authorisation with it, so a padlet id can never
-- be re-used to reach an object the new card was not granted.
--
-- `library_item_id` cascades too. A deleted Library object has no bytes to
-- serve, and a mapping pointing at nothing is an authorisation with no subject.
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

-- The board route looks up by padlet_id (the primary key). This index serves
-- the other direction: the cascade and any per-object audit.
CREATE INDEX IF NOT EXISTS knowledge_pdf_area_image_placements_library_item_id_idx
    ON public.knowledge_pdf_area_image_placements (library_item_id);

-- ---------------------------------------------------------------------------
-- Fail closed, twice over.
-- ---------------------------------------------------------------------------
--
-- RLS with ZERO policies means every non-bypassing role sees and writes
-- nothing, whatever privileges it might later be granted by accident. The
-- REVOKEs below mean the same thing at the privilege layer, so neither is the
-- only thing standing there. service_role is the sole writer, and it bypasses
-- RLS as the trusted server authority.
ALTER TABLE public.knowledge_pdf_area_image_placements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM PUBLIC;
REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM anon;
REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM authenticated;

GRANT ALL ON TABLE public.knowledge_pdf_area_image_placements TO service_role;

-- ---------------------------------------------------------------------------
-- Trusted reuse: one transaction, and no client-supplied identity.
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER, like the creation function beside it: it reaches for no
-- authority of its own, and only service_role may call it. The route that calls
-- it has already authenticated the user, authorised the board edit and read the
-- Library row through the user's OWN client (owner RLS). Every one of those
-- checks is repeated here, because service_role bypasses RLS and a route check
-- must never be the only thing between a delegated id and someone else's data.
--
-- It takes NO storage path, NO origin board and NO origin padlet. The durable
-- location is read from the Library row's own server-owned column; the browser
-- contributes a position and nothing else.
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

    INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id)
    VALUES (p_padlet_id, p_library_item_id);

    RETURN QUERY SELECT p_padlet_id, p_library_item_id;
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
    'mapping in ONE transaction. Re-proves library ownership and board edit '
    'authority. Creates no library row, copies no storage object, accepts no '
    'path. service_role only.';
