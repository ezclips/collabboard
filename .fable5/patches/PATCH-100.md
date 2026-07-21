# PATCH-100 — Render Synchronous Structured AI Containers in Snapshot Surfaces with Deterministic Capture Observation

**Status:** **AUTHORIZED** (not yet implemented).

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (Kepler primary, Gemini 3.1 Pro fallback) — PASS required
before commit. Sonnet (CTO/governance owner) authored/authorized this
patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-21.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`ea300b22747d16d0230d068e6d99712be5dbd573`
(`docs(fable): record PATCH-100 remains not authorized (export-snapshot
test-strategy blocker)`; HEAD == origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`fix(presentation): render synchronous structured AI containers in snapshot surfaces (PATCH-100)`

---

## 0. Investigation summary (bind, 2026-07-21, from `ea300b2`)

**Defect (unconditional, timing-independent):**
`components/presentation/slide-renderer/PresentationPadletCard.tsx` —
the component `createSlideRenderer.tsx`'s `renderPadletOverlayToCanvas`
uses for every slide thumbnail, PDF export, PPTX export, share
preview, and preview-modal surface — has no
`normalizedType === 'ai-component'` dispatch branch at all. It falls
to the generic title/snippet default. Every AI Container, of any
content shape, renders blank in every snapshot-based surface today,
unconditionally, before any RAF/`html2canvas` timing is even relevant.

**`PresentationContainerCard.tsx` requires no change:** it already
delegates its single "primary child" render to `PresentationPadletCard`
(`variant="compact"`, `PresentationContainerCard.tsx:177`) — fixing
the one file covers both the top-level and nested-in-container cases
through the same code path. Note (non-defect, out of scope):
`pickPrimaryChild()` (`PresentationContainerCard.tsx:66-97`) has no
special preference for `ai-component` children — it only becomes the
rendered primary child via the existing image/media-link/text
priority order, or via the `children[0]` fallback when no more-preferred
sibling exists. This is pre-existing container cover-selection logic,
unrelated to this defect, and is not touched by this patch — the new
characterization spec must seed its nested-container fixture so the
AI-component child is the only child (guaranteeing the `children[0]`
fallback path selects it), not rely on any change to this selection
logic.

**Confirmed synchronous content families (re-verified via source,
`components/ai/renderers/*`):** `ChartDiagramRenderer.tsx`,
`TimelineDiagramRenderer.tsx`, `ComparisonDiagramRenderer.tsx`,
`PhotoCardRenderer.tsx`, `WorkshopBoardRenderer.tsx`,
`StructuredLessonBoardRenderer.tsx` — none contain `useState`,
`useEffect`, or async work; all commit fully synchronously with their
parent tree. `components/collabboard/renderers/LessonBoardRenderer.tsx`
(the `legacy_lesson_board` path) is likewise synchronous.

**Confirmed asynchronous, explicitly excluded:**
`components/ai/renderers/CodeDiagramRenderer.tsx` (Mermaid
flowchart/mindmap — async `renderDiagramCode()`, exposes
`data-ai-render-state`) and legacy HTML with externally-loaded images
(`components/collabboard/AIComponentRenderer.tsx` /
`hooks/useAIComponent.ts` — async `isLoading` state, no readiness
marker exposed). Neither is touched, fixed, or newly guaranteed by
this patch. Both remain exactly as unreliable in snapshots as they are
today (i.e. this patch cannot make them worse — currently 100% blank,
regardless).

**Test-strategy resolution (the prior blocker):** every downstream
snapshot consumer (`PresentationPreviewModal.tsx`,
`useSlideThumbnails.ts`, `exportToPDF.ts`, `exportToPPTX.ts`) terminates
in an opaque rasterized PNG with no extractable DOM or text — confirmed
in the prior governance turn. Racing the transient off-screen host
(`createSlideRenderer.tsx`'s `renderPadletOverlayToCanvas`: mount → 2
RAF → `html2canvas` → unmount in a `finally` block) was correctly
ruled unacceptable. This patch instead authorizes a minimal,
non-user-visible instrumentation hook, contained entirely inside the
one file already being modified for the functional fix — see §2.

## 1. Product contract (bind)

For snapshot-based surfaces (thumbnails, PDF export, PPTX export,
share preview, preview modal), a synchronous structured AI Container
must render its actual content — using the SAME authoritative
resolution/dispatch path the editor canvas and the PATCH-097/099
runtime cards already use
(`extractAIContentFromPadletMetadata()` → `AIContentRenderer` →
`normalizeAIContent()` → `deserializePersistedAIContent()`) — instead
of the generic title/snippet fallback, for these content families
only:

- structured lesson boards
- charts
- comparisons
- photo cards
- workshop boards
- timelines (non-Mermaid; all `TimelineDiagramRenderer`-backed
  timelines are synchronous per source)
- legacy HTML (preserved, unchanged, via governed `legacyHtmlProps`)
- legacy lesson boards (`legacy_lesson_board`, synchronous)

**Explicitly out of scope, unchanged, and NOT claimed fixed by this
patch:**

- Mermaid/code diagrams (`CodeDiagramRenderer`) — remain unconditionally
  blank in snapshots exactly as today
- legacy HTML with externally-loaded/uncached images — remain exactly
  as unreliable as today (best-effort only, no new guarantee)
- any readiness polling, timeout, or bounded-wait behavior
  (`waitForDiagramRender()`, `data-ai-render-state`) — untouched
- the existing two-`requestAnimationFrame` capture timing in
  `renderPadletOverlayToCanvas` — untouched
- `html2canvas` invocation, options, or orchestration — untouched
- runtime fullscreen player behavior (`RuntimePresentationPadletCard.tsx`,
  `RuntimeContainerChildCard.tsx`, PATCH-097/099) — untouched
- pixel-perfect export/visual-fidelity guarantees — not claimed

## 2. Exact production change (bind)

**Single file:** `components/presentation/slide-renderer/PresentationPadletCard.tsx`.

1. Import `AIContentRenderer` (`components/ai/AIContentRenderer.tsx`,
   default export), `extractAIContentFromPadletMetadata` and
   `normalizeAIContent` (`lib/ai/normalize-ai-content.ts`).
2. Add ONE new branch keyed on `normalizedType === 'ai-component'`
   that renders:
   ```
   <AIContentRenderer
     content={aiContent}
     legacyHtmlProps={{
       padletId: padlet.id,
       width: Number(padlet.width) || 500,
       height: Number(padlet.height) || 400,
       isExpanded: true,
     }}
   />
   ```
   where `const aiContent = extractAIContentFromPadletMetadata(padlet.metadata) ?? { html: "" };`
   — matching PATCH-099's exact pattern
   (`RuntimePresentationPadletCard.tsx`/`RuntimeContainerChildCard.tsx`).
   Wrapped in the file's existing `shellStyle` div, consistent with
   every other branch in this file. No `onExportTargetReady`, no
   resize/edit/editor-only callbacks.
3. **Test-only instrumentation, contained in the SAME branch, no new
   file, no change to `createSlideRenderer.tsx`:** inside the new
   branch, add a `useLayoutEffect` (matching the existing
   `useLayoutEffect` pattern already used in
   `AIContentRenderer.tsx:115`) that, ONLY when
   `process.env.NODE_ENV !== 'production'` (the exact gating
   convention already established in this codebase —
   `components/collabboard/canvas/layouts/DrawingLayout.tsx:93`'s
   `DEV_DRAWING_BRIDGE_DIAGNOSTICS`,
   `components/collabboard/SimpleLineRenderer.tsx:6`'s
   `DEV_LINE_RENDER_DIAGNOSTICS`), dispatches exactly one
   `window.dispatchEvent(new CustomEvent('collabboard-ai-snapshot-rendered', { detail: { padletId, kind } }))`
   where `kind = normalizeAIContent(aiContent).kind` (one of the five
   existing `NormalizedAIContent['kind']` enum values already defined
   in `lib/ai/normalize-ai-content.ts` — no new classification is
   invented). `useLayoutEffect` guarantees the event fires
   synchronously after the DOM commit and strictly before the browser's
   next paint/RAF callback, per React's documented effect-flush
   ordering — i.e. strictly before `renderPadletOverlayToCanvas`'s
   two chained `requestAnimationFrame` calls and the subsequent
   `html2canvas` capture, with zero race window.
4. No other line in this file may change. No unrelated formatting,
   import reordering, or refactor. No prop signature change to
   `PresentationPadletCardProps` (the `variant` prop is untouched).

**Instrumentation safety contract (bind):**

- fires only when `process.env.NODE_ENV !== 'production'` — inert,
  dead in a production build; identical gating convention already
  used elsewhere in this codebase for dev-only diagnostics
- payload is `{ padletId: string, kind: NormalizedAIContent['kind'] }`
  only — `padletId` is already public test-fixture data used
  pervasively across every existing characterization spec; `kind` is
  a coarse five-value classification tag already defined in
  production code, not new information, and contains no HTML, no
  AI-generated text, no user content, no metadata payload
- adds no network request, no persistence write, no database access
- has zero effect on rendered JSX/DOM structure, zero effect on
  `html2canvas`'s captured output, zero effect on capture timing (a
  `CustomEvent` dispatch is a synchronous, sub-millisecond operation
  with no `await`/timer)
- is not a general-purpose debugging API — narrowly named, narrowly
  scoped to this one new branch, fires only for `ai-component` padlets
  rendered through this one component
- does not gate, block, or delay any part of the existing production
  capture pipeline — `createSlideRenderer.tsx` is completely unaware
  of and unmodified by this event; the event is a pure, one-way,
  fire-and-forget side observation

**Explicitly prohibited implementation choices (bind):** no change to
`createSlideRenderer.tsx`, `renderPadletOverlayToCanvas`,
`PresentationContainerCard.tsx`, `waitForDiagramRender()`,
`data-ai-render-state` behavior, `CodeDiagramRenderer.tsx`,
`AIComponentExportMenu.tsx`, `useAIComponent.ts`,
`components/collabboard/AIComponentRenderer.tsx`,
`lib/ai/normalize-ai-content.ts`, `lib/ai/persistence.ts`, any
runtime fullscreen file (PATCH-097/099), any export orchestration file
(`useSlideThumbnails.ts`, `PresentationPreviewModal.tsx`,
`exportToPDF.ts`, `exportToPPTX.ts`, `SharePresentationModal.tsx`,
`ExportMenu.tsx`); no new timeout, polling, or bounded-wait behavior;
no new npm dependency; no persistent/general debugging API.

## 3. Regression/characterization spec (bind)

ONE new spec (absence gate):
`e2e/characterization/presentation-snapshot-ai-component-render.spec.ts`.
Same harness conventions as PATCH-097/099 (reuse
`drawingBridgeHarness.ts` unchanged; local seeding helpers only;
`registerDrawingCleanup(test)`; per-board try/finally; zero-assertion
cleanup). Bound prefix:
`patch-064-harness-patch-100-ai-snapshot-render-`.

The test must invoke an EXISTING production snapshot consumer (not
call `PresentationPadletCard` in isolation) — opening the
"Preview" modal (`PresentationPreviewModal.tsx`, which calls
`renderSlideToPNG` for its big-preview `<img>` and warms the thumbnail
strip) is the bound entry point, since it is reachable without
network-recorded credentials beyond the existing harness auth and
requires no PDF/PPTX file-system download handling.

- **Flow A — register the event listener BEFORE triggering capture:**
  `page.evaluate()` installs `window.__patch100Events = []` and a
  `window.addEventListener('collabboard-ai-snapshot-rendered', e => window.__patch100Events.push(e.detail))`
  listener, registered before any preview/export action is triggered —
  this eliminates the race entirely (events are buffered from before
  the action starts, not observed via a single racing promise or DOM
  poll).
- **Flow B — top-level structured AI Container:** seed one slide
  (frame + embeddable) containing one `type: 'ai-component'` padlet
  whose `metadata.aiComponentJson` holds a valid structured envelope
  (e.g. `{mode: 'lesson_board', version: 1, data: {...}}`, matching
  the real shape `serializeAIContentEnvelope()` produces) as a direct
  slide member, plus one ordinary non-AI control padlet (a `note`) on
  the same slide. Open the Preview modal. Assert (via
  `expect.poll(() => page.evaluate(() => window.__patch100Events))`)
  that an event with the direct AI padlet's id and
  `kind === 'structured'` was recorded, and that the preview's big
  `<img>` `src` becomes non-null/populated (capture still completed
  normally).
- **Flow C — nested structured AI Container:** seed a `type:
  'container'` padlet whose ONLY child (via `metadata.childPadletIds`)
  is a second structured `ai-component` padlet — guaranteeing
  `pickPrimaryChild()`'s `children[0]` fallback selects it without
  relying on any change to that selection logic. Assert an event for
  that padlet's id with `kind === 'structured'` was also recorded.
- **Flow D — legacy HTML unaffected (regression control):** seed one
  more `ai-component` padlet using `metadata.savedAIComponent.code`
  (legacy shape); assert an event with `kind === 'legacy_html'` is
  recorded for it, proving the legacy path is unaffected by this
  change.
- **Flow E — no resize/edit controls:** assert `getByTitle('Resize')`
  and any editor-only control has count 0 within the Preview modal DOM.
- **Flow F — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0).

The test does not use pixel-perfect image comparison at any point; it
does not assert on the PNG's pixel contents, only on (a) the buffered
instrumentation events proving each AI branch actually committed
before capture, with the correct content-kind classification, and
(b) the preview `<img>` becoming populated (structural completion,
not visual correctness). The test does not claim or exercise Mermaid
or image-readiness behavior.

## 4. Allowed files (bind)

| File | Role | Starting state at base `ea300b2` |
|---|---|---|
| `components/presentation/slide-renderer/PresentationPadletCard.tsx` | add `ai-component` branch + test-only instrumentation | blob `bbcef06c8b8de29e455ec4748e7ea2762f0c1052` |
| `e2e/characterization/presentation-snapshot-ai-component-render.spec.ts` | NEW regression spec | absent at base (absence gate) |

TWO files total (one modified, one new). NO other production file.
NO harness change. NO config change. NO package/lockfile change.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent; the
PATCH-097 spec (`presentation-ai-component-render.spec.ts`) AND the
PATCH-099 spec
(`presentation-ai-component-structured-render.spec.ts`) present and
UNMODIFIED at base and post-implementation (blobs must match exactly,
before and after).

## 5. Immutable fences (bind — 71, Git blob IDs)

Verify each with `git rev-parse ea300b2:<path>` and equality at the
current governance HEAD. The 62-entry set carried from PATCH-099's
closure, MINUS `PresentationPadletCard.tsx` (which becomes this
patch's allowed/modified file, removed from the fence list
accordingly), PLUS 9 newly-fenced files directly relevant to this
patch's exclusions (the snapshot/export consumer chain and the
async-content primitives explicitly not touched), PLUS the PATCH-099
structured spec (carried forward as an explicit immutable regression
gate, not previously fenced) = 61 + 9 + 1 = **71**.

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
components/presentation/slide-renderer/PresentationContainerCard.tsx 3876eeba810484fcf01437d477fe682dec2aa32b
components/collabboard/AIComponentRenderer.tsx                 ce6509bd72a51a3eeb5ff884808c62bd66a76e90
lib/ai/normalize-ai-content.ts                                 49aa7d640c12ef1aa7ed109c3e5ef4b90466dd62
hooks/useAIComponent.ts                                        c4d2fc2e21d1b3684e5dbf52924f593cf67808c4
components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx   c8efedfd1eb721f88fb8db1f97b1be72df8e8a04
e2e/characterization/presentation-ai-component-render.spec.ts 63a93b3e75f69e3c9a3a46a23f2351f008955bd1
components/ai/AIContentRenderer.tsx                            0a030caa982b479ff042f15fd3e4a229119044ef
lib/ai/persistence.ts                                          d8ec23850c9f05b7d20d0bb71147e32baf7cf358
components/presentation/slide-renderer/createSlideRenderer.tsx ce236e91196ef36c5491a053072acc3e981ed80d
components/presentation/useSlideThumbnails.ts                 19801ae2c2b0ddc8841e358ad0fbc7cde96708f3
components/presentation/PresentationPreviewModal.tsx           5116031b27f73bb7616f4024b197824c6718aa17
components/presentation/exporters/exportToPDF.ts               5bc675b48acf9f8c9493001938c6d9b43475772a
components/presentation/exporters/exportToPPTX.ts              4a3b503386f8ddb306ae8b074f98d1c2d60c541f
components/presentation/SharePresentationModal.tsx             c6103da9dd4ea7ebdc94b096ffa435026f7b48a2
components/presentation/ExportMenu.tsx                          7ae9ba569d50c8b6ef403b9c993e297ba8e29c50
components/collabboard/AIComponentExportMenu.tsx               dbd5cef919dbcb6e9cd6bc54a7b723b958491835
components/ai/renderers/CodeDiagramRenderer.tsx                80d05e5ce1c6e2a17aa5e5d97afc8cb0a6f6819d
e2e/characterization/presentation-ai-component-structured-render.spec.ts 2efbfb9047fabce3cae3d5730d1a42a431b788bf
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 71; unique paths = 71; unique path/blob pairs = 71;
duplicates = 0; malformed = 0.

## 6. Deterministic and live gates (bind)

Deterministic (unchanged expected totals, re-verify before commit):
`git diff --check`, `npx tsc --noEmit`, `npm run check:boundaries`,
`npx vitest run lib/infra/presentation/slideOrder.test.ts` (7/1),
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts` (9/1),
`npx vitest run` (448/43), `npm run verify`, `npm run build`. This
patch touches no `lib/domain`/`lib/infra` file — all totals must
remain unchanged.

Live (self-started `npm run dev -- --port 3000` + `PW_BASE_URL`, never
concurrent with build/verify): the new snapshot spec (dependency mode,
`--no-deps`, credential-off, JSON reporter, three stability runs);
carried gates — the UNMODIFIED PATCH-097 spec
(`presentation-ai-component-render.spec.ts`) and the UNMODIFIED
PATCH-099 spec
(`presentation-ai-component-structured-render.spec.ts`) must both
still pass with their original classifications; PATCH-096 grouped
runner (14/14/14, 0/0/0 incidents); PATCH-094/093/091/090/089
classifications unchanged.

## 7. Cleanup contract (bind)

Board prefix `patch-064-harness-patch-100-ai-snapshot-render-` must
reach `{boards: 0, padlets: 0, canvasLines: 0}` in every run. No
`test-results/` beyond the gitignored `.last-run.json`, no
`playwright-report/`, no JSON reporter output, no scratch/parser
scripts left behind. Ports 3000/4000 free at close.

## 8. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (71/71), or any §4 absence gate differs;
- any file outside §4's two is touched;
- the PATCH-097 spec or the PATCH-099 spec is modified in any way —
  both blobs must be bit-for-bit identical before and after;
- `createSlideRenderer.tsx`, `renderPadletOverlayToCanvas`,
  `PresentationContainerCard.tsx`, `waitForDiagramRender()`,
  `data-ai-render-state` behavior, `CodeDiagramRenderer.tsx`,
  `AIComponentExportMenu.tsx`, `useAIComponent.ts`,
  `AIComponentRenderer.tsx`, `normalize-ai-content.ts`,
  `persistence.ts`, any runtime fullscreen file, or any export
  orchestration file (`useSlideThumbnails.ts`,
  `PresentationPreviewModal.tsx`, `exportToPDF.ts`, `exportToPPTX.ts`,
  `SharePresentationModal.tsx`, `ExportMenu.tsx`) is modified;
- the existing two-RAF capture timing changes in any way;
- any new timeout, polling, or bounded-wait behavior is introduced;
- the instrumentation event fires in a production build (i.e. is not
  correctly gated behind `process.env.NODE_ENV !== 'production'`);
- the instrumentation payload contains AI-generated HTML, text,
  metadata contents, or any field beyond `padletId`/`kind`;
- an interactive resize/edit handle appears in any snapshot surface;
- the new spec relies on racing the transient off-screen host instead
  of the buffered event listener;
- the new spec uses pixel-perfect image comparison;
- Mermaid/code-diagram or image-readiness behavior is claimed fixed;
- any migration/RPC/move work enters scope;
- carried PATCH-089 through PATCH-099 evidence is weakened;
- cleanup cannot reach zero;
- any generated artifact remains after review.

## 9. Review and commit flow (bind)

Implementer delivers the uncommitted two-file diff + report (blobs
re-derived; exact branch and instrumentation verified against §2; new
spec passing Flows A-F; PATCH-097 and PATCH-099 spec blobs unchanged;
carried/deterministic totals; 71-fence result; cleanup proof). The
independent reviewer (Kepler primary, Gemini 3.1 Pro fallback — NOT
Sonnet) re-derives everything live and must return an explicit PASS
before the implementer commits with the bound message and pushes.
Sonnet (CTO) closes only after PASS + landing are independently
confirmed.

## 10. Required final report

Exact two changed/added paths + final blobs; the exact branch and
instrumentation verified against §2; new spec Flow A-F results
(including confirmation the event-listener registration happened
before the triggering action, not racing it); explicit confirmation
the PATCH-097 and PATCH-099 spec blobs are unchanged; carried totals
(089-099 unchanged); deterministic totals; 71-fence result + absence
gates; cleanup proof; explicit confirmations (no file outside §4
touched, no resize handle exposed, no export-orchestration file
touched, instrumentation confirmed inert in a production build);
commit hash + push status after PASS.
