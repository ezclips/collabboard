# PATCH-010 — Extraction (type-only): domain AuthUser type; CanvasModals + OverlayLayer off @supabase types

**Status:** in progress (GPT-5.4) — **Amendment 1 issued after a correct tsc block; resume at the bottom**
**Complexity:** trivial (type-position changes only; zero runtime diff)
**Assigned model:** **GPT-5.4**
**Pattern:** new — "type-only import swap" (will enter PATCH_REFERENCE at
review). Degenerate cousin of Pattern B: the only `@supabase` dependency is
`import type { User }`.

## Goal
Remove the type-only `@supabase/supabase-js` imports from
`components/collabboard/canvas/ui/CanvasModals.tsx` and
`components/collabboard/canvas/ui/OverlayLayer.tsx` by introducing a domain
auth-user type; grandfather list 17 → 15. First shrink of `components/**`.

## Evidence (CTO-verified 2026-07-07)
Both files' ONLY supabase reference is `import type { User }` (line 4 each)
used in a prop type (`user: User | null`). Fields actually accessed:
CanvasModals — `user?.id`, `user?.email`, `user?.user_metadata?.full_name`,
`user?.user_metadata?.avatar_url`. OverlayLayer — `user?.id`, `user?.email`.

## Bindings

- **Create `lib/domain/auth/user.ts`** with exactly:
  ```ts
  /**
   * Structural subset of an authenticated user, as UI components need it.
   * Supabase's `User` is assignable to this type — callers keep passing it.
   */
  export interface AuthUserMetadata {
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  }

  export interface AuthUser {
    id: string;
    email?: string | null;
    user_metadata?: AuthUserMetadata;
  }
  ```
  No zod, no functions — a pure type module (domain-purity lint applies).
- **In each component:** replace the `import type { User } ...` line with
  `import type { AuthUser } from '@/lib/domain/auth/user';` (adjust the
  relative/alias form to match the file's existing import style) and change
  the prop type `User | null` → `AuthUser | null`. NOTHING else changes —
  no logic, no JSX, no other lines.
- Callers (CanvasClient etc.) still pass the Supabase `User`; it is
  structurally assignable to `AuthUser`. Do not touch any caller.

## Files to Create
- `lib/domain/auth/user.ts` (verbatim above)

## Files to Modify
- `components/collabboard/canvas/ui/CanvasModals.tsx` (2 lines: import + prop type)
- `components/collabboard/canvas/ui/OverlayLayer.tsx` (2 lines: import + prop type)
- `eslint.boundaries.config.mjs` — LAST, delete exactly these two lines:
  `'components/collabboard/canvas/ui/CanvasModals.tsx',` and
  `'components/collabboard/canvas/ui/OverlayLayer.tsx',`

## MUST NOT touch
Every other line of those two components; all callers; `lib/domain/core/**`;
all other files; `.fable5/`; `.claude/`. No new dependencies. No unit tests
(a pure type has no behavior); no new e2e spec (see Verification — the type
system plus the existing suite is the complete proof for a type-only change).

## Pre-edit census (paste output; STOP if it shows more)
```bash
grep -n "supabase\|Supabase" components/collabboard/canvas/ui/CanvasModals.tsx
grep -n "supabase\|Supabase" components/collabboard/canvas/ui/OverlayLayer.tsx
# each must show EXACTLY one line: the type import this patch replaces
grep -oE "\buser(\?)?\.[a-zA-Z_]+" components/collabboard/canvas/ui/CanvasModals.tsx | sort -u
grep -oE "\buser(\?)?\.[a-zA-Z_]+" components/collabboard/canvas/ui/OverlayLayer.tsx | sort -u
# must show no fields beyond: id, email, user_metadata (per Evidence above)
```

## Risks
Near-zero. Only failure mode: a `User` field in use that `AuthUser` lacks —
`tsc` catches it; if that happens, STOP and report (the fix is a CTO
decision about the domain type, not an ad-hoc field addition).

## Commit
  Commit message:
  refactor(auth): extract domain AuthUser type for CanvasModals + OverlayLayer

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches the Evidence section
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with BOTH entries removed
- [ ] Existing e2e suite fully green (canvas lifecycle exercises both components)
- [ ] `grep -c "@supabase" <file>` → 0 for both components
- [ ] Grandfather list = 15
- [ ] `git diff` shows exactly 4 changed lines across the two components
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
npx tsc --noEmit
npm run test:unit
PW_BASE_URL=http://localhost:3000 npx playwright test
grep -c "@supabase" components/collabboard/canvas/ui/CanvasModals.tsx   # 0
grep -c "@supabase" components/collabboard/canvas/ui/OverlayLayer.tsx   # 0
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 010,
`{{TITLE}}` = type-only AuthUser extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0 first. This is a type-position-only
patch: 4 changed lines in components plus 1 new type file. Run every
verification command and paste real output; the patch is not done until the
commit exists. E2E credentials are in `.env.local` — never print them. Use
PW_BASE_URL against the running dev server; the final `npm run verify` only
after the owner stops it (locale-safe port check as the spec shows)."

## Estimated Difficulty
trivial — the cheapest components/** shrink available.

## Amendment 1 (2026-07-07) — `AuthUserMetadata` missing the `name` field · CTO decision

**Blockage (GPT-5.4, correct stop at the exact gate the Risks section
predicted):** `tsc` failed at CanvasModals line 350 —
`currentUserName={user?.user_metadata?.name || ...}` reads a metadata field
the bound `AuthUser` type never declared. Undeclared fields fall through to
the `[key: string]: unknown` index signature, and `unknown` inside a `||`
chain narrows to `{}` → `TS2322: Type '{}' is not assignable to type
'string'`.

**Root cause (CTO census error, PATCH-009's lesson recurring one level
deeper):** the census pattern `\buser(\?)?\.[a-zA-Z_]+` captures ONE chain
segment — it proved `user_metadata` was accessed but never enumerated the
fields accessed THROUGH it; the Evidence section's field list came from a
truncated spot-read (lines 322–324) that missed line 350.

**Decision: Option 1 — extend the type; the components stay untouched**
(Option 2 rejected: this patch's own binding says "NOTHING else changes" in
the components; adjusting JSX to fit the type would invert the patch).
The verbatim binding for `lib/domain/auth/user.ts` is now:

```ts
export interface AuthUserMetadata {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}
```

**Already applied and dry-run verified:** the CTO made this one-line
addition directly in the in-progress worktree and confirmed `npx tsc
--noEmit` → 0 errors with no other changes. It is a labeled CTO spec-bug
correction; it lands inside this patch's single atomic commit.

**Census hardened (this patch and all future type-swap patches):** the
pre-edit census gains a full-chain enumeration —
```bash
grep -oE "user_metadata(\?)?\.[a-zA-Z_]+" <file> | sort -u
```
and the bound type MUST declare every field that appears. Complete result
for this patch: CanvasModals — `full_name`, `name`, `avatar_url`;
OverlayLayer — none.

**Resume instructions (GPT-5.4):**
1. Keep the worktree exactly as it is (your component edits + the corrected
   type file).
2. Resume verification from `npx tsc --noEmit` (now 0) and continue the
   spec's verification list in order.
3. Everything else unchanged, including the `## Commit` message and the
   "exactly 4 changed lines across the two components" criterion (the type
   file is a create, not a component change — the criterion still holds).
4. Report "Amendment 1 applied, CTO-authorized" in Decisions made.
