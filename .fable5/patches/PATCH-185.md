# PATCH-185 — billing step 2a: Knowledge uploads follow the board owner's plan

Status: AUTHORIZED (owner, 2026-09-25: "Push 851686f1, and start PATCH-185")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-183 (`713ad5c2`), PATCH-184 (`851686f1`)
Read first:
- `.fable5/docs/PRICING.md` §2 (Rule 1: the board OWNER's plan decides) and §3;
- `lib/domain/billing/plans.ts`, `lib/server/billing/stripeBilling.ts` (`findLivePaidSubscription`
  for the row-reading style);
- `lib/server/knowledge/knowledgeUploadRoute.ts` (the whole handler);
- the app route that wraps it (`app/api/boards/[id]/knowledge/route.ts`);
- `lib/domain/storage/uploadLimits.ts`;
- `components/collabboard/KnowledgePdfUploader.tsx` (how it shows a server error);
- `supabase/migrations/20260820_create_knowledge_data_foundation.sql` (`knowledge_documents`:
  `board_id`, `processing_status`);
- `supabase/migrations/20260309_scope_boards_and_folders_to_workspaces.sql` (`boards.workspace_id`).

---

## 1. Why, and what is deliberately NOT in this patch

`plans.ts` declares each plan's limits, and nothing enforces them yet. This patch enforces the
two that the Knowledge upload route can enforce correctly TODAY:

1. **File size per plan**, capped by the server's technical maximum. Knowledge uploads pass
   through server memory whole, so the route cannot accept 250 MB or 1 GB. The effective limit
   is `min(plan.fileSizeBytes, the existing technical cap)`:
   - PDF: Free 20 MB; Pro and Premium 50 MB for now;
   - text source: 20 MB for everyone.
2. **Documents processed on Free:** at most `plan.processedDocuments` (5) Knowledge documents
   across the boards of the owner's workspace.

**NOT in this patch (PATCH-186 will do them, and nothing here may pretend otherwise):**
- files above 50 MB (they need direct-to-storage upload links);
- raising the bucket caps to 1 GB (they stay at 50 MB);
- pages per PDF (the page count is only known after the worker extracts it);
- browser post uploads (`padlet-files`).

## 2. The design

### 2.1 Whose plan — `lib/server/billing/boardPlan.ts` (new)

```ts
export interface BoardPlan {
  readonly workspaceId: string | null;
  readonly planId: PlanId;
  readonly limits: PlanLimits;
}

/** The plan of the workspace that OWNS the board: boards.workspace_id → subscriptions → effectivePlanId. */
export async function resolveBoardPlan(adminClient, boardId: string): Promise<BoardPlan>;
```

- A board with no `workspace_id`, or a workspace with no subscription row → Free.
- A DB error → THROW (fail closed). The route answers 503. An error must never read as some
  plan: not as Free (a wrong refusal for a paying customer) and not as paid.
- Read with the ADMIN client. The uploader may be a contributor who cannot read the owner's
  `subscriptions` row, and Rule 1 says the owner's plan applies to them anyway.

```ts
/** Knowledge documents that count toward the plan: every row on the workspace's boards except processing_status 'failed'. */
export async function countWorkspaceKnowledgeDocuments(adminClient, workspaceId: string): Promise<number>;
```

- Count with `head: true`, `count: 'exact'`. Use two queries (the board ids of the workspace,
  then the documents with `board_id in (...)`), or one embedded filter if the schema allows. The
  smallest correct form wins; say which in your report.
- A failed extraction does not count: the user got nothing from it.
- A DB error → THROW.

### 2.2 The upload route

In `createKnowledgeUploadPostHandler`, add ONE injected dependency,
`resolvePlanForBoard(boardId): Promise<{ plan: BoardPlan; documentCount: number | null }>`.
- `documentCount` is null when `plan.limits.processedDocuments` is null: do not count for
  unlimited plans.
- The app route wires it to §2.1 with the admin client.

**Order** (keep every existing step, and insert the new ones where marked):
1. auth → 401 (unchanged);
2. rate limit → 429 (unchanged);
3. Content-Length gate at the TECHNICAL maximum (unchanged: a body over 51 MB is refused
   before reading);
4. **NEW:** `const { id: boardId } = await context.params` moves up here, then
   `resolvePlanForBoard(boardId)`. A throw → 503
   `{ error: 'Knowledge upload is temporarily unavailable' }`, the existing message;
5. **NEW:** document limit. When `documentCount !== null && documentCount >=
   plan.limits.processedDocuments` → 403:
   ```json
   { "error": "The Free plan includes 5 documents. Upgrade to add more.", "code": "plan_limit_documents" }
   ```
   Build the text from `PLANS[planId].name` and the number; don't hard-code "Free" or "5";
6. `formData()` (unchanged);
7. **CHANGED:** the size gate. `sizeLimitForFile(file, plan)` returns `min(plan.limits.fileSizeBytes,
   technical cap for the kind)` and a label. When the PLAN is the binding limit (plan limit <
   technical cap), the 413 message is:
   ```
   This file is 32.0 MB. The limit on the Free plan is 20.0 MB. Upgrade for larger files.
   ```
   with `code: 'plan_limit_file_size'`. Otherwise it is today's exact `tooLargeMessage` text,
   with no code. Add `planLimitMessage(sizeBytes, limitBytes, planName)` to `uploadLimits.ts`;
8. everything after is unchanged.

**Privacy note, accepted:** the plan is resolved before the ingestion path checks board access.
A caller without access to the board learns at most "this board's owner is on Free" from a
refusal message. It exposes no ids and no amounts. Record this in a comment at step 4.

### 2.3 The uploader

`KnowledgePdfUploader`'s own pre-check stays at the technical caps: the browser does not know
the owner's plan. The server's 413 and 403 messages must reach the user.
- Check how the uploader shows a failed POST.
- If it already shows the response's `error`, change nothing and say so.
- If it shows a fixed text, show `error` when present, falling back to the fixed text.
- If the response has a `code` starting with `plan_limit_`, show a link to
  `/dashboard/settings/billing` labelled `See plans`, in the same error spot.

## 3. Tests

- **`lib/server/billing/boardPlan.test.ts`** (injected client):
  - a board in a workspace with pro active → pro limits;
  - premium past_due → premium;
  - pro canceled → free;
  - no subscription row → free;
  - board without a workspace → free with `workspaceId: null`;
  - a boards read error THROWS;
  - a subscriptions read error THROWS;
  - `countWorkspaceKnowledgeDocuments` excludes `failed` (assert the filter), and a read error
    throws.
- **`knowledgeUploadRoute.test.ts`** (ADD; keep every existing assertion, and update the test
  deps only to supply the new dependency with a Free-by-default plan and document count 0):
  - Free: a 21 MB PDF → 413 with the exact plan message and `code: 'plan_limit_file_size'`, and
    `arrayBuffer` is never called;
  - Pro: a 49 MB PDF passes the size gate;
  - Pro: a 51 MB PDF → 413 with today's technical message and NO code;
  - Free with 5 documents → 403 `plan_limit_documents` BEFORE `formData()` is called;
  - Free with 4 documents passes;
  - Pro with `documentCount: null` passes, and the count is never computed;
  - a `resolvePlanForBoard` throw → 503, and `formData()` is never called;
  - a text source on Free: 20 MB passes, 21 MB → 413.
- **`uploadLimits.test.ts`:** `planLimitMessage` exact text.
- **The uploader** (its existing test file; ADD):
  - a 413 with an `error` shows that text;
  - a `plan_limit_` code shows the `See plans` link to `/dashboard/settings/billing`;
  - a 500 without `error` shows today's fallback.

## 4. Allowed files

```
lib/server/billing/boardPlan.ts, boardPlan.test.ts                         (new)
lib/server/knowledge/knowledgeUploadRoute.ts and its test
app/api/boards/[id]/knowledge/route.ts                                     (wire the dependency)
lib/domain/storage/uploadLimits.ts and its test                           (planLimitMessage)
components/collabboard/KnowledgePdfUploader.tsx and its existing test      (§2.3 only)
```

Everything else is forbidden: the worker, the migrations, storage buckets, the browser storage
gateway, the billing pages and `package.json`. **Never touch the database.** If a census or
wiring test outside these files needs a change, or anything is unclear, STOP and ask. Never use
git stash, reset, restore, checkout, clean, commit or push. Never run a production build. Make
every edit with a real tool call; never write a tool call out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/server/billing lib/server/knowledge lib/domain/storage components/collabboard/KnowledgePdfUploader
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- how the document count is queried;
- what the uploader did with server errors before this patch.

Do not commit.

The CTO verifies live:
- with the workspace on Free, a 21 MB PDF is refused with the plan message and the link;
- a 6th document is refused;
- on Pro, both pass.

## 6. Commit message (verbatim)

```
feat(billing): Knowledge uploads follow the board owner's plan

The plans declared file sizes and a document allowance, and nothing enforced them. A
Knowledge upload now reads the plan of the workspace that owns the board -- so a
contributor works within the owner's plan -- and refuses a file above that plan's size, or
a sixth document on Free, with a message that says which plan and links to the plans.

Files above 50 MB still cannot be accepted by any plan: the upload passes through server
memory, so larger files need direct upload links, which come next together with the page
limit and the storage cap. A plan that cannot be read refuses with "temporarily
unavailable" rather than guessing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
