# PATCH-102 — Bounded Legacy-HTML Image Readiness Wait in Slide Snapshot Capture

**Status:** **AUTHORIZED, RESUMING** (blocked by PATCH-103 from
2026-07-22 until PATCH-103 closed DONE on the same date at commit
`75343360c510571fecf584637a58e8a4211ee63a`; see §12 for the
restoration/resumption plan and one additional bound prerequisite
found in this candidate's own spec file).

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (Kepler primary, Gemini 3.1 Pro fallback) — PASS required
before commit. Sonnet (CTO/governance owner) authored/authorized this
patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-22.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`5c363053d83c702344c445b338e6ea9df5861e9b`
(`fix(presentation): wait for Mermaid diagram readiness before slide
snapshot capture (PATCH-101)`; HEAD == origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`fix(presentation): wait for legacy-HTML image readiness before slide snapshot capture (PATCH-102)`

---

## 0. Investigation summary (bind, 2026-07-22, from `5c36305`)

**Key discovery — a readiness marker for legacy-HTML images already
exists, unmodified, already shipped:** `hooks/useAIComponent.ts`'s
`applyImageEnhancements()` (lines 24-97) already sets
`img.dataset.aiImageState` (i.e. the DOM attribute
`data-ai-image-state`) to `'loading'`, `'loaded'`, or `'error'` on
every `<img>` inside legacy-HTML AI content — driving the existing
production fade-in (`opacity: 0` while loading → `opacity: 1` once
settled). This is functionally identical in shape to Mermaid's
`data-ai-render-state` marker that PATCH-101 already reused. **No
change to `AIComponentRenderer.tsx` or `useAIComponent.ts` is needed —
this patch reuses an existing, unmodified, already-proven marker**,
exactly as PATCH-101 reused `data-ai-render-state` without touching
`CodeDiagramRenderer.tsx`.

**Settlement semantics already correct for reuse (unmodified,
verified by source):**

- **cached/complete images:** `img.complete && naturalWidth > 0` is
  checked synchronously inside the same effect that runs
  `applyImageEnhancements` (`useAIComponent.ts:81-90`) — the marker is
  already `'loaded'` before the effect returns; by the time
  `renderPadletOverlayToCanvas`'s two-RAF wait completes, the marker
  is already settled. Zero added wait for this case.
- **failed images:** `onerror` (line 58-71) sets
  `data-ai-image-state="error"` and still calls `markSettled()` — an
  error already counts as settled today. Our wait check only blocks on
  `[data-ai-image-state="loading"]`, so failed images never extend the
  wait — matches the required contract without any new logic.
- **delayed/incomplete images:** marked `'loading'` (line 92) until
  `onload`/`onerror` fires.
- **`decode()` is not used** by the existing mechanism (relies on
  `onload`/`onerror`/`img.complete` only) — this patch does not
  introduce it, keeping the reused mechanism byte-identical.

**Timing precedent already established and already proven (PATCH-101,
landed):** `useAIComponent.ts`'s effect (a standard `useEffect`, not
`useLayoutEffect`) reliably has run by the time
`renderPadletOverlayToCanvas`'s two-RAF wait completes — this is the
EXACT SAME timing assumption `CodeDiagramRenderer.tsx`'s async
Mermaid-render `useEffect` relies on, already proven correct by
PATCH-101's landed, passing spec (Flow A). No new timing risk is
introduced.

**Scope is legacy-HTML `<img>` tags only — explicitly NOT
generalizable to structured-content images:** `PhotoCardRenderer.tsx`
renders images via Next.js `<Image>` (`next/image`), an entirely
different code path with no `data-ai-image-state` or any comparable
marker. This is a separate, unaddressed, NOT-evidenced image-loading
race — explicitly excluded from this patch (see §9). CSS
`background-image` readiness and web-font readiness have no existing
marker anywhere in this codebase and are likewise explicitly excluded
(no evidence, not independently testable within this patch's scope).

**Cross-origin/canvas-tainting risk:** `html2canvas`'s `useCORS: true`
option is already passed today, unchanged by PATCH-100/101 and
unchanged by this patch — any cross-origin canvas-tainting risk is
pre-existing for ALL image-bearing content types captured by this
pipeline (legacy HTML, photo cards, link previews) and is not newly
introduced or worsened by this patch. This patch does not touch
`html2canvas` options.

## 1. Product contract (bind)

Slide-snapshot capture (`renderPadletOverlayToCanvas`) waits for
legacy-HTML `<img>` content to settle (load, error, or already-complete)
before calling `html2canvas`, ONLY when such content is present,
combined into the SAME bounded wait PATCH-101 already introduced for
Mermaid readiness — not a second, additive wait:

- **Combined wait scope:** the existing `pendingAtStart`/
  `waitForSnapshotDiagramReadiness` check (PATCH-101) is generalized
  to check the combined selector
  `'[data-ai-render-state="loading"], [data-ai-image-state="loading"]'`
  instead of the Mermaid-only selector. If empty, proceed to
  `html2canvas` immediately — **zero added latency** for slides with
  no pending Mermaid diagram AND no pending legacy-HTML image.
- **If non-empty:** poll every 100ms (same cadence) until the combined
  selector matches zero elements, or until `timeoutMs` (same 3000ms
  default, same non-production-only override) elapses. ONE shared
  budget covers both Mermaid and image readiness — this patch does
  NOT stack a second sequential 3-second wait after PATCH-101's.
- **Fallback on timeout:** proceed to `html2canvas` regardless — no
  thrown error, no user-visible message. Identical best-effort
  philosophy to PATCH-101.
- **Failed images count as settled** (marker becomes `'error'`, not
  `'loading'`) — never blocks or extends the wait.
- **No indefinite wait; no hard failure; no network or persistence
  side effects; no change to `useCORS`/`html2canvas` options.**
- **User-visible effect:** none beyond the intended reliability
  improvement — no new error states, no new UI, no perceptible delay
  for slides without pending Mermaid/image content; a bounded,
  invisible (off-screen host) delay of at most 3 seconds total
  (shared with Mermaid readiness, not additive) only when a slide
  contains currently-loading legacy-HTML images and/or a
  currently-rendering Mermaid diagram at the moment of capture.

**Explicitly out of scope, unchanged:**

- `PhotoCardRenderer.tsx`'s `next/image`-based images — no marker
  exists; not addressed
- CSS `background-image` readiness — no marker exists; not addressed
- web-font readiness — no marker exists; not addressed
- any change to `AIComponentRenderer.tsx`, `useAIComponent.ts`, or
  `applyImageEnhancements()`'s existing behavior
- any change to `CodeDiagramRenderer.tsx`, `data-ai-render-state`
  semantics, or the Mermaid readiness contract itself (PATCH-101,
  carried forward unchanged, just sharing its wait budget)
- any change to `AIComponentExportMenu.tsx`/`waitForDiagramRender()`
  (kept fully independent and untouched)
- any change to the runtime fullscreen player (PATCH-097/099) or the
  synchronous snapshot fix (PATCH-100)
- `HTMLImageElement.decode()` — not introduced
- any persistence, schema, migration, or database change

## 2. Exact production change (bind)

**Single file:** `components/presentation/slide-renderer/createSlideRenderer.tsx`
(already modified once by PATCH-101; this patch modifies it again).

1. Change the combined-readiness selector used by BOTH the
   `pendingAtStart` check and `waitForSnapshotDiagramReadiness()`'s
   internal poll from
   `'[data-ai-render-state="loading"]'` to
   `'[data-ai-render-state="loading"], [data-ai-image-state="loading"]'`.
   No other change to the function's signature, timeout default,
   poll cadence, or the `resolveSnapshotTimeoutMs()` override
   mechanism (all carried unchanged from PATCH-101).
2. No change to the `collabboard-ai-snapshot-capture-wait` event name
   or payload shape (`{waitedMs, timedOut, pendingCount}`) — carried
   byte-identical from PATCH-101; `pendingCount` now reflects the
   combined count across both marker families, requiring no new
   fields.
3. No other line in `createSlideRenderer.tsx` may change.

**Explicitly prohibited implementation choices (bind):** no change to
`AIComponentRenderer.tsx`, `useAIComponent.ts`, `applyImageEnhancements()`,
`CodeDiagramRenderer.tsx`, `data-ai-render-state` semantics,
`AIComponentExportMenu.tsx`/`waitForDiagramRender()`,
`PresentationPadletCard.tsx`, `PresentationContainerCard.tsx`,
`PhotoCardRenderer.tsx`, `lib/ai/diagram-engine.ts`,
`lib/ai/normalize-ai-content.ts`, `lib/ai/persistence.ts`, any runtime
fullscreen file, any other export-orchestration file
(`useSlideThumbnails.ts`, `PresentationPreviewModal.tsx`,
`exportToPDF.ts`, `exportToPPTX.ts`, `SharePresentationModal.tsx`,
`ExportMenu.tsx`); no `HTMLImageElement.decode()` introduced; no new
npm dependency; no change to the 3000ms default bound or 100ms poll
cadence; no CSS background-image or font readiness behavior.

## 3. Regression/characterization spec (bind)

ONE new spec (absence gate):
`e2e/characterization/presentation-snapshot-image-readiness.spec.ts`.
Same harness conventions as PATCH-097/099/100/101. Bound prefix:
`patch-064-harness-patch-102-image-readiness-`. Playwright `page.route()`
interception is used to deterministically control image response
timing — no real external network dependency, no credential capture,
purely fulfilling a request with a locally-defined synthetic PNG body
and a controlled, test-driven delay (a legitimate, fully deterministic
Playwright technique, not wall-clock racing, since the test itself
decides exactly when the response resolves).

- **Flow A — no image, plain legacy HTML:** seed one `ai-component`
  padlet with `metadata.savedAIComponent.code` containing plain text
  HTML with no `<img>` tag, plus one non-AI control padlet. Register
  the `collabboard-ai-snapshot-capture-wait` listener (buffered,
  before triggering) and open the Preview modal. Assert the event
  fires with `pendingCount === 0` immediately (no poll loop entered).
- **Flow B — already-complete image (inline data: URI):** seed a
  legacy-HTML padlet whose `<img src="data:image/png;base64,...">`
  resolves synchronously/near-instantly. Assert `pendingCount === 0`
  and `timedOut === false`, capture completes.
- **Flow C — delayed image load:** seed a legacy-HTML padlet with an
  `<img src="https://patch-102.test/delayed.png">`; `page.route()`
  intercepts that exact URL and fulfills it (a small embedded PNG
  buffer) after a controlled ~500ms delay. Assert the event fires
  with `timedOut === false` and `pendingCount === 0` (image settled
  before the 3000ms bound), and the preview `<img>` populates.
- **Flow D — image error:** `page.route()` intercepts a second image
  URL and aborts/fails the request. Assert `data-ai-image-state`
  transitions to `'error'` (verified indirectly via the event: the
  wait resolves with `timedOut === false` and `pendingCount === 0`
  once the error fires — an errored image is never "pending"), and
  capture still completes with no thrown error.
- **Flow E — forced timeout, image never resolves within the bound:**
  `page.evaluate(() => { window.__patch101TimeoutOverrideMs = 100; })`
  (the SAME non-production-only override introduced by PATCH-101,
  reused unchanged); `page.route()` delays the image response by
  ~2000ms (well past the 100ms override). Assert the event fires with
  `timedOut === true`, and the preview `<img>` STILL populates
  (capture completed despite the pending image).
- **Flow F — Mermaid readiness remains intact (carried regression):**
  re-seed PATCH-101's Mermaid fixture; assert `pendingCount === 0`/
  `timedOut === false` exactly as PATCH-101's own Flow A, proving the
  combined selector does not regress the Mermaid-only case.
- **Flow G — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0).

The test does not use pixel-perfect image comparison. It does not
race the transient off-screen host — the instrumentation event is
registered before the triggering action, exactly as established by
PATCH-100/101.

## 4. Allowed files (bind)

| File | Role | Starting state at base `5c36305` |
|---|---|---|
| `components/presentation/slide-renderer/createSlideRenderer.tsx` | generalize the existing bounded wait to also cover legacy-HTML image readiness | blob `39b7b18bf107b87ff135242f1391ec2490442036` |
| `e2e/characterization/presentation-snapshot-image-readiness.spec.ts` | NEW regression spec | absent at base (absence gate) |

TWO files total (one modified, one new). NO other production file.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent; the
PATCH-097, PATCH-099, PATCH-100, and PATCH-101 specs (all four)
present and UNMODIFIED at base and post-implementation (blobs must
match exactly, before and after).

## 5. Immutable fences (bind — 75, Git blob IDs)

Verify each with `git rev-parse 5c36305:<path>` and equality at the
current governance HEAD. The 73-entry set carried from PATCH-101's
closure (`createSlideRenderer.tsx` was never in that list, since it
was PATCH-101's own allowed/modified file — it remains the
allowed/modified file here too), PLUS the PATCH-101 spec (carried
forward as an explicit immutable regression gate), PLUS
`components/ai/renderers/PhotoCardRenderer.tsx` (inspected and
confirmed to have its own separate, unaddressed image-readiness gap —
explicitly excluded from this patch, fenced to prove it stays
untouched) = 73 + 1 + 1 = **75**.

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
components/presentation/useSlideThumbnails.ts                 19801ae2c2b0ddc8841e358ad0fbc7cde96708f3
components/presentation/PresentationPreviewModal.tsx           5116031b27f73bb7616f4024b197824c6718aa17
components/presentation/exporters/exportToPDF.ts               5bc675b48acf9f8c9493001938c6d9b43475772a
components/presentation/exporters/exportToPPTX.ts              4a3b503386f8ddb306ae8b074f98d1c2d60c541f
components/presentation/SharePresentationModal.tsx             c6103da9dd4ea7ebdc94b096ffa435026f7b48a2
components/presentation/ExportMenu.tsx                          7ae9ba569d50c8b6ef403b9c993e297ba8e29c50
components/collabboard/AIComponentExportMenu.tsx               dbd5cef919dbcb6e9cd6bc54a7b723b958491835
components/ai/renderers/CodeDiagramRenderer.tsx                80d05e5ce1c6e2a17aa5e5d97afc8cb0a6f6819d
e2e/characterization/presentation-ai-component-structured-render.spec.ts 2efbfb9047fabce3cae3d5730d1a42a431b788bf
components/presentation/slide-renderer/PresentationPadletCard.tsx cfc6d7b49bdcae93134a4944339f6649f8547510
e2e/characterization/presentation-snapshot-ai-component-render.spec.ts 76f9c84c9c79a5a96c6f9f8cb0e57dc007bb16cf
lib/ai/diagram-engine.ts                                       e68c3e47bf8751560cc47eac91f7edbcac4b471e
e2e/characterization/presentation-snapshot-diagram-readiness.spec.ts adcc30bb14461fba3253e533385f9f1ec18fef8c
components/ai/renderers/PhotoCardRenderer.tsx                  7aff9e88077f3096aabdd735dc62e590ac09c395
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 75; unique paths = 75; unique path/blob pairs = 75;
duplicates = 0; malformed = 0.

## 6. Deterministic and live gates (bind)

Deterministic (unchanged expected totals): `git diff --check`,
`npx tsc --noEmit`, `npm run check:boundaries`,
`npx vitest run lib/infra/presentation/slideOrder.test.ts` (7/1),
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts` (9/1),
`npx vitest run` (448/43), `npm run verify`, `npm run build`.

Live (self-started `npm run dev -- --port 3000` + `PW_BASE_URL`, never
concurrent with build/verify): the new image-readiness spec
(dependency mode, `--no-deps`, credential-off, JSON reporter, three
stability runs); carried gates — the UNMODIFIED PATCH-097, PATCH-099,
PATCH-100, and PATCH-101 specs must all still pass with their original
classifications; PATCH-096 grouped runner (14/14/14, 0/0/0 incidents);
PATCH-094/093/091/090/089 classifications unchanged.

## 7. Cleanup contract (bind)

Board prefix `patch-064-harness-patch-102-image-readiness-` must reach
`{boards: 0, padlets: 0, canvasLines: 0}` in every run. No
`test-results/` beyond the gitignored `.last-run.json`, no
`playwright-report/`, no JSON reporter output, no scratch/parser
scripts left behind. Ports 3000/4000 free at close.

## 8. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (75/75), or any §4 absence gate differs;
- any file outside §4's two is touched;
- the PATCH-097, PATCH-099, PATCH-100, or PATCH-101 spec is modified
  in any way — all four blobs must be bit-for-bit identical before
  and after;
- `AIComponentRenderer.tsx`, `useAIComponent.ts`,
  `applyImageEnhancements()`, `CodeDiagramRenderer.tsx`,
  `data-ai-render-state` semantics, `AIComponentExportMenu.tsx`,
  `waitForDiagramRender()`, `PresentationPadletCard.tsx`,
  `PresentationContainerCard.tsx`, `PhotoCardRenderer.tsx`,
  `diagram-engine.ts`, `normalize-ai-content.ts`, `persistence.ts`, any
  runtime fullscreen file, or any export-orchestration file
  (`useSlideThumbnails.ts`, `PresentationPreviewModal.tsx`,
  `exportToPDF.ts`, `exportToPPTX.ts`, `SharePresentationModal.tsx`,
  `ExportMenu.tsx`) is modified;
- the default timeout changes from 3000ms or the poll cadence changes
  from 100ms in a normal (non-overridden) run;
- the wait budget becomes additive (two separate 3-second waits)
  instead of one shared combined wait;
- `HTMLImageElement.decode()` is introduced;
- the timeout override is reachable or has any effect in a production
  build;
- the instrumentation payload changes shape or contains AI content,
  HTML, or padlet metadata beyond `{waitedMs, timedOut, pendingCount}`;
- capture ever throws or fails to complete on timeout or image error;
- any latency is added for slides with zero
  `[data-ai-render-state="loading"], [data-ai-image-state="loading"]`
  matches at check time;
- the new spec relies on wall-clock racing rather than the buffered
  instrumentation event and controlled `page.route()` delays;
- CSS background-image or font readiness behavior is added or claimed
  fixed;
- `PhotoCardRenderer.tsx`'s image readiness is claimed fixed;
- any migration/RPC/move work enters scope;
- carried PATCH-089 through PATCH-101 evidence is weakened;
- cleanup cannot reach zero;
- any generated artifact remains after review.

## 9. Deferred follow-up (bind, NOT authorized by this patch)

`PhotoCardRenderer.tsx`'s `next/image`-based photo-card images have no
existing readiness marker and are NOT addressed by this patch — a
separate, evidenced-but-unaddressed candidate that would require
either adding a new marker (analogous instrumentation, not reused from
anywhere) or a different mechanism (e.g. `next/image`'s `onLoad`
callback), warranting its own dedicated investigation. CSS
`background-image` and web-font readiness likewise have no existing
marker anywhere in this codebase and remain unaddressed.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted two-file diff + report (blobs
re-derived; exact selector change verified against §2; new spec
passing Flows A-G; PATCH-097/099/100/101 spec blobs unchanged;
carried/deterministic totals; 75-fence result; cleanup proof). The
independent reviewer (Kepler primary, Gemini 3.1 Pro fallback — NOT
Sonnet) re-derives everything live and must return an explicit PASS
before the implementer commits with the bound message and pushes.
Sonnet (CTO) closes only after PASS + landing are independently
confirmed.

## 11. Required final report

Exact two changed/added paths + final blobs; the exact selector change
verified against §2; new spec Flow A-G results (including confirmation
the instrumentation event was registered before the triggering action,
and that `page.route()` delays were used, not wall-clock racing);
explicit confirmation the PATCH-097, PATCH-099, PATCH-100, and
PATCH-101 spec blobs are unchanged; carried totals (089-101 unchanged);
deterministic totals; 75-fence result + absence gates; cleanup proof;
explicit confirmations (no file outside §4 touched, zero added latency
for slides with no pending Mermaid/image content, wait budget shared
not additive, timeout override confirmed inert in a production build,
`AIComponentRenderer.tsx`/`useAIComponent.ts`/`AIComponentExportMenu.tsx`
untouched); commit hash + push status after PASS.

## 12. PATCH-103 prerequisite resolved — restoration and resumption plan (bind, 2026-07-22)

**PATCH-103 closed DONE** at commit
`75343360c510571fecf584637a58e8a4211ee63a`
(`fix(e2e): exempt padlet-record-synced embeddable width from the
exact-seed-geometry invariant (PATCH-103)`), independent PASS
confirmed, HEAD == origin/main, working tree clean. Full closure
record: `PATCH-103.md`'s own status line and CURRENT_TASK.md.

**Stash verification (read-only inspection, stash not popped/dropped/
modified):** `stash@{0}` = `PATCH-102-candidate-before-PATCH-103`,
confirmed via `git rev-parse stash@{0}:...`, `git rev-parse
stash@{0}^3:...` (the untracked-file commit), and `git ls-tree -r
--name-only stash@{0}^3` — contains **exactly**:

- modified: `components/presentation/slide-renderer/createSlideRenderer.tsx`,
  blob `a15659f7fc3e1ae1d5825bf68df22f3190bfa41e` — matches expected.
- untracked: `e2e/characterization/presentation-snapshot-image-readiness.spec.ts`,
  blob `0c6ef9ce0789c9612d0ab450e04d20c3e026d1c0` — matches expected.

No other file present in either the index or untracked commit of the
stash. Stash identity confirmed exact.

**Compatibility classification: A for git-mechanical restoration —
confirmed, not assumed.** `stash@{0}`'s base commit
(`stash@{0}^1` = `8a3f111994f7074c32be599b55edf3bc8a4c8e85`) and current
governance HEAD were diffed directly:
`git diff --stat stash@{0}^1 HEAD` shows changes in exactly 5 paths —
the 2 governance docs and PATCH-103's 3 bound files
(`DrawingLayout.tsx`, `drawingBridgeHarness.ts`,
`drawing-presentation.spec.ts`). **`createSlideRenderer.tsx` is
byte-identical between the stash's base and current HEAD**
(`39b7b18bf107b87ff135242f1391ec2490442036` both before and after,
confirmed by direct blob comparison, not inferred from the stat diff
alone) — PATCH-103 touched zero lines anywhere under
`components/presentation/`. A `git stash apply`/`pop` of this stash is
therefore a guaranteed clean three-way merge with no possible conflict
on the one modified file, and the one new file has no counterpart to
conflict with.

**A second, independent finding, NOT assumed away (Phase 4's explicit
instruction) — PATCH-102's own new spec file carries a latent instance
of the exact defect class PATCH-103 was created to fix, and PATCH-103
did NOT and could not have fixed it (out of its bound scope):**
`presentation-snapshot-image-readiness.spec.ts` defines its own local,
unexported `sceneBase()`/`frameElement()`/`embeddableElement()`
fixture builders (it cannot import the harness's equivalents — none of
`nextFixtureFractionalIndex`, `embeddableElement`, `frameElement`, etc.
in `drawingBridgeHarness.ts` are exported, confirmed by grep) and its
local `sceneBase()` still hard-codes `index: null`, byte-for-byte the
same defect PATCH-103 §0 fixed in the shared harness. PATCH-103's own
investigation record explicitly named this exact file as inheriting
the same fixture pattern and remaining unfixed by its scope (§0: "every
spec that copies the same `sceneBase()`-style local builder
pattern... and PATCH-102's own still-uncommitted
`presentation-snapshot-image-readiness.spec.ts` — inherits the same
`index: null` fixture data"). Left uncorrected, every one of this
spec's 6 tests will hit the same `InvalidFractionalIndexError` PATCH-103
exists to prevent, before ever reaching the assertions PATCH-102 is
meant to characterize — this is not a hypothetical, it is the
identical mechanism already proven live across §0/§0.1 of PATCH-103.

**Net restoration workflow (bind) — authorized, with one bound
corrective sub-step required before any live gate is attempted:**

1. Read-only re-verify the stash (`git stash list`, blob checks above)
   immediately before applying — already done this turn, re-confirm at
   restoration time.
2. `git stash apply stash@{0}` (apply, not pop, so the stash is not
   dropped until restoration and the full gate matrix below are
   independently proven) against current HEAD
   (`75343360c510571fecf584637a58e8a4211ee63a`). Confirm via
   `git diff --name-only` that exactly the two expected paths are
   dirty and `git hash-object` shows the two expected blobs unchanged
   from the stash.
3. **Bound corrective sub-step (new, narrowly scoped, required before
   §6's live gates):** in
   `e2e/characterization/presentation-snapshot-image-readiness.spec.ts`
   only, add a local fractional-index generator identical in scheme to
   `drawingBridgeHarness.ts`'s `nextFixtureFractionalIndex()`
   (deterministic, monotonically increasing, e.g. `a000001, a000002,
   ...` — do not import from `drawingBridgeHarness.ts`, since it does
   not export this helper and re-exporting it would require reopening
   the closed PATCH-103), and replace this file's own `index: null`
   literal in its local `sceneBase()` with a call to it. This is the
   ONLY change authorized beyond the already-stashed candidate content
   — no other line in either of the two restored files may change.
4. Re-run every PATCH-102 gate already bound in §6/§7/§8/§11 of this
   document against the restored + corrected candidate: the full Flow
   A-G authenticated live matrix, confirmation PATCH-097/099/100/101
   spec blobs remain unchanged, the 75-fence carried set, absence
   gates, deterministic totals, cleanup proof.
5. Additionally re-run, given PATCH-103 just changed
   `drawingBridgeHarness.ts`/`DrawingLayout.tsx`: `drawing-line-bridge.spec.ts
   -g "renders seeded attached"`, full `drawing-line-bridge.spec.ts`,
   `drawing-presentation.spec.ts` (§9-§12's now-closed scenario), and
   the PATCH-096 grouped runner at exactly 14/14/14 with zero
   non-signature failures and exit code 0 — proving PATCH-103's landed
   fix and PATCH-102's restored candidate coexist cleanly.
6. Only after a fresh independent PASS (Kepler primary, Gemini 3.1 Pro
   fallback — NOT Sonnet) covering both the restored candidate and the
   corrective sub-step does the implementer commit with this
   document's already-bound commit message (§ header) and push.
   Sonnet (CTO) does not drop the stash until this PASS is obtained and
   the commit lands — if the corrective sub-step or any gate fails, the
   stash is left exactly as restored (or re-stashed under the same
   name) and this section is amended honestly, not silently retried.

**Explicitly prohibited by this restoration:** no change to
`DrawingLayout.tsx` or `drawingBridgeHarness.ts` (both remain closed
under PATCH-103, blobs `539f85b127db938d7ee6c72d32fe913cb88f35f1` and
`9388086c4354e69290d9de2b7e1f2ecedcd15c45`); no change to
`createSlideRenderer.tsx` beyond what the stash already carries; no
change to `presentation-snapshot-image-readiness.spec.ts` beyond the
one bound corrective sub-step (its own local fractional-index fix); no
PATCH-104 work of any kind.

**Do not authorize PATCH-104.**

## 13. Delayed-image readiness investigation and amendment (bind, 2026-07-22)

**Reported live result with §12's corrective sub-step applied**
(blobs `createSlideRenderer.tsx` → `a15659f7fc3e1ae1d5825bf68df22f3190bfa41e`,
`presentation-snapshot-image-readiness.spec.ts` →
`74013f2b2d9afee2fe8d0fa5d0601762af31ef55`): run 1 = 2 passed, 3
skipped (serial-mode cascade after the first failure — matches file
order exactly: error/forced-timeout/mermaid-carry), 1 unexpected. The
failing test, `waits for a delayed legacy HTML image load before
capture`
(`presentation-snapshot-image-readiness.spec.ts:406`), timed out after
90s on the predicate `delayed-image wait event observes settlement
before timeout` — expected `true`, received `false`.

**Root cause, traced by source (not independently live-verified this
turn — I do not have live browser/network-execution tooling in this
environment; the mechanism below is fully determined by documented
browser behavior plus the exact code paths involved, but GPT-5.5 must
confirm it live before treating it as closed — see required gates):**

1. `createSlideRenderer.tsx`'s snapshot host
   (`components/presentation/slide-renderer/createSlideRenderer.tsx:68-77`)
   is created with `position: fixed; left: -100000px` — deliberately
   far outside any viewport, by design, since it exists only for
   `html2canvas` capture.
2. `hooks/useAIComponent.ts`'s `applyImageEnhancements()`
   (lines 24-96, confirmed **unmodified** by PATCH-102's diff and
   already explicitly prohibited from modification by §2) sets
   `img.loading = 'lazy'` unconditionally on every `<img>` inside
   legacy-HTML AI content (line 44), for every render of that content
   anywhere in the app — live board, editor, and this offscreen
   snapshot host alike. If `img.complete` is false at that moment, it
   also sets `data-ai-image-state="loading"` (line 92) and relies
   entirely on the image's own native `load`/`error` events to flip the
   marker (lines 58-79).
3. Native `loading="lazy"` uses `IntersectionObserver` against the
   viewport (or nearest scrollable ancestor) to decide when to actually
   start the fetch. An element permanently positioned at
   `left: -100000px` can never intersect the viewport — the browser
   will defer the fetch indefinitely. Because
   `applyImageEnhancements()` runs synchronously (inside the AI-content
   component's own `useEffect`, itself flushed as a React 18 passive
   effect before the double-`requestAnimationFrame` in
   `createSlideRenderer.tsx:185` resolves) immediately after
   `container.innerHTML = normalizedHtml` inserts the `<img>`, the
   `loading = 'lazy'` assignment lands before the browser's normal
   (task-queued, not synchronous) image-fetch dispatch — so the
   deferral takes effect for real, non-cached images.
4. This explains every observed data point precisely: the
   "cached-image" test (a `data:` URI, `img.complete` true
   near-instantly regardless of `loading`) and the "no-image" test
   (zero `<img>` elements, `onAnyImageSettled()` fires immediately) do
   not depend on the fetch ever starting, and both passed. The
   "delayed-image" test uses a real `https://` URL requiring an actual
   network fetch — which, inside this permanently off-viewport host,
   never begins, so `data-ai-image-state` never leaves `"loading"`,
   `pendingCount` never reaches 0 on its own, and the predicate
   requiring `timedOut === false && pendingCount === 0` can never
   become true — it can only ever resolve via the governed 3000ms
   timeout path (`timedOut: true`), which the test correctly does NOT
   accept for this scenario. This is not specific to PATCH-102's
   candidate: `applyImageEnhancements()` and the host's
   `left: -100000px` positioning both predate this patch entirely,
   confirmed unmodified by its diff.

**Verification of the wait mechanism itself (Phase 5) — confirmed
correct, no change needed:** the combined selector
(`[data-ai-render-state="loading"], [data-ai-image-state="loading"]`),
the shared 3000ms default timeout (`resolveSnapshotTimeoutMs()`), the
100ms poll cadence, the pending-count recomputation each poll, the
zero-pending early resolve, the `collabboard-ai-snapshot-capture-wait`
event name and `{waitedMs, timedOut, pendingCount}` payload, and the
proceed-after-timeout (non-throwing) behavior are all exactly as
specified and unchanged by this investigation's proposed fix. **The
defect is not in the wait mechanism — it is that the thing being
waited for can never resolve naturally inside this specific host.**

**Classification: H — the image remains loading beyond the governed
timeout, due to a genuine, pre-existing production defect** (not test-route
error, not an invalid fulfilled response, not a wrong-event
observation, not caching): `page.route()` interception, the fulfilled
PNG body, and the event/listener wiring were all independently traced
and found correct — the route pattern is an exact string match against
the seeded `<img src>` (`https://patch-102.test/delayed.png`), the
fulfilled body is a valid decodable PNG buffer (`SYNTHETIC_PNG`,
already proven decodable by the "forced-timeout" test's own fixture
using the identical buffer), and `installSnapshotWaitBuffer` registers
its listener before `openPreviewModal` triggers capture (matching the
established PATCH-100/101 instrumentation pattern used unmodified
here). None of A/B/C/D/E/F/G apply; G (production selector not
observing legacy markers) is close but incorrect — the selector DOES
observe `data-ai-image-state`, correctly; the marker itself simply
never updates.

**Minimum safe fix (bind) — production correction, scoped to the
already-authorized file, no new file, no change to
`useAIComponent.ts`:**

In `components/presentation/slide-renderer/createSlideRenderer.tsx`,
immediately after `sanitizeExportOverlayColors(host);`
(line 186) and before computing `pendingAtStart` (line 187), add:

```ts
host.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => {
  img.loading = 'eager';
});
```

This forces any `<img>` inside the offscreen snapshot host that
`applyImageEnhancements()` marked `loading="lazy"` to switch to eager
loading — per documented browser behavior, changing an already-deferred
image's `loading` attribute from `lazy` to `eager` triggers the
deferred fetch to begin immediately, rather than waiting indefinitely
for an intersection that this permanently off-viewport host can never
produce. This does not touch `useAIComponent.ts`, does not change
`applyImageEnhancements()`'s behavior for the live board or editor
(where lazy-loading remains genuinely useful), and does not change the
wait mechanism, event, timeout, or poll cadence in any way — it only
ensures the offscreen host's own images are eligible to actually
settle within the governed window the wait mechanism already enforces
correctly.

**§2 amendment (supersedes the prior "no other line in
`createSlideRenderer.tsx` may change" restriction for this one
addition only):** the exact block above is now an additional
authorized change to `createSlideRenderer.tsx`, on top of §2's already-authorized
selector generalization. Every other prohibition in §2 remains in full
force, in particular: no change to `useAIComponent.ts`,
`applyImageEnhancements()`, `data-ai-render-state` semantics, or any
other file in §2's prohibited list; no change to the 3000ms timeout,
100ms poll cadence, event name, or payload shape; no new npm
dependency.

**Required live gates (bind, non-skip real results required for
all):**

1. The delayed-image test — **at least 3 consecutive real runs**, each
   producing a wait event with `waitedMs > 0`, `timedOut === false`,
   `pendingCount === 0`, and `waitedMs < 3000`, and the Preview modal
   populating.
2. The full `presentation-snapshot-image-readiness.spec.ts` suite (all
   6 tests, no serial-mode skip cascade) — no-image, cached-image,
   delayed-image, image-error, forced-timeout, and Mermaid-carry all
   passing with real (non-skipped) results.
3. PATCH-097, PATCH-099, PATCH-100, PATCH-101 spec blobs confirmed
   unchanged; all four passing.
4. `drawing-line-bridge.spec.ts -g "renders seeded attached"` and the
   full `drawing-line-bridge.spec.ts` (PATCH-103 coexistence).
5. `drawing-presentation.spec.ts` (PATCH-103 §9-§12's scenario).
6. PATCH-096 grouped runner — exactly 14 groups, 14 specs, 14 final
   passes, zero non-signature failures, exit code 0.
7. Cleanup proof (board-prefix cleanup reaching zero; no leftover
   `test-results/`/`playwright-report/`/JSON reporter output; ports
   3000/4000 free at close).

**Hard-stop conditions (bind, in addition to §8):** STOP immediately,
report, do not commit, if:

- any change lands in `useAIComponent.ts`, `applyImageEnhancements()`,
  or any other file in §2's prohibited list;
- the eager-load correction is applied anywhere other than
  `createSlideRenderer.tsx`'s offscreen snapshot-host path (in
  particular, not applied to the live board or editor rendering path);
- the wait mechanism's selector, timeout, poll cadence, event name, or
  payload shape changes;
- the delayed-image assertion is weakened, relaxed, or removed instead
  of made to genuinely pass;
- any of the required live gates fails or is skip-only;
- PATCH-096 does not report exactly 14/14/14, zero non-signature
  failures, exit code 0;
- credentials are printed, logged, or committed anywhere;
- the PATCH-102 stash (already restored, per §12) or any file is left
  in an inconsistent state without an honest governance update.

**Bound implementation commit message (verbatim, supersedes the
document header's original message for the eager-load addition —
combined with the already-bound §2 change into one commit):**
`fix(presentation): force eager image loading in offscreen snapshot host before legacy-image readiness wait (PATCH-102)`

**Review and commit flow:** implementer applies exactly the eager-load
correction above (plus the already-restored §12 candidate content) to
`createSlideRenderer.tsx`, re-runs every gate listed above with real
output, and delivers a report matching §11's required-final-report
shape plus explicit before/after evidence for the delayed-image
mechanism (network panel or `img.complete`/`naturalWidth` state at
each poll, if obtainable). The independent reviewer (Kepler primary,
Gemini 3.1 Pro fallback — NOT Sonnet) re-derives everything live and
must return an explicit PASS before commit. Sonnet (CTO) does not
treat this classification as final until that live PASS confirms the
traced mechanism matches reality.

**Do not authorize PATCH-104.**

## 14. Duplicate route-handling investigation (bind, 2026-07-22 — diagnostic step only, no fix yet authorized)

**§13's eager-load correction is CONFIRMED LANDED as authorized** —
verified via `git diff` against blob
`ef8c1a9b7a9521a6a68d40e661ee50effff986fd`: exactly the one authorized
block added (`host.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach(...)`),
inserted at exactly the authorized location, nothing else in the file
changed. **Retained — this investigation found no evidence against
it** (the reported single passing run, with real settlement events at
`waitedMs` 551/880/1373, confirms the eager-load fix does make the
image settle naturally; the new failure is a *different* mechanism
that only surfaces once settlement succeeds and `html2canvas` actually
runs against a loaded image).

**Exact route registrations and ownership, verified by source (not
live) — confirmed clean, no overlap:**

- `presentation-snapshot-image-readiness.spec.ts` registers
  `page.route()` exactly **three** times total in the whole file — once
  per test, each with a **distinct, non-overlapping URL** unique to
  that test: `https://patch-102.test/delayed.png` (line 410,
  delayed-image test), `https://patch-102.test/error.png` (line 445,
  image-error test), `https://patch-102.test/timeout.png` (line 471,
  forced-timeout test). Each test unroutes its own URL in its own
  `finally` block (lines 434, 460, 502). No test's route pattern can
  match another test's URL.
- No `context.route()` call anywhere in this file.
- No route registration of any kind in `drawingBridgeHarness.ts` or
  `e2e/helpers/*.ts` (grepped, zero matches).
- `playwright.config.ts:21` — `retries: process.env.CI ? 2 : 0` — if
  this was run outside CI, Playwright performed zero automatic test
  retries; even where retries apply, Playwright allocates a fresh
  browser context (and therefore a fresh, unregistered route table)
  per retry, so a retry could not itself carry over a stale route
  registration from a prior attempt.

**Conclusion: the double-handling is not caused by the test's own
route bookkeeping** — registration is single, scoped, and cleanly
torn down. The duplicate request must originate from the underlying
browser/rendering pipeline issuing a second real request to the exact
same URL within one test execution.

**Exact double-handling sequence, as reported (not independently
live-traced this turn — no live network-panel tooling available in
this environment):** within a single run, the delayed-image test's
route handler (`fulfillSyntheticPngAfterDelay`, 500ms artificial delay)
was invoked, awaited its delay, and called `route.fulfill()`
successfully once (matching the earlier single-pass success with real
`waitedMs` values). On the subsequent required-stability run, the
identical registered handler raised `route.fulfill: Route is already
handled!` — Playwright's own error for calling a terminal action
(`fulfill`/`continue`/`abort`) more than once against what it
considers the same intercepted request lifecycle. The failed trace
then showed only zero-wait events, consistent with the image never
settling naturally in that run (the second/conflicting request
attempt likely aborted or errored before either fulfill could
complete cleanly).

**Most evidence-aligned hypothesis (NOT proven — requires live
instrumentation before being treated as fact):** `createSlideRenderer.tsx`'s
`html2canvas(host, { ..., useCORS: true, ... })` call
(line 203-207, confirmed via grep — `useCORS: true` is set) runs
**after** the readiness wait resolves. html2canvas's own internal
resource loader is documented to perform its **own independent fetch**
of each `<img src>` it encounters while rasterizing — separate from
whatever the live DOM `<img>` element already did — specifically to
obtain CORS-safe pixel data when `useCORS` is enabled. Before §13's
eager-load fix, the DOM image never loaded at all (permanently
deferred), so html2canvas's own secondary fetch attempt (if any) may
have been masked by the same never-resolving state, or by the fact the
test never reached a passing state to observe it. Now that §13 makes
the DOM image load successfully and the wait resolve, `html2canvas`'s
own subsequent fetch of the identical URL becomes newly observable —
and if Playwright, in a rare but documented edge case, treats a
same-URL request that arrives while a prior interception's async
handler is still settling (our 500ms artificial delay) as reusing
handling state rather than a fully independent `Route`, that would
produce exactly the observed "already handled" error. This is a
**hypothesis, not a proven finding** — it is not live-verified, and an
equally plausible alternative (a genuine browser-level retry/reload of
the same image request, independent of html2canvas) has not been
ruled out either.

**Root-cause classification: NOT YET PROVEN — instrumentation
required.** Per explicit instruction, no corrective implementation
step is authorized until the route-ownership mechanism is proven live.
Both live candidate mechanisms (html2canvas's own secondary
image-fetch under `useCORS: true`, vs. a genuine duplicate/retried
browser-level request) remain open until instrumented evidence
distinguishes them.

**Minimum safe spec-only correction: NOT YET SUPPORTED.** A
defensive fix exists in principle (e.g. tolerating a second terminal
action on an already-handled route, or counting/bounding requests
instead of assuming exactly one) but authorizing it now would mean
guessing at the mechanism rather than proving it — explicitly
prohibited this turn. No fix of any kind is authorized in this
section.

**Authorized next step — diagnostic instrumentation only, in the
already-authorized spec file, no production file touched:** add a
non-invasive request-observation counter to the delayed-image test
only (mirroring the existing `installSnapshotWaitBuffer`/
`__patch102WaitEvents` pattern already used in this file — a buffered,
test-only array, no production code involved): wrap the existing route
handler to record, for every invocation, the request URL, a
monotonically increasing invocation index, and whether that
invocation's `route.fulfill()` succeeded or threw (capturing the
error message rather than letting it propagate uncaught), without
changing the route's actual fulfillment behavior or timing in any way.
Run the delayed-image test with this instrumentation at least 3
consecutive times and report the exact per-run invocation count and
outcome for each. This is a **read-only diagnostic addition** — it
must not swallow, retry, or alter any request's outcome, and must not
be treated as a fix.

**Request-count and cleanup contract (bind, pending proof):** once the
invocation count is proven (1 vs. 2, and whether the second is from
html2canvas or a genuine duplicate), the spec's cleanup contract
(`page.unroute(imageUrl)` in `finally`, board-prefix cleanup reaching
zero) remains unchanged and must continue to pass regardless of the
final fix shape — the diagnostic counter itself must be cleared/reset
per test run and must not leak state across tests or contribute to any
cleanup-count assertion.

**Hard-stop conditions (bind, in addition to §8/§13):** STOP
immediately, report, do not commit, if:

- any production file is touched by this diagnostic step (it is
  spec-only, by design);
- the diagnostic instrumentation itself swallows, retries, or alters
  any route's fulfillment behavior (it must observe only);
- a corrective fix is applied before the invocation count and source
  are proven live;
- credentials are printed, logged, or committed anywhere.

**Do not authorize PATCH-104.**

## 15. Route-lifecycle synchronization amendment (bind, 2026-07-22)

**§14's diagnostic instrumentation proved its purpose and is now
disposed of per this section.** Diagnostic blob
`ab0d80abed6c7fba810dcb78b23fc4ff002620ab` confirmed, across 3 runs
(13/17/100 route invocations respectively), that:

- every invocation carried a **distinct** Playwright `Request` object
  (verified via the diagnostic's own `WeakMap<Request, number>`
  sequencing) — this is not one handler double-fulfilling a single
  request.
- every request was a genuine `GET` for the exact same image URL,
  originating from either the live dashboard frame or an `about:blank`
  frame (the offscreen snapshot host's `createRoot` render target).
- the delayed-image readiness assertion and Preview capture completed
  successfully **before** the observed failure in run 1 — the failing
  `route.fulfill: Route is already handled!` came from a **later**,
  still-in-flight invocation (run 1: invocations 11-13 still
  incomplete when `finally`'s diagnostics were collected), not from
  anything the product assertion depends on.

**Classification: B — page/context teardown races an in-flight
delayed route handler**, refined from §14's two open hypotheses.
Neither open question from §14 blocks this classification:
html-canvas-vs-other-frame attribution for each `about:blank` request
remains formally unconfirmed, but it no longer matters — the fix does
not depend on WHICH subsystem issues a given request, only on the
fact that requests can legitimately keep arriving for as long as the
page/frames are alive, and the test's `finally` block calls
`page.unroute(imageUrl)` without first confirming every in-flight
500ms-delayed handler has completed. Once cleanup deletes the
underlying board/padlets and the test function returns, Playwright
begins tearing down the page/context for the next serial test; a
handler still awaiting its artificial delay at that moment has its
eventual `route.fulfill()` call race against that teardown, producing
exactly the observed error on a request that has nothing to do with
the (already-passed) product assertion. This matches Phase 2 options
A/B/C combined — the precise trigger is teardown-timing, not a single
isolated mechanism, and no further live distinction between them is
required to author a correct fix: **the fix must make `page.unroute()`
wait for every outstanding handler to settle, not guess about the CDP
internals of why the race manifests as this specific error text.**

**Minimum safe correction (bind) — spec-only, in the already-authorized
file, no production change, no broad error suppression:**

`e2e/characterization/presentation-snapshot-image-readiness.spec.ts`,
current diagnostic blob `ab0d80abed6c7fba810dcb78b23fc4ff002620ab`,
amended in the delayed-image test only:

1. **Route registration strategy — unchanged in shape:** keep the
   single exact-string `page.route(imageUrl, handler)` registration.
   The handler must continue to support an unlimited number of
   distinct requests, fulfilling each exactly once with the same
   deterministic delayed response (500ms artificial delay,
   `SYNTHETIC_PNG` body, `status: 200`, `contentType: 'image/png'` —
   byte-identical to the current candidate; no header or timing
   change).
2. **In-flight tracking strategy:** maintain a single `Set<Promise<void>>`
   (e.g. `inFlightHandlers`) scoped to the test. On each route
   invocation, create the handler's async work as its own promise, add
   it to the set immediately, and remove it from the set in a
   `.finally()` attached to that same promise — regardless of whether
   the handler's `route.fulfill()` resolved or threw. This replaces
   §14's `routeDiagnostics` array and its per-invocation timing/URL/
   frame logging; the `WeakMap<Request, number>` sequencing counter is
   no longer needed (its one job — proving distinct-Request identity —
   is already proven and closed by this section) and must be removed.
3. **Request counter — retained, minimal:** keep a single plain
   incrementing counter (e.g. `requestCount`) for the sole purpose of
   the required assertion below; remove `requestSequenceCount` and the
   `WeakMap`.
4. **Cleanup order (bind, this is the actual fix):** in the test's
   `finally` block, **before** calling `page.unroute(imageUrl)`, await
   every promise currently in `inFlightHandlers`
   (`await Promise.allSettled([...inFlightHandlers])`) — this must
   happen strictly after `expectPreviewCaptureCompletes`/cleanup have
   already run (their success is unaffected either way) and strictly
   before `page.unroute()`. Only after every tracked handler has
   settled does `page.unroute(imageUrl)` run.
5. **Request-count assertion:** `expect(requestCount).toBeGreaterThanOrEqual(1)`
   — proving at least one request was observed, without asserting an
   exact count (the diagnostic proved the count is legitimately
   variable — 13/17/100 across three runs — and asserting a specific
   number would be flaky by construction).
6. **No broad catch-and-ignore of any route error.** The handler's
   existing `try { ... } catch (error) { ...; throw error; }`
   structure (currently used for §14's diagnostic capture) is
   simplified to no longer need diagnostic fields, but **must continue
   to rethrow** any error from `route.fulfill()` — do not swallow
   "Route is already handled!" or any other route error. If the
   in-flight-await fix is correct, no such error should occur again;
   if one still does, the test must fail loudly, not silently pass.
7. **Diagnostic disposition (Phase 4):** remove the `routeDiagnostics`
   array, the `console.log('PATCH-102-DELAYED-DIAGNOSTIC', ...)` dump,
   `requestSequences`/`requestSequenceCount`, and `testStartedAt`'s
   diagnostic-only timing fields entirely. The final file must not
   retain excessive per-invocation logging or a global diagnostic
   buffer — only the `inFlightHandlers` set (functional, not
   diagnostic) and the single `requestCount` counter survive.
8. **Unchanged, byte-for-byte:** the delayed-image product assertion
   (`waitedMs > 0 && timedOut === false && pendingCount === 0`, and
   `waitEvent?.waitedMs` `< 3000`), `expectPreviewCaptureCompletes`,
   the cleanup contract (`cleanupAndAssertBounded`,
   `{ boards: 0, padlets: 0, canvasLines: 0 }`), the 500ms artificial
   delay, `SYNTHETIC_PNG`, response status/content-type, and every
   other test in the file (no-image, cached-image, image-error,
   forced-timeout, Mermaid-carry) — none of these may change.
9. **Production file unchanged:** `createSlideRenderer.tsx` remains at
   blob `ef8c1a9b7a9521a6a68d40e661ee50effff986fd` — the eager-load fix
   is retained exactly as landed in §13; no reversion, no further
   change.

**Hard-stop conditions (bind, in addition to §8/§13/§14):** STOP
immediately, report, do not commit, if:

- `createSlideRenderer.tsx` changes at all;
- any route error is caught and suppressed without rethrowing;
- `page.unroute()` is called before all tracked in-flight handler
  promises have settled;
- the request-count assertion is changed to assert an exact count
  instead of `>= 1`;
- any diagnostic logging/buffer from §14 remains in the final file;
- the delayed-image product assertion, cleanup contract, artificial
  delay, or response body/headers change in any way;
- any other test in the file changes;
- any of the required live gates (§ below) fails or is skip-only;
- credentials are printed, logged, or committed anywhere.

**Bound implementation commit message (verbatim):**
`fix(e2e): await in-flight delayed route handlers before unrouting in presentation snapshot image readiness spec (PATCH-102)`

## 16. Required live gates (bind, supersedes prior gate lists for final PATCH-102 acceptance)

1. Delayed-image test — **5 consecutive real runs**: all pass, at
   least one request observed each run, at least one settled readiness
   event (`waitedMs > 0, timedOut: false, pendingCount: 0`) each run,
   **zero route errors**, zero guard/skip results.
2. Full `presentation-snapshot-image-readiness.spec.ts` six-scenario
   suite — all six execute, no serial-mode skip cascade, zero
   unexpected failures.
3. PATCH-101 spec. 4. PATCH-100 spec. 5. PATCH-099 spec. 6. PATCH-097
   spec. 7. PATCH-089. 8. PATCH-090. 9. PATCH-091. 10. PATCH-093.
   11. PATCH-094 — all carried specs green, real (non-skip) results.
12. PATCH-103 coexistence: `drawing-line-bridge.spec.ts -g "renders
    seeded attached"`, full `drawing-line-bridge.spec.ts`,
    `drawing-presentation.spec.ts`.
13. PATCH-096 grouped runner: 14 groups, 14 specs, 14 final passes,
    zero non-signature failures, exit code 0.
14. Deterministic gates: `git diff --check`; `npx tsc --noEmit`;
    `npm run check:boundaries`; `slideOrder` unit suite 7/1;
    `clonedPostMetadata` unit suite 9/1; focused drawing suite 59/2;
    full Vitest 448/43; `npm run verify`; `npm run build`.

All results must be real, non-skipped output — skip-only results do
not satisfy any of the above.

## 17. Temporary trace-artifact disposition (bind, 2026-07-22)

The following generated temp directories, produced by §14's
instrumented runs, remain **outside the repository** (confirmed via
`git status`/`git ls-files --others --exclude-standard` showing zero
untracked paths matching these names) and are recorded here for
audit continuity, not as repository artifacts:

- `patch102-section14-run1-e7142591ce9e45528c9647a04f93864c`
- `patch102-section14-run2-456fc828132e45bd86335b0a8dabedd8`
- `patch102-section14-run3-8a0018c1efd14439b4a2b5c7107d8ed0`
- `patch102-stability-1-1ffabbcf2fbb44908f3d72bf8b0d4125`
- `patch102-trace-f8b4e6a277ed4f77b813b3d4f82d9fbc`

These are generated trace-extraction output outside the repo's working
tree (not tracked, not gitignored-but-present, not part of any
candidate diff) and do not block patch acceptance provided: their
identities are recorded (above), they contain only generated trace
output, and the repository itself is clean apart from the authorized
candidate. Deletion of this unrelated temp content is explicitly NOT
authorized by this governance turn — it is out of scope for PATCH-102
and must not be touched here.

**Do not authorize PATCH-104.**

## 18. Zero-wait stability investigation and amendment (bind, 2026-07-22)

**§15's route-lifecycle fix is confirmed working and retained.** Runs
1-2 of the required 5-run stability gate passed with genuine settlement
events (`315/827/1601` and `645`, all `false/0`), variable fulfilled
counts (12/100) and abort counts (3/24), and **zero** "Route is already
handled!" errors across all 3 runs, including the failing one. §15's
classification-B fix is proven to have eliminated the teardown race
entirely — this is a **different, new failure**, correctly not
conflated with the prior one.

**Exact lifecycle timeline (traced by source; NOT independently
live-instrumented per capture this turn — no live browser tooling
available in this environment; the per-capture diagnostic Phase 3
calls for has not been executed and is flagged as still required
before this classification is treated as final):**

`openPreviewModal()` (lines 299-311) performs, in order: (1) click
"Present Frames" — entering presentation mode, which mounts the
presentation **sidebar**, itself rendering a **thumbnail** for the one
seeded slide (a full `renderSlideToPNG`/`createSlideRenderer` snapshot
capture, independent of and prior to anything the test explicitly
requests); (2) wait for `"Slides (1)"` visible; (3) click the slide's
menu button; (4) click "Preview slide" — triggering a **second**,
separate snapshot capture for the big-preview modal; (5) wait for the
modal's slide title visible. **Both (1)'s thumbnail and (4)'s preview
independently call `renderPadletOverlayToCanvas`, each creating its own
fresh offscreen host and fresh `<img>` element for the exact same
seeded `<img src="https://patch-102.test/delayed.png">`.** Additionally,
`seedLegacyHtmlSlide`'s ai-component padlet is embedded directly in the
master drawing scene (not only inside the Presentation frame), so it
is plausible the **live board's own on-canvas render** (mounted by
`openDrawingBoard`, before `openPreviewModal` is ever called) also
renders this same legacy HTML and independently fetches the same URL,
via the same, unmodified `applyImageEnhancements()`/§13 eager-load
path, well before either snapshot capture begins.

**Cache/reuse findings (Phase 4) — the decisive, source-provable
fact:** `route.fulfill({ status: 200, contentType: 'image/png', body:
SYNTHETIC_PNG })` (lines 417-421) sets **no cache-control headers at
all** — no `Cache-Control: no-store`, no `Pragma: no-cache`, no
`Expires: 0`. A fulfilled Playwright route response populates the
browser's normal HTTP/memory cache exactly like a real network
response unless explicitly told not to. Chromium's aggressive
same-document in-memory resource cache routinely serves a **second**
request for the **identical URL** within the same page/session
instantly, without re-hitting the network layer (and therefore without
re-triggering `page.route()` or incurring the artificial delay a
second time) — this is standard, well-documented browser behavior, not
speculative. Every one of run 3's requests still reached
`page.route()` (94 fulfilled, 42 aborted — the route handler clearly
still fired many times), which is consistent with **some** requests
being genuinely fresh network fetches while **others** — specifically
whichever capture attempt(s) happen to run *after* an earlier
same-URL fetch already resolved within the same test — are served from
cache before ever reaching the "loading" marker state the readiness
check depends on. This explains the non-determinism precisely: runs
1-2 apparently had at least one capture attempt whose own `<img>`
element was still genuinely pending at first inspection; run 3
apparently did not — every capture's image was already resolved
(cached) by the time its readiness check ran.

**Whether the live board warmed the URL, and whether the asserted
event belonged to the "intended" capture:** not proven by live
per-capture instrumentation this turn (Phase 3's required diagnostic
was not executed — flagged, not skipped). It does not need to be
proven to select the correct fix: the test's own assertion
(`events.some(...)`) already does not — and, per §7 below, **should
not need to** — distinguish which specific capture (thumbnail vs.
preview vs. any live-board render) produced the qualifying event; it
only requires that genuine pending-then-settled behavior is observed
**at least once**. The defect is that caching allows it to happen
**zero** times in a run, not that the test is watching the wrong
event.

**Classification: A — browser/renderer caching allows the snapshot-host
image to be immediately complete, because the fulfilled response
carries no cache-defeating headers**, with the most likely specific
mechanism being either the live board's own render or an earlier
capture (sidebar thumbnail) warming the exact same URL before a later
capture's readiness inspection runs (option B/C are both plausible
specific instances of A; the fix does not require distinguishing
between them, since eliminating caching entirely removes the
race regardless of which source would otherwise have won it). Not D
(the delay itself, 500ms, is unchanged and was already proven
sufficient in runs 1-2 whenever a fresh fetch actually occurred); not
E (the assertion's `.some()` scan is appropriate given §7's contract,
not a bug); not F (the intended delayed `<img>` is present in every
run, including run 3 — its element identity isn't in question, only
whether its *request* was fresh).

**Product/test contract (Phase 7) — determined, not assumed:** the
original test name and governance intent (§0/§3 of this document)
require **case 1**: a real loading marker must exist at first readiness
inspection, then settle before timeout — not merely "the delayed
request occurred at some point." §13's production fix and §15's
synchronization fix both exist specifically to prove genuine
wait-then-settle behavior works; a test that could pass via a
cache-warmed zero-wait capture would not actually be exercising that
behavior on every run. **The fixture must be corrected to guarantee
case 1 deterministically — the production assertion and wait mechanism
are not weakened; the caching gap in the test's own response headers is
the defect being corrected.**

**Minimum safe fix (bind) — spec-only, no URL-uniqueness scheme or
capture-attempt targeting required:**

In `e2e/characterization/presentation-snapshot-image-readiness.spec.ts`,
delayed-image test only, add explicit cache-defeating response headers
to the existing `route.fulfill()` call in `handleDelayedImageRoute`
(lines 417-421):

```ts
await route.fulfill({
  status: 200,
  contentType: 'image/png',
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
  body: SYNTHETIC_PNG,
});
```

This is sufficient by itself to guarantee every one of Phase 8's
required properties: it forces **every** request to the URL — whether
from the live board's own render, the sidebar thumbnail capture, or
the Preview modal capture — to bypass any cache and re-enter the
network/route layer fresh, incurring the artificial 500ms delay
independently each time. This makes the `.some()` scan correct by
construction (any capture attempt in the test will now genuinely
observe pending-then-settled state), removes the need for a
unique-URL-per-attempt scheme or explicit capture-attempt
identification, and requires no change to the delayed-image product
assertion, the 500ms delay value, `SYNTHETIC_PNG`, §15's
`inFlightHandlers`/`requestCount` mechanism, or any other test in the
file.

**Explicitly NOT authorized by this amendment:** a unique delayed-image
URL per test run or per capture attempt (unnecessary once caching is
disabled, and would complicate §15's in-flight tracking for no
benefit); increasing the artificial delay beyond 500ms (unnecessary —
runs 1-2 already proved 500ms is sufficient whenever the fetch is
genuinely fresh); explicit capture-attempt identification/filtering of
the `.some()` scan (unnecessary once every capture is guaranteed
fresh); any change to `createSlideRenderer.tsx` (§13's eager-load fix
remains exactly as landed, blob
`ef8c1a9b7a9521a6a68d40e661ee50effff986fd`); any change to §15's
`inFlightHandlers`/`requestCount`/cleanup-ordering logic; any change to
any other test in the file.

**Required live evidence before this is accepted as resolved (bind):**

1. **5 consecutive real runs** of the delayed-image test, all passing,
   each producing at least one genuine settlement event
   (`waitedMs > 0, timedOut === false, pendingCount === 0`,
   `waitedMs < 3000`), zero route errors, zero zero-wait-only runs.
2. Ideally (not gating, since the no-store fix is correct regardless),
   confirmation via a quick live check that requests now consistently
   exhibit non-zero delay regardless of ordering — if GPT-5.5 can
   cheaply capture this, include it in the report; if not, the 5-run
   pass/fail result alone is sufficient proof.
3. The full §16 gate matrix, unchanged: full 6-scenario suite,
   PATCH-101/100/099/097/089/090/091/093/094, PATCH-103 coexistence,
   PATCH-096 at exactly 14/14/14, and the full deterministic gate list.

**Hard-stop conditions (bind, in addition to §8/§13/§14/§15/§16):**
STOP immediately, report, do not commit, if:

- `createSlideRenderer.tsx` changes at all;
- §15's `inFlightHandlers`/`requestCount`/cleanup-ordering changes;
- a unique-URL scheme, capture-attempt filtering, or delay-value change
  is introduced instead of the no-store header fix;
- the delayed-image product assertion is weakened (e.g. accepting
  `waitedMs === 0` as passing, or reducing `.some()` to always-true);
- any zero-wait-only run still occurs across the 5 required runs;
- any route error (including "already handled") recurs;
- any of the required live gates fails or is skip-only;
- credentials are printed, logged, or committed anywhere.

**Bound implementation commit message (verbatim, supersedes §15's for
final acceptance):**
`fix(e2e): disable HTTP caching for the delayed legacy-image fixture in presentation snapshot readiness spec (PATCH-102)`

**Do not authorize PATCH-104.**

## 19. §18 disproven for this failure mode; capture-scoped diagnostic authorized (bind, 2026-07-22 — NO FIX AUTHORIZED YET)

**§18 is proven insufficient, alone, to guarantee the intended
scenario — but not proven wrong or harmful.** The live run used the
§18-headers candidate (`route.fulfill()` now includes
`Cache-Control: no-store, no-cache, must-revalidate` per the prior
amendment) and still produced **every** readiness event at
`waitedMs=0, timedOut=false, pendingCount=0` — with ~94 fulfilled and
~41 aborted requests still occurring. This directly disproves my prior
theory that browser/render caching alone explained the zero-wait
result: caching is now defeated at the HTTP layer, and the test still
fails identically. **I am not repeating that theory or asserting a new
one without proof — the prior turn's confident-but-wrong classification
is exactly the mistake to avoid repeating.**

**New load-bearing evidence, not yet explained by anything on record:**
~94 + ~41 ≈ **135 total request attempts in one test run**, when the
test intends at most a small, fixed number of capture attempts (the
presentation sidebar's own thumbnail render via `useSlideThumbnails.ts`,
the explicit "Preview slide" modal's big-preview render, and —
newly discovered by source this turn —
**`PresentationPreviewModal.tsx` itself contains a SECOND internal
render loop** (lines ~108-121, a `for (const s of slides)` thumbnail-strip
render inside the modal, independent of the sidebar's own thumbnail
mechanism) alongside its big-preview render effect (lines ~46-79,
already implicated in PATCH-103 §8's scene-reference-churn
investigation for a *different* symptom). None of these, even summed,
naturally explain 135 attempts for a one-slide fixture — something is
causing far more capture attempts than the three intentional call
sites account for. **This magnitude discrepancy is itself unexplained
evidence and must not be ignored or assumed benign.**

**Why no root-cause letter is bound this turn:** the spec currently has
**no visibility into the offscreen snapshot host's actual DOM state**
at the moment of its readiness check — `host` is a private local
variable inside `createSlideRenderer.tsx`'s closure, torn down
(`root.unmount(); host.remove();`) before the test could ever inspect
it even if it tried. The test only ever observes: (a) network-level
route invocations (aggregate counts, already gathered — insufficient
per the explicit instruction not to infer from aggregates alone), and
(b) the existing `collabboard-ai-snapshot-capture-wait` event, which
carries only `{waitedMs, timedOut, pendingCount}` — no per-image
detail, no capture-attempt identity, no indication of which call site
triggered it. **Asserting any of Phase 6's lettered classifications
right now would repeat the same error §18 already made: confident
inference from aggregate/indirect signals instead of direct
observation of the actual DOM state at the actual moment of failure.**
Classification is therefore **I — unresolved**, with the precise
missing observation stated above (per-capture image state at
`pendingAtStart` inspection, plus an accounting for the 135-request
volume).

**Authorized next step — diagnostic instrumentation only, no fix, no
assertion change, no behavior change:**

Because the missing observation requires visibility inside `host`
(which only `createSlideRenderer.tsx` has access to), this diagnostic
**must** touch that production file — permitted under this section's
explicit carve-out, exactly the same production-inert, test-only-gated
pattern already used for the existing `collabboard-ai-snapshot-capture-wait`
event (itself originally authorized the same way under earlier
patches in this program). This is diagnostic instrumentation, not a
behavioral change, and does not constitute "modifying the production
contract" — every addition is inert when `process.env.NODE_ENV ===
"production"` and does not alter `pendingAtStart`, `waitResult`, the
existing event, the eager-load mutation, the selector, the timeout, or
html2canvas's call.

**`createSlideRenderer.tsx` (additive only, gated, new event, no
existing line changed):**

1. A capture-attempt counter (closure-scoped to `createSlideRenderer`'s
   returned functions, incremented once per `renderPadletOverlayToCanvas`
   call — a plain integer, no behavior implication).
2. Immediately after computing `pendingAtStart` (existing line,
   unchanged), and only when `process.env.NODE_ENV !== "production"`,
   snapshot every `<img>` currently in `host` (not only ones matching
   the readiness selector) into a plain array of
   `{ src, loading, dataAiImageState: img.dataset.aiImageState ?? null, complete, naturalWidth, naturalHeight }`.
3. After `html2canvas(host, ...)` resolves (existing call, unchanged),
   and only when `process.env.NODE_ENV !== "production"`, dispatch a
   **new**, separate event —
   `collabboard-ai-snapshot-capture-diagnostic` — carrying:
   `{ captureId, hostCreatedAtMs, slidePadletIds, pendingAtStart, images, waitedMs, timedOut, pendingCount }`.
   This event is additional to, not a replacement for, the existing
   `collabboard-ai-snapshot-capture-wait` event, which must continue to
   fire exactly as it does today.
4. No other line in `createSlideRenderer.tsx` changes. §13's eager-load
   block and §15-equivalent behavior (none applicable here) are
   untouched.

**`presentation-snapshot-image-readiness.spec.ts` (delayed-image test
only):**

1. Buffer the new `collabboard-ai-snapshot-capture-diagnostic` event
   the same way `__patch102WaitEvents` is already buffered
   (registered before `openPreviewModal` triggers any capture).
2. Do **not** change the existing assertion, the route handler, §15's
   in-flight tracking, or §18's headers.
3. On failure (already the case via the existing `finally` diagnostic
   logging pattern), dump the full buffered diagnostic array so the
   per-capture record is available in the test report.
4. Run the delayed-image test enough times to reproduce the failure at
   least once (the existing 90s-timeout single run is sufficient to
   trigger it, per this turn's evidence) and report, for **every**
   buffered capture attempt: `captureId`, `hostCreatedAtMs` deltas
   between consecutive captures (to quantify the churn rate), whether
   the intended delayed-image src appears in `images` at all, and for
   each occurrence: `loading`, `dataAiImageState`, `complete`,
   `naturalWidth` at that exact inspection moment.

**Hard-stop conditions (bind, in addition to §8/§13-§18):** STOP
immediately, report, do not commit, if:

- any existing behavior, timing, selector, event, or assertion changes
  as a side effect of adding this diagnostic;
- the diagnostic is used as a justification to weaken or bypass the
  delayed-image assertion instead of explaining it;
- a fix is proposed or applied before the per-capture diagnostic data
  is actually captured and reported;
- the 135-request volume anomaly is left unexplained in the report;
- credentials are printed, logged, or committed anywhere.

**§13, §15, §18 disposition:** all three **retained unchanged**. §13
(eager-load) and §15 (in-flight sync) remain independently proven
correct by their own dedicated evidence (images do load when genuinely
inspected pending; zero route-teardown errors this run or any prior
run). §18 (no-cache headers) is retained as correct response hygiene
with no evidence against it, but its necessity for *this* failure mode
is now proven insufficient alone — it stays in place pending the
diagnostic, not removed for lack of a reason.

**Do not authorize PATCH-104.**

## 20. Preview-result lifecycle investigation (bind, 2026-07-23 — leading hypothesis identified, NOT yet proven, further diagnostic authorized, no fix)

**§19's diagnostic worked exactly as designed and answered its own
question cleanly.** Run 2's capture diagnostics prove: the delayed
image is genuinely present in every observed snapshot host, genuinely
unresolved (`complete: false, naturalWidth: 0`) at first inspection,
`pendingAtStart` correctly equals 1, and all three observed waits
settle normally before timeout (`532`/`872`/`1424` ms, all
`timedOut: false`). **The original zero-wait mechanism is not what
failed here.** The new failure is downstream: readiness and
`html2canvas` both complete, the diagnostic event fires, and yet the
Preview modal never shows a populated image.

**Preview-result pipeline, traced by source (confirmed by re-reading
the current file, not from memory):**
`PresentationPreviewModal.tsx`'s big-preview effect (lines 48-79) is
the sole owner of `bigPng` (the state the "Preview modal exposes a
populated snapshot image" assertion depends on). Its structure:

```
useEffect(() => {
  if (!open || !currentSlide) return;
  setBigPng(null);
  let cancelled = false;
  ...
  render(); // or double-RAF on first open
  return () => { cancelled = true; };
}, [open, currentSlide, renderSlideToPNG, getSlideCacheKey]);
```

where `render()` calls `renderSlideToPNG(...).then((png) => { if
(!cancelled) setBigPng(png); })`. **Every time this effect re-runs —
driven by `open`, `currentSlide`, or `renderSlideToPNG` changing
reference — the previous in-flight render's eventual resolution is
discarded**, because `cancelled` was flipped `true` by the earlier
run's own cleanup before its promise settled. A **second, structurally
identical** effect exists immediately below (lines 101-129, the
thumbnail-strip warm render) with the **same** dependency shape
(`[open, slides, renderSlideToPNG, getSlideCacheKey]`) and the same
cancel-on-cleanup pattern. Both effects share exposure to the same two
upstream references (`slides`/`currentSlide`, `renderSlideToPNG`) — if
either churns on the parent's re-renders (neither is guaranteed
memoized from what this file alone shows), **both effects restart
together**, which plausibly explains why 3 captures clustered within
~112ms of each other (a single upstream re-render event restarting two
effects at once) rather than one effect looping on itself.

**Leading hypothesis (structurally confirmed to exist in source; NOT
yet proven to be what actually happened in the failing run — no live
instrumentation of `cancelled`/`setBigPng` exists yet):** the
big-preview effect re-ran at least once (matching capture 1→2's
+95ms gap and 2→3's +17ms gap) before its own prior attempt's promise
resolved, discarding that attempt via `cancelled`. If the effect
restarted **again** after capture 3 began (unobserved — the diagnostic
event only fires after a capture's own `html2canvas` completes, so a
4th+ restart that itself never got superseded before the 90s test
timeout would never appear in the buffer at all), capture 3's own
eventual `setBigPng` call would also be discarded, leaving `bigPng`
permanently `null` and the modal stuck on "Rendering slide..." — this
matches the observed symptom exactly without requiring any capture
beyond the 3 already seen.

**Classification: J — still unresolved**, with a specific,
source-confirmed, testable leading hypothesis spanning **B and C**
(the Preview-main result is discarded as stale by its own effect's
cancellation guard, most plausibly because a concurrent or later
effect re-run — driven by an unmemoized `slides`/`currentSlide`/
`renderSlideToPNG` reference upstream of this modal — restarts the
capture before it resolves). This is **not** asserted as final: unlike
§18's caching theory (which was falsified by a live run), this
hypothesis has not yet been tested against live evidence at all, and
per this program's own recent lesson, it must not be treated as proven
until it is. Not classified F (the diagnostic already proves the image
is present and unresolved — not empty/absent); not H (only one
`currentSlide`/frame exists in this fixture, so a wrong-instance theory
has no distinguishing evidence either way yet); not E (a valid result
existing but its loading state never clearing is exactly what B/C
would also produce — indistinguishable without the effect-level
instrumentation below).

**Authorized next step — diagnostic instrumentation only, no fix, no
assertion change:**

Source alone identifies a specific, credible mechanism but does not
prove: (a) whether `cancelled` was actually `true` at any of the
3 observed captures' resolution time, (b) whether a 4th+ restart
occurred beyond the observation window, (c) which of `open`/
`currentSlide`/`renderSlideToPNG` actually changed reference to trigger
each restart, (d) which of the 3 observed captures is this specific
effect versus the thumbnail-strip effect versus the sidebar's own
separate thumbnail mechanism. Per Phase 4, additive, gated,
non-behavioral instrumentation is authorized in:

**`components/presentation/PresentationPreviewModal.tsx`** (new file
added to diagnostic scope this section — a deviation from PATCH-102's
original §2 prohibited list, justified the same way §19 already
justified touching `createSlideRenderer.tsx`: strictly test-only-gated,
additive, inert in production, required because only this component
has access to its own `cancelled`/`setBigPng`/effect-rerun state):

1. In the big-preview effect (lines 48-79) and the thumbnail-strip
   effect (lines 101-129), when `process.env.NODE_ENV !== "production"`
   only: dispatch a new event, e.g.
   `collabboard-ai-preview-result-diagnostic`, at effect-run start
   (`{ surface: 'preview-main' | 'preview-thumbnail-strip', effectRunId, startedAtMs }`)
   and again at the `.then`/`await` callback site
   (`{ surface, effectRunId, resolvedAtMs, cancelledAtResolution: cancelled, resultAccepted: !cancelled, resultLength: png?.length ?? null }`
   — length only, never the PNG data itself). `effectRunId` is a
   simple per-effect incrementing counter (via a ref), proving exactly
   how many times each effect actually ran and whether each run's
   result was accepted or discarded.
2. No change to `cancelled`'s actual semantics, `setBigPng`, the
   dependency arrays, the double-RAF first-open handling, or any
   rendered output — purely observational.

**Optional, minimal, read-only surface labeling on the existing §19
event** — extend `RenderSlideOptions`/`renderSlideToPNG`'s call sites
relevant to this test's flow only (`useSlideThumbnails.ts`,
`PresentationPreviewModal.tsx`'s two call sites) with an optional,
gated `diagnosticSurface` hint threaded through to
`createSlideRenderer.tsx`'s existing
`collabboard-ai-snapshot-capture-diagnostic` event, so `captureId`s can
be correlated to a human-readable surface without guessing from
creation order. Do **not** touch `SharePresentationModal.tsx`,
`exportToPDF.ts`, `exportToPPTX.ts`, or `FullscreenPresentation.tsx` —
irrelevant to this test's flow and out of scope.

**Hard-stop conditions (bind, in addition to §8/§13-§19):** STOP
immediately, report, do not commit, if:

- any change to `cancelled` semantics, `setBigPng`, dependency arrays,
  or rendered output in `PresentationPreviewModal.tsx`;
- any file outside the diagnostic scope above is touched;
- a fix is proposed before the effect-level diagnostic data is
  captured and reported;
- the Preview-modal assertion is weakened instead of explained;
- credentials are printed, logged, or committed anywhere.

## Phase 7 ruling — status of the original zero-wait blocker

**Not closed.** One diagnostic run not reproducing it is insufficient
evidence to retire it — it could be a genuinely intermittent, separate
timing race (e.g. a rare ordering where a capture's own readiness
check runs before its child effects flush, per the open question
raised in §19) that simply didn't recur in this run. **Required
reproduction threshold before the zero-wait failure can be considered
resolved or superseded:** the delayed-image test must pass its full
**5-consecutive-run** stability gate (§16/§18) with the §19/§20
diagnostics active throughout, so that if zero-wait recurs, it will be
captured with full per-capture image-state detail rather than
re-opening an under-instrumented investigation. Until 5 consecutive
clean passes are observed, both the zero-wait failure and the
Preview-stuck failure remain open, tracked separately.

## Phase 8 ruling — diagnostic code disposition

**Temporary — must not remain in the final candidate.** The
module-scoped capture counter and both `collabboard-ai-snapshot-capture-diagnostic`/
`collabboard-ai-preview-result-diagnostic` events (and the optional
surface-label passthrough) are diagnostic-only and must be removed
(or reduced to the minimal permanent form governance explicitly
authorizes at final review — none is authorized as permanent yet)
before PATCH-102's candidate is presented for independent review or
commit. This mirrors §14's disposition of its own diagnostic
instrumentation.

## Phase 9 ruling — §18 headers disposition

**Keep temporarily; do not decide finally yet.** The no-cache headers
were proven insufficient *alone* to prevent the zero-wait failure, but
were never proven wrong, harmful, or unnecessary — removing them now
would remove a legitimate cache-hygiene safeguard for no evidentiary
reason, and could reintroduce cache-based non-determinism as a
*second*, compounding variable while the Preview-result lifecycle
question is still open. Final disposition (keep permanently, reduce,
or remove) is deferred to the point where both the zero-wait and
Preview-stuck questions are resolved and the fixture's final shape is
known.

## Phase 10 ruling — cleanup

`test-results/` and `.next/trace` remain present (generated,
gitignored, confirmed via `git status`/`git ls-files --others
--exclude-standard` to be absent from any tracked or candidate diff).
Authorized safe cleanup, scoped to exactly these two repository-local
paths only (no broader directory deletion authorized):

```powershell
Remove-Item -LiteralPath "test-results" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath ".next\trace" -Force -ErrorAction SilentlyContinue
```

or equivalently, if PowerShell policy blocks it, a Node one-liner
limited to these exact two paths (`fs.rmSync('test-results', {recursive:true, force:true})`,
`fs.rmSync('.next/trace', {force:true})`) — either method is
authorized; no other path may be touched.

**Do not authorize PATCH-104.**

## 21. Root cause proven — churn source identified; minimal product fix authorized (bind, 2026-07-23)

**§20's diagnostic proved exactly what it was designed to prove, and
this time the hypothesis held.** Diagnostics confirm: the delayed-image
readiness mechanism works correctly in **every** captured attempt
(captures 1/2/3/23, all `pendingAtStart:1`, genuinely unresolved at
inspection, settling before timeout) — the zero-wait mechanism is not
implicated in this run. The Preview-main effect ran **43 times**;
attempt 1 produced a valid, non-empty result (298898 bytes) that
resolved with `cancelledAtResolution: true` — discarded solely because
the owning effect had already restarted before its own promise
settled. **Classification: A — the first valid Preview-main result
resolves but is discarded because `cancelled === true`,** exactly as
scoped in Phase 6 — confirmed by direct evidence (`resultAccepted:
false`, `setBigPng` did not execute), not inferred.

**Exact unstable reference and its creation site — traced and
confirmed by source (not inferred):**
`components/collabboard/canvas/layouts/DrawingLayout.tsx:2092-2096`:

```ts
const slideRenderer = useMemo(() => createSlideRenderer({
  getSceneElements: () => elements,
  getPadlets: () => padlets,
  getFiles: () => currentFilesRef.current ?? initialFiles ?? null,
}), [elements, initialFiles, padlets]);

const renderSlideToPNG = useCallback((slide, opts) => (
  slideRenderer.renderSlideToPNG(slide, opts)
), [slideRenderer]);
```

`slideRenderer`'s `useMemo` depends directly on `elements` (the live
Excalidraw scene-elements React state) and `padlets` — both of which
change reference on essentially every meaningful scene tick (natural
height/width conformance, the automatic embeddable-sync effect,
position debounce writes — all independently confirmed to fire
frequently on this exact fixture across the PATCH-103 investigation).
Every such change recreates `slideRenderer`, which recreates
`renderSlideToPNG` (its own dependency), which — via
`PresentationPreviewModal.tsx`'s two effects'
`[open, currentSlide/slides, renderSlideToPNG, getSlideCacheKey]`
dependency arrays — restarts **both** the big-preview and
thumbnail-strip effects on every one of those ticks. 43 restarts over
one test's lifetime is fully consistent with this and requires no
further explanation of "which specific tick" changed on each restart —
the mechanism is `elements`/`padlets` churning generally, not one
specific singular event.

**Callback stabilization is proven sufficient, not merely assumed:**
this exact file already contains the correct pattern, unmodified,
13 lines below the defect —
`runtimeSlideHelpers` (lines 2104-2109):

```ts
// Keep the helper identity stable and read fresh scene data from refs at call time.
const runtimeSlideHelpers = useMemo((): RuntimeSlideHelpers => ({
  getSceneElements: () => runtimeSceneElementsRef.current,
  getPadlets: () => runtimePadletsRef.current,
  getFiles: () => currentFilesRef.current ?? runtimeInitialFilesRef.current ?? null,
}), []);
```

— and the refs it reads (`runtimeSceneElementsRef`, `runtimePadletsRef`,
`runtimeInitialFilesRef`) are **already** kept unconditionally current
on every render (lines 757-759: `runtimeSceneElementsRef.current =
elements; runtimePadletsRef.current = padlets;
runtimeInitialFilesRef.current = initialFiles;`). Applying the
identical pattern to `slideRenderer` — reading the same existing refs
instead of the reactive variables, with an empty dependency array — is
a **direct precedent match already proven correct in this same file for
the same class of problem**, not a new mechanism being introduced
speculatively.

**Classification: B — stabilize `slideRenderer`'s identity by
correcting its dependency inputs to the existing ref-based pattern.**
Not A (the instability is in `slideRenderer`, one level upstream of
`renderSlideToPNG` — fixing at the source, per the preferred approach,
removes the need to touch `renderSlideToPNG`'s own `useCallback` at
all); not C (no need to key `PresentationPreviewModal`'s effects on
semantic identity instead of reference identity — once the reference
itself is stable, reference-identity dependency arrays work correctly
and require no change in that file); not D/E (no generation-token or
last-valid-result-preservation mechanism is needed — eliminating the
false churn is simpler and lower-risk than compensating for it in two
separate consumer effects).

**§18/oklch relationship — Phase 3 resolved:** attempt 1 (the *only*
cold, non-restarted render) succeeded with a valid 298898-byte result
and **no** oklch error; every oklch rejection occurred only in
restarts 2-43. This is strong evidence (not yet a second independent
live proof, but internally consistent and requiring no further
unproven assumption) that **stabilizing the render reference is likely
sufficient to make the oklch symptom moot in this test**, since there
will be exactly one render attempt per semantic slide-selection going
forward. This does **not** retroactively certify
`sanitizeExportOverlayColors()`'s color-property coverage as complete
in general — only that no evidence currently shows it failing on a
genuine first/only render. Classified per Phase 5: **oklch is already
governed by another mechanism** (`sanitizeExportOverlayColors()` +
`containsUnsupportedColorFunction()`, `createSlideRenderer.tsx:79-120`,
pre-existing and unmodified by PATCH-102) **and only exposed by
churn** — not a genuine new PATCH-102 snapshot-host defect requiring
its own fix in this patch. This is bound as a hypothesis validated by
the required "zero oklch errors across 5 consecutive runs" gate below,
not asserted as permanently closed — if oklch recurs even once with
churn eliminated, that disproves this classification and reopens the
question as its own prerequisite.

**Also newly explaining the earlier zero-wait failures (not certain,
flagged as a plausible unification, not asserted as proven):** it is
plausible the original zero-wait observations (§9/§18/§19) were
themselves instances of this same churn — under 43 overlapping
concurrent render attempts, React's effect/paint scheduling could
plausibly fall behind for some individual attempt, causing its own
child `<img>`/marker to not yet exist at the moment of its own
`pendingAtStart` check. If true, §18's no-cache headers were solving a
problem that was never actually about caching. This is not required to
be proven before authorizing the churn fix — it is recorded so the
required 5-run stability gate below is understood as testing both
failure modes simultaneously, not as a coincidence.

## Phase 6 ruling — diagnostic and §18 disposition

**All §19/§20 diagnostics must be fully removed** — none is
authorized as permanent. This means:

- `createSlideRenderer.tsx` returns to its exact §13 landed content
  (blob `ef8c1a9b7a9521a6a68d40e661ee50effff986fd`) — the capture
  counter, `collabboard-ai-snapshot-capture-diagnostic` event, and
  `diagnosticSurface` parameter are removed entirely; the eager-load
  block from §13 is the only thing that remains.
- `PresentationPreviewModal.tsx` returns to its exact original tracked
  content (blob `5116031b27f73bb7616f4024b197824c6718aa17`) — the
  `collabboard-ai-preview-result-diagnostic` events, effect-run
  counters, and `diagnosticSurface` reads are removed entirely. **No
  permanent change is needed in this file** — the fix lives entirely
  upstream in `DrawingLayout.tsx`.
- `useSlideThumbnails.ts` and `PresentationPanel.tsx` return to their
  exact pre-diagnostic tracked content — the `diagnosticSurface`
  passthrough plumbing added for §20's surface-labeling is removed
  entirely from both. **No permanent change needed in either file.**
- The spec (`presentation-snapshot-image-readiness.spec.ts`) removes
  the capture-diagnostic buffer, the preview-result-diagnostic buffer,
  and both failure-dump blocks — retaining only: §12's deterministic
  indices, §15's `inFlightHandlers`/`requestCount` synchronization
  (retained — solved the proven teardown race, no evidence it's
  unnecessary), and the existing delayed-image/Preview-modal product
  assertions unchanged.

**§18 no-cache headers: REMOVE, as a disproven attempted fix.** They
were introduced specifically to explain the zero-wait symptom via a
caching theory that a live run subsequently disproved; the actual root
cause has now been identified as effect-reference churn, entirely
unrelated to HTTP caching. Retaining response headers that address a
mechanism proven not to be the cause adds complexity without a
justified purpose — removed per Phase 6's explicit instruction to
remove disproven fixes rather than retain them by default.

**§15 in-flight route synchronization: RETAINED**, unaffected by this
section — it solves an independently-proven, still-relevant route
teardown race unrelated to the render-effect churn fixed here.

## Phase 7 — exact authorized final file set (bind, supersedes prior scope for final acceptance)

**Allowed files (five total — the minimum genuinely required, not all
files diagnostics happened to touch):**

1. `components/collabboard/canvas/layouts/DrawingLayout.tsx` — **new
   to PATCH-102's scope**, starting blob (its current, PATCH-103-closed
   state) `539f85b127db938d7ee6c72d32fe913cb88f35f1`. **Exact
   authorized change, and only this change:** replace `slideRenderer`'s
   `useMemo` (lines 2092-2096) with:
   ```ts
   const slideRenderer = useMemo(() => createSlideRenderer({
     getSceneElements: () => runtimeSceneElementsRef.current,
     getPadlets: () => runtimePadletsRef.current,
     getFiles: () => currentFilesRef.current ?? runtimeInitialFilesRef.current ?? null,
   }), []);
   ```
   No change to `renderSlideToPNG`'s own `useCallback`, to
   `runtimeSlideHelpers`, to `runtimeSceneElementsRef`/
   `runtimePadletsRef`/`runtimeInitialFilesRef`'s existing per-render
   assignment (lines 757-759, already correct, already unconditional),
   or to any other line in this 3000+-line file.
2. `components/presentation/slide-renderer/createSlideRenderer.tsx` —
   remove all §19 diagnostics; final state must be byte-identical to
   blob `ef8c1a9b7a9521a6a68d40e661ee50effff986fd`.
3. `components/presentation/PresentationPreviewModal.tsx` — remove all
   §20 diagnostics; final state must be byte-identical to blob
   `5116031b27f73bb7616f4024b197824c6718aa17`.
4. `components/presentation/useSlideThumbnails.ts` — remove
   diagnostic passthrough; final state must be byte-identical to its
   tracked pre-diagnostic content (verify via `git show HEAD:<path>`).
5. `components/presentation/PresentationPanel.tsx` — remove diagnostic
   passthrough; final state must be byte-identical to its tracked
   pre-diagnostic content (verify via `git show HEAD:<path>`).
6. `e2e/characterization/presentation-snapshot-image-readiness.spec.ts`
   — remove both diagnostic buffers/dumps and §18's response headers;
   retain §12 and §15 exactly.

**Explicitly prohibited:** any change to `drawingBridgeHarness.ts` or
any other PATCH-103-bound file; any change to
`sanitizeExportOverlayColors()`/`containsUnsupportedColorFunction()`
or any other color-handling code (not authorized absent the oklch gate
failing); any change to `renderSlideToPNG`'s own `useCallback`
signature; any change to `PresentationPreviewModal.tsx`'s effect
dependency arrays, `cancelled` semantics, or `setBigPng` (the fix is
upstream — this file must end up textually unchanged from its
pre-diagnostic state); any generation-token/request-id mechanism (not
needed); any change to §15's synchronization logic; any change to the
delayed-image or Preview-modal product assertions.

**Immutable fence (bind):** the two `runtimeSceneElementsRef.current =
elements;` / `runtimePadletsRef.current = padlets;` /
`runtimeInitialFilesRef.current = initialFiles;` assignment lines
(757-759) and the `runtimeSlideHelpers` block (2104-2109) must remain
byte-identical before and after — the fix reads them, it does not
touch them.

**Bound implementation commit message (verbatim):**
`fix(presentation): stabilize slide-renderer identity to prevent Preview-effect restart churn (PATCH-102)`

## Phase 8 — required validation (bind, supersedes §16 for final acceptance)

1. **Delayed-image focused test — 5 consecutive real passes**, each
   with: a genuine pending image and non-zero settlement, a populated
   Preview modal, zero route errors, **zero oklch errors**, zero
   `InvalidFractionalIndexError`.
2. **Effect-stability proof:** with diagnostics temporarily
   re-enabled for this one verification pass only (or an equivalent
   one-off check), confirm exactly one semantic Preview-main render
   per slide selection (not 43) — `setBigPng` executes, the modal
   leaves "Rendering slide..." — then remove the diagnostics again
   before final commit (they must not ship either way).
3. Full `presentation-snapshot-image-readiness.spec.ts` six-scenario
   suite — all six, no skip cascade, zero unexpected failures.
4. PATCH-101/100/099/097 specs — blobs unchanged, all passing.
5. PATCH-089/090/091/093/094 — all carried, real results.
6. PATCH-103 coexistence: targeted + full `drawing-line-bridge.spec.ts`,
   `drawing-presentation.spec.ts` — **critically important now**, since
   this patch touches `DrawingLayout.tsx` again after PATCH-103 closed
   it; every PATCH-103 assertion must still hold with this additional
   change layered on top.
7. PATCH-096 grouped runner — 14/14/14, zero non-signature failures,
   exit code 0.
8. Deterministic matrix: `git diff --check`; `npx tsc --noEmit`;
   `npm run check:boundaries`; `slideOrder` 7/1; `clonedPostMetadata`
   9/1; focused drawing 59/2; full Vitest 448/43; `npm run verify`;
   `npm run build`.
9. Fresh independent review (Kepler primary, Gemini 3.1 Pro fallback —
   NOT Sonnet) required before commit, given the expanded scope
   (`DrawingLayout.tsx` reopened) and the removal of §18.

**Hard-stop conditions (bind, in addition to §8/§13-§20):** STOP
immediately, report, do not commit, if:

- any file outside the six listed in Phase 7 is touched;
- `DrawingLayout.tsx` changes anywhere other than the exact
  `slideRenderer` `useMemo` block;
- any §19/§20 diagnostic remains in the committed candidate;
- oklch errors recur with churn eliminated (reopen as its own
  question, do not paper over);
- any of the required live gates fails or is skip-only;
- PATCH-096 does not report exactly 14/14/14;
- credentials are printed, logged, or committed anywhere.

**Do not authorize PATCH-104.**
