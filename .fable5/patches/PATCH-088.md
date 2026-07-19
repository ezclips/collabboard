# PATCH-088 — Carried-Suite Grouped Runner with Auth-Expiry Classification (Test Infrastructure)

**Status:** **DONE** — landed as commit
`22d3f1fc18cfbed3ffad372ed67aa71de8d0cfab`
(`test(e2e): grouped carried-suite runner with auth-expiry classification (PATCH-088)`),
independent read-only review PASS; closure record in §12. Test
infrastructure ONLY. ONE new runner script (345 lines). NO
application-source change, NO product-auth semantic change, NO
Playwright-config change, NO harness change, NO spec change, NO
package/lockfile change.
**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`ba0c8f904d71f255045261497bf2803698ac206f`
(`fix(drawing): surface content-save failures via strict update channel (PATCH-087)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): grouped carried-suite runner with auth-expiry classification (PATCH-088)`

---

## 0. Census at authoring (2026-07-19, from `ba0c8f9`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Long-batch auth-token expiry (test infra)** | infra FIX | **SELECTED (this patch)** — recurring, deterministic, measured cost (every full-batch invocation >~5 min fails its tail with the `Back to Dashboard` signature; reproduced across 085/086/087 cycles, 10+ incidents); mechanism proven (setup runs ONCE per invocation, token outlives long batches); grouped short invocations each re-run setup and empirically always pass |
| 2 | Container-drop caller cluster (DrawingLayout ~307/487/496/520: non-atomic childPadletIds/parentId writes, per-site silent catches, orphaned-child divergence on reload) | defect family (production) | NEXT production patch — needs a bounded per-cluster design ruling (write ordering, compensation like 086, failure surface); the §4 caller table below is the bound census |
| 3 | Comments caller (DrawingLayout ~1939 `handleUpdateChildComments`: comment content lost on reload if write fails, silent) | defect (production) | HIGH severity but entangled with the comment-store duality (planned Phase 3 migration — do NOT fix opportunistically); after #2 with a store-aware ruling |
| 4 | Position-save callers (~932/942, 800 ms debounce) | intentionally best-effort | high-frequency, reload self-corrects; strict migration would risk log spam on transients; DEFERRED by design ruling |
| 5 | Broader Result/throw contract consistency (incl. seven-site canvas-ops family) | design | later dedicated patch |
| 6 | PATCH-081 disposition | RETIRED-BY-NOTE (ruled at 087 census) | keep spec untouched/green; deep-clone spec is authoritative; no action |
| 7 | Frame/sidebar geometry/position sync | no characterized defect | 079/080 green post-085/086; diagnosis-first IF a user repro appears |
| 8 | Line-follow | hardening | deferred |
| 9 | Uploaded-image storage cleanup | hardening | deferred |
| 10 | AI images in presentation | feature | deferred (fixture-blocked) |
| 11 | Overlap fallback | hardening | low, deferred |
| 12 | Connections side-panel planning | feature | deferred |
| 13 | UI/persistence divergence + duplicate-report semantics after optimistic failure | design (production) | folded into #2/#5 rulings |
| 14 | New defect exposed by 087 | — | NONE (review PASS; healthy runs show no save-error substring) |

Option ruling (Task 5 of the closure protocol): production next-step
is **B-then-A** (the §4 caller table IS the census; the
container-drop cluster is the next production fix candidate) — but
neither cluster is fix-ready WITHOUT a design ruling, while the
infra defect is fully mechanism-proven and bounded. Hence OPTION C
(infra) now; container-drop cluster is the leading PATCH-089
candidate.

## 1. Exact infrastructure defect (bind — mechanism proven)

`playwright.config.ts` runs the `setup` project ONCE per
invocation (project dependency); `auth.setup.ts` logs in via the
real `/auth` UI and stores state at `AUTH_STATE_PATH`; the
`characterization` project reuses that storage state for the WHOLE
invocation. The stored session outlives only short invocations:
in every full-batch run (12–14 specs, 8–17 min) the token expires
mid-batch and every subsequent `openDrawingBoard` fails at
`getByTitle('Back to Dashboard')` (90 s timeout) — the alphabetical
head of the batch passes, the tail fails (proven at the 085 review:
first four files green, everything after fails; 10+ recorded
incidents across 083–087). These failures LOOK like product
regressions and have repeatedly consumed review time. The
empirically-sanctioned recovery — fresh `--project=setup` + short
per-spec reruns — works EVERY time because each short invocation
gets a fresh token.

## 2. Authorized fix (bind — Task-6 OPTION D, narrowly: grouped
invocations + explicit classification)

ONE NEW file: `e2e/run-carried-groups.mjs` (absence-gated). A plain
Node script (no new dependencies, spawn `npx playwright test`) that:

1. runs the FOURTEEN carried specs as BOUNDED SEQUENTIAL GROUPS,
   each group its own Playwright invocation (hence its own fresh
   `setup` login). Grouping bound: every group ≤ 4 spec files AND
   expected wall time ≤ ~4 minutes (implementer chooses the exact
   grouping from observed durations and RECORDS it in the script as
   a literal list; heavy specs — save-wire, save-supersession,
   duplicate-persistence, deep-clone, line-bridge — get small
   groups);
2. requires `PW_BASE_URL` (refuses to start otherwise — never
   triggers the config webServer); passes it through unchanged;
3. detects the EXACT auth-expiry signature in a failed group's
   output (`Back to Dashboard` + `Timeout` from
   `drawingBridgeHarness` `openDrawingBoard`): on signature match,
   prints an explicit
   `AUTH-EXPIRY (INFRASTRUCTURE, not a product failure)`
   classification, re-runs `--project=setup`, and retries THAT
   GROUP exactly ONCE. The incident is reported in the final
   summary EVEN IF the retry passes (never hidden);
4. any failure WITHOUT the signature: NO retry — fail immediately
   and loudly with the group's output (real product failures are
   never masked; no product-action retries — the retry unit is a
   test invocation, the automated equivalent of the long-sanctioned
   manual recovery);
5. prints a final per-group totals table + overall verdict; exits
   non-zero unless EVERY group meets its bound totals;
6. logs NO credentials, NO headers, NO cookies, NO storage-state
   contents; leaves NO artifacts (any temp output files deleted;
   test-results/ cleaned on success per existing conventions).

PROHIBITED: modifying `playwright.config.ts`, `auth.setup.ts`,
`e2e/helpers/env.ts`, the harness, ANY spec, ANY production file,
or `package.json`/lockfile; adding dependencies; more than one
retry per group; retrying on non-signature failures; infinite
loops; changing product auth behavior; capturing auth material.

## 3. Bound semantics (acceptance meaning of "fixed")

- One `node e2e/run-carried-groups.mjs` invocation (with
  `PW_BASE_URL` set, self-started dev server) completes the FULL
  carried set green with ZERO manual intervention.
- If expiry occurs inside a group, it is classified explicitly as
  infrastructure, recovered by the sanctioned refresh, retried
  once, and REPORTED; it can no longer masquerade as a product
  regression.
- Real product failures fail the runner immediately and are never
  retried or reworded.
- Runtime is comparable to or better than the historical
  batch-fail-recover-rerun cycle (record before/after wall times).

## 4. Bound caller census (recorded evidence for the NEXT
production patch — NOT in scope here)

Non-strict `onUpdatePadlet` callers in `DrawingLayout.tsx` at blob
`a2fb3ae…` (all: optimistic-local-first, failure currently
invisible to the caller, hook-level silent rollback ⇒ reload can
diverge from visible state):

| Site | Line | User action | Fields | Risk | Ruling |
|---|---|---|---|---|---|
| 1 | ~307 | library-item drop into container card | container `childPadletIds` append | HIGH — created child row orphaned on reload; site's own `catch { /* silent */ }` would swallow even a strict throw | cluster fix with #2/#4 (create-then-append pattern) |
| 2 | ~487 | drag existing card into container (step 1) | container `childPadletIds` append | HIGH — child vanishes from container on reload | cluster fix; NON-ATOMIC with step 2 |
| 3 | ~496 | same drop (step 2) | child `parentId` | HIGH — pairs with #2; partial failure leaves half-linked state | cluster fix |
| 4 | ~520 | draft drop into container | container `childPadletIds` append | HIGH — created row orphaned | cluster fix |
| 5 | ~932 | card drag (800 ms debounced position save) | `position_x/y` | LOW-MED | intentionally best-effort (high-frequency; reload self-corrects); DEFER |
| 6 | ~942 | locked position save (sync-side) | `position_x/y` | LOW-MED | same; DEFER |
| 7 | ~1939 | add/edit/delete comment (`handleUpdateChildComments`) | `metadata.comments` / `detachedComments` | HIGH severity | store-duality entangled (Phase 3); separate ruling after the cluster |

## 5. Allowed files (bind)

| File | Role | Starting state at base `ba0c8f9` |
|---|---|---|
| `e2e/run-carried-groups.mjs` | NEW test-infra runner | absent at base (absence gate) |

ONE file. Absence gates: the runner path absent at base and
worktree before implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-089 not started.

## 6. Immutable fences (bind — 36, Git blob IDs)

Verify each with `git rev-parse ba0c8f9…:<path>` and equality at
the current governance HEAD. Blob-ID method only. The 087 fence set
PLUS `DrawingLayout.tsx` at its landed blob (NOTHING may touch
production in this patch).

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
components/collabboard/canvas/layouts/DrawingLayout.tsx        a2fb3aebf0f66967c40c1765b5bf69b2e853d05c
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
```

## 7. Expected totals (bind)

Runner acceptance: ONE full runner invocation green — all 14
carried specs at their bound per-spec totals, per-group table
printed, zero manual intervention; any auth-expiry incident
classified + reported; recorded before/after evidence (the
historical single-invocation failure signature may be cited from
the 085–087 records; a fresh reproduction is OPTIONAL). Plus one
demonstration that a real (non-auth) failure is NOT retried is NOT
required to be produced live — reviewer verifies the branch by
inspection. Deterministic: helper 7/1; sanitizer 9/1; focused
drawing 59/2; full Vitest **448/43** (the runner adds no vitest
targets); `git diff --check`/tsc/boundaries/sequential verify+build
green; the runner is NEVER imported by production code
(boundaries + import grep unaffected); 36/36 fences. Cleanup zeros
across the TWENTY-NINE tracked prefixes; no auth/test artifacts
(storage state stays gitignored and untracked).

## 8. Environment contract (binding)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`
(the runner REFUSES to run without it); port discipline (3000, and
4000 if used, freed after); auth refresh only via
`--project=setup`; no credential contents anywhere (runner output
included); passive observation only; sequential `verify`/`build`,
never under a dev server; never commit generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (36/36), or any §5 absence gate differs;
- the runner requires touching config/harness/setup/spec/production
  or package files, or a new dependency;
- correct behavior requires more than ONE retry per group, or
  retrying a non-signature failure;
- the signature detection cannot be made specific enough to avoid
  misclassifying a real product failure (report evidence);
- any carried spec's bound totals cannot be met through the runner
  without spec changes;
- credentials or auth material would appear in any output.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diff + report (runner
source; grouping rationale with observed durations; the green
full-runner log summary — totals only, no sensitive content;
deterministic totals; fence result; cleanup proof). The independent
read-only reviewer re-derives everything, audits the
signature/retry/masking branches by inspection, runs the runner
once independently, and must return an explicit PASS before the
implementer commits with the bound message and pushes. CTO closes
with a fresh census.

## 11. Required final report

Exact one changed path + final blob; full runner source review
summary; grouping table + durations; incident classification
behavior (observed or by inspection); carried per-spec totals via
the runner; deterministic totals; 36-fence result + absence gates;
cleanup across twenty-nine prefixes; explicit confirmations (no
config/harness/spec/production/package change, ≤1 retry per group,
non-signature failures never retried, no auth material in output);
commit hash + push status after PASS.

## 12. Closure record (CTO, 2026-07-19)

**Landed:** commit `22d3f1fc18cfbed3ffad372ed67aa71de8d0cfab`,
ONE new file `e2e/run-carried-groups.mjs`, blob
`6a04d94e6bcc71fdd6e647f5961707607ad1317d` (345 lines).
**Independent read-only review: PASS.**

**Infrastructure problem (final):** long carried invocations reused
one setup-created auth state; later specs outlived it; failures
appeared as route-readiness timeouts at
`getByTitle('Back to Dashboard')` and were repeatedly misread as
possible product regressions; sanctioned setup refresh + shorter
reruns always restored the specs. Test infrastructure, not
application behavior.

**Runner behavior (final):** plain Node ESM, no new dependency;
REQUIRES `PW_BASE_URL` (exits non-zero when missing, never invents
a default); runs EXACTLY the 14 bound carried specs as 14
sequential one-spec groups, each its own Playwright invocation
(first run preserves the normal setup dependency), one worker, no
concurrency; invokes `node_modules/playwright/cli.js` via
`process.execPath`.

**Auth-expiry classifier (final):** classification
`AUTH-EXPIRY (INFRASTRUCTURE)` requires ALL bound evidence —
timeout marker + locator/wait context +
`getByTitle('Back to Dashboard')` + `drawingBridgeHarness.ts`/
`openDrawingBoard` context. It does NOT classify on: any timeout,
any navigation failure, any login page, any 401, or any failed
test. **Retry behavior:** only exact-signature failures eligible;
ONE setup refresh max; ONE group retry max (via `--no-deps`); no
recursion, no infinite loop, no retry of non-signature failures; a
failed retry remains a failure; the incident is reported even when
recovery succeeds. **Security/output:** no credentials, cookies,
authorization headers, environment dumps, or auth-state contents in
any output; all 14 specs accounted for; per-group results emitted;
correct final exit status; the runner performs NO database cleanup
(cleanup stays spec-owned).

**Verification (final accepted run):** 14 groups / 14 specs
accounted for / 14 groups passed FIRST TRY / 0 auth-expiry
incidents / 0 non-signature failures / exit 0. An earlier oversized
grouping naturally exercised the bounded branch: exact signature
classified as infrastructure, one setup refresh, one retry, the
retry's failure REMAINED a failure and the runner stopped without
masking it — the classifier and the no-masking contract are proven
by observation, not only inspection. Deterministic gates:
diff-check, tsc, boundaries, slideOrder 7/1, clonedPostMetadata
9/1, focused drawing 59/2, full Vitest **448/43**, verify,
standalone build — all green. Scope/cleanup: exactly one new file,
no existing file changed, no dependency added, production import
audit clean, no artifacts, ports 3000/4000 free, no repo-owned
runtime process.
