-- Workspace Settings Migration
-- Run this in Supabase SQL Editor

-- ===========================================
-- 1. Create workspace_settings table
-- ===========================================

CREATE TABLE IF NOT EXISTS workspace_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
    workspace_name text NOT NULL DEFAULT 'My Workspace',
    workspace_logo text,
    workspace_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS workspace_settings_user_id_idx ON workspace_settings(user_id);

-- ===========================================
-- 2. Enable Row Level Security
-- ===========================================

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- Policies for workspace_settings
CREATE POLICY "Users can view their own workspace settings"
    ON workspace_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workspace settings"
    ON workspace_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workspace settings"
    ON workspace_settings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workspace settings"
    ON workspace_settings FOR DELETE
    USING (auth.uid() = user_id);

-- ===========================================
-- 3. Add missing columns to profiles table (if they don't exist)
-- ===========================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

-- ===========================================
-- 4. Create user_preferences table
-- ===========================================

CREATE TABLE IF NOT EXISTS user_preferences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
    theme text DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    language text DEFAULT 'en',
    email_notifications boolean DEFAULT true,
    push_notifications boolean DEFAULT false,
    notification_board_invites boolean DEFAULT true,
    notification_comments boolean DEFAULT true,
    notification_updates boolean DEFAULT true,
    notification_marketing boolean DEFAULT false,
    email_frequency text DEFAULT 'daily' CHECK (email_frequency IN ('immediate', 'daily', 'weekly', 'never')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences(user_id);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for user_preferences
CREATE POLICY "Users can view their own preferences"
    ON user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
    ON user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
    ON user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- ===========================================
-- 5. Create AI settings table
-- ===========================================

CREATE TABLE IF NOT EXISTS ai_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
    enabled boolean DEFAULT false,
    provider text DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'google')),
    api_key_encrypted text, -- Store encrypted API key
    feature_text_generation boolean DEFAULT true,
    feature_image_generation boolean DEFAULT true,
    feature_summarization boolean DEFAULT true,
    feature_translation boolean DEFAULT true,
    usage_limit integer DEFAULT 1000,
    current_usage integer DEFAULT 0,
    usage_reset_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index
CREATE INDEX IF NOT EXISTS ai_settings_user_id_idx ON ai_settings(user_id);

-- Enable RLS
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

-- Policies for ai_settings
CREATE POLICY "Users can view their own AI settings"
    ON ai_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI settings"
    ON ai_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI settings"
    ON ai_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- ===========================================
-- 6. Create activity_logs table
-- ===========================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    action text NOT NULL,
    actor_email text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    target_name text,
    details jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON activity_logs(action);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy for activity_logs
CREATE POLICY "Users can view their own activity logs"
    ON activity_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity logs"
    ON activity_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- 7. Create workspace_members table (for team features)
-- ===========================================

CREATE TABLE IF NOT EXISTS workspace_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_owner_id uuid REFERENCES auth.users(id) NOT NULL,
    member_user_id uuid REFERENCES auth.users(id),
    member_email text NOT NULL,
    role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status text DEFAULT 'invited' CHECK (status IN ('active', 'pending', 'invited', 'removed')),
    invite_token text,
    invited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS workspace_members_owner_idx ON workspace_members(workspace_owner_id);
CREATE INDEX IF NOT EXISTS workspace_members_member_idx ON workspace_members(member_user_id);
CREATE INDEX IF NOT EXISTS workspace_members_email_idx ON workspace_members(member_email);

-- Enable RLS
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Policies for workspace_members
CREATE POLICY "Workspace owners can view their members"
    ON workspace_members FOR SELECT
    USING (auth.uid() = workspace_owner_id OR auth.uid() = member_user_id);

CREATE POLICY "Workspace owners can insert members"
    ON workspace_members FOR INSERT
    WITH CHECK (auth.uid() = workspace_owner_id);

CREATE POLICY "Workspace owners can update their members"
    ON workspace_members FOR UPDATE
    USING (auth.uid() = workspace_owner_id);

CREATE POLICY "Workspace owners can delete their members"
    ON workspace_members FOR DELETE
    USING (auth.uid() = workspace_owner_id);

-- ===========================================
-- 8. Create workspace_invitations table (for invite links and email invites)
-- ===========================================

CREATE TABLE IF NOT EXISTS workspace_invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL CHECK (type IN ('email', 'link')),
    email text, -- For email invitations
    link_code text UNIQUE, -- For link invitations (unique invite code)
    role text DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    max_uses integer, -- NULL means unlimited
    uses integer DEFAULT 0,
    email_domain text, -- Optional: restrict link to specific domain
    created_by uuid REFERENCES auth.users(id) NOT NULL,
    expires_at timestamp with time zone,
    redeemed_at timestamp with time zone, -- NULL means not redeemed
    redeemed_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS workspace_invitations_link_code_idx ON workspace_invitations(link_code);
CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS workspace_invitations_created_by_idx ON workspace_invitations(created_by);
CREATE INDEX IF NOT EXISTS workspace_invitations_expires_at_idx ON workspace_invitations(expires_at);

-- Enable RLS
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for workspace_invitations
CREATE POLICY "Users can view their own invitations"
    ON workspace_invitations FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY "Users can insert invitations"
    ON workspace_invitations FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own invitations"
    ON workspace_invitations FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own invitations"
    ON workspace_invitations FOR DELETE
    USING (auth.uid() = created_by);

-- Public policy to allow checking invite links (for redemption)
CREATE POLICY "Anyone can view active link invitations by code"
    ON workspace_invitations FOR SELECT
    USING (
        type = 'link' 
        AND link_code IS NOT NULL 
        AND (expires_at IS NULL OR expires_at > now())
        AND (max_uses IS NULL OR uses < max_uses)
    );
