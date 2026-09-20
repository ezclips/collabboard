# Verification baselines

Load-bearing gate criteria for this repository. They lived only in one agent's
session history until 2026-09-18, which is not a criterion — a gate nobody can
look up is re-derived, and re-derived wrong.

Recorded on branch `feature/board-retrieval`, at `5ddfec7` (the text-search
foundation), from the gate run that produced the reading below.

---

## 1. Unit suite — `npx vitest run`

**THE GATE IS THE SET OF FAILING TEST FILES, NOT THE COUNTS.** Test and file
totals move whenever a test is added, and the suite is timing-sensitive. Compare
the *file set* against the list below; a run passes when the set is identical.

**AND WHEN A COMMIT TOUCHES A FILE THAT IS ALREADY IN THIS SET, THE REPORT MUST
DIFF THAT FILE'S FAILING TEST NAMES TOO.** A baseline-failing file is already
failing, so the set cannot notice anything that happens inside it: new tests
added to it could fail, or a previously passing test in it could break, and the
set still reads "identical" and the gate still says clean. Name which tests in
that file fail and confirm they are the same ones as before — the criterion
above is blind by construction exactly where the edit landed.

Found 2026-09-19, during item 15: that commit added 7 tests to
`KnowledgeExistingPdfPicker.test.tsx`, baseline member #1. They passed (21 of 25,
with the file's 4 pre-existing CanvasClient wiring failures unchanged) and the
report said so — but nothing in the gate had required it to.

Reference reading (2026-09-18, clean machine):
`27 failed | 429 passed | 9 skipped (465)` files,
`58 failed | 9003 passed | 94 skipped (9155)` tests — where the 27th file is the
known flake in section 3, not a real member of this set.

### The 26 baseline failing files

```
components/collabboard/KnowledgeExistingPdfPicker.test.tsx
components/collabboard/KnowledgePdfCanvasSurface.test.tsx
components/collabboard/KnowledgePdfUploader.test.tsx
components/collabboard/KnowledgeSourceRegionCrop.test.tsx
components/collabboard/containerResizeB3.characterization.test.tsx
components/collabboard/documentReadRoutingAllHosts.architecture.test.tsx
components/collabboard/editors/DocumentEditor.readonly.test.tsx
components/collabboard/editors/DocumentEditor.test.tsx
components/collabboard/editors/NoteEditor.characterization.test.tsx
components/collabboard/freeformFullViewFrame.test.tsx
components/collabboard/freeformPdfInteractions.test.tsx
components/collabboard/freeformPostSelectionBatch1.characterization.test.tsx
components/collabboard/freeformTableSelection.characterization.test.tsx
components/collabboard/knowledgePdfCard.test.tsx
components/collabboard/knowledgeUsedInNotes.integration.test.tsx
components/collabboard/libraryReuseLinkLayouts.test.tsx
components/collabboard/postResizeB2.integration.test.tsx
lib/domain/canvas/documentSaveLifecycle.source.test.ts
lib/domain/canvas/documentSwitchGuard.source.test.ts
lib/infra/canvas/boardEditAuthorityWiring.source.test.ts
lib/infra/knowledge/knowledgeEmbeddingDeploy.source.test.ts
lib/infra/knowledge/knowledgeExtractionScope.source.test.ts
lib/infra/knowledge/knowledgePdfAreaImageWiring.source.test.ts
lib/infra/knowledge/knowledgeSourceNoteWiring.source.test.ts
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts
scripts/harness/worktreeLifecycle.test.ts
```

One of these is not an assertion failure and should not be read as one:
`knowledgeUsedInNotes.integration.test.tsx` fails at **suite load** with
`either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables
or supabaseUrl and supabaseKey are required`. It is environment-dependent, not a
code failure.

#### 2026-09-20 — the set reads 25, not 26, and nothing regressed

Stage 1 of the media-sources unit runs the gate in an environment where
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **present**
in `.env.local`. `knowledgeUsedInNotes.integration.test.tsx` therefore loads and
passes, and the failing-file set reads **25 files / 56 tests** rather than 26.

This is an environment change, not a code change, and the distinction is the
whole point of the paragraph above: a report that says "nothing gone" without
naming it is claiming a passing file it did not earn. The correct statement is
two statements:

- **Assertion failures:** the 25 remaining files, 56 named tests — unchanged.
- **Suite-load failure:** the 26th file, absent because its environment
  dependency is now satisfied. It returns the moment the env is missing.

A run on a machine without those variables should read 26 and must not be
treated as a regression, in either direction.

### The 56 baseline failing test NAMES

Recorded 2026-09-19 during wiki Unit 2, because the rule above could not be
obeyed without them: the report must diff a touched file's failing test names,
and there was nothing to diff against. Unit 2 touched `CanvasClient.tsx`, which
**15 of the 26 files above read** — exactly the case the rule was written for,
and exactly the case the file set is blind to.

The 57th line below is the suite-load failure, not a test.

```
components/collabboard/KnowledgeExistingPdfPicker.test.tsx > 1/2/10/11/12. wiring and negative controls > 1. Add PDF keeps its native label activation
components/collabboard/KnowledgeExistingPdfPicker.test.tsx > 1/2/10/11/12. wiring and negative controls > 10. both entry points share one placement authority
components/collabboard/KnowledgeExistingPdfPicker.test.tsx > 1/2/10/11/12. wiring and negative controls > 2. Use existing PDF is a plain tool under the same layout gate
components/collabboard/KnowledgeExistingPdfPicker.test.tsx > 1/2/10/11/12. wiring and negative controls > 2b. the chooser is withheld from viewers and unsupported layouts
components/collabboard/KnowledgePdfCanvasSurface.test.tsx > 1. the old Knowledge launcher is gone, Add PDF stays > keeps Add PDF and its hidden picker
components/collabboard/KnowledgePdfCanvasSurface.test.tsx > R2. external draft placement is isolated from editor state > 1 + 2. an external draft declares isNewPost itself, so an open editor cannot suppress it
components/collabboard/KnowledgePdfCanvasSurface.test.tsx > R2. external draft placement is isolated from editor state > 3 + 4. parent/section come from the draft, never from the editor
components/collabboard/KnowledgePdfCanvasSurface.test.tsx > R2. external draft placement is isolated from editor state > 5 + 6. editor-driven saves keep the padletToEdit-derived behaviour
components/collabboard/KnowledgePdfUploader.test.tsx > P6C Knowledge PDF upload client > registers Add PDF as a distinct Media action without replacing Document
components/collabboard/KnowledgeSourceRegionCrop.test.tsx > P6J-F9-C2 KnowledgeSourceRegionCrop > C15: the src carries no query string, and the props/url carry no page/document/region/rotation authority
components/collabboard/containerResizeB3.characterization.test.tsx > PATCH POST-RESIZE-B3.A: frozen boundaries (negative controls H/I/J) > negative control I: the B1/B2 generic resize capability matrix is untouched by this characterization patch
components/collabboard/documentReadRoutingAllHosts.architecture.test.tsx > PATCH 9D.1: architecture guards > CanvasClient.tsx openDocumentFromPreview remains the single canonical function every layout host is wired to
components/collabboard/editors/DocumentEditor.readonly.test.tsx > DocumentEditor read-only (PATCH-149B1b-i) > has an accessible Close control; Close and backdrop invoke onClose only, never onSave
components/collabboard/editors/DocumentEditor.test.tsx > DocumentEditor editable (PATCH-149B1b-i) > clean backdrop closes immediately; dirty backdrop saves then closes; inner clicks never trigger it
components/collabboard/editors/DocumentEditor.test.tsx > PATCH-152: Freeform creation flow -- close always saves, never confirms > a blank untouched new draft closes without saving on Close/backdrop/Escape
components/collabboard/editors/NoteEditor.characterization.test.tsx > NoteEditor current save-on-close lifecycle (characterized, not corrected) > backdrop click saves then closes, in that order, and the save does persist
components/collabboard/editors/NoteEditor.characterization.test.tsx > NoteEditor current save-on-close lifecycle (characterized, not corrected) > save callback carries content/style/reaction fields plus title (a top-level padlet field, added for the ghost-placeholder title bar) — still no metadata
components/collabboard/editors/NoteEditor.characterization.test.tsx > PATCH 8P.1: canonical Comments-panel title/style wiring (MANAGE) > opening and closing without any edit produces an unchanged commentTitle/commentTitleStyle in the onSave payload
components/collabboard/editors/NoteEditor.characterization.test.tsx > PATCH 8P.1: canonical Comments-panel title/style wiring (MANAGE) > title and title-style persist through close/reopen (survive the onSave payload)
components/collabboard/editors/NoteEditor.characterization.test.tsx > PATCH 8P.1: real authenticated identity for new detached comments > historical comments already persisted with userId "user1" are left completely untouched
components/collabboard/editors/NoteEditor.characterization.test.tsx > PATCH 8P.1: real authenticated identity for new detached comments > the onSave payload for a new comment carries the real currentUserId, never the "user1" placeholder
components/collabboard/freeformFullViewFrame.test.tsx > PATCH FULLVIEW-FRAME-R1: AI Component Reactions Row and minHeight floor > AI content-derived height (no boxManualHeight/needsContentScroll for ai-component) is untouched
components/collabboard/freeformPdfInteractions.test.tsx > 1-4. Add PDF works from the element a person clicks > 1. Freeform renders a visible Add PDF control
components/collabboard/freeformPdfInteractions.test.tsx > 1-4. Add PDF works from the element a person clicks > 2. the control is a real label bound to the one hidden PDF input
components/collabboard/freeformPdfInteractions.test.tsx > 1-4. Add PDF works from the element a person clicks > 3. the PDF tool never leaks into the generic tool handler
components/collabboard/freeformPdfInteractions.test.tsx > 1-4. Add PDF works from the element a person clicks > 4. Add PDF lives in Media, marked pinned, and exists exactly once
components/collabboard/freeformPdfInteractions.test.tsx > 1-4. Add PDF works from the element a person clicks > 4c. when Media actually collapses, Add PDF stays out on the toolbar
components/collabboard/freeformPostSelectionBatch1.characterization.test.tsx > PATCH FREEFORM-SELECTION-BATCH-1 Note/Todo/Link/AI-component click no longer races the blank-canvas deselect > Note and AI-component: click does NOT bubble to canvas deselect -- guard is scoped to their shared fallback wrapper
components/collabboard/freeformTableSelection.characterization.test.tsx > PATCH FREEFORM-TABLE-SELECTION Table click no longer races the blank-canvas deselect > scoped to Table only (at the time of this patch): the generic branch's own resize/selection machinery was not touched wholesale -- Drawing (which shares the family's default {content}/{resizeHandle} wrapper and is explicitly, permanently frozen -- PATCH FREEFORM-SELECTION-BATCH-1, PATCH FREEFORM-CONTAINER-SELECTION) never gets an unconditional click guard from any of these patches
components/collabboard/knowledgePdfCard.test.tsx > 24-29. nothing outside the card moved > 24-26. Add PDF is untouched: Media, pinned, native label
components/collabboard/knowledgeUsedInNotes.integration.test.tsx [ components/collabboard/knowledgeUsedInNotes.integration.test.tsx ]
components/collabboard/libraryReuseLinkLayouts.test.tsx > the real placement writers are the ones modelled above > the drag contract and the NEW-image flows are unchanged
components/collabboard/postResizeB2.integration.test.tsx > PATCH POST-RESIZE-B2 freezes > 71/72. File and Comment stay non-resizable
components/collabboard/postResizeB2.integration.test.tsx > PATCH POST-RESIZE-B2 renderer wiring > 14. box-manual height drives an explicit card height only for box B2 types
components/collabboard/postResizeB2.integration.test.tsx > PATCH POST-RESIZE-B2 renderer wiring > PATCH AI-R1: Freeform AI frame height is content-derived, never the stale persisted padlet height
lib/domain/canvas/documentSaveLifecycle.source.test.ts > PATCH-149B2-i: scope boundary -- no B2-ii, PDF or clipart work > the discard dialog owns no capability, persistence or routing logic
lib/domain/canvas/documentSwitchGuard.source.test.ts > PATCH-149B2-ii: scope boundary -- no PDF, Read-affordance, or clipart work > no PDF branch was added, and the B1b-iii Read-affordance owners stay untouched
lib/infra/canvas/boardEditAuthorityWiring.source.test.ts > the census sanitizer counts executable source, not prose > an added consumer, or a removed one, moves the census
lib/infra/canvas/boardEditAuthorityWiring.source.test.ts > the padlets capability is wired to padlets surfaces only > census: the padlets capability has a small, enumerable set of consumers
lib/infra/knowledge/knowledgeEmbeddingDeploy.source.test.ts > P6I-D3 local Voyage Worker Pool preparation > keeps migrations, protected worker code, and unrelated files unchanged
```

**The two `boardEditAuthorityWiring` rows above: 63 → 64 observed, deliberate,
DO NOT "FIX" THE CONSTANT.** Both count occurrences of `canEditBoardContent` in
`CanvasClient.tsx` against `EXPECTED_BOARD_CONTENT_CONSUMERS = 60`. Wiki Unit 2
added one real consumer — `canEdit={canEditBoardContent}` on `BoardWikiDrawer`,
which is the correct gate — moving the count from 63 to 64. The test NAMES are
unchanged; only the number inside them moved.

Raising the constant to 64 would close a baseline failure nobody caused on
purpose and erase the three pre-existing drifts that were already there at 63.
The census is a drift detector, and a detector that gets reset to whatever the
code currently says has stopped detecting. Leave it failing at the wrong number
until someone deliberately reconciles all four.

The remaining names:

```
lib/infra/knowledge/knowledgeExtractionScope.source.test.ts > P6H persistence scope -- provenance and privilege guards > pins one rollout-compatible completion signature with optional final chunks
lib/infra/knowledge/knowledgeExtractionScope.source.test.ts > P6H persistence scope -- provenance and privilege guards > revokes the exact replacement RPC from every browser role
lib/infra/knowledge/knowledgePdfAreaImageWiring.source.test.ts > F6-F10: the canvas asks the server, and claims the drop exactly once > F8: it re-checks the creation capability rather than trusting the drag
lib/infra/knowledge/knowledgeSourceNoteWiring.source.test.ts > KNI-R2 existing-Note source clip drop > parses the one dedicated clip, claims synchronously, then validates the target type
lib/infra/knowledge/knowledgeSourceNoteWiring.source.test.ts > P6J-F5 source note wiring > A: routes the Knowledge page request into the ordinary Note editor
lib/infra/knowledge/knowledgeSourceNoteWiring.source.test.ts > P6J-F8-B1 source clip drop > re-checks the creation capability before staging the editor
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B2 source marker and navigation wiring > J: a request is refused and cleared outside the current board/auth scope
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B2 source marker and navigation wiring > K: CanvasSidebar owns Add PDF only -- never the reader, never a library modal
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B2 source marker and navigation wiring > M2: B4-B3 highlight rendering is a pure read of the index already in memory
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B2 source marker and navigation wiring > M: the reader receives the page and the citing row id, and no coordinate
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B2 source marker and navigation wiring > Q: B2 introduces no elevated authority and no new endpoint
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B4-B4 exact source interaction wiring > native text selection is never blocked, only used to suppress navigation
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F6-B4-B4 exact source interaction wiring > the reader still delegates span resolution and adds no data access
lib/infra/knowledge/knowledgeSourceReferenceReadWiring.source.test.ts > P6J-F8-B2 source excerpt boundaries > B3: the provider still only transports what its owner derived
scripts/harness/worktreeLifecycle.test.ts > worktree lifecycle > normalizes mixed Windows path separators to one absolute path
scripts/harness/worktreeLifecycle.test.ts > worktree lifecycle > protects the main worktree during create and remove
scripts/harness/worktreeLifecycle.test.ts > worktree lifecycle > refuses a target path collision
```


---

## 2. `npm run check:boundaries`

Exits **1** with exactly these two pre-existing `no-restricted-imports` errors
under `lib/domain/CONVENTIONS.md` rule 1. Exit 1 with this pair is a pass.

```
lib/domain/canvas/boardObjectReveal.test.ts
  9:1  error  '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry' import is restricted from being used by a pattern
lib/domain/canvas/boardObjectReveal.ts
  1:1  error  '@/components/collabboard/canvas/minimap/freeformMinimapGeometry' import is restricted from being used by a pattern
```

---

## 3. KNOWN FLAKE — `scripts/check-react-hooks.test.ts` (FIXED at `6cea975`)

**Not a baseline member, and not a regression when it appears.** It fails under
machine load and passes on a quiet machine, so it will drift in and out of any
run-to-run comparison.

**It was closer to failing than "load" suggests.** In the quiet full-suite run of
2026-09-18 that produced the reading below, this file took **4,924ms against the
5,000ms default — 76ms of headroom.** It was not waiting for a busy machine; it
was already at the line, which is why it tipped so easily. Both ESLint-spawning
files now carry an explicit timeout on their first test (`6cea975`), and the
quiet run after that returned exactly the 26 baseline files with no flake.

**THE FIRST NUMBER WAS TOO LOW, AND THAT IS THE LESSON.** `6cea975` set that
timeout to 20,000ms and called it ample. A later full-suite run on a busier
machine took **26,095ms** and failed again — inside the very fix meant to stop
it. Both files now carry **60,000ms**. Pick such a number against the observed
WORST case (30,171ms here), not against a comfortable multiple of the typical
one: a limit anywhere near the worst case moves a flake rather than removing it.
It is a hang detector, not a performance budget.

Observed 2026-09-18:

| Condition | Result |
|---|---|
| Full suite, concurrent `next dev` cold compile | FAIL — `Test timed out in 5000ms`, file total **30,171ms** |
| Full suite, dev idle | PASS |
| Full suite, dev idle + browser attached | FAIL — same timeout, file total **7,527ms** |
| Alone, twice | PASS — **1,558ms** and **1,542ms** |

**Cause.** The failing test is the *first* in the file, and it is the first thing
in the run to invoke ESLint programmatically
(`checkHookOrderForText(VALID, PROBE, eslint)`). That first call pays the whole
config-and-plugin graph load, which exceeds the 5,000ms per-test default under
load. The other seven tests in the file pass every time.

`lib/infra/settings/serverOnlyImportBoundary.source.test.ts` is the same shape —
it spawns ESLint too, timed out at 9,200ms in the contended run, and passed at
1,099ms when quiet. Treat both as load-sensitive.

**How to tell a flake from a regression here:** run the file alone. If it passes
in about 1.5 seconds, the full-suite failure was contention. Both files now carry
that timeout, so this is history rather than a live hazard — but the discriminator
still holds if a new ESLint-spawning test appears.

**Run the gate with nothing else heavy in flight.** A concurrent `next dev`
compile manufactured two false failures in one run and cost a round trip.

**A control read while it is disabled is not a reading.** Same shape as the
flake, in the browser rather than the suite: the Board AI provider chooser
rendered "CollabBoard Default" for 8.4 seconds while `GET /api/settings/ai-roles`
cold-compiled, and a probe taken at 4.5s reported that as the live provider while
the stored role was the OpenAI connection. Wait for `disabled === false` before
reading any control's value, and prefer no value to a definite wrong one.
