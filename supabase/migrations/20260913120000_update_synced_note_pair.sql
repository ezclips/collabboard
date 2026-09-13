-- SYNCED_NOTE_PAIR_ATOMIC_UPDATE_1: update both members of a synced Note pair
-- in ONE transaction.
--
-- WHAT WAS WRONG. The client issued two sequential PostgREST updates: the
-- edited Note, then its twin. Anything between them -- a dropped connection, a
-- revoked authority, a closed tab, an RLS refusal on the second row alone --
-- left the pair PERMANENTLY split, with nothing that would ever repair it. The
-- gap is between two independently committed transactions, so no number of
-- client checks closes it; only one transaction does.
--
-- SECURITY INVOKER, deliberately. padlets RLS still decides every row this
-- function reads and writes; a viewer is refused by the policy, not merely by
-- the check below. The caller's identity is auth.uid() and is never accepted
-- as an argument, so there is no actor to forge and nothing is borrowed.
--
-- WHAT IT SYNCHRONIZES, AND NOTHING ELSE. title and content, plus the four
-- appearance keys the Note editor exclusively owns. Both allowlists below are
-- applied INSIDE the function, so extra keys from a caller are dropped rather
-- than written: placement, containers, sections, provenance, scheduling, lock
-- state, file data, z-order and every unknown key are not even nameable. Each
-- member's metadata is MERGED into ITS OWN object, never replaced by the
-- other's -- which is exactly what the old two-write path did to the twin,
-- silently destroying the twin's own parentId, comments and reactions.
-- badgeColor, reactions, the detached-comment keys and a scheduler Note's own
-- start_date/end_date are SOURCE-ONLY, being per-record (badgeColor colours a
-- badge over a per-record comment set, and is mutated outside this editor by
-- the comment UI): they reach the edited record alone.

CREATE OR REPLACE FUNCTION public.update_synced_note_pair(
    p_padlet_id uuid,
    p_board_id uuid,
    p_title text,
    p_content text,
    -- Allowlisted and merged into BOTH members. A JSON null removes the key,
    -- which is how the editor clears an appearance back to its default.
    p_shared_appearance jsonb,
    -- Allowlisted and merged into the EDITED member only.
    p_source_metadata jsonb
)
RETURNS TABLE (id uuid, title text, content text, metadata jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    c_shared  constant text[] := ARRAY['cardColor', 'topStrip', 'textColor', 'titleStyle'];
    c_source  constant text[] := ARRAY['reactions', 'badgeColor', 'detachedComments',
                                       'commentTitle', 'commentTitleStyle',
                                       -- The two keys withSchedulerDefaults produces. A
                                       -- scheduler Note's own dates are not its twin's, so
                                       -- they are per-record like everything else here --
                                       -- and still allowlisted, so the source-only argument
                                       -- cannot reach any other structural field.
                                       'start_date', 'end_date'];
    c_uuid    constant text   := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    v_actor     uuid := auth.uid();
    v_twin_text text;
    v_twin      uuid;
    v_locked    integer;
    v_a         public.padlets%ROWTYPE;
    v_b         public.padlets%ROWTYPE;
    v_shared_set  jsonb;
    v_shared_drop text[];
    v_source_set  jsonb;
    v_source_drop text[];
    v_updated   integer;
BEGIN
    IF v_actor IS NULL OR p_padlet_id IS NULL OR p_board_id IS NULL THEN
        RAISE EXCEPTION 'synced_note_pair_denied' USING ERRCODE = '42501';
    END IF;

    -- The board_id branch of the padlets UPDATE policy, reproduced exactly:
    -- owner of the board, or a collaborator whose role is 'editor'. Viewer and
    -- commenter are absent by construction, and the workspace role is not a
    -- term here -- it is not a term in the policy either.
    IF NOT EXISTS (
        SELECT 1 FROM public.boards AS b
         WHERE b.id = p_board_id AND b.user_id = v_actor
        UNION ALL
        SELECT 1 FROM public.board_collaborators AS c
         WHERE c.board_id = p_board_id AND c.user_id = v_actor AND c.role = 'editor'
    ) THEN
        RAISE EXCEPTION 'synced_note_pair_denied' USING ERRCODE = '42501';
    END IF;

    -- The declared twin. Read unlocked, then re-proved under the lock below,
    -- so a value that changes in between fails closed rather than being used.
    SELECT nullif(p.metadata ->> 'syncedWith', '') INTO v_twin_text
      FROM public.padlets AS p WHERE p.id = p_padlet_id;

    -- Malformed and self-links are rejected BEFORE anything is locked or
    -- written. A malformed id must not reach a cast and surface as a generic
    -- database fault: a legacy pair fails closed, and is not repaired here.
    IF v_twin_text IS NULL OR v_twin_text !~* c_uuid THEN
        RAISE EXCEPTION 'synced_note_pair_invalid' USING ERRCODE = '22023';
    END IF;
    v_twin := v_twin_text::uuid;
    IF v_twin = p_padlet_id THEN
        RAISE EXCEPTION 'synced_note_pair_invalid' USING ERRCODE = '22023';
    END IF;

    -- Both rows, locked in ascending UUID order. The sort sits BELOW the lock
    -- in the plan, so two saves initiated from opposite members take the same
    -- two locks in the same order: they serialize instead of deadlocking, and
    -- the loser re-reads committed state before it writes.
    PERFORM 1 FROM public.padlets AS p
      WHERE p.id IN (p_padlet_id, v_twin)
      ORDER BY p.id
      FOR UPDATE;
    GET DIAGNOSTICS v_locked = ROW_COUNT;
    IF v_locked <> 2 THEN
        RAISE EXCEPTION 'synced_note_pair_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_a FROM public.padlets AS p WHERE p.id = p_padlet_id;
    SELECT * INTO v_b FROM public.padlets AS p WHERE p.id = v_twin;

    -- Both on the board the caller proved authority over, both a Note, and the
    -- link reciprocal in both directions. Anything else is a pair this
    -- function will not touch.
    IF v_a.board_id IS DISTINCT FROM p_board_id OR v_b.board_id IS DISTINCT FROM p_board_id
       -- COALESCE, not a bare NOT IN: `NULL NOT IN (...)` is NULL, and an IF
       -- on NULL does not branch -- a type-less row would sail straight past.
       OR COALESCE(v_a.type, '') NOT IN ('text', 'note')
       OR COALESCE(v_b.type, '') NOT IN ('text', 'note')
       OR (v_a.metadata ->> 'syncedWith') IS DISTINCT FROM v_b.id::text
       OR (v_b.metadata ->> 'syncedWith') IS DISTINCT FROM v_a.id::text
    THEN
        RAISE EXCEPTION 'synced_note_pair_invalid' USING ERRCODE = '22023';
    END IF;

    -- jsonb_each raises on anything that is not an object, which would leave a
    -- database message standing in for this function's own refusal. An array or
    -- a scalar is simply not a patch: reject it here, before either sanitizer
    -- runs and long before any write.
    IF jsonb_typeof(COALESCE(p_shared_appearance, '{}'::jsonb)) <> 'object'
       OR jsonb_typeof(COALESCE(p_source_metadata, '{}'::jsonb)) <> 'object'
    THEN
        RAISE EXCEPTION 'synced_note_pair_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(jsonb_object_agg(e.key, e.value) FILTER (WHERE e.value <> 'null'::jsonb),
                    '{}'::jsonb),
           COALESCE(array_agg(e.key) FILTER (WHERE e.value = 'null'::jsonb), ARRAY[]::text[])
      INTO v_shared_set, v_shared_drop
      FROM jsonb_each(COALESCE(p_shared_appearance, '{}'::jsonb)) AS e
     WHERE e.key = ANY (c_shared);

    SELECT COALESCE(jsonb_object_agg(e.key, e.value) FILTER (WHERE e.value <> 'null'::jsonb),
                    '{}'::jsonb),
           COALESCE(array_agg(e.key) FILTER (WHERE e.value = 'null'::jsonb), ARRAY[]::text[])
      INTO v_source_set, v_source_drop
      FROM jsonb_each(COALESCE(p_source_metadata, '{}'::jsonb)) AS e
     WHERE e.key = ANY (c_source);

    -- One statement, one transaction. Each row starts from ITS OWN metadata,
    -- so syncedWith, parentId, sectionId, scheduling and every other key this
    -- function cannot name survive untouched on both members.
    UPDATE public.padlets AS p
       SET title = p_title, content = p_content, metadata = n.meta
      FROM (VALUES
            (p_padlet_id,
             ((((COALESCE(v_a.metadata, '{}'::jsonb) - v_shared_drop) || v_shared_set)
               - v_source_drop) || v_source_set)),
            (v_twin,
             ((COALESCE(v_b.metadata, '{}'::jsonb) - v_shared_drop) || v_shared_set))
           ) AS n(row_id, meta)
     WHERE p.id = n.row_id;

    -- Two rows or nothing. A row silently filtered by RLS, a row deleted
    -- between the lock and the write, or any other shortfall rolls the whole
    -- function back -- including the member that did update.
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 2 THEN
        RAISE EXCEPTION 'synced_note_pair_conflict' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY
      SELECT p.id, p.title, p.content, p.metadata
        FROM public.padlets AS p
       WHERE p.id IN (p_padlet_id, v_twin)
       ORDER BY p.id;
END;
$$;

-- Signed-in callers only. Every row is still filtered by the same policies a
-- direct update would face, so EXECUTE grants reach, never authority.
REVOKE ALL ON FUNCTION public.update_synced_note_pair(uuid, uuid, text, text, jsonb, jsonb)
    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_synced_note_pair(uuid, uuid, text, text, jsonb, jsonb)
    TO authenticated;

COMMENT ON FUNCTION public.update_synced_note_pair(uuid, uuid, text, text, jsonb, jsonb) IS
    'SYNCED_NOTE_PAIR_ATOMIC_UPDATE_1: updates both members of a reciprocal synced Note pair in one transaction. SECURITY INVOKER; auth.uid() only; RLS authoritative. Synchronizes title, content and four Note-editor appearance keys, merged into each row''s own metadata.';
