# PATCH-058 - ARCHITECTURE RULING: the two AI-resize "writes" are inert and cannot be ported behavior-preservingly

**Status:** ARCHITECTURE RULING - OWNER DECISION REQUIRED. **NO IMPLEMENTATION
IS AUTHORIZED BY THIS DOCUMENT.** There is no extractor, no fence, and no
bound final hash because nothing may change until the owner rules.
**Authored:** 2026-07-13. Both callbacks were read in full, the installed
`@supabase/postgrest-js` source was read directly, and the decisive claim was
proven empirically against the installed package (probe transcript in §2).

## 1. The question this ruling answers

FreeformPadletCards has exactly two direct `padlets` writes left (post-057
lines 3278 and 3684) — the AI-resize "persistence" statements:

```
supabase.from('padlets').update({ width: newW, height: newH, updated_at: ... }).eq('id', padlet.id);
```

Both are bare expression statements: never awaited, never `.then()`d, value
discarded. The question: can they move onto `canvas.updatePostFields` without
awaiting, preserving "fire-and-forget" behavior?

## 2. The finding: there is no fire to forget

**An un-awaited supabase builder never executes.** The installed
`@supabase/postgrest-js` (bundled in `@supabase/supabase-js` 2.93.1) is a
LAZY thenable: `PostgrestBuilder`'s constructor only stores url/method/body;
the network call is issued inside `then(onfulfilled, onrejected)`
(`node_modules/@supabase/postgrest-js/dist/index.cjs`, `then()` begins at
line 80, `_fetch(...)` inside it). A statement that never awaits and never
calls `.then()` never triggers `fetch`.

Proven empirically against the installed package with an instrumented fetch
(probe: `scratchpad/probe_lazy_builder.cjs`, run 2026-07-13):

```
fetch calls 1500ms after BARE statement: 0 (builder is LAZY - request never sent)
fetch calls after AWAITED statement: 1
```

Therefore the exact current semantics, answering each bound question:

- Does the builder begin execution without awaiting? **NO.** No request is
  ever constructed beyond an in-memory object; nothing is sent.
- Is any returned promise/thenable observed? **NO.** Bare expression
  statement; the builder is discarded and garbage-collected.
- Resolved database error? **UNREACHABLE** — no request exists to resolve.
- Rejection? **UNREACHABLE.**
- Does any failure reach an enclosing catch? **NO** — neither callback has a
  try/catch, and no failure can occur.
- State/render ordering: `onPointerMove`/`onResize` update local size via
  `setPadlets` during the drag; `onPointerUp`/`onResizeEnd` compute the final
  size, clear the ref (pointer path), and execute the inert statement last.
  Rendering is driven entirely by local state.
- Unmount implications: **NONE** — nothing is in flight, ever.

**Product consequence (P3):** ai-component card resizes have NEVER been
persisted. No other write path in the repository, hooks, or CanvasClient
sends `width`/`height` for these cards (searched 2026-07-13). Every AI-card
resize silently reverts on the next `fetchData()` or reload. This is a
pre-existing, previously undiscovered data-loss defect — user work (the
resize) is lost by design of an unexecuted statement.

This also RECLASSIFIES the PATCH-053→057 deferral language: those specs said
porting these statements "would change their execution semantics." Correct
conclusion, understated premise — they have no execution semantics. The
deferral was right; the reason is now exact.

## 3. The ruling: no behavior-preserving port exists

Every candidate port changes behavior:

- `void updatePostFields(...)` (un-awaited command call): the command awaits
  the repository, which awaits the builder — **the request FIRES**. A write
  that has never occurred would begin occurring. That is a behavior change
  (data persists where it never did), plus a brand-new failure surface (an
  'unknown' rejection from a helper would become an unhandled rejection, or a
  swallow — either is a new channel where none existed).
- Awaiting inside the callback: same as above, plus blocking the pointer path.
- A "port" that preserves observable behavior exactly is the null port:
  deleting the statements (they do nothing) — but that is not a migration,
  and silently entrenching the data-loss defect via deletion is a product
  decision, not a refactoring one.

**Ruling: PATCH-058 authorizes NO migration. The two statements, the local
`supabase` client (these are its only remaining uses), and the grandfather
entry stay EXACTLY as they are until the owner decides between:**

- **Option A — authorize the FIX (CTO recommendation, per P3):** a follow-up
  patch routes both callbacks through a best-effort consumer of
  `canvas.updatePostFields`, making AI-resize actually persist. This is a
  DISCLOSED BEHAVIOR CHANGE: sizes start saving; a failure-channel ruling
  (swallow vs. log) must be part of that spec; the existing test net cannot
  pin it (nothing tests a write that never happened), so the spec must say
  what, if anything, pins it.
- **Option B — authorize DELETION of the two inert statements:** observably
  behavior-preserving (no request before, none after), retires the raw-write
  census to 0 and orphans the local client — but permanently entrenches
  non-persisting AI-resize as the product's intended behavior. If chosen,
  closeout analysis (client removal, grandfather 2→1) happens ONLY after a
  fresh live census, per the standing no-closeout rule.

Doing nothing (deferring the decision) is also safe: the statements are
inert; they cannot fail, block, or leak.

## 4. Standing constraints while the decision is pending

- MUST NOT CHANGE without an owner ruling:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7e8c3c26ffc8e50308020470568590e969e50982
```

- Census freeze (exact code-form instruments):

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 2 (both inert, lines 3278/3684)
rg -n '^\s*await supabase$' "$F" | wc -l # 0 (extinct since PATCH-057)
wc -l "$F" # 6336
```

- Grandfather stays 2. No closeout is claimed or implied: the component still
  contains two raw statements and a live Supabase client, and the boundary
  question is unresolved until the owner picks A or B.
- Do not draft PATCH-059. Do not implement Option A or B speculatively.

## 5. Lesson extracted

Recorded in LESSONS_LEARNED.md: **"An un-awaited Supabase builder is not a
fire-and-forget write — it is no write at all."** Reusable rule: before
porting any "fire-and-forget" call, prove whether it ever executes — supabase
builders are lazy thenables that only issue their request inside `then()`; a
census instrument that counts builder expressions counts INTENTS, not
requests. Verify with the installed package (source read + instrumented-fetch
probe), never from API-shape intuition.
