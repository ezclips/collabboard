# PATCH-064 - Drawing Bridge Hardening: line bridge and slide presentation characterization

Status: APPROVED - characterization-only patch specification.
Approved by the Fable CTO 2026-07-14 after independent census verification:
all 31 hash fences re-derived against the live tree at the base commit
(31/31 match), unit baseline RE-RUN (373 tests / 39 files exactly), the
role-priority list, CanvasLine model, SimpleLineRenderer role set (all 8),
PresentationPanel sort rule (`order ?? +Infinity`, then `y`, then `x`),
FullscreenPresentation raw-`frames` source order, and `mergeSlideLayers`
behavior all confirmed by direct read. Four CTO amendments are integrated
below (Playwright project name, e2e harness create-vs-modify + credentials
discipline, mergeSlideLayers census precision + node-env test warning,
rollback section); everything else is approved as authored.
Role: implementation engineer after Fable approval
Base commit: 2d4ce1fb31c5de7f20c98b61e85189a87fe9c32a

**Amendment 5 (2026-07-14, temporary CTO authority — Fable unavailable 3
days).** Ratifies the corrected pure/unit layer as accepted (line-ordering
selected-plane fix, frame-mismatch target-frame fix, runtime-container
delegation to `expandRuntimeContainerItems`, blank-slide-title fallback
characterization; 51 focused / 424 full tests) per the independent Sonnet
acceptance review (verdict: PASS WITH REQUIRED CHANGES). That review found
the prior Playwright specs were hollow synthetic fixtures with no connection
to the real Drawing route; the implementer has since replaced them with an
honest `test.skip(true, "...")` naming the exact UI gap: the live Drawing
Line tool has no reachable path to create a `CanvasLine` with
`start_post_id`/`end_post_id` attached to app containers, and no deterministic
way to seed a full disposable slide scene. This amendment authorizes the
minimum test-only harness needed to close that gap so the approved §7.1/§7.2
scenarios can run against the real application instead of being permanently
skipped. See §5.3 for the full harness authorization. This amendment does
not reopen or require redesign of the corrected unit helpers (§5.1/§5.2).

**Bound commit message (use verbatim):**

```
test(drawing): characterize line bridge and presentation invariants (PATCH-064)
```

## 1. Purpose

Freeze current working behavior for two high-risk Drawing Canvas subsystems before any hardening or refactor work:

1. LINE BRIDGE
2. SLIDE PREVIEW / PRESENTATION

This patch is protection only. It must introduce no deliberate user-visible behavior change. It must not repair, normalize, or reinterpret current production behavior.

## 2. Fable approval

Fable review is required before implementation.

Reason: this patch defines new characterization coverage around Drawing, app-owned containers, app SVG lines, Excalidraw scene bindings, presentation thumbnails, runtime fullscreen, and slide rendering. The patch is allowed to observe current defects, but not to fix them.

## 3. Architecture census

### 3.1 Existing pure Drawing bridge contract

Protected source:

- `lib/infra/drawing/bridge.ts`
- `lib/infra/drawing/bridge.test.ts`

Current PATCH-062 bridge helpers characterize app container membership, `padlet://<id>` embeddable identity, duplicate embeddable links, frame ordering, slide inclusion parity with `resolveSlidePadlets`, snapshot validation, and diagnostic rows.

PATCH-064 must preserve all PATCH-062 behavior. It may add new characterization siblings, but it must not wire bridge helpers into production Drawing code.

### 3.2 Drawing scene / app container bridge

Protected source:

- `components/collabboard/canvas/layouts/DrawingLayout.tsx`

Current relevant regions:

- `DRAWING_BRIDGE_LOG_PREFIX = '[DrawingLayout:back-line-bridge]'`
- `BACK_LINE_INTERACTIVE_ROLE_PRIORITY`
- app embeddable custom header drag
- app embeddable natural-height resize
- Excalidraw `onChange` position synchronization
- deletion handling for embeddables and child posts
- `createEmbeddableElementForPadlet`
- `customData.renderSignature`
- `renderEmbeddable`
- Drawing back-line event bridge diagnostics and capture handlers
- slide frame discovery and slide management handlers
- `createSlideRenderer` wiring
- `FullscreenPresentation` wiring

PATCH-064 must not change these regions.

### 3.3 App SVG line system

Protected source:

- `types/collabboard.ts`
- `lib/domain/canvas/lines.ts`
- `lib/infra/canvas/linesRepository.ts`
- `components/collabboard/canvas/hooks/useCanvasLines.ts`
- `components/collabboard/canvas/hooks/useCanvasData.ts`
- `components/collabboard/SimpleLineRenderer.tsx`
- `components/collabboard/canvas/ui/OverlayLayer.tsx`
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
- `components/collabboard/canvas/layouts/DrawingLayout.tsx`

Current app line model:

- `CanvasLine` stores legacy Bezier points: `start_x`, `start_y`, `control_x`, `control_y`, `end_x`, `end_y`.
- `CanvasLine.points` stores the current multi-point path when present.
- Optional endpoint identity uses `start_post_id` and `end_post_id`.
- Z-order uses `layer_plane: 'back' | 'front'` and optional `z_index`.
- Line styling includes color, stroke width, arrows, dashes, label, label position, label text color, and label background color.
- Creation currently computes default control point at the horizontal midpoint and 50 px above the higher endpoint.
- Dragging uses local optimistic updates and later save.
- Persistence passes through `canvas.updateLine` and `canvas.deleteLine` commands.
- Delete is optimistic and preserves current failure-swallow behavior.
- Layer changes adjust `layer_plane` and `z_index` only.
- The SVG renderer exposes `data-line-renderer` and `data-line-role` targets, including `hit-path`, `visible-path`, `label-handle`, `point-handle`, `midpoint-handle`, `start-handle`, `control-handle`, and `end-handle`.
- The back-plane bridge redispatches canvas-surface mouse events to back-line targets.

PATCH-064 must characterize this current behavior. It must not replace the line system with Excalidraw arrows.

### 3.4 Excalidraw fork binding code

Protected source, read-only:

- `components/collabboard/canvas/excalidraw_fork/packages/element/src/binding.ts`
- `components/collabboard/canvas/excalidraw_fork/packages/element/src/arrows/focus.ts`
- `components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx`

Current Drawing bridge risk areas:

- `startBinding`
- `endBinding`
- target `boundElements`
- frame binding and `frameId`
- `customData`
- scene element ordering
- Excalidraw API `updateBoundElements`

PATCH-064 must read these files only for characterization context. It must not modify the fork.

### 3.5 Slide preview / presentation pipeline

Protected source:

- `components/presentation/PresentationPanel.tsx`
- `components/presentation/PresentationPreviewModal.tsx`
- `components/presentation/FullscreenPresentation.tsx`
- `components/presentation/SlideThumbnail.tsx`
- `components/presentation/useSlideThumbnails.ts`
- `components/presentation/slide-renderer/types.ts`
- `components/presentation/slide-renderer/resolveSlidePadlets.ts`
- `components/presentation/slide-renderer/planSlideComposition.ts`
- `components/presentation/slide-renderer/getSlideRenderSignature.ts`
- `components/presentation/slide-renderer/createSlideRenderer.tsx`
- `components/presentation/slide-renderer/renderExcalidrawSlideBase.ts`
- `components/presentation/slide-renderer/mergeSlideLayers.ts`
- `components/presentation/slide-renderer/PresentationContainerCard.tsx`
- `components/presentation/slide-renderer/PresentationPadletCard.tsx`
- `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`
- `components/presentation/runtime-slide/RuntimePadletLayer.tsx`
- `components/presentation/runtime-slide/resolveRuntimeContainerChildren.ts`
- `components/presentation/runtime-slide/expandRuntimeContainerItems.ts`

Current presentation behavior:

- `DrawingLayout` derives slides from active Excalidraw `frame` elements.
- Each slide uses frame `id`, `name`, `x`, `y`, `width`, `height`, `contentVersion`, and `renderSignature`.
- `PresentationPanel` sorts slides by explicit `order`, then `y`, then `x`.
- `PresentationPreviewModal` receives sorted slides from `PresentationPanel`.
- Fullscreen presentation receives the `slides` array supplied by `DrawingLayout`; implementation must characterize whether this order matches the sidebar, not force a new order.
- `resolveSlidePadlets` includes app embeddables when `frameId` equals the slide frame id; if `frameId` is missing, it uses overlap fallback.
- `resolveSlidePadlets` filters out missing padlets and padlets with `type === 'drawing'`.
- `planSlideComposition` excludes app embeddables from native bands, resolves padlet overlays, and splits native frame members into below/above bands by scene index around resolved padlets.
- `getSlideRenderSignature` includes slide geometry, native frame element versions, composition band ids, and resolved padlet render state up to child depth 2.
- `useSlideThumbnails` generates thumbnails after double RAF and keys by render signature or geometry/content version fallback.
- `PresentationPreviewModal` has a separate big-preview and thumbnail lifecycle with double RAF on first open.
- `FullscreenPresentation` uses runtime live slideshow when runtime helpers are present; otherwise it falls back to PNG rendering.
- `RuntimeSlideRenderer` renders below native PNG, live padlet DOM, and above native PNG in separate layers.
- `RuntimePadletLayer` expands visible container children for runtime display.
- `mergeSlideLayers` returns `null` when there are no drawable layers AND
  when `getContext("2d")` returns null (CTO census precision — two null
  paths, not one). It creates a canvas with the supplied width/height without
  special zero-size correction.

PATCH-064 must characterize current preview/fullscreen/export-adjacent behavior without changing it.

## 4. Allowed files

Allowed to create only:

- `lib/infra/drawing/lineBridge.ts`
- `lib/infra/drawing/lineBridge.test.ts`
- `lib/infra/drawing/presentationBridge.ts`
- `lib/infra/drawing/presentationBridge.test.ts`
- `e2e/characterization/drawing-line-bridge.spec.ts`
- `e2e/characterization/drawing-presentation.spec.ts`

Allowed to CREATE (Amendment 5 — unconditionally authorized; supersedes the
earlier "only if duplicative" condition, since the real gap is a missing
seeding/cleanup path, not shared-setup duplication):

- `e2e/characterization/drawingBridgeHarness.ts`

Allowed to MODIFY under Amendment 5 (to replace the honest-skip bodies with
real harness-backed scenarios; the credential-skip guard and Playwright
project/config must not change):

- `e2e/characterization/drawing-line-bridge.spec.ts`
- `e2e/characterization/drawing-presentation.spec.ts`

Optional test-only support file, permitted under Amendment 5 ONLY if named
here before implementation and only if essential to avoid duplicating fixture
data between the two specs:

- one additional file under `e2e/characterization/fixtures/` — NOT
  pre-authorized; if the implementer believes one is essential, stop and
  request a further narrow amendment naming the exact path.

No application source file may import the new characterization helpers or
the harness.

Do not modify:

- production Drawing files
- production presentation files
- production line files
- Excalidraw fork files
- schema files
- config files
- dependencies
- `.fable5` files other than this patch spec

## 5. Required pure helper contracts

The helpers must be pure, fixture-driven, and deep-freeze tested. They must not read the DOM, browser globals, Supabase, Next.js runtime state, or Excalidraw APIs.

CTO amendment — environment landmine: vitest runs with `environment: 'node'`
(no `document` exists). Unit tests must NOT import or invoke
`mergeSlideLayers`, any React component, or anything that touches
`document`/`window` — they would crash or false-fail. Zero-size and merge
behavior are characterized ONLY via the pure `characterizeMergeSlideLayersInput`
helper in unit tests, plus Playwright scenario §7.2 #14 in a real browser.
Unit test §6.2 #21 is bound to this pure-input form.

### 5.1 `lineBridge.ts`

Required exports:

- `LINE_BRIDGE_ROLE_PRIORITY`
- `characterizeCanvasLineGeometry(lines)`
- `characterizeCanvasLineOrdering(lines)`
- `characterizeBackLineHitTarget(stack)`
- `characterizeSceneArrowBindings(elements)`
- `validateLineBridgeSnapshot(snapshot)`
- `summarizeLineBridgeSnapshot(snapshot)`

Required behavior:

- Preserve the current role priority: `point-handle`, `midpoint-handle`, `start-handle`, `control-handle`, `end-handle`, `label-handle`, `hit-path`.
- Preserve current `CanvasLine` geometry semantics, including multi-point path precedence over legacy Bezier points.
- Preserve current `layer_plane` and `z_index` ordering semantics.
- Preserve current `start_post_id` and `end_post_id` attachment identity when present.
- Preserve current `startBinding` / `endBinding` / `boundElements` characterization for Excalidraw arrows and embeddables.
- Preserve current `padlet://<id>` target identity. Use the existing `extractPadletIdFromEmbeddableLink` helper from `lib/infra/drawing/importScene.ts`; do not create a second padlet-link parser.
- Preserve all custom metadata fields as observed fields; do not normalize them.
- Produce diagnostic rows for missing binding targets, dangling target `boundElements`, duplicated target bound entries, frame mismatch, missing padlet identity, and unsupported/missing line-role target.

Required named violation codes:

- `line-missing-start-target`
- `line-missing-end-target`
- `line-target-missing-bound-element`
- `line-target-duplicate-bound-element`
- `line-binding-frame-mismatch`
- `line-missing-padlet-target`
- `line-hit-target-missing`
- `line-hit-target-unsupported-role`
- `line-order-plane-drift`
- `line-geometry-nonfinite`

Required diagnostic fields:

- `lineId`
- `lineKind`
- `startTargetId`
- `endTargetId`
- `startPadletId`
- `endPadletId`
- `frameId`
- `layerPlane`
- `zIndex`
- `role`
- `renderer`
- `source`
- `message`

### 5.2 `presentationBridge.ts`

Required exports:

- `characterizeFrameSlides(elements)`
- `characterizeSlideOrdering(slides)`
- `characterizeSlideOrientation(slides)`
- `characterizeSlideComposition(slideFrame, elements, padlets)`
- `characterizeThumbnailKeys(slides)`
- `characterizeRuntimeContainerExpansion(resolvedPadlets, padlets)`
- `characterizeMergeSlideLayersInput(args)`
- `validatePresentationBridgeSnapshot(snapshot)`
- `summarizePresentationBridgeSnapshot(snapshot)`

Required behavior:

- Mirror the current frame discovery rule from `DrawingLayout`: active Excalidraw frame elements become slides.
- Mirror current frame membership for native elements: `frameId === slideFrame.id`.
- Mirror current app container membership for slide padlets by delegating to `resolveSlidePadlets` / `planSlideComposition` where applicable.
- Preserve overlap fallback honestly for app embeddables with missing `frameId`.
- Preserve current slide ordering characterization, including the difference between DrawingLayout source order and `PresentationPanel` sorted order if they differ.
- Preserve frame title fallback as currently rendered by the presentation components.
- Preserve landscape/portrait orientation detection from frame width/height without changing rendering.
- Preserve runtime container expansion behavior by characterizing `expandRuntimeContainerItems` / `resolveRuntimeContainerChildren` semantics.
- Preserve thumbnail cache-key behavior: `renderSignature` wins; otherwise geometry/contentVersion fallback is used.
- Preserve `mergeSlideLayers` zero-size behavior by recording it; do not add guards.

Required named violation codes:

- `slide-frame-deleted`
- `slide-order-mismatch-current`
- `slide-title-empty-current`
- `slide-embeddable-overlap-fallback`
- `slide-embeddable-missing-padlet`
- `slide-native-member-outside-frame`
- `slide-orientation-zero-size`
- `slide-thumbnail-key-missing`
- `slide-runtime-container-child-derived`
- `slide-merge-zero-size-current`

Required diagnostic fields:

- `slideId`
- `frameId`
- `frameName`
- `orderIndex`
- `sortedIndex`
- `orientation`
- `width`
- `height`
- `elementId`
- `padletId`
- `embeddableId`
- `zIndex`
- `source`
- `message`

### 5.3 `drawingBridgeHarness.ts` (Amendment 5 — CTO-authorized test-only harness)

Purpose: give the two Playwright specs a deterministic way to reach real
application state that the existing UI cannot construct end-to-end (a
`CanvasLine` with `start_post_id`/`end_post_id` attached to real app
containers; a complete disposable slide scene with frames, native content,
containers, and image fixtures).

**Isolation (non-negotiable):**

- Lives only at `e2e/characterization/drawingBridgeHarness.ts`.
- Never imported by any production file. The production-import greps in §12
  are extended to also cover this file (see updated grep below).
- Introduces no production endpoint, feature flag, test hook, schema,
  migration, dependency, config, or middleware change.
- Does not touch the Excalidraw fork.

**Authentication and environment:**

- Reuses `e2e/helpers/env.ts` for credential/env access; does not duplicate it.
- Uses the existing authenticated Playwright `setup` project / `storageState`.
- Obeys `PW_BASE_URL` discipline exactly as the rest of `e2e/characterization/`.
- Both specs retain `test.skip(!hasE2ECredentials, ...)`; no hardcoded
  personal credentials anywhere in the harness or specs.

**Disposable data:**

- Every board/row the harness creates must use a unique, clearly-marked test
  name/id (e.g. a `patch-064-harness-` prefix) so it can never collide with
  or be mistaken for real user data.
- Must never read, write, or delete an existing user's board.
- Must track every created record/resource it seeds.
- Must delete everything it created in `finally`/`afterAll`, including on
  assertion failure — no test run may leave residual rows.
- If deterministic cleanup cannot be guaranteed for a given piece of seeded
  state, the harness must not seed that state; stop and report the gap
  instead of seeding without cleanup.

**Creation strategy — prefer real paths first:**

- Prefer existing application/repository/API call paths (the same commands
  the UI itself calls) to create containers, lines, frames, and content
  wherever such a path exists and is deterministic.
- Direct test-side writes (bypassing UI/product paths) are permitted only
  where no real path exists, and only for the disposable records needed to
  characterize currently-persisted structures already named in this spec:
  - Drawing master scene content / app state / files
  - app containers and child padlets
  - `CanvasLine` rows with `start_post_id` / `end_post_id` attached
  - Excalidraw frames and native scene elements
  - uploaded-image fixture rows/assets already supported by the test
    environment
  - AI-image fixture rows only if deterministic fixture support already
    exists; otherwise leave that one scenario narrowly skipped (see §7
    AI-image note)
- Any such direct write must: match the current live schema exactly (verify
  against the repository/domain code, not assumption); be fully documented
  in the harness source; be isolated to disposable records; be deterministically
  deleted; and must not establish or imply any new production behavior
  contract (it characterizes what already exists, it does not define new
  behavior).

**Minimal typed API (names may differ; responsibilities must not grow beyond
this list without a further amendment):**

- `createDisposableDrawingBoard(...)`
- `seedDrawingContainers(...)`
- `seedAttachedCanvasLines(...)`
- `seedPresentationScene(...)`
- `openDrawingBoard(page, boardId)`
- `cleanupDrawingFixture(...)`

The API must keep seeding/cleanup mechanics out of the two spec files (specs
call the harness; they do not construct fixtures inline), expose only stable
IDs/selectors the specs need, centralize cleanup in one place, and must not
reimplement any production algorithm (sorting, binding resolution, geometry)
— it only seeds and reads real state.

## 6. Required unit characterization tests

Focused command:

```bash
npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts
```

Expected focused result: 44 tests / 2 files.

Expected full unit result after this patch, assuming the current baseline remains 373 tests / 39 files: 417 tests / 41 files.

If the baseline changes before implementation, stop and ask Fable to rebind the counts.

### 6.1 `lineBridge.test.ts` - 22 tests

Test groups:

Creation:

1. line attaches to left edge target with correct start binding and boundElements row
2. line attaches to right edge target with correct end binding and boundElements row
3. line attaches to top/bottom targets without changing padlet identity
4. unsupported edge/handle is reported as a diagnostic, not corrected

Movement:

5. custom header drag snapshot keeps attachment and padlet target identity
6. native Excalidraw drag snapshot keeps attachment and target boundElements
7. moving one container does not alter a second line attachment

Resize:

8. natural-height resize snapshot updates line geometry for the resized target
9. manual resize snapshot, when present, keeps binding rows consistent
10. repeated equal geometry snapshot produces no oscillation diagnostic

Interaction:

11. hit path resolves ahead of visible path
12. start/end/midpoint/control/label handles resolve in current priority order
13. inner card controls win when the event target is a real padlet control
14. right-click target rows preserve line id and renderer

Persistence/deletion/multiple:

15. save/reload snapshot preserves line id, geometry, and attachment
16. dashboard return snapshot preserves line id, geometry, and attachment
17. hard-refresh snapshot preserves line id, geometry, and attachment
18. deleting a line leaves container/embeddable rows untouched
19. deleting a container preserves the exact current approved line behavior in diagnostics
20. two containers with separate lines remain independent
21. one container with multiple lines keeps every attachment
22. diagnostic summary rows include every required field and named violation code

### 6.2 `presentationBridge.test.ts` - 22 tests

Test groups:

Frame discovery:

1. active frame produces one slide
2. deleted frame produces no slide
3. frame title remains stable

Content:

4. app containers appear according to current `resolveSlidePadlets` rule
5. native text/shapes/arrows/lines appear according to current `frameId` rule
6. line/container alignment remains local to slide coordinates
7. content does not move between slides when `frameId` remains stable
8. overlap fallback is characterized when app embeddable has no `frameId`

Ordering:

9. sidebar sorted order is characterized
10. fullscreen source order is characterized
11. duplicate slide behavior is characterized without changing it
12. delete slide behavior is characterized without changing it
13. order survives save/reload snapshot

Orientation/rendering:

14. landscape frame reports landscape
15. portrait frame reports portrait
16. resizing frame updates orientation classification
17. app container shell and children render plan is characterized
18. uploaded image/file dependency signature is characterized
19. AI-image behavior is characterized honestly, including current defects
20. missing asset behavior is characterized
21. zero-size canvas behavior is recorded and tested without production change

Thumbnail lifecycle/fullscreen parity:

22. thumbnail keys and fullscreen selected-slide parity are summarized with required diagnostic fields

## 7. Required Playwright coverage

Unit tests are not enough for pointer routing, real DOM stacking, Excalidraw binding mutation, thumbnail generation, fullscreen runtime rendering, or persistence/reload.

Required focused commands (CTO amendment: the config's projects are `setup`,
`smoke`, `characterization` — there is NO `chromium` project; the
`characterization` project already runs Desktop Chrome, depends on `setup`,
and injects the authenticated `storageState`):

```bash
npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization
npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization
```

Run against your own warmed dev server with `PW_BASE_URL` per
LESSONS_LEARNED (otherwise the config boots `npm run start` on :3100 and
needs a production build). Both new specs MUST carry the standard
credentials skip (`test.skip` when env credentials are absent) — the bound
LESSONS rule for every spec under `e2e/characterization/`, proven once by
running with the storage-state file absent.

The Playwright tests must create their own disposable board/canvas data and
clean up (hard-delete) when existing test helpers support cleanup. If cleanup
is not already supported, do not add schema/config; report residual test data
risk. Reuse `e2e/helpers/env.ts` for credential/env access; do not duplicate
it.

**Amendment 5 — real coverage via the harness.** Both specs must now use
`drawingBridgeHarness.ts` (§5.3) to open a real Drawing route with seeded,
disposable state and exercise real application DOM/components, replacing the
prior honest `test.skip(true, ...)` bodies. Required rules:

- Assertions must target real application selectors, real rendered
  components, persisted fixture rows, or already-exposed application state.
  No fabricated DOM nodes. `page.evaluate()` may inspect real DOM/state but
  must not manufacture the behavior under test (no reimplementing sorting,
  orientation, binding, or renderer logic inline).
- Cover the practical, automatable subset of §7.1 and §7.2 below. If a listed
  scenario genuinely cannot be triggered through the real UI even after
  seeding, verify the real persisted/rendered state directly instead of
  fabricating DOM, and document the exact limitation in the spec as a
  narrowly-scoped, reason-stated skip — do not silently drop it.
- AI-image scenarios (§7.2 #4 and #12 AI-specific parts) may remain narrowly
  skipped with a stated reason if no deterministic AI fixture support exists;
  this must not block the rest of the runtime freeze.
- Credential-based skipping is unchanged and must remain first in both files.
- `setup`-project results must be reported separately from the two
  characterization test results (as in every prior gate run in this
  program).

### 7.1 Line bridge browser scenarios

1. Create two app containers and one back-plane line between them.
2. Verify supported endpoint attachment on every currently supported visible edge/handle.
3. Verify line target rows expose `data-line-renderer='back'` and current line-role values.
4. Verify click/select on hit path works through the Drawing back-line bridge.
5. Verify start/end/midpoint/control/label handles remain interactive through the bridge.
6. Verify inner card controls remain interactive and are not stolen by the line bridge.
7. Verify right-click line target opens the current line context behavior.
8. Verify right-click app container target opens the current Drawing container edit behavior.
9. Drag a container by the custom header and verify line geometry/attachment updates.
10. Drag a container through native Excalidraw interaction and verify line geometry/attachment updates.
11. Natural-height resize a container and verify line geometry updates once without a repeated save loop.
12. Move one of two containers and verify the other line remains unchanged.
13. Reload, navigate to dashboard and back, then hard refresh; verify line and attachments survive.
14. Delete a line and verify the container remains.
15. Delete a container and record the exact current line outcome without changing it.

### 7.2 Slide preview / presentation browser scenarios

1. Create one intended active frame and verify it produces one slide.
2. Delete a frame and verify it produces none.
3. Verify frame title in sidebar, preview modal, and fullscreen where exposed.
4. Put app container, native text, native shape, arrow/line, uploaded image, and AI-image record into a frame; record current render result.
5. Verify content does not silently move between slides after save/reload.
6. Verify sidebar order and fullscreen next/previous order; fail only if they drift from the characterized current rule.
7. Duplicate and delete slides and record current behavior.
8. Verify landscape and portrait frame thumbnails/fullscreen preserve current aspect behavior.
9. Resize a frame and verify orientation updates.
10. Verify app container shell and children render in preview where current implementation supports it.
11. Verify uploaded images render or record current missing-asset behavior.
12. Verify AI-image behavior honestly; do not fix if missing/distorted.
13. Verify missing asset behavior does not throw and is characterized.
14. Exercise zero-size frame/canvas input and assert the current recorded failure/null behavior without changing production code.
15. Open presentation to generate thumbnails.
16. Change content in one slide and verify only the correct slide cache key changes.
17. Verify unrelated slide thumbnail key stays stable.
18. Close/reopen presentation and verify thumbnails remain stable under current rules.
19. Navigate away and back, then hard refresh; verify slide list/order/content under current rules.
20. Start fullscreen from selected slide, next, previous, and exit safely.

## 8. Manual acceptance matrix

Manual checks must be run after automated gates because visual/pixel differences are not fully covered by pure tests.

Line bridge:

- Create one container-to-container line.
- Attach to each currently supported edge/handle.
- Drag container header; line stays attached.
- Drag using native Excalidraw selection; line stays attached.
- Resize naturally through child content; line updates and does not repeatedly save.
- Select line through hit path.
- Drag all visible line handles.
- Edit/select inner card controls; controls still work.
- Right-click line; current line context behavior appears.
- Right-click container; current container edit behavior appears.
- Reload, dashboard-return, hard refresh; line remains according to current behavior.
- Delete line; container remains.
- Delete container; record current line behavior.

Slide preview / presentation:

- One frame creates one slide.
- Deleted frame creates no slide.
- Slide titles match current UI.
- App container, native shapes/text/arrows/lines, uploaded image, and AI-image are inspected in preview/sidebar/fullscreen.
- Sidebar order and fullscreen order are compared.
- Landscape and portrait frames are compared for aspect ratio and non-stretching.
- Resize frame; orientation updates.
- Duplicate/delete slides; current behavior remains.
- Content edit invalidates only the relevant thumbnail.
- Close/reopen, dashboard-return, hard refresh; current behavior remains.
- Fullscreen next/previous/exit works safely.

## 9. Known defects to characterize but not fix

PATCH-064 must record these if still present at implementation time, but must not repair them:

- app embeddables with missing `frameId` can enter slides by overlap fallback
- duplicate `padlet://<id>` embeddables can coexist
- slide content ordering may differ between Drawing source order and PresentationPanel sorted order
- AI-image rendering in slide preview/fullscreen may be incomplete, distorted, or missing
- missing uploaded image/file assets may render fallback output
- zero-size canvas/layer inputs are not guarded by `mergeSlideLayers`
- `PresentationPreviewModal` uses fixed `aspect-[16/10]` outer preview framing while the rendered PNG is object-contain
- PDF/PPTX export behavior is adjacent to this patch and must only be characterized if touched by the preview path
- line deletion/container deletion behavior must remain exactly as currently approved, even if surprising

## 9.5 Rollback (CTO amendment — required section)

Additive-only: at most seven new files (four helpers/tests, two Playwright
specs, plus the now-authorized `drawingBridgeHarness.ts`) and zero modified
production files. `git revert <implementation commit>` restores the exact
pre-patch tree; the §11 hash fences prove nothing else moved. No schema,
dependency, fork, or config surface is involved, so revert is a plain
one-commit operation. Amendment 5 additionally requires: before revert (or
before re-running), confirm no disposable harness-seeded records remain in
the database — the harness's own cleanup proof (§12) is what makes revert
safe; a revert must never be the only cleanup mechanism for leftover test
data.

## 10. Stop conditions

Stop before editing if any condition occurs:

- `git rev-parse HEAD` is not `2d4ce1fb31c5de7f20c98b61e85189a87fe9c32a`
- working tree is not clean except for an approved PATCH-064 spec document
- any hash fence below mismatches before implementation
- PATCH-062 bridge files have changed unexpectedly
- PATCH-063 files show uncommitted changes
- current unit baseline is no longer 373 tests / 39 files and Fable has not rebound counts
- DrawingLayout no longer contains `[DrawingLayout:back-line-bridge]`
- `resolveSlidePadlets` no longer uses the current `frameId`-then-overlap fallback rule
- Excalidraw fork files are missing or moved without a new Fable census
- implementation would require production behavior changes
- implementation would require schema/config/dependency changes
- Playwright cannot reach a stable Drawing Canvas route after following `LESSONS_LEARNED` port discipline
- (Amendment 5) deterministic cleanup of harness-seeded data cannot be
  guaranteed for a required scenario
- (Amendment 5) a production endpoint, feature flag, or test hook would be
  needed to seed required state
- (Amendment 5) existing app authentication/API paths cannot create the
  required disposable records in isolation
- (Amendment 5) the harness would need to read, write, or delete an existing
  user's board
- (Amendment 5) a direct-write schema assumption cannot be verified against
  live repository/domain code
- (Amendment 5) required runtime state cannot be seeded without widening
  scope beyond the files named in §4/§5.3

## 11. Hash fences

Verify these before editing and after verification. All must remain unchanged unless this spec is amended by Fable.

```text
components/collabboard/canvas/layouts/DrawingLayout.tsx b3684e4c6226ec2ad77fbff3265de25339a7f471
lib/infra/drawing/bridge.ts ed26c312610a386711f658662e82d29dd48c5890
lib/infra/drawing/bridge.test.ts b6f3e674328e06304e08d6f079a553df4d36464e
components/presentation/slide-renderer/resolveSlidePadlets.ts 5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 9524e6397e623fef905f213e80953b2a22e2423d
components/presentation/slide-renderer/getSlideRenderSignature.ts da903ed4c9b7cd9b9ff86657fa2c44fa27e4665d
components/presentation/slide-renderer/createSlideRenderer.tsx ce236e91196ef36c5491a053072acc3e981ed80d
components/presentation/slide-renderer/mergeSlideLayers.ts 91ab266825b8b47b1035c09c6072e6cb23d69620
components/presentation/slide-renderer/renderExcalidrawSlideBase.ts 8e088e9f2da6bbe6f6e565104a4a8cf90c5eb1f7
components/presentation/slide-renderer/PresentationContainerCard.tsx 3876eeba810484fcf01437d477fe682dec2aa32b
components/presentation/slide-renderer/PresentationPadletCard.tsx bbcef06c8b8de29e455ec4748e7ea2762f0c1052
components/presentation/PresentationPanel.tsx 926f43cec98fadc610976081b58cb246ba00d501
components/presentation/useSlideThumbnails.ts 19801ae2c2b0ddc8841e358ad0fbc7cde96708f3
components/presentation/FullscreenPresentation.tsx caea11414929b0291e8d5d54513d50f55daf73b3
components/presentation/runtime-slide/RuntimeSlideRenderer.tsx a407cccc230ca74a36a443b5f701767856754230
components/presentation/runtime-slide/RuntimePadletLayer.tsx 7baee436b9a63313cbb157444ff846b2bd1c26aa
components/presentation/runtime-slide/expandRuntimeContainerItems.ts 14e7573c53e2ab85c36d74d2e1afe22cf64c8da1
components/presentation/runtime-slide/resolveRuntimeContainerChildren.ts 71a878350b66b464bd693960e778b6a4fa73a4a0
components/presentation/PresentationPreviewModal.tsx 5116031b27f73bb7616f4024b197824c6718aa17
components/presentation/SlideThumbnail.tsx b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/collabboard/SimpleLineRenderer.tsx a38572a499d6aadf3002fa34f7a8e0e321220ea6
components/collabboard/canvas/ui/FreeformPadletCards.tsx 1c12d24a42c45a279efb4da0de785b478e4ca385
components/collabboard/canvas/ui/OverlayLayer.tsx 8940a6b1baa1e825139a026c3bb8f37e04ee7afb
components/collabboard/canvas/hooks/useCanvasLines.ts 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
components/collabboard/canvas/hooks/useCanvasData.ts 2e158f1278a395b5028083e8f387a22e4daf5b60
lib/infra/canvas/linesRepository.ts 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
lib/domain/canvas/lines.ts 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
types/collabboard.ts ea46b79cf0e4392f7141017943c74733e1e87be2
components/collabboard/canvas/excalidraw_fork/packages/element/src/binding.ts 8a977611d22d9c6cb7f50f1c7c245c31d9764cea
components/collabboard/canvas/excalidraw_fork/packages/element/src/arrows/focus.ts fa8018adbe2ea3279836371c4466e8e64d091a3c
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx cd34ff6ddb838e1bc3f21a7d01bf82106556d362
```

## 12. Verification gates

Required implementation gates:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts
npx tsc --noEmit
npm run check:boundaries
npx vitest run
npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization
npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization
npm run verify
npm run build
```

Runtime/config gate:

- Start `npm run dev` using the port-gate procedure in `LESSONS_LEARNED.md`.
- Confirm the server reaches Ready.
- Exercise the focused Drawing route used by Playwright once.
- Stop the dev server cleanly.
- Confirm no generated logs, test artifacts, or `.next` files are staged.

Acceptance greps:

```bash
rg -n "from ['\"]@/lib/infra/drawing/(lineBridge|presentationBridge)|from ['\"]\.*/(lineBridge|presentationBridge)" app components lib --glob "!lib/infra/drawing/*.test.ts"
rg -n "lineBridge|presentationBridge" components/collabboard/canvas/layouts components/presentation app/dashboard/canvas
rg -n "drawingBridgeHarness" app components lib
```

All three greps must prove no production application import was introduced
(the third confirms the harness itself is never imported outside `e2e/`).

Amendment 5 additional required gates:

- Real credentialed run: `npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization` against a warmed `PW_BASE_URL` server, with credentials present — must exercise the real Drawing route via the harness, not skip.
- Real credentialed run: `npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization` — same requirement.
- Credential-off proof: rerun both with credentials absent (or `E2E_SKIP_CREDENTIALS=1` if that convention is still in use) and confirm both skip cleanly at the credential guard.
- Cleanup proof: after the credentialed run, independently query for any harness-seeded disposable board/rows (by the harness's naming convention) and confirm zero remain.
- Re-verify all 31 hash fences after the full run (in addition to before).

## 13. Required final report for implementation

The implementer must report:

- created files
- helper API
- exact focused unit count
- exact full unit count
- Playwright results
- typecheck, boundaries, verify, build, and dev-ready results
- hash-fence before/after results
- production import grep result (including the harness grep)
- manual matrix result or explicit manual-not-run statement
- known defects recorded but not fixed
- commit hash, if commit is authorized
- push status, if push is authorized
- (Amendment 5) harness API surface actually implemented
- (Amendment 5) which §7.1/§7.2 scenarios run for real vs. remain narrowly
  skipped, with reasons for each skip
- (Amendment 5) cleanup proof: confirmation that zero harness-seeded records
  remain after the full credentialed run