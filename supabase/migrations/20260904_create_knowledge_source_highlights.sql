-- PDF-R6K-H2A: standalone PDF text highlights.
--
-- Until now a visual highlight was not an object at all. It was a read-time
-- projection of `source_references` -- a Note's citation -- so deleting the
-- highlight meant deleting the citation, and `target_padlet_id NOT NULL
-- REFERENCES padlets(id) ON DELETE CASCADE` meant deleting the Note deleted the
-- highlight. This table separates the two:
--
--   source_references          Note -> source provenance ("Used in Notes")
--   knowledge_source_highlights  a visual annotation of one exact text span
--
-- They may describe the same passage while remaining independent rows. Nothing
-- here changes source_references, and no rendering switches in this migration.
--
-- The span model is deliberately NOT new. It is the one the reader already
-- resolves through `resolveKnowledgeSourceSpan`: page-relative UTF-16 code-unit
-- offsets, half-open [char_start, char_end), addressable with String.slice, plus
-- the quote itself so a drifted offset can still be recovered at read time.

CREATE TABLE IF NOT EXISTS public.knowledge_source_highlights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The ONLY authority relation. There is deliberately no board_id column:
    -- the board is reached through the document, so a client can never present
    -- a board of its own choosing alongside someone else's document.
    source_document_id uuid NOT NULL
        REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,

    -- Single page, not a range. The span resolver refuses cross-page spans
    -- outright (`unsupported_cross_page`), so a range here would describe
    -- something no reader could ever paint.
    page_number integer NOT NULL,

    -- Both NOT NULL, unlike a citation's: a page-only citation is a meaningful
    -- provenance record, but a highlight with no span is not an annotation.
    char_start integer NOT NULL,
    char_end integer NOT NULL,

    -- The passage as it read when the highlight was made. Required for the same
    -- reason the resolver requires it: offsets drift when a document is
    -- re-extracted, and the quote is what recovers the location.
    quote_text text NOT NULL,
    -- Nullable, matching source_references.quote_hash. The hash is produced by
    -- the server writer (sha256 of the quote, hex), but making it NOT NULL would
    -- turn any future writer that has not yet hashed into a hard failure rather
    -- than a recoverable one.
    quote_hash text,

    -- The highlight's OWN colour, in the same representation Notes already use
    -- for `metadata.topStrip`: a CSS hex string (#rgb, #rrggbb or #rrggbbaa).
    -- No second colour format is introduced. Ownership is the point -- once the
    -- renderer switches, recolouring a Note no longer rewrites a highlight.
    color text NOT NULL,

    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Optional provenance of the highlight itself: which citation it was born
    -- with, where it was born with one at all. SET NULL and not CASCADE is the
    -- whole product decision in one clause -- deleting the Note (which cascades
    -- to its citation) must leave the highlight standing, merely orphaned of its
    -- origin. A highlight created on its own carries NULL here forever.
    source_reference_id uuid
        REFERENCES public.source_references(id) ON DELETE SET NULL,

    CONSTRAINT knowledge_source_highlights_page_check
        CHECK (page_number >= 1),
    CONSTRAINT knowledge_source_highlights_span_check
        CHECK (char_start >= 0 AND char_end > char_start),
    -- An empty quote could never be found again by the fallback resolver.
    CONSTRAINT knowledge_source_highlights_quote_check
        CHECK (length(quote_text) > 0),
    -- Format enforced here as well as in the domain: the column is the last
    -- place a stray `red`, `url(...)` or empty string can be refused.
    CONSTRAINT knowledge_source_highlights_color_check
        CHECK (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$')
);

-- The read path: every highlight painted on one page of one document.
CREATE INDEX IF NOT EXISTS knowledge_source_highlights_document_page_idx
    ON public.knowledge_source_highlights(source_document_id, page_number);

-- ONE highlight per originating citation. This is what makes the legacy
-- backfill convergent rather than merely repeatable: a rerun conflicts instead
-- of inserting a second copy. It constrains ORIGIN only -- a citation and a
-- highlight may still describe the same passage independently, and a future
-- slice may model many-Notes-to-one-highlight without touching this row shape.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_source_highlights_origin_uidx
    ON public.knowledge_source_highlights(source_reference_id)
    WHERE source_reference_id IS NOT NULL;

DROP TRIGGER IF EXISTS knowledge_source_highlights_updated_at
    ON public.knowledge_source_highlights;
CREATE TRIGGER knowledge_source_highlights_updated_at
    BEFORE UPDATE ON public.knowledge_source_highlights
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.knowledge_source_highlights ENABLE ROW LEVEL SECURITY;

-- READ: anyone who may read the document may see its highlights. This is the
-- same owner-or-member predicate `source_references_select` uses, reached
-- through the document alone.
CREATE POLICY knowledge_source_highlights_select
    ON public.knowledge_source_highlights FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_source_highlights.source_document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(d.board_id, auth.uid())
              )
        )
    );

-- WRITE: board owner or an EDITOR collaborator, proved through the document's
-- board. `is_board_member` is deliberately NOT used here -- it is role-agnostic
-- and admits viewers and readonly collaborators, which would let a viewer
-- annotate shared Knowledge. `manager` is not admitted either: source_references
-- does not admit it today, and widening one surface alone would make the two
-- disagree. See MANAGER_KNOWLEDGE_WRITE_ROLE_DEBT.
--
-- USING governs which existing rows may be updated or deleted; WITH CHECK
-- governs the row an INSERT or UPDATE leaves behind. Both are required: without
-- WITH CHECK an editor of board A could insert a highlight naming a document on
-- board B, and without USING they could delete one.
CREATE POLICY knowledge_source_highlights_write
    ON public.knowledge_source_highlights FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_source_highlights.source_document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_source_highlights.source_document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    );

COMMENT ON TABLE public.knowledge_source_highlights IS
    'PDF-R6K-H2A standalone visual highlight of one exact PDF text span. Independent of source_references: deleting a highlight never affects a Note, its citation, or Used in Notes.';
COMMENT ON COLUMN public.knowledge_source_highlights.char_start IS
    'Page-relative UTF-16 code-unit offset, half-open [char_start, char_end). Same span model as source_references.';
COMMENT ON COLUMN public.knowledge_source_highlights.color IS
    'CSS hex string, the representation Notes already use for metadata.topStrip. Owned by the highlight once the renderer switches (HIGHLIGHT_COLOR_OWNERSHIP_SPLIT).';
COMMENT ON COLUMN public.knowledge_source_highlights.source_reference_id IS
    'Optional origin citation. ON DELETE SET NULL so deleting a Note orphans but never destroys the highlight.';
