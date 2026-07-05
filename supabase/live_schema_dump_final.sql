

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."billing_plan" AS ENUM (
    'free',
    'pro'
);


ALTER TYPE "public"."billing_plan" OWNER TO "postgres";


CREATE TYPE "public"."board_permission_level" AS ENUM (
    'reader',
    'commenter',
    'editor',
    'moderator',
    'admin'
);


ALTER TYPE "public"."board_permission_level" OWNER TO "postgres";


CREATE TYPE "public"."canvas_status" AS ENUM (
    'draft',
    'active',
    'archived',
    'public'
);


ALTER TYPE "public"."canvas_status" OWNER TO "postgres";


CREATE TYPE "public"."item_type" AS ENUM (
    'text',
    'image',
    'sticky_note',
    'shape',
    'line',
    'arrow'
);


ALTER TYPE "public"."item_type" OWNER TO "postgres";


CREATE TYPE "public"."permission_level" AS ENUM (
    'view',
    'comment',
    'edit',
    'admin'
);


ALTER TYPE "public"."permission_level" OWNER TO "postgres";


CREATE TYPE "public"."section_type" AS ENUM (
    'freeform',
    'grid',
    'list'
);


ALTER TYPE "public"."section_type" OWNER TO "postgres";


CREATE TYPE "public"."subscription_status" AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired'
);


ALTER TYPE "public"."subscription_status" OWNER TO "postgres";


CREATE TYPE "public"."workspace_role" AS ENUM (
    'owner',
    'admin',
    'member',
    'readonly'
);


ALTER TYPE "public"."workspace_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."board_permission_rank"("permission" "public"."board_permission_level") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT CASE permission
        WHEN 'reader'::board_permission_level THEN 1
        WHEN 'commenter'::board_permission_level THEN 2
        WHEN 'editor'::board_permission_level THEN 3
        WHEN 'moderator'::board_permission_level THEN 4
        WHEN 'admin'::board_permission_level THEN 5
        ELSE 0
    END;
$$;


ALTER FUNCTION "public"."board_permission_rank"("permission" "public"."board_permission_level") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."board_permission_to_legacy"("permission" "public"."board_permission_level") RETURNS "public"."permission_level"
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT CASE permission
        WHEN 'reader'::board_permission_level THEN 'view'::permission_level
        WHEN 'commenter'::board_permission_level THEN 'comment'::permission_level
        WHEN 'editor'::board_permission_level THEN 'edit'::permission_level
        WHEN 'moderator'::board_permission_level THEN 'admin'::permission_level
        WHEN 'admin'::board_permission_level THEN 'admin'::permission_level
    END;
$$;


ALTER FUNCTION "public"."board_permission_to_legacy"("permission" "public"."board_permission_level") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_board"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM boards
        WHERE boards.id = board_uuid
          AND (
              boards.user_id = user_uuid
              OR (
                  boards.workspace_id IS NOT NULL
                  AND has_workspace_access(boards.workspace_id, user_uuid)
              )
          )
    );
$$;


ALTER FUNCTION "public"."can_access_board"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_comment_board"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT board_permission_rank(get_board_permission(board_uuid, user_uuid))
        >= board_permission_rank('commenter'::board_permission_level);
$$;


ALTER FUNCTION "public"."can_comment_board"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_board"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT board_permission_rank(get_board_permission(board_uuid, user_uuid))
        >= board_permission_rank('editor'::board_permission_level);
$$;


ALTER FUNCTION "public"."can_edit_board"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT get_workspace_role(workspace_uuid, user_uuid) IN (
        'owner'::workspace_role,
        'admin'::workspace_role,
        'member'::workspace_role
    );
$$;


ALTER FUNCTION "public"."can_edit_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_board"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT board_permission_rank(get_board_permission(board_uuid, user_uuid))
        >= board_permission_rank('admin'::board_permission_level);
$$;


ALTER FUNCTION "public"."can_manage_board"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT get_workspace_role(workspace_uuid, user_uuid) IN ('owner'::workspace_role, 'admin'::workspace_role);
$$;


ALTER FUNCTION "public"."can_manage_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_board"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT get_board_permission(board_uuid, user_uuid) IS NOT NULL;
$$;


ALTER FUNCTION "public"."can_read_board"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_canvas_permission"("canvas_uuid" "uuid", "user_uuid" "uuid", "required_permission" "text" DEFAULT 'view'::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    resolved_permission board_permission_level;
    required_board_permission board_permission_level;
BEGIN
    resolved_permission := get_board_permission(canvas_uuid, user_uuid);
    required_board_permission := normalize_required_board_permission(required_permission);

    IF resolved_permission IS NULL THEN
        RETURN false;
    END IF;

    RETURN board_permission_rank(resolved_permission) >= board_permission_rank(required_board_permission);
END;
$$;


ALTER FUNCTION "public"."check_canvas_permission"("canvas_uuid" "uuid", "user_uuid" "uuid", "required_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_canvas_permission"("canvas_id" "uuid", "user_id" "uuid", "required_permission" "public"."permission_level" DEFAULT 'view'::"public"."permission_level") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_permission permission_level;
  is_owner BOOLEAN;
  canvas_status canvas_status;
BEGIN
  -- Get canvas owner and status
  SELECT owner_id = user_id, status 
  INTO is_owner, canvas_status
  FROM public.canvases 
  WHERE id = canvas_id;
  
  -- If user is owner, they have admin permission
  IF is_owner THEN
    RETURN TRUE;
  END IF;
  
  -- If canvas is public and only view permission is required
  IF canvas_status = 'public' AND required_permission = 'view' THEN
    RETURN TRUE;
  END IF;
  
  -- Check collaborator permission
  SELECT permission_level 
  INTO user_permission
  FROM public.canvas_collaborators 
  WHERE canvas_id = canvas_id AND user_id = user_id;
  
  -- If no permission found, return false
  IF user_permission IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check permission hierarchy
  RETURN CASE 
    WHEN required_permission = 'view' THEN TRUE
    WHEN required_permission = 'comment' THEN user_permission IN ('comment', 'edit', 'admin')
    WHEN required_permission = 'edit' THEN user_permission IN ('edit', 'admin')
    WHEN required_permission = 'admin' THEN user_permission = 'admin'
    ELSE FALSE
  END;
END;
$$;


ALTER FUNCTION "public"."check_canvas_permission"("canvas_id" "uuid", "user_id" "uuid", "required_permission" "public"."permission_level") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."padlets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid",
    "title" "text",
    "content" "text",
    "color" "text",
    "position_x" integer,
    "position_y" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "top" numeric,
    "left" numeric,
    "width" numeric,
    "height" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "file_url" "text",
    "file_name" "text",
    "file_type" "text",
    "file_size" bigint,
    "type" character varying(50) DEFAULT 'text'::character varying,
    "metadata" "jsonb",
    "board_id" "uuid",
    "location_lng" double precision,
    "location_lat" double precision,
    "location_label" "text",
    "location_mapbox_id" "text",
    "location_precision" "text",
    "location_geog" "public"."geography"(Point,4326) GENERATED ALWAYS AS (
CASE
    WHEN (("location_lng" IS NOT NULL) AND ("location_lat" IS NOT NULL)) THEN ("public"."st_setsrid"("public"."st_makepoint"("location_lng", "location_lat"), 4326))::"public"."geography"
    ELSE NULL::"public"."geography"
END) STORED,
    CONSTRAINT "padlets_location_lat_range_check" CHECK ((("location_lat" IS NULL) OR (("location_lat" >= ('-90'::integer)::double precision) AND ("location_lat" <= (90)::double precision)))),
    CONSTRAINT "padlets_location_lng_range_check" CHECK ((("location_lng" IS NULL) OR (("location_lng" >= ('-180'::integer)::double precision) AND ("location_lng" <= (180)::double precision)))),
    CONSTRAINT "padlets_location_precision_check" CHECK ((("location_precision" IS NULL) OR ("location_precision" = ANY (ARRAY['address'::"text", 'poi'::"text", 'place'::"text", 'region'::"text", 'manual'::"text"]))))
);


ALTER TABLE "public"."padlets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_board_map_padlets_bbox"("p_board_id" "uuid", "p_west" double precision, "p_south" double precision, "p_east" double precision, "p_north" double precision) RETURNS SETOF "public"."padlets"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT p.*
  FROM public.padlets p
  WHERE p.board_id = p_board_id
    AND p.location_geog IS NOT NULL
    AND (
      (p_west <= p_east AND ST_Intersects(
        p.location_geog::geometry,
        ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
      ))
      OR
      (p_west > p_east AND (
        ST_Intersects(
          p.location_geog::geometry,
          ST_MakeEnvelope(p_west, p_south, 180, p_north, 4326)
        )
        OR
        ST_Intersects(
          p.location_geog::geometry,
          ST_MakeEnvelope(-180, p_south, p_east, p_north, 4326)
        )
      ))
    );
$$;


ALTER FUNCTION "public"."get_board_map_padlets_bbox"("p_board_id" "uuid", "p_west" double precision, "p_south" double precision, "p_east" double precision, "p_north" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_board_members_with_profile"("board_id" "uuid") RETURNS TABLE("id" "uuid", "canvas_id" "uuid", "user_id" "uuid", "role" "text", "permission_level" "text", "sort_by" "text", "sort_order" "text", "group_by" "text", "date_format" "text", "created_at" timestamp with time zone, "email" "text", "display_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
    SELECT
        m.id,
        m.canvas_id,
        m.user_id,
        m.role,
        m.permission_level,
        m.sort_by,
        m.sort_order,
        m.group_by,
        m.date_format,
        m.created_at,
        u.email,
        COALESCE(
            u.raw_user_meta_data->>'name',
            u.raw_user_meta_data->>'full_name',
            u.email
        ) AS display_name,
        u.raw_user_meta_data->>'avatar_url' AS avatar_url
    FROM kanban_board_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.canvas_id = board_id
      AND (
          EXISTS (
              SELECT 1
              FROM boards b
              WHERE b.id = board_id
                AND b.user_id = auth.uid()
          )
          OR EXISTS (
              SELECT 1
              FROM kanban_board_members viewer
              WHERE viewer.canvas_id = board_id
                AND viewer.user_id = auth.uid()
          )
      );
$$;


ALTER FUNCTION "public"."get_board_members_with_profile"("board_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_board_permission"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS "public"."board_permission_level"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    canvas_record RECORD;
    workspace_role workspace_role;
    collaborator_permission board_permission_level;
    visitor_permission_text text;
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id, owner_id, workspace_id, is_public, settings
    INTO canvas_record
    FROM canvases
    WHERE id = board_uuid;

    IF canvas_record IS NULL THEN
        RETURN NULL;
    END IF;

    IF canvas_record.owner_id = user_uuid THEN
        RETURN 'admin'::board_permission_level;
    END IF;

    IF canvas_record.workspace_id IS NOT NULL THEN
        workspace_role := get_workspace_role(canvas_record.workspace_id, user_uuid);
        IF workspace_role IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
            RETURN 'admin'::board_permission_level;
        END IF;
    END IF;

    SELECT COALESCE(
        board_permission,
        legacy_permission_to_board(permission_level)
    )
    INTO collaborator_permission
    FROM canvas_collaborators
    WHERE canvas_id = board_uuid
      AND user_id = user_uuid
      AND accepted_at IS NOT NULL
    ORDER BY invited_at DESC
    LIMIT 1;

    IF collaborator_permission IS NOT NULL THEN
        RETURN collaborator_permission;
    END IF;

    IF canvas_record.is_public THEN
        visitor_permission_text := lower(
            COALESCE(canvas_record.settings -> 'accessPolicy' ->> 'visitorPermission', 'reader')
        );

        RETURN CASE visitor_permission_text
            WHEN 'no_access' THEN NULL
            WHEN 'reader' THEN 'reader'::board_permission_level
            WHEN 'commenter' THEN 'commenter'::board_permission_level
            WHEN 'editor' THEN 'editor'::board_permission_level
            WHEN 'moderator' THEN 'moderator'::board_permission_level
            WHEN 'admin' THEN 'admin'::board_permission_level
            ELSE 'reader'::board_permission_level
        END;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_board_permission"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_canvas_with_permission"("canvas_uuid" "uuid", "user_uuid" "uuid") RETURNS TABLE("canvas_data" "jsonb", "user_permission" "text", "board_permission" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    canvas_record RECORD;
    resolved_permission board_permission_level;
BEGIN
    SELECT *
    INTO canvas_record
    FROM canvases
    WHERE id = canvas_uuid;

    IF canvas_record IS NULL THEN
        RETURN;
    END IF;

    resolved_permission := get_board_permission(canvas_uuid, user_uuid);

    IF resolved_permission IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        row_to_json(canvas_record)::jsonb,
        board_permission_to_legacy(resolved_permission)::text,
        resolved_permission::text;
END;
$$;


ALTER FUNCTION "public"."get_canvas_with_permission"("canvas_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_role"("workspace_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS "public"."workspace_role"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    resolved_role workspace_role;
    jwt_email text;
BEGIN
    jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));

    SELECT CASE
        WHEN workspaces.owner_user_id = user_uuid THEN 'owner'::workspace_role
        ELSE (
            SELECT normalize_workspace_role(workspace_members.role)
            FROM workspace_members
            WHERE workspace_members.workspace_id = workspace_uuid
              AND workspace_members.status = 'active'
              AND (
                workspace_members.member_user_id = user_uuid
                OR (
                    workspace_members.member_user_id IS NULL
                    AND workspace_members.member_email IS NOT NULL
                    AND lower(workspace_members.member_email) = jwt_email
                )
              )
            ORDER BY workspace_members.created_at ASC
            LIMIT 1
        )
    END
    INTO resolved_role
    FROM workspaces
    WHERE workspaces.id = workspace_uuid;

    RETURN resolved_role;
END;
$$;


ALTER FUNCTION "public"."get_workspace_role"("workspace_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_canvas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.canvas_users (canvas_id, user_id, role, permissions, joined_at)
    VALUES (NEW.id, NEW.owner_id, 'owner', '["read", "write", "comment", "manage_users", "delete"]', NOW())
    ON CONFLICT (canvas_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_canvas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_workspace_access"("workspace_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT get_workspace_role(workspace_uuid, user_uuid) IS NOT NULL;
$$;


ALTER FUNCTION "public"."has_workspace_access"("workspace_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_workspace_bundle"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_folders" "jsonb", "p_boards" "jsonb", "p_padlets" "jsonb", "p_board_sections" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."import_workspace_bundle"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_folders" "jsonb", "p_boards" "jsonb", "p_padlets" "jsonb", "p_board_sections" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."import_workspace_bundle"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_folders" "jsonb", "p_boards" "jsonb", "p_padlets" "jsonb", "p_board_sections" "jsonb") IS 'Atomic write step for workspace import (see lib/import/restore.ts). Runs as SECURITY INVOKER so table RLS/INSERT policies still apply to the calling user.';



CREATE OR REPLACE FUNCTION "public"."is_board_member"("board_uuid" "uuid", "user_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_collaborators
    WHERE board_id = board_uuid
      AND user_id = user_uuid
  );
$$;


ALTER FUNCTION "public"."is_board_member"("board_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_canvas_admin"("canvas_uuid" "uuid", "user_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM canvas_collaborators
    WHERE canvas_id = canvas_uuid
      AND user_id = user_uuid
      AND board_permission = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_canvas_admin"("canvas_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM platform_admins
        WHERE user_id = user_uuid
    );
$$;


ALTER FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."legacy_permission_to_board"("permission" "public"."permission_level") RETURNS "public"."board_permission_level"
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT CASE permission
        WHEN 'view'::permission_level THEN 'reader'::board_permission_level
        WHEN 'comment'::permission_level THEN 'commenter'::board_permission_level
        WHEN 'edit'::permission_level THEN 'editor'::board_permission_level
        WHEN 'admin'::permission_level THEN 'admin'::board_permission_level
    END;
$$;


ALTER FUNCTION "public"."legacy_permission_to_board"("permission" "public"."permission_level") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_canvas_activity"("canvas_id" "uuid", "user_id" "uuid", "action" "text", "details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO public.canvas_activity (canvas_id, user_id, action, details)
  VALUES (canvas_id, user_id, action, details)
  RETURNING id INTO activity_id;
  
  RETURN activity_id;
END;
$$;


ALTER FUNCTION "public"."log_canvas_activity"("canvas_id" "uuid", "user_id" "uuid", "action" "text", "details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_required_board_permission"("required_permission" "text") RETURNS "public"."board_permission_level"
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT CASE lower(coalesce(required_permission, 'reader'))
        WHEN 'view' THEN 'reader'::board_permission_level
        WHEN 'reader' THEN 'reader'::board_permission_level
        WHEN 'comment' THEN 'commenter'::board_permission_level
        WHEN 'commenter' THEN 'commenter'::board_permission_level
        WHEN 'edit' THEN 'editor'::board_permission_level
        WHEN 'editor' THEN 'editor'::board_permission_level
        WHEN 'moderate' THEN 'moderator'::board_permission_level
        WHEN 'moderator' THEN 'moderator'::board_permission_level
        WHEN 'admin' THEN 'admin'::board_permission_level
        ELSE 'reader'::board_permission_level
    END;
$$;


ALTER FUNCTION "public"."normalize_required_board_permission"("required_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_workspace_role"("role_text" "text") RETURNS "public"."workspace_role"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    RETURN CASE COALESCE(role_text, 'member')
        WHEN 'owner' THEN 'owner'::workspace_role
        WHEN 'admin' THEN 'admin'::workspace_role
        WHEN 'member' THEN 'member'::workspace_role
        WHEN 'viewer' THEN 'readonly'::workspace_role
        WHEN 'readonly' THEN 'readonly'::workspace_role
        ELSE 'member'::workspace_role
    END;
END;
$$;


ALTER FUNCTION "public"."normalize_workspace_role"("role_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_canvas_collaborator_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.board_permission IS NULL AND NEW.permission_level IS NOT NULL THEN
            NEW.board_permission := legacy_permission_to_board(NEW.permission_level);
        ELSIF NEW.permission_level IS NULL AND NEW.board_permission IS NOT NULL THEN
            NEW.permission_level := board_permission_to_legacy(NEW.board_permission);
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.board_permission IS NULL AND NEW.permission_level IS NOT NULL THEN
        NEW.board_permission := legacy_permission_to_board(NEW.permission_level);
    ELSIF NEW.permission_level IS NULL AND NEW.board_permission IS NOT NULL THEN
        NEW.permission_level := board_permission_to_legacy(NEW.board_permission);
    ELSIF NEW.board_permission IS DISTINCT FROM OLD.board_permission THEN
        NEW.permission_level := board_permission_to_legacy(NEW.board_permission);
    ELSIF NEW.permission_level IS DISTINCT FROM OLD.permission_level THEN
        NEW.board_permission := legacy_permission_to_board(NEW.permission_level);
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_canvas_collaborator_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_billing_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_billing_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_freeform_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_freeform_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accessibility_settings" (
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."accessibility_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_deletions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "reason" "text",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text",
    "completed_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."account_deletions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false,
    "provider" "text" DEFAULT 'openai'::"text",
    "api_key_encrypted" "text",
    "feature_text_generation" boolean DEFAULT true,
    "feature_image_generation" boolean DEFAULT true,
    "feature_summarization" boolean DEFAULT true,
    "feature_translation" boolean DEFAULT true,
    "usage_limit" integer DEFAULT 1000,
    "current_usage" integer DEFAULT 0,
    "usage_reset_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "ai_settings_provider_check" CHECK (("provider" = ANY (ARRAY['openai'::"text", 'anthropic'::"text", 'google'::"text"])))
);


ALTER TABLE "public"."ai_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_rate_limit_events" (
    "id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "email_hash" "text" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "success" boolean DEFAULT false NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "auth_rate_limit_events_action_check" CHECK (("action" = ANY (ARRAY['login'::"text", 'password_reset'::"text"])))
);


ALTER TABLE "public"."auth_rate_limit_events" OWNER TO "postgres";


ALTER TABLE "public"."auth_rate_limit_events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."auth_rate_limit_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."billing_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plan_name" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "invoice_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."billing_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_collaborators" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text",
    "added_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "board_id" "uuid",
    CONSTRAINT "board_collaborators_role_check" CHECK (("role" = ANY (ARRAY['editor'::"text", 'viewer'::"text", 'commenter'::"text"])))
);


ALTER TABLE "public"."board_collaborators" OWNER TO "postgres";


ALTER TABLE "public"."board_collaborators" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."board_collaborators_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_map_settings" (
    "board_id" "uuid" NOT NULL,
    "map_style_id" "text" DEFAULT 'mapbox://styles/mapbox/streets-v12'::"text" NOT NULL,
    "cluster_enabled" boolean DEFAULT true NOT NULL,
    "cluster_radius" integer DEFAULT 50 NOT NULL,
    "cluster_max_zoom" integer DEFAULT 14 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "board_map_settings_cluster_max_zoom_check" CHECK ((("cluster_max_zoom" >= 0) AND ("cluster_max_zoom" <= 24))),
    CONSTRAINT "board_map_settings_cluster_radius_check" CHECK ((("cluster_radius" >= 1) AND ("cluster_radius" <= 200)))
);


ALTER TABLE "public"."board_map_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_sections" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "board_id" "uuid"
);


ALTER TABLE "public"."board_sections" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."board_sections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."board_sections_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."board_sections_id_seq" OWNED BY "public"."board_sections"."id";



CREATE TABLE IF NOT EXISTS "public"."boards" (
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "layout" "text" DEFAULT 'wall'::"text",
    "background" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "sort_order" "text" DEFAULT 'drag'::"text",
    "background_type" "text" DEFAULT 'color'::"text",
    "background_value" "text",
    "comments_enabled" boolean DEFAULT true,
    "reactions_enabled" boolean DEFAULT false,
    "thumbnail" "text",
    "bookmarked" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "thumbnail_url" "text",
    "last_visited_at" timestamp with time zone,
    "is_favorite" boolean DEFAULT false,
    "folder_id" "uuid",
    "deleted_at" timestamp with time zone,
    "container_size" "text" DEFAULT 'medium'::"text",
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid",
    CONSTRAINT "boards_container_size_check" CHECK (("container_size" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text"]))),
    CONSTRAINT "boards_layout_check" CHECK ((("layout" IS NULL) OR ("layout" = ANY (ARRAY['grid'::"text", 'stream'::"text", 'table'::"text", 'wall'::"text", 'kanban'::"text", 'drawing'::"text", 'map'::"text", 'columns'::"text", 'gantt'::"text", 'freeform'::"text", 'scheduler'::"text", 'timeline'::"text"]))))
);


ALTER TABLE "public"."boards" OWNER TO "postgres";


COMMENT ON COLUMN "public"."boards"."container_size" IS 'Container width size: small (220px), medium (280px), or large (360px)';



CREATE TABLE IF NOT EXISTS "public"."canvas_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_collaborators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission_level" "public"."permission_level" DEFAULT 'view'::"public"."permission_level" NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "board_permission" "public"."board_permission_level" DEFAULT 'reader'::"public"."board_permission_level"
);


ALTER TABLE "public"."canvas_collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "position_x" double precision,
    "position_y" double precision,
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_id" "uuid" NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "type" "public"."item_type" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "position_x" double precision DEFAULT 0,
    "position_y" double precision DEFAULT 0,
    "width" double precision DEFAULT 100,
    "height" double precision DEFAULT 100,
    "z_index" integer DEFAULT 0,
    "style" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_lines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "start_x" double precision NOT NULL,
    "start_y" double precision NOT NULL,
    "control_x" double precision NOT NULL,
    "control_y" double precision NOT NULL,
    "end_x" double precision NOT NULL,
    "end_y" double precision NOT NULL,
    "start_post_id" "uuid",
    "end_post_id" "uuid",
    "color" "text" DEFAULT '#374151'::"text",
    "stroke_width" integer DEFAULT 2,
    "start_arrow" boolean DEFAULT false,
    "end_arrow" boolean DEFAULT true,
    "dashed" boolean DEFAULT false,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "points" "jsonb",
    "label_position" double precision DEFAULT 0.5,
    "label_text_color" "text",
    "label_background_color" "text",
    "z_index" integer DEFAULT 0,
    "board_id" "uuid",
    "layer_plane" "text" DEFAULT 'front'::"text" NOT NULL,
    CONSTRAINT "canvas_lines_layer_plane_check" CHECK (("layer_plane" = ANY (ARRAY['front'::"text", 'back'::"text"])))
);


ALTER TABLE "public"."canvas_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" "text",
    "content" "text",
    "content_type" "text" DEFAULT 'text'::"text",
    "content_url" "text",
    "position_x" integer,
    "position_y" integer,
    "width" integer DEFAULT 200,
    "height" integer DEFAULT 150,
    "column_id" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_presence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cursor_x" double precision,
    "cursor_y" double precision,
    "last_seen" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "type" "public"."section_type" DEFAULT 'freeform'::"public"."section_type",
    "position_x" double precision DEFAULT 0,
    "position_y" double precision DEFAULT 0,
    "width" double precision DEFAULT 300,
    "height" double precision DEFAULT 200,
    "background_color" "text" DEFAULT '#ffffff'::"text",
    "border_color" "text" DEFAULT '#e5e7eb'::"text",
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "permissions" "jsonb" DEFAULT '["read"]'::"jsonb",
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "joined_at" timestamp with time zone,
    "last_seen" timestamp with time zone
);


ALTER TABLE "public"."canvas_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "description" "text",
    "icon" "text",
    "comments_enabled" boolean DEFAULT true,
    "layout" "text" DEFAULT 'wall'::"text",
    "new_posts_at_top" boolean DEFAULT true,
    "wallpaper_type" "text",
    "wallpaper_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "background_color" "text" DEFAULT '#ffffff'::"text",
    "background_image" "text",
    "template" "text" DEFAULT 'wall'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "is_public" boolean DEFAULT false,
    "owner_id" "uuid"
);


ALTER TABLE "public"."canvases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canvas_id" "uuid",
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "email" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_settings" (
    "user_id" "uuid" NOT NULL,
    "default_workspace" "text",
    "libraries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."dashboard_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "export_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "download_url" "text",
    "file_size" bigint,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."data_exports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."excalidraw_library" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "author" "text",
    "source" "text" DEFAULT 'local-import'::"text" NOT NULL,
    "preview" "text",
    "elements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created" bigint DEFAULT ((EXTRACT(epoch FROM "now"()) * (1000)::numeric))::bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."excalidraw_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT '📁'::"text",
    "color" "text" DEFAULT '#6b7280'::"text",
    "parent_id" "uuid",
    "position" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "workspace_id" "uuid"
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."freeform_graph_edges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "source_post_id" "uuid" NOT NULL,
    "target_post_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'solid'::"text" NOT NULL,
    "direction" "text" DEFAULT 'forward'::"text" NOT NULL,
    "label" "text",
    "style" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "freeform_graph_edges_direction_check" CHECK (("direction" = ANY (ARRAY['none'::"text", 'forward'::"text", 'backward'::"text", 'bidirectional'::"text"]))),
    CONSTRAINT "freeform_graph_edges_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['solid'::"text", 'dashed'::"text", 'dotted'::"text"])))
);


ALTER TABLE "public"."freeform_graph_edges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."freeform_graph_settings" (
    "board_id" "uuid" NOT NULL,
    "layout_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "focus_node_id" "uuid",
    "show_minimap" boolean DEFAULT true NOT NULL,
    "snap_strength" integer DEFAULT 10 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "freeform_graph_settings_layout_mode_check" CHECK (("layout_mode" = ANY (ARRAY['manual'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."freeform_graph_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kanban_board_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "permission_level" "text" DEFAULT 'edit'::"text" NOT NULL,
    "sort_by" "text",
    "sort_order" "text" DEFAULT 'asc'::"text" NOT NULL,
    "date_format" "text" DEFAULT 'YYYY-MM-DD'::"text" NOT NULL,
    "group_by" "text" DEFAULT 'none'::"text" NOT NULL,
    CONSTRAINT "kanban_board_members_date_format_check" CHECK (("date_format" = ANY (ARRAY['MM/DD/YYYY'::"text", 'DD/MM/YYYY'::"text", 'YYYY-MM-DD'::"text"]))),
    CONSTRAINT "kanban_board_members_group_by_check" CHECK (("group_by" = ANY (ARRAY['none'::"text", 'assignee'::"text", 'priority'::"text", 'project'::"text", 'status'::"text"]))),
    CONSTRAINT "kanban_board_members_permission_level_check" CHECK (("permission_level" = ANY (ARRAY['view'::"text", 'comment'::"text", 'edit'::"text", 'admin'::"text"]))),
    CONSTRAINT "kanban_board_members_sort_order_check" CHECK (("sort_order" = ANY (ARRAY['asc'::"text", 'desc'::"text"])))
);


ALTER TABLE "public"."kanban_board_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kanban_card_assignees" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "card_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kanban_card_assignees" OWNER TO "postgres";


COMMENT ON TABLE "public"."kanban_card_assignees" IS 'Many-to-many assignment mapping between kanban cards and users';



CREATE TABLE IF NOT EXISTS "public"."kanban_cards" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "column_id" "uuid" NOT NULL,
    "swimlane_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text",
    "order_index" numeric DEFAULT 0,
    "priority" integer DEFAULT 0,
    "score" integer DEFAULT 0,
    "time_estimated" real DEFAULT 0,
    "time_spent" real DEFAULT 0,
    "date_due" timestamp with time zone,
    "date_started" timestamp with time zone,
    "date_modification" timestamp with time zone DEFAULT "now"(),
    "date_completed" timestamp with time zone,
    "color_id" "text",
    "reference" "text",
    "assignee_id" "uuid",
    "creator_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "parent_id" "uuid",
    "task_type" "text" DEFAULT 'Task'::"text",
    "status" "text",
    CONSTRAINT "task_type_check" CHECK (("task_type" = ANY (ARRAY['Feature'::"text", 'Task'::"text", 'Milestone'::"text"])))
);


ALTER TABLE "public"."kanban_cards" OWNER TO "postgres";


COMMENT ON COLUMN "public"."kanban_cards"."parent_id" IS 'Parent card ID for hierarchical task relationships in Gantt view';



COMMENT ON COLUMN "public"."kanban_cards"."task_type" IS 'Task classification: Feature, Task, or Milestone';



CREATE TABLE IF NOT EXISTS "public"."kanban_column_groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "order_index" integer DEFAULT 0,
    "is_collapsed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kanban_column_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kanban_columns" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "order_index" numeric DEFAULT 0,
    "task_limit" integer DEFAULT 0,
    "is_collapsed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "group_id" "uuid"
);


ALTER TABLE "public"."kanban_columns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kanban_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "card_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kanban_comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."kanban_comments" IS 'Per-card comments for kanban cards';



CREATE TABLE IF NOT EXISTS "public"."kanban_links" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "from_card_id" "uuid" NOT NULL,
    "to_card_id" "uuid" NOT NULL,
    "relation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kanban_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."kanban_links" IS 'Card-to-card relationship links for Kanban boards';



COMMENT ON COLUMN "public"."kanban_links"."from_card_id" IS 'Source card (master) of the relationship';



COMMENT ON COLUMN "public"."kanban_links"."to_card_id" IS 'Target card (slave) of the relationship';



COMMENT ON COLUMN "public"."kanban_links"."relation" IS 'Type of relationship: Relates to, Depends on, Is required for, etc.';



CREATE TABLE IF NOT EXISTS "public"."kanban_swimlanes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "order_index" numeric DEFAULT 0,
    "is_collapsed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kanban_swimlanes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kanban_votes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "canvas_id" "uuid" NOT NULL,
    "card_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "value" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "kanban_votes_value_check" CHECK (("value" = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE "public"."kanban_votes" OWNER TO "postgres";


COMMENT ON TABLE "public"."kanban_votes" IS 'Per-card votes for kanban cards';



CREATE TABLE IF NOT EXISTS "public"."library_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" DEFAULT 'padlet'::"text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "thumbnail_url" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."library_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "device" "text",
    "location" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "success" boolean DEFAULT true,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."login_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" bigint NOT NULL,
    "type" "text" DEFAULT 'text'::"text",
    "content" "text",
    "position_x" integer DEFAULT 0,
    "position_y" integer DEFAULT 0,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "board_id" "uuid",
    CONSTRAINT "posts_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'video'::"text", 'audio'::"text", 'poll'::"text", 'drawing'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


ALTER TABLE "public"."posts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "location" "text",
    "website" "text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "display_name" "text",
    "username" "text",
    "about" "text",
    "class_info" "text",
    "language" "text" DEFAULT 'en-US'::"text",
    "account_type" "text" DEFAULT 'Individual'::"text",
    "beta_features" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."share_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "padlet_id" "uuid",
    "token" character varying(64) NOT NULL,
    "created_by" "uuid",
    "permission" character varying(20) DEFAULT 'view'::character varying,
    "password_hash" character varying(255),
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "access_count" integer DEFAULT 0,
    "last_accessed_at" timestamp with time zone,
    "board_id" "uuid"
);


ALTER TABLE "public"."share_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "plan_id" "text" DEFAULT 'free'::"text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0,
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "current_period_start" timestamp with time zone DEFAULT "now"(),
    "current_period_end" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    "customer_id" "uuid",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "stripe_product_id" "text",
    "plan" "public"."billing_plan" DEFAULT 'free'::"public"."billing_plan",
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "member_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "collection_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "activity_type" "text" NOT NULL,
    "activity_data" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_user_id" "text",
    "email" "text",
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    CONSTRAINT "user_integrations_provider_check" CHECK (("provider" = ANY (ARRAY['google-drive'::"text", 'microsoft-onedrive'::"text"])))
);


ALTER TABLE "public"."user_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "theme" "text" DEFAULT 'system'::"text",
    "language" "text" DEFAULT 'en'::"text",
    "email_notifications" boolean DEFAULT true,
    "push_notifications" boolean DEFAULT false,
    "notification_board_invites" boolean DEFAULT true,
    "notification_comments" boolean DEFAULT true,
    "notification_updates" boolean DEFAULT true,
    "notification_marketing" boolean DEFAULT false,
    "email_frequency" "text" DEFAULT 'daily'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "user_preferences_email_frequency_check" CHECK (("email_frequency" = ANY (ARRAY['immediate'::"text", 'daily'::"text", 'weekly'::"text", 'never'::"text"]))),
    CONSTRAINT "user_preferences_theme_check" CHECK (("theme" = ANY (ARRAY['light'::"text", 'dark'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "device" "text",
    "browser" "text",
    "location" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "active" boolean DEFAULT true,
    "is_current" boolean DEFAULT false,
    "last_activity" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "terminated_at" timestamp with time zone
);


ALTER TABLE "public"."user_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text",
    "expires_at" timestamp with time zone,
    CONSTRAINT "user_subscriptions_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'pro'::"text", 'business'::"text"])))
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


ALTER TABLE "public"."user_subscriptions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "boards_count" integer DEFAULT 0,
    "storage_used" bigint DEFAULT 0,
    "collaborators_count" integer DEFAULT 0,
    "boards_limit" integer DEFAULT 3,
    "storage_limit" bigint DEFAULT 524288000,
    "collaborators_limit" integer DEFAULT 10,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'link'::"text" NOT NULL,
    "email" "text",
    "link_code" "text",
    "role" "text" DEFAULT 'member'::"text",
    "max_uses" integer,
    "uses" integer DEFAULT 0 NOT NULL,
    "email_domain" "text",
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "redeemed_at" timestamp with time zone,
    "redeemed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "password" "text",
    CONSTRAINT "workspace_invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text", 'readonly'::"text"]))),
    CONSTRAINT "workspace_invitations_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'link'::"text"])))
);


ALTER TABLE "public"."workspace_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_owner_id" "uuid" NOT NULL,
    "member_user_id" "uuid",
    "member_email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "status" "text" DEFAULT 'invited'::"text",
    "invite_token" "text",
    "invited_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "joined_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))),
    CONSTRAINT "workspace_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'invited'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workspace_name" "text" DEFAULT 'My Workspace'::"text" NOT NULL,
    "workspace_logo" "text",
    "workspace_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "access_policy" "jsonb" DEFAULT "jsonb_build_object"('requirePassword', false, 'password', '', 'requireLogin', false, 'publishToProfileAndWeb', false, 'showInWorkspaceDashboard', true, 'visitorPermission', 'reader') NOT NULL
);


ALTER TABLE "public"."workspace_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'My Workspace'::"text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."board_sections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."board_sections_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."accessibility_settings"
    ADD CONSTRAINT "accessibility_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."auth_rate_limit_events"
    ADD CONSTRAINT "auth_rate_limit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_history"
    ADD CONSTRAINT "billing_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_collaborators"
    ADD CONSTRAINT "board_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_map_settings"
    ADD CONSTRAINT "board_map_settings_pkey" PRIMARY KEY ("board_id");



ALTER TABLE ONLY "public"."board_sections"
    ADD CONSTRAINT "board_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_activity"
    ADD CONSTRAINT "canvas_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_collaborators"
    ADD CONSTRAINT "canvas_collaborators_canvas_id_user_id_key" UNIQUE ("canvas_id", "user_id");



ALTER TABLE ONLY "public"."canvas_collaborators"
    ADD CONSTRAINT "canvas_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_comments"
    ADD CONSTRAINT "canvas_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_invitations"
    ADD CONSTRAINT "canvas_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_invitations"
    ADD CONSTRAINT "canvas_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."canvas_items"
    ADD CONSTRAINT "canvas_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_lines"
    ADD CONSTRAINT "canvas_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_posts"
    ADD CONSTRAINT "canvas_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_presence"
    ADD CONSTRAINT "canvas_presence_canvas_id_user_id_key" UNIQUE ("canvas_id", "user_id");



ALTER TABLE ONLY "public"."canvas_presence"
    ADD CONSTRAINT "canvas_presence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_sections"
    ADD CONSTRAINT "canvas_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_users"
    ADD CONSTRAINT "canvas_users_canvas_id_user_id_key" UNIQUE ("canvas_id", "user_id");



ALTER TABLE ONLY "public"."canvas_users"
    ADD CONSTRAINT "canvas_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvases"
    ADD CONSTRAINT "canvases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_workspace_id_key" UNIQUE ("workspace_id");



ALTER TABLE ONLY "public"."dashboard_settings"
    ADD CONSTRAINT "dashboard_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."excalidraw_library"
    ADD CONSTRAINT "excalidraw_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."freeform_graph_edges"
    ADD CONSTRAINT "freeform_graph_edges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."freeform_graph_settings"
    ADD CONSTRAINT "freeform_graph_settings_pkey" PRIMARY KEY ("board_id");



ALTER TABLE ONLY "public"."kanban_board_members"
    ADD CONSTRAINT "kanban_board_members_canvas_id_user_id_key" UNIQUE ("canvas_id", "user_id");



ALTER TABLE ONLY "public"."kanban_board_members"
    ADD CONSTRAINT "kanban_board_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_card_assignees"
    ADD CONSTRAINT "kanban_card_assignees_card_id_user_id_key" UNIQUE ("card_id", "user_id");



ALTER TABLE ONLY "public"."kanban_card_assignees"
    ADD CONSTRAINT "kanban_card_assignees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_cards"
    ADD CONSTRAINT "kanban_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_column_groups"
    ADD CONSTRAINT "kanban_column_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_columns"
    ADD CONSTRAINT "kanban_columns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_comments"
    ADD CONSTRAINT "kanban_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_links"
    ADD CONSTRAINT "kanban_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_swimlanes"
    ADD CONSTRAINT "kanban_swimlanes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_votes"
    ADD CONSTRAINT "kanban_votes_card_id_user_id_key" UNIQUE ("card_id", "user_id");



ALTER TABLE ONLY "public"."kanban_votes"
    ADD CONSTRAINT "kanban_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."library_items"
    ADD CONSTRAINT "library_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_history"
    ADD CONSTRAINT "login_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_push_subscriptions"
    ADD CONSTRAINT "notification_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_push_subscriptions"
    ADD CONSTRAINT "notification_push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."padlets"
    ADD CONSTRAINT "padlets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."share_links"
    ADD CONSTRAINT "share_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."share_links"
    ADD CONSTRAINT "share_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_links"
    ADD CONSTRAINT "unique_link" UNIQUE ("from_card_id", "to_card_id", "relation");



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_integrations"
    ADD CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_integrations"
    ADD CONSTRAINT "user_integrations_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_provider_event_id_key" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_link_code_key" UNIQUE ("link_code");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_logs_action_idx" ON "public"."activity_logs" USING "btree" ("action");



CREATE INDEX "activity_logs_created_at_idx" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "activity_logs_user_id_idx" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "ai_settings_user_id_idx" ON "public"."ai_settings" USING "btree" ("user_id");



CREATE INDEX "auth_rate_limit_events_action_created_at_idx" ON "public"."auth_rate_limit_events" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "auth_rate_limit_events_email_hash_created_at_idx" ON "public"."auth_rate_limit_events" USING "btree" ("email_hash", "created_at" DESC);



CREATE INDEX "auth_rate_limit_events_ip_hash_created_at_idx" ON "public"."auth_rate_limit_events" USING "btree" ("ip_hash", "created_at" DESC);



CREATE INDEX "boards_deleted_at_idx" ON "public"."boards" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "boards_folder_id_idx" ON "public"."boards" USING "btree" ("folder_id");



CREATE INDEX "boards_is_favorite_idx" ON "public"."boards" USING "btree" ("is_favorite") WHERE ("is_favorite" = true);



CREATE INDEX "boards_last_visited_idx" ON "public"."boards" USING "btree" ("last_visited_at" DESC NULLS LAST);



CREATE INDEX "boards_workspace_id_idx" ON "public"."boards" USING "btree" ("workspace_id");



CREATE INDEX "customers_workspace_id_idx" ON "public"."customers" USING "btree" ("workspace_id");



CREATE INDEX "excalidraw_library_created_idx" ON "public"."excalidraw_library" USING "btree" ("created" DESC);



CREATE INDEX "excalidraw_library_user_id_idx" ON "public"."excalidraw_library" USING "btree" ("user_id");



CREATE INDEX "folders_user_id_idx" ON "public"."folders" USING "btree" ("user_id");



CREATE INDEX "folders_workspace_id_idx" ON "public"."folders" USING "btree" ("workspace_id");



CREATE INDEX "idx_account_deletions_user_id" ON "public"."account_deletions" USING "btree" ("user_id");



CREATE INDEX "idx_billing_history_user_id" ON "public"."billing_history" USING "btree" ("user_id");



CREATE INDEX "idx_boards_container_size" ON "public"."boards" USING "btree" ("container_size");



CREATE INDEX "idx_canvas_collaborators_board_permission" ON "public"."canvas_collaborators" USING "btree" ("board_permission");



CREATE INDEX "idx_canvas_lines_layer_plane" ON "public"."canvas_lines" USING "btree" ("layer_plane");



CREATE INDEX "idx_canvas_posts_author" ON "public"."canvas_posts" USING "btree" ("author_id");



CREATE INDEX "idx_canvas_posts_canvas" ON "public"."canvas_posts" USING "btree" ("canvas_id");



CREATE INDEX "idx_canvas_users_canvas" ON "public"."canvas_users" USING "btree" ("canvas_id");



CREATE INDEX "idx_canvas_users_user" ON "public"."canvas_users" USING "btree" ("user_id");



CREATE INDEX "idx_canvases_owner" ON "public"."canvases" USING "btree" ("owner_id");



CREATE INDEX "idx_canvases_owner_id" ON "public"."canvases" USING "btree" ("owner_id");



CREATE INDEX "idx_canvases_public" ON "public"."canvases" USING "btree" ("is_public");



CREATE INDEX "idx_comments_canvas_id" ON "public"."comments" USING "btree" ("canvas_id");



CREATE INDEX "idx_comments_user_id" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "idx_data_exports_user_id" ON "public"."data_exports" USING "btree" ("user_id");



CREATE INDEX "idx_freeform_edges_board" ON "public"."freeform_graph_edges" USING "btree" ("board_id");



CREATE INDEX "idx_freeform_edges_source" ON "public"."freeform_graph_edges" USING "btree" ("source_post_id");



CREATE INDEX "idx_freeform_edges_target" ON "public"."freeform_graph_edges" USING "btree" ("target_post_id");



CREATE INDEX "idx_kanban_card_assignees_canvas" ON "public"."kanban_card_assignees" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_card_assignees_card" ON "public"."kanban_card_assignees" USING "btree" ("card_id");



CREATE INDEX "idx_kanban_card_assignees_user" ON "public"."kanban_card_assignees" USING "btree" ("user_id");



CREATE INDEX "idx_kanban_cards_assignee" ON "public"."kanban_cards" USING "btree" ("assignee_id");



CREATE INDEX "idx_kanban_cards_canvas" ON "public"."kanban_cards" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_cards_column" ON "public"."kanban_cards" USING "btree" ("column_id");



CREATE INDEX "idx_kanban_cards_parent" ON "public"."kanban_cards" USING "btree" ("parent_id");



CREATE INDEX "idx_kanban_cards_priority" ON "public"."kanban_cards" USING "btree" ("priority");



CREATE INDEX "idx_kanban_cards_status" ON "public"."kanban_cards" USING "btree" ("status");



CREATE INDEX "idx_kanban_cards_swimlane" ON "public"."kanban_cards" USING "btree" ("swimlane_id");



CREATE INDEX "idx_kanban_cards_task_type" ON "public"."kanban_cards" USING "btree" ("task_type");



CREATE INDEX "idx_kanban_column_groups_canvas_id" ON "public"."kanban_column_groups" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_columns_canvas" ON "public"."kanban_columns" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_columns_order" ON "public"."kanban_columns" USING "btree" ("canvas_id", "order_index");



CREATE INDEX "idx_kanban_comments_canvas_id" ON "public"."kanban_comments" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_comments_card_id" ON "public"."kanban_comments" USING "btree" ("card_id", "created_at" DESC);



CREATE INDEX "idx_kanban_links_canvas" ON "public"."kanban_links" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_links_from_card" ON "public"."kanban_links" USING "btree" ("from_card_id");



CREATE INDEX "idx_kanban_links_to_card" ON "public"."kanban_links" USING "btree" ("to_card_id");



CREATE INDEX "idx_kanban_members_canvas" ON "public"."kanban_board_members" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_members_user" ON "public"."kanban_board_members" USING "btree" ("user_id");



CREATE INDEX "idx_kanban_swimlanes_canvas" ON "public"."kanban_swimlanes" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_swimlanes_order" ON "public"."kanban_swimlanes" USING "btree" ("canvas_id", "order_index");



CREATE INDEX "idx_kanban_votes_canvas_id" ON "public"."kanban_votes" USING "btree" ("canvas_id");



CREATE INDEX "idx_kanban_votes_card_id" ON "public"."kanban_votes" USING "btree" ("card_id");



CREATE INDEX "idx_login_history_user_id" ON "public"."login_history" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("id");



CREATE INDEX "idx_security_events_user_id" ON "public"."security_events" USING "btree" ("user_id");



CREATE INDEX "idx_share_links_token" ON "public"."share_links" USING "btree" ("token");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_user_activity_user_id" ON "public"."user_activity" USING "btree" ("user_id");



CREATE INDEX "idx_user_sessions_user_id" ON "public"."user_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_user_usage_user_id" ON "public"."user_usage" USING "btree" ("user_id");



CREATE INDEX "padlets_board_location_idx" ON "public"."padlets" USING "btree" ("board_id") WHERE ("location_geog" IS NOT NULL);



CREATE INDEX "padlets_location_geog_gix" ON "public"."padlets" USING "gist" ("location_geog");



CREATE INDEX "platform_admins_created_by_idx" ON "public"."platform_admins" USING "btree" ("created_by");



CREATE INDEX "profiles_username_idx" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "subscriptions_customer_id_idx" ON "public"."subscriptions" USING "btree" ("customer_id");



CREATE INDEX "subscriptions_status_idx" ON "public"."subscriptions" USING "btree" ("status");



CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_idx" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE UNIQUE INDEX "subscriptions_workspace_id_idx" ON "public"."subscriptions" USING "btree" ("workspace_id") WHERE ("workspace_id" IS NOT NULL);



CREATE INDEX "teams_workspace_id_idx" ON "public"."teams" USING "btree" ("workspace_id");



CREATE INDEX "user_integrations_expires_at_idx" ON "public"."user_integrations" USING "btree" ("expires_at");



CREATE INDEX "user_integrations_provider_idx" ON "public"."user_integrations" USING "btree" ("provider");



CREATE INDEX "user_integrations_user_id_idx" ON "public"."user_integrations" USING "btree" ("user_id");



CREATE INDEX "user_integrations_user_provider_idx" ON "public"."user_integrations" USING "btree" ("user_id", "provider");



CREATE INDEX "user_preferences_user_id_idx" ON "public"."user_preferences" USING "btree" ("user_id");



CREATE INDEX "webhook_events_provider_processed_idx" ON "public"."webhook_events" USING "btree" ("provider", "processed_at" DESC);



CREATE INDEX "workspace_invitations_created_by_idx" ON "public"."workspace_invitations" USING "btree" ("created_by");



CREATE INDEX "workspace_invitations_email_idx" ON "public"."workspace_invitations" USING "btree" ("email");



CREATE INDEX "workspace_invitations_expires_at_idx" ON "public"."workspace_invitations" USING "btree" ("expires_at");



CREATE INDEX "workspace_invitations_link_code_idx" ON "public"."workspace_invitations" USING "btree" ("link_code");



CREATE UNIQUE INDEX "workspace_invitations_link_code_unique_idx" ON "public"."workspace_invitations" USING "btree" ("link_code") WHERE ("link_code" IS NOT NULL);



CREATE INDEX "workspace_invitations_workspace_id_idx" ON "public"."workspace_invitations" USING "btree" ("workspace_id");



CREATE INDEX "workspace_members_email_idx" ON "public"."workspace_members" USING "btree" ("member_email");



CREATE INDEX "workspace_members_member_email_lower_idx" ON "public"."workspace_members" USING "btree" ("lower"("member_email"));



CREATE INDEX "workspace_members_member_idx" ON "public"."workspace_members" USING "btree" ("member_user_id");



CREATE INDEX "workspace_members_member_user_id_idx" ON "public"."workspace_members" USING "btree" ("member_user_id");



CREATE INDEX "workspace_members_owner_idx" ON "public"."workspace_members" USING "btree" ("workspace_owner_id");



CREATE INDEX "workspace_members_workspace_id_idx" ON "public"."workspace_members" USING "btree" ("workspace_id");



CREATE INDEX "workspace_settings_user_id_idx" ON "public"."workspace_settings" USING "btree" ("user_id");



CREATE UNIQUE INDEX "workspace_settings_workspace_id_key" ON "public"."workspace_settings" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "workspaces_owner_user_id_idx" ON "public"."workspaces" USING "btree" ("owner_user_id");



CREATE OR REPLACE TRIGGER "canvases_updated_at" BEFORE UPDATE ON "public"."canvases" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "comments_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_canvas_created" AFTER INSERT ON "public"."canvases" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_canvas"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "sync_canvas_collaborator_permissions_trigger" BEFORE INSERT OR UPDATE ON "public"."canvas_collaborators" FOR EACH ROW EXECUTE FUNCTION "public"."sync_canvas_collaborator_permissions"();



CREATE OR REPLACE TRIGGER "trigger_freeform_edges_update" BEFORE UPDATE ON "public"."freeform_graph_edges" FOR EACH ROW EXECUTE FUNCTION "public"."update_freeform_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_freeform_settings_update" BEFORE UPDATE ON "public"."freeform_graph_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_freeform_updated_at"();



CREATE OR REPLACE TRIGGER "update_boards_updated_at" BEFORE UPDATE ON "public"."boards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_billing_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kanban_cards_updated_at" BEFORE UPDATE ON "public"."kanban_cards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kanban_column_groups_updated_at" BEFORE UPDATE ON "public"."kanban_column_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kanban_columns_updated_at" BEFORE UPDATE ON "public"."kanban_columns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kanban_comments_updated_at" BEFORE UPDATE ON "public"."kanban_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kanban_swimlanes_updated_at" BEFORE UPDATE ON "public"."kanban_swimlanes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_billing_updated_at_column"();



CREATE OR REPLACE TRIGGER "user_usage_updated_at" BEFORE UPDATE ON "public"."user_usage" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."accessibility_settings"
    ADD CONSTRAINT "accessibility_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."billing_history"
    ADD CONSTRAINT "billing_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."board_collaborators"
    ADD CONSTRAINT "board_collaborators_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_collaborators"
    ADD CONSTRAINT "board_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."board_map_settings"
    ADD CONSTRAINT "board_map_settings_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_sections"
    ADD CONSTRAINT "board_sections_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_activity"
    ADD CONSTRAINT "canvas_activity_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_activity"
    ADD CONSTRAINT "canvas_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_collaborators"
    ADD CONSTRAINT "canvas_collaborators_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."canvas_collaborators"
    ADD CONSTRAINT "canvas_collaborators_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_collaborators"
    ADD CONSTRAINT "canvas_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_comments"
    ADD CONSTRAINT "canvas_comments_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_comments"
    ADD CONSTRAINT "canvas_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."canvas_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_comments"
    ADD CONSTRAINT "canvas_comments_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."canvas_comments"
    ADD CONSTRAINT "canvas_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_invitations"
    ADD CONSTRAINT "canvas_invitations_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_invitations"
    ADD CONSTRAINT "canvas_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_items"
    ADD CONSTRAINT "canvas_items_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_items"
    ADD CONSTRAINT "canvas_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."canvas_items"
    ADD CONSTRAINT "canvas_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."canvas_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_lines"
    ADD CONSTRAINT "canvas_lines_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_lines"
    ADD CONSTRAINT "canvas_lines_end_post_id_fkey" FOREIGN KEY ("end_post_id") REFERENCES "public"."padlets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."canvas_lines"
    ADD CONSTRAINT "canvas_lines_start_post_id_fkey" FOREIGN KEY ("start_post_id") REFERENCES "public"."padlets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."canvas_posts"
    ADD CONSTRAINT "canvas_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_posts"
    ADD CONSTRAINT "canvas_posts_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_presence"
    ADD CONSTRAINT "canvas_presence_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_presence"
    ADD CONSTRAINT "canvas_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_sections"
    ADD CONSTRAINT "canvas_sections_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_users"
    ADD CONSTRAINT "canvas_users_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_users"
    ADD CONSTRAINT "canvas_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvases"
    ADD CONSTRAINT "canvases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_settings"
    ADD CONSTRAINT "dashboard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."excalidraw_library"
    ADD CONSTRAINT "excalidraw_library_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freeform_graph_edges"
    ADD CONSTRAINT "freeform_graph_edges_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freeform_graph_edges"
    ADD CONSTRAINT "freeform_graph_edges_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "public"."padlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freeform_graph_edges"
    ADD CONSTRAINT "freeform_graph_edges_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "public"."padlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freeform_graph_settings"
    ADD CONSTRAINT "freeform_graph_settings_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."freeform_graph_settings"
    ADD CONSTRAINT "freeform_graph_settings_focus_node_id_fkey" FOREIGN KEY ("focus_node_id") REFERENCES "public"."padlets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kanban_board_members"
    ADD CONSTRAINT "kanban_board_members_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_card_assignees"
    ADD CONSTRAINT "kanban_card_assignees_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_card_assignees"
    ADD CONSTRAINT "kanban_card_assignees_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_cards"
    ADD CONSTRAINT "kanban_cards_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_cards"
    ADD CONSTRAINT "kanban_cards_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_cards"
    ADD CONSTRAINT "kanban_cards_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."kanban_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_cards"
    ADD CONSTRAINT "kanban_cards_swimlane_id_fkey" FOREIGN KEY ("swimlane_id") REFERENCES "public"."kanban_swimlanes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kanban_column_groups"
    ADD CONSTRAINT "kanban_column_groups_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_columns"
    ADD CONSTRAINT "kanban_columns_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_columns"
    ADD CONSTRAINT "kanban_columns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."kanban_column_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kanban_comments"
    ADD CONSTRAINT "kanban_comments_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_comments"
    ADD CONSTRAINT "kanban_comments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_comments"
    ADD CONSTRAINT "kanban_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_links"
    ADD CONSTRAINT "kanban_links_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_links"
    ADD CONSTRAINT "kanban_links_from_card_id_fkey" FOREIGN KEY ("from_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_links"
    ADD CONSTRAINT "kanban_links_to_card_id_fkey" FOREIGN KEY ("to_card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_swimlanes"
    ADD CONSTRAINT "kanban_swimlanes_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_votes"
    ADD CONSTRAINT "kanban_votes_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_votes"
    ADD CONSTRAINT "kanban_votes_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_votes"
    ADD CONSTRAINT "kanban_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."library_items"
    ADD CONSTRAINT "library_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."login_history"
    ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notification_push_subscriptions"
    ADD CONSTRAINT "notification_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."padlets"
    ADD CONSTRAINT "padlets_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."padlets"
    ADD CONSTRAINT "padlets_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."share_links"
    ADD CONSTRAINT "share_links_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."share_links"
    ADD CONSTRAINT "share_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."share_links"
    ADD CONSTRAINT "share_links_padlet_id_fkey" FOREIGN KEY ("padlet_id") REFERENCES "public"."padlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_integrations"
    ADD CONSTRAINT "user_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_usage"
    ADD CONSTRAINT "user_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_owner_id_fkey" FOREIGN KEY ("workspace_owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can create share links" ON "public"."share_links" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read share links" ON "public"."share_links" FOR SELECT USING (true);



CREATE POLICY "Anyone can update share links" ON "public"."share_links" FOR UPDATE USING (true);



CREATE POLICY "Canvas owners can delete their canvases" ON "public"."canvases" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Canvas owners can update their canvases" ON "public"."canvases" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Platform admins can delete platform admins" ON "public"."platform_admins" FOR DELETE USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can insert platform admins" ON "public"."platform_admins" FOR INSERT WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can update platform admins" ON "public"."platform_admins" FOR UPDATE USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can view platform admins" ON "public"."platform_admins" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can view webhook events" ON "public"."webhook_events" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Users can create canvases" ON "public"."canvases" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete freeform edges of their boards" ON "public"."freeform_graph_edges" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "freeform_graph_edges"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own accessibility settings" ON "public"."accessibility_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own canvases" ON "public"."canvases" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own comments" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own dashboard settings" ON "public"."dashboard_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own integrations" ON "public"."user_integrations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notification settings" ON "public"."notification_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own profile" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can delete own push subscriptions" ON "public"."notification_push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own excalidraw library items" ON "public"."excalidraw_library" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own folders" ON "public"."folders" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own library items" ON "public"."library_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert comments on accessible canvases" ON "public"."comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."canvases"
  WHERE (("canvases"."id" = "comments"."canvas_id") AND ("canvases"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert freeform edges of their boards" ON "public"."freeform_graph_edges" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "freeform_graph_edges"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert freeform settings of their boards" ON "public"."freeform_graph_settings" FOR INSERT WITH CHECK ("public"."can_edit_board"("board_id"));



CREATE POLICY "Users can insert own accessibility settings" ON "public"."accessibility_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own account deletions" ON "public"."account_deletions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own activity" ON "public"."user_activity" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own billing history" ON "public"."billing_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own canvases" ON "public"."canvases" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own dashboard settings" ON "public"."dashboard_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own data exports" ON "public"."data_exports" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own integrations" ON "public"."user_integrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own login history" ON "public"."login_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own notification settings" ON "public"."notification_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own push subscriptions" ON "public"."notification_push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own security events" ON "public"."security_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own sessions" ON "public"."user_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own subscriptions" ON "public"."subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own usage" ON "public"."user_usage" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own AI settings" ON "public"."ai_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own activity logs" ON "public"."activity_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own excalidraw library items" ON "public"."excalidraw_library" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own folders" ON "public"."folders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own library items" ON "public"."library_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can select freeform edges of their boards" ON "public"."freeform_graph_edges" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "freeform_graph_edges"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can select freeform settings of their boards" ON "public"."freeform_graph_settings" FOR SELECT USING ("public"."can_access_board"("board_id"));



CREATE POLICY "Users can update freeform edges of their boards" ON "public"."freeform_graph_edges" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "freeform_graph_edges"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update freeform settings of their boards" ON "public"."freeform_graph_settings" FOR UPDATE USING ("public"."can_edit_board"("board_id")) WITH CHECK ("public"."can_edit_board"("board_id"));



CREATE POLICY "Users can update own accessibility settings" ON "public"."accessibility_settings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own canvases" ON "public"."canvases" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own comments" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own dashboard settings" ON "public"."dashboard_settings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own data exports" ON "public"."data_exports" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own integrations" ON "public"."user_integrations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notification settings" ON "public"."notification_settings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own push subscriptions" ON "public"."notification_push_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own sessions" ON "public"."user_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own subscriptions" ON "public"."subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own usage" ON "public"."user_usage" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own AI settings" ON "public"."ai_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own excalidraw library items" ON "public"."excalidraw_library" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own folders" ON "public"."folders" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own library items" ON "public"."library_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own preferences" ON "public"."user_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view accessible canvases" ON "public"."canvases" FOR SELECT USING ((("is_public" = true) OR ("owner_id" = "auth"."uid"()) OR ("id" IN ( SELECT "canvas_users"."canvas_id"
   FROM "public"."canvas_users"
  WHERE ("canvas_users"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view comments on accessible canvases" ON "public"."comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."canvases"
  WHERE (("canvases"."id" = "comments"."canvas_id") AND ("canvases"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own accessibility settings" ON "public"."accessibility_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own account deletions" ON "public"."account_deletions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own activity" ON "public"."user_activity" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own billing history" ON "public"."billing_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own canvases" ON "public"."canvases" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own dashboard settings" ON "public"."dashboard_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own data exports" ON "public"."data_exports" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own integrations" ON "public"."user_integrations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own login history" ON "public"."login_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notification settings" ON "public"."notification_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own push subscriptions" ON "public"."notification_push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own security events" ON "public"."security_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own sessions" ON "public"."user_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own usage" ON "public"."user_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own AI settings" ON "public"."ai_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own activity logs" ON "public"."activity_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own excalidraw library items" ON "public"."excalidraw_library" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own folders" ON "public"."folders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own library items" ON "public"."library_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own preferences" ON "public"."user_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view workspaces they belong to" ON "public"."workspaces" FOR SELECT USING ("public"."has_workspace_access"("id"));



CREATE POLICY "Workspace managers can delete memberships" ON "public"."workspace_members" FOR DELETE USING ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "Workspace managers can delete teams" ON "public"."teams" FOR DELETE USING ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "Workspace managers can insert memberships" ON "public"."workspace_members" FOR INSERT WITH CHECK ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "Workspace managers can insert teams" ON "public"."teams" FOR INSERT WITH CHECK ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "Workspace managers can insert workspace settings" ON "public"."workspace_settings" FOR INSERT WITH CHECK ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "Workspace managers can manage customers" ON "public"."customers" USING ("public"."can_manage_workspace"("workspace_id")) WITH CHECK ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "Workspace managers can manage subscriptions" ON "public"."subscriptions" USING ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id"))) WITH CHECK ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "Workspace managers can update memberships" ON "public"."workspace_members" FOR UPDATE USING ("public"."can_manage_workspace"("workspace_id")) WITH CHECK ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "Workspace managers can update teams" ON "public"."teams" FOR UPDATE USING ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id"))) WITH CHECK ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "Workspace managers can update workspace settings" ON "public"."workspace_settings" FOR UPDATE USING ("public"."can_manage_workspace"("workspace_id")) WITH CHECK ("public"."can_manage_workspace"("workspace_id"));



CREATE POLICY "Workspace managers can view invitations" ON "public"."workspace_invitations" FOR SELECT USING (("public"."can_manage_workspace"("workspace_id") OR (("type" = 'link'::"text") AND ("link_code" IS NOT NULL) AND ("redeemed_at" IS NULL) AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (("max_uses" IS NULL) OR ("uses" < "max_uses")))));



CREATE POLICY "Workspace managers can view teams" ON "public"."teams" FOR SELECT USING ((("workspace_id" IS NOT NULL) AND "public"."can_manage_workspace"("workspace_id")));



CREATE POLICY "Workspace members can view customers" ON "public"."customers" FOR SELECT USING ("public"."has_workspace_access"("workspace_id"));



CREATE POLICY "Workspace members can view memberships" ON "public"."workspace_members" FOR SELECT USING ("public"."has_workspace_access"("workspace_id"));



CREATE POLICY "Workspace members can view subscriptions" ON "public"."subscriptions" FOR SELECT USING ((("workspace_id" IS NOT NULL) AND "public"."has_workspace_access"("workspace_id")));



CREATE POLICY "Workspace members can view workspace settings" ON "public"."workspace_settings" FOR SELECT USING ("public"."has_workspace_access"("workspace_id"));



CREATE POLICY "Workspace owners can delete workspace settings" ON "public"."workspace_settings" FOR DELETE USING (("public"."get_workspace_role"("workspace_id") = 'owner'::"public"."workspace_role"));



CREATE POLICY "Workspace owners can delete workspaces" ON "public"."workspaces" FOR DELETE USING (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "Workspace owners can insert workspaces" ON "public"."workspaces" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "Workspace owners can update workspaces" ON "public"."workspaces" FOR UPDATE USING (("auth"."uid"() = "owner_user_id")) WITH CHECK (("auth"."uid"() = "owner_user_id"));



ALTER TABLE "public"."accessibility_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."account_deletions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_rate_limit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_collaborators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_collaborators_select" ON "public"."board_collaborators" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"())))));



CREATE POLICY "board_collaborators_write" ON "public"."board_collaborators" TO "authenticated" USING (("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"())))) WITH CHECK (("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."board_map_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_map_settings_delete" ON "public"."board_map_settings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "board_map_settings"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "board_map_settings_insert" ON "public"."board_map_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "board_map_settings"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "board_map_settings_select" ON "public"."board_map_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "board_map_settings"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "board_map_settings_update" ON "public"."board_map_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "board_map_settings"."board_id") AND ("b"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "board_map_settings"."board_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."board_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_sections_delete" ON "public"."board_sections" FOR DELETE TO "authenticated" USING ((("board_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"]))))) OR ("board_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))));



CREATE POLICY "board_sections_insert" ON "public"."board_sections" FOR INSERT TO "authenticated" WITH CHECK ((("board_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"]))))) OR ("board_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))));



CREATE POLICY "board_sections_select" ON "public"."board_sections" FOR SELECT TO "authenticated" USING ((("board_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))));



CREATE POLICY "board_sections_update" ON "public"."board_sections" FOR UPDATE TO "authenticated" USING ((("board_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"]))))) OR ("board_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."boards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boards_delete" ON "public"."boards" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "boards_insert" ON "public"."boards" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "boards_select" ON "public"."boards" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_board_member"("id", "auth"."uid"())));



CREATE POLICY "boards_update" ON "public"."boards" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."canvas_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_activity_insert" ON "public"."canvas_activity" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"()))))));



CREATE POLICY "canvas_activity_select" ON "public"."canvas_activity" FOR SELECT TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."canvas_collaborators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_collaborators_delete" ON "public"."canvas_collaborators" FOR DELETE TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR "public"."is_canvas_admin"("canvas_id", "auth"."uid"())));



CREATE POLICY "canvas_collaborators_insert" ON "public"."canvas_collaborators" FOR INSERT TO "authenticated" WITH CHECK ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR "public"."is_canvas_admin"("canvas_id", "auth"."uid"())));



CREATE POLICY "canvas_collaborators_select" ON "public"."canvas_collaborators" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR "public"."is_canvas_admin"("canvas_id", "auth"."uid"())));



CREATE POLICY "canvas_collaborators_update" ON "public"."canvas_collaborators" FOR UPDATE TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR "public"."is_canvas_admin"("canvas_id", "auth"."uid"())));



ALTER TABLE "public"."canvas_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_comments_delete" ON "public"."canvas_comments" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))));



CREATE POLICY "canvas_comments_insert" ON "public"."canvas_comments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['commenter'::"public"."board_permission_level", 'editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"]))))))));



CREATE POLICY "canvas_comments_select" ON "public"."canvas_comments" FOR SELECT TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE (("canvases"."is_public" = true) OR ("canvases"."owner_id" = "auth"."uid"())))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "canvas_comments_update" ON "public"."canvas_comments" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))));



ALTER TABLE "public"."canvas_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canvas_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_items_select" ON "public"."canvas_items" FOR SELECT TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE (("canvases"."is_public" = true) OR ("canvases"."owner_id" = "auth"."uid"())))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "canvas_items_write" ON "public"."canvas_items" TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"]))))))) WITH CHECK ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))));



ALTER TABLE "public"."canvas_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_lines_select" ON "public"."canvas_lines" FOR SELECT TO "authenticated" USING ((("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE ("board_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "canvas_lines_write" ON "public"."canvas_lines" TO "authenticated" USING ((("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text")))))) WITH CHECK ((("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text"))))));



ALTER TABLE "public"."canvas_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canvas_presence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_presence_select" ON "public"."canvas_presence" FOR SELECT TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "canvas_presence_write" ON "public"."canvas_presence" TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."canvas_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canvas_sections_select" ON "public"."canvas_sections" FOR SELECT TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE (("canvases"."is_public" = true) OR ("canvases"."owner_id" = "auth"."uid"())))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "canvas_sections_write" ON "public"."canvas_sections" TO "authenticated" USING ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"]))))))) WITH CHECK ((("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"()))) OR ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))));



ALTER TABLE "public"."canvas_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canvases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."excalidraw_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."freeform_graph_edges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."freeform_graph_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kanban_board_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_board_members_delete" ON "public"."kanban_board_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_board_members"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = 'admin'::"text")))));



CREATE POLICY "kanban_board_members_insert" ON "public"."kanban_board_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_board_members"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = 'admin'::"text")))));



CREATE POLICY "kanban_board_members_select" ON "public"."kanban_board_members" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_board_members"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_board_members_update" ON "public"."kanban_board_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_board_members"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = 'admin'::"text")))));



ALTER TABLE "public"."kanban_card_assignees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_card_assignees_select" ON "public"."kanban_card_assignees" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_card_assignees"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_card_assignees_write" ON "public"."kanban_card_assignees" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_card_assignees"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_card_assignees"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."kanban_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_cards_select" ON "public"."kanban_cards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_cards"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_cards_write" ON "public"."kanban_cards" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_cards"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_cards"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."kanban_column_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_column_groups_delete_member" ON "public"."kanban_column_groups" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_column_groups"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



CREATE POLICY "kanban_column_groups_insert_member" ON "public"."kanban_column_groups" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_column_groups"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



CREATE POLICY "kanban_column_groups_select_member" ON "public"."kanban_column_groups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_column_groups"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_column_groups_update_member" ON "public"."kanban_column_groups" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_column_groups"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_column_groups"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."kanban_columns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_columns_select" ON "public"."kanban_columns" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_columns"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_columns_write" ON "public"."kanban_columns" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_columns"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_columns"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."kanban_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_comments_delete_author_or_manager" ON "public"."kanban_comments" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_comments"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = 'admin'::"text"))))));



CREATE POLICY "kanban_comments_insert_member_self" ON "public"."kanban_comments" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_comments"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['comment'::"text", 'edit'::"text", 'admin'::"text"])))))));



CREATE POLICY "kanban_comments_select_member" ON "public"."kanban_comments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_comments"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_comments_update_author_or_manager" ON "public"."kanban_comments" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_comments"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_comments"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))));



ALTER TABLE "public"."kanban_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_links_select" ON "public"."kanban_links" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_links"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_links_write" ON "public"."kanban_links" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_links"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_links"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."kanban_swimlanes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_swimlanes_select" ON "public"."kanban_swimlanes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_swimlanes"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_swimlanes_write" ON "public"."kanban_swimlanes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_swimlanes"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_swimlanes"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['edit'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."kanban_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_votes_delete_owner_or_manager" ON "public"."kanban_votes" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_votes"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = 'admin'::"text"))))));



CREATE POLICY "kanban_votes_insert_member_self" ON "public"."kanban_votes" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_votes"."canvas_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."permission_level" = ANY (ARRAY['comment'::"text", 'edit'::"text", 'admin'::"text"])))))));



CREATE POLICY "kanban_votes_select_member" ON "public"."kanban_votes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."kanban_board_members" "m"
  WHERE (("m"."canvas_id" = "kanban_votes"."canvas_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "kanban_votes_update_owner" ON "public"."kanban_votes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."library_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."padlets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "padlets_delete" ON "public"."padlets" FOR DELETE TO "authenticated" USING (((("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))) OR (("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"())))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text")))))));



CREATE POLICY "padlets_insert" ON "public"."padlets" FOR INSERT TO "authenticated" WITH CHECK (((("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))) OR (("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"())))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text")))))));



CREATE POLICY "padlets_select" ON "public"."padlets" FOR SELECT TO "authenticated" USING (((("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE (("canvases"."is_public" = true) OR ("canvases"."owner_id" = "auth"."uid"()))))) OR (("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE ("canvas_collaborators"."user_id" = "auth"."uid"())))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"())))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE ("board_collaborators"."user_id" = "auth"."uid"()))))));



CREATE POLICY "padlets_update" ON "public"."padlets" FOR UPDATE TO "authenticated" USING (((("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvases"."id"
   FROM "public"."canvases"
  WHERE ("canvases"."owner_id" = "auth"."uid"())))) OR (("canvas_id" IS NOT NULL) AND ("canvas_id" IN ( SELECT "canvas_collaborators"."canvas_id"
   FROM "public"."canvas_collaborators"
  WHERE (("canvas_collaborators"."user_id" = "auth"."uid"()) AND ("canvas_collaborators"."board_permission" = ANY (ARRAY['editor'::"public"."board_permission_level", 'moderator'::"public"."board_permission_level", 'admin'::"public"."board_permission_level"])))))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"())))) OR (("board_id" IS NOT NULL) AND ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text")))))));



ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts_select" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE ("board_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "posts_write" ON "public"."posts" TO "authenticated" USING ((("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text")))))) WITH CHECK ((("board_id" IN ( SELECT "boards"."id"
   FROM "public"."boards"
  WHERE ("boards"."user_id" = "auth"."uid"()))) OR ("board_id" IN ( SELECT "board_collaborators"."board_id"
   FROM "public"."board_collaborators"
  WHERE (("board_collaborators"."user_id" = "auth"."uid"()) AND ("board_collaborators"."role" = 'editor'::"text"))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."share_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_subscriptions_select" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."board_permission_rank"("permission" "public"."board_permission_level") TO "anon";
GRANT ALL ON FUNCTION "public"."board_permission_rank"("permission" "public"."board_permission_level") TO "authenticated";
GRANT ALL ON FUNCTION "public"."board_permission_rank"("permission" "public"."board_permission_level") TO "service_role";



GRANT ALL ON FUNCTION "public"."board_permission_to_legacy"("permission" "public"."board_permission_level") TO "anon";
GRANT ALL ON FUNCTION "public"."board_permission_to_legacy"("permission" "public"."board_permission_level") TO "authenticated";
GRANT ALL ON FUNCTION "public"."board_permission_to_legacy"("permission" "public"."board_permission_level") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_comment_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_comment_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_comment_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_workspace"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_read_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_board"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_canvas_permission"("canvas_uuid" "uuid", "user_uuid" "uuid", "required_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_canvas_permission"("canvas_uuid" "uuid", "user_uuid" "uuid", "required_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_canvas_permission"("canvas_uuid" "uuid", "user_uuid" "uuid", "required_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_canvas_permission"("canvas_id" "uuid", "user_id" "uuid", "required_permission" "public"."permission_level") TO "anon";
GRANT ALL ON FUNCTION "public"."check_canvas_permission"("canvas_id" "uuid", "user_id" "uuid", "required_permission" "public"."permission_level") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_canvas_permission"("canvas_id" "uuid", "user_id" "uuid", "required_permission" "public"."permission_level") TO "service_role";



GRANT ALL ON TABLE "public"."padlets" TO "anon";
GRANT ALL ON TABLE "public"."padlets" TO "authenticated";
GRANT ALL ON TABLE "public"."padlets" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_board_map_padlets_bbox"("p_board_id" "uuid", "p_west" double precision, "p_south" double precision, "p_east" double precision, "p_north" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_board_map_padlets_bbox"("p_board_id" "uuid", "p_west" double precision, "p_south" double precision, "p_east" double precision, "p_north" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_board_map_padlets_bbox"("p_board_id" "uuid", "p_west" double precision, "p_south" double precision, "p_east" double precision, "p_north" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_board_members_with_profile"("board_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_board_members_with_profile"("board_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_board_members_with_profile"("board_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_board_members_with_profile"("board_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_board_permission"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_board_permission"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_board_permission"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_canvas_with_permission"("canvas_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_canvas_with_permission"("canvas_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_canvas_with_permission"("canvas_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workspace_role"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_role"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_role"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_canvas"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_canvas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_canvas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_workspace_access"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_workspace_access"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_workspace_access"("workspace_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."import_workspace_bundle"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_folders" "jsonb", "p_boards" "jsonb", "p_padlets" "jsonb", "p_board_sections" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."import_workspace_bundle"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_folders" "jsonb", "p_boards" "jsonb", "p_padlets" "jsonb", "p_board_sections" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_workspace_bundle"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_folders" "jsonb", "p_boards" "jsonb", "p_padlets" "jsonb", "p_board_sections" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_board_member"("board_uuid" "uuid", "user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_board_member"("board_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_board_member"("board_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_board_member"("board_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_canvas_admin"("canvas_uuid" "uuid", "user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_canvas_admin"("canvas_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_canvas_admin"("canvas_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_canvas_admin"("canvas_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."legacy_permission_to_board"("permission" "public"."permission_level") TO "anon";
GRANT ALL ON FUNCTION "public"."legacy_permission_to_board"("permission" "public"."permission_level") TO "authenticated";
GRANT ALL ON FUNCTION "public"."legacy_permission_to_board"("permission" "public"."permission_level") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_canvas_activity"("canvas_id" "uuid", "user_id" "uuid", "action" "text", "details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_canvas_activity"("canvas_id" "uuid", "user_id" "uuid", "action" "text", "details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_canvas_activity"("canvas_id" "uuid", "user_id" "uuid", "action" "text", "details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_required_board_permission"("required_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_required_board_permission"("required_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_required_board_permission"("required_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_workspace_role"("role_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_workspace_role"("role_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_workspace_role"("role_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_canvas_collaborator_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_canvas_collaborator_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_canvas_collaborator_permissions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_billing_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_billing_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_billing_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_freeform_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_freeform_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_freeform_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."accessibility_settings" TO "anon";
GRANT ALL ON TABLE "public"."accessibility_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."accessibility_settings" TO "service_role";



GRANT ALL ON TABLE "public"."account_deletions" TO "anon";
GRANT ALL ON TABLE "public"."account_deletions" TO "authenticated";
GRANT ALL ON TABLE "public"."account_deletions" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_settings" TO "service_role";



GRANT ALL ON TABLE "public"."auth_rate_limit_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_rate_limit_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_rate_limit_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_rate_limit_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."billing_history" TO "anon";
GRANT ALL ON TABLE "public"."billing_history" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_history" TO "service_role";



GRANT ALL ON TABLE "public"."board_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."board_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."board_collaborators" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_collaborators_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_collaborators_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_collaborators_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_map_settings" TO "anon";
GRANT ALL ON TABLE "public"."board_map_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."board_map_settings" TO "service_role";



GRANT ALL ON TABLE "public"."board_sections" TO "anon";
GRANT ALL ON TABLE "public"."board_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."board_sections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_sections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_sections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_sections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."boards" TO "anon";
GRANT ALL ON TABLE "public"."boards" TO "authenticated";
GRANT ALL ON TABLE "public"."boards" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_activity" TO "anon";
GRANT ALL ON TABLE "public"."canvas_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_activity" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."canvas_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_comments" TO "anon";
GRANT ALL ON TABLE "public"."canvas_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_comments" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_invitations" TO "anon";
GRANT ALL ON TABLE "public"."canvas_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_items" TO "anon";
GRANT ALL ON TABLE "public"."canvas_items" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_items" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_lines" TO "anon";
GRANT ALL ON TABLE "public"."canvas_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_lines" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_posts" TO "anon";
GRANT ALL ON TABLE "public"."canvas_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_posts" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_presence" TO "anon";
GRANT ALL ON TABLE "public"."canvas_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_presence" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_sections" TO "anon";
GRANT ALL ON TABLE "public"."canvas_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_sections" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_users" TO "anon";
GRANT ALL ON TABLE "public"."canvas_users" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_users" TO "service_role";



GRANT ALL ON TABLE "public"."canvases" TO "anon";
GRANT ALL ON TABLE "public"."canvases" TO "authenticated";
GRANT ALL ON TABLE "public"."canvases" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_settings" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_settings" TO "service_role";



GRANT ALL ON TABLE "public"."data_exports" TO "anon";
GRANT ALL ON TABLE "public"."data_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."data_exports" TO "service_role";



GRANT ALL ON TABLE "public"."excalidraw_library" TO "anon";
GRANT ALL ON TABLE "public"."excalidraw_library" TO "authenticated";
GRANT ALL ON TABLE "public"."excalidraw_library" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."freeform_graph_edges" TO "anon";
GRANT ALL ON TABLE "public"."freeform_graph_edges" TO "authenticated";
GRANT ALL ON TABLE "public"."freeform_graph_edges" TO "service_role";



GRANT ALL ON TABLE "public"."freeform_graph_settings" TO "anon";
GRANT ALL ON TABLE "public"."freeform_graph_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."freeform_graph_settings" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_board_members" TO "anon";
GRANT ALL ON TABLE "public"."kanban_board_members" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_board_members" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_card_assignees" TO "anon";
GRANT ALL ON TABLE "public"."kanban_card_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_card_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_cards" TO "anon";
GRANT ALL ON TABLE "public"."kanban_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_cards" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_column_groups" TO "anon";
GRANT ALL ON TABLE "public"."kanban_column_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_column_groups" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_columns" TO "anon";
GRANT ALL ON TABLE "public"."kanban_columns" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_columns" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_comments" TO "anon";
GRANT ALL ON TABLE "public"."kanban_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_comments" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_links" TO "anon";
GRANT ALL ON TABLE "public"."kanban_links" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_links" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_swimlanes" TO "anon";
GRANT ALL ON TABLE "public"."kanban_swimlanes" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_swimlanes" TO "service_role";



GRANT ALL ON TABLE "public"."kanban_votes" TO "anon";
GRANT ALL ON TABLE "public"."kanban_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_votes" TO "service_role";



GRANT ALL ON TABLE "public"."library_items" TO "anon";
GRANT ALL ON TABLE "public"."library_items" TO "authenticated";
GRANT ALL ON TABLE "public"."library_items" TO "service_role";



GRANT ALL ON TABLE "public"."login_history" TO "anon";
GRANT ALL ON TABLE "public"."login_history" TO "authenticated";
GRANT ALL ON TABLE "public"."login_history" TO "service_role";



GRANT ALL ON TABLE "public"."notification_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."notification_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "anon";
GRANT ALL ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."share_links" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."share_links" TO "authenticated";
GRANT ALL ON TABLE "public"."share_links" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("id") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("padlet_id") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("padlet_id") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("token") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("token") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("created_by") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("created_by") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("permission") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("permission") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("expires_at") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("expires_at") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("access_count"),UPDATE("access_count") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("access_count"),UPDATE("access_count") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("last_accessed_at"),UPDATE("last_accessed_at") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("last_accessed_at"),UPDATE("last_accessed_at") ON TABLE "public"."share_links" TO "authenticated";



GRANT SELECT("board_id") ON TABLE "public"."share_links" TO "anon";
GRANT SELECT("board_id") ON TABLE "public"."share_links" TO "authenticated";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity" TO "anon";
GRANT ALL ON TABLE "public"."user_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity" TO "service_role";



GRANT ALL ON TABLE "public"."user_integrations" TO "anon";
GRANT ALL ON TABLE "public"."user_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_subscriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_usage" TO "anon";
GRANT ALL ON TABLE "public"."user_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."user_usage" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invitations" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_settings" TO "anon";
GRANT ALL ON TABLE "public"."workspace_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_settings" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
