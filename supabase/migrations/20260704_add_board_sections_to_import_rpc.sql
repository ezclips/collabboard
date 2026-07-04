-- 📄 supabase/migrations/20260704_add_board_sections_to_import_rpc.sql
--
-- Adds board_sections (Columns-layout column titles/order) to
-- import_workspace_bundle, which previously imported folders/boards/padlets
-- only. board_sections rows were never part of the bundle, and padlet
-- metadata.sectionId (a string mirroring board_sections.id, a numeric
-- column) passed through unremapped — so importing a Columns-layout board
-- silently dropped its section structure and left padlets pointing at
-- source-workspace section ids that don't exist in the target workspace.
--
-- p_board_sections is added as a new trailing parameter with a default so
-- this remains a valid CREATE OR REPLACE of the existing function signature
-- (Postgres allows adding parameters via OR REPLACE only when they have
-- defaults) — any caller that hasn't been updated to pass it yet still works,
-- importing zero sections.
--
-- Sections are inserted as their own single pass (like boards: no
-- self-references) positioned after boards and before padlets, since
-- padlet.metadata.sectionId needs a real board_sections.id to remap to.
-- sectionId is remapped against section_id_map — a distinct map from
-- padlet_id_map, since section ids and padlet ids are different source-id
-- namespaces (board_sections.id is numeric; padlets.id is uuid).
--
-- IMPORTANT: Postgres's CREATE OR REPLACE FUNCTION does NOT replace a
-- function when the parameter list changes (even by only adding a trailing
-- parameter with a default) — it silently creates a second overload instead,
-- leaving the old 5-parameter signature in place alongside the new
-- 6-parameter one. The old overload must be dropped explicitly first so only
-- one definition of import_workspace_bundle ever exists.
DROP FUNCTION IF EXISTS import_workspace_bundle(uuid, uuid, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION import_workspace_bundle(
    p_workspace_id uuid,
    p_user_id uuid,
    p_folders jsonb,
    p_boards jsonb,
    p_padlets jsonb,
    p_board_sections jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    folder_id_map jsonb := '{}'::jsonb;
    board_id_map jsonb := '{}'::jsonb;
    padlet_id_map jsonb := '{}'::jsonb;
    section_id_map jsonb := '{}'::jsonb;

    folder_row jsonb;
    board_row jsonb;
    padlet_row jsonb;
    section_row jsonb;

    new_id uuid;
    parent_local text;
    parent_new_id uuid;
    next_folder_id uuid;
    next_board_id uuid;
    section_board_id uuid;
    next_section_id bigint;

    ref_keys text[] := ARRAY['parentId', 'coverChildId', 'coverPadletId', 'coverChildPadletId'];
    ref_key text;
    ref_value text;
    mapped_value text;
    stripped_metadata jsonb;
    remapped_metadata jsonb;
    child_ids jsonb;
    new_child_ids jsonb;
    child_id text;
    section_local text;

    folders_count int := 0;
    boards_count int := 0;
    padlets_count int := 0;
    sections_count int := 0;
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

    -- Board sections: single pass, no self-references (mirrors boards).
    -- Must run before padlets so metadata.sectionId has something to remap to.
    FOR section_row IN SELECT * FROM jsonb_array_elements(p_board_sections)
    LOOP
        section_board_id := (board_id_map->>(section_row->>'boardRef'))::uuid;
        IF section_board_id IS NULL THEN
            RAISE EXCEPTION 'Internal error: section "%" references board "%" which was not imported (pre-import validation should have caught this).',
                section_row->>'title', section_row->>'boardRef';
        END IF;

        INSERT INTO board_sections (board_id, title, description, position)
        VALUES (
            section_board_id,
            section_row->>'title',
            section_row->>'description',
            NULLIF(section_row->>'position', '')::numeric
        )
        RETURNING id INTO next_section_id;

        section_id_map := jsonb_set(section_id_map, ARRAY[section_row->>'localId'], to_jsonb(next_section_id::text));
        sections_count := sections_count + 1;
    END LOOP;

    -- Padlets pass 1: insert with relational metadata (parentId/childPadletIds/
    -- cover*/sectionId) stripped — those refs aren't resolvable until every
    -- padlet (and section) has a real row id.
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
        stripped_metadata := stripped_metadata - 'sectionId';

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

    -- Padlets pass 2: patch in remapped container hierarchy and section ref
    -- now that every padlet and section has a real row id. Only writes when
    -- the padlet actually had a relational ref (mirrors lib/import/restore.ts's
    -- write-skip for the common no-ref case).
    FOR padlet_row IN SELECT * FROM jsonb_array_elements(p_padlets)
    LOOP
        remapped_metadata := padlet_row->'metadata';
        FOREACH ref_key IN ARRAY ref_keys LOOP
            remapped_metadata := remapped_metadata - ref_key;
        END LOOP;
        remapped_metadata := remapped_metadata - 'childPadletIds';
        remapped_metadata := remapped_metadata - 'sectionId';

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

        section_local := padlet_row->'metadata'->>'sectionId';
        IF section_local IS NOT NULL THEN
            mapped_value := section_id_map->>section_local;
            IF mapped_value IS NOT NULL THEN
                remapped_metadata := jsonb_set(remapped_metadata, ARRAY['sectionId'], to_jsonb(mapped_value));
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
        'padletsImported', padlets_count,
        'boardSectionsImported', sections_count
    );
END;
$$;

COMMENT ON FUNCTION import_workspace_bundle(uuid, uuid, jsonb, jsonb, jsonb, jsonb) IS
    'Atomic write step for workspace import (see lib/import/restore.ts). Runs as SECURITY INVOKER so table RLS/INSERT policies still apply to the calling user.';
