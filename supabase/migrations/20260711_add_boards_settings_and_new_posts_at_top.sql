-- Migration: Add boards.settings and boards.new_posts_at_top
--
-- Neither column exists on the live boards table, despite being referenced by
-- existing code: handleMapStyleChange and handleChronoModeChange in
-- CanvasClient.tsx already write to boards.settings (pre-existing, silently
-- failing with PGRST204 in production), and CanvasSettingsModal's new "Title
-- banner" toggle needs settings.showTitleHeader. new_posts_at_top backs the
-- "New Posts at Top" switch in CanvasSetupPage.tsx.

ALTER TABLE "public"."boards"
  ADD COLUMN IF NOT EXISTS "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "new_posts_at_top" boolean DEFAULT true;
