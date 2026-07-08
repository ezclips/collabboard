# Patch Reference — extraction patterns catalog

**Audience: implementation engineers (GPT-5.4 first).** Read this BEFORE
reading an extraction patch: it tells you which pattern the patch instance
belongs to, what that pattern requires, and the mistakes already made once so
you don't make them twice. The patch file always wins over this document; if
the patch and the pattern disagree, STOP and report the disagreement instead
of choosing.

**If your patch's own header names a pattern with "(new)" or says it "will
enter PATCH_REFERENCE at review" — this document will NOT contain it yet,
by design (see the map's footer note). That is not a spec defect; do not
stop for it. The patch file itself is the complete, self-contained
specification for a brand-new pattern (verbatim code, exact bindings) —
this catalog only gets that pattern's summary added AFTER the patch is
reviewed, as a resource for the NEXT patch that reuses it.** Only stop if
the patch instance and its OWN text contradict each other, or if it points
you to a pattern number/name that should already be reviewed (check §7's
✅ done column) and isn't.

Patterns are extracted from real, reviewed patches:
PATCH-004 (canonical, commit `5278468`), 005, 006, 007, 008, 009, 010, 011, 012, 013.

---

## 0. How to identify the pattern (run this census first)

For the target page, gather the evidence — paste it in your report:

```bash
wc -l <page>
grep -n "supabase\|Supabase" <page>
grep -oE "supabase\.(auth\.[a-zA-Z]+|rpc\([^)]*\)|channel|storage)" <page> | sort | uniq -c
grep -o "\.from('[^']*')" <page> | sort -u
# For EVERY table found: read the FULL call site, not the fragment —
grep -n -B2 -A14 "\.from('<table>')" <page>
```
The last step is mandatory since PATCH-009: filter chains (`.eq` columns,
status filters), fallback control flow, and consumed user fields do not
show up in fragment greps — a spec bound from fragments described a query
that did not exist.

Then classify:

| Evidence | Pattern | Reference |
|---|---|---|
| Client created but `supabase.` never called | **B — dead client removal** | PATCH-006 |
| Only `auth.getUser()` (or other auth reads), no tables | **C — auth-only swap** | PATCH-007 |
| One table, read only (no upsert/insert/update/delete) | **D — read-only repository** | PATCH-008 |
| One table, select + upsert (settings-style row per user) | **A — settings read/write** | PATCH-004 (canonical), 005 |
| Two or more tables, or any join — but still only reads/upserts | **E — composite page** | PATCH-009 |
| ONLY a type import (`import type { User }`) used in a prop/state type, no runtime call | **type-only import swap** | PATCH-010 |
| `auth.getSession()` + `auth.onAuthStateChange()` (session observation, optionally + `signOut`), no tables | **F — auth-state observer** | PATCH-011 |
| ANYTHING below in "Not yours" | none — **stop** | — |

**Not yours (escalate; GPT-5.5/CTO territory — do not attempt):**
`supabase.storage` (uploads), `supabase.channel` (realtime), `.rpc(...)`,
auth MUTATIONS (`updateUser`; `signOut`/`getSession` are Pattern F when a
reviewed patch binds them — anything beyond F's helper shapes escalates),
session/token handling like `refreshSession`, cross-page shared state,
security-sensitive flows (password, account deletion, payments, invitations/
roles), or any page where the patch's description doesn't match what you find.

---

## 1. Pattern A — settings read/write (the canonical extraction)

**Reference:** PATCH-004 (imitate file-for-file), PATCH-005 (`maybeSingle` variant).

**When:** one table keyed by `user_id`, page loads a row (usually a JSONB
`settings` column) and saves via upsert. No joins, no storage, no realtime.

**When NOT:** any write beyond a single upsert; any second table (→ E);
no write at all (→ D).

**Required domain pieces** (`lib/domain/settings/<name>.ts`):
- Types lifted from the page VERBATIM (this is an extraction, not a redesign).
- zod schema mirroring the page's type exactly — no added constraints; if the
  stored JSONB is loose, the schema is loose.
- Repository interface: `load(userId) → Result<T | null>`,
  `save(userId, settings) → Result<void>`.

**Required command:** exactly ONE, for the write, via DI factory:
`createSaveXCommand(repository)` → `defineCommand({ name: 'settings.saveX' })`;
missing `ctx.userId` → `permission_denied`; delegates to the repository.
Reads do NOT get a command — they go through the repository directly.

**Required infra** (`lib/infra/settings/<name>Repository.ts`):
- Narrow structural client interface (only the query chains you use); real
  client injected via constructor; factory bound to
  `createBrowserSupabaseClient`; the `as unknown as` cast lives ONLY in the
  factory.
- Error mapping: `.single()` + error code `PGRST116` → `ok(null)`;
  `.maybeSingle()` → no-row is `data: null, error: null` → `ok(null)` with
  NO PGRST116 branch (check which one the page uses!); any other error →
  `err(unavailable)` with the supabase error as `cause`. Never let a
  supabase-shaped object reach the page.
- Load is UNVALIDATED (cast, tolerant); the WRITE is validated (command zod).
- snake_case ↔ camelCase mapping happens only here.

**Tests:**
- Domain: command rejects missing userId; command validates shape (one full
  valid fixture); command passes ctx userId to a fake repository.
- Infra: fake client implementing exactly your narrow interface — row-found,
  no-row → `ok(null)`, db-error → `unavailable`; upsert payload asserted
  field-by-field when the patch says so.
- E2E characterization spec (see §6) — BEFORE the rewrite.

**Common mistakes (all observed):**
- Copying PATCH-004's PGRST116 branch onto a `.maybeSingle()` page.
- Tightening the zod schema "while you're there" — legacy rows must load.
- New tests in a directory vitest doesn't include — a green run that doesn't
  LIST your test file means it never executed (PATCH-004 Amendment 1).
- Changing silent-failure semantics: load error → defaults, save error →
  console.warn no-op. Console-only differences are allowed; UI differences
  are not.

## 2. Pattern B — dead client removal

**Reference:** PATCH-006.

**When:** the census proves the Supabase client is created and NEVER used
(import + `const supabase = ...` are the only matches).

**When NOT:** one single real usage anywhere → it's a different pattern.
The mandatory pre-edit grep exists to catch exactly this; if it shows more
than the two lines, STOP.

**Required repositories/commands:** none. **Domain code:** none.

**Tests:** a shallow render characterization spec (page renders, no error
boundary) BEFORE the deletion — because "unused" is a claim about code, and
the net converts it into a claim about behavior.

**Common mistakes:** deleting anything beyond the two dead lines
(unrequested cleanup); skipping the pre-edit grep because the patch already
claims the client is dead — re-prove it, evidence over reports.

## 3. Pattern C — auth-only swap

**Reference:** PATCH-007.

**When:** the page's only Supabase use is reading the current user
(`auth.getUser()`), for the id and/or email.

**When NOT:** any auth MUTATION (`updateUser`, `signOut`, session/token
APIs) — escalate. Any table access — different pattern.

**Required pieces:** NO domain code, NO repository, NO command — there is no
data access to model. Use the existing infra helpers in
`lib/infra/supabase/currentUser.ts`: `getCurrentUserId()` (id only) or
`getCurrentUser()` (id + email). If a helper you need doesn't exist, the
patch will define it verbatim (PATCH-007 did); never design one yourself.

**Tests:** e2e characterization only (the helpers bind the real browser
client and are deliberately not unit-tested — PATCH-004 precedent).

**Common mistakes:** inventing a repository for symmetry ("the seam is only
for data access"); changing fallbacks (`user.email || ''` must stay an
empty-string fallback); "improving" pages that render mock data.

## 4. Pattern D — read-only repository

**Reference:** PATCH-008.

**When:** page reads one table and never writes.

**When NOT:** any write → A or E.

**Required pieces:** domain type (ONLY the fields the page actually consumes
— narrow deliberately), repository interface with `load(...)` only, infra
implementation with the standard error mapping. **NO command** (nothing to
validate, nothing to write), **NO zod schema**. Their absence is the pattern;
do not add either for symmetry.

**Tests:** infra repository test (row-found with field mapping, null-field
defaults, no-row, db-error). NO domain test file — there is no domain logic.

**Common mistakes:** adding a command/schema anyway; fixing pre-existing
page bugs the extraction exposes (preserve them — characterized behavior is
the contract; report the bug in your notes instead); widening the domain
type to the full row "because select('*') returns it".

## 5. Pattern E — composite page (multiple repositories)

**Reference:** PATCH-009.

**When:** one page touches two or more tables/concerns (still only
reads/upserts — anything fancier escalates).

**When NOT:** you feel ANY need to make a design decision (which domain area
a repository belongs to, how to type a join result) that the patch hasn't
already made. Composite patches must arrive fully bound; if yours isn't,
it's a spec defect — STOP and report.

**Required pieces:** ONE repository per concern, in that concern's domain
area (`lib/domain/settings/…`, `lib/domain/workspaces/…`) — never merged
into a page-shaped "dashboardRepository". Commands only for the write paths;
read-only concerns follow Pattern D rules within the same patch. Joined
selects are copied VERBATIM from the patch (which copied them verbatim from
the page).

**Tests:** per repository, same as A/D; one domain test per command.

**Common mistakes:** missing a second call site of the same query (retry/
fallback paths — the boundary check fails only after everything else is
done, so find them up front by grepping the table name); merging
repositories; validating joined results (mirror-the-shape: cast, don't
parse); putting column-name mapping anywhere but infra; trusting a spec's
query binding without diffing it against the real call site (PATCH-009's
binding named a column that didn't exist — the pre-edit census caught it;
run yours and compare before writing code).

## 5.5. Pattern — type-only import swap

**Reference:** PATCH-010.

**When:** the file's ONLY `@supabase` dependency is `import type { X }` used
in a prop or state type — no runtime `supabase.*` call anywhere in the file.

**When NOT:** any runtime usage at all → a different pattern (B/C/D/A/E).

**Required pieces:** ONE domain type module (`lib/domain/<area>/<name>.ts`)
declaring a structural subset of the vendor type — ONLY the fields actually
read by the file(s) in scope (census every property chain to its LEAVES,
not just the first segment — see the mistake below). No zod, no functions,
pure types (domain-purity lint applies). Swap the import and the type
annotation only; the vendor type stays structurally assignable at every
caller, so callers are never touched.

**Tests:** none new. `tsc --noEmit` IS the test (a missing field fails the
build); the existing e2e suite is the behavior net if it exercises the
component. No unit tests for a pure type.

**Common mistakes:**
- Censusing only the first segment of a property chain (`user?.X`) and
  missing fields accessed one level deeper (`user?.user_metadata?.name`) —
  the vendor type's real shape is wider than any one call site suggests;
  every access path must be enumerated to its leaf before the domain type
  is written (PATCH-010 Amendment 1: `tsc` caught a missed `.name` field
  because an index signature of `unknown` narrows to `{}` in a `||` chain).
- Widening the domain type's index signature to `any` to make errors go
  away — this destroys the exact safety net that catches step 1's mistake.
- Touching component logic/JSX beyond the import + type-annotation lines.

## 5.6. Pattern F — auth-state observer

**Reference:** PATCH-011 (ProtectedRoute; introduces `lib/infra/supabase/authState.ts`).

**When:** the file's Supabase use is observing WHO is signed in:
`auth.getSession()` for the initial read and/or `auth.onAuthStateChange()`
for updates, optionally `auth.signOut()`. No tables.

**When NOT:** identity checks before destructive actions (that is Pattern C
with `getCurrentUser` — network-validating, deliberate); token/session-field
access (`access_token`, `refreshSession`) — escalate; any table access.

**Required pieces:** NO domain code beyond the existing `AuthUser` type.
Use the existing helpers in `lib/infra/supabase/authState.ts`:
- `getSessionUser()` — LOCAL session read; do NOT substitute the
  network-validating `getCurrentUser*` helpers, semantics differ.
- `onAuthUserChanged((event, user) => …) → unsubscribe` — event names pass
  through Supabase's strings; the returned function MUST be called in the
  effect cleanup, exactly where `subscription.unsubscribe()` was.
- `signOutCurrentUser()` — Result-shaped; error handling per the patch.
The helper file is FROZEN for repetition patches — if it seems insufficient,
STOP.

**Census gates (both mandatory):** the file must show exactly the auth calls
the patch names, and every `session.*` access must be `session.user…` —
any other session field (`access_token`, `expires_at`) means STOP.

**Tests:** e2e characterization only (helpers bind the real browser client);
the spec must cover BOTH gate sides where applicable (authenticated renders,
unauthenticated redirects). Fresh-context tests need absolute URLs —
`browser.newContext()` does not inherit config baseURL.

**Common mistakes:** dropping the unsubscribe on unmount (invisible to e2e,
only review catches it); substituting getSession semantics with getUser;
storing the whole session object in state when only the user is read
(census-gate the session fields first); dropping auth event-name branches;
**assuming a component "renders on most pages" without tracing its import
chain to an actual root layout/page** (PATCH-012: an orphaned component was
imported only by another orphaned component — trace to a mounted root
before writing any e2e assertion that expects the component visible).

---

## 6. Universal requirements (every pattern, every patch)

**Phase order is mandatory:** e2e characterization spec written and GREEN
against the CURRENT page first → domain+infra+unit tests → page rewrite →
full e2e green again → grandfather entry removed LAST → final verify.

**The e2e net:** two-pass rule — a throwaway discovery run that prints the
page's real DOM/labels, then the assertions. Specs skip cleanly without
credentials; clean up data they create.

**Async-save barrier (added at PATCH-005 review):** these pages save
fire-and-forget; reloading immediately aborts the in-flight POST and the
persistence assertion fails — sometimes only sometimes (timing luck). After
the mutating interaction and BEFORE reloading, barrier on the save request:
`await page.waitForResponse(r => r.url().includes('/rest/v1/<table>') && r.request().method() === 'POST')`
(set up the promise before triggering the save). Same in the restore path.
Never rely on `waitForTimeout` sleeps for persistence.

**Hydration-acknowledged first click (added at PATCH-014 Amendment 2):** on a
dev server, a button renders and is clickable BEFORE React attaches its
handlers; a click in that window is silently swallowed — no request, no
spinner, no state change, no error. A swallowed click looks exactly like
"the feature doesn't work". Any spec whose interaction is the FIRST handler
trigger on a freshly loaded page must use an acknowledged click: retry the
click inside `expect(async () => { await btn.click(); await expect(<durable
outcome>).toBeVisible({ timeout: 3_000 }); }).toPass({ timeout: 30_000 })` —
anchored on a durable outcome (state text, panel), never on a transient toast
alone. This idiom is permitted ONLY on idempotent, non-mutating triggers;
mutating or destructive controls get one click behind an explicit readiness
barrier, never a retry loop. Corollary for observations: before reporting
"clicking X does nothing" on a dev server, prove the handler ran (spinner,
network from THAT click) — otherwise you are reporting the race, not the
page.

**Verification skeleton** (the patch fills in the paths):
```bash
PW_BASE_URL=http://localhost:3000 npx playwright test <new spec>     # Phase A, OLD page
npm run test:unit        # output must LIST every new test file by name
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test                # full suite, NEW page
grep -c "@supabase" <page>                                           # must print 0
# grandfather removal, THEN — dev server stopped by owner first:
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"  # must print 0
npm run verify
```
Never grep netstat output for "LISTENING" (localized: German prints
ABHÖREN). Never build or run Playwright-with-webServer while the dev server
runs; e2e phases use `PW_BASE_URL` against it, the final `verify` runs after
the owner stops it; after committing, delete `.next` so the owner restarts
dev on a clean cache.

**Commit:** ONE atomic commit — implementation + tests + e2e spec +
grandfather-line removal together (the removal is only valid while the
rewrite exists; one `git revert` must restore both). Report the hash; the
patch is not done without it.

**Always true:** behavior preserved exactly, including bugs and silent
failures (console-only differences allowed); no new dependencies; `.fable5/`
and `.claude/` are CTO-only; warnings are observations, errors are blockers
(handoff rule 10); when the page doesn't match the patch's description of
it, STOP — never adapt.

---

## 7. Pattern → patch map

| Patch | Page | Pattern | Grandfather |
|---|---|---|---|
| 004 | settings/accessibility | A (canonical, `.single()`) | 24→23 ✅ done |
| 005 | settings/notifications | A (`.maybeSingle()` variant) | 23→22 ✅ done |
| 006 | settings/ai + preferences | B | 22→20 ✅ done |
| 007 | settings/logs | C (+ introduces `getCurrentUser`) | 20→19 ✅ done |
| 008 | settings/achievements | D | 19→18 ✅ done |
| 009 | settings/dashboard | E (A + D composed; needs 007) | 18→17 ✅ done |
| 010 | CanvasModals + OverlayLayer | type-only import swap | 17→15 ✅ done |
| 011 | ProtectedRoute | F — auth-state observer (introduces `authState.ts`) | 15→14 ✅ done |
| 012 | Navbar | F repetition (orphaned component; census-gated) | 14→13 ✅ done |
| 013 | app/page.tsx (landing) | F repetition (+ first `signOutCurrentUser` consumer) | 13→12 ✅ done |

**New patterns discovered by future patches get added here by the CTO at
review — this catalog only ever contains patterns with a reviewed reference
implementation.** Concretely: PATCH-015 (Pattern G) does
NOT appear above yet — it is queued but not yet reviewed. Their own patch
files are fully self-contained specifications in the meantime; do not expect
to find their pattern here until their row shows ✅ done.
