-- IMAGE-LIBRARY-1 -- a saved Image Post gets a durable Library identity.
--
-- Library = durable, reusable content. Board padlet = one placement of it.
-- Until now the two were unrelated: `library_items` stored a jsonb SNAPSHOT of a
-- post, written only by an explicit "Add to library" gesture, so an image saved
-- from the PDF reader existed on the board and nowhere else.
--
-- This adds the missing relationship and ONE function that creates both rows in
-- a single transaction, because a placement without its durable identity -- or a
-- durable identity whose placement never landed -- is the state the product rule
-- forbids, and two separate PostgREST calls cannot avoid it.

-- The placement's link to the durable object. NULLABLE by design: every padlet
-- that predates this, and every post that is not library-backed, keeps a NULL
-- here rather than acquiring a fake identity.
ALTER TABLE public.padlets
    ADD COLUMN IF NOT EXISTS library_item_id uuid
    REFERENCES public.library_items(id) ON DELETE SET NULL;

-- DELIBERATELY NOT UNIQUE. A Library object is reusable content: dragging one
-- item onto two boards must be able to produce two placements of the SAME
-- durable object. `UNIQUE (library_item_id)` would silently outlaw that, which
-- is the opposite of what a library is for. The idempotence the product needs
-- is "one creation request -> one object -> one placement", and that is owned by
-- the padlet primary key inside the function below, not by this index.
CREATE INDEX IF NOT EXISTS padlets_library_item_id_idx
    ON public.padlets (library_item_id)
    WHERE library_item_id IS NOT NULL;

-- Deleting a placement leaves the Library object untouched -- there is no
-- cascade from padlets to library_items in this direction at all. Deleting a
-- Library item leaves its placements standing with a NULL link (ON DELETE SET
-- NULL above), matching the existing Library deletion semantics, where removing
-- a personal item has never reached onto a board.

COMMENT ON COLUMN public.padlets.library_item_id IS
    'IMAGE-LIBRARY-1: the durable library_items row this placement shows. NULL '
    'for posts with no library identity. Not unique: one library object may be '
    'placed many times.';

-- One transaction, so a failure on either side leaves neither.
--
-- SECURITY INVOKER, deliberately. This function grants no authority of its own:
-- whatever the caller may already write, it may write here, and nothing more.
-- The route that calls it authorises the board edit first (a viewer is refused
-- with 403 before any bytes are cropped), and `p_user_id` is the id that route
-- already authenticated -- never a value a browser chose.
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

-- Signed-in callers only. Every row it writes still faces the same policies a
-- direct insert would, so this reaches, never elevates.
REVOKE ALL ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) TO authenticated, service_role;
