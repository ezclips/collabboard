-- CollabBoard PDF-R6K standalone PDF highlights production rollout.
--
-- SOURCE, in this exact order:
--   1. supabase/migrations/20260904_create_knowledge_source_highlights.sql
--   2. supabase/migrations/20260904120000_harden_knowledge_source_highlight_authority.sql
--   3. supabase/migrations/20260904140000_create_knowledge_source_citation_with_highlight.sql
--
-- The DDL, policies, grants and functions below are a faithful copy of those
-- three reviewed migrations. Nothing is improved, reordered or redesigned here;
-- this file only adds the preflight and postflight that make it safe to run
-- once against production. The three migrations themselves are untouched.
--
-- Run this file as one PostgreSQL statement batch. It is intentionally not a
-- Supabase CLI migration: `[db.migrations] enabled = false` in config.toml and
-- supabase/BASELINE.md records that supabase/migrations/ does not rebuild the
-- live database.
--
-- What it does NOT touch: source_references rows or privileges, padlets,
-- knowledge_documents, knowledge_pages, storage buckets, storage policies, or
-- any row of user data. It creates one table, its policies and grants, one
-- integrity trigger and one citation function.
--
-- AFTER THIS ROLLOUT: DO NOT DEPLOY THE H2B APPLICATION CODE YET.
--
-- The reader and the canvas card paint from knowledge_source_highlights ONLY.
-- There is deliberately no citation fallback, so deploying that code against an
-- EMPTY highlight table would make every existing highlight disappear from
-- every PDF. Required next gates, in order:
--   1. PRODUCTION STANDALONE HIGHLIGHT BACKFILL
--   2. BACKFILL VERIFICATION
--   3. only then deploy the renderer
--
-- NO BACKFILL IS PERFORMED OR ATTEMPTED HERE. Deriving the legacy highlights
-- needs resolveKnowledgeSourceSpan (offset + quote-fallback recovery) and the
-- Note accent-colour authority; reimplementing either in SQL would produce
-- marks the reader never painted. This file copies no citation offsets,
-- invents no authorship and manufactures no page-only highlights.

BEGIN;

-- Fail before any schema or privilege mutation unless production is in one of
-- exactly two recognised states.
--
--   PRE-R6K   none of the three feature objects exist  -> apply
--   POST-R6K  all three exist                          -> re-apply (idempotent)
--   anything else                                      -> ABORT
--
-- A partial state is never repaired automatically: the operator is told what
-- was found and decides.
DO $preflight$
DECLARE
    prerequisites constant text[] := ARRAY[
        'public.boards',
        'public.board_collaborators',
        'public.padlets',
        'public.knowledge_documents',
        'public.source_references'
    ];
    prerequisite text;
    present_objects integer := 0;
BEGIN
    -- The live Knowledge architecture this feature hangs off. Every one is a
    -- foreign key target, an RLS join target, or both.
    FOREACH prerequisite IN ARRAY prerequisites LOOP
        IF to_regclass(prerequisite) IS NULL THEN
            RAISE EXCEPTION
                'PDF-R6K rollout preflight failed: % is missing', prerequisite;
        END IF;
    END LOOP;

    -- The authorization helper the READ policy calls, and the timestamp
    -- trigger the table reuses. Both predate this feature.
    IF to_regprocedure('public.is_board_member(uuid, uuid)') IS NULL THEN
        RAISE EXCEPTION
            'PDF-R6K rollout preflight failed: public.is_board_member(uuid, uuid) is missing';
    END IF;
    IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
        RAISE EXCEPTION
            'PDF-R6K rollout preflight failed: public.update_updated_at_column() is missing';
    END IF;
    -- created_by defaults to auth.uid(); without it the default would fail.
    IF to_regprocedure('auth.uid()') IS NULL THEN
        RAISE EXCEPTION
            'PDF-R6K rollout preflight failed: auth.uid() is missing';
    END IF;

    -- The three objects this rollout owns. All absent, or all present.
    IF to_regclass('public.knowledge_source_highlights') IS NOT NULL THEN
        present_objects := present_objects + 1;
    END IF;
    IF to_regprocedure('public.knowledge_source_highlight_origin_matches_document()') IS NOT NULL THEN
        present_objects := present_objects + 1;
    END IF;
    IF to_regprocedure('public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)') IS NOT NULL THEN
        present_objects := present_objects + 1;
    END IF;

    IF present_objects NOT IN (0, 3) THEN
        RAISE EXCEPTION
            'PDF-R6K rollout preflight failed: partially applied state, % of 3 feature objects present',
            present_objects;
    END IF;

    -- A table that exists but carries the wrong shape is NOT a state this
    -- rollout may converge: the hardening below revokes and re-grants by
    -- column name, so an unexpected column would silently lose its privilege.
    IF to_regclass('public.knowledge_source_highlights') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'knowledge_source_highlights'
               AND column_name = 'board_id'
        ) THEN
            RAISE EXCEPTION
                'PDF-R6K rollout preflight failed: knowledge_source_highlights carries a board_id column, which this feature never creates';
        END IF;
        IF (
            SELECT count(*) FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'knowledge_source_highlights'
               AND column_name IN (
                   'id', 'source_document_id', 'page_number', 'char_start', 'char_end',
                   'quote_text', 'quote_hash', 'color', 'created_by', 'created_at',
                   'updated_at', 'source_reference_id')
        ) <> 12 THEN
            RAISE EXCEPTION
                'PDF-R6K rollout preflight failed: knowledge_source_highlights exists with an unexpected column set';
        END IF;
    END IF;
END;
$preflight$;

-- ===========================================================================
-- PHASE 1 -- 20260904_create_knowledge_source_highlights.sql
-- ===========================================================================
-- Deleting a mark must never touch a Note or its citation; deleting a Note must
-- orphan the mark rather than destroy it. NO board_id: the board is reached
-- through the document, so a client can never present one of its own choosing.
CREATE TABLE IF NOT EXISTS public.knowledge_source_highlights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id uuid NOT NULL
        REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    page_number integer NOT NULL,
    char_start integer NOT NULL,
    char_end integer NOT NULL,
    quote_text text NOT NULL,
    quote_hash text,
    color text NOT NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    -- SET NULL, never CASCADE: deleting the Note cascades to its citation, and
    -- that must orphan the annotation rather than destroy it.
    source_reference_id uuid
        REFERENCES public.source_references(id) ON DELETE SET NULL,
    CONSTRAINT knowledge_source_highlights_page_check
        CHECK (page_number >= 1),
    CONSTRAINT knowledge_source_highlights_span_check
        CHECK (char_start >= 0 AND char_end > char_start),
    CONSTRAINT knowledge_source_highlights_quote_check
        CHECK (length(quote_text) > 0),
    CONSTRAINT knowledge_source_highlights_color_check
        CHECK (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$')
);

CREATE INDEX IF NOT EXISTS knowledge_source_highlights_document_page_idx
    ON public.knowledge_source_highlights(source_document_id, page_number);

-- ONE highlight per originating citation: what makes the legacy backfill
-- convergent rather than merely repeatable.
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

DROP POLICY IF EXISTS knowledge_source_highlights_select
    ON public.knowledge_source_highlights;
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
-- and admits viewers and commenters. Both USING and WITH CHECK are required.
DROP POLICY IF EXISTS knowledge_source_highlights_write
    ON public.knowledge_source_highlights;
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
                      SELECT board_id FROM public.board_collaborators
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
                      SELECT board_id FROM public.board_collaborators
                       WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    );

-- ===========================================================================
-- PHASE 2 -- 20260904120000_harden_knowledge_source_highlight_authority.sql
-- ===========================================================================
-- RLS governs ROWS, not COLUMNS, and Supabase grants `authenticated` table-wide
-- INSERT/UPDATE. Without this an editor could bypass the typed route and
-- rewrite a span, forge an author or repoint an origin. ORDER MATTERS: a column
-- grant is meaningless while a table grant stands, so all are revoked first --
-- which also drops TRUNCATE, and TRUNCATE BYPASSES RLS ENTIRELY.
REVOKE ALL ON TABLE public.knowledge_source_highlights FROM authenticated, anon;

GRANT SELECT ON TABLE public.knowledge_source_highlights TO authenticated;
GRANT DELETE ON TABLE public.knowledge_source_highlights TO authenticated;

-- Only the fields a person actually draws. `created_by` is deliberately absent:
-- naming the column is itself the permission error, so a forged uuid and an
-- explicit NULL fail identically; the default below writes authorship.
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

-- The colour, and nothing else. The updated_at trigger keeps working: a
-- trigger modifies the row as the table owner, not as the caller.
GRANT UPDATE (color) ON TABLE public.knowledge_source_highlights TO authenticated;

-- Legacy backfill runs under trusted authority and may still write NULL, which
-- is the honest answer where source_references records no citation author.
ALTER TABLE public.knowledge_source_highlights
    ALTER COLUMN created_by SET DEFAULT auth.uid();

-- An optional origin must describe the SAME document the mark annotates. A
-- trigger rather than a composite FK: that FK's ON DELETE SET NULL would try to
-- null BOTH referencing columns including the NOT NULL source_document_id, so
-- deleting a Note would fail instead of orphaning the annotation. SECURITY
-- DEFINER so integrity never depends on the caller's read visibility.
CREATE OR REPLACE FUNCTION public.knowledge_source_highlight_origin_matches_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Also the path ON DELETE SET NULL takes when a citation disappears.
    IF NEW.source_reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.source_references r
        WHERE r.id = NEW.source_reference_id
          AND r.source_document_id = NEW.source_document_id
    ) THEN
        -- Says only that the link is invalid: it does not distinguish "wrong
        -- document" from "no such citation", so a caller cannot probe for ids.
        RAISE EXCEPTION
            'highlight origin citation does not belong to this source document'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger-only: an integrity mechanism, never a callable API.
REVOKE ALL ON FUNCTION public.knowledge_source_highlight_origin_matches_document()
    FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS knowledge_source_highlights_origin_check
    ON public.knowledge_source_highlights;
CREATE TRIGGER knowledge_source_highlights_origin_check
    BEFORE INSERT OR UPDATE OF source_reference_id, source_document_id
    ON public.knowledge_source_highlights
    FOR EACH ROW
    EXECUTE FUNCTION public.knowledge_source_highlight_origin_matches_document();

-- ===========================================================================
-- PHASE 3 -- 20260904140000_create_knowledge_source_citation_with_highlight.sql
-- ===========================================================================
-- A new text citation and its mark must come into existence together, or a
-- failure between two writes leaves a cited-but-unmarked passage that nothing
-- repairs. A function body is one transaction.
--
-- SECURITY INVOKER, deliberately: source_references RLS still decides whether
-- the caller may cite, the highlight RLS and the column grants above still
-- apply, `created_by` is not named so the default writes authorship, and the
-- origin trigger still proves both rows describe one document. It adds
-- atomicity, never authority.
CREATE OR REPLACE FUNCTION public.create_knowledge_source_citation(
    p_target_padlet_id uuid,
    p_source_document_id uuid,
    p_page_start integer,
    p_page_end integer,
    p_quote_text text,
    p_quote_hash text,
    p_char_start integer,
    p_char_end integer,
    p_region_x double precision,
    p_region_y double precision,
    p_region_width double precision,
    p_region_height double precision,
    -- NULL means "this citation paints nothing": page-only and region
    -- citations, and any text span the reader could not resolve.
    p_highlight_color text
)
RETURNS TABLE (reference_id uuid, highlight_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_reference_id uuid;
    v_highlight_id uuid := NULL;
BEGIN
    INSERT INTO public.source_references (
        target_padlet_id, source_document_id, page_start, page_end,
        quote_text, quote_hash, char_start, char_end,
        region_x, region_y, region_width, region_height
    ) VALUES (
        p_target_padlet_id, p_source_document_id, p_page_start, p_page_end,
        p_quote_text, p_quote_hash, p_char_start, p_char_end,
        p_region_x, p_region_y, p_region_width, p_region_height
    )
    RETURNING id INTO v_reference_id;

    -- Belt and braces: the caller already withholds a colour for anything but
    -- a resolved single-page span, and a citation that paints nothing must
    -- never acquire a mark.
    IF p_highlight_color IS NOT NULL
       AND p_char_start IS NOT NULL
       AND p_char_end IS NOT NULL
       AND p_page_start = p_page_end
    THEN
        INSERT INTO public.knowledge_source_highlights (
            source_document_id, page_number, char_start, char_end,
            quote_text, quote_hash, color, source_reference_id
        ) VALUES (
            p_source_document_id, p_page_start, p_char_start, p_char_end,
            p_quote_text, p_quote_hash, p_highlight_color, v_reference_id
        )
        RETURNING id INTO v_highlight_id;
    END IF;

    RETURN QUERY SELECT v_reference_id, v_highlight_id;
END;
$$;

-- Signed-in users only. Every row it writes still faces the same policies a
-- direct insert would, so EXECUTE grants reach, never authority.
REVOKE ALL ON FUNCTION public.create_knowledge_source_citation(
    uuid, uuid, integer, integer, text, text, integer, integer,
    double precision, double precision, double precision, double precision, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_knowledge_source_citation(
    uuid, uuid, integer, integer, text, text, integer, integer,
    double precision, double precision, double precision, double precision, text
) TO authenticated;

-- ===========================================================================
-- POSTFLIGHT -- the rollout fails rather than commits a wrong shape.
-- ===========================================================================
DO $postflight$
DECLARE
    insert_columns constant text[] := ARRAY[
        'char_end', 'char_start', 'color', 'page_number',
        'quote_hash', 'quote_text', 'source_document_id', 'source_reference_id'
    ];
    actual text[];
    fk_delete_rule text;
BEGIN
    IF to_regclass('public.knowledge_source_highlights') IS NULL THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: table missing';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
           AND column_name = 'board_id'
    ) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: a board_id column exists';
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class
             WHERE oid = 'public.knowledge_source_highlights'::regclass) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: RLS is not enabled';
    END IF;

    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'knowledge_source_highlights') <> 2 THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: expected exactly two policies';
    END IF;

    -- Foreign key actions: the document cascades, the citation sets null.
    SELECT rc.delete_rule INTO fk_delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage k ON k.constraint_name = rc.constraint_name
     WHERE k.table_schema = 'public' AND k.table_name = 'knowledge_source_highlights'
       AND k.column_name = 'source_document_id';
    IF fk_delete_rule IS DISTINCT FROM 'CASCADE' THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: source_document_id delete rule is %', fk_delete_rule;
    END IF;

    SELECT rc.delete_rule INTO fk_delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage k ON k.constraint_name = rc.constraint_name
     WHERE k.table_schema = 'public' AND k.table_name = 'knowledge_source_highlights'
       AND k.column_name = 'source_reference_id';
    IF fk_delete_rule IS DISTINCT FROM 'SET NULL' THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: source_reference_id delete rule is %', fk_delete_rule;
    END IF;

    IF to_regclass('public.knowledge_source_highlights_document_page_idx') IS NULL
       OR to_regclass('public.knowledge_source_highlights_origin_uidx') IS NULL THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: an expected index is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'knowledge_source_highlights_origin_uidx'
           AND indexdef LIKE '%UNIQUE%'
           AND indexdef LIKE '%WHERE (source_reference_id IS NOT NULL)%'
    ) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: origin index is not the unique partial one';
    END IF;

    -- Column authority: no table-wide INSERT or UPDATE, no TRUNCATE, and the
    -- exact approved column sets.
    IF EXISTS (
        SELECT 1 FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
           AND grantee IN ('authenticated', 'anon')
           AND privilege_type IN ('INSERT', 'UPDATE', 'TRUNCATE')
    ) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: a table-wide INSERT/UPDATE/TRUNCATE grant survives';
    END IF;

    SELECT array_agg(column_name ORDER BY column_name) INTO actual
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
       AND grantee = 'authenticated' AND privilege_type = 'INSERT';
    IF actual IS DISTINCT FROM insert_columns THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: authenticated INSERT columns are %', actual;
    END IF;

    SELECT array_agg(column_name ORDER BY column_name) INTO actual
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
       AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
    IF actual IS DISTINCT FROM ARRAY['color'] THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: authenticated UPDATE columns are %', actual;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
           AND grantee = 'anon'
    ) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: anon retains a column privilege';
    END IF;

    -- NULL-safe deliberately. A column carrying NO default yields NULL here, and
    -- `NULL NOT LIKE ...` is NULL, which IF silently skips -- so the bare form
    -- would wave through the very state this check exists to catch. Absence must
    -- fail exactly as a wrong default does: nothing can repair it afterwards,
    -- because `created_by` is not a column any client is allowed to name.
    IF NOT COALESCE(
        (SELECT column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'knowledge_source_highlights'
            AND column_name = 'created_by') LIKE '%auth.uid()%', false) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: created_by does not default to auth.uid()';
    END IF;

    -- Integrity trigger: present, SECURITY DEFINER, not callable by clients.
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.knowledge_source_highlights'::regclass
           AND tgname = 'knowledge_source_highlights_origin_check'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: origin integrity trigger is missing';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc
             WHERE oid = 'public.knowledge_source_highlight_origin_matches_document()'::regprocedure) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: origin trigger function is not SECURITY DEFINER';
    END IF;
    IF has_function_privilege('authenticated',
            'public.knowledge_source_highlight_origin_matches_document()', 'EXECUTE')
       OR has_function_privilege('anon',
            'public.knowledge_source_highlight_origin_matches_document()', 'EXECUTE') THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: origin trigger function is client-executable';
    END IF;

    -- Atomic citation function: present, SECURITY INVOKER, authenticated only.
    IF (SELECT prosecdef FROM pg_proc
         WHERE oid = 'public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)'::regprocedure) THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: citation function must be SECURITY INVOKER';
    END IF;
    IF NOT has_function_privilege('authenticated',
            'public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: authenticated cannot execute the citation function';
    END IF;
    IF has_function_privilege('anon',
            'public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)', 'EXECUTE')
       OR has_function_privilege('public',
            'public.create_knowledge_source_citation(uuid, uuid, integer, integer, text, text, integer, integer, double precision, double precision, double precision, double precision, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PDF-R6K postflight failed: anon or PUBLIC can execute the citation function';
    END IF;

    -- Nothing was backfilled here. A non-empty table on a FIRST application
    -- would mean rows arrived from somewhere this rollout does not know about.
    RAISE NOTICE 'PDF-R6K rollout applied. Highlight rows present: %. Backfill is a SEPARATE gate -- do not deploy the renderer yet.',
        (SELECT count(*) FROM public.knowledge_source_highlights);
END;
$postflight$;

COMMIT;
