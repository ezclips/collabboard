# PATCH-097 — Render Application-Owned AI Containers in the Custom Slider/Player

**Status:** **FIX AUTHORIZED**. TWO modified files
(`RuntimePresentationPadletCard.tsx`, `RuntimeContainerChildCard.tsx`)
plus ONE new characterization spec. No other production file may be
touched. No migration, RPC, or move work of any kind enters scope.
No change to the slide-editing preview renderer
(`slide-renderer/PresentationPadletCard.tsx`) — that is a separately
discovered, NOT-yet-authorized twin defect (see §9).

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (Kepler primary, Gemini 3.1 Pro fallback) — explicit PASS
required before commit. Sonnet (CTO/governance owner) authorized
this patch and must NOT perform its review.
**Closure:** Sonnet (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`acda97ccc015d6456c0e050e71ad3d41e5ae9ff2`
(`docs(fable): close PATCH-096 and record fresh census`; HEAD ==
origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`fix(presentation): render AI-component containers in the runtime slider/player (PATCH-097)`

---

## 0. Investigation summary (bind, 2026-07-21, from `acda97c`)

Full investigation performed read-only against current HEAD; see the
governance record in `CURRENT_TASK.md` for the complete report. This
section binds the load-bearing findings only.

**Defect:** an `ai-component`-type padlet (UI label "New AI Drawing",
`FreeformCanvasBoardMenu.tsx:42`) renders its generated content
correctly in the normal canvas/editor
(`FreeformPadletCards.tsx:3196`, via `AIComponentRenderer` +
`resolveSavedAIHtmlFromMetadata(padlet.metadata)`), but renders as an
effectively blank card ("No content" / "No preview available") in
the custom fullscreen slider/player
(`FullscreenPresentation.tsx` → `RuntimeSlideRenderer.tsx` →
`RuntimePadletLayer.tsx` → `RuntimePresentationPadletCard.tsx` /
`RuntimeContainerChildCard.tsx`), whether the AI Container is a direct
slide member or a child of a `type: 'container'` (row/column)
container placed on the slide.

**Root cause:** neither `RuntimePresentationPadletCard.tsx` nor
`RuntimeContainerChildCard.tsx` has a dispatch branch for
`normalizedType === 'ai-component'`. Both fall through to their
generic default/text branch, which reads only `padlet.content` and a
few caption-style metadata fields — none of which hold the AI
component's actual generated HTML. That HTML lives exclusively in
`metadata.savedAIComponent.code` / `metadata.aiComponentCode` /
`metadata.aiRawCode`, resolved only via
`resolveSavedAIHtmlFromMetadata()` (`lib/ai/normalize-ai-content.ts:100`)
— a function neither runtime card imports or calls. This is a pure
rendering-dispatch gap, NOT a membership/filtering/geometry/snapshot
defect: `resolveSlidePadlets.ts:25` only excludes `type === 'drawing'`
(unrelated, pre-existing, intentional-looking exclusion of nested
DrawingLayout boards — NOT touched by this patch);
`resolveRuntimeContainerChildren.ts` applies no type filtering at
all. Reload does not change the behavior (no persistence/staleness
involved).

**Confirmed NOT a new candidate needing separate authorization:** the
slide-EDITING preview renderer
(`slide-renderer/PresentationPadletCard.tsx`) has the IDENTICAL
missing branch and identical fallback behavior. This is a real,
separate, evidenced follow-up candidate — explicitly NOT bundled into
this patch (see §9) per the user's exact scope request ("the custom
slider/player").

## 1. Defect/invariant binding

**Invariant (bind):** any padlet with `type === 'ai-component'` that
is a valid slide member — either directly resolved by
`resolveSlidePadlets` (a standalone `embeddable` inside the slide's
frame) or expanded as a container child via
`expandRuntimeContainerItems`/`resolveRuntimeContainerChildren` —
MUST render its generated content in the fullscreen slider/player
using the SAME source-of-truth extraction the editor already uses
(`resolveSavedAIHtmlFromMetadata(padlet.metadata)`), not a
content/caption fallback.

**Read-only, no resize/interactive affordances:** the player is a
read-only surface. `AIComponentRenderer`'s resize-handle UI is
conditionally rendered only when an `onResize` callback prop is
passed (`AIComponentRenderer.tsx:209`) — the correction must NOT pass
`onResize`/`onResizeEnd`, so no interactive resize handle appears in
the player. `isExpanded`/sizing must be chosen so the AI content is
not artificially clipped to a collapsed height inappropriate for a
static slide render.

**No-code state:** `AIComponentRenderer` already renders "No AI
component generated yet" internally when `code` is empty
(`AIComponentRenderer.tsx:131-137`) — the correction must rely on
this existing behavior, not add a new empty-state branch.

## 2. Exact production change (bind)

In BOTH `RuntimePresentationPadletCard.tsx` and
`RuntimeContainerChildCard.tsx`:

1. Import `AIComponentRenderer` (`components/collabboard/AIComponentRenderer.tsx`)
   and `resolveSavedAIHtmlFromMetadata`
   (`lib/ai/normalize-ai-content.ts`).
2. Add ONE new branch keyed on `normalizedType === 'ai-component'`
   that renders `AIComponentRenderer` with `code =
   resolveSavedAIHtmlFromMetadata(padlet.metadata)` and `padletId =
   padlet.id`, sized to fill the card's allocated slot (the existing
   `shellStyle`/`mediaShellStyle`-equivalent wrapper pattern already
   used by every other branch in these two files) with no
   `onResize`/`onResizeEnd`/`onExpandAvailabilityChange`/
   `onExportTargetReady` wired.
3. Placement of the new branch relative to the existing
   `image`/`link`/`todo`/`table` branches does not matter functionally
   (types are mutually exclusive by construction) — place it wherever
   reads most naturally in each file's existing branch order.
4. No other line in either file may change. No unrelated formatting,
   import reordering, or refactor.

**Explicitly prohibited implementation choices (bind):** no change to
`slide-renderer/PresentationPadletCard.tsx` or
`slide-renderer/PresentationContainerCard.tsx`; no change to
`resolveSlidePadlets.ts`'s type-exclusion logic; no change to
`expandRuntimeContainerItems.ts`'s `type === 'container'` gate; no
change to `AIComponentRenderer.tsx`, `normalize-ai-content.ts`, or
`useAIComponent.ts`; no attempt to also render `type === 'drawing'`
containers (a separate, much larger, unauthorized scope).

## 3. Regression/characterization spec (bind)

ONE new spec:
`e2e/characterization/presentation-ai-component-render.spec.ts`
(absent at base — absence gate). ONE active test, no `.only`,
`test.setTimeout(300_000)`, existing harness only
(`drawingBridgeHarness.ts`, unchanged — reuse
`createDisposableDrawingBoard`/`seedDrawingContainers`/
`openDrawingBoard`/`registerDrawingCleanup`/cleanup helpers only, per
091/093/094 precedent of defining any NEW seeding needs as LOCAL
helpers inside the spec file itself, exactly as `seedCommentPost` was
defined locally rather than added to the shared harness),
`registerDrawingCleanup(test)` at module scope, per-board try/finally
+ zero-assertion cleanup. Bound prefix:
`patch-064-harness-patch-097-ai-render-`.

- **Flow A — direct slide member:** seed one `type: 'ai-component'`
  padlet with real generated-content shape in its metadata (a
  detectable, distinctive HTML fragment written directly into
  `metadata.aiComponentCode` or `metadata.savedAIComponent.code` via
  the same real Supabase insert pattern already used by every prior
  harness-seeding function — this is SETUP, not a substitute for the
  behavior under test, exactly the precedent already used for seeding
  comments/containers); construct one master drawing padlet
  (`type: 'drawing'`, `content` = a JSON array of Excalidraw elements)
  containing one frame (the "slide") and one `embeddable` element
  linking `padlet://<ai-component-id>` positioned inside that frame,
  mirroring the exact JSON element shapes already used by
  `seedPresentationScene` (frame/embeddable/text/rectangle element
  builders) — construct these AS LOCAL functions in the new spec file,
  not by modifying the shared harness. Open the board in normal
  editor mode first and confirm the AI content is visible there (this
  is the KNOWN-WORKING control case — must remain true). Open the
  fullscreen presentation/player for that slide and assert the same
  distinctive AI content marker IS present and visible in the
  player's DOM.
- **Flow B — container-child member:** repeat the same setup with the
  ai-component padlet parented to a `type: 'container'`
  (row/column-style) container (via `metadata.parentId` +
  `metadata.childPadletIds`, the same relationship convention already
  used by 089-094) that is itself the slide member; assert the AI
  content marker is visible in the player when reached through the
  container-child expansion path (`RuntimeContainerChildCard`).
- **Flow C — reload stability:** reload the player (or re-enter
  fullscreen mode) and re-assert the same marker remains visible,
  ruling out a one-time-render fluke.
- **Flow D — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0).

No `page.route`, no auth capture, no hidden-handler invocation, no
synthetic event dispatch, no failure injection, no `canvas_comments`
access, no direct DOM/React-state mutation used to fake the presence
of the content (the assertion must observe real rendered DOM output
from the actual component tree, not an injected marker).

## 4. Allowed files (bind)

| File | Role | Starting state at base `acda97c` |
|---|---|---|
| `components/presentation/runtime-slide/RuntimePresentationPadletCard.tsx` | add `ai-component` render branch | blob `4c8b54f8332b5feeb2be9336c96a40b6c65d6ca7` |
| `components/presentation/runtime-slide/RuntimeContainerChildCard.tsx` | add `ai-component` render branch | blob `5c4e4dca376a140be2f8ebb776161f88d8d681aa` |
| `e2e/characterization/presentation-ai-component-render.spec.ts` | NEW regression spec | absent at base (absence gate) |

THREE files total (two modified, one new). NO other production file.
NO harness change. NO config change. NO package/lockfile change. NO
migration/RPC.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; `.fable5/patches/PATCH-098.md` not started.

## 5. Immutable fences (bind — 59, Git blob IDs)

Verify each with `git rev-parse acda97c:<path>` and equality at the
current governance HEAD. The 46-entry set carried unchanged from
PATCH-096's closure, PLUS `e2e/run-carried-groups.mjs` at its now-
landed PATCH-096 blob, PLUS 12 newly-fenced files directly implicated
by this patch's investigation (the runtime-slide dependency chain,
the slide-renderer twin explicitly NOT being touched, and the AI
rendering primitives the fix must call but not modify) = **59**.

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
components/collabboard/editors/CommentEditor.tsx                e135acddbf067b0a63ada6f1a0412a5ac1361e0b
components/collabboard/EmbeddedCommentList.tsx                 7d116a289efa10a58a1a7f1d036f5e5b0db30e00
e2e/characterization/drawing-comment-edit.spec.ts              cdc90628ecdb12e70e5fa41d444688d1b3ccb481
e2e/characterization/drawing-comment-edit-save.spec.ts         7e7d8e05ef8203b87e011a16acfcdc912a7dbc70
e2e/run-carried-groups.mjs                                     bf76160368a2e6b274aa379efa681021ddc55582
components/presentation/runtime-slide/RuntimePresentationContainerCard.tsx b0c6c3c5b72e0b73b3a8e49a2067382a722f0da9
components/presentation/runtime-slide/RuntimePadletLayer.tsx   7baee436b9a63313cbb157444ff846b2bd1c26aa
components/presentation/runtime-slide/expandRuntimeContainerItems.ts 14e7573c53e2ab85c36d74d2e1afe22cf64c8da1
components/presentation/runtime-slide/resolveRuntimeContainerChildren.ts 71a878350b66b464bd693960e778b6a4fa73a4a0
components/presentation/runtime-slide/runtimeChildCardUtils.ts aef08b4ed98d93d846cce82db51e23561e878b69
components/presentation/runtime-slide/RuntimeSlideRenderer.tsx a407cccc230ca74a36a443b5f701767856754230
components/presentation/slide-renderer/PresentationPadletCard.tsx bbcef06c8b8de29e455ec4748e7ea2762f0c1052
components/presentation/slide-renderer/PresentationContainerCard.tsx 3876eeba810484fcf01437d477fe682dec2aa32b
components/collabboard/AIComponentRenderer.tsx                 ce6509bd72a51a3eeb5ff884808c62bd66a76e90
lib/ai/normalize-ai-content.ts                                 49aa7d640c12ef1aa7ed109c3e5ef4b90466dd62
hooks/useAIComponent.ts                                        c4d2fc2e21d1b3684e5dbf52924f593cf67808c4
components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx   c8efedfd1eb721f88fb8db1f97b1be72df8e8a04
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 59; unique paths = 59; unique path/blob pairs = 59;
duplicates = 0; malformed = 0. This count (59) is used consistently
throughout this document — header, this section, hard-stop list
(§8), and final-report requirement (§10) — no other count appears
anywhere.

## 6. Deterministic and live gates (bind)

Deterministic: `git diff --check`, `npx tsc --noEmit`,
`npm run check:boundaries`,
`npx vitest run lib/infra/presentation/slideOrder.test.ts`,
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts`,
`npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts`,
`npx vitest run`, `npm run verify`, `npm run build`. Expected totals
(re-verify, unchanged): slideOrder 7/1, clonedPostMetadata 9/1,
focused drawing 59/2, full Vitest 448/43, all gates green.

Live (with a self-started `npm run dev -- --port 3000` +
`PW_BASE_URL`, never concurrent with a build/verify): the new spec
(dependency mode, `--no-deps`, credential-off, JSON reporter, three
stability runs); carried gates — PATCH-096 (`node
e2e/run-carried-groups.mjs`, expect 14/14/14, 0/0/0 incidents),
PATCH-094 (expect `edit-save-consistent`), PATCH-093 (expect
`editor-mounts-and-is-drivable`/`inside-comment-row`/
`not-reachable-through-existing-harness`), PATCH-091 (expect
`mixed-comment-state`), PATCH-090, PATCH-089 (expect
`mixed-drop-state`) — all must remain unchanged from their bound
values.

## 7. Cleanup contract (bind)

Board prefix `patch-064-harness-patch-097-ai-render-` must reach
`{boards: 0, padlets: 0, canvasLines: 0}` in every run. No
`test-results/` beyond the gitignored `.last-run.json`, no
`playwright-report/`, no JSON reporter output, no screenshots,
videos, traces, or scratch/parser scripts left behind. Ports 3000/4000
free at close; no repo-owned Node/Playwright process left running.

## 8. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (59/59), or any §4 absence gate differs;
- any file outside §4's three is touched;
- `slide-renderer/PresentationPadletCard.tsx` or
  `slide-renderer/PresentationContainerCard.tsx` is touched (that is
  a separate, not-yet-authorized follow-up — see §9);
- `resolveSlidePadlets.ts`'s type-exclusion logic changes;
- `expandRuntimeContainerItems.ts`'s `type === 'container'` gate
  changes;
- `AIComponentRenderer.tsx`, `normalize-ai-content.ts`, or
  `useAIComponent.ts` is modified;
- an interactive resize handle appears in the player (i.e. `onResize`
  is wired) — this is a read-only surface;
- the new spec fakes the AI content's presence via direct DOM/state
  injection rather than observing real rendered output;
- `type === 'drawing'` (nested DrawingLayout board) rendering is
  added to either file — out of scope, separate, much larger problem;
- any migration/RPC/move work enters scope;
- `canvas_comments` enters scope;
- carried PATCH-089 through PATCH-096 evidence must be weakened;
- cleanup cannot reach zero;
- any generated artifact remains after review;
- `.fable5/patches/PATCH-098.md` exists before this patch is
  authorized to close.

## 9. Deferred follow-up (bind, NOT authorized by this patch)

The slide-EDITING preview renderer
(`slide-renderer/PresentationPadletCard.tsx`) has the identical
missing `ai-component` branch and identical fallback behavior as the
two files fixed here. This is a real, evidenced, separate candidate
for a FUTURE patch (tentatively PATCH-098 or later) — smaller in
scope than this one (one file, same pattern, same fix shape) but
explicitly NOT bundled here per the user's exact scope request. Do
not implement it under this patch.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted three-file diff + report (blobs
re-derived; exact branches added in both files; new spec passing
Flows A-D; carried totals; deterministic totals; 59-fence result;
cleanup proof). The independent reviewer (Kepler primary, Gemini 3.1
Pro fallback — NOT Sonnet) re-derives everything live and must return
an explicit PASS before the implementer commits with the bound
message and pushes. Sonnet (CTO) closes only after PASS + landing are
independently confirmed.

## 11. Required final report

Exact three changed paths + final blobs; the exact branch added in
each file, verified against §2; new spec Flow A/B/C/D results
(including the editor-mode control assertion in Flow A); carried
totals (089-096 unchanged); deterministic totals; 59-fence result +
absence gates; cleanup proof; explicit confirmations (no file outside
§4 touched, no resize handle exposed, no `type==='drawing'` rendering
added, `slide-renderer/PresentationPadletCard.tsx` untouched); commit
hash + push status after PASS.
