-- PDF-R6K-H2B: create a citation and its visual highlight in one transaction.
--
-- H2A made the standalone highlight an independent row; H2B makes it the thing
-- the reader actually paints. That only works if a new text citation and its
-- highlight come into existence TOGETHER -- otherwise a failure between two
-- separate writes leaves a Note whose passage is cited but not visibly marked,
-- and nothing would ever repair it.
--
-- Two sequential PostgREST calls cannot give that guarantee. A function body is
-- one transaction, so this does.
--
-- SECURITY INVOKER, deliberately. Everything that protects these tables must
-- keep protecting them from inside here:
--
--   * source_references RLS still decides whether the caller may cite at all
--     (a viewer calling this is refused by the policy, not by a check here),
--   * knowledge_source_highlights RLS still decides the highlight,
--   * the C1 column grants still apply -- which is why `created_by` is not
--     named below: the caller has no privilege on it, and the column's
--     `auth.uid()` default is what writes authorship,
--   * the C1 origin trigger still proves the citation and the highlight
--     describe the same document.
--
-- No privilege is created, escalated or borrowed. The only thing this adds is
-- atomicity.

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
    -- citations, and any text span the reader could not resolve. The caller
    -- decides that, using the same span authority the renderer uses.
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

    -- A highlight is created only for a resolved single-page text span. The
    -- guard is belt and braces: the caller already refuses to send a colour for
    -- anything else, and the column constraints would refuse a malformed span
    -- anyway, but a citation that paints nothing must never acquire a mark.
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

-- Callable by signed-in users only. Every row it writes is still filtered by
-- the same policies a direct insert would face, so EXECUTE here grants reach,
-- never authority.
REVOKE ALL ON FUNCTION public.create_knowledge_source_citation(
    uuid, uuid, integer, integer, text, text, integer, integer,
    double precision, double precision, double precision, double precision, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_knowledge_source_citation(
    uuid, uuid, integer, integer, text, text, integer, integer,
    double precision, double precision, double precision, double precision, text
) TO authenticated;

COMMENT ON FUNCTION public.create_knowledge_source_citation(
    uuid, uuid, integer, integer, text, text, integer, integer,
    double precision, double precision, double precision, double precision, text
) IS
    'PDF-R6K-H2B: writes a source_reference and, for a resolved single-page text span, its standalone highlight, in one transaction. SECURITY INVOKER: RLS, column grants and the origin trigger all still apply.';
