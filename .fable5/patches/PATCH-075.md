# PATCH-075 — Per-Slide Menu Escape-Close Parity

**Status:** SPEC READY — fix-authorized. **Implementer:** GPT-5.5.
**Reviewer:** Sonnet (independent, read-only, uncommitted diff,
explicit PASS required before commit). **Closure:** Fable (CTO) after
landing.

**Base commit (bind, verify before editing):**
`6487dc53df73c01e09c25961576db80036c182ba`
(`test(e2e): add shared timeout-safe drawing cleanup owner (PATCH-074 Stage 1)`)

**Bound implementation commit message (verbatim):**
`fix(presentation): close per-slide menu on Escape (PATCH-075)`

---

## 0. Fresh census (from HEAD `6487dc5`, superseding all prior censuses)

| # | Candidate | Classification | User-visible | Deterministic repro | Characterized | Owner | Files (est.) | Design ruling needed | Diagnosis-first / fix-ready | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Escape close for per-slide menus | defect (accessibility/consistency) | yes — keyboard users cannot close the ⋮ menu without a mouse or an item action | yes — open menu, press Escape, observe it stays open | none yet; `presentation-menu-pointer.spec.ts` already carries a `menuClose.escapeSupported: false` **hardcoded, untested** placeholder field | `PresentationPanel.tsx` | 2 (prod + spec) | **no** — `LineContextMenu.tsx` already implements the exact idiom (`document.addEventListener('keydown', handleEscape)` calling `onClose()`) to copy verbatim | fix-ready | **1 (selected)** |
| 2 | Duplicate padlet:// links | defect (data-sharing, not yet user-reported) | yes, if triggered — editing content in a "duplicated" slide's embedded padlet silently edits the original too | yes — duplicate a slide containing an embeddable, edit its content, observe both slides change | none | `DrawingLayout.tsx` `handleDuplicateSlide` (~:1408–1435) | unknown until design ruling | **yes** — must decide whether Duplicate Slide should deep-clone the referenced padlet(s) into new rows or intentionally keep a shared reference (a real product semantics decision, not just a bug fix) | diagnosis/design-first | 2 |
| 3 | Comparator parity/consolidation | refactor-only | no | n/a | already characterized (PATCH-072 §parity-lock unit test) | `lib/infra/presentation/slideOrder.ts` vs `PresentationPanel.tsx` inline comparator | n/a | no | **not eligible** — NaN/-Infinity divergence is proven unreachable (frames always bind `order: null`, never `NaN`); consolidating for its own sake is explicitly out of scope per governance instruction | deprioritized |
| 4 | Line-follow behavior | hardening / unclear | unconfirmed | not established without a design statement of "desired geometry" on move/resize | `drawing-line-bridge.spec.ts` covers selection/hit-testing/rendering, not an explicit "line re-anchors when its attached post moves/resizes" assertion | `lib/infra/drawing/lineBridge.ts` + `DrawingLayout.tsx` line rendering | unknown | **yes** — explicit attachment semantics must be defined before any fix is scoped; no evidence of a live user complaint | diagnosis-first | 5 |
| 5 | Membership-union consolidation | refactor | no | n/a | n/a | `metadata.childPadletIds` vs `metadata.parentId` dual tracking | large, cross-cutting | yes | **not eligible now** — `.fable5/CLAUDE.md` non-negotiable rule #9 explicitly defers this exact duality to its own planned migration phase; opportunistic fixing is prohibited | deferred by doctrine |
| 6 | AI images in presentation | diagnosis-blocked | unconfirmed | no deterministic fixture exists | `drawing-presentation.spec.ts` already carries an **approved skip**: "no deterministic PATCH-064 AI-image fixture support exists in the approved harness" | presentation slide-renderer | unknown | n/a until a fixture exists | blocked — needs harness capability first | 7 |
| 7 | Overlap fallback | already-characterized existing behavior | unconfirmed | `resolveSlidePadlets`'s overlap-fallback path (missing `frameId`) is described in PATCH-064 §census as a preserved, intentional fallback, not a reported defect | partially — PATCH-064 census listed `slide-embeddable-overlap-fallback` as a characterization tag | `components/presentation/slide-renderer/resolveSlidePadlets.ts` | unknown | possibly | diagnosis-first, low urgency — no evidence this fallback is currently wrong, only that it is rarely exercised | 6 |
| 8 | Uploaded-image storage cleanup | test-infrastructure gap, not a product defect | no direct product impact | the existing spec already documents *why* it's skipped: "deterministic fixture uses existing public/templates/moodboard.png and creates no storage object" | approved skip, unchanged | harness | harness-only | n/a | test-infra only — explicitly must not be bundled with a product-defect patch | 8 |
| 9 | Connections side-panel roadmap | feature | n/a | n/a | n/a | n/a | large | yes | feature, not stabilization — explicitly kept deferred per instruction unless a roadmap decision authorizes it | deferred (feature) |

**Selection:** #1 is the only candidate that is simultaneously a real
user-visible defect, deterministically reproducible, has a known
single owner, needs no design ruling (a working idiom already exists
in this exact codebase to mirror), and touches a minimal file set.
#2 is the next-most-real defect but is diagnosis/design-first (its
correct semantics are undefined) and is deliberately NOT bundled here.

---

## 1. Defect statement

The per-slide ⋮ menu in `PresentationPanel.tsx` closes on an item
action and on outside click (`slideMenuRef` + `mousedown` listener,
`:127-135`), but has **no `Escape` key handler** — pressing Escape
while the menu is open does nothing; the menu stays open. This is
inconsistent with the codebase's own established idiom:
`LineContextMenu.tsx` (`:59-85`) implements the identical open/close
shape (outside-mousedown-close + ref) and additionally registers
`document.addEventListener('keydown', handleEscape)` calling
`onClose()` on `e.key === 'Escape'`. The presentation menu is the
outlier, not the norm.

**Additional evidence:** the PATCH-073 Stage 1 characterization spec
(`presentation-menu-pointer.spec.ts`) already emits a
`menuClose.escapeSupported: false` field in its
`patch-073-menu-pointer-reachability` annotation — but this value is a
**hardcoded literal**, never derived from an actual Escape-key test.
This patch closes that specific, already-flagged gap.

## 2. Accepted behavior (bind)

- While the per-slide ⋮ menu is open, pressing `Escape` closes it
  (`setOpenMenuId(null)`) — identical outcome to an outside click.
- No menu item action fires as a side effect of Escape (no navigation,
  no fullscreen open, no rename/duplicate/remove trigger).
- No new focus-management behavior is introduced. `LineContextMenu`'s
  `onClose()` does not refocus its trigger either — Escape must behave
  exactly like the existing outside-click path in every respect except
  input method, keeping scope minimal and consistent with the
  established idiom (do not invent new accessibility behavior beyond
  parity with what already exists elsewhere in this codebase).
- The header ⋮ menu (`headerMenuOpen`/`headerMenuRef`, `:138+`) is
  UNCHANGED — this patch touches only the per-slide menu.
- Bottom global Start, PATCH-072 fullscreen ordering, PATCH-073
  placement/direction rule, and PATCH-074's cleanup ownership are all
  unaffected.

## 3. Rejected alternatives

- Adding a new dedicated `useEffect` for the Escape listener instead
  of extending the existing per-slide-menu effect (`:127-135`) —
  rejected as an unnecessary second effect/cleanup pair for identical
  lifecycle (`openMenuId` dependency, mount/unmount timing).
- Refocusing the ⋮ trigger button after Escape — rejected; not part of
  the existing outside-click behavior, would be new unscoped product
  behavior beyond parity.
- Applying the same Escape handling to the header ⋮ menu in the same
  patch — rejected; out of the stated defect (header menu was not
  flagged, keep the diff narrow, one behavior).
- Touching `LineContextMenu.tsx` to "share" the escape logic via
  extraction — rejected; premature abstraction over a four-line
  pattern, violates the coding-style "no premature abstraction" rule.

## 4. Scope — allowed files (exactly two; hashes at `6487dc5`, measured fresh)

| File | Pre-edit hash (bind) | Authorized change |
|---|---|---|
| `components/presentation/PresentationPanel.tsx` | `e811fa9524c2e6ff40c0e4a6124931da1ad6176e` | Extend the existing per-slide-menu `useEffect` (`:127-135`) with a `handleEscape` keydown listener (`e.key === 'Escape'` → `setOpenMenuId(null)`), added/removed alongside the existing `mousedown` listener via the SAME effect and cleanup. NOTHING else changes. |
| `e2e/characterization/presentation-menu-pointer.spec.ts` | `0206ef3bc8cf7e1500831b51fb44ac4cc1df4dc8` | §5 e2e contract below: real Escape-close proof per row per viewport; flip `escapeSupported` from the hardcoded `false` literal to a value derived from the new observation. NOTHING else (no other assertion, selector, timeout, or annotation field changes). |

No third file. `SlideThumbnail.tsx`, `FullscreenPresentation.tsx`,
`DrawingLayout.tsx`, `LineContextMenu.tsx` (reference-only, read
verbatim, never edited), all PATCH-072/073/074 production and harness
files, `playwright.config.ts`, and all other production source are
PROHIBITED.

## 5. E2E contract (bind; test COUNT unchanged: 1 active)

Inside the existing single characterization test, per row per bound
viewport (both `1280×720` and `1440×900`, matching the existing
matrix):

1. open the per-slide menu (existing `openMenuForRow` helper);
2. press `Escape` (`page.keyboard.press('Escape')`);
3. assert the menu closes (`await expect(menu).toHaveCount(0)`);
4. assert no navigation/fullscreen side effect occurred (no
   `Slide N / M` counter appears);
5. re-open the menu afterward to prove the row is still usable
   (existing helper re-invocation is sufficient — no new state
   needed).

Update the `MenuCloseObservation` type/object: `escapeSupported`
becomes a REAL derived boolean (true only if steps 3–4 both held for
every row at every viewport), not a literal. No other field in
`patch-073-menu-pointer-reachability` changes shape; no other
assertion in the file is touched. No force/dispatch/coordinate
workaround. No timeout increase.

## 6. Immutable fences — 18 unique paths (hashes at `6487dc5`, measured)

```text
playwright.config.ts                                    5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                      9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/SlideThumbnail.tsx              b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx      655244b443c3869173996cb21a77f7d67c41c64b
components/collabboard/canvas/layouts/DrawingLayout.tsx b470a888e4015e57b757ba0c57a041f1b7d8adb9
components/collabboard/menus/LineContextMenu.tsx        aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                    e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts               2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                         f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                 b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                             ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts             7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
e2e/characterization/drawingBridgeHarness.ts             7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts       ddab83381605dbdcdda4d1a0cea3cafe010f55c5
e2e/characterization/drawing-line-bridge.spec.ts        7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts        87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts    5345c42d79e3c40286ba9902085977983a012e64
```

New-file absence gate: N/A (no new file — both allowed paths already
exist at base). Verify before editing and before commit.

## 7. Expected totals (bind)

`presentation-menu-pointer.spec.ts`: 2 passed with dependencies / 1
passed `--no-deps` / 2 skipped credential-off (unchanged counts).
Carried: PATCH-074 spec 2/1/2; presentation 2 passed / 2 approved
skips; duplication 2 passed with deps / 1 passed `--no-deps` / 2
skipped credential-off; line 4 passed / 4 skipped credential-off;
helper 7/1; sanitizer 9/1; focused drawing 59/2; full Vitest
**448/43** (no unit files change); `git diff --check`/tsc/boundaries/
sequential verify+build green; cleanup zeros across all nine tracked
prefixes; zero production imports of bridge/harness modules; 18/18
fences.

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup`; no credential contents
anywhere; sequential `verify`/`build`, never under a dev server; never
commit generated artifacts.

## 9. Cleanup contract

Existing harness cleanup only (no harness file is touched by this
patch); post-run prefix-scoped residue checks for all nine tracked
prefixes must be zero. If a run is killed by test timeout, sweep and
report per the PATCH-074 Stage 1 shared-owner + manual-sweep rule
(unchanged — this patch does not touch cleanup ownership).

## 10. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, the §6 fences (18/18), or either pre-edit hash differs;
- a THIRD file is required, or the header ⋮ menu must change;
- any assertion beyond the Escape-close proof must be added or an
  existing assertion must be weakened;
- Escape triggers or is required to trigger any menu item action;
- row-to-slide association, keyboard-Enter activation, pointer
  reachability, or menu placement direction regress;
- PATCH-072 fullscreen ordering or PATCH-074 cleanup ownership
  changes in any way;
- the fixture or menu enumeration becomes nondeterministic;
- cleanup becomes nondeterministic;
- a second defect surfaces (report only, do not fix).

## 11. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted two-file diff (re-runs all §7 gates, re-derives all
hashes, re-verifies 18/18 fences, extracts the flipped
`escapeSupported` evidence from a fresh JSON reporter run); explicit
PASS required; NO commit before PASS; then commit with the bound
message and push; Fable closes.

**Bound commit message (verbatim):**
`fix(presentation): close per-slide menu on Escape (PATCH-075)`

## 12. Required final report

Files + pre/post hashes; exact Escape-close proof per row per
viewport; flipped `escapeSupported` evidence; all §7 gate totals;
18-fence result; cleanup proof; production-import grep; commit hash +
push status after PASS.
