# PATCH-188 — billing step 3b: the board-less AI actions carry their board and pay from its owner's plan

Status: AUTHORIZED (owner, 2026-09-26: "yes" to "Push 00bd7a9c, and start PATCH-188")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-187 (`00bd7a9c`)
Read first:
- `.fable5/patches/PATCH-187.md` (the whole design; this patch applies it to seven more routes);
- `lib/server/billing/aiCredits.ts` (`checkBoardAiCredits`, `recordBoardAiCreditUsage`) and
  `lib/domain/billing/plans.ts` (`AI_CREDIT_COSTS`, the `plan_limit_` codes);
- how PATCH-187 wired `app/api/boards/[id]/ai/table-from-document/route.ts`: the check after
  authorization, the charge after success only when `source === 'collabboard-default'`, and the
  logged-and-swallowed recording failure. Copy that shape;
- `lib/server/knowledge/knowledgeBoardReadAuthorization.ts` (`canReadBoardKnowledge`);
- the seven routes:
  - `app/api/ai/text-action/route.ts`;
  - `table-fill`;
  - `table-plan`;
  - `transcript-punctuate`;
  - `generate-component`;
  - `convert-component`;
  - `classify-intent`;
- `lib/server/ai/componentGeneration.ts`;
- their nine browser callers:
  - `components/collabboard/editors/TableFillPanel.tsx`, `TableRowFillPanel.tsx`,
    `TableAIEditPanel.tsx` and `TableAskAIPanel.tsx`, which live in `TableEditor.tsx`. It already
    has an optional `boardId` prop;
  - `components/collabboard/editors/SelectedTextAIPanel.tsx`, used by `NoteEditor.tsx` and
    `DocumentEditor.tsx`;
  - `components/collabboard/KnowledgeSourceAIPanel.tsx` and `KnowledgeTextSourceView.tsx`, used
    by `KnowledgeSourceReaderDrawer.tsx`;
  - `components/ai/editors/AIContentConvertModal.tsx` and
    `components/collabboard/editors/AIComponentEditor.tsx`, used by
    `components/collabboard/canvas/ui/CanvasModals.tsx`;
- `components/collabboard/editors/TableFromDocumentPanel.tsx` (how PATCH-187 shows a
  `plan_limit_` error with the `See plans` link).

---

## 1. Why

These seven routes call a model on the CollabBoard key and nothing meters them. They carry no
board, so they cannot follow PRICING.md Rule 1: the board owner's plan pays. Every one of their
callers is inside a board, so the board is known in the browser. This patch sends it, verifies
it on the server, and meters the call exactly as PATCH-187 does.

| Route | Feature | Credits (basic) | Role for the pre-check |
|---|---|---|---|
| `text-action` | `text_action` | 1 | the role the route already resolves (from the body, default `AI_ROLE_EDIT`) |
| `table-fill` | `table_fill` | 1 per request | `AI_ROLE_EDIT` |
| `table-plan` | `table_plan` | 1 | `AI_ROLE_EDIT` |
| `transcript-punctuate` | `transcript_punctuate` | `ceil(passages.length / 10)` | `AI_ROLE_SOURCE` |
| `generate-component` | `component` | 1 | the role `componentGeneration.ts` uses |
| `convert-component` | `component` | 1 | same |
| `classify-intent` | none: cost 0, never recorded | 0 (pauses on an empty balance, like starter questions) | same |

- The migration from PATCH-187 already allows every one of these `feature` values. **No
  migration in this patch.**
- Add `transcriptPunctuateCredits(passageCount: number): number` to `plans.ts`:
  `Math.ceil(n / 10)`, at least 1 for n ≥ 1.

## 2. The design

### 2.1 The request carries `boardId`

- Each of the seven request bodies gains an OPTIONAL `boardId: z.string().uuid()`.
  - For the routes that validate with a strict zod schema, add it to the schema.
  - For the routes that read fields by hand, validate it the same way. A present but non-uuid
    value → 400.
- **It is optional on purpose.** A caller on their OWN key (byok) needs no board: their key pays.
- On a MANAGED call without a `boardId` → 402:
  ```json
  { "error": "This AI action isn't linked to a board, so it has no AI credits. Your own AI key still works.",
    "code": "plan_limit_no_board" }
  ```
  Put the text and the code in `plans.ts` next to `PLAN_NO_WORKSPACE_ERROR`.

### 2.2 The order, in every route

Keep every existing step. Insert these after authentication, the rate limit and body validation,
and before the model is called:

1. `checkBoardAiCredits`-style pre-check of the SOURCE: if the role resolves to `byok`, skip every
   step below and run exactly as today. **A byok caller must not need a board, must not have its
   board read, and must never read the ledger.**
   - If `checkBoardAiCredits` cannot express "no board", resolve the source first with
     `resolveAIModelSourceForRole` (its own export). Put the small shared helper for these seven
     routes in `lib/server/billing/aiCredits.ts`, not in each route. Name it
     `checkAiActionCredits`.
2. Managed and no `boardId` → the 402 of §2.1.
3. Managed with a `boardId` → **the caller must be able to read that board:** `canReadBoardKnowledge`
   through the caller's OWN session client.
   - false → 403 `{ error: 'Forbidden' }`;
   - a throw → 503.
   - **Why this matters:** without it, anyone could spend ANY workspace's credits by naming its
     board.
4. Then `checkBoardAiCredits` / the credit check exactly as PATCH-187:
   - refused → 402 with its body;
   - a throw → 503;
   - the model is never called in any of these cases.
5. After a successful model call, charge the cost only when `charge` is true and the source that
   ACTUALLY ran was `'collabboard-default'`.
   - A recording failure → `console.error('AI credit usage was not recorded', { boardId, feature,
     credits })`, and the answer is still returned.
   - A failed model call is never charged.

For `componentGeneration.ts`: if the model resolution for generate/convert/classify lives there,
thread `boardId` through its input and do the check there, the way PATCH-187 did it inside
`compileBoardWikiProposal`. Say which you chose.

### 2.3 The browser sends the board

- Every one of the nine callers sends `boardId` in its request body when it has one.
- Thread the board id from where it exists (the canvas / `CanvasModals` / the reader drawer) down
  through the props that already lead to the caller:
  - optional props only;
  - no context providers;
  - no new global state.
- `TableEditor` already has an optional `boardId`: pass it to its four AI panels.
- Where a caller genuinely has no board (for example a test mount), it omits the field. It must
  not send `boardId: undefined` as a string, or send an empty string.
- Report every file you threaded the prop through.

### 2.4 The person sees why — ONE shared piece

Six surfaces already inline the same `See plans` link. Add ONE small shared component,
`components/billing/PlanLimitNotice.tsx`, that renders `message` plus the `See plans` link to
`/dashboard/settings/billing`, and one pure helper:

```ts
/** The server's plan-limit refusal, or null for any other error body. */
export function planLimitFromResponse(status: number, body: unknown): { message: string; code: string } | null;
// Non-null only when body.code is a string starting with 'plan_limit_' and body.error is a non-empty string.
```

- Use them in the nine callers: a `plan_limit_` error shows the notice, and every other error
  keeps today's exact text.
- **Do not change the six existing inline copies.** That is a separate cleanup.
- If one of the nine callers needs more than a small change to show the notice, STOP and ask.

## 3. Tests

- **`plans.test.ts`:**
  - `transcriptPunctuateCredits`: 1→1, 10→1, 11→2, 12→2;
  - the `plan_limit_no_board` text.
- **`aiCredits.test.ts`** (`checkAiActionCredits`, injected):
  - byok → no board read, no ledger read, allowed without a board;
  - managed without a board → `plan_limit_no_board`;
  - managed on a board the caller cannot read → forbidden, and no ledger read;
  - managed and readable → the PATCH-187 decision.
- **Each of the seven route test files** (ADD; keep every existing assertion, and update
  existing test setup only to supply the new dependency with a byok-by-default decision, as
  PATCH-187 did):
  - byok without `boardId` → runs as today, and nothing is recorded;
  - managed without `boardId` → 402 `plan_limit_no_board`, and the model is never called;
  - managed with a board the caller cannot read → 403, and the model is never called;
  - managed with credits → the model runs and exactly the cost is recorded, with the right
    `feature` (`transcript-punctuate`: 12 passages → 2);
  - refused → 402, and the model is never called;
  - check throws → 503;
  - model fails → nothing is recorded;
  - recording throws → the answer is still returned;
  - a non-uuid `boardId` → 400;
  - `classify-intent`: a managed success records nothing.
- **`PlanLimitNotice` / `planLimitFromResponse`:**
  - the helper for a `plan_limit_credits` body → non-null;
  - for `{ error: 'x' }` → null;
  - for a code without `error` → null;
  - the component renders the message and the link.
- **The callers** (ADD to each existing test file; where a caller has no test file, add the case to
  the nearest existing test that mounts it):
  - the request body carries `boardId` when the prop is given;
  - a 402 `plan_limit_credits` shows the message and the link;
  - any other error keeps today's text.
- **Source census:** if `lib/infra/knowledge/knowledgeSourceAiWiring.source.test.ts` or another
  source-scan asserts an exact `fetch('/api/ai/...'` call text, update ONLY the assertion that
  your body change breaks, mechanically, and list each one in your report. If a census asserts
  something beyond the call text, STOP and ask.

## 4. Allowed files

```
lib/domain/billing/plans.ts, plans.test.ts
lib/server/billing/aiCredits.ts, aiCredits.test.ts
the seven app/api/ai/* routes, and their existing tests (lib/server/ai/*Route*.test.ts, componentRoutesByok.test.ts)
lib/server/ai/componentGeneration.ts (only to thread boardId and the check)
components/billing/PlanLimitNotice.tsx (+ test)                                   (new)
the nine callers, and the parents that only pass the board id down (§2.3), and their existing tests
the source-scan assertions of §3 (the call-text only)
```

Everything else is forbidden:
- migrations;
- the PATCH-187 routes (chat, starter questions, table from document, wiki);
- the six existing inline `See plans` copies;
- the billing pages, Stripe, the worker and `package.json`.

**Never touch the database.** If a census or wiring test needs more than §3 allows, or anything is
unclear, STOP and ask. Never use git stash, reset, restore, checkout, clean, commit or push.
Never run a production build. Make every edit with a real tool call; never write a tool call
out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/billing lib/server/billing lib/server/ai components/billing components/collabboard/editors components/ai lib/infra/knowledge
npx vitest run --reporter=json --outputFile=.opencode-vitest-188.json
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- where the component check lives;
- every file the board id was threaded through;
- every census assertion you changed.

Do not commit.

The CTO verifies live:
- a text action, a table fill and a Readable transcript on a board each record their credits;
- a request naming a board the caller cannot read is 403;
- a byok call records nothing.

## 6. Commit message (verbatim)

```
feat(billing): AI actions carry their board and pay from its owner's plan

Text actions, Fill with AI, the table plan, Readable transcripts and AI components called
the model on the CollabBoard key without any metering, because they did not say which board
they acted on. Every one of them runs inside a board, so the browser now sends it; the
server checks that the caller can read that board -- otherwise anyone could spend another
workspace's credits by naming its board -- and then checks and charges the owner's AI
credits exactly as the board AI features do (1 credit each; a Readable transcript 1 per 10
passages). A call on the person's own AI key needs no board and costs nothing. A refusal
shows the plan message and a link to the plans.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
