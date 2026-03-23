-- ============================================================================
-- STEP 1 OF 2: DIAGNOSTIC — Run this FIRST, screenshot/copy the results
-- ============================================================================
-- This tells us the exact state of your database so we know what to fix.

-- Check 1: What type is canvases.id?
SELECT 'canvases.id type' AS check_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'canvases' AND column_name = 'id';

-- Check 2: Do kanban tables exist, and what type is canvas_id?
SELECT 'kanban canvas_id types' AS check_name, table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name LIKE 'kanban_%' AND column_name = 'canvas_id';

-- Check 3: What type are kanban entity IDs?
SELECT 'kanban entity IDs' AS check_name, table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name LIKE 'kanban_%' AND column_name = 'id';

-- Check 4: All tables that reference canvases
SELECT
    'FK references to canvases' AS check_name,
    tc.table_name AS referencing_table,
    kcu.column_name AS referencing_column,
    ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'canvases';

-- Check 5: Does the migration mapping table exist?
SELECT 'migration artifacts' AS check_name, table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = '_canvases_id_migration';
