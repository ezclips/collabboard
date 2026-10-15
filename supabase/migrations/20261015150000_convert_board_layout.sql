-- PATCH-377 (+ Addendum 1). Switch Wall/Timeline <-> Columns/Grid by CONVERTING
-- the posts.
--
-- WHY. PATCH-376 disabled the cross-family tiles because the live probe showed a
-- Columns board switched to Wall looked EMPTY: the posts were still there, but a
-- Columns/Grid post belongs to a `board_sections` row (`metadata.sectionId`) and
-- a Wall/Timeline post is a child of a root container
-- (`metadata.childPadletIds` / `metadata.parentId`), so a bare `boards.layout`
-- change left every post with nowhere to render. padlet.com switches formats
-- freely and keeps the posts; this is that conversion.
--
-- ONE FUNCTION, ONE TRANSACTION. A plpgsql function body is a single
-- transaction, so a failure anywhere leaves the board EXACTLY as it was -- the
-- reason this is not a sequence of client calls. It is SECURITY INVOKER, so RLS
-- and the PATCH-366 freeze policies judge every write it makes exactly as they
-- judge a manual edit; the explicit `board_open_for_write` check only turns a
-- frozen board into a clear message instead of a bare policy violation.
--
-- SILENT LOSS IS THE REAL DANGER, SO EACH DIRECTION VERIFIES ITSELF AT THE END.
-- Under SECURITY INVOKER an UPDATE or DELETE that a policy REFUSES affects zero
-- rows and raises nothing. Without the integrity blocks below, a refused child
-- UPDATE would still let the container be deleted -- leaving a post whose
-- `parentId` names nothing, invisible forever. The blocks RAISE, which rolls the
-- whole conversion back, so the board is never left half-converted.
--
-- SAME FAMILY IS UNCHANGED: `{columns, grid}` and `{wall, timeline}` are the two
-- families (mirrored in `lib/domain/canvas/layoutSwitchFamilies.ts`). Within one,
-- only `boards.layout` moves.
--
-- JSONB EDITS ARE IMMUTABLE-STYLE: `-` removes a key and `||` merges, so a
-- post's other metadata is never rebuilt from scratch. `metadata.sectionId` is
-- the TEXT of a BIGINT `board_sections.id` (PATCH-371), so every comparison
-- casts the id, never the string.
--
-- LEGACY BOARDS. Before PATCH-376 a board could be switched across families by
-- the old settings window, which only wrote `boards.layout` and left the other
-- family's rows behind. Three rules make the conversion safe on those:
--   * sections -> cards: root CONTAINERS that already exist are LEFT ALONE, with
--     their children. They are valid Wall/Timeline cards already. Only the
--     containers made from sections are new, and their order keys start AFTER the
--     highest order key any existing root container carries, so the existing
--     cards keep their order.
--   * cards -> sections: new section positions start AFTER the highest existing
--     section position, so existing sections keep theirs.
--   * cards -> sections: a root post that already carries a `sectionId` naming an
--     EXISTING section is LEFT ALONE -- it is already where it belongs. Only
--     posts that are in a card, or that name a section that does not exist, are
--     moved. Sections no post references are deleted afterwards, which is how a
--     leftover from the old window is cleaned up.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.board_open_for_write(uuid)` (20261014190000).

BEGIN;

CREATE OR REPLACE FUNCTION public.convert_board_layout(b uuid, target text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  current_layout text;
  from_family text;
  to_family text;
  source_order_key text;
  panel record;
  new_container_id uuid;
  new_section_id bigint;
  child_ids jsonb;
  child_id text;
  panel_index int;
  position_within int;
  moved int;
  orphans int;
  panel_count int := 0;
  post_count int := 0;
BEGIN
  IF target IS NULL OR target NOT IN ('wall', 'columns', 'grid', 'timeline') THEN
    RAISE EXCEPTION 'Unsupported target layout: %', coalesce(target, 'null')
      USING ERRCODE = '22023';
  END IF;

  SELECT layout INTO current_layout FROM public.boards WHERE id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- The freeze check is explicit so a frozen board is refused with a message,
  -- not with whichever policy happens to fire first.
  IF NOT public.board_open_for_write(b) THEN
    RAISE EXCEPTION 'This board is frozen' USING ERRCODE = '42501';
  END IF;

  from_family := CASE
    WHEN current_layout IN ('columns', 'grid') THEN 'sections'
    WHEN current_layout IN ('wall', 'timeline') THEN 'containers'
    ELSE NULL
  END;
  to_family := CASE
    WHEN target IN ('columns', 'grid') THEN 'sections'
    WHEN target IN ('wall', 'timeline') THEN 'containers'
    ELSE NULL
  END;
  IF from_family IS NULL OR to_family IS NULL THEN
    RAISE EXCEPTION 'This board cannot be converted between layouts'
      USING ERRCODE = '22023';
  END IF;

  -- Same family: the layout alone changes, exactly as before this patch.
  -- The UPDATE runs even when the layout is unchanged, so the FOUND guard below
  -- is what proves the caller may edit THIS board.
  IF from_family = to_family THEN
    UPDATE public.boards SET layout = target WHERE id = b;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('converted', false, 'panels', 0, 'posts', 0);
  END IF;

  IF from_family = 'sections' THEN
    -- ---------------------------------------------------------------- sections
    -- -> cards. Each section becomes one container, holding that section's posts
    -- in their own order. Existing root containers are left alone (LEGACY BOARDS
    -- above), so the new ones start after the highest order key in use.
    source_order_key := CASE WHEN target = 'timeline' THEN 'position_in_timeline' ELSE 'wallPosition' END;

    SELECT COALESCE(MAX(
             CASE WHEN p.metadata->>source_order_key ~ '^-?[0-9]+$'
                  THEN (p.metadata->>source_order_key)::int END), -1) + 1
      INTO panel_index
      FROM public.padlets p
     WHERE coalesce(p.board_id, p.canvas_id) = b
       AND p.type = 'container'
       AND p.metadata->>'parentId' IS NULL;

    FOR panel IN
      SELECT id, title, description
        FROM public.board_sections
       WHERE board_id = b
       ORDER BY position, created_at
    LOOP
      new_container_id := gen_random_uuid();

      SELECT COALESCE(jsonb_agg(ordered.id::text), '[]'::jsonb)
        INTO child_ids
        FROM (
          SELECT p.id
            FROM public.padlets p
           WHERE coalesce(p.board_id, p.canvas_id) = b
             AND p.metadata->>'sectionId' = panel.id::text
             AND p.metadata->>'parentId' IS NULL
           ORDER BY COALESCE(
             CASE WHEN p.metadata->>'sectionPosition' ~ '^-?[0-9]+$'
                  THEN (p.metadata->>'sectionPosition')::int END, 0),
             p.created_at
        ) ordered;

      INSERT INTO public.padlets
        (id, board_id, title, content, type, position_x, position_y, width, height, metadata, created_at, updated_at)
      VALUES (
        new_container_id, b, COALESCE(NULLIF(panel.title, ''), 'Untitled'), '', 'container', 0, 0, 280, 200,
        jsonb_build_object('kind', 'container', 'isContainer', true, 'childPadletIds', child_ids)
          || jsonb_build_object(source_order_key, panel_index)
          || CASE
               WHEN target = 'timeline' AND COALESCE(panel.description, '') <> ''
                 THEN jsonb_build_object('timelineLabel', panel.description)
               ELSE '{}'::jsonb
             END,
        now(), now()
      );

      UPDATE public.padlets p
         SET metadata = (COALESCE(p.metadata, '{}'::jsonb) - 'sectionId' - 'sectionPosition')
                        || jsonb_build_object('parentId', new_container_id::text),
             updated_at = now()
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.metadata->>'sectionId' = panel.id::text
         AND p.metadata->>'parentId' IS NULL;
      GET DIAGNOSTICS moved = ROW_COUNT;

      post_count := post_count + moved;
      panel_count := panel_count + 1;
      panel_index := panel_index + 1;
    END LOOP;

    -- Everything still loose at the root of a Columns/Grid board has to land in a
    -- card, or a Wall/Timeline board would render it nowhere: a post whose
    -- sectionId matches NO section (a dangling reference), AND a post with no
    -- sectionId at all. Only made when there are any.
    SELECT count(*) INTO orphans
      FROM public.padlets p
     WHERE coalesce(p.board_id, p.canvas_id) = b
       AND p.type <> 'container'
       AND p.metadata->>'parentId' IS NULL;

    IF orphans > 0 THEN
      new_container_id := gen_random_uuid();

      SELECT COALESCE(jsonb_agg(ordered.id::text), '[]'::jsonb)
        INTO child_ids
        FROM (
          SELECT p.id
            FROM public.padlets p
           WHERE coalesce(p.board_id, p.canvas_id) = b
             AND p.type <> 'container'
             AND p.metadata->>'parentId' IS NULL
           ORDER BY p.created_at
        ) ordered;

      INSERT INTO public.padlets
        (id, board_id, title, content, type, position_x, position_y, width, height, metadata, created_at, updated_at)
      VALUES (
        new_container_id, b, 'Unsorted', '', 'container', 0, 0, 280, 200,
        jsonb_build_object('kind', 'container', 'isContainer', true, 'childPadletIds', child_ids)
          || jsonb_build_object(source_order_key, panel_index),
        now(), now()
      );

      UPDATE public.padlets p
         SET metadata = (COALESCE(p.metadata, '{}'::jsonb) - 'sectionId' - 'sectionPosition')
                        || jsonb_build_object('parentId', new_container_id::text),
             updated_at = now()
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.type <> 'container'
         AND p.metadata->>'parentId' IS NULL;
      GET DIAGNOSTICS moved = ROW_COUNT;

      post_count := post_count + moved;
      panel_count := panel_count + 1;
    END IF;

    DELETE FROM public.board_sections WHERE board_id = b;

    -- INTEGRITY (see SILENT LOSS above). Any hit rolls the whole conversion back.
    -- 1. A post left at the root of the board, where a Wall/Timeline board
    --    renders nothing: its move was refused.
    IF EXISTS (
      SELECT 1 FROM public.padlets p
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.type <> 'container'
         AND p.metadata->>'parentId' IS NULL
    ) THEN
      RAISE EXCEPTION 'Could not convert: some posts could not be moved'
        USING ERRCODE = '42501';
    END IF;

    -- 2. A section the conversion meant to remove is still there.
    IF EXISTS (SELECT 1 FROM public.board_sections s WHERE s.board_id = b) THEN
      RAISE EXCEPTION 'Could not convert: some posts could not be moved'
        USING ERRCODE = '42501';
    END IF;

    -- 3. A card names a child that did not take its parentId: the child's UPDATE
    --    was refused, and the child would render nowhere.
    IF EXISTS (
      SELECT 1
        FROM (
          SELECT c.id AS container_id,
                 CASE WHEN named.child_id ~ '^[0-9a-fA-F-]{36}$' THEN named.child_id::uuid END AS child_uuid
            FROM public.padlets c
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(c.metadata->'childPadletIds') = 'array' THEN c.metadata->'childPadletIds'
                ELSE '[]'::jsonb
              END) AS named(child_id)
           WHERE coalesce(c.board_id, c.canvas_id) = b
             AND c.type = 'container'
             AND c.metadata->>'parentId' IS NULL
        ) named_children
        JOIN public.padlets p ON p.id = named_children.child_uuid
       WHERE p.metadata->>'parentId' IS DISTINCT FROM named_children.container_id::text
    ) THEN
      RAISE EXCEPTION 'Could not convert: some posts could not be moved'
        USING ERRCODE = '42501';
    END IF;

  ELSE
    -- ---------------------------------------------------------------- cards
    -- -> sections. Each root container becomes one section, holding that card's
    -- children in the card's own order. New sections start after the highest
    -- existing position (LEGACY BOARDS above).
    SELECT COALESCE(MAX(s.position), -1) + 1 INTO panel_index
      FROM public.board_sections s
     WHERE s.board_id = b;

    FOR panel IN
      SELECT p.id, p.title, p.metadata
        FROM public.padlets p
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.type = 'container'
         AND p.metadata->>'parentId' IS NULL
       ORDER BY COALESCE(
         CASE
           WHEN p.metadata->>(CASE WHEN current_layout = 'timeline' THEN 'position_in_timeline' ELSE 'wallPosition' END)
                ~ '^-?[0-9]+$'
             THEN (p.metadata->>(CASE WHEN current_layout = 'timeline' THEN 'position_in_timeline' ELSE 'wallPosition' END))::int
         END, 0),
         p.created_at
    LOOP
      INSERT INTO public.board_sections (board_id, title, description, position)
      VALUES (
        b,
        COALESCE(NULLIF(panel.title, ''), 'Untitled'),
        CASE WHEN current_layout = 'timeline' THEN COALESCE(panel.metadata->>'timelineLabel', '') ELSE '' END,
        panel_index
      )
      RETURNING id INTO new_section_id;

      position_within := 0;
      FOR child_id IN
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(panel.metadata->'childPadletIds') = 'array' THEN panel.metadata->'childPadletIds'
            ELSE '[]'::jsonb
          END)
      LOOP
        IF child_id ~ '^[0-9a-fA-F-]{36}$' THEN
          UPDATE public.padlets p
             SET metadata = (COALESCE(p.metadata, '{}'::jsonb) - 'parentId')
                            || jsonb_build_object('sectionId', new_section_id::text, 'sectionPosition', position_within),
                 updated_at = now()
           WHERE p.id = child_id::uuid
             AND coalesce(p.board_id, p.canvas_id) = b;
          GET DIAGNOSTICS moved = ROW_COUNT;
          post_count := post_count + moved;
        END IF;
        position_within := position_within + 1;
      END LOOP;

      -- A post whose parentId names THIS container but which the card never
      -- LISTED in its childPadletIds (inconsistent older data) would be left
      -- behind when the container is deleted, and the integrity check below would
      -- then refuse the whole conversion on an otherwise fine board. Move it too,
      -- by when it was made, AFTER the listed children.
      --
      -- The listed children no longer carry a parentId (their UPDATE above
      -- removed it), so this matches exactly the ones not yet moved -- including
      -- any whose own UPDATE a policy refused, which the integrity check then
      -- catches. `position_within` has already advanced past the listed ones.
      WITH stragglers AS (
        SELECT p.id, (row_number() OVER (ORDER BY p.created_at)) - 1 AS rn
          FROM public.padlets p
         WHERE coalesce(p.board_id, p.canvas_id) = b
           AND p.metadata->>'parentId' = panel.id::text
      )
      UPDATE public.padlets p
         SET metadata = (COALESCE(p.metadata, '{}'::jsonb) - 'parentId')
                        || jsonb_build_object(
                             'sectionId', new_section_id::text,
                             'sectionPosition', position_within + stragglers.rn),
             updated_at = now()
        FROM stragglers
       WHERE p.id = stragglers.id;
      GET DIAGNOSTICS moved = ROW_COUNT;
      post_count := post_count + moved;

      panel_count := panel_count + 1;
      panel_index := panel_index + 1;
    END LOOP;

    -- The containers themselves are gone once their children have a section; the
    -- children were re-parented above, so nothing is left pointing at them.
    DELETE FROM public.padlets p
     WHERE coalesce(p.board_id, p.canvas_id) = b
       AND p.type = 'container'
       AND p.metadata->>'parentId' IS NULL;

    -- Root posts that are in no section at all -- no sectionId, or one naming a
    -- section that does not exist. A post already in an EXISTING section is left
    -- exactly where it is (LEGACY BOARDS above).
    SELECT count(*) INTO orphans
      FROM public.padlets p
     WHERE coalesce(p.board_id, p.canvas_id) = b
       AND p.type <> 'container'
       AND p.metadata->>'parentId' IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.board_sections s
          WHERE s.board_id = b AND s.id::text = p.metadata->>'sectionId'
       );

    IF orphans > 0 THEN
      INSERT INTO public.board_sections (board_id, title, description, position)
      VALUES (b, 'Unsorted', '', panel_index)
      RETURNING id INTO new_section_id;

      WITH ordered AS (
        SELECT p.id, (row_number() OVER (ORDER BY p.created_at)) - 1 AS rn
          FROM public.padlets p
         WHERE coalesce(p.board_id, p.canvas_id) = b
           AND p.type <> 'container'
           AND p.metadata->>'parentId' IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.board_sections s
              WHERE s.board_id = b AND s.id::text = p.metadata->>'sectionId'
           )
      )
      UPDATE public.padlets p
         SET metadata = (COALESCE(p.metadata, '{}'::jsonb) - 'parentId')
                        || jsonb_build_object('sectionId', new_section_id::text, 'sectionPosition', ordered.rn),
             updated_at = now()
        FROM ordered
       WHERE p.id = ordered.id;
      GET DIAGNOSTICS moved = ROW_COUNT;

      post_count := post_count + moved;
      panel_count := panel_count + 1;
    END IF;

    -- Sections nothing points at any more: a leftover from the old window, or one
    -- whose posts all moved. Runs after every post has its section, so the
    -- sections just made are referenced and stay.
    DELETE FROM public.board_sections s
     WHERE s.board_id = b
       AND NOT EXISTS (
         SELECT 1 FROM public.padlets p
          WHERE coalesce(p.board_id, p.canvas_id) = b
            AND p.metadata->>'sectionId' = s.id::text
       );

    -- INTEGRITY (see SILENT LOSS above). Any hit rolls the whole conversion back.
    -- 1. A post still parented to a container that no longer exists: the
    --    container was deleted and the child's move was refused.
    IF EXISTS (
      SELECT 1 FROM public.padlets p
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.metadata->>'parentId' IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.padlets c
            WHERE c.id::text = p.metadata->>'parentId'
              AND coalesce(c.board_id, c.canvas_id) = b
         )
    ) THEN
      RAISE EXCEPTION 'Could not convert: some posts could not be moved'
        USING ERRCODE = '42501';
    END IF;

    -- 2. A container the conversion meant to remove is still there.
    IF EXISTS (
      SELECT 1 FROM public.padlets p
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.type = 'container'
         AND p.metadata->>'parentId' IS NULL
    ) THEN
      RAISE EXCEPTION 'Could not convert: some posts could not be moved'
        USING ERRCODE = '42501';
    END IF;

    -- 3. A post that should have moved has no section that exists: its UPDATE was
    --    refused, and a Columns/Grid board would render it nowhere.
    IF EXISTS (
      SELECT 1 FROM public.padlets p
       WHERE coalesce(p.board_id, p.canvas_id) = b
         AND p.metadata->>'parentId' IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.board_sections s
            WHERE s.board_id = b AND s.id::text = p.metadata->>'sectionId'
         )
    ) THEN
      RAISE EXCEPTION 'Could not convert: some posts could not be moved'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Last, so the FOUND guard is the board's own edit authority: 0 rows means the
  -- caller may not write this board, and the whole transaction rolls back.
  UPDATE public.boards SET layout = target WHERE id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('converted', true, 'panels', panel_count, 'posts', post_count);
END;
$function$;

-- Signed-in callers only; the function itself decides whether they may edit this
-- particular board, and RLS judges every row it touches.
REVOKE ALL ON FUNCTION public.convert_board_layout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_board_layout(uuid, text) TO authenticated;

-- Self-check: the function exists, is callable by a signed-in user, and is
-- INVOKER (a DEFINER one would bypass the freeze policies it must obey).
DO $$
DECLARE
  is_definer boolean;
BEGIN
  IF to_regprocedure('public.convert_board_layout(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PATCH-377: public.convert_board_layout(uuid, text) is missing';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.convert_board_layout(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PATCH-377: authenticated cannot execute public.convert_board_layout(uuid, text)';
  END IF;

  SELECT prosecdef INTO is_definer
    FROM pg_proc
   WHERE oid = 'public.convert_board_layout(uuid,text)'::regprocedure;
  IF is_definer THEN
    RAISE EXCEPTION 'PATCH-377: convert_board_layout must be SECURITY INVOKER';
  END IF;
END $$;

COMMIT;
