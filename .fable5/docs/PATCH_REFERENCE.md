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

## 5.7. Pattern G — server-page read (server-side repository seam)

**Reference:** PATCH-015 (`app/share/[token]`; introduces
`lib/infra/supabase/serverClient.ts`).

**When:** a SERVER component (no `'use client'`) reads a table directly,
typically with a module-level `createClient(...)` using env keys and
possibly the service-role fallback.

**When NOT:** API route handlers (`app/api/**` — out of scope until the
domain layer covers server writes); client components (Patterns A–F); pages
needing the caller's auth context (the server client is key-based, not
cookie/session-based — that variant does not exist yet; STOP and escalate).

**Required pieces:**
- Domain: an interface file (`lib/domain/<area>/<name>.ts`) with a loose
  row-shaped type mirroring exactly the columns the page consumes, plus the
  repository interface. No zod at this seam yet (behavior preservation);
  the type is documentation, not validation.
- Infra: `createServerSupabaseClient()` from
  `lib/infra/supabase/serverClient.ts` — service-role key when present,
  anon key otherwise (RLS bypass for server lookups; centralizing this in
  ONE audited file is the point). **NEVER import it from a `'use client'`
  module**; tsc will not stop you — review must trace every importer.
- Infra: repository per PATCH-004 structure (narrow structural client
  interface, injected client, factory bound to the server client) + unit
  tests with a fake client.
- Page: repository created inside the async component (no hooks), reads
  mapped so the existing render branches stay byte-identical.

**Fire-and-forget writes:** bookkeeping updates whose outcome today's code
ignores (`.then(() => {})`) become `Promise<void>` repository methods that
swallow errors, called with `void repo.method(...)` — NOT Result-shaped,
NOT awaited (CTO ruling in PATCH-015: write-via-command applies to
user-intent writes, not telemetry-style bookkeeping).

**Error mapping is page-specific:** PATCH-015 maps ALL find errors to
`ok(null)` because the page renders `error || !data` identically ("Link
not found"); copying Pattern A's `unavailable` mapping would CHANGE
rendered behavior. Always derive the mapping from the page's existing
error handling, and comment the deviation citing the patch.

**Tests:** unit tests on the repository (row passthrough, PGRST116, the
deliberate error mapping, fire-and-forget payload + swallow). E2E
characterization: the unauthenticated-reachable branch at minimum — and
the spec must override the project storageState inline
(`test.use({ storageState: { cookies: [], origins: [] } })`) so it runs
credential-free (see §6).

**Common mistakes:** typing the seam surfaces latent nullability the old
`any` row hid — resolving it must be proven render-equivalent against the
consuming component, not just tsc-quieted (PATCH-015: `permission ||
'view'` accepted only after reading `SharePageClient`'s ternary);
inheriting the characterization project's file-based storageState in a
spec that needs no credentials (ENOENT on CI — caught at PATCH-015 review).

---

## 5.8. Pattern H — browser storage gateway

**Reference:** PATCH-017 (`app/dashboard/settings/page.tsx`; introduces
`lib/infra/supabase/storage.ts`).

**When:** a CLIENT component calls `supabase.storage.from(bucket).upload(...)`
and/or `.getPublicUrl(...)` directly, for user-facing file/image uploads
(avatars, logos, attachments).

**When NOT:** server-side storage access (escalate — Pattern G's server
client, not this); anything beyond `upload`/`getPublicUrl` (`remove`,
`list`, `download`, signed URLs) — the gateway interface only covers what
the extracted page actually calls; widen it deliberately per-patch, never
speculatively.

**Required pieces:** `lib/infra/supabase/storage.ts` — `StorageGateway`
interface (`upload(bucket, path, file, options) → Result<void>`,
`getPublicUrl(bucket, path) → string`, both bucket-PARAMETERIZED, never
bucket-hardcoded, so every page consumer supplies its own bucket name),
`SupabaseStorageGateway` class wrapping the real client, `createStorageGateway()`
factory bound to `createBrowserSupabaseClient`. The file is FROZEN for
repetition patches once reviewed — if a page needs a method the gateway
doesn't have, that page's patch extends the gateway explicitly and the
extension is reviewed, not silently widened.

**Error mapping:** `upload` maps a returned Supabase error AND a thrown
exception to the SAME `domainError('unavailable', ...)` shape (real object
storage clients can throw on network failure, not just return `{ error }}`);
`getPublicUrl` is synchronous and cannot fail upstream — no Result wrapper.

**Census gate:** count `.storage\b` and `.from('<bucket>')` occurrences by
LINE NUMBER, not by client-variable name — real call sites are commonly
multi-line (`await supabase.storage` on one line, `.from(...)` on the
next), so a single-line grep pattern silently misses them (PATCH-017: the
original census used one regex per call and had to be corrected to
line-anchored `grep -nE` before delegation).

**Common mistakes:** hardcoding the bucket name in the gateway (couples it
to one page — parameterize instead); forgetting a page may have ITS OWN
distinct auth-token scavenger even when the census note calls it "just a
storage extraction" (PATCH-017: discovered mid-authoring, frozen
byte-identical, tracked as a security-flag addendum, not fixed in-patch).

---

## 5.9. Pattern I — legacy-token quarantine (bearer-client extraction)

**Reference:** PATCH-018 (`app/dashboard/settings/profile`; introduces
`lib/infra/supabase/legacyToken.ts`).

**When:** a page authenticates every Supabase call with a PER-CALL client
built from a manually scavenged access token (`createClient(url, anonKey,
{ global: { headers: { Authorization: Bearer } } })`) instead of the shared
browser client — typically because the page predates `browserClient.ts` or
was written against a different session-storage assumption
(localStorage vs. the cookie-based auth-helpers session).

**When NOT:** pages already on the shared browser client (Patterns A–H);
pages whose scavenger reads a DIFFERENT localStorage key shape or has
extra logic (deep multi-key scanning, etc.) — read the ENTIRE scavenger
before assuming it matches an existing quarantine file; a near-identical
scavenger with different behavior must not be silently merged into one
export (PATCH-017's settings-root variant stayed in-page for exactly this
reason — see its patch file).

**Required pieces:** move the scavenger function(s), the bearer-client
factory, and any JWT-decode helper VERBATIM (diff against the old page is
the byte-identical proof) into one quarantine file with an `export` added
per binding — never rename, never refactor bodies. The moved auth
passthrough helpers (reauth, email change, etc.) return RAW supabase
`{ error }` shapes, NOT `Result` — deliberate exception to house style,
because the legacy page's error handling and toast text read those shapes
directly and the whole quarantine is scheduled for removal (see below).
Storage needs on a legacy-token page REUSE the existing Pattern H gateway
CLASS via a new factory bound to the legacy client — do not fork a second
gateway implementation.

**Required header comment:** the quarantine file must document (a) which
patch introduced it, (b) which patch(es) reuse it, (c) which future patch
REMOVES it and why (the functional defect it carries — e.g. failing closed
for cookie-session users), and (d) the raw-passthrough exception.

**Error-cause preservation:** repository/command errors must carry the raw
supabase error as `DomainError.cause`, and the page must rethrow that cause
at its boundary (`throw result.error.cause ?? result.error`) — this is what
keeps every legacy toast byte-identical without duplicating the page's
`getErrorMessage`-style logic in the domain layer.

**Common mistakes:** a typed row interface (introduced by the extraction
itself) can force a type-narrowing cast at a call site the patch's Bindings
never explicitly listed (PATCH-018: `payload.user_metadata?.display_name`
went from implicit `any` to `unknown` once `profileData` became typed,
forcing an `as string | undefined` one-line cast with zero runtime effect —
accepted, but should have been anticipated and pre-authorized in the spec's
Known Deviations, and MUST be disclosed by the implementer even when it has
zero runtime effect — silently adding it is a process gap, not a free pass,
see LESSONS_LEARNED). Zod version drift: `z.record()` is two-argument
(key schema + value schema) as of zod v4 — a spec written against the
one-argument v3 form will crash at runtime; verify the installed version's
API before binding a zod schema literally into a spec.

## 5.10. Pattern J — raw-passthrough auth/MFA facade

**Reference:** PATCH-020 (`app/dashboard/settings/password`; introduces
`lib/infra/supabase/passwordSecurity.ts`). **Extended by PATCH-021**
(`app/dashboard/settings/members`; introduces
`lib/infra/supabase/workspaceMembers.ts`) to plain table CRUD, not just
auth/MFA methods — the pattern's discipline (one-line raw wrappers, no
Result, untestable calls named and forbidden in the spec) applies
identically whether the wrapped calls are `auth.mfa.*` or
`.from('table').update(...)`. A composite page can also wrap a THIN
pass-through to an existing non-lint-scoped helper that takes a raw client
argument (PATCH-021's `resolveWorkspaceForUser` supplies the client to
`lib/workspace/context.ts`'s `resolveCurrentWorkspace` without touching that
helper) — derive the wrapper's parameter type with `Parameters<typeof
helperFn>[N]` rather than hand-writing it, so it cannot silently drift from
the real signature.

**When:** a page calls several Supabase auth/MFA methods directly on the
shared browser client (unlike Pattern I, no bearer client, no scavenger —
the session is already correct) and AT LEAST ONE of those calls is
untestable by characterization because exercising it performs a real
external side effect (a WebAuthn ceremony, an email send, a factor
mutation, a real re-authentication). The extraction's job is narrower than
Patterns A–I: it is a pure relocation of call sites behind named functions,
not a domain seam — there is no repository, no command, no Result.

**When NOT:** every call site is characterization-testable (use Pattern C
or a composite instead — a facade is not warranted just to swap an import);
the page's session comes from a bearer/legacy client (Pattern I applies,
possibly composed with this one if the page ALSO wraps untestable auth
calls — none has yet).

**Required pieces:** one new file, one function per call site, each
function a ONE-LINE body: construct the browser client, call the method
with the ORIGINAL argument shape, `return` the raw promise — no `await`
inside the wrapper, no destructuring, no error translation. The facade
returns exactly what Supabase returns; house-style Result conversion is a
DELIBERATE exception, same ruling as Pattern I, for the same reason (the
page's own error handling and toast text consume the raw shape, and a
behavior-preserving extraction must not translate it).

**The untestable-call discipline (the pattern's defining risk):** for any
wrapped call whose UI trigger cannot appear in an e2e spec (real OAuth
redirect, real WebAuthn ceremony, real email send, real destructive write),
diff fidelity is the ONLY verification available — no red test will catch a
transposed argument or a swallowed error. The patch spec must name every
such call explicitly and forbid the implementer (and the reviewer) from
ever triggering its UI control in a characterization spec. Assign the
stronger available implementation model to patches with two or more
untestable calls (PATCH-020 required GPT-5.5 over GPT-5.4 for exactly this
reason) and give the reviewer's checklist a dedicated line-by-line pass over
just the untestable wrappers.

**Common mistakes:** binding a characterization assertion to a probe that
used a different DOM-reading method than the assertion itself will use —
`.innerText()` is layout-aware and reflects CSS `text-transform`, but
`getByText()`/`toHaveText()` match raw text content and do not; probe with
the SAME matcher the spec will bind (PATCH-020 Amendment 3: an `uppercase`
CSS class made a lowercase `aal1` value look like `AAL1` in the probe,
producing an assertion the real page could never satisfy). A grep gate on
a bare identifier can collide with the extraction's own new import PATH
(`grep -c "supabase"` matches the string "supabase" inside
`@/lib/infra/supabase/...` import specifiers) — anchor gates on `@supabase`
(the package) and `supabase\.` (the dotted call, i.e. Git Bash
`grep -c "supabase\."`) separately, never a bare substring. It can equally
collide with a PRE-EXISTING LOCAL IDENTIFIER that happens to share the new
module's name (PATCH-021: naming the facade `workspaceMembers` collided
with the page's own destructured `const { data: workspaceMembers, error }`
— the gate must be derived as measured pre-edit count + bound additions −
bound deletions, never assumed zero for a "new" name). A bound BLOCK
COMMENT is code the moment it's bound — never write a glob like
`app/**/x/**` inside `/* ... */`; the `*/` pair closes the comment early and
the rest parses as source (PATCH-021: reworded to prose, no asterisks).
When a bound interface mirrors a vendor SDK type (e.g. Supabase `User`),
copy each field's optionality/nullability from the installed `.d.ts`
verbatim — `string | null` vs `string | undefined` is not interchangeable
under `strict` and will fail at exactly the call sites that pass the field
back into a vendor-typed parameter (PATCH-021: `email` bound `string |
null`, vendor is `email?: string`). And when a characterization assertion
targets a table, scope the locator to the specific section/heading rather
than a bare tag name — a conditionally-rendered sibling table (empty state
renders text, not `<table>`) means a bare `table tbody tr` locator measures
whichever table happens to exist, not the one a variable name or comment
claims (PATCH-021 Amendment 4).

---

## 5.11. Pattern K — canvas ops command (write extraction with pre-verified bound tests)

**Reference:** PATCH-025 (`components/collabboard/PostCardContent.tsx`;
introduces `lib/domain/canvas/posts.ts` + `lib/infra/canvas/
postsRepository.ts` — the canvas ops seam TRUNK that batches 026+ extend;
one aggregate, one repository, P6). **Extended by PATCH-026**
(`app/dashboard/canvas/[id]/CanvasClient.tsx`, the `board_sections` write
family; introduces `lib/domain/canvas/sections.ts` +
`lib/infra/canvas/sectionsRepository.ts`) — proves the pattern generalizes
to MULTIPLE call sites in ONE monolith component (six sites, four
handlers, five commands) and to a SIBLING aggregate in the same trunk
folder (`sections` next to `posts`, zero cross-references — the P6
one-trunk rule is satisfied by the folder family, not a single merged
repository). Landed byte-perfect on GPT-5.4 a second time; the monolith
SHRANK for the first time as a direct result (8,526→8,518 lines).
**Extended again by PATCH-027** (the `boards` update family; introduces
`lib/domain/canvas/board.ts` + `lib/infra/canvas/boardRepository.ts` as a
THIRD sibling aggregate in the same trunk folder) — proves the pattern
also resolves a P6 naming COLLISION cleanly: an unrelated, unconsumed
exemplar interface (`lib/domain/boards/repository.ts`, zero importers,
zero implementations) already occupied adjacent naming space, so the new
interface took the disambiguating name `CanvasBoardRepository` rather than
`BoardRepository`, and the exemplar was left byte-untouched (different
concern, not a collision to merge). Also the first K-patch to surface a
SECOND site in the reorderSections-style silent-swallow family
(`canvas.setChronoMode`) — same shape (await resolved write, never read
the row-level `error`), same discipline (preserve verbatim, name a
dedicated test, queue the fix as a standing owner decision). Landed
byte-perfect on GPT-5.4 a third time; monolith 8,518→8,517.
**Extended a fourth time by PATCH-028** (the `padlets` DELETE family) —
the FIRST extension-only application: `padlets` IS the `posts` table, so
the four delete commands (`canvas.deletePost`/`deletePosts`/
`deleteChildPosts`/`deleteContainerChild`) join the EXISTING
`PostsRepository` from PATCH-025 rather than creating a fourth aggregate
file. Proves Pattern K's bound-test discipline generalizes to extending an
interface already implemented and consumed elsewhere (`PostCardContent.tsx`
via `createToggleTaskCommand`) — the 25 bound tests included the 9
PATCH-025 tests, re-run unmodified, to prove the extension non-breaking to
the existing consumer. Also introduced the EDIT-SIMULATION authoring
technique (apply every bound OLD/NEW block to a scratch copy and run the
full post-edit census against the result before binding — see
LESSONS_LEARNED's measurement-instrument family, eighth variant) after it
caught a derivation error the same day it was invented. Landed byte-perfect
on GPT-5.4 a fourth time (one accepted whitespace-only disclosure gap, see
LESSONS_LEARNED); monolith 8,517→8,507.
**Extended a fifth time by PATCH-029** (the `padlets` INSERT family, 19
sites / 12 handlers, second extension-only application) — introduced the
HASH-GATE class: the edit simulation from 028 now also produces a bound
`git hash-object` for every final file, so the post-edit gate is a
whole-file byte-identity check rather than a set of derived counts (which
PATCH-028's review showed can cancel — see LESSONS_LEARNED's disclosure-gap
family, ninth variant). All five hashes matched exactly at review, the
first fully clean (zero-disclosure-gap) review since the class was
introduced. Also the largest single K-patch by edit volume (16 CanvasClient
blocks, three distinct call-site composition shapes for container-after-
child flows, and a five-statement silent-swallow cluster ported as two new
command-internal swallows — swallow-family sites 3 and 4, joining
`reorderSections`/`setChronoMode`). Landed byte-perfect on GPT-5.4 a fifth
time; monolith 8,507→8,504.
**Extended a sixth time by PATCH-030** (the storage pair + its paired
metadata update, the `addImageToLink` cluster, 3 sites / 1 handler) — the
narrowest application yet: ONE bound CanvasClient block, one thin new
command (`canvas.updatePostMetadata`) over an ALREADY-TESTED repository
method (028's `updateMetadata`), NO infra changes at all. The storage side
consumed the pre-existing Pattern H `createStorageGateway()` (§5.8, in
production since PATCH-017) rather than adding a new seam — the first K
patch to compose with H instead of only with the posts aggregate. The
simulation caught a tenth measurement-instrument variant (an unescaped
grep dot in the storage-extinction gate matching the new import's own
`supabase/storage` path — see LESSONS_LEARNED). All three bound hashes
matched exactly at review, plus the three must-not-change infra hashes
confirmed unchanged; third consecutive zero-disclosure-gap review. Landed
byte-perfect on GPT-5.4 a sixth time; monolith 8,504→8,499; storage
category went EXTINCT in CanvasClient (2→0), joining DELETE and INSERT.
**Extended a seventh time by PATCH-031** (the honest-contract padlets
UPDATE slice, six named-function sites) — the first K patch to split a
single UI category (padlets UPDATE) by LEGACY ERROR CONTRACT rather than
by feature: four sites reused `canvas.updatePostMetadata` (030), two
UNSTAMPED sites (`lockPadlet`/`movePadletLayer`) got a new thin sibling
command `canvas.updatePostMetadataUnstamped` over 028's already-tested
`updateMetadataUnstamped` method — still zero infra changes. Nine
named-function UPDATE sites were explicitly EXCLUDED from the slice
because their legacy contracts (bare-awaited swallow clusters, or
check-and-branch with no try/catch) do not port byte-faithfully onto
honest commands without either a new P3-family swallow command or an
authorized behavior micro-change — both deferred as their own rulings
rather than folded in. Bonus extinction: the file's one double-quoted
`.from("padlets")` site (the site-map census-correction trap) went
extinct (1→0). 39 bound tests (3 new + 36 existing re-run non-breaking).
The review surfaced a NEW failure mode, on the reviewer's side rather
than the implementer's: the spec was revised out-of-band after
authoring (§3's bound test block tightened, its declared hash updated to
match), and the first review pass compared the implementation against a
stale pre-edit scratch cache instead of the live spec, producing a false
"NEEDS FIX." Reversed on re-review once the CTO re-read the live spec's
own declared hash and confirmed the implementation matched it exactly —
recorded as LESSONS_LEARNED's measurement-instrument family, eleventh
variant. All three bound hashes ultimately confirmed exact, all six
CanvasClient blocks byte-identical to the live fences; landed
byte-perfect on GPT-5.4 a seventh time; monolith 8,499→8,475.
**Extended an eighth time by PATCH-032** (named-function padlets UPDATE
EXTINCTION, the remaining nine sites) — the first K patch delegated after
TWO owner-requested rulings made in the same authoring pass: a bare-awaited
cluster (7 sites) landed on two new command-internal-swallow siblings
(`canvas.updatePostMetadataBestEffort` + its unstamped twin), extending
the standing P3 swallow family from four to SIX sites, each pinned by its
own "resolved failure still returns ok" test; a check-and-branch pair
(`changeCardColor`/`pinPost`) received the program's SECOND AUTHORIZED
BEHAVIOR CHANGE (after PATCH-024) — the resolved-error branch stayed
byte-identical while the previously-uncaught thrown mode was routed onto
the SAME existing failure branch (P3 justification), landing on the
honest `canvas.updatePostMetadata` with no swallow. Fail-fast
`Promise.all` semantics were preserved EXACTLY (not approximated) via
per-element async wrappers that throw on `!result.ok`, reproducing the
legacy builder-array reject-on-first-throw behavior. NEW authoring
practice adopted directly from PATCH-031's review correction: the spec's
own final hashes were RECONSTRUCTED from its own OLD/NEW fences before
delegation, so the spec now proves its internal consistency rather than
relying on the author's separate scratch cache staying in sync. 45 bound
tests (6 new + 39 existing re-run non-breaking); all nine swap shapes
compile-verified. Named-function padlets UPDATE went EXTINCT (9→0; total
padlets UPDATE 23→14, all in the JSX region). Review re-derived every
expectation from the live spec on disk (per the 031 lesson) and found
zero disclosure gaps — the first fully clean review since the correction.
Landed byte-perfect on GPT-5.4 an eighth time; monolith 8,475→8,450.
**Extended a ninth time by PATCH-033** (ten of the fourteen JSX padlets
UPDATE sites) — the FIRST ONE-FILE APPLICATION: zero domain changes, zero
test changes, zero new commands, zero import changes. Seven bare-await
sites (a container-detach leg, a sequential two-write drag-drop pair with
first-throw-aborts-second preserved, three comments variants, a drawing
save, a crop save) landed as pure CONSUMERS of the already-tested
`updatePostMetadataBestEffort` — no new swallow sites, the standing P3
family stays at six. The check-and-branch `onUpdateChildComments` triplet
extended PATCH-032's Ruling-2 authorization to three more sites under the
identical convergence criteria (resolved branch untouched, thrown mode
routed onto the existing failure branch). One binding introduced a new
form: an OLD/NEW pair that occurs TWICE in the file (byte-twin columns and
wall variants) bound with an explicit occurs-exactly-2/replace-both
instruction, machine-verified at both authoring and review. The fidelity
net for the whole patch is the EXISTING 45-test posts suite — no new
tests were needed because this patch only swaps consumers of already-pinned
commands, the first time Pattern K's design (bound tests as the net) has
paid off across three consecutive patches without adding to the suite.
Four sites were explicitly excluded by column shape (two position writes,
a content+select variant, a title write) and named for their own future
rulings rather than folded in. Review re-derived every expectation from
the live spec and cross-checked all eight fence-pairs against the
implementation directly (not just the whole-file hash) — zero disclosure
gaps, second consecutive fully clean review. Landed byte-perfect on
GPT-5.4 a ninth time; monolith 8,450→8,404; padlets UPDATE 14→4.
**Extended a tenth time by PATCH-034** (the position-write pair) — the
first NEW-CAPABILITY extension since PATCH-029: one new repository method
(`updatePosition`, with OPTIONAL metadata omitted from the payload
entirely when absent — pinned by `Object.keys` tests on both call shapes)
plus two thin commands mirroring the established honest/best-effort split
(`canvas.updatePostPosition` for the drop-repositioning site's
check-and-branch contract under the program's THIRD authorized
micro-change — the previously-unhandled thrown mode converging onto the
byte-kept rollback branch — and
`canvas.updatePostPositionWithMetadataBestEffort` for the detach leg's
bare-await contract, the SEVENTH command-internal swallow site). The
seam-choice ruling: of the four column-shape sites 033 deferred, only the
position pair shares a capability — the content-carrying map variant and
the title-clear site are unrelated shapes, each deferred again BY NAME to
its own patch rather than folded in. 67 bound tests (9 new + 58 existing
re-run non-breaking); all five final hashes reconstructed from the spec's
own fences at authoring; at review, each whole-file fence was ALSO
byte-compared directly against its live file (`fence == live`), the
strongest binding check so far. Landed byte-perfect on GPT-5.4 a tenth
time; monolith 8,404→8,401; padlets writes 4→2.

**When:** a component performs a direct table WRITE whose UI trigger is
absent from (or too costly to add to) the e2e net, but whose logic is a
pure data transformation — so the fidelity net that e2e cannot provide is
supplied by UNIT TESTS instead. The defining move, and what distinguishes K
from a Pattern A-style page extraction: the spec author writes the domain
command, the infra repository, AND their unit tests as whole-file bindings,
then COMPILES AND RUNS THE BOUND TESTS AGAINST THE BOUND IMPLEMENTATION AT
AUTHORING TIME (scratch `tsc --strict` + scratch vitest). Delegation then
carries pre-verified assets: if a bound test fails against the
implementer's tree, the implementation deviates from the binding by
construction — the test is never wrong, never editable by the implementer.
This inverts the untestable-call escalation rule: PATCH-020-class patches
need the stronger model BECAUSE nothing executable guards fidelity; a
K-patch's single write is guarded by executable tests, so the economical
model is acceptable (PATCH-025 shipped byte-perfect on GPT-5.4, first try).

**When NOT:** the write's semantics depend on live state a unit test can't
fake honestly (realtime, presence, storage side effects — different
patterns); more than a handful of call sites (that's a 026+ GROUP patch —
same seam, staged bindings); the call is a raw passthrough the page's error
handling consumes shape-for-shape (Pattern J).

**Required pieces:** domain file with repository INTERFACE + `defineCommand`
command (zod input; `entity.verb` name; legacy semantics ported edge-by-edge
and each edge named in a comment citing the old line numbers); infra file
with the narrow structural client interface + class + factory over
`createBrowserSupabaseClient()` (the `as unknown as` factory double-cast is
the house idiom, not a deviation); one unit-test file per layer, bound and
pre-run; the consumer swap as small bound diffs with EXPLICIT blank-line
bindings for every deleted-line neighborhood.

**Legacy-fidelity discipline (the pattern's defining risk):** a moved
transformation must reproduce the old code's behavior INCLUDING its
degenerate paths — PATCH-025 preserved `|| []` (missing tasks wrote an
empty list) and mapped thrown-on-malformed to error-no-write, and bound a
test for each. Derive those edges by reading the legacy expression
operator-by-operator (`?.`, `||`, try/catch reach), then encode each as a
test BEFORE binding the implementation.

**Common mistakes:** an "earned" grandfather removal must be demonstrated,
not asserted — bind the standalone `eslint --no-ignore` probe at its
measured pre-edit error count and at 0 post-edit, so de-listing is proven
against the real rule, and never touch a type-only `@supabase/*` import to
get there (the PATCH-022 proxy-metric prohibition). Census gates bind
PRINTED TEXT, never bare exit codes (exit codes proved runner-dependent —
PATCH-025 Amendment 1); an existence check is
`test -e X && echo EXISTS || echo ABSENT`. And a count gate whose comment
enumerates the expected matches must be RUN, not composed from the
enumeration — substring collisions live where you aren't looking
(PATCH-025: an ignore-list line shared the grandfather entries' path
prefix; PATCH-024: a relative import spelled the module differently).

---

## 6. Universal requirements (every pattern, every patch)

**Phase order is mandatory:** e2e characterization spec written and GREEN
against the CURRENT page first → domain+infra+unit tests → page rewrite →
full e2e green again → grandfather entry removed LAST → final verify.

**The e2e net:** two-pass rule — a throwaway discovery run that prints the
page's real DOM/labels, then the assertions. Specs skip cleanly without
credentials (`test.skip(!hasE2ECredentials, ...)`) — OR, if the flow needs
no login at all, override the project storage state inline
(`test.use({ storageState: { cookies: [], origins: [] } })`) so the spec
RUNS credential-free; never inherit the file-based storageState without one
of the two (ENOENT on CI — PATCH-015 review). Clean up data they create.
Local full-suite runs are capped at 2 workers in `playwright.config.ts`
(dev-server contention rotates random 30s timeouts at higher counts —
PATCH-015 review); do not "speed them up" with `--workers`.

**Characterize the reachable state, not the happy path (added at PATCH-017
review):** before binding ANY e2e assertion, drive the real OLD page once
with the real e2e credentials/storage state and assert what you OBSERVE —
a fallback chain or success branch in the source guarantees nothing about
the state a given test account actually reaches (PATCH-017: the spec
assumed a non-empty workspace name "for any account"; the e2e session is
cookie-only while the page's token guard reads localStorage, so it
deterministically hit the FIRST early-return instead). The dry-run
obligation (§0, PATCH-012 Amendment 1a) covers this too — it is not just
for census/proof commands.

**E2E-created boards leak against the real board quota (added at PATCH-018
review, recurrence of PATCH-001):** `board-lifecycle.spec.ts` soft-deletes
(`deleted_at`) in cleanup, and crashed/timed-out runs skip cleanup
entirely; both accumulate ACTIVE rows against `FREE_PLAN_BOARD_LIMIT = 3`
per workspace, and Save Canvas then fails SILENTLY (no toast — a separate
product-bug flag, queued) with zero network trace. Before ruling a
board-creation failure a code defect, query the e2e workspace's active
board count via service role. Remediation must scope by BOTH title pattern
AND `deleted_at IS NULL` — a title-only delete (as first attempted this
week) removes trashed rows too, which is unnecessary churn but not itself
harmful; the real risk is the inverse mistake of scoping too narrowly and
leaving active leaks behind. A recurring pre-suite sweep (service-role,
hard-delete stale `e2e-lifecycle-*`/`cto-probe-*` boards) is queued as a
small e2e-infra patch — this is process debt, not a per-patch blocker.

**Cold-compile hits the LARGEST route hardest, not just settings pages
(added at PATCH-018 review):** the PATCH-014/015 cold-start lesson
generalizes beyond settings pages — `/dashboard/canvas/[id]` is the
heaviest route in the app (682 kB, `CanvasClient.tsx` at 8.5k lines); a
first hit on a freshly (re)started dev server can stall well past a
generous 90s wait, especially compounded by concurrent worker/probe
contention on the same server (PATCH-015 review). A stuck loading spinner
on a dashboard board card that never resolves is that stall, not a broken
click handler — verify by checking the target route responds fast
(`curl` timing) before treating it as a UI bug. Warm the canvas route with
one throwaway navigation before timed runs that will open a board,
independent of PATCH-015's `workers: 2` config fix (that addresses
concurrency; this addresses first-hit compile cost — both apply together).

**Stale `.next/types` after route deletions (added at PATCH-023 review):**
Next.js generates route type stubs under `.next/types`, and `tsc` reads
them. Deleting routed files leaves stale generated types referencing the
dead routes, so `npx tsc --noEmit` fails with phantom errors that no source
change can fix. After any patch that DELETES routes: stop the dev server
(PowerShell listener gate first — never delete `.next` under a live
server), delete `.next`, restart, re-verify the route probes, then rerun
tsc. This is an environment artifact, not a source defect — but only after
the clean rebuild proves it.

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
| 014 | settings/delete-account | C (+ `signOutCurrentUser`) | 12→11 ✅ done |
| 015 | share/[token] (server page) | G — server-page read (introduces `serverClient.ts`) | 11→10 ✅ done |
| 016 | AddPadletMenu | orphan deletion (census-gated) | 10→9 ✅ done |
| 017 | settings-root | A/E composition + H — storage gateway (introduces `storage.ts`) | 9→8 ✅ done |
| 018 | profile | A/E composition + I — legacy-token quarantine (introduces `legacyToken.ts`) + H reuse | 8→7 ✅ done |
| 019 | settings/integrations | I reuse — deep-scan scavenger + session cascade added to `legacyToken.ts` (third and final scavenger variant; batch 016–019 complete) | 7→6 ✅ done |
| 020 | settings/password | new Pattern J — raw-passthrough MFA/webauthn facade (`passwordSecurity.ts`, 9 wrappers, zero Result conversion) + I reuse as a consumer only (imports `getAccessToken`/`decodeJwtPayload`, adds zero code to the quarantine) | 6→5 ✅ done |
| 021 | settings/members | Pattern J extended to raw table CRUD (`workspaceMembers.ts`, 10 wrappers covering 13 raw touches: workspace_members/workspace_invitations/boards CRUD + 2 auth calls + thin `resolveCurrentWorkspace` pass-through); `lib/workspace/context.ts` byte-untouched; grandfather trigger was solely a raw `User` type import, replaced by a narrow local interface | 5→4 ✅ done |
| 023 | app/collabboard/** + app/api/collabboard/** | census-gated ROUTE-vertical deletion (PATCH-016 shape, first routed variant): 18 files, deletions-only, authorized by the PATCH-022 Fact-1 data census (zero user data); live accept-route + DB tables left untouched (Phase-3 items) | 4→3 ✅ done |
| 024 | settings-root + profile + password + integrations (cross-page) | the plan's ONE authorized behavior-change patch (not an extraction pattern): scavenger normalization — new `sessionToken.ts` (getSession→refreshSession), quarantine shrunk 8→4 exports, eleven token-swap sites, two pages functionally REPAIRED for cookie users, two characterization specs rebound via the EXPECTED-UNPROBED protocol (assert the repaired state, STOP-and-amend if it fails — PATCH-003 precedent, first use on a behavior change) | 3→3 (all pages already off the list) ✅ done |
| 025 | PostCardContent (todo-checkbox write) | new Pattern K — canvas ops command (§5.11): the canvas seam TRUNK (`lib/domain/canvas/posts.ts` + `lib/infra/canvas/postsRepository.ts`, `canvas.toggleTask`); bound unit tests compiled AND run green at authoring, so GPT-5.4 sufficed for a real DB write; grandfather removal EARNED via the measured `--no-ignore` probe (1 error → 0), zero type-only de-linting; companion successor artifact `docs/CANVASCLIENT_SITE_MAP.md` | 3→2 ✅ done |
| 026 | CanvasClient (`board_sections` write family, 6 sites / 4 handlers) | Pattern K reuse (§5.11): SIBLING aggregate `lib/domain/canvas/sections.ts` beside `posts.ts` (one trunk folder, zero cross-references) — five commands incl. a preserved sequential-partial-failure swap and a preserved legacy error-swallow reorder, each pinned by a dedicated test (17 total); NO grandfather movement (metric not chased); monolith line count SHRANK for the first time (8,526→8,518) | 2→2 (CanvasClient stays grandfathered — 70 sites remain) ✅ done |
| 027 | CanvasClient (`boards` update family, 4 sites / 4 handlers) | Pattern K reuse (§5.11): THIRD sibling aggregate `lib/domain/canvas/board.ts` beside `posts.ts`/`sections.ts`; resolved a P6 naming collision against the unconsumed `lib/domain/boards/repository.ts` exemplar via disambiguating name (`CanvasBoardRepository`), not a merge; four commands incl. a preserved map-style no-timestamp write and a SECOND silent-swallow site (`setChronoMode`, sibling to `reorderSections`), each pinned by a dedicated test (15 total); NO grandfather movement; monolith line count SHRANK again (8,518→8,517) | 2→2 (CanvasClient stays grandfathered — 66 sites remain) ✅ done |
| 028 | CanvasClient (`padlets` DELETE family, 8 sites / 6 handlers) | Pattern K reuse (§5.11), FIRST EXTENSION-ONLY application: four delete commands (`deletePost`/`deletePosts`/`deleteChildPosts`/`deleteContainerChild`) joined the EXISTING `PostsRepository` (`padlets` IS the posts table, P6) — zero new files; 25 bound tests (16 new + the 9 PATCH-025 tests re-run to prove non-breaking); conditional cascades composed from two thin commands at the call site rather than merged, preserving exact legacy DB traffic; the unconditional cascade became one command, pulling its paired update out of the UPDATE family's count (33→32); two child-cascade console-swallows preserved AT THE CALL SITE (not command-internal — Results stay honest); introduced the edit-simulation authoring technique; NO grandfather movement; monolith line count SHRANK again (8,517→8,507); one accepted whitespace-only disclosure gap at review (blank-line drift that canceled in the line-count gate) | 2→2 (CanvasClient stays grandfathered — 58 sites remain) ✅ done |
| 029 | CanvasClient (`padlets` INSERT family, 19 sites / 12 handlers) | Pattern K reuse (§5.11), SECOND extension-only application: six create commands (`createPost`/`createPostAndSelect`/`createContainerWithPost`/`groupPostIntoContainer`/`attachPostToSchedulerContainer`/`createSchedulerContainerWithPost`) joined the EXISTING `PostsRepository`, zero new files; 46 bound tests (21 new + 25 existing re-run non-breaking); introduced the HASH-GATE class — bound `git hash-object` for all five final files, computed from the CTO's edit simulation, closing the line-count-cancellation gap 028's review found; a five-statement scheduler silent-swallow cluster ported as TWO command-internal swallows (swallow-family sites 3+4); three distinct container-after-child compensation shapes preserved at call sites; compact-form blocks bound to keep the over-ceiling file shrinking; NO grandfather movement; monolith line count SHRANK again (8,507→8,504); all five hashes matched EXACTLY at review — first fully clean (zero-disclosure-gap) review since the hash-gate class was introduced | 2→2 (CanvasClient stays grandfathered — 31 padlets sites remain) ✅ done |
| 030 | CanvasClient (storage pair + paired metadata update, `addImageToLink`, 3 sites / 1 handler) | Pattern K reuse (§5.11), SIXTH application, narrowest yet: ONE bound block, one thin new command `canvas.updatePostMetadata` over the ALREADY-TESTED `updateMetadata` repo method (028), zero infra changes; storage side consumed the EXISTING Pattern H `createStorageGateway()` (§5.8, in production since 017) rather than adding a seam — first K patch composing with H; 36 bound tests (3 new + 33 existing re-run non-breaking); simulation caught a tenth measurement-instrument variant (unescaped grep dot false-matching the patch's own new import path); NO grandfather movement; monolith line count SHRANK again (8,504→8,499); storage category went EXTINCT in CanvasClient (2→0); all three bound hashes matched EXACTLY plus all three must-not-change infra hashes confirmed unchanged — third consecutive zero-disclosure-gap review | 2→2 (CanvasClient stays grandfathered — 30 padlets sites remain) ✅ done |
| 031 | CanvasClient (honest-contract padlets UPDATE slice, six named-function sites) | Pattern K reuse (§5.11), SEVENTH application, first split by LEGACY ERROR CONTRACT rather than feature: four sites reused `canvas.updatePostMetadata` (030), two UNSTAMPED sites got a new thin sibling `canvas.updatePostMetadataUnstamped` over 028's already-tested `updateMetadataUnstamped` method, zero infra changes; nine named UPDATE sites explicitly excluded (swallow-cluster and check-and-branch contracts don't port byte-faithfully without a separate ruling); bonus extinction of the file's one double-quoted `.from("padlets")` site (1→0); 39 bound tests (3 new + 36 existing re-run non-breaking); NO grandfather movement; monolith line count SHRANK again (8,499→8,475); all three bound hashes ultimately confirmed EXACT and all six CanvasClient blocks byte-identical to the live spec, but the FIRST review pass produced a false "NEEDS FIX" from a reviewer-side stale scratch cache rather than the live (out-of-band-revised) spec — reversed on re-review, recorded as measurement-instrument variant eleven | 2→2 (CanvasClient stays grandfathered — 24 padlets sites remain) ✅ done |
| 032 | CanvasClient (named-function padlets UPDATE extinction, remaining nine sites) | Pattern K reuse (§5.11), EIGHTH application, first patch delegated after two owner-requested rulings in one authoring pass: bare-awaited cluster (7 sites) onto two new command-internal-swallow siblings (`canvas.updatePostMetadataBestEffort` + unstamped twin), extending the P3 swallow family 4→6 sites; check-and-branch pair (`changeCardColor`/`pinPost`) received the program's SECOND authorized behavior change (thrown-mode repair onto the existing failure branch, resolved-mode untouched); fail-fast `Promise.all` semantics preserved exactly via throw-on-!ok wrapper closures; 45 bound tests (6 new + 39 existing re-run non-breaking); spec's own final hashes RECONSTRUCTED from its OLD/NEW fences before delegation (new authoring practice, direct response to 031's review correction); NO grandfather movement; monolith line count SHRANK again (8,475→8,450); named-function padlets UPDATE went EXTINCT (9→0; 23→14 total, all JSX); review re-derived every expectation from the live spec on disk and found zero disclosure gaps — first fully clean review since the 031 correction | 2→2 (CanvasClient stays grandfathered — 15 padlets sites remain, all JSX + the lone select) ✅ done |
| 033 | CanvasClient (ten of the fourteen JSX padlets UPDATE sites) | Pattern K reuse (§5.11), NINTH application, FIRST ONE-FILE patch: zero domain/test/import changes, pure consumer swaps of the already-tested command quartet — seven bare-await sites onto `updatePostMetadataBestEffort` (no new swallow sites, P3 family stays at six), the `onUpdateChildComments` triplet extending 032's Ruling-2 authorization to three more sites; new binding form introduced — an OLD/NEW pair bound at an explicit occurs-exactly-2/replace-both count for byte-twin columns/wall variants, machine-verified at authoring AND review; fidelity net = the existing 45-test posts suite (no new tests needed, Pattern K's bound-test design paying off on a pure-consumer patch); four sites deferred by column shape and named for their own future rulings; NO grandfather movement; monolith line count SHRANK again (8,450→8,404); padlets UPDATE 14→4; review cross-checked all eight fence-pairs against the implementation directly, not just the whole-file hash — zero disclosure gaps, second consecutive fully clean review | 2→2 (CanvasClient stays grandfathered — 5 padlets sites remain: 4 deferred writes + the lone select) ✅ done |
| 034 | CanvasClient (position-write pair: detach padlet leg + drop repositioning) | Pattern K reuse (§5.11), TENTH application, first new-capability extension since 029: one new repository method `updatePosition` (optional metadata OMITTED from the payload when absent, `Object.keys`-pinned on both shapes) + two thin commands mirroring the honest/best-effort split; the honest command carries the program's THIRD authorized micro-change (thrown-mode position rollback convergence — legacy left the optimistic position stranded on a network failure); the best-effort command is the SEVENTH command-internal swallow site; the other two deferred sites (content+select map variant, title-clear) ruled UNRELATED shapes and deferred by name to their own patches; 67 bound tests (9 new + 58 existing re-run non-breaking); review byte-compared each whole-file fence directly against its live file in addition to the hash gates — zero disclosure gaps, third consecutive fully clean review; standing swallow-family decision table brought current to SEVEN sites (incl. a catch-up for 032's extension) | 2→2 (CanvasClient stays grandfathered — 3 padlets sites remain: map content+select pair + title-clear) ✅ done |

**New patterns discovered by future patches get added here by the CTO at
review — this catalog only ever contains patterns with a reviewed reference
implementation.** Concretely: PATCH-015 (Pattern G) does
NOT appear above yet — it is queued but not yet reviewed. Their own patch
files are fully self-contained specifications in the meantime; do not expect
to find their pattern here until their row shows ✅ done.
