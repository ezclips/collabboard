# PATCH-343 — AI credit bar and low-credit warning in Board AI chat

## Why
Owner, 2026-10-12, after running out of credits without warning: "we might want
to build some kind of token counter including warning the user of low token".
Reference: Heptabase shows a thin blue line at the bottom of its AI chat that
shrinks from full to empty. Today the balance is visible only on the Billing
page (PATCH-191), and a user learns they are out only when a request is refused
(PATCH-188 "See plans").

PM decisions:
- **Credits, not tokens.** Credits are what plans sell and what the server
  meters (`AI_CREDIT_COSTS`); tokens differ per model and mean nothing to users.
- **The board owner's plan pays** (PRICING.md Rule 1), so the bar shows the
  BOARD's workspace balance, not the viewer's own workspace. That needs a
  board-scoped read; `/api/billing/usage` is the actor's workspace and stays
  unchanged.
- First surface: the Board AI chat drawer (Heptabase's placement). Other AI
  panels can reuse the component later.

## Design

### 1. Domain: `lib/domain/billing/creditLevel.ts` (new, pure)
- `export const LOW_CREDIT_FRACTION = 0.2;`
- `export type CreditLevel = 'ok' | 'low' | 'empty';`
- `creditLevel(remaining: number, total: number): CreditLevel` —
  `total <= 0 || remaining <= 0` → `'empty'`; `remaining / total <= 0.2` →
  `'low'`; else `'ok'`.
- `creditFillPercent(remaining, total): number` — `0..100`, rounded,
  `total <= 0` → 0, clamped.

### 2. Route `GET /api/boards/[id]/ai/credits` (new)
Injected handler like `lib/server/billing/usageRoute.ts` so it is testable
without a database: `lib/server/billing/boardCreditsRoute.ts` +
`app/api/boards/[id]/ai/credits/route.ts` (wires the real deps).

Order (load-bearing, same fail-closed style as `checkAiActionCredits`):
1. Auth (`createRouteHandlerClient` + `getUser`, as the notes-to-cards route) → 401.
2. `canReadBoardKnowledge(supabase, boardId, user.id)` false → 403. A board
   the caller cannot read must not reveal its owner's plan or balance.
3. `resolveBoardPlan(getSupabaseAdmin(), boardId)`.
4. Free plan → credits all zero, no renewal (same rule as `creditMeter` in
   `usageRoute.ts`).
   Otherwise `readAiCreditBalance(admin, plan, new Date())` and the same meter
   maths. **Export `creditMeter` from `usageRoute.ts` and reuse it** — do not
   copy it.
5. `ownKey` = `planIncludes(plan.planId, 'premium')` AND
   `resolveAIModelSourceForRole(userId, AI_ROLE_CHAT, prefs) === 'byok'`.
   This is exactly when a chat call skips credits (`decideBoardAiCredits`).
6. Any throw in 2–5 → 503 `{ error: 'AI credits are unavailable right now.' }`.

Response (`Cache-Control: no-store`):
```json
{ "planId": "premium", "credits": { "used": 500, "total": 2000, "remaining": 1500, "renewsOn": "2026-10-25T17:35:45.000Z" }, "ownKey": true }
```

### 3. Client hook `lib/hooks/useBoardAiCredits.ts` (new)
`useBoardAiCredits(boardId)` → `{ data, refresh }`. Fetches once on mount and
whenever `refresh()` is called. While loading or after a failure `data` is
`null` — **never show a guessed number** (same rule as
`BoardAiChatModelChooser`).

### 4. Component `components/billing/AiCreditBar.tsx` (new)
Props: `{ data: BoardAiCredits | null }`. Renders nothing when `data` is null.
- `ownKey: true` → no bar; one muted line: "Using your own AI key — no credits used".
- `planId === 'free'` → muted line "No AI on Free · See plans" (link
  `/dashboard/settings/billing`).
- Otherwise a **thin full-width bar** (`h-1`, rounded, grey track) whose fill
  width is `creditFillPercent(remaining, total)`:
  - `ok`: blue fill (`bg-blue-500`), no text. The track's `title` and an
    `aria-label`: "1,500 of 2,000 AI credits left · renews 25 Oct".
  - `low`: amber fill + a one-line text under it: "AI credits running low: 400
    left · renews 25 Oct · See plans".
  - `empty`: red track + text: "No AI credits left until 25 Oct · See plans".
- `role="meter"` with `aria-valuenow={remaining}` `aria-valuemin={0}`
  `aria-valuemax={total}`; `data-ai-credit-bar={level}` (or `"own-key"` /
  `"free"`) for tests.
- Numbers with `toLocaleString()`. The date uses the Billing page's
  formatter: `formatBillingDate` is currently local to
  `app/dashboard/settings/billing/page.tsx` (line ~27) — **move it unchanged**
  to new `lib/domain/billing/formatBillingDate.ts` and import it from both
  places (P6: one implementation). The billing page is 535 lines, so it must
  shrink or stay equal, never grow.

### 5. One-time low warning (inside `AiCreditBar`, not the drawer)
When the level is `low` or `empty`, `AiCreditBar` shows ONE sonner
`toast.warning` with the same text as the bar. Remember it per credit period in
`localStorage` under `collabboard:ai-credit-warned:<renewsOn>:<level>`; wrap
every storage read and write in try/catch (storage can throw) and, if storage
fails, warn at most once per page load (module-level set). Put the
remember/should-warn logic in a small pure helper in `creditLevel.ts` so it is
unit-tested without React.

### 6. Wire into `components/collabboard/BoardAiChatDrawer.tsx` — wiring only
The drawer is 2,353 lines, far over the 400-line component ceiling
(`.fable5/CLAUDE.md` rule 3), so it gets **only** these lines (about 5–8 net):
- `const credits = useBoardAiCredits(boardId);`
- `<AiCreditBar data={credits.data} />` directly **above the composer** (the
  block holding `data-board-ai-chat-input`), full width, inside the drawer's
  existing padding.
- `credits.refresh()` once after every chat POST settles (success, 402
  refusal or error) — in the existing `finally`/settle path of the send
  handler, not on keystrokes, not on a timer.
Do not change the chat request, the model chooser or any error handling.

## Tests
- `creditLevel.test.ts`: ok / low at exactly 20% / empty at 0 / total 0 →
  empty; fill percent clamps and rounds.
- `boardCreditsRoute.test.ts` (injected deps): 401; 403 when the board is not
  readable AND plan/balance are never read; free → zeros, `renewsOn: null`;
  Pro → meter from the balance, `ownKey: false` even with a byok preference;
  Premium + byok → `ownKey: true`; Premium + default → `ownKey: false`; a
  throw in plan/balance/preference → 503.
- `AiCreditBar.test.tsx`: null renders nothing; ok/low/empty attributes,
  widths and texts; own-key line; free line; meter aria values.
- Drawer: the bar renders above the input; `refresh` is called after a send
  settles; the warning toast fires once per `renewsOn`+level and not again on
  re-render (mock `sonner` and `fetch`).

## Verification
`npx tsc --noEmit`, focused tests, full gate (`new []`). Live (PM): owner's
Premium board shows "Using your own AI key"; a Pro-plan view is checked with a
mocked route response for ok / low / empty.

## Allowed files
new `lib/domain/billing/creditLevel.ts` (+ test), new
`lib/server/billing/boardCreditsRoute.ts` (+ test), new
`app/api/boards/[id]/ai/credits/route.ts`, `lib/server/billing/usageRoute.ts`
(export `creditMeter` only), new `lib/hooks/useBoardAiCredits.ts`, new
`components/billing/AiCreditBar.tsx` (+ test),
`components/collabboard/BoardAiChatDrawer.tsx` (wiring only, + its tests),
new `lib/domain/billing/formatBillingDate.ts`,
`app/dashboard/settings/billing/page.tsx` (import the moved formatter only).
No SQL, no git.

## Addendum 1 — PM review (2026-10-12)
1. **HIGH — the credits fetch breaks the drawer's "nothing until opened" rule.**
   `CanvasClient.tsx` (~L1650) documents that every fetch in
   `BoardAiChatDrawer` is gated on `isOpen`, which starts false. The drawer is
   mounted while closed (`if (!isOpen) return null` comes after the hooks), so
   `useBoardAiCredits(boardId)` fires `/ai/credits` (4 DB reads) on EVERY
   board open, even when nobody opens Board AI. Fix: call
   `useBoardAiCredits(isOpen ? boardId : null)` — the hook already treats a
   null id as "no data, no fetch", and reopening refetches, which is correct.
   Add a drawer test: closed drawer makes no `/ai/credits` request; opening it
   makes exactly one.
2. **MEDIUM — validate the response with zod** (`.fable5/CLAUDE.md` rule 6).
   In `useBoardAiCredits`, parse the body with a zod schema (planId in the
   `PlanId` values, credits numbers ≥ 0, renewsOn string|null, ownKey boolean);
   a body that fails → `data = null`. One hook test for a malformed body.
Allowed files: `components/collabboard/BoardAiChatDrawer.tsx` (that one line),
`lib/hooks/useBoardAiCredits.ts` (+ a new test file), the drawer test.
