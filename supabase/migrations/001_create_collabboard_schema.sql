-- 📄 supabase/migrations/001_create_collabboard_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE canvas_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE section_type AS ENUM ('text', 'image', 'video', 'audio', 'file', 'link', 'drawing', 'sticky_note', 'shape');
CREATE TYPE item_type AS ENUM ('text', 'image', 'video', 'audio', 'file', 'link', 'drawing', 'sticky_note', 'shape', 'comment');
CREATE TYPE permission_level AS ENUM ('view', 'comment', 'edit', 'admin');

-- Canvases table
CREATE TABLE canvases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    status canvas_status DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    view_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT false,
    tags TEXT[] DEFAULT '{}',
    
    -- Add indexes for performance
    CONSTRAINT canvases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Canvas sections table
CREATE TABLE canvas_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type section_type NOT NULL,
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    width REAL DEFAULT 300,
    height REAL DEFAULT 200,
    z_index INTEGER DEFAULT 0,
    background_color VARCHAR(7) DEFAULT '#ffffff',
    border_color VARCHAR(7) DEFAULT '#e5e7eb',
    border_width INTEGER DEFAULT 1,
    border_radius INTEGER DEFAULT 8,
    opacity REAL DEFAULT 1.0,
    is_locked BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canvas items table (content within sections)
CREATE TABLE canvas_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES canvas_sections(id) ON DELETE CASCADE,
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    type item_type NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    width REAL DEFAULT 100,
    height REAL DEFAULT 100,
    z_index INTEGER DEFAULT 0,
    rotation REAL DEFAULT 0,
    scale_x REAL DEFAULT 1,
    scale_y REAL DEFAULT 1,
    opacity REAL DEFAULT 1.0,
    is_locked BOOLEAN DEFAULT false,
    style_properties JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canvas collaborators table
CREATE TABLE canvas_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_level permission_level NOT NULL DEFAULT 'view',
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    
    -- Unique constraint to prevent duplicate collaborators
    UNIQUE(canvas_id, user_id)
);

-- Comments table
CREATE TABLE canvas_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    section_id UUID REFERENCES canvas_sections(id) ON DELETE CASCADE,
    item_id UUID REFERENCES canvas_items(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES canvas_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    position_x REAL,
    position_y REAL,
    is_resolved BOOLEAN DEFAULT false,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canvas activity log
CREATE TABLE canvas_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- File uploads table
CREATE TABLE canvas_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    item_id UUID REFERENCES canvas_items(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Real-time presence table
CREATE TABLE canvas_presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cursor_x REAL,
    cursor_y REAL,
    current_section_id UUID REFERENCES canvas_sections(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'active',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint for one presence per user per canvas
    UNIQUE(canvas_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX idx_canvases_created_by ON canvases(created_by);
CREATE INDEX idx_canvases_status ON canvases(status);
CREATE INDEX idx_canvases_updated_at ON canvases(updated_at);
CREATE INDEX idx_canvases_is_public ON canvases(is_public);

CREATE INDEX idx_canvas_sections_canvas_id ON canvas_sections(canvas_id);
CREATE INDEX idx_canvas_sections_position ON canvas_sections(position_x, position_y);
CREATE INDEX idx_canvas_sections_z_index ON canvas_sections(z_index);

CREATE INDEX idx_canvas_items_section_id ON canvas_items(section_id);
CREATE INDEX idx_canvas_items_canvas_id ON canvas_items(canvas_id);
CREATE INDEX idx_canvas_items_type ON canvas_items(type);
CREATE INDEX idx_canvas_items_position ON canvas_items(position_x, position_y);
CREATE INDEX idx_canvas_items_z_index ON canvas_items(z_index);

CREATE INDEX idx_canvas_collaborators_canvas_id ON canvas_collaborators(canvas_id);
CREATE INDEX idx_canvas_collaborators_user_id ON canvas_collaborators(user_id);
CREATE INDEX idx_canvas_collaborators_permission ON canvas_collaborators(permission_level);

CREATE INDEX idx_canvas_comments_canvas_id ON canvas_comments(canvas_id);
CREATE INDEX idx_canvas_comments_section_id ON canvas_comments(section_id);
CREATE INDEX idx_canvas_comments_item_id ON canvas_comments(item_id);
CREATE INDEX idx_canvas_comments_parent ON canvas_comments(parent_comment_id);

CREATE INDEX idx_canvas_activity_canvas_id ON canvas_activity(canvas_id);
CREATE INDEX idx_canvas_activity_user_id ON canvas_activity(user_id);
CREATE INDEX idx_canvas_activity_created_at ON canvas_activity(created_at);

CREATE INDEX idx_canvas_files_canvas_id ON canvas_files(canvas_id);
CREATE INDEX idx_canvas_files_item_id ON canvas_files(item_id);

CREATE INDEX idx_canvas_presence_canvas_id ON canvas_presence(canvas_id);
CREATE INDEX idx_canvas_presence_user_id ON canvas_presence(user_id);
CREATE INDEX idx_canvas_presence_last_seen ON canvas_presence(last_seen);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_canvases_updated_at BEFORE UPDATE ON canvases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_sections_updated_at BEFORE UPDATE ON canvas_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_items_updated_at BEFORE UPDATE ON canvas_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_comments_updated_at BEFORE UPDATE ON canvas_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_presence ENABLE ROW LEVEL SECURITY;

-- Canvas policies
CREATE POLICY "Users can view their own canvases" ON canvases
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can view public canvases" ON canvases
    FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view canvases they collaborate on" ON canvases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM canvas_collaborators 
            WHERE canvas_id = canvases.id 
            AND user_id = auth.uid()
            AND accepted_at IS NOT NULL
        )
    );

CREATE POLICY "Users can create canvases" ON canvases
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own canvases" ON canvases
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Canvas admins can update canvases" ON canvases
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM canvas_collaborators 
            WHERE canvas_id = canvases.id 
            AND user_id = auth.uid()
            AND permission_level = 'admin'
            AND accepted_at IS NOT NULL
        )
    );

CREATE POLICY "Users can delete their own canvases" ON canvases
    FOR DELETE USING (auth.uid() = created_by);

-- Canvas sections policies
CREATE POLICY "Users can view sections of accessible canvases" ON canvas_sections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM canvases 
            WHERE id = canvas_sections.canvas_id 
            AND (
                created_by = auth.uid() 
                OR is_public = true
                OR EXISTS (
                    SELECT 1 FROM canvas_collaborators 
                    WHERE canvas_id = canvases.id 
                    AND user_id = auth.uid()
                    AND accepted_at IS NOT NULL
                )
            )
        )
    );

CREATE POLICY "Users can create sections in accessible canvases" ON canvas_sections
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM canvases 
            WHERE id = canvas_sections.canvas_id 
            AND (
                created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM canvas_collaborators 
                    WHERE canvas_id = canvases.id 
                    AND user_id = auth.uid()
                    AND permission_level IN ('edit', 'admin')
                    AND accepted_at IS NOT NULL
                )
            )
        )
    );

CREATE POLICY "Users can update sections in editable canvases" ON canvas_sections
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM canvases 
            WHERE id = canvas_sections.canvas_id 
            AND (
                created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM canvas_collaborators 
                    WHERE canvas_id = canvases.id 
                    AND user_id = auth.uid()
                    AND permission_level IN ('edit', 'admin')
                    AND accepted_at IS NOT NULL
                )
            )
        )
    );

CREATE POLICY "Users can delete sections in editable canvases" ON canvas_sections
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM canvases 
            WHERE id = canvas_sections.canvas_id 
            AND (
                created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM canvas_collaborators 
                    WHERE canvas_id = canvases.id 
                    AND user_id = auth.uid()
                    AND permission_level IN ('edit', 'admin')
                    AND accepted_at IS NOT NULL
                )
            )
        )
    );

-- Similar policies for canvas_items, canvas_comments, etc.
-- (Following the same pattern as canvas_sections)

-- Canvas collaborators policies
CREATE POLICY "Users can view collaborators of their canvases" ON canvas_collaborators
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM canvases 
            WHERE id = canvas_collaborators.canvas_id 
            AND (
                created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM canvas_collaborators c2
                    WHERE c2.canvas_id = canvases.id 
                    AND c2.user_id = auth.uid()
                    AND c2.accepted_at IS NOT NULL
                )
            )
        )
    );

CREATE POLICY "Canvas owners can manage collaborators" ON canvas_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM canvases 
            WHERE id = canvas_collaborators.canvas_id 
            AND created_by = auth.uid()
        )
    );

CREATE POLICY "Canvas admins can manage collaborators" ON canvas_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM canvas_collaborators c2
            WHERE c2.canvas_id = canvas_collaborators.canvas_id
            AND c2.user_id = auth.uid()
            AND c2.permission_level = 'admin'
            AND c2.accepted_at IS NOT NULL
        )
    );

-- Functions for common operations
CREATE OR REPLACE FUNCTION get_user_canvas_permission(canvas_uuid UUID, user_uuid UUID)
RETURNS permission_level AS $$
DECLARE
    result permission_level;
BEGIN
    -- Check if user is canvas owner
    SELECT 'admin' INTO result
    FROM canvases
    WHERE id = canvas_uuid AND created_by = user_uuid;
    
    IF result IS NOT NULL THEN
        RETURN result;
    END IF;
    
    -- Check collaborator permission
    SELECT permission_level INTO result
    FROM canvas_collaborators
    WHERE canvas_id = canvas_uuid 
    AND user_id = user_uuid 
    AND accepted_at IS NOT NULL;
    
    IF result IS NOT NULL THEN
        RETURN result;
    END IF;
    
    -- Check if canvas is public
    SELECT 'view' INTO result
    FROM canvases
    WHERE id = canvas_uuid AND is_public = true;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log canvas activity
CREATE OR REPLACE FUNCTION log_canvas_activity(
    canvas_uuid UUID,
    user_uuid UUID,
    action_name TEXT,
    target_type_name TEXT DEFAULT NULL,
    target_uuid UUID DEFAULT NULL,
    activity_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO canvas_activity (
        canvas_id, user_id, action, target_type, target_id, details
    ) VALUES (
        canvas_uuid, user_uuid, action_name, target_type_name, target_uuid, activity_details
    ) RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update canvas last_accessed_at
CREATE OR REPLACE FUNCTION update_canvas_access(canvas_uuid UUID, user_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE canvases 
    SET last_accessed_at = NOW(), view_count = view_count + 1
    WHERE id = canvas_uuid;
    
    -- Update or insert presence
    INSERT INTO canvas_presence (canvas_id, user_id, last_seen)
    VALUES (canvas_uuid, user_uuid, NOW())
    ON CONFLICT (canvas_id, user_id)
    DO UPDATE SET last_seen = NOW(), status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;