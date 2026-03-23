-- ============================================================================
-- Kanban comments data migration (no-op)
-- ============================================================================
-- Context:
-- - Historical kanban comments were not persisted in DB.
-- - `kanban_cards` has no comment column, and adapter write paths only persist
--   core card fields plus `reference` (attachments), not comments.
-- Decision:
-- - Big-bang cutover to `kanban_comments` as the only source of truth.
-- - No dual-read period required.

DO $$
BEGIN
    RAISE NOTICE 'No legacy kanban comment records to migrate. Cutover is complete.';
END $$;
