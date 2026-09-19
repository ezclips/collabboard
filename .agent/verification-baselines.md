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
