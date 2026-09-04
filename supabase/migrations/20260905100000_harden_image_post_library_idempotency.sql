-- IMAGE-LIBRARY-1-C1 -- idempotency must not bypass authorization.
--
-- The first version answered a retry BEFORE it had established anything about
-- the caller: it looked the placement up by id and returned the pair. A board
-- VIEWER -- correctly refused when creating -- could therefore replay any image
-- card id from a board they can merely read and receive the CREATOR's private
-- library_items id. Board membership is not a claim on another person's Library.
--
-- The order is now: logical actor, then board-write authority, then and only
-- then "is this a genuine retry". No success and no identity leaves this
-- function before authorization.
--
-- Schema is untouched. This replaces the function body only.

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
    v_existing_board uuid;
    v_existing_library uuid;
    v_library_owner uuid;
    v_found boolean;
BEGIN
    -- 1. THE LOGICAL ACTOR.
    -- Called directly, the caller is whoever the JWT says, and may not nominate
    -- anyone else. Called by the trusted route through service_role there is no
    -- auth.uid(), and p_user_id is the id that route already authenticated --
    -- which is why step 2 below still has to be run against it.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;

    -- 2. BOARD-WRITE AUTHORITY FOR THAT ACTOR -- load-bearing, not decorative.
    -- service_role bypasses RLS, so without this the route's own check would be
    -- the only thing standing between a delegated id and someone else's board.
    --
    -- This is the `board_id` branch of the padlets INSERT policy, reproduced
    -- exactly: owner of the board, or a collaborator whose role is 'editor'.
    -- Nothing is broadened -- viewer and commenter are absent by construction.
    -- `can_edit_board()` is deliberately NOT used: it resolves the CANVASES
    -- authority model (it reads public.canvases and workspace roles), which is
    -- the other half of the padlets policy and not the half that governs an
    -- image placement created with a board_id.
    IF NOT EXISTS (
        SELECT 1 FROM public.boards b
         WHERE b.id = p_board_id AND b.user_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.board_collaborators c
         WHERE c.board_id = p_board_id AND c.user_id = p_user_id AND c.role = 'editor'
    ) THEN
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;

    -- 3. ONLY NOW: is this a genuine retry of THIS actor's own request?
    -- Every part of the identity must agree -- same placement, same board, a
    -- library object that exists, and one belonging to this actor. Anything
    -- else (another creator's card, a card from a different board, a placement
    -- with no library identity) fails closed with the SAME generic message, so
    -- a caller cannot tell the cases apart, and no id is ever returned.
    SELECT true, p.board_id, p.library_item_id, l.user_id
      INTO v_found, v_existing_board, v_existing_library, v_library_owner
      FROM public.padlets p
      LEFT JOIN public.library_items l ON l.id = p.library_item_id
     WHERE p.id = p_padlet_id;

    IF v_found THEN
        IF v_existing_board = p_board_id
           AND v_existing_library IS NOT NULL
           AND v_library_owner = p_user_id
        THEN
            RETURN QUERY SELECT p_padlet_id, v_existing_library;
            RETURN;
        END IF;
        RAISE EXCEPTION 'Not authorized to create or retry this image post'
            USING ERRCODE = '42501';
    END IF;

    -- 4. The durable object and its placement, in this one transaction.
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

-- Unchanged posture, restated so a replace can never quietly widen it.
REVOKE ALL ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_image_post_with_library_item(
    uuid, uuid, uuid, text, text, double precision, double precision,
    double precision, double precision, text, jsonb
) TO authenticated, service_role;
