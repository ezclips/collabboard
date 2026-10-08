# PATCH-322 — Board AI reads Kanban cards (server, context, citations)

## Why
Owner decision 2026-10-08: Board AI on Kanban boards, first version "ask about
cards" — it reads every card, answers with citations that open the card, and
can attach chosen cards. Board AI only (no Board Wiki button on Kanban).
Today Board AI cannot see Kanban data at all: nothing under `lib/server/ai` or
`lib/domain/ai` reads `kanban_*` tables. This patch is the server/domain half;
PATCH-323 is the UI.

## Rules that must hold (same as every existing source)
- The browser sends IDENTITY only (a card id, or nothing); the server reads the
  content, through the caller's own Supabase client (RLS), after the same board
  read authorization the other sources use. Never the admin client.
- A citation says WHERE (card id + label), never WHAT.
- Provenance stays HMAC-signed; proofs written before this patch still verify.
- The four-slot rule (`BOARD_AI_CONTEXT_MAX_ITEMS`) and the char budgets hold.
- Additive types: `BOARD_AI_CONTEXT_VERSION` stays 1 (older clients drop
  unknown types, as the comment on `BOARD_AI_CONTEXT_TYPES` explains).

## Design
### 1. Two context types (`lib/domain/ai/boardAiChatContext.ts`)
- `kanban-card` — `{ type: 'kanban-card', cardId }`. Persisted like `padlet`
  (identity + server-authored label/excerpt); re-read on later turns like a
  padlet attachment.
- `kanban-board` — `{ type: 'kanban-board' }`, no fields. CURRENT-TURN ONLY,
  exactly like `board-search` (not re-run on later turns; stored only for its
  chip). Uses ONE slot.
- Identity key, stored-parsing, draft-context support (`kanban-card` only is
  attachable from the UI; `kanban-board` is added by the client per turn like
  the search toggle) — follow how `padlet` and `board-search` are handled.

### 2. Server resolution (`lib/server/ai/boardAiChatContext.ts` or a new
`lib/server/ai/boardAiKanbanContext.ts`, wired into `resolveBoardAiChatContext`)
- Verify the board is a Kanban board (`boards.layout = 'kanban'`, read with the
  caller's client) before resolving either type; otherwise the item resolves to
  nothing (dropped, answer still runs).
- `kanban-card`: `kanban_cards` row where `id = cardId AND canvas_id = boardId`
  (a card from another board resolves to nothing). Block text, plain lines:
  title; column name; row (swimlane) name; start/end date (date only);
  priority (0 none, 1 low, 2 medium, ≥3 high); status; project; progress %;
  assignee display names (board members); description; links (relation +
  target card title); comments (author name + text, newest last, cap 20).
  Respect `BOARD_AI_CONTEXT_MAX_SINGLE_CHARS`. Label = card title.
- `kanban-board`: one block listing every card, one line each:
  `[S{n}.{i}] Title · Column · Row · start→end · priority · status · people`,
  ordered by column order, row order, card order. Fit the char budget; if cards
  are left out, end with `(+N more cards not shown)`. The block carries
  `passages` (source `'kanban-card'`, `cardId`, label = title) in line order, so
  `S{n}.{i}` resolves exactly like a board-search passage.
- Read errors for one table (e.g. comments) degrade that part, not the turn.

### 3. Citations (`lib/domain/ai/boardAiChatCitation.ts`, provenance)
- New citation item type `kanban-card` `{ cardId, label }`.
- `citationItemFromBlock`: a `kanban-card` block cites itself; a `kanban-board`
  block cites only via sub-tokens (`S2.5` → that card), never as a whole — the
  same rule board-search follows.
- `BoardAiCitablePassage.source` gains `'kanban-card'` with `cardId`.
- Stored-envelope parsing + `boardAiCitationIdentityKey` +
  `boardAiProvenanceProof.ts` canonical fields include `cardId` for this type
  only; existing types serialize byte-for-byte as before (pin with a test
  using a proof signed by the current code).
- `BOARD_AI_CITATION_INSTRUCTIONS`: one line — Kanban overview lines carry ids
  like "S2.5"; cite the card line you used.

### 4. Board AI search on Kanban
No change to the search RPCs. On a Kanban board the overview is the card
source; board search still covers posts/PDFs/wiki as before.

## Tests (extend the existing suites; new file for the Kanban reader)
- Card from another board → resolves to nothing; non-Kanban board → both types
  resolve to nothing.
- Card block contains column/row names, dates, priority words, assignee names,
  comments; never another card's text.
- Overview: ordering, sub-token passages map to the right card ids, budget
  truncation adds "(+N more cards not shown)", one slot only.
- `S2.5` on a kanban-board block → `kanban-card` citation; `S2` alone (whole
  overview) → no citation; out-of-range index → dropped.
- Provenance: a proof signed before this patch still verifies; a kanban-card
  citation signs and verifies.
- Route/execution test: a turn on a Kanban board with `kanban-board` +
  one `kanban-card` attachment reaches the model with both blocks; the reads go
  through the caller's client (mock asserts no admin client).

## Verification
Focused tests; full `npx vitest run` file-set gate (26 baseline);
`npx tsc --noEmit` clean. I verify live in PATCH-323.

## Allowed files
lib/domain/ai/boardAiChatContext.ts, boardAiChatCitation.ts,
boardAiChatDraftContext.ts, boardAiSearchContext.ts (only if needed for the
shared passage/sub-token code), lib/server/ai/boardAiChatContext.ts,
boardAiChatExecution.ts, boardAiProvenanceProof.ts, a new
lib/server/ai/boardAiKanbanContext.ts, the chat route under
app/api/boards/[id]/ai/ if it validates types, and their tests.
No UI, no git writes, no database changes.

## Addendum 1 — three reader fixes (review of the first implementation)
1. **Link targets must stay on this board.** The target-title lookup reads
   `kanban_cards` with `.in('id', targetIds)` only; add
   `.eq('canvas_id', boardId)`. A target not found on this board is written as
   "another card" — never its raw id.
2. **Newest 20 comments, not oldest.** Query `order('created_at', desc)` +
   `limit(20)`, then reverse so they read oldest→newest.
3. **Names.** `kanban_board_members` has no `display_name`/`email` columns
   (see 20260213_kanban_CORRECTED.sql), so that query fails and every person
   becomes a raw user id. Use the RPC the Kanban store uses,
   `get_board_members_with_profile({ board_id })`, through the caller's client
   (add `rpc` to the client interface). Use `display_name` only; when it is
   missing write "a board member". Never send an email address or a user id to
   the model (assignees and comment authors alike). Test both.

## Addendum 2 — a display name can itself be an email
Live: Board AI answered "According to the comment on that card (from
codex.scrawny…@…)" — the RPC's `display_name` for that account IS an email
address, so the email reached the model. In the member-name helper, treat a
`display_name` that contains "@" (after trim) as missing → "a board member".
This covers assignees, comment authors and the overview's people column (all
use the same helper). Test: display_name "x@y.z" → "a board member".
