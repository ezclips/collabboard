# PATCH-078 — Rename-Slide State-Ownership Diagnosis

**Status:** SPEC READY — **diagnosis-only** (NO production change, NO
harness change, NO fork change, NO fix — neither the rename defect
nor the persistence family may be fixed under this patch). Authorized
by the PATCH-077 §0.A blocked-stop ruling (OPTION B).
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit (bind):**
`eff21fc6eab97a45d05dd2a888e56c32d14e900b`
(last commit that touched fenced source; all fenced blobs verified
identical between this base and the governance HEAD)

**Implementation start HEAD:**
`7cd6d9ae97dc883761f5874d6b19403324be3911`

**Bound implementation commit message (verbatim):**
`test(e2e): characterize rename-slide state ownership (PATCH-078)`

---

## 1. Contradiction statement (bind — what PATCH-077's stop proved)

After a single real Rename action (row menu → `'Rename slide'` → real
inline textbox → deterministic replacement title → real Enter; rename
mode exits), the page holds contradictory title state: the
presentation sidebar row keeps the OLD title (`PATCH-064 Portrait`)
across a 60 s observation window while the replacement title is
visible elsewhere on the page.

**Code-derived hypothesis (to be confirmed or refuted, never
assumed):** `handleRenameSlide` (`DrawingLayout.tsx:1448-1454`)
writes the new `name` into the LIVE Excalidraw scene via
`updateScene` (whose canvas frame label is the "elsewhere"), but the
sidebar renders `frames` derived from React `elements` STATE
(`:1935-1946`), and that state's refresh is **count-gated**
(`:1084-1090` — `setElements` fires only when the active element
COUNT changes; the only other site is scene-import `:1300`). A pure
rename changes no count, so the sidebar model can never refresh.
Meanwhile `handleChange` sets `dirtyDataRef` unconditionally
(`:1155-1170`), so the renamed title MAY reach the persisted master
scene despite the stale sidebar — open observation, not assumption
(PATCH-076 proved programmatic-`updateScene` persistence cannot be
presumed).

This is a UI-state defect candidate, deliberately classified
SEPARATELY from the PATCH-077 persistence question until evidence
says otherwise.

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, one active test, on the standard
PATCH-064 harness board, driving ONLY the real Rename UI path (no
direct state mutation, no callback invocation, no `dispatchEvent`, no
force click, no coordinate workaround), in this bound order:

1. **Act:** open the source row's (`PATCH-064 Portrait`, title-index
   0) menu; activate `'Rename slide'`; assert the real inline input
   appears and holds the current title-editing state; fill the
   deterministic replacement title `PATCH-064 Portrait renamed`;
   press real Enter; assert rename mode exits (input gone). Derive
   **`inputAcceptedRename`** (input held the typed value before Enter
   AND rename mode exited on Enter).
2. **Immediate UI state:** derive **`sidebarTitleUpdatedWithinWindow`**
   — does the sidebar row title become the replacement title within a
   bound 15 s poll? Derive **`newTitleVisibleElsewhere`** — is the
   replacement title visible anywhere on the page OUTSIDE the sidebar
   (locator-scoped exclusion of the sidebar container) within the
   same window? Record where (supplementary evidence).
3. **Row-switch probe:** open another row's menu and close it /
   interact with the other row, return to the renamed row; derive
   **`sidebarUpdatedAfterRowSwitch`** — did the sidebar row title
   change to the replacement title after this selection churn?
4. **Settled persistence:** with the PATCH-076 settled method (poll
   the persisted master scene at ≤ 1 000 ms intervals across a
   ≥ 6 000 ms window; the settled final read is the sole derivation
   basis; lone sleep-then-read prohibited), derive
   **`persistedTitleUpdated`** — does the persisted frame carry the
   replacement title?
5. **Reload:** perform a real full page reload of the same board
   route (real navigation, allowed); reopen the presentation sidebar;
   derive **`sidebarUpdatedAfterReload`** — does the sidebar row now
   show the replacement title?

`'Remove slide'`, `'Duplicate slide'`, and `'Add slide below'` are
PROHIBITED in this spec (PATCH-077's preserved question resumes
separately; keep this diagnosis single-concern).

**Annotation contract (bind — exactly EIGHT literal fields):**

| Field | Definition |
|---|---|
| `inputAcceptedRename` | §2.1 boolean |
| `sidebarTitleUpdatedWithinWindow` | §2.2 boolean (15 s bound poll) |
| `newTitleVisibleElsewhere` | §2.2 boolean (outside-sidebar scope) |
| `sidebarUpdatedAfterRowSwitch` | §2.3 boolean |
| `persistedTitleUpdated` | §2.4 settled-read boolean |
| `sidebarUpdatedAfterReload` | §2.5 boolean |
| `classification` | derived, exactly one of the §3 enum values |
| `prefix` | real fixture prefix (must start with `patch-064-harness-patch-078-rename-`) |

No ninth field. Supplementary raw evidence (where the title appeared,
immediate vs settled persisted frame names, window/interval values)
is welcome in the payload. All eight values observation-derived; a
contradictory outcome (e.g. the sidebar DOES update) is a valid
diagnosis, not a failure.

## 3. Classification enum (bind, complete)

Derived in this order:

1. `!inputAcceptedRename` → **`rename-input-flow-broken`**
2. `sidebarTitleUpdatedWithinWindow` → **`sidebar-updates-correctly`**
   (contradicts the PATCH-077 stop report — valid, record faithfully)
3. `!newTitleVisibleElsewhere && !persistedTitleUpdated` →
   **`rename-not-applied-to-scene`**
4. `persistedTitleUpdated && sidebarUpdatedAfterReload` →
   **`count-gated-stale-sidebar-persisted`** (live scene + persistence
   updated; only the in-session sidebar model is stale)
5. `!persistedTitleUpdated` → **`count-gated-stale-sidebar-unpersisted`**
   (sidebar stale AND the rename never reaches persistence — couples
   this defect to the PATCH-077 persistence family)
6. anything else → **`mixed-rename-state`**

## 4. Scope — allowed files (exactly ONE, new)

| File | Requirement |
|---|---|
| `e2e/characterization/drawing-slide-rename-state.spec.ts` | NEW file (absence verified at base, HEAD, and worktree 2026-07-18 — confirm again before editing and before commit). One active test implementing §2. Existing harness (`createDisposableDrawingBoard('patch-078-rename')` → prefix `patch-064-harness-patch-078-rename-`), `registerDrawingCleanup(test)` + local `finally` per convention. Local UI helpers in-file, mirroring `drawing-slide-duplication.spec.ts` idioms — do NOT edit that spec or the harness. |

Absence gates (both, at base AND worktree, before editing and before
commit): `e2e/characterization/drawing-slide-rename-state.spec.ts`
(the new file) and `e2e/characterization/drawing-slide-persistence.spec.ts`
(PATCH-077's never-created path — must REMAIN absent; recreating it
is prohibited). No other new file may appear anywhere.

NO other file may change. Production source, the Excalidraw fork, the
harness, all existing specs, `playwright.config.ts`, and all `.fable5`
docs are PROHIBITED (governance files are CTO-only).

## 5. Immutable fences — 23 unique paths (Git blob IDs at base `eff21fc`)

Verification method (bind): fences are Git blob IDs — verify with
`git rev-parse eff21fc6eab97a45d05dd2a888e56c32d14e900b:<path>` and
equality at the current governance HEAD with
`git rev-parse HEAD:<path>`. Do NOT use raw file-byte SHA-1 or
`Get-FileHash`. (Working-tree spot checks may additionally use
`git hash-object <path>`, which produces the same blob ID.)

```text
playwright.config.ts                                       5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                         9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx              02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                 b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx         655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/canvas/layouts/DrawingLayout.tsx    b470a888e4015e57b757ba0c57a041f1b7d8adb9
components/collabboard/menus/LineContextMenu.tsx           aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                       e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                  2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                            f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                    b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts    b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
e2e/characterization/drawingBridgeHarness.ts               7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts          ddab83381605dbdcdda4d1a0cea3cafe010f55c5
e2e/characterization/drawing-line-bridge.spec.ts           7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts           87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts       5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts     50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts     fc20ef8160417b6eeb59f4662ab89ceb1af5a167
```

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test).
Carried (unchanged): PATCH-076 spec 2/1/2; menu-pointer 2/1/2;
PATCH-074 spec 2/1/2; presentation 2 passed / 2 approved skips;
duplication 2/1/2; line 4 passed / 4 skipped cred-off; helper 7/1;
sanitizer 9/1; focused drawing 59/2; full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 23/23 fences.
Cleanup zeros across **TWELVE** prefixes: the ten tracked prefixes,
plus the PATCH-077 draft's `patch-064-harness-patch-077-persist-`
(legacy residue check — the draft ran before its stop), plus
`patch-064-harness-patch-078-rename-`.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup`; no credential contents
anywhere; sequential `verify`/`build`, never under a dev server; never
commit generated artifacts (`test-results/`, `playwright-report/`,
JSON reporter output, scratch scripts).

## 8. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + local `finally`
defense. Rename touches only the fixture's master-scene content and
creates no rows (expected); the board-scoped fixture delete covers
surprises. The reload step must not leak a second page/context
holding fixture state past test end. Post-run prefix-scoped residue
checks must be zero for all TWELVE §6 prefixes. Test-timeout kill →
sweep and report per the PATCH-074 rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (23/23, blob-ID method), or either §4
  absence gate differs;
- ANY existing file must change (production, fork, harness, spec,
  config);
- a SECOND new file is required;
- `'Rename slide'` or the inline input cannot be driven
  deterministically through the real UI;
- `'Remove slide'`, `'Duplicate slide'`, or `'Add slide below'` would
  need to be exercised;
- any observation requires force click, `dispatchEvent`, coordinate
  workaround, direct callback invocation, direct product-state
  mutation, or a per-test timeout above 240 000 ms;
- persistence settlement cannot be observed deterministically;
- the observed combination requires a classification outside the §3
  enum (report, do not extend);
- a second distinct defect surfaces (report only, do not fix);
- ANY fix, guard, or production improvement seems "obvious" — this
  patch observes; no rename fix and no persistence fix are authorized
  until the true state owner is identified and ruled on.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the blob ID,
re-verifies 23/23 fences + both absence gates + one-file scope,
re-runs all §6 modes, extracts the eight-field annotation from a
fresh JSON reporter run, verifies every field is observation-derived
and the classification follows the §3 order); explicit PASS required;
NO commit before PASS; then commit with the bound message and push;
Fable closes, rules on the true state owner, and re-authorizes the
preserved PATCH-077 persistence question.

**Bound commit message (verbatim):**
`test(e2e): characterize rename-slide state ownership (PATCH-078)`

## 11. Required final report

New file + blob ID; all eight annotation fields with observed values;
where the replacement title appeared outside the sidebar; immediate
vs settled persisted frame-name evidence; reload outcome; the derived
classification and what it implies for the true state owner and for
the preserved PATCH-077 persistence question; all §6 gate totals;
23-fence result + both absence gates + one-file scope proof; cleanup
proof across twelve prefixes; production-import grep; commit hash +
push status after PASS.
