# PATCH-019 — Extraction: integrations page; deep-scan token cascade joins the legacy quarantine

**Status:** draft (awaiting owner approval — final patch of batch 016–019)
**Complexity:** easy-medium (two auth-call swaps + one verbatim function move;
the discipline is in what must NOT be clicked)
**Assigned model:** **GPT-5.4**
**Pattern:** I — legacy-token quarantine reuse (reference: PATCH-018,
PATCH_REFERENCE §5.9). No new pattern; `legacyToken.ts` gains the page's
deep-scan variant VERBATIM plus one bound cascade helper.
**Depends on:** PATCH-018 (`legacyToken.ts` exists). Completes batch
016–019: grandfather 7 → 6.

## Purpose
Move `app/dashboard/settings/integrations/page.tsx` (287 lines) off direct
Supabase. Its ONLY Supabase surface is a token-resolution cascade
(`getSession` → `refreshSession` → deep localStorage scan) feeding Bearer
headers for three `/api/settings/integrations*` fetches. The cascade moves
behind one quarantine helper; the deep-scan scavenger pair moves VERBATIM
into `legacyToken.ts` (its third and final scavenger variant — completing
the 023 removal inventory).

## Scope
Exactly two Supabase calls (census below), both inside `resolveAccessToken`
(L118–126), on the STANDARD auth-helpers client — NOT a bearer client (this
differs from PATCH-018's page; do not import `makeAuthedClient` here). Plus
the module-level deep-scan pair (L9–48) and the `@supabase` import.

## Explicit NON-goals (owner-bound; violating any fails review)
- No normalization, no security improvement, no scavenger replacement, no
  auth change, no UX change, no behavior change. The deep-scan pair moves
  byte-identical; the cascade ORDER (session → refresh → deep scan) is
  behavior and must not be reordered or short-circuited differently.
- Do NOT merge the deep-scan variant with `legacyToken.ts`'s existing
  narrow `getAccessToken` — they behave differently (§5.9 "When NOT");
  they coexist in the quarantine until PATCH-023 removes both.
- The three API fetches, their Bearer headers, all toasts, the query-param
  callback effect, the Suspense wrapper, and all rendering: untouched.
- `app/api/settings/integrations*` routes: hard-forbidden.
- No domain code, no repository, no command — there is no data access to
  model (the page's data comes from the API routes, which are out of scope
  until the server domain layer exists).

## CTO note — why `refreshSession` (a §0 "escalate" API) is executable here
PATCH_REFERENCE §0 sends `refreshSession` to escalation because token
semantics need CTO judgment. That judgment is exercised HERE, in this spec:
the cascade is bound verbatim into the quarantine file whose entire purpose
is to hold token machinery until 023 replaces it. The implementer makes no
token decisions — the helper below is copy-paste.

## Pre-edit census (paste ALL output; STOP on any mismatch)
```bash
f="app/dashboard/settings/integrations/page.tsx"
# 1. @supabase surface:
grep -n "@supabase" "$f"
# expected EXACTLY 1 line: L6 createClientComponentClient import
# 2. Auth calls (the only Supabase calls on the page):
grep -nE "\.auth\.[a-zA-Z]+" "$f"
# expected EXACTLY 2 lines: L119 supabase.auth.getSession()
#                           L122 supabase.auth.refreshSession()
grep -nE "\.from\('|\.storage\b|\.rpc\(" "$f"
# expected: NO output, exit 1 (no tables, no storage, no rpc)
# 3. Scavenger/cascade counts (these MOVE; composition changes post-edit):
grep -c "getAccessTokenFromStorage" "$f"   # expected: 2 (def L31; call L125)
grep -c "findAccessTokenDeep" "$f"         # expected: 4 (def L9; recursion L17/L24; call L40)
grep -c "resolveAccessToken" "$f"          # expected: 4 (def L118; calls L131/L171/L198)
# 4. API fetches (UNTOUCHED):
grep -n "fetch('/api" "$f"
# expected EXACTLY 3 lines: L135 (load), L175 (connect), L202 (disconnect)
wc -l "$f"   # expected: 287
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. Infra — `lib/infra/supabase/legacyToken.ts` — additions (exact)
Add `import { createBrowserSupabaseClient } from './browserClient';` to the
imports. Append after the existing exports (the two moved functions are
byte-identical to page lines 9–48 and stay module-PRIVATE — nothing else
consumes them):
```ts
const findAccessTokenDeep = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.access_token === 'string' && obj.access_token.length > 10) {
      return obj.access_token;
    }
    for (const nested of Object.values(obj)) {
      const found = findAccessTokenDeep(nested);
      if (found) return found;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAccessTokenDeep(item);
      if (found) return found;
    }
  }
  return null;
};

const getAccessTokenFromStorage = (): string | null => {
  try {
    const lsKeys = Object.keys(localStorage).sort((a, b) => (a > b ? -1 : 1));
    for (const key of lsKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let token: string | null = null;
      try {
        const parsed = JSON.parse(raw);
        token = findAccessTokenDeep(parsed);
      } catch {
        // ignore non-JSON values
      }
      if (token) return token;
    }
  } catch { /* ignore */ }
  return null;
};

/**
 * PATCH-019: the integrations page's token cascade, verbatim — cookie/
 * session first (standard auth-helpers client), refresh second, deep
 * localStorage scan last. Raw `string | null` shape (quarantine ruling 2).
 */
export async function resolveLegacySessionToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed?.session?.access_token) return refreshed.session.access_token;

  return getAccessTokenFromStorage();
}
```
Also update the file's quarantine header comment: after the sentence
"PATCH-019 reuses this file.", append exactly:
`PATCH-019 added the integrations page's deep-scan variant + session
cascade — the quarantine now holds all three scavenger inventories for
PATCH-023 (settings-root's stayed in-page, 017-frozen).`
(`createBrowserSupabaseClient()` wraps the SAME `createClientComponentClient`
singleton the page constructed — identical client instance, no behavior
change.)

### 2. Page rewrite — `app/dashboard/settings/integrations/page.tsx`
- DELETE line 6 (`createClientComponentClient` import). ADD:
  ```ts
  import { resolveLegacySessionToken } from '@/lib/infra/supabase/legacyToken';
  ```
- DELETE lines 9–48 (both scavenger functions — they now live in the
  quarantine, byte-identical).
- DELETE line 95 (`const supabase = createClientComponentClient();`).
- Replace the `resolveAccessToken` function (lines 118–126) with:
  ```ts
  const resolveAccessToken = async (): Promise<string | null> =>
    resolveLegacySessionToken();
  ```
  The three call sites (`loadIntegrations`, `handleConnect`,
  `handleDisconnect`) keep calling `resolveAccessToken()` — byte-identical.
- EVERYTHING else byte-identical: the `Integration` interface, both SVG
  icons, `BASE_INTEGRATIONS`, the query-param toast effect, all three
  fetch handlers, the Suspense wrapper, all rendering.

## Files to Create
- `e2e/characterization/integrations-page.spec.ts` (below)

## Files to Modify
- `lib/infra/supabase/legacyToken.ts` (§1 — additions only; existing
  exports byte-untouched)
- `app/dashboard/settings/integrations/page.tsx` (§2)
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/integrations/page.tsx',`

## MUST NOT touch
`app/api/**` (the integrations routes are hard-forbidden);
`lib/infra/supabase/storage.ts`/`browserClient.ts`/`currentUser.ts`/
`authState.ts`/`serverClient.ts`; the EXISTING exports in `legacyToken.ts`
(additions only — `getAccessToken`, `makeAuthedClient`, `decodeJwtPayload`,
the two auth passthroughs, and the storage-gateway factory stay
byte-identical); `lib/domain/**`; all other pages/components/specs;
`.fable5/`; `.claude/`. No new dependencies.

## Unit tests
NONE new — the cascade binds the real browser client and the deep scan
reads `localStorage` (absent in the node test env); same ruling as
PATCH-018's scavenger. `npm run test:unit` must stay green at
**76 tests / 18 files** (state the unchanged count).

## Characterization — `e2e/characterization/integrations-page.spec.ts`
**Every assertion below was CTO-probed against the OLD page with the real
e2e storage state on 2026-07-09.** Unlike 017/018, this page WORKS for the
e2e account: the cascade's first step (`getSession`) reads the cookie
session, the API GET returns 200, and both cards render. This is the first
spec in the batch that exercises the swapped code path end-to-end
(cascade → Bearer → API) — Phase A/B equivalence here is REAL coverage of
the extraction.
Authenticated project, standard `test.skip(!hasE2ECredentials, ...)`.
**MUST NOT click "Connect" (it navigates to a real third-party OAuth URL)
or "Disconnect" (a real write). The only navigation is `goto`.**
Three tests (all probed):
1. **Connected-state render:** `goto('/dashboard/settings/integrations')`;
   assert `getByRole('heading', { name: 'Integrations' }).first()` visible
   (30s — the loading spinner must resolve; `.first()` is REQUIRED, a bare
   locator strict-collides with the settings sidebar, probed); assert
   `Google Drive` and `Microsoft OneDrive` (exact) visible; assert
   `getByRole('button', { name: 'Connect', exact: true })` has count 2 and
   `Disconnect` count 0 — with a comment that this encodes the test
   account's current no-integrations state (rebind if the account ever
   gains a connection); assert NO toast appears on plain load (probed:
   none — the load path succeeds silently).
2. **Callback success branch (URL-param only, zero writes):**
   `goto('/dashboard/settings/integrations?status=success&provider=e2e-callback-probe')`;
   assert toast `e2e-callback-probe connected` (probed verbatim).
3. **Callback error branch:**
   `goto('/dashboard/settings/integrations?status=error&provider=e2e-callback-probe&message=e2e-probe-message')`;
   assert toast `e2e-probe-message` (probed: the message param wins over
   the fallback text, verbatim).

## Known deviations (pre-accepted; do not add more)
NONE expected. The helper is a verbatim cascade on the identical client
singleton; the page keeps its own `resolveAccessToken` wrapper name so all
call sites are untouched. If tsc forces ANY additional change, STOP and
report it as a deviation before committing (PATCH-018 lesson: disclose
every off-spec line, triviality is the reviewer's call).

## Required comments in code (reviewer checks presence)
- The PATCH-019 cascade doc comment on `resolveLegacySessionToken` (§1).
- The updated quarantine header line naming the third inventory (§1).
- The no-integrations-state comment in the e2e spec (test 1).

## Verification sequence (in order; paste all output)
Operational rules bound from the PATCH-018 review lessons:
- **One client at a time:** nothing else (probes, browsers, second
  runners) may touch the dev server during timed runs.
- **The stopped-server gate is the PowerShell listener count** — Windows
  and WSL/Git-Bash can disagree about port 3000; only
  `Get-NetTCPConnection` is authoritative here.
- **If board-lifecycle fails at board CREATION:** query the e2e workspace's
  ACTIVE board count via service role (limit is 3; Save Canvas fails
  silently at quota) BEFORE suspecting code — see LESSONS_LEARNED.
```bash
# (pre-edit census first)
# Warm the heaviest route BEFORE any timed suite that runs board-lifecycle
# (cold-compile of /dashboard/canvas/[id] stalls past its waits):
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/dashboard/canvas/00000000-0000-0000-0000-000000000000"   # expect 200
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/integrations-page.spec.ts   # Phase A, OLD page
npm run test:unit          # unchanged: 76 tests / 18 files — state it
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test    # full suite (22 tests), NEW page
grep -c "@supabase" app/dashboard/settings/integrations/page.tsx           # 0 (exit 1 expected)
grep -c "getAccessTokenFromStorage" app/dashboard/settings/integrations/page.tsx   # 0
grep -c "findAccessTokenDeep" app/dashboard/settings/integrations/page.tsx         # 0
grep -c "resolveLegacySessionToken" app/dashboard/settings/integrations/page.tsx   # 2 (1 import + 1 wrapper body)
grep -c "resolveAccessToken" app/dashboard/settings/integrations/page.tsx          # 4 (unchanged: def + 3 call sites)
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0 — this gate, no other port check
npm run verify
git status --porcelain
```
Local e2e runs use the config's 2 workers — never override with `--workers`.

## Commit
ONE atomic commit (implementation + spec + grandfather line).
  Commit message:
  refactor(integrations): extract token cascade into the legacy-token quarantine

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches ALL blocks
- [ ] New e2e spec green against OLD page first, then NEW (both pasted);
      it never clicks Connect/Disconnect; the three probed tests only
- [ ] `npm run test:unit` green at 76/18 — unchanged, stated
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Full e2e suite green (22 tests) against the running dev server,
      canvas route warmed first
- [ ] Post-edit greps exact: `@supabase` 0; `getAccessTokenFromStorage` 0;
      `findAccessTokenDeep` 0; `resolveLegacySessionToken` 2;
      `resolveAccessToken` 4
- [ ] `legacyToken.ts` diff is ADDITIONS ONLY (existing exports untouched)
- [ ] Grandfather list = 6 (count stated) — **batch 016–019 complete**
- [ ] Single atomic commit; hash reported; zero undisclosed deviations

## Reviewer checklist (CTO or successor; CTO_PLAYBOOK §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Diff-vs-Bindings with `--ignore-space-at-eol`; page changes are ONLY:
      one import swap, the two deleted scavenger functions, the deleted
      client line, the one-line `resolveAccessToken` body
- [ ] The two moved function bodies diffed byte-identical against old page
      lines 9–48 (modulo nothing — no export keywords here, they are
      module-private)
- [ ] Cascade ORDER preserved: session → refresh → deep scan; no
      short-circuit changes
- [ ] `legacyToken.ts` existing exports byte-untouched (git diff shows
      pure addition)
- [ ] e2e spec: `.first()` on the heading; no Connect/Disconnect clicks;
      Connect-count comment present
- [ ] No new deviations beyond NONE — any found in the diff that the
      implementer did not disclose is a process finding (LESSONS_LEARNED
      disclosure rule), handled per §14
- [ ] At review closeout: §7 row for 019; batch 016–019 closed out in
      CURRENT_TASK; health ledger per §12

## Expected grandfather reduction
7 → 6 (`app/dashboard/settings/integrations/page.tsx` removed; count
re-verified at review). Remaining 6 after this patch: password, members,
PostCardContent, FreeformPadletCards, CanvasClient, collabboard canvas
page — all batch-4/5 territory (GPT-5.5 / CTO program), nothing left that
is GPT-5.4-mechanical.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 019,
`{{TITLE}}` = integrations token-cascade extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0, §5.9, and §6 first. The deep-scan
functions move VERBATIM and stay module-private; the cascade order is
behavior — do not reorder. This page uses the STANDARD browser client, not
PATCH-018's bearer client — do not import makeAuthedClient. The e2e spec
must NEVER click Connect (real OAuth redirect) or Disconnect (real write);
the two callback tests drive toasts via URL params only. Zero deviations
are expected — if tsc forces any extra line, STOP and report before
committing. Warm the canvas route before the full suite; do not run
anything else against the dev server during timed runs; the stopped-server
gate is the PowerShell count, not netstat or a WSL view. Run every
verification command and paste real output; the patch is not done until
the atomic commit exists. E2E credentials are in `.env.local` — never
print them. Final `npm run verify` only after the owner stops the server."

## Estimated Difficulty
easy-medium — one verbatim function move and a one-line wrapper; the traps
are the cascade order, the additions-only quarantine diff, and the two
buttons the spec must never click.
