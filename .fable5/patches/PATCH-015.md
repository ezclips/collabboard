# PATCH-015 — Extraction: share/[token] page; introduce the server-side infra seam

**Status:** draft (awaiting owner approval — execute last in the 010–015 batch)
**Complexity:** medium (new pattern: first SERVER-side repository)
**Assigned model:** **GPT-5.4** — every decision bound below; novelty is why
this runs last, after four reviews of the batch's simpler patches.
**Pattern:** new — "server-page read" (Pattern G; enters PATCH_REFERENCE at
review). Independent of 010–014 (no shared helpers).

## Goal
Move `app/share/[token]/page.tsx` (88 lines, a SERVER component reading
`share_links`) onto a domain repository backed by a new server-side infra
client; grandfather list 11 → 10. This creates the server seam that future
API-route extractions will reuse.

## CTO security note (behavior preserved, flagged, not changed here)
The page today creates its client with
`SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service-role
fallback exists so token lookup bypasses RLS on the server. This patch
PRESERVES that exact behavior and centralizes it in ONE audited file. Whether
share-link lookup should instead use a scoped RLS policy is a separate,
already-queued security question — do not resolve it here.

## Bindings

### Domain — `lib/domain/share/shareLinks.ts` — exactly:
```ts
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';

/** Mirrors the columns app/share/[token] consumes today. Loose by design. */
export interface ShareLink {
  readonly id: string | number;
  readonly token: string;
  readonly share_target: string | null;
  readonly board_id: string | null;
  readonly padlet_id: string | null;
  readonly permission: string | null;
  readonly password_hash: string | null;
  readonly expires_at: string | null;
  readonly access_count: number | null;
}

export interface ShareLinkRepository {
  /** null = token not found (not an error). */
  findByToken(token: string): Promise<Result<ShareLink | null, DomainError>>;
  /**
   * Fire-and-forget access bookkeeping — callers do NOT await it and its
   * failure must never affect the page (mirrors today's `.then(() => {})`).
   */
  recordAccess(linkId: ShareLink['id'], currentCount: number): Promise<void>;
}
```
`recordAccess` deliberately returns `Promise<void>`, not `Result` — it is
telemetry-style bookkeeping with no consumer of its outcome (CTO decision;
the house write-via-command rule applies to user-intent writes, not this).

### Infra — `lib/infra/supabase/serverClient.ts` — exactly:
```ts
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Uses the service-role key when present
 * (RLS bypass for server lookups — see SECURITY.md), anon key otherwise.
 * NEVER import this from a 'use client' module.
 */
export function createServerSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```
(The env expression is copied verbatim from the page — same keys, same
fallback, same `!` assertions.)

### Infra — `lib/infra/share/shareLinkRepository.ts`
PATCH-004 structure (narrow structural client interface for exactly
`from('share_links').select('*').eq('token', token).single()` and
`from('share_links').update({...}).eq('id', id)`; injected client; factory
`createShareLinkRepository()` bound to `createServerSupabaseClient`).
- `findByToken`: error code `PGRST116` → `ok(null)`; any other error →
  ALSO `ok(null)` — **deliberate deviation from the standard mapping**: the
  page today treats `error || !data` identically ("Link not found"); mapping
  other errors to `unavailable` would change rendered behavior. Preserve.
  Put a one-line comment on this mapping citing PATCH-015.
- `recordAccess(linkId, currentCount)`: runs the update with
  `{ access_count: currentCount + 1, last_accessed_at: new Date().toISOString() }`,
  swallowing errors (`.then(() => {}).catch(() => {})` semantics — today's
  code ignores the outcome entirely).

### Page rewrite (`app/share/[token]/page.tsx`)
- Remove the module-level `createClient` block and the `@supabase` import.
- `const repository = createShareLinkRepository();` inside the component
  (server component — no hooks, no useMemo).
- Lookup: `const result = await repository.findByToken(token);` then
  `const data = result.ok ? result.value : null;` and the existing
  `if (!data)` "Link not found" render covers both branches (mirrors
  today's `error || !data`).
- Access bookkeeping: `void repository.recordAccess(data.id, data.access_count || 0);`
  — NOT awaited, exactly like today's `.then(() => {})`.
- Expiration check, all three share-target branches, all `redirect(...)`
  calls, and the `SharePageClient` props: byte-identical behavior. The
  local reads (`data.share_target || 'post-in-board'`, etc.) keep their
  exact fallbacks.

## Pre-edit census (paste; STOP if it shows more)
```bash
grep -n "supabase\|createClient" "app/share/[token]/page.tsx"
grep -oE "data\.[a-zA-Z_]+" "app/share/[token]/page.tsx" | sort -u
# fields must be within: id, access_count, share_target, board_id, padlet_id,
# permission, password_hash, expires_at — anything else: STOP (the ShareLink
# type above must be corrected by the CTO first).
```

## Files to Create
- `lib/domain/share/shareLinks.ts` (verbatim above)
- `lib/infra/supabase/serverClient.ts` (verbatim above)
- `lib/infra/share/shareLinkRepository.ts`
- `lib/infra/share/shareLinkRepository.test.ts` — fake client: token found
  (row passthrough), PGRST116 → `ok(null)`, other db-error → `ok(null)`
  (the deliberate mapping), `recordAccess` payload asserted (count+1,
  timestamp present) and error-swallowing verified (fake update rejects —
  no throw escapes).
- `e2e/characterization/share-link.spec.ts` — Phase A first, unauthenticated
  context: visit `/share/definitely-not-a-real-token-12345` → assert the
  "Link not found" render (h1 text). That is the only branch reachable
  without fixtures and it exercises page + repository + server client
  end-to-end. Valid-token flows are covered later with fixtures (backlog
  note, not this patch).

## Files to Modify
- `app/share/[token]/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/share/\\[token\\]/page.tsx',` — **note the escaped brackets**; the
  entry in the list is glob-escaped (`\\[token\\]`), delete that exact line.

## MUST NOT touch
`SharePageClient` (client component, separate concern);
`lib/infra/supabase/browserClient.ts` / `currentUser.ts` / `authState.ts`;
`lib/domain/core/**`; all other files; `.fable5/`; `.claude/`.
No new dependencies.

## Risks
- Server/client boundary: `serverClient.ts` must never be imported from a
  `'use client'` file — in this patch its only importer is the share
  repository, whose only consumer is a server component. (tsc/Next will not
  fully guard this; the comment + review do.)
- The error→"not found" mapping deviation (bound above) — copying
  PATCH-004's `unavailable` mapping here would CHANGE user-visible behavior.
- The grandfather entry has escaped brackets — deleting a non-matching
  unescaped variant leaves the check silently passing for the wrong reason
  (PATCH-002 lesson).

## Commit
  Commit message:
  refactor(share): extract share-link server-side repository seam

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches
- [ ] New e2e spec green against OLD page first, then NEW (pasted)
- [ ] `npm run test:unit` green; output LISTS the new infra test file
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the escaped entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" "app/share/[token]/page.tsx"` → 0
- [ ] Grandfather list = 10
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/share-link.spec.ts   # Phase A, OLD
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, NEW
grep -c "@supabase" "app/share/[token]/page.tsx"   # 0
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 015,
`{{TITLE}}` = share-link server-side extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0. This is a SERVER component — no hooks,
and the new serverClient must never be imported from a 'use client' file.
Two deliberate deviations are bound in the patch (error→not-found mapping;
recordAccess returns void) — follow them, do not 'correct' them toward
PATCH-004. The grandfather entry has escaped brackets — delete the exact
line. Run every verification command and paste real output; not done until
the commit exists. PW_BASE_URL against the running dev server; final
`npm run verify` only after the owner stops it."

## Estimated Difficulty
medium — smallest page in the batch but three new files and the first server
seam; every decision is pre-made.
