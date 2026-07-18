# PATCH-079 — Rename-Sidebar Frame-Signature Refresh (production fix)

**Status:** DONE — closed 2026-07-18 (closure record in §12).
Implementation commit `9a11a234835242cfb51360ca95762ee1790eec2f`,
Sonnet independent PASS. Was: FIX AUTHORIZED — narrow production fix,
first fix in the
rename-state family. Authorized by the PATCH-078 closure ruling (the
true state owner is identified to the exact lines; diagnosis complete).
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`e239880295d333478314d414f21de051c065e3aa`
(`test(e2e): characterize rename-slide state ownership (PATCH-078)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`fix(drawing): refresh slide sidebar on frame rename (PATCH-079)`

---

## 0. Census at authoring (2026-07-18, from `e239880`)

Ranked; one patch at a time; no bundling.

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Rename-sidebar stale-state fix** | defect | **SELECTED (this patch)** — owner proven to exact lines by PATCH-078; deterministic repro; bounded strategy |
| 2 | Add/Duplicate persistence-boundary diagnosis (PATCH-077 successor per its §0.B) | defect diagnosis | NEXT (PATCH-080 candidate) — prerequisite for the duplicate fix; why does `handleDuplicateSlide` not persist when `handleRenameSlide` does? |
| 3 | Duplicate-slide deep-clone fix (semantic ruling bound: PATCH-076 §0.B.2 OPTION A) | defect | BLOCKED on #2 — suppression mechanism still unidentified; fixing blind risks treating a symptom |
| 4 | Frame-geometry sidebar staleness (drag a frame → in-session thumbnail/order staleness — code-implied sibling of this defect, deliberately EXCLUDED from this fix's signature) | defect (uncharacterized) | census only — needs its own diagnosis; do NOT fix opportunistically here |
| 5 | Line-follow behavior | hardening | deferred |
| 6 | Uploaded-image storage cleanup | hardening | deferred |
| 7 | Overlap fallback | hardening | deferred |
| 8 | AI images in presentation | feature | deferred (phase discipline) |
| 9 | Connections side-panel | feature planning | deferred until stabilization is ruled complete |

## 1. Defect (proven by PATCH-078, commit `e239880`, Sonnet PASS)

Renaming a slide through the real presentation UI updates the live
Excalidraw scene and persists correctly, but the presentation sidebar
row keeps the OLD title for the whole session (15 s window + row-switch
probe both stale; only a full reload fixes it). Root cause
(code-confirmed): the sidebar renders `frames` derived from React
`elements` state (`DrawingLayout.tsx:1935-1956`), and that state is
refreshed ONLY when the active element COUNT changes
(`:1084-1090` — `activeElementCountRef` gate; the only other
`setElements` site is scene-import `:1300`). A pure rename changes no
count, so the sidebar model can never refresh in-session.
Classification: `count-gated-stale-sidebar-persisted`.

## 2. Fix design ruling (bind)

**Chosen: OPTION C — narrow frame-signature comparison** extending
the existing gate.

Inside `handleChange`'s EXISTING single pass over the scene elements
(the same loop that computes `activeCount` — do NOT add a second
full-array loop), accumulate a cheap frame-metadata signature over
active (non-deleted) `type === 'frame'` elements in array order:
`id` + separator + (`name` ?? empty marker). Store the last value in
a ref. Extend the gate:

```
if (activeElementCountRef.current !== activeCount
    || frameNameSigRef.current !== frameSig) {
  activeElementCountRef.current = activeCount;
  frameNameSigRef.current = frameSig;
  setElements(elements);
}
```

**The signature MUST NOT include x/y/width/height** — frame geometry
changes at 60 fps during drag, and the count-gate exists precisely to
avoid per-frame React re-renders (see the `:1084-1086` comment). The
downstream `frameSigsRef`/`frameVersionsRef` machinery in the
`frames` derivation (`:1947-1951`) already handles per-frame version
bumps once a render occurs; this fix only ensures the render happens
when a frame NAME changes.

**Rejected alternatives (bind — do not implement):**

- **OPTION A — unconditional `setElements` on every accepted change:**
  Excalidraw `onChange` fires on pointer/selection/drag at high
  frequency; this reintroduces the 60 fps render/GC churn the gate
  was built to prevent.
- **Full deep-equality of the elements array per `onChange`:** O(N)
  structural compare with object churn per frame; same problem.
- **Fixing in `PresentationPanel` by reading the scene directly:**
  violates state ownership — the sidebar must render from the same
  React model as the rest of the layout, not grow a second source of
  truth (P6).
- **Fork (`excalidraw_fork`) changes:** prohibited.
- **Including geometry in the signature** to also fix census #4:
  bundles an uncharacterized defect and reintroduces drag churn.

## 3. Accepted behavior (bind — all must hold)

- After a real Rename, the sidebar row shows the new title in-session
  (within the spec's existing 15 s observation window — expected
  near-immediately).
- Row-switch behavior remains correct; persistence remains correct
  (settled persisted title updates as today); reload remains correct.
- Frame-metadata refresh no longer depends on element count.
- NO render loop (`setElements` must not directly or indirectly
  trigger `updateScene`/`onChange` recursion).
- NO duplicate or extra save (the `dirtyDataRef`/debounce/
  `performSave` path is untouched).
- NO selection drift, NO slide-ordering regression (ordering derives
  exactly as today).
- NO regression across PATCH-072 → PATCH-078 carried gates.
- Frame GEOMETRY staleness (census #4) is explicitly out of scope and
  must remain behaviorally unchanged.

## 4. Scope — allowed files (exactly TWO, both existing; NO new files)

| File | Starting blob (at base) | Allowed change |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | `b470a888e4015e57b757ba0c57a041f1b7d8adb9` | The §2 gate extension ONLY: one new ref, signature accumulation inside the existing element pass, extended gate condition. No other logic may change. |
| `e2e/characterization/drawing-slide-rename-state.spec.ts` | `d70b8e5130b9bf4250eba0c972f754647a578716` | Convert the PATCH-078 diagnosis into the regression spec: SAME single active test, same real-UI flow, same eight-field annotation emission, same prefix/cleanup structure, timeout ≤ 240 000 ms — but now ASSERT `inputAcceptedRename === true`, `sidebarTitleUpdatedWithinWindow === true`, `persistedTitleUpdated === true`, `sidebarUpdatedAfterReload === true`, and `classification === 'sidebar-updates-correctly'` (the §3-enum derivation logic itself must remain unmodified — the fix flips the outcome, not the derivation). |

Absence gates: NO new file may appear anywhere;
`e2e/characterization/drawing-slide-persistence.spec.ts` (PATCH-077's
never-created path) must REMAIN absent. Production source other than
`DrawingLayout.tsx`, the fork, the harness, all other specs,
`playwright.config.ts`, and all `.fable5` docs are PROHIBITED
(governance files are CTO-only).

## 5. Immutable fences — 22 unique paths (Git blob IDs at base `e239880`)

Verification method (bind): fences are Git blob IDs — verify with
`git rev-parse e239880295d333478314d414f21de051c065e3aa:<path>` and
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

(The PATCH-078 fence set minus `DrawingLayout.tsx`, which is now an
allowed file; the excalidraw fork is fenced by prohibition in §4.)

## 6. Expected totals (bind)

Amended rename spec: **2 passed with dependencies / 1 passed
`--no-deps` / 2 skipped credential-off**, run THREE sequential times
stable (asserting mode — a stale sidebar now FAILS the test).
Carried (unchanged): slide-duplication 2/1/2; menu-pointer 2/1/2;
harness-cleanup 2/1/2; presentation 2 passed / 2 approved skips;
duplication 2/1/2; line 4 passed / 4 skipped cred-off; helper 7/1;
sanitizer 9/1; focused drawing 59/2; full Vitest **448/43** (no unit
tests added or removed);
`git diff --check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 22/22 fences.
Cleanup zeros across the same **TWELVE** prefixes as PATCH-078 §6.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup` (the known
`e2e/.auth/user.json` staleness incident may recur — refresh via
setup, it is environmental); no credential contents anywhere;
sequential `verify`/`build`, never under a dev server; never commit
generated artifacts (`test-results/`, `playwright-report/`, JSON
reporter output, scratch scripts).

## 8. Cleanup contract

Unchanged from PATCH-078 §8: `registerDrawingCleanup(test)` + local
`finally` defense; post-run prefix-scoped residue checks zero for all
TWELVE prefixes; test-timeout kill → sweep and report per the
PATCH-074 rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (22/22, blob-ID method), either §4
  absence condition, or either allowed file's starting blob differs;
- the fix requires touching ANY file beyond the two allowed, a new
  file, the fork, the harness, or any config;
- the gate extension cannot be implemented inside the existing
  element pass (a second full-array loop would be required);
- any render loop, duplicate save, selection drift, or ordering
  change is observed;
- the amended spec cannot pass its assertions deterministically
  (three sequential runs) — do NOT weaken assertions or reintroduce
  observation-only mode to get green;
- any carried gate regresses;
- a second distinct defect surfaces (report only — census #4 geometry
  staleness in particular must NOT be fixed here);
- classification derivation logic in the spec would need to change.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted two-file diff (re-derives both blob IDs and the diff
shape against §4's allowed-change bounds, re-verifies 22/22 fences +
absence conditions, re-runs all §6 modes including three sequential
asserting runs, confirms no render-loop/duplicate-save signal,
confirms the derivation logic is unmodified); explicit PASS required;
NO commit before PASS; then commit with the bound message and push;
Fable closes and authorizes the PATCH-077-successor diagnosis
(PATCH-080 candidate, census #2).

**Bound commit message (verbatim):**
`fix(drawing): refresh slide sidebar on frame rename (PATCH-079)`

## 11. Required final report

Both changed files + final blob IDs; the exact gate-extension diff;
proof the signature excludes geometry; three-run stability table of
the asserting spec; all §6 gate totals; 22/22 fence result + absence
conditions; cleanup proof across twelve prefixes; production-import
grep; explicit statement that census #4 behavior is unchanged; commit
hash + push status after PASS.

## 12. Closure record (Fable CTO, 2026-07-18)

**Landed:** commit `9a11a234835242cfb51360ca95762ee1790eec2f`
(`fix(drawing): refresh slide sidebar on frame rename (PATCH-079)`),
exactly the two authorized files:
`components/collabboard/canvas/layouts/DrawingLayout.tsx` at blob
`5455597d486fd917c4983a18e47445e2b1c9314d` and
`e2e/characterization/drawing-slide-rename-state.spec.ts` at blob
`513d07bfe99898455d13d7048a53da90c3b5d401`. HEAD == origin/main.
Sonnet independent review: **PASS** (two full review passes, each
with fresh 22/22 fence re-derivation, full-diff structural audit, and
three independent live stability runs — six clean reviewer runs
total, zero drift).

**Final implementation (as ruled in §2, faithfully delivered):** one
retained `frameNameSigRef`; deterministic active-frame signature of
ordered `[frame id, frame name]` tuples accumulated inside the
EXISTING `handleChange` element pass (no second traversal); refresh
gate extended from count-only to count-OR-signature;
`setElements` remains conditional; the scene-import path seeds the
ref synchronously; persistence/debounce/save, ordering, and selection
logic untouched; NO geometry fields in the signature.

**Fixed behavior (asserted by the regression spec, three stable
runs):** rename input accepted; live frame label updates; sidebar
updates within the 15 s window (near-immediately); sidebar stays
correct across the row-switch probe; settled persistence succeeds;
reload correct; final annotation all-true with
**`classification: sidebar-updates-correctly`** — derived, not
hardcoded (the derivation chain is unchanged from PATCH-078).

**Explicit exclusions (intact):** frame geometry is NOT in the
signature — frame-geometry sidebar staleness (census #4) remains an
open, uncharacterized defect; duplicate-slide behavior untouched;
Add-slide-below behavior untouched; PATCH-077's draft path remains
permanently prohibited.

**Gates (all bound totals met):** amended spec 2/1/2 with three
sequential stable runs; carried — slide-duplication 2/1/2,
menu-pointer 2/1/2, harness-cleanup 2/1/2, presentation 2 passed/2
approved skips, duplication 2/1/2, line-bridge 4 passed/4 skipped;
deterministic — helper 7/1, sanitizer 9/1, focused drawing 59/2, full
Vitest 448/43, typecheck/boundaries/verify/build green. Cleanup:
local `finally` owner; all twelve tracked prefixes 0/0/0; no test
artifacts; port 3000 free; repo clean and synchronized. The
`e2e/.auth/user.json` staleness incident recurred once per review
pass on `drawing-duplication --no-deps`; resolved each time via the
sanctioned `--project=setup` refresh — environmental, not a code
defect (now reproduced across three independent sessions).
