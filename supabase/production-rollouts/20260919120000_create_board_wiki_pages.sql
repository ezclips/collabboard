-- The compiled board wiki: page storage, and the edit-wins data model.
--
-- Unit 1 of .agent/wiki-plan.md. Storage only -- no compilation, no surface.
--
-- ===========================================================================
-- WHY THE SOURCE SET IS CONTENT AND NOT FOREIGN KEYS
-- ===========================================================================
--
-- `source_references` already links a Note to the document it quotes, and it
-- cannot serve this table. Its `target_padlet_id` must be a padlet (a wiki page
-- is not one) and its `source_document_id` must be a knowledge document (a wiki
-- compiles from board POSTS too, and there is no column for them).
--
-- The third reason is the one that decides this design. Both of those columns
-- are `ON DELETE CASCADE`, so when a source document is deleted the reference
-- row VANISHES -- the Note silently loses a source it really did use. The chat
-- citation path does the opposite: `board_ai_messages.citations` is jsonb with
-- NO foreign key, which is exactly why a deleted source can be rendered as
-- "gone" there rather than simply being absent.
--
-- A row that cascades away cannot be shown as gone. So `sources` below is
-- recorded CONTENT in the citation item shape, with no FK to
-- knowledge_documents or padlets. Deletion becomes derivable and renderable
-- instead of destructive.
--
-- ===========================================================================
-- WHY THERE IS EXACTLY ONE CONTENT COLUMN
-- ===========================================================================
--
-- Edits win; recompilation proposes and never overwrites. That is made true
-- HERE rather than by convention: `board_wiki_pages.content` is the single
-- authored version, and compile output has nowhere to land in this table. A
-- proposal is a row in `board_wiki_page_proposals`, a DIFFERENT table, and
-- there is deliberately no trigger, no generated column and no default that
-- moves text from one to the other. Applying a proposal is an ordinary UPDATE
-- performed by an explicit user action in the application layer.
--
-- So an overwrite is not merely forbidden, it has no path.
--
-- ===========================================================================
-- ONE TRANSACTION, WHICH THE TWO CLOSEST PRECEDENTS ARE NOT
-- ===========================================================================
--
-- `20260820_create_knowledge_data_foundation.sql` and
-- `20260902120000_create_board_ai_chat.sql` -- the other two table-creation
-- migrations -- are NOT wrapped. The recent policy and function migrations
-- (`20260916150000`, `20260918180000`) are. This file follows the recent ones
-- deliberately rather than the nearer ones by shape.
--
-- The reason is specific to what is below: `CREATE POLICY` has no
-- `IF NOT EXISTS`. So a partial apply cannot be repaired by re-running this
-- file -- it fails on the first policy that already exists -- and the only way
-- out is the rollback, which DROPS BOTH TABLES. On a fresh install that is
-- merely annoying; on any database where a page has been written it is
-- destructive. All-or-nothing removes that path entirely.

BEGIN;

CREATE TABLE IF NOT EXISTS public.board_wiki_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    -- Addressing within one board's wiki. One wiki per board is the whole ACL
    -- story: a page inherits its board's permissions and nothing else, so a
    -- cross-board wiki -- which would have to invent a permission model of its
    -- own -- stays impossible by construction.
    slug text NOT NULL,
    title text NOT NULL,
    -- THE ONE AUTHORED COLUMN. Written by a person, or seeded once at creation.
    content text NOT NULL DEFAULT '',
    -- The citation item shape, plus each source's COMPILE-TIME VERSION. See the
    -- staleness note below for what the version is compared against and why the
    -- comparison is deliberately coarse.
    sources jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- When the content last came from a compilation. NULL for a page a person
    -- wrote from nothing, which is a legitimate page.
    compiled_at timestamptz,
    -- SET NULL, NOT CASCADE, AND NULLABLE -- the house pattern for durable
    -- board content (`knowledge_documents.created_by`,
    -- `knowledge_source_highlights.created_by`, `teams.created_by`). CASCADE
    -- belongs on personal containers like `board_ai_threads`, where the rows
    -- ARE the user's own data.
    --
    -- A wiki page is not personal data. It is board content that other editors
    -- have since worked on, so deleting the account that happened to create it
    -- must not destroy the page and everyone else's edits with it. Losing the
    -- attribution is the correct cost; losing the page is not.
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT board_wiki_pages_slug_board_key UNIQUE (board_id, slug),
    CONSTRAINT board_wiki_pages_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT board_wiki_pages_title_check CHECK (length(btrim(title)) > 0),
    -- An array, always. A page with no sources records `[]`, never NULL, so a
    -- reader never has to tell "unsourced" from "not recorded".
    CONSTRAINT board_wiki_pages_sources_is_array CHECK (jsonb_typeof(sources) = 'array')
);

-- ===========================================================================
-- STALENESS IS DERIVED AT READ TIME, AND THE COMPARISON IS DELIBERATELY COARSE
-- ===========================================================================
--
-- There is no `is_stale` column and there must not be one: a stored flag goes
-- stale itself the moment a source changes without anything writing here.
-- Staleness is computed by comparing each recorded source version against the
-- source's CURRENT version -- for a PDF page, the document's `content_sha256`
-- (falling back to `updated_at`); for a board post, the padlet's `updated_at`.
--
-- THE CONSERVATIVE SEMANTICS, STATED SO NOBODY LATER "FIXES" THEM:
-- a changed source flags the page stale EVEN WHEN THE CITED PAGE ITSELF DID NOT
-- CHANGE. Editing page 2 of a twelve-page PDF marks a page that cites page 6 as
-- stale. That is intended. The alternative -- comparing per cited page -- needs
-- per-page version tracking the ingestion path does not produce, and its
-- failure mode is silent: a page that really did change would read as current.
-- FLAG, DO NOT BURY. A false "check this" costs a glance; a false "still
-- accurate" is the confident-wrong failure this whole stream exists to avoid.
--
-- A source whose row no longer exists is GONE rather than stale, and gone is
-- rendered, never deleted from `sources` -- the page really did use it.

CREATE INDEX IF NOT EXISTS board_wiki_pages_board_idx
    ON public.board_wiki_pages(board_id, updated_at DESC);

-- ===========================================================================
-- Proposals: where a compilation's output goes, which is NOT the page
-- ===========================================================================
--
-- A proposal is a suggestion with an author-visible lifetime. It carries its
-- own content and its own source set, and applying it is an explicit UPDATE of
-- the page performed by the application layer on a user's instruction. Nothing
-- in this schema can promote a proposal on its own.

CREATE TABLE IF NOT EXISTS public.board_wiki_page_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id uuid NOT NULL REFERENCES public.board_wiki_pages(id) ON DELETE CASCADE,
    -- Denormalised deliberately: every policy below tests the board directly
    -- rather than joining through the page, so a proposal can never outlive its
    -- page's permissions by one query's worth of staleness.
    board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    content text NOT NULL,
    sources jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- What the page's content was when this proposal was compiled, so the
    -- surface can show a diff against the right baseline and detect that the
    -- page moved underneath a pending proposal.
    based_on_content text NOT NULL,
    -- CASCADE HERE, AND THE ASYMMETRY WITH THE PAGE ABOVE IS THE POINT. A
    -- proposal is an ephemeral suggestion, not board content: nobody has built
    -- on it, and one left behind by a deleted account is garbage by definition.
    -- A page is the opposite, which is why it takes SET NULL.
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT board_wiki_page_proposals_sources_is_array CHECK (jsonb_typeof(sources) = 'array')
);

CREATE INDEX IF NOT EXISTS board_wiki_page_proposals_page_idx
    ON public.board_wiki_page_proposals(page_id, created_at DESC);

-- ===========================================================================
-- ACCESS: closed to anon entirely; authorization lives in the APPLICATION
-- ===========================================================================
--
-- Stated rather than inferred, because "follows the knowledge tables' pattern"
-- is not a specification.
--
-- WHERE AUTHORIZATION LIVES: the application layer, exactly as knowledge
-- documents do. Server writes run through the service role after an explicit
-- owner-or-editor check (`SupabaseKnowledgeBoardAuthorizer.canMutateBoard`),
-- and the service role bypasses RLS by design.
--
-- WHAT THE POLICIES BELOW ARE FOR: defence in depth, not the primary gate. They
-- are written to the SAME rule the application enforces, so a direct client
-- call can never exceed what a server action would have allowed. If the two
-- ever disagree, the policy is the one that holds.
--
-- `anon` gets nothing at all. A board wiki is never public.

ALTER TABLE public.board_wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_wiki_page_proposals ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the board. Viewers included -- reading a wiki is a
-- read, the same argument Board AI Chat makes for itself.
CREATE POLICY board_wiki_pages_select
    ON public.board_wiki_pages FOR SELECT TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR public.is_board_member(board_id, auth.uid())
    );

-- Write: owner, or a collaborator whose role is exactly 'editor'. A viewer who
-- may read a page may not change it.
CREATE POLICY board_wiki_pages_insert
    ON public.board_wiki_pages FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR board_id IN (
                SELECT board_id FROM public.board_collaborators
                WHERE user_id = auth.uid() AND role = 'editor'
            )
        )
    );

-- USING gates which rows may be updated; WITH CHECK gates what they may become,
-- so an update can neither reach a board the caller cannot write nor move a
-- page onto one.
CREATE POLICY board_wiki_pages_update
    ON public.board_wiki_pages FOR UPDATE TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    )
    WITH CHECK (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    );

CREATE POLICY board_wiki_pages_delete
    ON public.board_wiki_pages FOR DELETE TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    );

-- Proposals carry the same rule, tested against their own board_id rather than
-- joined through the page.
CREATE POLICY board_wiki_page_proposals_select
    ON public.board_wiki_page_proposals FOR SELECT TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR public.is_board_member(board_id, auth.uid())
    );

CREATE POLICY board_wiki_page_proposals_insert
    ON public.board_wiki_page_proposals FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR board_id IN (
                SELECT board_id FROM public.board_collaborators
                WHERE user_id = auth.uid() AND role = 'editor'
            )
        )
    );

CREATE POLICY board_wiki_page_proposals_delete
    ON public.board_wiki_page_proposals FOR DELETE TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    );

-- NO UPDATE POLICY ON PROPOSALS, deliberately. A proposal is a record of what a
-- compilation said at a moment; editing one in place would let its content
-- drift from what was actually proposed, and the page is where editing belongs.
-- A superseded proposal is deleted and a new one inserted.

-- ---------------------------------------------------------------------------
-- Grants. RLS filters rows; grants decide whether a role may reach the table at
-- all, and the two are independent -- a policy on a table `anon` can still
-- SELECT from is one CVE away from being the only thing standing there.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.board_wiki_pages FROM anon;
REVOKE ALL ON public.board_wiki_page_proposals FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_wiki_pages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.board_wiki_page_proposals TO authenticated;

-- The application never updates a proposal, and neither may a client.
REVOKE UPDATE ON public.board_wiki_page_proposals FROM authenticated;

-- Identity columns are not editable after the fact: a page cannot be moved to
-- another board, and authorship cannot be rewritten.
REVOKE UPDATE (board_id, created_by, created_at) ON public.board_wiki_pages FROM authenticated;

COMMIT;
