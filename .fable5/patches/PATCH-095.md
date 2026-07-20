# PATCH-095 — Atomic Cross-Container Move: Design Contract (No Code)

**Status:** **DESIGN AUTHORIZED — GOVERNANCE-ONLY, NO IMPLEMENTATION**.
This patch binds an exact SQL/RPC contract, invariant, and repository/
UI integration plan for a FUTURE implementation patch. It authorizes
ZERO new files, ZERO production changes, and ZERO migration code.
Nothing in this patch may be executed until a successor
implementation patch is separately authorized, which itself requires
the owner to first resolve the migration/deployment blockers
documented in §9.

**Implementer:** none — this patch has no code deliverable.
**Reviewer:** independent read-only reviewer verifies internal
consistency, absence of code/migration changes, and that no carried
evidence was weakened (a documentation review, not a live-test
review — there is no new spec to execute).
**Closure:** Fable (CTO) after owner acknowledgment.

**Behavioral/source base commit AND authoring HEAD (bind):**
`aee4322aa36dcaac7a3b28443a21e19285e6db60`
(`test(e2e): characterize drawing comment EDIT save persistence
(PATCH-094)`; HEAD == origin/main at authoring time)

**This patch has no implementation commit and no bound commit
message** — it is authored, reviewed, and closed as a single
governance artifact. A FUTURE implementation patch (not yet numbered
or authorized) will carry its own bound commit message once the §9
blockers are resolved and a successor patch is opened.

---

## 0. Fresh census (2026-07-20, from `aee4322a`)

| # | Candidate | Class | User-visible impact | Deterministic repro | Coverage | Owner | Fix-ready? | Files | Ruling needed | Arch risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Atomic cross-container move design** | defect family (production), design work THIS patch | moves can strand duplicate-parent/orphan half-states | affordance not drivable (089 Flow B); persistence path statically proven non-atomic | 089 diagnosis green | new Postgres RPC + repo/adapter/hook + `DrawingLayout` rewire | **DESIGN ONLY — SELECTED (this patch); implementation NOT authorized** | 0 code files (design bound in this doc) | full RPC/RLS/repository/test-layer contract — bound in §7/§8 below | HIGH (new backend surface, RLS-sensitive) | **P0 (design); P1 for implementation, gated on §9** |
| 2 | Move migration/deployment tooling gap | infra/process gap | none directly — blocks #1's implementation | concrete NEW evidence this census: `supabase/BASELINE.md` documents `supabase/migrations/` does NOT rebuild the live DB (drift, hand-applied changes); reconciliation explicitly blocked on Docker + DB password; Docker Desktop engine confirmed NOT RUNNING in this environment at authoring time; no `supabase/config.toml`; no CI migration validation step in `.github/workflows/`; `supabase` CLI is not a project dependency (resolves via ad-hoc `npx`, not pre-installed); a LOCAL, gitignored `supabase/.temp/linked-project.json` shows this machine has a remote project link, but that is machine-local state, not committed/shareable tooling | sharper and more concrete than 090/091/092/093/094's prior "no CLI" framing — see §9 | repo owner | **owner decision + Docker/baseline reconciliation required** | 0 | owner must resolve baseline drift (needs Docker + DB password) before ANY new migration is safe to author against this repo's `migrations/` folder | HIGH if bypassed — a new migration authored against an unreconciled baseline could apply cleanly locally yet diverge from the real prod schema | **P0 (blocks #1's implementation entirely)** |
| 3 | Existing-card move: source-parent removal | move-design sub-question | part of #1's atomicity contract | n/a | 089/090 findings | future RPC | bound in this patch's §7 invariant | — | bound below | part of #1 | resolved as design (§7), deferred as code |
| 4 | Destination-parent append | move-design sub-question | part of #1's atomicity contract | n/a | 089 static proof | future RPC | bound in §7 | — | bound below | part of #1 | resolved as design, deferred as code |
| 5 | Child `parentId` update | move-design sub-question | part of #1's atomicity contract | n/a | not separately characterized | future RPC | bound in §7 | — | bound below | part of #1 | resolved as design, deferred as code |
| 6 | Duplicate-parent prevention | move-design sub-question | prevents double-linking mid-move | n/a | not characterized | future RPC | bound in §7 (conflict check under row lock) | — | bound below | part of #1 | resolved as design, deferred as code |
| 7 | Same-parent no-op | move-design sub-question | dropping a child back on its own container shouldn't write | n/a | not characterized | future RPC | bound in §7 | — | bound below | part of #1 | resolved as design, deferred as code |
| 8 | Failed-move atomic rollback | move-design sub-question | a failed move must not leave a half-applied state | n/a | not characterized | future RPC | bound in §7 (single-transaction function body) | — | bound below | part of #1 | resolved as design, deferred as code |
| 9 | Rapid move serialization | move-design sub-question | two rapid moves of the same child must not race | n/a | not characterized | future RPC | bound in §7 (row locking + conflict check) | — | bound below | part of #1 | resolved as design, deferred as code |
| 10 | Reload after move | move-design sub-question | reload must reflect confirmed post-move state | n/a | not characterized | future RPC | bound in §7 | — | bound below | part of #1 | resolved as design, deferred as code |
| 11 | Move cancellation | move-design sub-question | user must be able to cancel a drag without a write | n/a | not characterized | future RPC | UI-layer concern, outside the RPC contract itself — bound as a UI caller requirement in §8 | — | bound below | part of #1 | resolved as design, deferred as code |
| 12 | Dedicated drag-handle affordance | UI feature | move stays inaccessible until #1's implementation lands | n/a | none yet | `RowColumnContainerCard.tsx` | prohibited before #1's implementation (090/091 rulings, unchanged and reaffirmed here) | — | — | — | deferred with #1 |
| 13 | PATCH-088 genuine browser/context/page-close setup flakiness | infra reliability | none (test-infra only) | a STABLE, real signature across four independent occurrences now (090/091/092 reviews); explicitly distinct from the reviewer/operator `ERR_CONNECTION_REFUSED` seen once at the 093 review (excluded from this signature) | runner correctly refuses to misclassify either kind, every time | `e2e/run-carried-groups.mjs` / `auth.setup.ts` | **near-ready — see §10** | — | needs the exact bounded signature spelled out before a retry is added | a premature broad retry could mask real failures or operator mistakes | MEDIUM — reassessed upward this census, still not selected |
| 14 | Remaining non-strict callers | design, intentional | none — deliberately best-effort per 088 §4 | n/a | 088 §4 ruling, re-confirmed §11 below | `DrawingLayout.tsx` ~522/531 (move, part of #1) and ~956/966 (position, DEFER by design) | DEFER by design (unchanged) | — | — | — | deferred |
| 15 | Position-write best-effort family | design, intentional | same as #14 | n/a | 088 §4 ruling | `DrawingLayout.tsx` | DEFER by design (unchanged) | — | — | — | deferred |
| 16 | Broader canvas-operation error swallowing | design | mixed | n/a | none | multiple (`lib/domain/canvas/*`) | later dedicated contract patch | — | Result/throw consistency-wide ruling | MEDIUM | deferred |
| 17 | Result-versus-throw consistency (repo-wide) | design | none directly | n/a | none | multiple | later dedicated contract patch, same as #16 | — | one repo-wide convention ruling | MEDIUM | deferred |
| 18 | Comment failure-state behavior without injected failures | characterized-by-source-only | none — 092/094 already proved the single-catch contract by source; no injection seam exists or is authorized | n/a — failure injection remains prohibited | 092/094 source findings | `DrawingLayout.tsx` (unchanged) | already resolved by source inspection; no further action needed | 0 | none | LOW | resolved, no action |
| 19 | Comment editor synchronous-close design risk | characterized design risk, NOT a proven defect | none observed at runtime (094: all 4 runs consistent) | not reproducible without a genuine persistence failure, which cannot be injected | 094 §17 closure ruling | `EmbeddedCommentList.tsx` (unchanged) | **NOT fix-ready — no proven failure exists** | — | would need either a new proven failure or a product decision to await persistence before closing edit mode | LOW — theoretical only | deferred, held per 094 closure |
| 20 | Shift+Enter behavior | small UX question, NOT proven broken | unknown — never runtime-observed (094 recorded `not-attempted-within-bound-scope`) | reachable, small scope | none | `CommentRow.tsx` (Enter/Escape handling, unchanged) | diagnosis-first if selected, NOT selected this patch | — | needs a real UI probe if ever prioritized | LOW | deferred, smaller than #1/#2 |
| 21 | Empty and whitespace-only comment edit behavior | small UX question, NOT proven broken | `handleSaveEdit` silently leaves edit mode open on empty/whitespace text (source-confirmed, 094 §1) — plausibly confusing but not data-lossy | reachable, small scope | source-confirmed only, no runtime probe | `CommentRow.tsx` (unchanged) | diagnosis-first if selected, NOT selected this patch | — | needs a real UI probe if ever prioritized | LOW | deferred, smaller than #1/#2 |
| 22 | PATCH-091 historical reconciliation note | governance, ALREADY RESOLVED | none | n/a | 093 §9 and 094 §17 already carry the full cross-reference | — | resolved, no further action | 0 | none — 091's wording was already correctly bounded (Interpretation A); no rewrite was ever needed | none | resolved, no action |
| 23 | PATCH-081 | governance | none | n/a | RETIRED-BY-NOTE | — | n/a | — | — | none | no action, held |
| 24 | Frame/sidebar sync | no characterized defect | none observed | no repro | 079/080 green | — | n/a | — | — | none | deferred |
| 25 | Line-follow behavior | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 26 | Uploaded-image storage cleanup | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 27 | AI images in presentation | feature | n/a | fixture-blocked | none | — | n/a | — | — | none | deferred |
| 28 | Overlap fallback | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 29 | Connections side-panel planning | feature | n/a | n/a | none | — | n/a | — | — | none | deferred — **explicitly NOT begun during stabilization** |
| 30 | New issue exposed by PATCH-094 | — | none — 094 found normal EDIT save/cancel fully consistent | — | — | — | — | — | — | — | NONE — the only open item from 094 (synchronous-close risk, #19) is already characterized and correctly deferred |

## 1. Product interpretation carried forward (bind, unchanged from
PATCH-094 §19)

Normal comment EDIT save is CURRENTLY WORKING. Normal Escape
cancellation is CURRENTLY WORKING. No production comment-EDIT fix,
duplicate-save fix, or comment-store migration is justified.
PATCH-091/093/094 form a complete, non-contradictory evidence chain
(narrow-probe miss → delayed-mount proof → save/cancel proof). No
historical runtime evidence is retired or rewritten by this patch.

## 2. Why atomic move is selected as the census's #1 item (bind)

With the comment EDIT question now fully closed (091→093→094), the
highest-priority remaining P0/P1 correctness gap in this repo is the
existing-card cross-container move: the current client-side sequence
(`DrawingLayout.tsx` ~522/531, non-strict `onUpdatePadlet`, awaited
but non-throwing) performs source-removal and destination-append as
INDEPENDENT writes with no rollback — a failure between them can
strand a child in a duplicate-parent or orphan half-state (089's
statically-proven finding, unchanged). This is a real, unresolved
correctness gap, not a characterization gap — 089 already diagnosed
it; what has been missing since 090's closure is an actual DESIGN
that fully specifies the safe, atomic replacement, so that an
implementation patch can be authorized THE MOMENT deployment tooling
is ready, without another round of design deliberation.

## 3. Selected option (bind)

**OPTION A — atomic cross-container move implementation DESIGN,
governance-only.** Per Task 6's explicit preference ("preferred
target if atomic implementation remains undeployable") and Task 14's
explicit constraint ("do not authorize atomic implementation unless
migration authoring, testing, deployment, and security ownership are
ALL implementation-ready") — §9 below proves deployment/testing
ownership is NOT yet ready (Docker not running, baseline
reconciliation blocked, no CI validation, no owner-confirmed
deployment path). Option B (a standalone migration/deployment
ownership diagnosis) is folded into this same patch's §9 rather than
split into a second patch, since the blockers are now concretely
documented (not merely asserted) and a separate diagnosis patch
would not add information beyond what §9 already contains. Option C
(runner hardening) is reassessed upward in priority (§10) but not
selected — comment work is closed and move design is more valuable
right now. Option D/E (strict-caller or comment edge-case work) are
smaller and lower-priority than completing the move design contract
now that the census is otherwise clear.

## 4. Atomic move invariant (bind — the exact behavior a future
implementation MUST satisfy)

**Initial state:** child belongs to source parent A; A contains
child exactly once (in `childPadletIds`); B does not contain child;
`child.metadata.parentId == A`; child is absent from all other
parents.

**Successful move A → B:** remove child from A's `childPadletIds`;
append child to B's `childPadletIds` EXACTLY ONCE, at the end
(preserving existing order otherwise, matching 090's append
precedent); set `child.metadata.parentId = B`; all THREE writes
(A's array, B's array, child's `parentId`) happen inside ONE atomic
transaction — either all three commit or none do; unrelated child
ordering in A and B is preserved; unrelated parent metadata fields
are preserved; no duplicate membership (child never appears in two
parents' arrays simultaneously after the transaction commits); no
stale source membership; no third-parent membership; reload
reproduces the exact post-move state with no further writes needed.

**Same-parent move (A → A):** a no-op — no write occurs at all if
the function detects `source_parent_id == destination_parent_id`;
no duplicate; no ordering corruption.

**Failure (any step):** the ENTIRE transaction rolls back; A remains
completely unchanged; B remains completely unchanged;
`child.metadata.parentId` remains A; no partial membership can be
observed by any concurrent reader; exactly one coherent thrown error
surfaces to the caller; no client-side compensation is required or
attempted (unlike 090's create-and-append case, this contract is
fully atomic at the database layer, so no application-level
best-effort delete/undo step is needed).

**Rapid or repeated move (conflict behavior):** if two calls race for
the same child, the SECOND call (whichever actually executes second
under the row lock — see §7) must either (a) succeed cleanly if the
first call's move already left the child in a state consistent with
what the second call expects, making it a no-op, or (b) fail loudly
with a specific "unexpected current parent" error if the child's
actual current parent (read under lock) does NOT match what the
caller believes it is — this makes a genuinely conflicting rapid
double-move conflict-safe (client-visible failure) rather than
silently corrupting state or applying both moves in an
undefined order.

## 5. What this patch does NOT authorize (bind)

No SQL migration file. No `postsRepository` method. No
`useCanvasData` hook change. No `CanvasClient.tsx` change. No
`DrawingLayout.tsx` change. No drag-handle affordance. No new
Playwright spec. No change to any of the 47 fenced files below. This
patch produces ONLY the design contract in §4/§7/§8 for a FUTURE,
separately-numbered and separately-authorized implementation patch.

## 6. Allowed files (bind)

NONE. This patch modifies only `.fable5/patches/PATCH-095.md` and
`.fable5/docs/CURRENT_TASK.md` (governance). No absence gate applies
— no new production or spec file is created by this patch.

## 7. Backend contract (bind — for the future implementation patch,
NOT executed now)

**Function name:** `move_child_between_containers`

**Signature:** `move_child_between_containers(p_child_id uuid,
p_source_parent_id uuid, p_destination_parent_id uuid) RETURNS void`

**Transaction boundary:** the entire function body executes as ONE
implicit transaction (a single `plpgsql` function invoked via one
`supabase.rpc(...)` call is atomic by Postgres's own semantics — no
explicit `BEGIN`/`COMMIT` needed inside the function; a `RAISE
EXCEPTION` anywhere in the body rolls back everything the function
has done so far).

**Locking strategy:** at function entry, `SELECT ... FOR UPDATE` the
child row AND both parent rows (source, destination), acquired in a
STABLE order (e.g. sorted by `id`) to prevent deadlocks between two
concurrent calls that reference the same two containers in opposite
order. This serializes concurrent moves touching any of these three
rows.

**Conflict check (under lock):** read the child's CURRENT
`metadata->>'parentId'`. If it does not equal `p_source_parent_id`,
`RAISE EXCEPTION` with a specific, identifiable message (e.g. `child
% is not currently a member of parent %`) — the caller's assumption
was stale; do not silently move from wherever it actually is.

**Same-parent no-op:** if `p_source_parent_id = p_destination_parent_id`,
return immediately with no writes (still validate ownership/conflict
first, so a call against a child that isn't even in the claimed
parent still fails loudly rather than silently no-op'ing).

**Idempotency:** if, after the conflict check passes, the destination
already contains the child exactly once and the source does not
contain it and `parentId` already equals the destination, treat as
already-applied and return successfully with no further writes (safe
for an accidental duplicate call after a successful prior one, e.g. a
UI retry after a slow response).

**Ordering semantics:** append to the destination's `childPadletIds`
JSONB array at the END, exactly once; remove the child's id from the
source's `childPadletIds` array; all other array entries in both
arrays keep their existing relative order.

**Idempotency vs. conflict distinction:** the difference between
"already applied, no-op" and "stale caller, error" is whether the
child's CURRENT parent (read under lock) matches the DESTINATION
(already-applied case) or matches NEITHER the source NOR the
destination (a genuinely stale/conflicting caller — error case).

**SECURITY INVOKER vs. DEFINER (bind, reaffirmed from 092's ruling):**
**SECURITY INVOKER**. The function only touches three rows (child,
source parent, destination parent) that the calling user's own
session must already have UPDATE rights to via the EXISTING
`padlets` RLS policies (`supabase/migrations/20260706_fix_blanket_permissive_policies.sql`,
scoped via `auth.uid()` and board ownership/collaborator role). No
privilege escalation is needed or authorized — this is a same-board
operation, not a cross-board or `auth.users`-reading operation like
`get_board_members_with_profile` (which correctly uses SECURITY
DEFINER because normal RLS cannot reach `auth.users`). If the
implementer discovers a same-board case this reasoning does not
cover, STOP and escalate rather than switching to SECURITY DEFINER
unreviewed.

**RLS/authorization assumption:** ALL three rows (child, source
parent, destination parent) must belong to the SAME board — this
contract does NOT authorize cross-board moves. The function should
verify (or rely on RLS to reject) any attempt where the three rows
don't share a `board_id`.

**Error contract:** throwing only — `RAISE EXCEPTION` on any
violation (stale conflict, missing row, cross-board mismatch, RLS
denial surfaces as a Postgres permission error which the RPC caller
already handles as a thrown rejection). No Result/boolean-success
return shape — consistent with every other DrawingLayout strict call
site (`onUpdatePadletStrict` convention).

## 8. Repository/adapter/UI integration contract (bind — for the
future implementation patch, NOT executed now)

**Repository method:** `lib/infra/canvas/postsRepository.ts` gains
`moveChildBetweenContainers(childId: string, sourceParentId: string,
destinationParentId: string): Promise<void>` — calls
`supabase.rpc('move_child_between_containers', { p_child_id: childId,
p_source_parent_id: sourceParentId, p_destination_parent_id:
destinationParentId })`, throws on any returned error (hand-typed
inline call, matching the existing no-generated-types convention used
by `lib/auth/permissions.ts`, `lib/import/restore.ts`,
`lib/kanban/supabaseAdapter.ts` — no `database.types.ts` exists in
this repo, so no generated-type churn risk).

**Hook layer:** `useCanvasData` (or the domain command layer, per
`lib/domain/canvas/posts.ts` conventions — the implementer chooses
based on where the existing throwing move-adjacent methods already
live) exposes a new throwing method,
e.g. `moveChildBetweenContainersStrict`.

**UI caller:** `CanvasClient.tsx` gains a strict handler analogous to
its other strict comment/padlet handlers (~6594/6676/6756/4959-4969
precedent — result-checked, `console.error` + `toast.error` on
failure), which `DrawingLayout.tsx`'s `onDropExistingPadlet` (the
current move handler, byte-kept until this lands) is REWIRED to call
instead of its current two independent `onUpdatePadlet` writes.

**Move cancellation:** remains a UI-layer concern — if the user
cancels a drag before drop, no RPC call is made at all (the current
UI's own drag-cancel handling, unchanged, already prevents a drop
handler from firing); this contract does not need a "cancel" RPC
parameter.

**Test layers (bind, for the future patch):**
1. *Database contract* — requires a local Postgres (via Supabase
   CLI + Docker) to test the function directly; BLOCKED until §9's
   Docker/baseline blockers are resolved.
2. *Repository unit/integration* — CAN be authored today without a
   live database (mock the Supabase client at the repository
   boundary, verify the exact RPC name/args are passed and that a
   thrown RPC error propagates) — this is NOT blocked by §9, but is
   explicitly NOT authorized by THIS patch (§5 — no code changes
   authorized yet).
3. *E2E move regression* — needs the RPC actually deployed to a
   reachable environment; BLOCKED until §9 resolves.

**Deployment prerequisites:** the owner must either (a) complete
`supabase/BASELINE.md`'s blocked reconciliation (needs Docker running
+ the database password) so that `supabase/migrations/` genuinely
rebuilds the live schema before a NEW migration is layered on top, or
(b) explicitly accept and document the drift risk and deploy the new
migration directly via `supabase db push --linked` with an
owner-supervised review of the exact SQL — the CTO does not recommend
(b) without (a), per the standing "no untested migration in
production" rule.

**Rollback plan:** Supabase/Postgres migrations are forward-only (no
native down-migration mechanism in the CLI) — "rollback" here means
authoring and applying a NEW forward migration
(`DROP FUNCTION IF EXISTS move_child_between_containers;`) if the
function needs to be retracted after deployment.

**Observability:** the function's `RAISE EXCEPTION` messages should
be specific enough (child/parent ids in the message) for the
JavaScript catch layer's existing `console.error`-plus-optional-toast
idiom to surface a meaningful message; no new logging infrastructure
is needed.

## 9. Migration/deployment ruling (bind — concrete evidence, sharper
than prior patches' framing)

Re-investigated at this census with NEW concrete evidence beyond
090/091/092/093/094's repeated "no CLI/config.toml" framing:

- `supabase/BASELINE.md` (authored 2026-07-06, commit `f857212`,
  never updated since) explicitly states: **"`supabase/migrations/`
  does NOT rebuild the live database."** Migrations were historically
  applied non-linearly; several changes went to prod via the SQL
  editor or now-archived root-level scripts (`supabase/legacy/`).
- Finishing the baseline reconciliation (`supabase db diff --linked
  -f baseline`, then `migration repair`, then a `db reset` parity
  check) is explicitly documented as **"blocked 2026-07-06"** pending
  **Docker + the database password** — neither of which this
  governance session has. Re-verified at this authoring: Docker
  Desktop is installed but its engine is **NOT RUNNING**
  (`docker ps` fails to reach the daemon).
- No `supabase/config.toml` exists (would be needed for `supabase
  start`/local shadow DB even once Docker is running).
- The `supabase` CLI is NOT a project dependency — it resolves via an
  ad-hoc `npx supabase` fetch (confirmed: v2.109.1 was downloaded
  fresh at authoring time), not a pre-installed, reproducible tool.
- No CI workflow (`.github/workflows/*.yml`) references `supabase` or
  runs any migration validation step.
- A LOCAL, gitignored `supabase/.temp/linked-project.json` (confirmed
  via `git ls-files` — untracked) shows this MACHINE has a remote
  Supabase project link (ref `atkgocwwqbjjhitpavei`) — but this is
  machine-local state from a prior manual `supabase link`, NOT
  committed, shareable, or CI-visible tooling. Its existence does NOT
  change the repo-level assessment; if anything, it is a risk
  factor — it means a `supabase db push --linked` command COULD be
  run directly against a real linked project from this machine
  without any of the reconciliation/testing safeguards above having
  been completed.
- Migrations have continued to be authored since the baseline block
  (latest: `20260713_fix_kanban_board_member_policy_recursion.sql`,
  July 13) without the reconciliation ever being resolved — the
  drift risk is not shrinking on its own.

**Blocker classification: F — multiple blockers**, specifically
**B (no confirmed deployment owner/process for a NEW migration)** and
**C (no usable local test environment — Docker not running, no
config.toml, baseline reconciliation blocked)**. Blocker A (no
migration authoring location) does NOT apply — `supabase/migrations/`
is a real, working location. Blocker D (RLS/security ruling) is
LARGELY resolved as a design preference (§7's SECURITY INVOKER
ruling) but not yet implemented/tested. Blocker E (repository RPC
abstraction) does not exist yet but is NOT itself a blocker — it is
buildable the moment B/C are resolved, per §8's contract.

**Standing rule reaffirmed:** no patch may be authorized that assumes
an RPC exists in production, or that a new migration can be safely
authored against this repo's `migrations/` folder, without the owner
first resolving the BASELINE.md reconciliation (or explicitly
accepting and documenting the drift risk in writing). This is now a
CONCRETE, owner-actionable blocker (start Docker Desktop, provide the
DB password, run the five documented `BASELINE.md` steps) rather than
a vague "no tooling" statement.

## 10. Runner-hardening assessment (bind, reassessed)

The GENUINE `page/context/browser closed` setup-authentication
signature (setup/auth project, browser/context/page closed, product
spec not yet started, clean retry succeeds) has now been observed
across FOUR independent review occurrences (090, 091, 092 reviews) —
always self-recovering on one retry, never matching the bound
`AUTH-EXPIRY` signature. This is explicitly DISTINCT from the
`ERR_CONNECTION_REFUSED` seen ONCE at the 093 review, which was
proven to be reviewer/operator error (the dev server had been
stopped) and has NOT recurred since (the 094 review deliberately kept
the server running throughout and saw zero incidents). **This
signature is now closer to "ready for a bounded one-retry rule"** —
re-ranked from LOW to MEDIUM this census — but is still NOT selected
for this patch: comment work is closed, move design is more valuable
right now, and a hardening patch deserves its own focused review
rather than being bundled here. If a future patch selects this, the
exact bound retry rule (per the standing Task 10 conditions) must
require: (a) failure in the `setup`/`auth.setup.ts` project
specifically; (b) an exact `browser/context/page closed` error-text
match; (c) the failure occurs BEFORE any product spec starts; (d)
maximum ONE retry; (e) full disclosure of the first-run failure in
every report; (f) explicit exclusion of `ERR_CONNECTION_REFUSED`,
any server-unavailable condition, and any failure occurring after a
product spec has already started, from ever triggering the retry.

## 11. Remaining strict-caller census (bind, re-confirmed unchanged)

Re-searched `DrawingLayout.tsx` at this HEAD — no change from the 093/
094 census: the move-write non-strict `onUpdatePadlet` calls at
~522/531 are exactly candidate #1 above (this patch's subject, not a
separable "remaining caller"); the intentionally best-effort
position-write calls at ~956/966 remain DEFER-by-design per 088 §4,
unchanged. No new un-flagged silent-loss caller was found anywhere in
`DrawingLayout.tsx`. The comment EDIT caller has been on the strict
channel since 092 and is fully proven end-to-end by 094 — it is not
a remaining candidate.

## 12. Comment edge-case status (bind, assessed but not authorized)

Shift+Enter (#20) and empty/whitespace-only edit text (#21) are both
small, NOT proven broken, and smaller in scope than the move design
work. Per Task 12's own conditions (user-visible, clear product
contract, real UI reachable, no injection needed, AND smaller/more
important than move design) — the LAST condition fails: move design
is the higher-priority item this census. Neither is authorized this
patch; both remain available as small future diagnosis candidates if
the owner wants them prioritized ahead of move-design implementation.

## 13. PATCH-081 and other deferred items (bind — unchanged)

`PATCH-081`: kept `RETIRED-BY-NOTE`, no action. Frame/sidebar sync,
line-follow behavior, uploaded-image storage cleanup, AI images in
presentation, overlap fallback, and Connections side-panel planning
all remain deferred, unchanged, absent new proof. **Connections
feature implementation is explicitly NOT begun during stabilization.**

## 14. Immutable fences (bind — reaffirmed unchanged set, 47, for
continuity into any future implementation patch)

This patch makes zero code changes, so there is nothing new to fence
FROM this patch. The list below is the PATCH-094 fence set (46) PLUS
the newly-landed PATCH-094 spec itself (now must stay unchanged going
forward) = **47**, reaffirmed here so a future implementation patch
inherits an unbroken chain of verified continuity rather than
re-deriving it from scratch.

```text
playwright.config.ts                                           5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                             9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx                  02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                     b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx             655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/menus/LineContextMenu.tsx               aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                           e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                      2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                                f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                        b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                    ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                    7d6b6ee6e127a0db8161c09afdf31a54f44ac575
lib/infra/collabboard/clonedPostMetadata.test.ts               5b53e839d66e399c1357a7656109496c65a2e5d1
components/collabboard/canvas/hooks/useCanvasActions.ts        b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
components/collabboard/canvas/hooks/useCanvasData.ts           2e158f1278a395b5028083e8f387a22e4daf5b60
lib/domain/canvas/posts.ts                                     5af51ef0cec14c014072529eda673e81a87c4b8b
lib/infra/canvas/postsRepository.ts                            3a74731730ef047f023465dd65d86700fe878e74
app/dashboard/canvas/[id]/CanvasClient.tsx                     a028dd65c1935068a7206a67db869a8f5345011a
components/collabboard/RowColumnContainerCard.tsx              e58167d51324ef9bf9d928251ad91d60756616a7
e2e/characterization/drawingBridgeHarness.ts                   7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts              6bbd6deb83106d38a0a524253ee95ac3f6bdaa2f
e2e/characterization/drawing-line-bridge.spec.ts               7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts               87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts           5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts         50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts         fc20ef8160417b6eeb59f4662ab89ceb1af5a167
e2e/characterization/drawing-slide-rename-state.spec.ts        513d07bfe99898455d13d7048a53da90c3b5d401
e2e/characterization/drawing-slide-add-dup-persistence.spec.ts 9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e
e2e/characterization/drawing-duplicate-clone-shape.spec.ts     147ae0aeae503a36fd5e8e42d6cd3045b34b38c3
e2e/characterization/drawing-duplicate-divergence.spec.ts      5d3cccb693f57022c9e9aa44522bee6f59552332
e2e/characterization/drawing-save-supersession.spec.ts         c6cc4feaa6f2320932232a993b70cda73c9e584c
e2e/characterization/drawing-save-wire.spec.ts                 280d37545e9d638c5eb8d883ffa99beefa5da308
e2e/characterization/drawing-duplicate-persistence.spec.ts     b0ab5ea55195e3aab5a43aa8e73e88cd136723f4
e2e/characterization/drawing-duplicate-deep-clone.spec.ts      0644447cc2bea1b21c9b47ba03b7d69de2617fb7
e2e/characterization/drawing-container-drop.spec.ts            32750636c1146f5bf8da3e7f9987838b26c5169b
e2e/run-carried-groups.mjs                                     6a04d94e6bcc71fdd6e647f5961707607ad1317d
e2e/characterization/drawing-container-link.spec.ts            07ec5ad379e53b11764c0ac7fd48a26ae4e365a3
e2e/characterization/drawing-comment-persistence.spec.ts       c8b32bc2ba7c8b34b8e5a8279a693e0736411bcf
components/collabboard/canvas/layouts/DrawingLayout.tsx        ad4e8fd56fee633cd6322352f8a8d6310ca7e823
e2e/characterization/drawing-comment-strict-persistence.spec.ts f57b46ccf913244f85cbc206f70f6da34d439db6
components/collabboard/CommentRow.tsx                          4d9774a1030d67d67f192d97b81e7c56770fa02e
components/collabboard/editors/CommentEditor.tsx               e135acddbf067b0a63ada6f1a0412a5ac1361e0b
components/collabboard/EmbeddedCommentList.tsx                 7d116a289efa10a58a1a7f1d036f5e5b0db30e00
e2e/characterization/drawing-comment-edit.spec.ts              cdc90628ecdb12e70e5fa41d444688d1b3ccb481
e2e/characterization/drawing-comment-edit-save.spec.ts         7e7d8e05ef8203b87e011a16acfcdc912a7dbc70
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 47; unique paths = 47; unique path/blob pairs = 47;
duplicates = 0; malformed = 0. This count (47) is used consistently
in this header, §14, and the hard-stop list (§16) — no other count
appears anywhere in this document.

## 15. Exclusions (bind)

Do not combine any future implementation patch with: dedicated
drag-handle affordance (must follow, not precede, atomicity); comment
persistence changes; broad error migration; frame/sidebar;
line-follow; storage cleanup; AI images; overlap fallback; Connections
side-panel feature work; auth infrastructure changes; deep-clone
work; PATCH-081 cleanup. Do not revive
`e2e/characterization/drawing-slide-persistence.spec.ts` or
`.fable5/patches/PATCH-077-draft.md`.

## 16. Hard stop conditions (bind)

STOP immediately, report, do not authorize implementation, if:

- any production or migration code is proposed under THIS patch
  number (PATCH-095 is design-only, permanently);
- a move affordance is exposed before atomic persistence is deployed
  and verified;
- a migration is deployed on the assumption it exists in production
  without the owner having resolved §9's blockers or explicitly
  documented acceptance of the drift risk;
- `SECURITY DEFINER` is introduced without a fresh, explicit review
  (the §7 default is `SECURITY INVOKER`);
- a future implementation patch's authorization is unclear on
  cross-board authorization (this contract is same-board only);
- client-side compensation is proposed as a substitute for backend
  atomicity (the whole point of this design is to REMOVE the need for
  compensation, unlike 090's create-and-append case);
- comment work re-enters scope under a move-design successor patch,
  or vice versa;
- any future runner-hardening patch's retry rule would mask
  server-unavailable or product failures (§10's exact conditions must
  hold);
- `canvas_comments` enters scope;
- PATCH-089 through PATCH-094 evidence would need to be weakened to
  justify anything in this patch;
- the §14 fence count disagrees between the raw block, the header,
  and this hard-stop list;
- `.fable5/patches/PATCH-096.md` exists before this patch is closed.

## 17. Review and closure flow (bind)

This patch has no code to implement or run. The independent read-only
reviewer verifies: (a) the §4/§7/§8 contract is internally consistent
and does not contradict any carried evidence from 089–094; (b) zero
production, spec, harness, config, or migration files were touched by
this patch (a `git diff --name-only` against the authoring HEAD shows
ONLY the two governance files); (c) the §14 fence count is
programmatically correct (47/47, matching base and HEAD); (d) no
`.fable5/patches/PATCH-096.md` exists. No live Playwright execution is
required or expected for this patch's own content — the reviewer MAY,
at their discretion, re-run a subset of the 089–094 carried gates
purely to reconfirm continuity, but this is not a PASS/FAIL condition
for PATCH-095 itself. The CTO closes this patch once the independent
reviewer's PASS is recorded and the owner has read §9's deployment
blockers.

## 18. Required final report

Confirmation that zero code/spec/production files changed; the exact
§9 blocker classification and evidence; the §7/§8 contract summary;
47/47 fence result; explicit confirmation that no implementation was
authorized or performed; confirmation `PATCH-096.md` is absent.
