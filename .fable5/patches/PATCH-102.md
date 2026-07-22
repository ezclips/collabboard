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
