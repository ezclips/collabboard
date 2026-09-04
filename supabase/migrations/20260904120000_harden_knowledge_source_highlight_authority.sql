-- PDF-R6K-H2A-C1: close the three DB-side gaps the security review found.
--
-- H2A shipped correct ROW security and then relied on a typed TypeScript
-- repository for everything else. It isn't a boundary. Supabase grants
-- `authenticated` table-wide INSERT/UPDATE, and RLS says which ROWS a caller
-- may touch, never which COLUMNS -- so any signed-in editor could bypass the
-- route with a direct PostgREST call and:
--
--   1. rewrite char_start/char_end/page_number/quote_text/quote_hash/
--      created_by/source_reference_id on any highlight they can write,
--   2. insert created_by = someone else's uuid,
--   3. point source_reference_id at a citation belonging to another document
--      (which also consumes that citation's unique backfill-origin slot).
--
-- All three were proved by execution, not inferred. This migration moves each
-- invariant into the database. It changes no policy: RLS was already right.

-- ---------------------------------------------------------------------------
-- PART A. Column authority.
--
-- Revoke wholesale, then grant back exactly what the product needs. Revoking
-- first is what makes this deterministic rather than additive -- it also drops
-- TRUNCATE, which is worth naming: TRUNCATE BYPASSES RLS ENTIRELY, so a role
-- holding it could empty the table regardless of any policy above.
--
-- `anon` is included for completeness. Both policies are TO authenticated, so
-- anon could never satisfy one; leaving it holding write grants is a
-- contradiction waiting for a future policy edit to activate.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.knowledge_source_highlights FROM authenticated, anon;

-- Reads stay table-wide: RLS is the row filter, and every column of a row a
-- caller may see is already theirs to see.
GRANT SELECT ON TABLE public.knowledge_source_highlights TO authenticated;

-- Deleting is all-or-nothing by nature, so it stays table-level and RLS decides
-- which rows are reachable.
GRANT DELETE ON TABLE public.knowledge_source_highlights TO authenticated;

-- INSERT: only the fields a person actually draws. `id`, `created_at` and
-- `updated_at` are database-owned, and `created_by` is deliberately absent --
-- see PART B, where its absence is what makes authorship truthful.
GRANT INSERT (
    source_document_id,
    page_number,
    char_start,
    char_end,
    quote_text,
    quote_hash,
    color,
    source_reference_id
) ON TABLE public.knowledge_source_highlights TO authenticated;

-- UPDATE: the colour, and nothing else. A highlight's span, quote, document,
-- author and origin are settled when it is created; changing any of them would
-- make it a different annotation wearing the same id.
--
-- The updated_at trigger keeps working: a trigger modifies the row as the table
-- owner and is not subject to the caller's column privileges.
GRANT UPDATE (color) ON TABLE public.knowledge_source_highlights TO authenticated;

-- ---------------------------------------------------------------------------
-- PART B. Truthful authorship.
--
-- With no INSERT privilege on created_by, an authenticated caller cannot name
-- an author at all -- not another user's uuid, and not an explicit NULL. Naming
-- the column is itself the permission error, so both forgeries fail the same
-- way. Omitting it lets this default fill in the caller's own identity.
--
-- Legacy backfill is deliberately still able to write NULL: it runs under
-- service/postgres authority, which keeps full column privileges, and
-- source_references records no historical citation author to recover. A NULL
-- author is the honest answer there; inventing one would be a fabrication.
-- ---------------------------------------------------------------------------
ALTER TABLE public.knowledge_source_highlights
    ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ---------------------------------------------------------------------------
-- PART C. Origin citation integrity.
--
-- A highlight's optional origin must describe the SAME document the highlight
-- annotates. The foreign key alone cannot say that -- it only proves the
-- citation exists somewhere.
--
-- A trigger rather than a composite foreign key: the FK would need
-- (source_reference_id, source_document_id) REFERENCES source_references
-- (id, source_document_id) ON DELETE SET NULL, and that action would try to
-- null BOTH referencing columns, including the NOT NULL source_document_id.
-- Deleting a Note would then fail instead of orphaning the annotation, which is
-- the opposite of the independence this whole feature exists to provide.
--
-- SECURITY DEFINER so integrity never depends on the caller's read visibility:
-- a citation the caller cannot SELECT must still be checked, not treated as
-- absent for one caller and present for another.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_source_highlight_origin_matches_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- A standalone highlight has no origin to check, and this is also the path
    -- the FK's ON DELETE SET NULL takes when a citation disappears.
    IF NEW.source_reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.source_references r
        WHERE r.id = NEW.source_reference_id
          AND r.source_document_id = NEW.source_document_id
    ) THEN
        -- Says only that the link is invalid. It reveals no citation content,
        -- and does not distinguish "belongs to another document" from "does not
        -- exist" -- which would otherwise let a caller probe for citation ids.
        RAISE EXCEPTION
            'highlight origin citation does not belong to this source document'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger-only: it is an integrity mechanism, never a callable API.
REVOKE ALL ON FUNCTION public.knowledge_source_highlight_origin_matches_document()
    FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS knowledge_source_highlights_origin_check
    ON public.knowledge_source_highlights;
CREATE TRIGGER knowledge_source_highlights_origin_check
    BEFORE INSERT OR UPDATE OF source_reference_id, source_document_id
    ON public.knowledge_source_highlights
    FOR EACH ROW
    EXECUTE FUNCTION public.knowledge_source_highlight_origin_matches_document();

COMMENT ON FUNCTION public.knowledge_source_highlight_origin_matches_document() IS
    'PDF-R6K-H2A-C1: an origin citation must belong to the same source document as the highlight. Trigger-only; not a callable API.';
