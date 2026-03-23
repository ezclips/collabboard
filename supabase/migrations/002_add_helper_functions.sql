-- supabase/migrations/002_add_helper_functions.sql
-- Helper functions for CollabBoard API

-- Function to check canvas permissions
CREATE OR REPLACE FUNCTION check_canvas_permission(
    canvas_uuid UUID,
    user_uuid UUID,
    required_permission TEXT DEFAULT 'view'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_permission TEXT;
    canvas_owner UUID;
    permission_hierarchy INTEGER;
    required_hierarchy INTEGER;
BEGIN
    -- Get canvas owner
    SELECT created_by INTO canvas_owner
    FROM canvases
    WHERE id = canvas_uuid;
    
    -- If canvas doesn't exist, return false
    IF canvas_owner IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- If user is the canvas owner, they have admin permissions
    IF canvas_owner = user_uuid THEN
        RETURN TRUE;
    END IF;
    
    -- Get user's permission level from collaborators table
    SELECT permission_level INTO user_permission
    FROM canvas_collaborators
    WHERE canvas_id = canvas_uuid
    AND user_id = user_uuid
    AND accepted_at IS NOT NULL;
    
    -- If user is not a collaborator, check if canvas is public
    IF user_permission IS NULL THEN
        SELECT is_public INTO user_permission
        FROM canvases
        WHERE id = canvas_uuid;
        
        -- If canvas is public, give view permission
        IF user_permission = TRUE THEN
            user_permission := 'view';
        ELSE
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Convert permissions to hierarchy levels for comparison
    permission_hierarchy := CASE user_permission
        WHEN 'view' THEN 1
        WHEN 'comment' THEN 2
        WHEN 'edit' THEN 3
        WHEN 'admin' THEN 4
        ELSE 0
    END;
    
    required_hierarchy := CASE required_permission
        WHEN 'view' THEN 1
        WHEN 'comment' THEN 2
        WHEN 'edit' THEN 3
        WHEN 'admin' THEN 4
        ELSE 0
    END;
    
    -- Return true if user has sufficient permissions
    RETURN permission_hierarchy >= required_hierarchy;
END;
$$;

-- Function to log canvas activity
CREATE OR REPLACE FUNCTION log_canvas_activity(
    canvas_uuid UUID,
    user_uuid UUID,
    action TEXT,
    details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    activity_id UUID;
BEGIN
    -- Insert activity log
    INSERT INTO canvas_activity (
        id,
        canvas_id,
        user_id,
        action,
        details,
        created_at
    )
    VALUES (
        gen_random_uuid(),
        canvas_uuid,
        user_uuid,
        action,
        details,
        NOW()
    )
    RETURNING id INTO activity_id;
    
    -- Update canvas last_activity_at
    UPDATE canvases
    SET updated_at = NOW()
    WHERE id = canvas_uuid;
    
    -- Update user's last_accessed_at in collaborators table
    UPDATE canvas_collaborators
    SET last_accessed_at = NOW()
    WHERE canvas_id = canvas_uuid
    AND user_id = user_uuid;
    
    RETURN activity_id;
END;
$$;

-- Function to update canvas access (for presence tracking)
CREATE OR REPLACE FUNCTION update_canvas_access(
    canvas_uuid UUID,
    user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    canvas_owner UUID;
    is_collaborator BOOLEAN DEFAULT FALSE;
BEGIN
    -- Get canvas owner
    SELECT created_by INTO canvas_owner
    FROM canvases
    WHERE id = canvas_uuid;
    
    -- If canvas doesn't exist, return false
    IF canvas_owner IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user is owner or collaborator
    IF canvas_owner = user_uuid THEN
        is_collaborator := TRUE;
    ELSE
        SELECT EXISTS(
            SELECT 1 FROM canvas_collaborators
            WHERE canvas_id = canvas_uuid
            AND user_id = user_uuid
            AND accepted_at IS NOT NULL
        ) INTO is_collaborator;
    END IF;
    
    -- If user has access, update/insert presence
    IF is_collaborator THEN
        INSERT INTO canvas_presence (
            canvas_id,
            user_id,
            last_seen_at,
            is_active
        )
        VALUES (
            canvas_uuid,
            user_uuid,
            NOW(),
            TRUE
        )
        ON CONFLICT (canvas_id, user_id)
        DO UPDATE SET
            last_seen_at = NOW(),
            is_active = TRUE;
            
        -- Update collaborator's last accessed time
        UPDATE canvas_collaborators
        SET last_accessed_at = NOW()
        WHERE canvas_id = canvas_uuid
        AND user_id = user_uuid;
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

-- Function to get canvas with user permission
CREATE OR REPLACE FUNCTION get_canvas_with_permission(
    canvas_uuid UUID,
    user_uuid UUID
)
RETURNS TABLE (
    canvas_data JSONB,
    user_permission TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    canvas_record RECORD;
    permission TEXT;
BEGIN
    -- Get canvas data
    SELECT * INTO canvas_record
    FROM canvases
    WHERE id = canvas_uuid;
    
    -- If canvas doesn't exist, return null
    IF canvas_record IS NULL THEN
        RETURN;
    END IF;
    
    -- Determine user permission
    IF canvas_record.created_by = user_uuid THEN
        permission := 'admin';
    ELSE
        SELECT permission_level INTO permission
        FROM canvas_collaborators
        WHERE canvas_id = canvas_uuid
        AND user_id = user_uuid
        AND accepted_at IS NOT NULL;
        
        -- If not a collaborator, check if canvas is public
        IF permission IS NULL AND canvas_record.is_public THEN
            permission := 'view';
        END IF;
    END IF;
    
    -- Return canvas data and permission
    RETURN QUERY
    SELECT
        row_to_json(canvas_record)::jsonb as canvas_data,
        permission as user_permission;
END;
$$;

-- Function to clean up inactive presence
CREATE OR REPLACE FUNCTION cleanup_inactive_presence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cleanup_count INTEGER;
BEGIN
    -- Mark users as inactive if they haven't been seen in 5 minutes
    UPDATE canvas_presence
    SET is_active = FALSE
    WHERE is_active = TRUE
    AND last_seen_at < NOW() - INTERVAL '5 minutes';
    
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    -- Delete presence records older than 1 hour
    DELETE FROM canvas_presence
    WHERE last_seen_at < NOW() - INTERVAL '1 hour';
    
    RETURN cleanup_count;
END;
$$;

-- Function to get canvas collaborators with presence
CREATE OR REPLACE FUNCTION get_canvas_collaborators_with_presence(
    canvas_uuid UUID
)
RETURNS TABLE (
    collaborator_id UUID,
    user_id UUID,
    permission_level TEXT,
    user_email TEXT,
    user_name TEXT,
    user_avatar_url TEXT,
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    is_online BOOLEAN,
    last_seen_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id as collaborator_id,
        cc.user_id,
        cc.permission_level,
        u.email as user_email,
        (u.raw_user_meta_data->>'name') as user_name,
        (u.raw_user_meta_data->>'avatar_url') as user_avatar_url,
        cc.invited_at,
        cc.accepted_at,
        cc.last_accessed_at,
        COALESCE(cp.is_active, FALSE) as is_online,
        cp.last_seen_at
    FROM canvas_collaborators cc
    JOIN auth.users u ON cc.user_id = u.id
    LEFT JOIN canvas_presence cp ON cc.canvas_id = cp.canvas_id AND cc.user_id = cp.user_id
    WHERE cc.canvas_id = canvas_uuid
    ORDER BY cc.invited_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_canvas_permission(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_canvas_activity(UUID, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_canvas_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_canvas_with_permission(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_inactive_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION get_canvas_collaborators_with_presence(UUID) TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_canvas_collaborators_canvas_user 
ON canvas_collaborators(canvas_id, user_id);

CREATE INDEX IF NOT EXISTS idx_canvas_collaborators_user_permission 
ON canvas_collaborators(user_id, permission_level);

CREATE INDEX IF NOT EXISTS idx_canvas_presence_canvas_user 
ON canvas_presence(canvas_id, user_id);

CREATE INDEX IF NOT EXISTS idx_canvas_presence_active 
ON canvas_presence(is_active, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_canvas_activity_canvas_created 
ON canvas_activity(canvas_id, created_at DESC);

-- Create a scheduled job to clean up inactive presence (if pg_cron is available)
-- This would typically be set up separately in your Supabase dashboard
-- SELECT cron.schedule('cleanup-presence', '*/5 * * * *', 'SELECT cleanup_inactive_presence();');