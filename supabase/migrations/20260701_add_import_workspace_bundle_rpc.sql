-- 📄 supabase/migrations/20260701_add_import_workspace_bundle_rpc.sql
--
-- Atomic write step for workspace import. Replaces the app-level
-- "insert everything, delete everything on failure" compensation in
-- lib/import/restore.ts with a single Postgres function call: since one
-- RPC invocation is one transaction, any exception here rolls back every
-- insert/update from this call automatically — no partial state is ever
-- visible to other sessions.
--
-- Structural/schema/referential validation (parseExportZip) stays in app
-- code — this function only performs the write phase and re-checks
-- references defensively (raising if a lookup fails), since it must not
-- trust its caller any less than restore.ts already didn't.

CREATE OR REPLACE FUNCTION import_workspace_bundle(
    p_workspace_id uuid,
    p_user_id uuid,
    p_folders jsonb,
    p_boards jsonb,
    p_padlets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    folder_id_map jsonb := '{}'::jsonb;
    board_id_map jsonb := '{}'::jsonb;
    padlet_id_map jsonb := '{}'::jsonb;

    folder_row jsonb;
    board_row jsonb;
    padlet_row jsonb;

    new_id uuid;
    parent_local text;
    parent_new_id uuid;
    next_folder_id uuid;
    next_board_id uuid;

    ref_keys text[] := ARRAY['parentId', 'coverChildId', 'coverPadletId', 'coverChildPadletId'];
    ref_key text;
    ref_value text;
    mapped_value text;
    stripped_metadata jsonb;
    remapped_metadata jsonb;
    child_ids jsonb;
    new_child_ids jsonb;
    child_id text;

    folders_count int := 0;
    boards_count int := 0;
    padlets_count int := 0;
BEGIN
    -- Pass 1: insert folders without parent_id — a folder's parent may not
    -- have a real row yet depending on array order.
    FOR folder_row IN SELECT * FROM jsonb_array_elements(p_folders)
    LOOP
        INSERT INTO folders (name, icon, color, position, workspace_id, user_id)
        VALUES (
            folder_row->>'name',
            folder_row->>'icon',
            folder_row->>'color',
            NULLIF(folder_row->>'position', '')::numeric,
            p_workspace_id,
            p_user_id
        )
        RETURNING id INTO new_id;

        folder_id_map := jsonb_set(folder_id_map, ARRAY[folder_row->>'localId'], to_jsonb(new_id::text));
        folders_count := folders_count + 1;
    END LOOP;

    -- Pass 2: patch in parent_id now that every folder has a real row id.
    FOR folder_row IN SELECT * FROM jsonb_array_elements(p_folders)
    LOOP
        parent_local := folder_row->>'parentRef';
        IF parent_local IS NOT NULL THEN
            parent_new_id := (folder_id_map->>parent_local)::uuid;
            IF parent_new_id IS NULL THEN
                RAISE EXCEPTION 'Internal error: folder "%" references parent folder "%" which was not imported (pre-import validation should have caught this).',
                    folder_row->>'name', parent_local;
            END IF;

            UPDATE folders
            SET parent_id = parent_new_id
            WHERE id = (folder_id_map->>(folder_row->>'localId'))::uuid;
        END IF;
    END LOOP;

    -- Boards
    FOR board_row IN SELECT * FROM jsonb_array_elements(p_boards)
    LOOP
        IF board_row->>'folderRef' IS NOT NULL THEN
            next_folder_id := (folder_id_map->>(board_row->>'folderRef'))::uuid;
            IF next_folder_id IS NULL THEN
                RAISE EXCEPTION 'Internal error: board "%" references folder "%" which was not imported (pre-import validation should have caught this).',
                    board_row->>'title', board_row->>'folderRef';
            END IF;
        ELSE
            next_folder_id := NULL;
        END IF;

        INSERT INTO boards (
            title, description, layout, background, background_type, background_value,
            container_size, comments_enabled, reactions_enabled, folder_id, workspace_id, user_id
        )
        VALUES (
            board_row->>'title',
            board_row->>'description',
            board_row->>'layout',
            board_row->'background',
            board_row->>'backgroundType',
            board_row->>'backgroundValue',
            board_row->>'containerSize',
            (board_row->>'commentsEnabled')::boolean,
            (board_row->>'reactionsEnabled')::boolean,
            next_folder_id,
            p_workspace_id,
            p_user_id
        )
        RETURNING id INTO new_id;

        board_id_map := jsonb_set(board_id_map, ARRAY[board_row->>'localId'], to_jsonb(new_id::text));
        boards_count := boards_count + 1;
    END LOOP;

    -- Padlets pass 1: insert with relational metadata (parentId/childPadletIds/
    -- cover*) stripped — those refs aren't resolvable until every padlet has a
    -- real row id.
    FOR padlet_row IN SELECT * FROM jsonb_array_elements(p_padlets)
    LOOP
        next_board_id := (board_id_map->>(padlet_row->>'boardRef'))::uuid;
        IF next_board_id IS NULL THEN
            RAISE EXCEPTION 'Internal error: padlet "%" references board "%" which was not imported (pre-import validation should have caught this).',
                padlet_row->>'title', padlet_row->>'boardRef';
        END IF;

        stripped_metadata := padlet_row->'metadata';
        FOREACH ref_key IN ARRAY ref_keys LOOP
            stripped_metadata := stripped_metadata - ref_key;
        END LOOP;
        stripped_metadata := stripped_metadata - 'childPadletIds';

        INSERT INTO padlets (
            board_id, title, content, color, type, position_x, position_y, width, height,
            file_url, file_name, file_type, file_size,
            location_lng, location_lat, location_label, location_mapbox_id, location_precision,
            metadata
        )
        VALUES (
            next_board_id,
            padlet_row->>'title',
            padlet_row->>'content',
            padlet_row->>'color',
            padlet_row->>'type',
            (padlet_row->>'positionX')::numeric,
            (padlet_row->>'positionY')::numeric,
            NULLIF(padlet_row->>'width', '')::numeric,
            NULLIF(padlet_row->>'height', '')::numeric,
            padlet_row->>'fileUrl',
            padlet_row->>'fileName',
            padlet_row->>'fileType',
            NULLIF(padlet_row->>'fileSize', '')::numeric,
            NULLIF(padlet_row->>'locationLng', '')::numeric,
            NULLIF(padlet_row->>'locationLat', '')::numeric,
            padlet_row->>'locationLabel',
            padlet_row->>'locationMapboxId',
            padlet_row->>'locationPrecision',
            stripped_metadata
        )
        RETURNING id INTO new_id;

        padlet_id_map := jsonb_set(padlet_id_map, ARRAY[padlet_row->>'localId'], to_jsonb(new_id::text));
        padlets_count := padlets_count + 1;
    END LOOP;

    -- Padlets pass 2: patch in remapped container hierarchy now that every
    -- padlet has a real row id. Only writes when the padlet actually had a
    -- relational ref (mirrors lib/import/restore.ts's write-skip for the common no-ref case).
    FOR padlet_row IN SELECT * FROM jsonb_array_elements(p_padlets)
    LOOP
        remapped_metadata := padlet_row->'metadata';
        FOREACH ref_key IN ARRAY ref_keys LOOP
            remapped_metadata := remapped_metadata - ref_key;
        END LOOP;
        remapped_metadata := remapped_metadata - 'childPadletIds';

        FOREACH ref_key IN ARRAY ref_keys LOOP
            ref_value := padlet_row->'metadata'->>ref_key;
            IF ref_value IS NOT NULL THEN
                mapped_value := padlet_id_map->>ref_value;
                IF mapped_value IS NOT NULL THEN
                    remapped_metadata := jsonb_set(remapped_metadata, ARRAY[ref_key], to_jsonb(mapped_value));
                END IF;
            END IF;
        END LOOP;

        child_ids := padlet_row->'metadata'->'childPadletIds';
        IF jsonb_typeof(child_ids) = 'array' THEN
            new_child_ids := '[]'::jsonb;
            FOR child_id IN SELECT jsonb_array_elements_text(child_ids)
            LOOP
                mapped_value := padlet_id_map->>child_id;
                IF mapped_value IS NOT NULL THEN
                    new_child_ids := new_child_ids || to_jsonb(mapped_value);
                END IF;
            END LOOP;
            IF jsonb_array_length(new_child_ids) > 0 THEN
                remapped_metadata := jsonb_set(remapped_metadata, ARRAY['childPadletIds'], new_child_ids);
            END IF;
        END IF;

        IF remapped_metadata IS DISTINCT FROM (padlet_row->'metadata') THEN
            UPDATE padlets
            SET metadata = remapped_metadata
            WHERE id = (padlet_id_map->>(padlet_row->>'localId'))::uuid;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'foldersImported', folders_count,
        'boardsImported', boards_count,
        'padletsImported', padlets_count
    );
END;
$$;

COMMENT ON FUNCTION import_workspace_bundle IS
    'Atomic write step for workspace import (see lib/import/restore.ts). Runs as SECURITY INVOKER so table RLS/INSERT policies still apply to the calling user.';
