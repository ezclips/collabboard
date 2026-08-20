-- Knowledge source PDFs are private binary artifacts.
--
-- This is intentionally a normal post-baseline migration.  It provisions only
-- the Knowledge bucket; the existing public application buckets are untouched.
-- No MIME allow-list is set yet: P4D also reserves raw_artifact_path for a
-- future parser artifact whose media type is not fixed by this patch.
INSERT INTO storage.buckets (id, name, public)
VALUES (
    'knowledge-documents',
    'knowledge-documents',
    false
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false;
