-- ============================================================================
-- Enforce unique kanban links across from/to/relation
-- ============================================================================

-- Remove duplicates first so the unique constraint can always be created.
WITH ranked_links AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY from_card_id, to_card_id, relation
            ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
    FROM kanban_links
)
DELETE FROM kanban_links
WHERE id IN (
    SELECT id
    FROM ranked_links
    WHERE rn > 1
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'kanban_links'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (from_card_id, to_card_id, relation)'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'kanban_links'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(from_card_id, to_card_id, relation)%'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'kanban_links_from_to_relation_unique'
              AND conrelid = 'kanban_links'::regclass
        ) THEN
            ALTER TABLE kanban_links
            ADD CONSTRAINT kanban_links_from_to_relation_unique
            UNIQUE (from_card_id, to_card_id, relation);
        END IF;
    END IF;
END $$;
