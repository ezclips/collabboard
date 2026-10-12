# PATCH-344 — AI usage history on the Billing page

## Why
Owner, 2026-10-12, with a Heptabase screenshot: a usage table (Date & time,
Feature, Item, Plan, Credits) so a user can see where credits went. We already
write every managed AI charge to `public.ai_credit_usage` (PATCH-187: workspace,
board, user, feature, credits, bucket, created_at) but nobody can see it.

PM decisions:
- Read through the **actor's own Supabase client**, so the existing RLS policy
  `ai_credit_usage_select_members` (members of the workspace) decides — no
  admin client for the ledger. Board titles are read the same way, so a board
  the viewer cannot open is never named.
- No personal data about other members: the "Who" column says **You** or
  **Another member**, never a name or email.
- "Plan" from Heptabase is replaced by **Bucket** ("Monthly" / "Welcome
  credits"): the ledger stores the bucket, not the plan, and inventing a plan
  per row would be a guess.
- Calls on the user's own key never touch the ledger; the dialog says so.

## Design

### 1. Domain: `lib/domain/billing/aiCreditFeatureLabels.ts` (new, pure)
`aiCreditFeatureLabel(feature: AiCreditFeature): string` — one label per
`AI_CREDIT_COSTS` key, exhaustive (a `Record<AiCreditFeature, string>` so a new
feature fails to compile without a label):
board_chat "Board AI chat", table_from_document "Table from document",
wiki_compile "Wiki compile", text_action "Edit & rewrite", table_fill "Table
fill", table_plan "Table plan", notes_to_cards "Suggest cards",
transcript_punctuate "Readable transcript", component "AI card".
Unknown strings from the DB (older/newer rows) → "AI feature".

### 2. Route `GET /api/billing/usage/history` (new)
Injected handler `lib/server/billing/usageHistoryRoute.ts` (+ test), wired in
`app/api/billing/usage/history/route.ts`, reusing the SAME deps the usage
route uses for auth, workspace and membership (`getBillingActor`,
`resolveActorWorkspace`, the `get_workspace_role` read). Copy the order from
`usageRoute.ts`: 401 → 400 no workspace → 503 on role-read failure → 403 not a
member.

Query: `?before=<ISO timestamp>&limit=<n>`; zod-validated; `limit` default 50,
max 100; `before` optional (newest first).
- Ledger read via `actor.supabase`: `ai_credit_usage` `select('id, board_id,
  user_id, feature, credits, bucket, created_at')`, `.eq('workspace_id', …)`,
  `.lt('created_at', before)` when given, `.order('created_at', { ascending:
  false }).order('id', { ascending: false })`, `.limit(limit + 1)` to know
  `hasMore`.
- Board titles: ONE follow-up read `boards.select('id, title').in('id',
  distinctBoardIds)` via `actor.supabase` (no N+1). Missing → `null`.
- Any DB error → 503 `{ error: 'Usage history is unavailable right now.' }`.

Response (`Cache-Control: no-store`):
```json
{ "entries": [ { "id": "…", "createdAt": "…", "feature": "notes_to_cards", "featureLabel": "Suggest cards", "boardTitle": "Brainstorm" , "boardGone": false, "byYou": true, "credits": 1, "bucket": "allowance" } ], "nextBefore": "2026-10-11T…" }
```
`boardGone: true` when `board_id` is null (deleted board) or the title read
did not return it; `boardTitle` then `null`. `nextBefore` = last entry's
`createdAt` when there are more, else `null`.

### 3. Dialog `components/billing/AiUsageHistoryDialog.tsx` (new)
Uses `@/components/ui/dialog` (as `SendToKanbanDialog`). Fetching lives in a
small client function `lib/infra/billing/fetchAiUsageHistory.ts` (rule 1: no raw
network calls in components), zod-parsing the response.
- Title "AI usage". Table columns: **Date & time** (local, e.g. "12 Oct 2026,
  14:05"), **Feature**, **Board** ("Deleted board" / "A board you can't open"
  in muted text when `boardGone`), **Who** (You / Another member), **Credits**,
  **Bucket** (Monthly / Welcome credits).
- "Load more" button while `nextBefore` is set; loading and error states in
  plain words; empty state "No AI credits used yet."
- Footer note (muted): "AI that runs on your own API key doesn't use credits
  and isn't listed here."
- Scrollable body with sticky header (same pattern as the PATCH-342 Addendum 2
  dialog: header/footer fixed, middle scrolls; `max-h-[calc(100vh-48px)]`).
- `data-ai-usage-history="true"`, rows `data-ai-usage-row={id}`.

### 4. Billing page — one button
In the PATCH-191 Usage section, under the AI credits meter, a small text button
"View usage" (`data-billing-view-usage="true"`) opening the dialog. The page is
535 lines (over the ceiling): add only the button, the open state and the
dialog element (≈10 lines); everything else lives in the new files.

## Tests
- Labels: every `AI_CREDIT_COSTS` key has a non-empty label; unknown → "AI
  feature".
- Route (injected deps): 401; 400 no workspace; 403 non-member and the ledger
  is never read; 503 role-read failure and ledger failure; bad `limit`/`before`
  → 400; `limit` capped at 100; `hasMore` via limit+1 → `nextBefore`; board
  titles read once for distinct ids; deleted/unreadable board → `boardGone`;
  `byYou` true only for the actor's rows; no `user_id` value in the response.
- Dialog: rows render with labels; Load more appends and passes `before`;
  empty, error and loading states; the own-key note is shown.
- Billing page: "View usage" opens the dialog.

## Verification
`npx tsc --noEmit`, focused tests, full gate (`new []`). Live (PM): the
owner's Billing page → View usage shows the 500 credits spent before
2026-10-12 with board names; Load more works.

## Allowed files
new `lib/domain/billing/aiCreditFeatureLabels.ts` (+ test), new
`lib/server/billing/usageHistoryRoute.ts` (+ test), new
`app/api/billing/usage/history/route.ts`, new
`lib/infra/billing/fetchAiUsageHistory.ts`, new
`components/billing/AiUsageHistoryDialog.tsx` (+ test),
`app/dashboard/settings/billing/page.tsx` (button + dialog only, + its test).
No SQL, no git.

## Addendum 1 — PM review + live check (2026-10-12)
Live on the owner's workspace: page 1 → 200 (50 rows, titles correct), but
**Load more → 400 "Invalid query"**, and the dialog then showed 0 rows + an
error.
1. **HIGH — the cursor the route returns is rejected by its own schema.**
   `nextBefore` is Postgres's `created_at` verbatim, e.g.
   `2026-10-05T09:18:14.950477+00:00`. `z.string().datetime()` accepts only a
   `Z` suffix. Fix: `z.string().datetime({ offset: true })`. Route test: a
   request with exactly that string → 200 and `lt('created_at', …)` receives
   it unchanged; add a round-trip test (page 1's `nextBefore` fed to page 2).
   The tests passed because the fixtures used `…Z` timestamps — use the real
   Postgres shape (6-digit fraction, `+00:00`) in the fixtures.
2. **HIGH — a failed Load more must not throw away loaded rows (P3).** Keep
   the rows already shown; show a small inline error next to the button
   ("Couldn't load more. Try again.") and keep the button enabled for a retry.
   Only a failed FIRST page shows the full-dialog error. Dialog test for both.
Known limit, accepted: two ledger rows with the identical microsecond
`created_at` on a page boundary could skip one; ledger rows are one per AI
call, so this is left as is.
Allowed files: `lib/server/billing/usageHistoryRoute.ts` (+ test),
`components/billing/AiUsageHistoryDialog.tsx` (+ test).
