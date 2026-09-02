-- Board AI Chat V1 -- private per-user chat persistence, scoped to one board.
--
-- A thread belongs to ONE board and ONE user. Two collaborators on the same
-- board have entirely separate histories: board-scoped is not shared.
--
-- Access requires BOTH conditions, always, on every statement:
--
--   1. the row is the caller's own          (user_id = auth.uid())
--   2. the caller can currently READ the board
--
-- The second condition is deliberately re-evaluated rather than captured at
-- write time. If a collaborator is later removed from a board, their old
-- private threads and messages for it stop being readable -- ownership alone
-- must never keep board-derived content reachable.
--
-- The board-read expression is copied verbatim from knowledge_documents_select
-- (20260820_create_knowledge_data_foundation.sql) so there is ONE definition of
-- "can read this board" in the schema. Deliberately NOT the workspace
-- permission functions: lib/server/knowledge/knowledgeBoardReadAuthorization.ts
-- documents those as belonging to the legacy canvas/workspace model, whose path
-- selects canvases.workspace_id -- a column this schema does not have.
--
-- No enum (role is text + CHECK, so a later role is an INSERT, not a
-- migration), no trigger, no SECURITY DEFINER function, and no service-role
-- path: this data is reached only as the authenticated user, with RLS as the
-- final boundary.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.board_ai_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Messages carry no ownership column of their own: privacy is inherited from
-- the owning thread, so there is exactly one place a thread can change hands
-- (it cannot) and no way for a message row to disagree with its thread.
--
-- `provider` and `model` are informational metadata about how an assistant
-- reply was produced. They are names, never credentials: no API key, no
-- encrypted key, no key hint, no JWT, no cookie, no signed URL, no provider
-- endpoint and no raw document bytes are ever stored here.
--
-- `context` and `citations` are storage capacity for later slices (explicit
-- context and answer citations). BCHAT-A writes neither, and neither is a
-- general-purpose client bag: both will carry durable ids plus safe metadata,
-- re-authorized server-side when they are introduced.
CREATE TABLE IF NOT EXISTS public.board_ai_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.board_ai_threads(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    provider text,
    model text,
    context jsonb,
    citations jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT board_ai_messages_role_check CHECK (role IN ('user', 'assistant'))
);

-- One index per real read. Threads are listed for one user on one board,
-- most-recently-updated first; messages are read for one thread in order.
CREATE INDEX IF NOT EXISTS board_ai_threads_user_board_idx
    ON public.board_ai_threads(user_id, board_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS board_ai_messages_thread_idx
    ON public.board_ai_messages(thread_id, created_at);

ALTER TABLE public.board_ai_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_ai_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Threads
-- ---------------------------------------------------------------------------

CREATE POLICY board_ai_threads_select
    ON public.board_ai_threads FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR public.is_board_member(board_id, auth.uid())
        )
    );

-- WITH CHECK carries the ownership test too, so an authenticated caller cannot
-- insert a row naming another user: the id is taken from the session, never
-- from the payload.
CREATE POLICY board_ai_threads_insert
    ON public.board_ai_threads FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR public.is_board_member(board_id, auth.uid())
        )
    );

-- USING gates which rows may be updated; WITH CHECK gates what they may become.
-- Both carry the same pair, so an update can neither reach another user's
-- thread nor hand one away -- moving a thread to another user or to a board the
-- caller cannot read fails the check.
CREATE POLICY board_ai_threads_update
    ON public.board_ai_threads FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR public.is_board_member(board_id, auth.uid())
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR public.is_board_member(board_id, auth.uid())
        )
    );

CREATE POLICY board_ai_threads_delete
    ON public.board_ai_threads FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR public.is_board_member(board_id, auth.uid())
        )
    );

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
--
-- Every message policy resolves the owning thread and repeats BOTH tests. It
-- deliberately does not stop at "the thread is mine": a thread whose board the
-- caller can no longer read must take its messages out of reach with it.

CREATE POLICY board_ai_messages_select
    ON public.board_ai_messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.board_ai_threads t
            WHERE t.id = board_ai_messages.thread_id
              AND t.user_id = auth.uid()
              AND (
                  t.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(t.board_id, auth.uid())
              )
        )
    );

CREATE POLICY board_ai_messages_insert
    ON public.board_ai_messages FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.board_ai_threads t
            WHERE t.id = board_ai_messages.thread_id
              AND t.user_id = auth.uid()
              AND (
                  t.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(t.board_id, auth.uid())
              )
        )
    );

CREATE POLICY board_ai_messages_update
    ON public.board_ai_messages FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.board_ai_threads t
            WHERE t.id = board_ai_messages.thread_id
              AND t.user_id = auth.uid()
              AND (
                  t.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(t.board_id, auth.uid())
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.board_ai_threads t
            WHERE t.id = board_ai_messages.thread_id
              AND t.user_id = auth.uid()
              AND (
                  t.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(t.board_id, auth.uid())
              )
        )
    );

CREATE POLICY board_ai_messages_delete
    ON public.board_ai_messages FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.board_ai_threads t
            WHERE t.id = board_ai_messages.thread_id
              AND t.user_id = auth.uid()
              AND (
                  t.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(t.board_id, auth.uid())
              )
        )
    );

-- ---------------------------------------------------------------------------
-- Privileges: the associations are immutable after INSERT
-- ---------------------------------------------------------------------------
--
-- RLS alone cannot express this. A policy's WITH CHECK sees only the NEW row,
-- so "this thread is mine and I can read this board" is satisfied just as well
-- by a row whose board_id has been changed to a DIFFERENT board the caller can
-- also read. The same holds for a message moved to another thread of the
-- caller's. Either move re-points a conversation at a board it did not come
-- from, and board-bound revocation stops meaning anything: lose access to the
-- original board and the history stays readable under the new one.
--
-- So the columns that bind a conversation to its board are made immutable at
-- the privilege layer, which RLS cannot override.
--
-- Order matters, and this is the trap the correction exists to avoid.
-- Supabase grants new public-schema tables to anon and authenticated through
-- ALTER DEFAULT PRIVILEGES (see the note in
-- 20260821_add_knowledge_extraction_lifecycle.sql), so both roles start with
-- TABLE-level UPDATE -- which authorizes every column. A column-level
-- `REVOKE UPDATE (board_id)` underneath that table-level grant changes
-- nothing. The table-level privilege must be removed FIRST; only then does a
-- column-level grant become the complete list of what may be written.
REVOKE UPDATE ON public.board_ai_threads FROM anon, authenticated;
REVOKE UPDATE ON public.board_ai_messages FROM anon, authenticated;

-- Threads: exactly the two mutable pieces of metadata. Renaming a thread and
-- re-ordering the list are the only writes V1 performs, and id, board_id,
-- user_id and created_at are absent from this list, which is what makes them
-- unwritable rather than merely policed.
GRANT UPDATE (title, updated_at) ON public.board_ai_threads TO authenticated;

-- Messages get NO update privilege at all: V1 has no message-edit feature, so
-- the smallest correct grant is none. board_ai_messages_update above is
-- therefore unreachable through PostgREST; it is deliberately kept rather than
-- dropped, so that if an editing feature is ever added the ownership and
-- board-read conditions are already written and a grant alone cannot open a
-- hole.

-- Board AI Chat has no anonymous use case in any direction. RLS policies are
-- all TO authenticated, so anon already fails them; revoking outright is the
-- second, independent lock this schema uses for anything sensitive (see
-- ai_provider_credentials in 20260831120000_create_ai_provider_foundation.sql).
REVOKE ALL ON public.board_ai_threads FROM anon;
REVOKE ALL ON public.board_ai_messages FROM anon;
