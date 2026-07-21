# PATCH-101 — Bounded Mermaid Diagram Readiness Wait in Slide Snapshot Capture

**Status:** **AUTHORIZED** (not yet implemented).

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (Kepler primary, Gemini 3.1 Pro fallback) — PASS required
before commit. Sonnet (CTO/governance owner) authored/authorized this
patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-22.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`6df5d6c2a08a3d7a6f89cd1ca4f0384caeb07f1c`
(`fix(presentation): render synchronous structured AI containers in
snapshot surfaces (PATCH-100)`; HEAD == origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`fix(presentation): wait for Mermaid diagram readiness before slide snapshot capture (PATCH-101)`

---

## 0. Investigation summary (bind, 2026-07-22, from `6df5d6c`)

**Scope decision:** this patch addresses ONLY Mermaid/code-diagram
readiness. Image-bearing legacy HTML readiness (network-loaded images
inside `AIComponentRenderer`/`useAIComponent.ts`) is explicitly split
out and remains a SEPARATE, NOT-authorized future candidate — see §9.

**Why the split:** a Mermaid readiness marker
(`data-ai-render-state`, `components/ai/renderers/CodeDiagramRenderer.tsx:80`)
already exists and is already proven in production via
`AIComponentExportMenu.tsx`'s `waitForDiagramRender()` (single-card PDF
export). Reusing it for the slide-snapshot pipeline requires touching
only `createSlideRenderer.tsx` (adding a bounded poll before
`html2canvas`) — no change to `CodeDiagramRenderer.tsx` and no change
to `AIComponentExportMenu.tsx` (which keeps its own proven,
independent, unmodified implementation of the same 100ms/3000ms
contract — deliberately NOT shared/refactored into a common module,
to avoid any risk to the already-working single-card export path).
Image readiness has no existing marker; adding one requires modifying
`AIComponentRenderer.tsx`/`useAIComponent.ts` — files used by the
editor canvas AND both PATCH-097/099 runtime cards, a materially
larger blast radius deserving its own dedicated review, not bundled
here.

**Confirmed `renderDiagramCode()` always settles
(`lib/ai/diagram-engine.ts:46-58`):** wrapped in `try/catch`, returns
`{ok: true, svg}` or `{ok: false, reason}` — there is no code path
that can hang indefinitely under normal conditions. This means a
genuine multi-second timeout is NOT naturally/reliably reproducible in
a test by simply seeding a "slow" diagram — a deterministic test of
the timeout/fallback branch requires the non-production-only override
described in §2.4.

**Current behavior (post-PATCH-100, unchanged by this patch's base):**
`renderPadletOverlayToCanvas` waits exactly two chained
`requestAnimationFrame` calls, then immediately calls `html2canvas`.
For a Mermaid diagram, this is very likely to capture the "Rendering
diagram…" loading placeholder (`CodeDiagramRenderer.tsx:96-100`)
rather than the finished SVG — a real, live reliability gap, though
not "blank" (PATCH-100 already fixed the true-blank case for all
non-Mermaid structured shapes).

## 1. Product contract (bind)

Slide-snapshot capture (`renderPadletOverlayToCanvas`) waits for
Mermaid/code-diagram content to finish rendering before calling
`html2canvas`, ONLY when such content is present, with a bounded
timeout and a deterministic best-effort fallback:

- **Wait scope:** immediately after the existing two-RAF wait and
  `sanitizeExportOverlayColors`, check
  `host.querySelectorAll('[data-ai-render-state="loading"]')`. If
  empty, proceed to `html2canvas` immediately — **zero added latency**
  for every slide without a Mermaid diagram (the overwhelming
  majority).
- **If non-empty:** poll every 100ms (identical cadence to the
  existing `waitForDiagramRender()` precedent) until no element
  matches `[data-ai-render-state="loading"]`, or until `timeoutMs`
  (default 3000, same bound as the existing precedent) elapses.
- **Fallback on timeout:** proceed to `html2canvas` regardless — no
  thrown error, no user-visible message, no retry. Identical
  best-effort philosophy to the existing precedent. Capture always
  completes; worst case (timeout) is exactly today's pre-patch
  behavior (captures whatever is on screen, which may be the loading
  placeholder).
- **No indefinite wait; no hard failure; no network or persistence
  side effects.**
- **Logging/diagnostics:** none added to production. The only new
  observability is the test-only instrumentation event in §2.3.
- **User-visible effect:** none beyond the intended reliability
  improvement — no new error states, no new UI, no perceptible delay
  for the common (non-Mermaid) case; a bounded, invisible (off-screen
  host) delay of at most 3 seconds only when a slide contains a
  currently-rendering Mermaid diagram at the moment of capture.

**Explicitly out of scope, unchanged:**

- image-bearing legacy HTML readiness (no marker exists; not added by
  this patch — see §9)
- any change to `CodeDiagramRenderer.tsx`'s `data-ai-render-state`
  semantics
- any change to `AIComponentExportMenu.tsx` or its
  `waitForDiagramRender()` (kept fully independent and untouched)
- any change to the runtime fullscreen player (PATCH-097/099) or the
  synchronous snapshot fix (PATCH-100)
- any change to `html2canvas` options/orchestration beyond inserting
  the bounded wait before the existing call
- any persistence, schema, migration, or database change

## 2. Exact production change (bind)

**Single file:** `components/presentation/slide-renderer/createSlideRenderer.tsx`.

1. Add a small local helper (not exported, not shared with
   `AIComponentExportMenu.tsx`) implementing the exact contract in §1:
   ```
   function waitForSnapshotDiagramReadiness(host: HTMLElement, timeoutMs: number): Promise<{ waitedMs: number; timedOut: boolean; pendingCount: number }>
   ```
   polling `host.querySelectorAll('[data-ai-render-state="loading"]')`
   every 100ms, resolving early with `timedOut: false` once the count
   reaches 0, or after `timeoutMs` with `timedOut: true` and the
   remaining `pendingCount`.
2. In `renderPadletOverlayToCanvas`, immediately after the existing
   `await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))`
   and `sanitizeExportOverlayColors(host)` calls, and immediately
   before the existing `html2canvas(host, {...})` call, insert:
   ```
   const pendingAtStart = host.querySelectorAll('[data-ai-render-state="loading"]').length;
   const waitResult = pendingAtStart > 0
     ? await waitForSnapshotDiagramReadiness(host, resolveSnapshotTimeoutMs())
     : { waitedMs: 0, timedOut: false, pendingCount: 0 };
   ```
   where `resolveSnapshotTimeoutMs()` returns `3000` in all normal
   (production and default dev/test) conditions, and ONLY in a
   non-production build reads an optional test-only override:
   ```
   function resolveSnapshotTimeoutMs(): number {
     if (process.env.NODE_ENV !== 'production'
         && typeof window !== 'undefined'
         && typeof (window as any).__patch101TimeoutOverrideMs === 'number') {
       return (window as any).__patch101TimeoutOverrideMs;
     }
     return 3000;
   }
   ```
   This is the exact `process.env.NODE_ENV !== 'production'` gating
   convention already established by PATCH-100 and by
   `DrawingLayout.tsx`/`SimpleLineRenderer.tsx` — inert in a
   production build (always returns 3000).
3. **Test-only instrumentation (production-inert, same convention as
   PATCH-100):** immediately after `waitResult` is computed, dispatch:
   ```
   if (process.env.NODE_ENV !== 'production') {
     window.dispatchEvent(new CustomEvent('collabboard-ai-snapshot-capture-wait', {
       detail: { waitedMs: waitResult.waitedMs, timedOut: waitResult.timedOut, pendingCount: waitResult.pendingCount },
     }));
   }
   ```
   Payload is purely numeric/boolean timing metadata — no HTML, no AI
   content, no padlet identifiers, no metadata contents.
4. No other line in `createSlideRenderer.tsx` may change. The existing
   two-RAF wait, `sanitizeExportOverlayColors`, and the `html2canvas`
   call itself (options, scale, dimensions) are untouched — the new
   wait is inserted between them, not a replacement for any of them.
   `renderSlideToPNG`, `getSlideRenderSignature`, and the exported
   `SlideRenderHelpers` shape are unchanged.

**Explicitly prohibited implementation choices (bind):** no change to
`PresentationPadletCard.tsx`, `PresentationContainerCard.tsx`,
`CodeDiagramRenderer.tsx`, `data-ai-render-state` semantics,
`AIComponentExportMenu.tsx`/`waitForDiagramRender()`,
`AIComponentRenderer.tsx`, `useAIComponent.ts`,
`lib/ai/normalize-ai-content.ts`, `lib/ai/persistence.ts`,
`lib/ai/diagram-engine.ts`, any runtime fullscreen file, any other
export-orchestration file (`useSlideThumbnails.ts`,
`PresentationPreviewModal.tsx`, `exportToPDF.ts`, `exportToPPTX.ts`,
`SharePresentationModal.tsx`, `ExportMenu.tsx`); no shared/extracted
module combining this helper with `waitForDiagramRender()`; no new
npm dependency; no change to the 3000ms default bound or the 100ms
poll cadence; no image/network readiness behavior.

## 3. Regression/characterization spec (bind)

ONE new spec (absence gate):
`e2e/characterization/presentation-snapshot-diagram-readiness.spec.ts`.
Same harness conventions as PATCH-097/099/100. Bound prefix:
`patch-064-harness-patch-101-diagram-readiness-`.

- **Flow A — ready-path, real Mermaid diagram:** seed one slide with a
  `type: 'ai-component'` padlet whose `metadata.aiComponentJson` holds
  a valid `structured`/`diagram`/`flowchart` envelope with real,
  simple, valid Mermaid source, plus one non-AI control padlet
  (`note`). Register listeners for both `collabboard-ai-snapshot-rendered`
  (PATCH-100, carried) and the new
  `collabboard-ai-snapshot-capture-wait` event BEFORE opening the
  Preview modal (`PresentationPreviewModal.tsx`, the same bound entry
  point as PATCH-100). Assert the new event fires with
  `pendingCount === 0` and `timedOut === false` (the diagram finished
  before capture), and the preview `<img>` populates (capture
  completed).
- **Flow B — forced-timeout fallback path:** before opening Preview,
  `page.evaluate(() => { window.__patch101TimeoutOverrideMs = 50; })`
  (non-production-only override, inert in a real deployment). Because
  `renderDiagramCode()` (a real Mermaid parse+render) reliably exceeds
  50ms, this deterministically forces the timeout branch without any
  wall-clock race or artificial "stuck" fixture. Assert the new event
  fires with `timedOut === true`, and the preview `<img>` STILL
  populates (capture completed despite timeout — no thrown error, no
  hung UI).
- **Flow C — zero-latency regression for non-Mermaid content
  (carried from PATCH-100):** re-seed one of PATCH-100's synchronous
  structured fixtures (e.g. a chart or lesson board, no Mermaid);
  assert the new event fires immediately with `pendingCount === 0`
  from the very first check (`waitedMs` effectively 0, no poll loop
  entered) — proving no added latency for the common case.
- **Flow D — carried runtime regression:** the PATCH-097 and PATCH-099
  runtime specs are NOT re-implemented here (they exercise a
  completely separate file family); this patch's absence/fence gates
  (§4/§5) are the mechanism proving those files are untouched.
- **Flow E — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0).

The test does not use pixel-perfect image comparison. It does not
race the transient off-screen host directly — both instrumentation
events are registered before the triggering action, exactly as
established by PATCH-100.

## 4. Allowed files (bind)

| File | Role | Starting state at base `6df5d6c` |
|---|---|---|
| `components/presentation/slide-renderer/createSlideRenderer.tsx` | add bounded Mermaid-readiness wait + test-only instrumentation | blob `ce236e91196ef36c5491a053072acc3e981ed80d` |
| `e2e/characterization/presentation-snapshot-diagram-readiness.spec.ts` | NEW regression spec | absent at base (absence gate) |

TWO files total (one modified, one new). NO other production file.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent; the
PATCH-097 spec, the PATCH-099 spec, and the PATCH-100 spec (all three)
present and UNMODIFIED at base and post-implementation (blobs must
match exactly, before and after).

## 5. Immutable fences (bind — 73, Git blob IDs)

Verify each with `git rev-parse 6df5d6c:<path>` and equality at the
current governance HEAD. The 71-entry set carried from PATCH-100's
closure, MINUS `createSlideRenderer.tsx` (becomes this patch's
allowed/modified file), PLUS `PresentationPadletCard.tsx` (PATCH-100's
landed fix — now re-fenced as immutable since this patch must not
touch it), PLUS the PATCH-100 spec (carried forward as an explicit
immutable regression gate), PLUS `lib/ai/diagram-engine.ts`
(inspected and relied upon for the "always settles" finding, must not
change) = 71 − 1 + 3 = **73**.

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
lib/ai/diagram-engine.ts                                       ec267a24d80cf6ee5add71ee02a9b1af8a6e3c8b
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 73; unique paths = 73; unique path/blob pairs = 73;
duplicates = 0; malformed = 0.

## 6. Deterministic and live gates (bind)

Deterministic (unchanged expected totals): `git diff --check`,
`npx tsc --noEmit`, `npm run check:boundaries`,
`npx vitest run lib/infra/presentation/slideOrder.test.ts` (7/1),
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts` (9/1),
`npx vitest run` (448/43), `npm run verify`, `npm run build`.

Live (self-started `npm run dev -- --port 3000` + `PW_BASE_URL`, never
concurrent with build/verify): the new diagram-readiness spec
(dependency mode, `--no-deps`, credential-off, JSON reporter, three
stability runs); carried gates — the UNMODIFIED PATCH-097, PATCH-099,
and PATCH-100 specs must all still pass with their original
classifications; PATCH-096 grouped runner (14/14/14, 0/0/0 incidents);
PATCH-094/093/091/090/089 classifications unchanged.

## 7. Cleanup contract (bind)

Board prefix `patch-064-harness-patch-101-diagram-readiness-` must
reach `{boards: 0, padlets: 0, canvasLines: 0}` in every run. No
`test-results/` beyond the gitignored `.last-run.json`, no
`playwright-report/`, no JSON reporter output, no scratch/parser
scripts left behind. Ports 3000/4000 free at close.

## 8. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (73/73), or any §4 absence gate differs;
- any file outside §4's two is touched;
- the PATCH-097, PATCH-099, or PATCH-100 spec is modified in any way —
  all three blobs must be bit-for-bit identical before and after;
- `PresentationPadletCard.tsx`, `PresentationContainerCard.tsx`,
  `CodeDiagramRenderer.tsx`, `AIComponentExportMenu.tsx`,
  `AIComponentRenderer.tsx`, `useAIComponent.ts`,
  `normalize-ai-content.ts`, `persistence.ts`, `diagram-engine.ts`, any
  runtime fullscreen file, or any export-orchestration file
  (`useSlideThumbnails.ts`, `PresentationPreviewModal.tsx`,
  `exportToPDF.ts`, `exportToPPTX.ts`, `SharePresentationModal.tsx`,
  `ExportMenu.tsx`) is modified;
- `waitForDiagramRender()` in `AIComponentExportMenu.tsx` is touched
  or refactored into a shared module;
- the default timeout changes from 3000ms or the poll cadence changes
  from 100ms in a normal (non-overridden) run;
- the timeout override is reachable or has any effect in a production
  build;
- the instrumentation payload contains AI content, HTML, or padlet
  metadata beyond `{waitedMs, timedOut, pendingCount}`;
- capture ever throws or fails to complete on timeout;
- any latency is added for slides with zero
  `[data-ai-render-state="loading"]` elements at check time;
- the new spec relies on wall-clock racing rather than the two
  buffered instrumentation events;
- image/network readiness behavior is added or claimed fixed;
- any migration/RPC/move work enters scope;
- carried PATCH-089 through PATCH-100 evidence is weakened;
- cleanup cannot reach zero;
- any generated artifact remains after review.

## 9. Deferred follow-up (bind, NOT authorized by this patch)

Image-bearing legacy HTML content (`AIComponentRenderer.tsx`/
`useAIComponent.ts`, async `isLoading` for externally-loaded images)
has no readiness marker today and is NOT addressed by this patch.
Adding one would require modifying a component shared by the editor
canvas and both PATCH-097/099 runtime cards — a materially larger
blast radius warranting its own dedicated investigation, product
contract, and review. Snapshot captures of AI Containers with
uncached images remain exactly as unreliable as before this patch —
neither better nor worse.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted two-file diff + report (blobs
re-derived; exact wait logic and instrumentation verified against §2;
new spec passing Flows A-E; PATCH-097/099/100 spec blobs unchanged;
carried/deterministic totals; 73-fence result; cleanup proof). The
independent reviewer (Kepler primary, Gemini 3.1 Pro fallback — NOT
Sonnet) re-derives everything live and must return an explicit PASS
before the implementer commits with the bound message and pushes.
Sonnet (CTO) closes only after PASS + landing are independently
confirmed.

## 11. Required final report

Exact two changed/added paths + final blobs; the exact wait-helper and
instrumentation verified against §2; new spec Flow A-E results
(including confirmation both instrumentation events were registered
before the triggering action); explicit confirmation the PATCH-097,
PATCH-099, and PATCH-100 spec blobs are unchanged; carried totals
(089-100 unchanged); deterministic totals; 73-fence result + absence
gates; cleanup proof; explicit confirmations (no file outside §4
touched, zero added latency for non-Mermaid content, timeout override
confirmed inert in a production build, `AIComponentExportMenu.tsx`
untouched); commit hash + push status after PASS.
