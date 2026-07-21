# PATCH-099 — Render Current Structured AI Content in the Runtime Slider/Player (Corrective Follow-up to PATCH-097)

**Status:** **AUTHORIZED** (not yet implemented).

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (Kepler primary, Gemini 3.1 Pro fallback) — PASS required
before commit. Sonnet (CTO/governance owner) authored/authorized this
patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-21.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`ef83e38053c81544b7a564e83b20be89e012e7d1`
(`docs(fable): record AI Container snapshot/export design investigation
(PATCH-098 still not authorized)`; HEAD == origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`fix(presentation): render structured AI content in the runtime slider/player via AIContentRenderer (PATCH-099)`

**Numbering note (bind):** PATCH-098 remains reserved for the
snapshot/export timing work investigated and NOT authorized on
2026-07-21 (see `CURRENT_TASK.md`). This corrective runtime-rendering
follow-up is a distinct defect (rendering-dispatch gap, not
export-timing) and is authorized as PATCH-099, not a renumbered
PATCH-098, per explicit governance instruction not to reuse that
number without explicit reassignment.

---

## 0. Investigation summary (bind, 2026-07-21, from `ef83e38`)

**Defect:** PATCH-097 (landed `973e5688`) added an `ai-component`
branch to `RuntimePresentationPadletCard.tsx` and
`RuntimeContainerChildCard.tsx` that renders
`AIComponentRenderer` fed by
`resolveSavedAIHtmlFromMetadata(padlet.metadata)`
(`lib/ai/normalize-ai-content.ts:100`). That function reads ONLY
`metadata.savedAIComponent.code` / `metadata.aiComponentCode` /
`metadata.aiRawCode` — all legacy raw-HTML fields. It never reads
`metadata.aiComponentJson`.

**Root cause (exact):** the current AI-content save path
(`components/ai/editors/AIContentEditModal.tsx:686`,
`AIContentConvertModal.tsx:146`,
`components/collabboard/editors/AIComponentEditor.tsx:375`, all via
`hooks/canvas/usePadletSave.ts:1278/1328`'s
`serializeAIContentForPersistence()`) writes a structured envelope
(`{ mode, version: 1, data, meta }`) into **`metadata.aiComponentJson`**
for every content shape EXCEPT legacy HTML —
i.e. diagrams (flowchart/mindmap/pie_chart/bar_chart/timeline/
comparison), lesson boards, photo cards, and workshop boards. The
editor canvas reads this correctly via
`extractAIContentFromPadletMetadata(padlet.metadata)` →
`AIContentRenderer` (`components/ai/AIContentRenderer.tsx`) →
`normalizeAIContent()` (`lib/ai/normalize-ai-content.ts:59`) →
`deserializePersistedAIContent()` (`lib/ai/persistence.ts:176`), which
dispatches to `CodeDiagramRenderer` / `ChartDiagramRenderer` /
`TimelineDiagramRenderer` / `ComparisonDiagramRenderer` /
`PhotoCardRenderer` / `WorkshopBoardRenderer` /
`StructuredLessonBoardRenderer` / `LessonBoardRenderer` / the legacy
`AIComponentRenderer` as appropriate.

PATCH-097's runtime cards call `resolveSavedAIHtmlFromMetadata()`
directly and never call `extractAIContentFromPadletMetadata()`,
`normalizeAIContent()`, or `AIContentRenderer`. For any padlet saved
with a structured envelope, `resolveSavedAIHtmlFromMetadata()` returns
`''`, and the runtime cards' `AIComponentRenderer` shows its own
built-in "No AI component generated yet" empty-state
(`AIComponentRenderer.tsx:131-137`) — **indistinguishable from a
never-generated AI Container**, even though the editor shows real
content for the same padlet.

**Confirmed via the PATCH-097 characterization spec itself**
(`e2e/characterization/presentation-ai-component-render.spec.ts`):
every seeded fixture uses `savedAIComponent.code` / `aiComponentCode` /
`aiRawCode` exclusively — zero coverage of `aiComponentJson` /
structured content. The spec's green result is real but only proves
the legacy-HTML subset works; it provides no evidence either way for
the structured majority of current saves.

**Classification: C** — PATCH-097 uses a fundamentally wrong renderer
path (a legacy-only HTML resolver feeding the raw HTML renderer,
bypassing the required normalization/dispatch layer) for every
structured AI content shape. It is classification A (correct) ONLY
for legacy-HTML-shaped content.

**User impact:** any AI Container generated/saved today through the
current editor flows (diagram, chart, timeline, comparison, photo
card, workshop board, or a lesson board saved through the structured
path) that is placed on a presentation slide — directly or nested in a
container — renders blank ("No AI component generated yet") in the
fullscreen slider/player, while rendering correctly in the normal
canvas/editor. Only AI Containers whose metadata happens to still
carry a legacy HTML field render correctly in the player today.

**Affects both runtime card files identically** (top-level
`RuntimePresentationPadletCard.tsx` and nested
`RuntimeContainerChildCard.tsx`) — same call pattern, same gap, both
in scope.

## 1. Defect/invariant binding

**Invariant (bind):** any padlet with `type === 'ai-component'` that is
a valid slide member (direct `embeddable` slide member or a
container-child expanded via `expandRuntimeContainerItems`/
`resolveRuntimeContainerChildren`) MUST render using the SAME
authoritative content-resolution and dispatch path the editor canvas
already uses — `extractAIContentFromPadletMetadata(padlet.metadata)`
→ `AIContentRenderer` — for EVERY content shape `normalizeAIContent()`
supports (`legacy_html`, `legacy_lesson_board`, `structured` across
all subtypes, `unsupported_structured_version`, `unknown`), not only
the legacy-HTML subset.

**Read-only, no resize/interactive/export affordances (carried from
PATCH-097, unchanged):** `AIContentRenderer`'s `legacyHtmlProps` must
NOT include `onResize`/`onResizeEnd`; `onExportTargetReady` must NOT be
wired (that prop exists solely for the editor's export-menu wiring
and is out of scope here — export timing remains excluded per
explicit instruction).

**No new empty-state branch:** the existing empty/unknown-shape
fallbacks already built into `AIComponentRenderer`
(legacy HTML, "No AI component generated yet") and
`UnsupportedAIContent` (structured/unknown, via `AIContentRenderer`'s
own switch) must be relied upon as-is — no new fallback UI authored by
this patch.

## 2. Exact production change (bind)

In BOTH `RuntimePresentationPadletCard.tsx` and
`RuntimeContainerChildCard.tsx`:

1. Replace the imports of `AIComponentRenderer`
   (`components/collabboard/AIComponentRenderer.tsx`) and
   `resolveSavedAIHtmlFromMetadata` with imports of `AIContentRenderer`
   (`components/ai/AIContentRenderer.tsx`, default export) and
   `extractAIContentFromPadletMetadata`
   (`lib/ai/normalize-ai-content.ts`).
2. In the existing `normalizedType === "ai-component"` branch, replace:
   ```
   <AIComponentRenderer
     code={resolveSavedAIHtmlFromMetadata(padlet.metadata)}
     padletId={padlet.id}
     width={Number(padlet.width) || 500}
     height={Number(padlet.height) || 400}
     isExpanded
   />
   ```
   with:
   ```
   <AIContentRenderer
     content={extractAIContentFromPadletMetadata(padlet.metadata)}
     legacyHtmlProps={{
       padletId: padlet.id,
       width: Number(padlet.width) || 500,
       height: Number(padlet.height) || 400,
       isExpanded: true,
     }}
   />
   ```
   `legacyHtmlProps` is forwarded ONLY to the `legacy_html` branch
   inside `AIContentRenderer` (confirmed at
   `components/ai/AIContentRenderer.tsx:135-143`) — this preserves the
   exact current sizing/expansion behavior for legacy-HTML content
   with zero behavior change, while structured content now reaches its
   correct dedicated renderer with no width/height props needed (those
   renderers size from their own container, matching editor behavior).
3. No `onExportTargetReady` prop passed (export timing stays out of
   scope; the editor's export-target wiring is not replicated here).
4. No other line in either file may change. No unrelated formatting,
   import reordering, or refactor. The surrounding `shellStyle` /
   `mediaShellStyle` wrapper `<div>` in each file is unchanged.

**Explicitly prohibited implementation choices (bind):** no change to
`components/ai/AIContentRenderer.tsx`, `lib/ai/normalize-ai-content.ts`,
`lib/ai/persistence.ts`, `components/collabboard/AIComponentRenderer.tsx`,
`hooks/useAIComponent.ts`, or any file under
`components/ai/renderers/`; no change to
`slide-renderer/PresentationPadletCard.tsx` or
`slide-renderer/PresentationContainerCard.tsx` (that twin defect
remains a separate, not-yet-authorized candidate); no change to
`createSlideRenderer.tsx`, `useSlideThumbnails.ts`, or any
export/snapshot/PDF/PPTX/share-modal/preview-modal code (export timing
excluded per explicit instruction); no change to
`resolveSlidePadlets.ts` or `expandRuntimeContainerItems.ts`'s
filtering/gating logic; no change to the PATCH-097 spec
(`presentation-ai-component-render.spec.ts`) — its legacy-HTML
coverage must remain intact and unmodified.

## 3. Regression/characterization spec (bind)

ONE new spec (absence gate):
`e2e/characterization/presentation-ai-component-structured-render.spec.ts`
— kept separate from the PATCH-097 spec (safer: avoids mixing
legacy-HTML and structured-content evidence in one file, and avoids
any risk of destabilizing the already-landed PATCH-097 regression
gate). Same harness conventions as PATCH-097 §3 (reuse
`drawingBridgeHarness.ts` unchanged; local seeding helpers only;
`registerDrawingCleanup(test)`; per-board try/finally; zero-assertion
cleanup). Bound prefix:
`patch-064-harness-patch-099-ai-structured-render-`.

- **Flow A — direct slide member, structured diagram:** seed one
  `type: 'ai-component'` padlet whose `metadata.aiComponentJson` holds
  a valid structured envelope (`{ mode: 'diagram', version: 1, data: {
  type: 'diagram', subtype: 'flowchart', ... }, meta }`) matching the
  real shape `serializeAIContentEnvelope()` produces — with a
  detectable distinctive text marker inside `data` so the rendered
  diagram output is assertable. Confirm the marker is visible in the
  normal editor canvas first (known-working control, must remain
  true), then confirm it is visible in the fullscreen player.
- **Flow B — nested container-child member, structured content:**
  repeat with the same structured padlet parented to a
  `type: 'container'` container that is the slide member; assert the
  marker is visible via `RuntimeContainerChildCard`'s expansion path.
- **Flow C — legacy HTML unaffected (regression control):** seed one
  `ai-component` padlet using `metadata.savedAIComponent.code` (legacy
  shape, same convention as PATCH-097); assert its marker remains
  visible in the player — proves the legacy path still works after the
  renderer swap.
- **Flow D — no resize handle, no export-target wiring artifact:**
  assert `getByTitle('Resize')` has count 0 in the player for both the
  structured and legacy cases (carried read-only gate from PATCH-097).
- **Flow E — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0).

No `page.route`, no auth capture, no synthetic event dispatch, no
direct DOM/React-state mutation to fake content presence — assertions
must observe real rendered DOM output from the actual component tree.

## 4. Allowed files (bind)

| File | Role | Starting state at base `ef83e38` |
|---|---|---|
| `components/presentation/runtime-slide/RuntimePresentationPadletCard.tsx` | swap to `AIContentRenderer` dispatch | blob `0f6ec08ece8a012493c494b98e7c6949e6a99050` |
| `components/presentation/runtime-slide/RuntimeContainerChildCard.tsx` | swap to `AIContentRenderer` dispatch | blob `e1065e8ebae962a5bfaa03454a548b5a2944cf6f` |
| `e2e/characterization/presentation-ai-component-structured-render.spec.ts` | NEW regression spec | absent at base (absence gate) |

THREE files total (two modified, one new). NO other production file.
NO harness change. NO config change. NO package/lockfile change. NO
migration/RPC.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent; the
existing PATCH-097 spec (`presentation-ai-component-render.spec.ts`)
present and UNMODIFIED at base and post-implementation (blob
`63a93b3e75f69e3c9a3a46a23f2351f008955bd1` must match exactly, before
and after).

## 5. Immutable fences (bind — 61, Git blob IDs)

Verify each with `git rev-parse ef83e38:<path>` and equality at the
current governance HEAD. The full 59-entry set carried unchanged from
PATCH-097's closure (identical paths, blobs unchanged since), PLUS 2
newly-fenced files directly relied upon by this patch's fix but
explicitly prohibited from modification = **61**.

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
e2e/characterization/presentation-ai-component-render.spec.ts 63a93b3e75f69e3c9a3a46a23f2351f008955bd1
components/ai/AIContentRenderer.tsx                            0a030caa982b479ff042f15fd3e4a229119044ef
lib/ai/persistence.ts                                          d8ec23850c9f05b7d20d0bb71147e32baf7cf358
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 61; unique paths = 61; unique path/blob pairs = 61;
duplicates = 0; malformed = 0.

## 6. Deterministic and live gates (bind)

Deterministic (unchanged expected totals from PATCH-097, re-verify
before commit): `git diff --check`, `npx tsc --noEmit`,
`npm run check:boundaries`,
`npx vitest run lib/infra/presentation/slideOrder.test.ts` (7/1),
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts` (9/1),
`npx vitest run` (448/43), `npm run verify`, `npm run build`. All
gates must remain green with unchanged totals — this patch touches no
`lib/domain`/`lib/infra` file.

Live (self-started `npm run dev -- --port 3000` + `PW_BASE_URL`, never
concurrent with build/verify): the new structured-render spec
(dependency mode, `--no-deps`, credential-off, JSON reporter, three
stability runs); carried gates — the UNMODIFIED PATCH-097 spec must
still pass with its original Flows A-D and classification
`runtime-ai-component-render-consistent`; PATCH-096 grouped runner
(14/14/14, 0/0/0 incidents); PATCH-094/093/091/090/089 classifications
unchanged.

## 7. Cleanup contract (bind)

Board prefix `patch-064-harness-patch-099-ai-structured-render-` must
reach `{boards: 0, padlets: 0, canvasLines: 0}` in every run. No
`test-results/` beyond the gitignored `.last-run.json`, no
`playwright-report/`, no JSON reporter output, no scratch/parser
scripts left behind. Ports 3000/4000 free at close.

## 8. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (61/61), or any §4 absence gate differs;
- any file outside §4's three is touched;
- the PATCH-097 spec (`presentation-ai-component-render.spec.ts`) is
  modified in any way — its blob must be bit-for-bit identical
  before and after;
- `components/ai/AIContentRenderer.tsx`, `lib/ai/normalize-ai-content.ts`,
  `lib/ai/persistence.ts`, `components/collabboard/AIComponentRenderer.tsx`,
  `hooks/useAIComponent.ts`, or any `components/ai/renderers/*` file
  is modified;
- `slide-renderer/PresentationPadletCard.tsx` or
  `slide-renderer/PresentationContainerCard.tsx` is touched;
- any export/snapshot/PDF/PPTX/share/preview code
  (`createSlideRenderer.tsx`, `useSlideThumbnails.ts`,
  `SharePresentationModal.tsx`, `PresentationPreviewModal.tsx`,
  `AIComponentExportMenu.tsx`) is touched — export timing is out of
  scope for this patch;
- an interactive resize handle appears in the player;
- `onExportTargetReady` is wired from either runtime card;
- the new spec fakes content presence via direct DOM/state injection;
- any migration/RPC/move work enters scope;
- carried PATCH-089 through PATCH-097 evidence is weakened;
- cleanup cannot reach zero;
- any generated artifact remains after review.

## 9. Review and commit flow (bind)

Implementer delivers the uncommitted three-file diff + report (blobs
re-derived; exact renderer swap verified against §2; new spec passing
Flows A-E; PATCH-097 spec blob unchanged; carried/deterministic
totals; 61-fence result; cleanup proof). The independent reviewer
(Kepler primary, Gemini 3.1 Pro fallback — NOT Sonnet) re-derives
everything live and must return an explicit PASS before the
implementer commits with the bound message and pushes. Sonnet (CTO)
closes only after PASS + landing are independently confirmed.

## 10. Required final report

Exact three changed/added paths + final blobs; the exact renderer
swap verified against §2 in both files; new spec Flow A-E results;
explicit confirmation the PATCH-097 spec blob is unchanged; carried
totals (089-097 unchanged); deterministic totals; 61-fence result +
absence gates; cleanup proof; explicit confirmations (no file outside
§4 touched, no resize handle exposed, no export-path file touched,
`slide-renderer/*` untouched); commit hash + push status after PASS.
