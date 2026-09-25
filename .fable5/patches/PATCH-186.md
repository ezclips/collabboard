# PATCH-186 — billing step 2b: the page limit per PDF, enforced by the worker

Status: AUTHORIZED (owner, 2026-09-26: "Page limit now, big files later"; the Supabase project
is on the Free plan, so files stay capped at 50 MB and large uploads are a later patch)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-185 (`a4def207`)
Read first:
- `.fable5/docs/PRICING.md` §3 (pages per PDF: Free 50, Pro 500, Premium 2,000);
- `lib/domain/billing/plans.ts`, `lib/server/billing/boardPlan.ts`;
- `workers/knowledge-pdf/processKnowledgePdfDocument.ts` (the whole pipeline; note that
  `stage = 'geometry'` yields the page geometry BEFORE the expensive parser runs), its
  dependencies type and how the real dependencies are built (`cli.ts`, `dispatcher.ts`);
- `workers/knowledge-pdf/workerIsolation.source.test.ts` (what the worker may import);
- `lib/domain/knowledge/knowledgeExtraction.ts` (`failKnowledgeExtraction`,
  `sanitizeKnowledgeProcessingError`);
- the claim/lease SQL in `supabase/migrations/20260822_add_knowledge_processing_lease.sql`
  (which statuses are claimable, and how many attempts);
- how the canvas card and the reader show a document whose `processing_status` is `failed`.

---

## 1. Why

Each plan allows a maximum number of pages per PDF. Pages are the real cost: every page is
extracted, drawn and indexed. Only the worker learns the page count, and it learns it cheaply:
the `geometry` step reads each page's size before the expensive OpenDataLoader run. So the
check belongs right after `geometry`. A PDF over its limit is refused there, before any
extraction work is spent, and the person sees why.

## 2. The design

### 2.1 The limit, and the message — in the domain

Add to `lib/domain/billing/plans.ts`:

```ts
/** The stored, user-facing refusal. A fixed shape so the UI can recognise it and never shows any other processing error. */
export const PLAN_PAGE_LIMIT_PREFIX = 'Page limit: ';
export function planPageLimitError(pageCount: number, limit: number, planName: string): string;
// → "Page limit: This PDF has 612 pages. The Free plan allows 50 pages per PDF."
export function isPlanPageLimitError(value: unknown): value is string;   // starts with the prefix
```

The message must pass `sanitizeKnowledgeProcessingError` unchanged. It has no URLs or tokens and
stays under the max length. Assert that in a test.

### 2.2 The worker checks the page count after `geometry`

- Add ONE dependency to the worker, `pagesLimitForBoard(boardId): Promise<{ limit: number;
  planName: string }>`. It returns the limit of the plan of the workspace that OWNS the board:
  the same rule and the same fail-closed behaviour as `resolveBoardPlan` (PATCH-185).
  - If the worker may import `lib/server/billing/boardPlan.ts` under `workerIsolation`, reuse it.
  - If it may not, add the smallest equivalent in a module the worker is allowed to import.
    Implement it with the worker's existing admin database client, and say which in your
    report.
  - If `workerIsolation` needs any change to allow this, STOP and ask.
- **Right after `const geometry = await deps.geometry(originalBytes);`:**
  1. `pageCount = geometry.length` (or whatever the geometry's page count really is: check).
  2. Call `pagesLimitForBoard(job.boardId)`.
     - A THROW (the plan cannot be read) → fail closed. Treat it like any infrastructure failure
       at this stage: the existing failure path, the existing retry behaviour. NEVER process the
       document as if unlimited.
  3. If `pageCount > limit` → throw a
     `new KnowledgePdfWorkerError('page-limit', planPageLimitError(pageCount, limit, planName))`.
     It goes through the EXISTING failure path, so the lease, cleanup and `failed` status all
     behave exactly as for any other failure.
- **Retries.** Check whether a `failed` document is claimed again automatically (the lease SQL).
  If it is, a page-limit failure would be retried forever for nothing.
  - If there is a bounded attempt counter that already stops this, say so.
  - If not, STOP and ask before changing the SQL or the claim.

### 2.3 The person sees why

Find where a `failed` Knowledge document is shown: the canvas PDF card, the reader, and the
Knowledge list, if it exists. Wherever a failed state is rendered and `processing_error`
satisfies `isPlanPageLimitError`:
- show that message without the prefix;
- add a `See plans` link to `/dashboard/settings/billing`.

Every other `processing_error` stays hidden, exactly as today. If the failed document's
`processing_error` does not reach the client at all today, add it to the ONE read that serves
that state. Send it only when `isPlanPageLimitError(value)`, and otherwise send null, so no other
error text newly leaves the server. Report which read you changed.

## 3. Tests

- **`plans.test.ts`:**
  - the exact `planPageLimitError` text;
  - `isPlanPageLimitError` for that text (true), for `Extraction failed` (false) and for null
    (false);
  - the message passes `sanitizeKnowledgeProcessingError` unchanged.
- **Worker** (`processKnowledgePdfDocument.test.ts`, ADD; keep every assertion):
  - 51 pages on a Free board (limit 50) → failed with EXACTLY the plan message, and the parser
    is NEVER run;
  - 50 pages → proceeds and the parser runs;
  - Pro limit 500 with 51 pages → proceeds;
  - `pagesLimitForBoard` throws → the existing failure path, the parser is never run, and the
    status is not `ready`;
  - the geometry step runs before the limit check. Assert the call order.
- **The UI** (the existing test file of each surface you change):
  - a failed document whose error is the plan message shows it plus the `See plans` link;
  - a failed document with any other error shows today's generic state with no link, and the
    other error's text does NOT appear.
- **Server read** (if you changed one): a non-plan `processing_error` is sent as null.

## 4. Allowed files

```
lib/domain/billing/plans.ts, plans.test.ts
workers/knowledge-pdf/processKnowledgePdfDocument.ts and its test
the worker's dependency wiring (cli.ts / dispatcher.ts / runDispatcher.ts) -- only to supply pagesLimitForBoard
lib/server/billing/boardPlan.ts (only if a small export is needed for reuse)
the UI surface(s) that render a failed document, and their existing tests (§2.3 only)
at most one server read route that returns a document's failed state, and its test (§2.3 only)
```

Everything else is forbidden:
- migrations and the claim/lease SQL (STOP and ask instead);
- `workerIsolation.source.test.ts` (STOP and ask);
- the upload route, storage and `package.json`.

**Never touch the database, and never run the worker against real data.** If a census or wiring
test outside these files needs a change, or anything is unclear, STOP and ask. Never use git
stash, reset, restore, checkout, clean, commit or push. Never run a production build. Make every
edit with a real tool call; never write a tool call out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/billing workers/knowledge-pdf components/collabboard/KnowledgePdfCanvasSurface components/collabboard/knowledgePdfCard
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- how `pagesLimitForBoard` is implemented and wired;
- the retry finding (§2.2);
- which UI surfaces and which read you changed.

Do not commit.

## 6. Commit message (verbatim)

```
feat(billing): the page limit per PDF, enforced before extraction

Each plan allows a maximum number of pages per PDF (Free 50, Pro 500, Premium 2,000),
because every page is extracted, drawn and indexed. The worker now reads the plan of the
workspace that owns the board right after it measures the pages -- before the expensive
extraction runs -- and refuses a PDF over the limit. The person sees why on the document
("This PDF has 612 pages. The Free plan allows 50 pages per PDF.") with a link to the plans;
every other processing error stays hidden as before. A plan that cannot be read fails the
attempt rather than processing the PDF as unlimited.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
