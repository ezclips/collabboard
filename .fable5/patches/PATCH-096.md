# PATCH-096 — Bounded PATCH-088 Setup-Close Runner Hardening

**Status:** **DONE** (commit
`cb296448440cef1c076e1861796c6ca928b046ed`). ONE modified file:
`e2e/run-carried-groups.mjs`. No production file was touched. No
test spec was touched. No migration, RPC, or move work entered
scope. No auth-expiry classification logic was weakened.

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer — **PASS**, obtained before commit.
**Closure:** Sonnet (CTO), permanent governance owner as of
2026-07-21 (see role-assignment note in CURRENT_TASK.md — replaces
the prior "Fable (CTO)" persona used through PATCH-095).

**Behavioral/source base commit AND implementation start HEAD (bind):**
`75fd669189e62dcc56aeda9d1c1ba87fcec54194`
(`docs(fable): close PATCH-094 and authorize PATCH-095`; HEAD ==
origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`fix(e2e): bound one retry for genuine setup browser/context-close failures (PATCH-096)`

---

## 0. Fresh census (2026-07-21, from `75fd669`)

| # | Candidate | Class | User-visible impact | Deterministic repro | Coverage | Owner | Fix-ready? | Files | Ruling needed | Arch risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Bounded PATCH-088 setup browser/context/page-close hardening** | infra reliability, precisely classifiable | none (test-infra only) — the *symptom* (an aborted 14-group run) is reviewer-visible, not user-visible | genuine signature observed across FOUR independent prior reviews (090/091/092 runner reviews); not reproducible on demand but the signature itself is stable and distinct from every other known failure class | `e2e/run-carried-groups.mjs` currently has ZERO detection for this signature — only the 4-part `AUTH_EXPIRY_SIGNATURE` is checked; this exact flake is currently misfiled as a generic "non-signature failure" that aborts the whole run | `e2e/run-carried-groups.mjs` | **FIX-READY — SELECTED (this patch)**: the signature is precisely boundable (setup-project-only + exact error text + absence of any `[characterization]` line + explicit exclusion of `ERR_CONNECTION_REFUSED`/auth-expiry) | 1 | none beyond the bound signature in §2 | LOW — pure JS classification logic, no product code touched | **P0** |
| 2 | Another user-visible non-strict mutation | see §8 census below | see §8 | see §8 | see §8 | `DrawingLayout.tsx` (unchanged since 092) | no new candidate found beyond the two already-ruled-on families (move-write, position-write) | — | — | — | folded into §8, no new item |
| 3 | Position-write best-effort family | design, intentional | none — deliberately best-effort per 088 §4 | n/a | 088 §4 ruling, re-confirmed | `DrawingLayout.tsx` ~956/966 | DEFER by design (unchanged) | — | — | — | deferred |
| 4 | Result-versus-throw consistency (repo-wide) | design | none directly | n/a | none | multiple | later dedicated contract patch | — | one repo-wide convention ruling | MEDIUM | deferred |
| 5 | Empty comment EDIT behavior | small UX question, NOT proven broken | `handleSaveEdit` silently leaves edit mode open on empty trimmed text (source-confirmed, 094 §1); no product requirement documented that this must change | reachable, small scope | source-confirmed only | `CommentRow.tsx` (unchanged) | diagnosis-first if ever selected; NOT selected this patch — no clear product requirement, smaller than runner hardening | — | needs a real UI probe AND a product-contract decision if ever prioritized | LOW | deferred, no product requirement yet |
| 6 | Whitespace-only comment EDIT behavior | small UX question, NOT proven broken | same mechanism as #5 (`getText().trim()` empty guard) | reachable, small scope | source-confirmed only | `CommentRow.tsx` (unchanged) | same as #5 | — | same as #5 | LOW | deferred, folded with #5 |
| 7 | Shift+Enter behavior | small UX question, NOT proven broken | 094 recorded `not-attempted-within-bound-scope`; still unobserved at runtime | reachable, small scope | none | `CommentRow.tsx` (unchanged) | diagnosis-first if ever selected; NOT selected this patch | — | needs a real UI probe if ever prioritized | LOW | deferred |
| 8 | Blur-without-Enter behavior | small UX question, PARTIALLY characterized | `onBlur` auto-saves per source (094 §1); a blur-only (no Enter) save path was never isolated from the Enter path at runtime — 094 always used `Enter`, never tested blur alone | reachable, small scope | source-confirmed only (094 §1's `onBlur` finding) | `CommentRow.tsx` (unchanged) | diagnosis-first if ever selected; NOT selected this patch — no proven defect, smaller than runner hardening | — | needs a real UI probe if ever prioritized | LOW-MEDIUM — shares the same double-invocation family already characterized-and-not-reproduced in 094 | deferred |
| 9 | Rapid repeated Enter behavior | small UX question, NOT proven broken | source shows `handleSaveEdit` is called synchronously per keypress; 094 never drove two rapid Enters in the same edit session | reachable, small scope | none | `CommentRow.tsx`/`EmbeddedCommentList.tsx` (unchanged) | diagnosis-first if ever selected; NOT selected this patch | — | needs a real UI probe if ever prioritized | LOW | deferred |
| 10 | Comment persistence rejection after synchronous edit-mode close | characterized design risk, NOT a proven defect | 094 §17/§19 already ruled: no fix authorized absent a real proven failure; failure injection remains prohibited | not reproducible without injection, which is prohibited | 094 §17 closure ruling | `EmbeddedCommentList.tsx` (unchanged) | already resolved — no further action needed | 0 | none | LOW | resolved, no action |
| 11 | Atomic move deployment-readiness follow-up | infra/process gap, unchanged | none directly — blocks #12/#13 | n/a — re-verified this census: Docker still not running, `supabase/BASELINE.md`'s reconciliation still unresolved, no new owner evidence supplied since 095's closure | 095 §19 closure ruling, unchanged | repo owner | **owner decision required — unchanged, still blocked** | 0 | owner must supply the nine prerequisites enumerated in 095 §19 before implementation can be considered | HIGH if bypassed | P1 (gates #12), unchanged |
| 12 | Atomic move implementation | defect family (production) | moves can strand duplicate-parent/orphan half-states | affordance not drivable (089); persistence path statically proven non-atomic | 089 diagnosis green; full design bound in 095 | new Postgres RPC + repo/adapter/hook + `DrawingLayout` rewire | **NO — blocked on #11, unchanged** | ~4-5 files | none further needed — 095's contract is complete and ready the moment #11 clears | HIGH | P1 (blocked on #11) |
| 13 | Dedicated drag-handle affordance | UI feature | move stays inaccessible until #12 lands | n/a | none yet | `RowColumnContainerCard.tsx` | prohibited before #12 (090/091/095 rulings, unchanged) | — | — | — | deferred with #12 |
| 14 | Existing-card move regression (E2E) | test coverage gap | none directly — this is a future regression spec, not a current defect | n/a — blocked, needs the RPC to exist first | 095 §19 test-layer ruling: BLOCKED today | future spec | blocked with #12 | — | — | — | deferred with #12 |
| 15 | Frame/sidebar synchronization | no characterized defect | none observed | no repro | 079/080 green | — | n/a | — | — | none | deferred |
| 16 | Line-follow behavior | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 17 | Uploaded-image storage cleanup | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 18 | AI images in presentation | feature | n/a | fixture-blocked | none | — | n/a | — | — | none | deferred |
| 19 | Overlap fallback | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 20 | Connections side-panel planning | feature | n/a | n/a | none | — | n/a | — | — | none | deferred — **explicitly NOT begun during stabilization** |
| 21 | PATCH-081 | governance | none | n/a | RETIRED-BY-NOTE | — | n/a | — | — | none | no action, held |
| 22 | New issue exposed by PATCH-095 | — | none — 095 was documentation-only, zero code changed | — | — | — | — | — | — | — | NONE |

## 1. Runner ownership and signature investigation (read-only, bind)

Re-inspected `e2e/run-carried-groups.mjs` (unchanged, blob
`6a04d94e6bcc71fdd6e647f5961707607ad1317d`) and `playwright.config.ts`
(unchanged, blob `5864c98436dde10809de67cb40c564c05e98ff6d`) at this
base.

**Confirmed:**
- `playwright.config.ts:27-46` — the `characterization` project has
  `dependencies: ['setup']` (line 44); the `setup` project's
  `testMatch` is `/auth\.setup\.ts/` (line 30). Playwright therefore
  ALWAYS runs `[setup] › auth.setup.ts` before any `[characterization]`
  spec on a dependency-mode invocation (i.e. `runGroup(group)` without
  `--no-deps`).
- `run-carried-groups.mjs:80-133` (`AUTH_EXPIRY_SIGNATURE`,
  `detectAuthExpiry`) — the ONLY currently-detected signature requires
  ALL FOUR of: a timeout marker, a locator/wait marker, an EXACT
  `getByTitle('Back to Dashboard')` marker, and a harness/
  `openDrawingBoard` marker. This signature describes a DIFFERENT
  failure mode entirely (an authenticated session expiring mid-test,
  causing a redirect back to the dashboard) — it does NOT match the
  genuine `page/context/browser closed` setup-authentication failure
  observed across 090/091/092's reviews at all (no "Back to Dashboard"
  text, typically no timeout regex match either).
- `run-carried-groups.mjs:244-275` (`main`'s per-group loop) — if the
  first run fails AND `detectAuthExpiry` returns false, the failure is
  counted as a "non-signature failure" (`nonSignatureFailures += 1`)
  and — critically — the loop's outer `if (!finalPassed)` check
  (line 300) STOPS THE ENTIRE 14-GROUP RUN immediately, with no retry
  attempted at all. This means EVERY occurrence of the genuine
  browser/context/page-close flake, wherever it happens to land among
  the 14 groups, currently aborts the whole carried-suite run.
- `run-carried-groups.mjs:145-199` (`runPlaywright`) — captures raw
  combined stdout+stderr into a single `output` string per invocation;
  this is sufficient to text-match against, but the current code does
  NOT distinguish which PROJECT (`setup` vs `characterization`)
  produced a given failure — that must be added as new detection
  logic, not inferred from existing structure.
- Confirmed from prior review transcripts (090/091/092 reviews, not
  re-derived here since those are historical records, not live
  re-runs) that the genuine signature's error text is consistently
  `Target page, context or browser has been closed` appearing inside
  a `[setup] › e2e\auth.setup.ts` failure block, with NO
  `[characterization]` line appearing anywhere in the same output —
  i.e., the product spec never started.

**Determination:** the exact signature IS available from current
runner output with no Playwright config change required — ONE new
detection function in `run-carried-groups.mjs`, mirroring the
existing `detectAuthExpiry` pattern, is sufficient. No regression/
unit test file is required for this session (the classification logic
is small enough that the bound live re-run of the actual 14-group
runner during review IS the acceptance test — adding a synthetic unit
test would require fabricating fake Playwright output strings, which
adds complexity without proportionate value for a 20-line pure
function); if a future patch wants a dedicated unit test, that is a
separate, smaller candidate, not required by this patch.

## 2. Exact bound signature (bind)

A failure is classified as `SETUP-CLOSE (INFRASTRUCTURE, not a
product failure)` if AND ONLY IF ALL of the following hold against
the group's first-run combined output:

1. The output contains a `[setup]` project marker (e.g. a line
   matching `/\[setup\]/`) associated with `auth.setup.ts`.
2. The output contains an EXACT error-text match for
   `/Target page, context or browser has been closed/i` (this is the
   genuine signature's literal message — NOT a looser pattern).
3. The output does NOT contain any `[characterization]` project
   marker line — proving the product spec never started.
4. The output does NOT already match the existing `AUTH_EXPIRY_SIGNATURE`
   (checked first, unchanged — auth-expiry classification takes
   precedence and is never weakened or reordered).
5. The output does NOT match `/ERR_CONNECTION_REFUSED/i` — this is
   EXPLICITLY EXCLUDED, since that class was proven at the 093 review
   to be reviewer/operator error (dev server not running), not a
   genuine browser/context-close event, and must never trigger this
   retry.

If ALL FIVE hold: this is a `SETUP-CLOSE` incident. Exactly ONE retry
is attempted — re-run the SAME group WITHOUT `--no-deps` (i.e. a full
fresh dependency-mode retry, since the setup project itself is what
failed and must be re-attempted, unlike the existing auth-expiry
retry which correctly uses `--no-deps` because a NEW setup-refresh
already ran separately first). If the retry ALSO fails for any
reason, the failure is disclosed in full (both the first failure and
the retry failure), the run stops exactly as it does today for any
other failure, and NO further retry is attempted.

If ANY of conditions 1-5 do not hold, the failure falls through to
the EXISTING "non-signature failure" path, completely unchanged — the
run stops immediately with no retry, exactly as today.

## 3. Bound implementation (bind)

In `e2e/run-carried-groups.mjs`:

1. Add ONE new constant, e.g. `SETUP_CLOSE_SIGNATURE`, mirroring
   `AUTH_EXPIRY_SIGNATURE`'s structure but encoding the §2 conditions.
2. Add ONE new function, e.g. `detectSetupClose(output)`, checked
   ONLY when `detectAuthExpiry(output)` is false (auth-expiry keeps
   absolute precedence, unchanged, unweakened, checked first exactly
   as today).
3. In the per-group loop, add an `else if` branch: if
   `detectSetupClose` is true, log `SETUP-CLOSE (INFRASTRUCTURE, not a
   product failure)`, run exactly ONE retry of the SAME group (full
   dependency mode, no `--no-deps` — re-attempting `[setup]` fresh),
   and set `finalPassed`/`finalCode` from that single retry's result.
   Track a NEW counter, e.g. `setupCloseIncidents`, separate from
   `authExpiryIncidents` and `nonSignatureFailures`.
4. If the retry passes: increment a NEW `recoveredSetupCloseIncidents`
   counter (kept separate from the existing `recoveredIncidents`,
   which remains auth-expiry-only, unchanged).
5. If the retry fails: disclose the retry's full failure output
   (reusing the existing `printFailureOutput` helper, unchanged), and
   the run stops exactly as it does today for any unresolved failure.
6. Extend `printSummary` to report `Setup-close incidents:` and
   `Groups recovered after setup-close retry:` as NEW, SEPARATE lines
   from the existing `Auth-expiry incidents:`/`Groups recovered after
   sanctioned refresh:` lines — auth-expiry and setup-close totals
   must NEVER be merged into one count.
7. `assertConfiguration()` (lines 91-119), the 14-spec/14-group
   binding, the `GROUPS` array, and every other existing check remain
   byte-unchanged.

**Explicitly prohibited implementation choices (bind):** no change to
`AUTH_EXPIRY_SIGNATURE` or `detectAuthExpiry`'s existing four-part
check; no merging of the new counter into any existing counter; no
raising the retry limit above ONE for either signature; no removing
or loosening the `ERR_CONNECTION_REFUSED` exclusion; no change to
`playwright.config.ts`, `auth.setup.ts`, or any characterization spec.

## 4. Allowed files (bind)

| File | Role | Starting state at base `75fd669` |
|---|---|---|
| `e2e/run-carried-groups.mjs` | runner hardening (bounded, one new detection + one new retry branch) | blob `6a04d94e6bcc71fdd6e647f5961707607ad1317d` |

ONE file total. NO production file. NO test spec file. NO config
file. NO migration. **Absence gates:** `.fable5/patches/PATCH-097.md`
not started; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree (re-verified at this authoring — confirmed
absent).

## 5. Immutable fences (bind — count verified programmatically below)

Verify each with `git rev-parse 75fd669:<path>` and equality at the
current governance HEAD. Blob-ID method only. The 095/094 fence set
(47) MINUS `e2e/run-carried-groups.mjs` (now MOVED to §4, allowed —
it is the one file this patch may change) = **46**.

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
raw entries = 46; unique paths = 46; unique path/blob pairs = 46;
duplicates = 0; malformed = 0. This count (46) is used consistently
in this header, this section, the hard-stop list (§10), and the
final-report requirement (§13) — no other count appears anywhere in
this document.

## 6. Remaining strict/non-strict mutation census (bind, re-confirmed
unchanged)

Re-searched `DrawingLayout.tsx` at this HEAD — no change from the
093/094/095 census: the move-write non-strict `onUpdatePadlet` calls
at ~522/531 remain exactly candidate #12 above (blocked on #11, not
separable); the intentionally best-effort position-write calls at
~956/966 remain DEFER-by-design per 088 §4, unchanged. No new
un-flagged silent-loss caller was found anywhere in `DrawingLayout.tsx`
or any other file touched by 090-095. The comment EDIT caller has
been strict and fully proven end-to-end since 092/094.

## 7. Comment edge-case census (bind, assessed, none authorized)

Shift+Enter, empty/whitespace-only edit text, blur-without-Enter, and
rapid-repeated-Enter are all small, NOT proven broken, and have no
documented product-contract requirement forcing a change. Per Task 9's
conditions (explicit product contract required, real UI reachable, no
injection needed, must outrank runner hardening) — none meet the bar
this census: runner hardening is both higher-value (it currently
aborts entire review runs on a stable, recurring signature) and
smaller in scope. None are authorized this patch.

## 8. Atomic move status (bind, unchanged — reaffirmed)

No new owner evidence has been supplied since PATCH-095's closure.
Docker Desktop's engine remains not running; `supabase/BASELINE.md`'s
reconciliation remains unresolved; no CI validation exists; no
deployment owner has been named. **PATCH-095's design remains
authoritative and unchanged. Implementation remains fully blocked.**
No migration file may be created. No RPC may be assumed to exist. No
drag handle may be exposed. No remote linked-project action
(`db push`, `migration up`, or any other remote schema command) may
be used under this or any patch until the owner supplies the nine
prerequisites enumerated in PATCH-095 §19.

## 9. PATCH-081 and other deferred items (bind — unchanged)

`PATCH-081`: kept `RETIRED-BY-NOTE`, no action. Frame/sidebar sync,
line-follow behavior, uploaded-image storage cleanup, AI images in
presentation, overlap fallback, and Connections side-panel planning
all remain deferred, unchanged, absent new proof. **Connections
feature implementation is explicitly NOT begun during stabilization.**

## 10. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (46/46), or any §4 absence gate differs;
- ANY production file is touched;
- ANY test/spec file is touched;
- `playwright.config.ts` or `auth.setup.ts` is touched;
- the existing `AUTH_EXPIRY_SIGNATURE`/`detectAuthExpiry` logic is
  modified, weakened, or reordered relative to the new check;
- the new retry logic could match `ERR_CONNECTION_REFUSED` under any
  circumstance;
- the new retry logic could fire when a `[characterization]` line is
  present in the output (i.e., the product spec had already started);
- more than ONE retry is possible for either signature;
- the first failure's full output is not disclosed before any retry
  is attempted;
- the retry's full output is not disclosed if the retry also fails;
- any manual recovery outside the runner's own bounded logic is used;
- any migration, RPC, or move-affordance work enters scope;
- the machine-local `supabase/.temp/` linked-project state is used
  for anything;
- any remote database command is run;
- `canvas_comments` enters scope;
- PATCH-089 through PATCH-095 evidence would need to be weakened;
- more than the one bound file is touched;
- cleanup cannot reach zero for any board during the review's carried
  runs;
- any generated artifact remains after the review;
- `.fable5/patches/PATCH-097.md` exists before this patch is
  authorized to close.

## 11. Exclusions (bind)

Do not combine PATCH-096 with: atomic move implementation;
drag-handle affordance; comment persistence redesign; broad error
migration; frame/sidebar work; line-follow; storage cleanup; AI
images; overlap fallback; Connections feature work; auth
infrastructure redesign; PATCH-081 cleanup. Do not revive
`e2e/characterization/drawing-slide-persistence.spec.ts` or
`.fable5/patches/PATCH-077-draft.md`.

## 12. Environment contract and expected totals (bind)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; no credential contents; sequential `verify`/`build`,
never under a dev server; never commit generated artifacts. Expected
totals to re-verify, unchanged from 089-095: focused carried specs —
089 passed (`mixed-drop-state` preserved), 090 passed, 091 passed
(`mixed-comment-state` preserved), 092 passed, 093 passed
(`editor-mounts-and-is-drivable` + `inside-comment-row` +
`not-reachable-through-existing-harness` preserved), 094 passed
(`edit-save-consistent` preserved); deterministic: slideOrder 7/1,
clonedPostMetadata 9/1, focused drawing 59/2, full Vitest 448/43,
verify + build green. **PATCH-088 runner final accounting must
report, as separate lines:** 14 groups; 14 specs accounted for;
groups passed first try; groups finally passed; auth-expiry incidents
(separately); setup-close incidents (separately, NEW); non-signature
failures (separately). A clean run today should show 0 auth-expiry
incidents and 0 setup-close incidents (since the signature is rare
and not reproducible on demand) — the review's job is to verify the
NEW detection/retry logic is correctly wired and does not misfire on
a clean run, not to force the rare signature to occur.

## 13. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diff + report (blob
re-derived; the exact new constant/function/branch added; a clean
14/14 run demonstrating the new logic does not misfire; carried
totals; deterministic totals; 46-fence result; cleanup proof). The
independent read-only reviewer re-derives everything — including
manually verifying the new detection function's logic against the §2
conditions line-by-line — and must return an explicit PASS before the
implementer commits with the bound message and pushes. CTO closes.

## 14. Required final report

Exact one changed path + final blob; the exact new
constant/function/branch added, verified against §2/§3; a full clean
14/14 run with the new counters reporting 0/0 (or, if the rare
signature happens to occur during review, full disclosure of both
the first failure and the retry outcome); carried totals (089-094
unchanged); deterministic totals; 46-fence result + absence gates;
cleanup proof; explicit confirmations (no production file touched, no
test/spec file touched, no `playwright.config.ts`/`auth.setup.ts`
change, `AUTH_EXPIRY_SIGNATURE` logic unchanged and unweakened,
`ERR_CONNECTION_REFUSED` never matches the new retry, no migration/
RPC/move work, no linked-project state used); commit hash + push
status after PASS.

## 15. Closure record (2026-07-21)

**Landed:** commit `cb296448440cef1c076e1861796c6ca928b046ed`
(`fix(e2e): bound one retry for genuine setup browser/context-close
failures (PATCH-096)`), HEAD == origin/main at closure time. Exactly
one committed path, `e2e/run-carried-groups.mjs`, landed blob
`bf76160368a2e6b274aa379efa681021ddc55582` (verified again at
closure via `git rev-parse cb296448…:e2e/run-carried-groups.mjs`).
Independent read-only review verdict: **PASS**, obtained before
commit, per §13's bound flow.

**Diff scope (re-verified at closure):** exactly the bound §3
change — one new `SETUP_CLOSE_SIGNATURE` constant (four sub-patterns:
setup-project marker, exact `Target page, context or browser has been
closed` text, characterization-project-absence check, and the
`ERR_CONNECTION_REFUSED` exclusion); one new `detectSetupClose`
function, invoked only when `detectAuthExpiry` has already returned
false (auth-expiry keeps absolute precedence, checked first,
byte-unchanged); one new `else if` branch in the per-group loop
performing exactly one retry (full dependency mode, no `--no-deps`,
correctly re-attempting a fresh `[setup]` run since the setup project
itself is what failed); two new counters
(`setupCloseIncidents`/`recoveredSetupCloseIncidents`) tracked and
reported completely separately from the existing
`authExpiryIncidents`/`recoveredIncidents` counters — never merged;
`printSummary`'s signature and header row extended accordingly.
`AUTH_EXPIRY_SIGNATURE`, `detectAuthExpiry`, `assertConfiguration`,
`GROUPS`, `CARRIED_SPECS`, and every other prior line are
byte-unchanged.

**Live grouped-runner result (per the independent reviewer's report):**
14 groups, 14 specs, 14 final passes; auth-expiry incidents: 0;
setup-close incidents: 0; recovered setup-close incidents: 0;
non-signature failures: 0. **The rare genuine setup browser/context-
close signature was NOT naturally exercised during this review's live
run** (it remains rare and not reproducible on demand, as documented
since the 090/091/092 reviews) — the new retry branch's correctness
was validated by source inspection against the exact §2 five-condition
signature (setup-project-only AND exact error text AND absence of any
`[characterization]` line AND explicit non-match on
`ERR_CONNECTION_REFUSED` AND explicit non-match on the unweakened
`AUTH_EXPIRY_SIGNATURE`) plus a manual detector-matrix walkthrough
confirming each condition independently gates correctly, NOT by
observing the retry branch fire on a genuine live incident. This is
recorded honestly, not as a live-fire proof.

**Deterministic gates (independently confirmed):** slideOrder 7/1;
clonedPostMetadata 9/1; focused drawing 59/2; full Vitest 448/43;
`tsc --noEmit` passed; `check:boundaries` passed; `npm run verify`
passed; `npm run build` passed; `git diff --check` passed.

**Cleanup/process/artifact state:** all carried-run cleanup counts
reached zero; no `test-results/` beyond the gitignored
`.last-run.json`; no `playwright-report/`, traces, screenshots, or
scratch scripts; no repo-owned Node/Playwright process left running;
ports 3000/4000 confirmed free at review close.

**46/46 fences and all absence gates** (candidate — n/a, this patch
modified an existing allowed file rather than adding a new one — the
46-entry fence set from §5, `PATCH-097.md`, the permanently-prohibited
paths, and `drawing-slide-persistence.spec.ts`/`PATCH-077-draft.md`)
were reconfirmed clean by the independent reviewer prior to PASS.

**No hard-stop condition (§10) was triggered.** No production file,
test spec, `playwright.config.ts`, or `auth.setup.ts` was touched; the
`AUTH_EXPIRY_SIGNATURE` logic was not weakened, reordered, or merged
with the new counter; `ERR_CONNECTION_REFUSED` cannot trigger the new
retry (explicit exclusion confirmed in source); no migration, RPC, or
move-affordance work entered scope; no machine-local linked-project
state was used; carried PATCH-089 through PATCH-095 evidence was not
weakened (this patch touches no file any of those patches depend on
for evidence); PATCH-097 did not exist prior to this closure.
