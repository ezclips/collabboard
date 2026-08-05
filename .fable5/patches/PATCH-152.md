# PATCH-152 — DOCUMENT POST TOOLBAR PARITY

**Status:** **AUTHORIZED FOR IMPLEMENTATION · UNBLOCKED**
**Authored:** 2026-08-05 (governance architect).
**Required starting HEAD:** `e9f7946dd0f8f33b28f9648d15c1216d2cd39adc`
**First authoring of this number** — `git log --all --diff-filter=A -- .fable5/patches/PATCH-152.md`
was empty prior to this commit; this file did not exist at any point in git history before now.

**Numbering note (read before anything else):** PATCH-149 §26.1 recorded, on product-owner
directive: *"No PATCH-152 is reserved. No follow-up patch number is allocated for the clipart
divergence."* That directive is a **historical fact about a different, unrelated body of work**
(the clipart-modal Document-exclusion follow-up, tracked informally as C5/C7 in PATCH-149 §26.9
and §32.22) and is **not reopened, not reversed, and not renumbered here**. The clipart divergence
remains permanently unnumbered, exactly as §26.1 directed. Independently, repository inspection at
`e9f7946` confirms: (a) no file was ever committed at `.fable5/patches/PATCH-152.md`; (b) no ledger
row anywhere assigns PATCH-152 to any *other* piece of work; (c) the most recent live status table
in PATCH-149.md (§40.4) does not mention PATCH-152 at all. The number is therefore genuinely
available, and this patch allocates it — for the first and only time — to **Document post toolbar
parity**, a wholly unrelated feature first proposed and governed as chat-only text in a prior
session but never previously committed to a governance file. See PATCH-149 §41 for the
corresponding ledger reconciliation entry.

---

## 1. Origin

The Document post (`DocumentEditor.tsx`, introduced across PATCH-149B1b-i/ii/iii and PATCH-149B2-i/ii)
uses `NoteEditorToolbar` in `variant="document"` mode, which structurally hides the Box/back-arrow
control and shows only tools with a supplied `onClick` handler (PATCH-149B1b-i). At the current
HEAD, `DocumentEditor.tsx` supplies handlers for Bold, Italic, Strikethrough, Underline, Bullet
list, Numbered list, and Code only — it does **not** supply `onTextStyle`, `onLink`, `onAlign`, or
`onTextComment`. Align's absence is intentional and structural (no `onAlign` prop exists on
`DocumentEditor` at all — PATCH-149 §22.6). Text style, Link, and Comment are absent only because
`DocumentEditor` never wires them, not because the toolbar component forbids them — the same
`textModeTools` array in `NoteEditorToolbar.tsx:99-132` already defines all three.

Product direction (relayed by the Product Owner, images of the Note-post toolbar supplied for
reference) is that the Document post should carry the same Text-style / Link / Comment
capability as the Note post, using the Note post as the authoritative visual and behavioural
template, with the Box control permanently excluded and two explicit, deliberate divergences
(Comment identity source; local selection-reactivity) recorded below.

## 2. Product Owner decisions — authoritative, not open

### OQ-1 — Box control: **DEFERRED**

The Document toolbar must **not** receive:
- the Box/back-arrow control;
- an inert Box control;
- a decorative Box control;
- invented Box navigation;
- a substitute toolbar-navigation control.

No patch number is allocated to Box. It remains a recorded, unscheduled candidate.

### OQ-2 — Comment identity: **ROUTE B SELECTED**

Use the authenticated user already available in `CanvasModals.tsx` (`user: AuthUser | null`,
`CanvasModals.tsx:72`/`:118`). The pinned expression, verbatim, matching the existing in-file
precedent at `CanvasModals.tsx:388` (`CommentEditor`'s identity derivation):

```tsx
currentUserId={user?.id}
currentUserName={
  user?.user_metadata?.name ||
  user?.email?.split('@')[0] ||
  'Anonymous'
}
```

Do not substitute: `full_name`, the complete email address, `'User'`, a hardcoded ID, `"user1"`,
`"R"`, another fallback, or another identity source. `CanvasClient.tsx` is not touched — the `user`
object is already threaded into `CanvasModals.tsx` and needs no new plumbing.

### OQ-3 — Selection reactivity: **REQUIRED, DOCUMENT-ONLY DIVERGENCE**

**Measured root cause (verified this session by a live jsdom probe against the unmodified Note
wiring):** `@tiptap/react@^3.0.7`'s `shouldRerenderOnTransaction` defaults to `false`
(`node_modules/@tiptap/react/dist/index.d.ts:25`). `NoteEditor.tsx` passes no `onUpdate` to its
editor instance (`useSharedTipTapEditor` call at `NoteEditor.tsx:206-252`) and has no other
force-rerender mechanism tied to selection. The probe proved: selecting text inside a
Note-wiring editor left `editor.state.selection.empty === false` internally, but the Link
button's DOM title stayed `"Link text first!"` before *and* after selection — the toolbar never
re-rendered, so `hasSelection` never reached the DOM. **This defect is real, is in the Note post,
and is explicitly not fixed here.**

`DocumentEditor.tsx` must **not** copy this defect. It must add a **local** TipTap
`selectionUpdate` subscription that triggers the minimum React rerender needed to keep these
values live:
- `hasSelection`;
- `isLink`;
- `isComment`;
- directly related selection-derived toolbar state.

The subscription must: attach to the actual Document editor instance; subscribe to
`selectionUpdate`; trigger only a local React rerender; clean up on editor replacement; clean up
on unmount; avoid duplicate listeners; avoid editor-content mutation; avoid Save/discard changes;
avoid persistence changes; avoid shared-editor changes.

**Explicitly prohibited as part of this correction:**
- setting `shouldRerenderOnTransaction: true`;
- editing `useSharedTipTapEditor.ts`;
- editing `NoteEditorToolbar.tsx`;
- editing `NoteEditor.tsx`;
- repairing the Note defect under this patch (it is recorded as a deferred finding — §15).

## 3. Repository inspection — measured at `e9f7946`

| Fact | Location |
|---|---|
| `variant='document'` filters to tools with a defined `onClick`; hides Box structurally | `NoteEditorToolbar.tsx:164-166`, `:182-198` |
| Text style / Link / Comment already exist in `textModeTools`, unconditionally on the template | `NoteEditorToolbar.tsx:99-132` |
| Align has no `onAlign` supplied by `DocumentEditor` — structurally absent, untouched by this patch | `DocumentEditor.tsx` (no `onAlign` prop passed) |
| `DocumentEditor` constructs its editor via the shared hook, no `onUpdate` tied to selection | `DocumentEditor.tsx:44-48` |
| Note's heading/color/highlight command semantics (the porting source for Text style) | `NoteEditor.tsx:561-617` |
| Note's Link workflow (the porting source for Link) | `NoteEditor.tsx:279-313` |
| Note's Comment workflow incl. `buildThreadFromAttrs`/thread mutation (the porting source for Comment) | `NoteEditor.tsx:180-204`, `:316-371`, `:407-464` |
| Note's hardcoded Comment identity (the thing OQ-2 Route B replaces, for Document only) | `NoteEditor.tsx:758-759` |
| `CanvasModals.tsx` already receives `user: AuthUser | null` and already derives identity in-file twice with two different expressions | `CanvasModals.tsx:72`, `:118`, `:360-362` (Container), `:387-389` (Comment — the pinned OQ-2 expression) |
| `DocumentEditor` is rendered by `CanvasModals.tsx` with no identity props today | `CanvasModals.tsx:160-172` |
| The governed lock this patch must invert (Link/Text-style absence → presence) | `DocumentEditor.test.tsx:86-96` |
| `shouldRerenderOnTransaction` default confirming OQ-3's root cause | `node_modules/@tiptap/react/dist/index.d.ts:25` |

**PATCH-150** (presentation band-split index-space unification) remains **RESERVED and
separate; untouched** by this patch (PATCH-149 §26.9 onward). **PATCH-151** (clipart card modal
capability routing) remains **CLOSED** (`cca070e`); untouched by this patch.

## 4. Required correction — functional scope

Restore the following Note-template controls and functions to the Document post toolbar:
1. Text style;
2. TextStylePopup;
3. Link;
4. Comment.

The controls must operate against the Document editor's actual text and current selection. Use
the existing Note toolbar, popup components, labels, tooltips, ordering, visual states and editor
command semantics as the template. **Do not redesign the toolbar. Do not duplicate an existing
popup or toolbar component.**

### 4.1 Text style implementation

In `DocumentEditor.tsx`: pass `onTextStyle` to `NoteEditorToolbar`; add the required local
`textStyleOpen` state; render the existing `TextStylePopup` unmodified; pass the existing popup
callbacks and current heading state; port the relevant `NoteEditor` command semantics narrowly.

Authorized formatting semantics (verbatim from `NoteEditor.tsx:561-602`):

| Heading option | Command |
|---|---|
| Large heading | `toggleHeading({ level: 1 })` |
| Normal heading | `toggleHeading({ level: 2 })` |
| Normal text | `setParagraph()` then `setFontSize('14px')` |
| Small text | `setParagraph()` then `setFontSize('12px')` then `setColor('#6b7280')` |
| Code block | `toggleCodeBlock()` |
| Callout | `setParagraph()`, insert the existing callout prefix (`'⚠ '`) used by Note, `setHighlight({ color: '#fef3c7' })` |
| Quote block | `toggleBlockquote()` |
| Text colour | `setColor(...)` |
| Highlight | `setHighlight(...)` or `unsetHighlight()` |

Apply `clearNodes().unsetFontSize()` before the switch, exactly where `NoteEditor.tsx:566` applies
it. Do not expose any visible formatting option without an existing supporting command. Opening
the popup must not destroy the current selection — reuse the existing prevent-focus-loss behaviour
already present, unmodified, in `NoteEditorToolbar.tsx:169-171` and `TextStylePopup.tsx:61-69`.

### 4.2 Link implementation

In `DocumentEditor.tsx`: pass `onLink`; pass `isLink={editor.isActive('link')}`; pass live
`hasSelection`; add the required local `linkPopupOpen` state; render the existing `LinkPopup`
unmodified; port the existing Note link workflow (`NoteEditor.tsx:279-313`) narrowly.

Required behaviour:

**Without a valid text selection:** Link remains disabled; tooltip is exactly `Link text first!`
(from `NoteEditorToolbar.tsx:119`, unmodified); activating it does not open `LinkPopup`; activating
it does not mutate the editor. Preserve the template's empty-selection early return
(`NoteEditor.tsx:286-289`).

**With valid selected Document text:** Link becomes enabled from selection alone; no typing is
required; no popup activation is required; no colour edit is required; no unrelated React state
update is required; the popup targets the selected text; the link applies only to the intended
selection; surrounding text remains unchanged.

**When linked text is selected:** `isLink` must reflect the active link state; `initialUrl` must
come from `editor.getAttributes('link').href` (`NoteEditor.tsx:292-297`).

### 4.3 Comment identity (OQ-2 Route B — authoritative, §2)

In `CanvasModals.tsx`, pass the already-available authenticated identity into `DocumentEditor`
using exactly the pinned expression in §2. No new auth plumbing; `CanvasClient.tsx` is not edited.

### 4.4 Comment implementation

In `DocumentEditor.tsx`: accept `currentUserId` and `currentUserName`; pass `onTextComment` to
`NoteEditorToolbar`; pass `isComment={editor.isActive('comment')}`; use the live `hasSelection`
state; add the required `CommentPopup` state and position state; render the existing
`CommentPopup` unmodified; use the selected Route B identity; reuse the existing Comment
mark/thread semantics; use `buildThreadFromAttrs` or the exact existing repository mechanism
established in `NoteEditor.tsx:180-204`/`:407-464`.

**Without a valid selection:** Comment remains disabled; tooltip is exactly `Highlight text
first!` (from `NoteEditorToolbar.tsx:127`, unmodified); no Comment popup opens; no editor mutation
occurs.

**With a valid selection:** Comment becomes enabled from selection alone; `CommentPopup` opens for
the selected text; the real authenticated user identity is supplied; the comment mark/thread
applies to the selected Document text; existing comment state is reflected through `isComment`;
comment data continues through the existing editor HTML save path (`DocumentEditor.tsx`'s
`currentBody`/`onSave` flow — unchanged).

Do not redesign Comment persistence. Do not add a new API, database table, migration, or storage
mechanism.

## 5. Authorized allowlist and caps

### 5.1 Production files

| # | File | State | Cap |
|---|---|---|---|
| 1 | `components/collabboard/editors/DocumentEditor.tsx` | existing | ≤160 changed lines |
| 2 | `components/collabboard/canvas/ui/CanvasModals.tsx` | existing | ≤6 changed lines |

**Aggregate production cap: ≤166 changed lines.**

### 5.2 Test files

| # | File | State | Cap |
|---|---|---|---|
| 1 | `components/collabboard/editors/documentToolbarParity.behavior.test.tsx` | new | ≤260 lines |
| 2 | `components/collabboard/editors/DocumentEditor.test.tsx` | existing | ≤40 changed lines (this patch's delta) |

**Aggregate test cap: ≤300 changed lines. No third test file. Do not edit `vitest.config.ts`.**

Changed-line accounting: use `git diff --numstat` against `e9f7946dd0f8f33b28f9648d15c1216d2cd39adc`.
Changed lines equal insertions plus deletions. Every per-file and aggregate cap is cumulative
against that exact HEAD. No unlisted file is "close enough" to the allowlist — if another file is
required, stop before editing it.

## 6. Explicit exclusions

- **Box control** — excluded entirely (§2, OQ-1).
- **Align control** — excluded entirely; `DocumentEditor.test.tsx` must continue to prove Align's
  absence.
- **The Note selection-reactivity defect** — not fixed under this patch (§2 OQ-3, §15).
- Do not change: Save/discard behaviour; dirty-state logic; autosave; persistence; routing;
  authentication architecture; permissions; schema; migrations; other post types; overflow-only
  behaviour; hover-only behaviour; Document modal routing; Document classification; Document
  lifecycle; Note behaviour; shared TipTap configuration; dependencies; build configuration.

## 7. `DocumentEditor.test.tsx` amendment

Amend the existing assertion block at `DocumentEditor.test.tsx:86-96`. Invert only the assertions
proving absence of Link and Text style — they must now prove those controls are present. Retain
the existing assertions proving absence of Align and Box. Do not delete, skip, or weaken the test.

## 8. Mandatory behavioral proof suite

Create `components/collabboard/editors/documentToolbarParity.behavior.test.tsx`, using real
React/jsdom behaviour (matching the `createRoot`/`act` pattern already established in
`DocumentEditor.test.tsx` and `NoteEditor.characterization.test.tsx`). Do not use snapshots as the
primary proof. Do not replace behavioural tests with source-string assertions. Do not prove editor
behaviour only by asserting that handler spies were called — prove actual editor state and DOM
state.

The suite must prove all of the following:

1. Document toolbar renders Text style.
2. Document toolbar renders Link.
3. Document toolbar renders Comment.
4. Box is not introduced.
5. Align is not introduced.
6. Text style opens `TextStylePopup`.
7. The popup exposes only the authorized supported options.
8. A real Document editor text selection becomes non-empty.
9. The selected text equals the known expected test string.
10. A formatting command applies to the actual selected Document text.
11. Link is disabled without selection.
12. The no-selection Link tooltip is exactly `Link text first!`.
13. Activating Link without selection does not open the workflow.
14. Activating Link without selection does not mutate the editor.
15. Link becomes enabled from selection alone.
16. No unrelated React action is used to enable Link.
17. Link applies to the intended selected text.
18. Surrounding text remains unchanged.
19. Clearing or collapsing the selection disables Link again.
20. Selecting linked text updates the active Link state.
21. Comment is disabled without selection.
22. The no-selection Comment tooltip is exactly `Highlight text first!`.
23. Comment becomes enabled from selection alone.
24. Comment uses `currentUserId` from the authenticated user.
25. Comment uses the pinned `currentUserName` expression.
26. Comment applies to the intended selected text.
27. Existing comment state updates `isComment` where supported.
28. The `selectionUpdate` listener is removed on cleanup.
29. No duplicate listener remains after editor replacement.
30. Existing Document Save/discard behaviour remains unchanged.
31. Existing Document lifecycle tests remain green.
32. Existing Note behaviour remains unchanged.
33. No Note file is modified.

## 9. Primary OQ-3 regression guard

The single most important proof in this patch:

**Link transitions from disabled to enabled solely because text selection changed.**

The test must prove, in this order: Link DOM state before selection; `editor.state.selection.empty
=== false` after a genuine selection; the selected text equals the expected string; Link DOM state
after selection — with no manual rerender, no typing, no popup activation, no colour edit, and no
unrelated state update in between. A test that does not prove the selection genuinely occurred is
invalid. A test that manually rerenders the component is invalid.

## 10. Mandatory negative controls

Run all eight. Each control must be applied temporarily, verified by grep/hash/exact diff before
running the test, shown to cause the expected test to fail, restored byte-identically, and followed
by a clean rerun. A mutation that silently fails to apply is not a valid control.

| # | Mutation | Expected failure |
|---|---|---|
| 1 | Remove the `selectionUpdate` subscription | The Link-enable-on-selection test fails |
| 2 | Force `hasSelection` to remain false | The Link enable or Link application test fails |
| 3 | Disconnect the Text style callback | The popup-open test fails |
| 4 | Disconnect the formatting command | The selected-text formatting test fails |
| 5 | Disconnect the Link command | The link-application test fails |
| 6 | Remove selection-subscription cleanup | The cleanup or duplicate-listener test fails |
| 7 | Break the Route B identity (e.g. replace `currentUserId` with a false literal, or replace the pinned `currentUserName` expression with an incorrect value) | The Comment identity/behaviour test fails |
| 8 | Remove Comment selection reactivity | The Comment eligibility-on-selection test fails |

Restore all eight mutations byte-identically before final validation.

## 11. Prohibited files — immediate hard stop if editing any is required

- `components/collabboard/editors/NoteEditorToolbar.tsx`
- `components/collabboard/editors/NoteEditor.tsx`
- `components/collabboard/editors/useSharedTipTapEditor.ts`
- `components/collabboard/editors/TextStylePopup.tsx`
- `components/collabboard/editors/LinkPopup.tsx`
- `components/collabboard/editors/CommentPopup.tsx`
- `components/collabboard/editors/extensions/*`
- `components/collabboard/editors/DiscardChangesDialog.tsx`
- `app/dashboard/canvas/[id]/CanvasClient.tsx`
- `hooks/canvas/usePadletSave.ts`
- `lib/domain/canvas/documentContentAdapter.ts`
- `lib/domain/canvas/documentModalRoute.ts`
- `lib/domain/canvas/documentPost.ts`
- `components/collabboard/RowColumnContainerCard.tsx`
- `components/collabboard/PostCardContent.tsx`
- `vitest.config.ts`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
- schema files, migrations, the Excalidraw fork, governance files

## 12. Protected-worktree rules

The five protected paths present at every session start in this working directory must never be
edited, staged, restored, cleaned, moved, or otherwise altered by this patch's implementation:

```
 M .gitignore
 M app/api/ai/classify-intent/route.ts
 M app/api/ai/convert-component/route.ts
 M app/api/ai/generate-component/route.ts
?? scripts/live-access-login.mjs
```

Stop if any other path is dirty before implementation begins. After the implementation commit,
`git status --short` must again show exactly these five paths and nothing else.

## 13. Baselines to preserve (measured at `e9f7946`)

82/82 test files · 956/956 tests · 410 Excalidraw declarations · bridge exclusion proven across
891 emitted files · ordinary-build E2E marker absent · exactly five protected worktree paths.

## 14. Validation — exact commands

1. `git rev-parse HEAD` — must equal `e9f7946dd0f8f33b28f9648d15c1216d2cd39adc` before editing.
2. `git status --short` — must show exactly the five protected paths before editing.
3. `npx vitest run components/collabboard/editors/documentToolbarParity.behavior.test.tsx`
4. `npx vitest run components/collabboard/editors/DocumentEditor.test.tsx components/collabboard/editors/DocumentEditor.readonly.test.tsx components/collabboard/editors/DiscardChangesDialog.test.tsx components/collabboard/editors/useSharedTipTapEditor.test.tsx components/collabboard/editors/NoteEditor.characterization.test.tsx`
5. `npx vitest run lib/domain/canvas/documentSaveLifecycle.source.test.ts lib/domain/canvas/documentSwitchGuard.source.test.ts lib/domain/canvas/documentSwitchGuard.test.ts lib/domain/canvas/documentRoutes.source.test.ts lib/domain/canvas/documentAffordance.source.test.ts lib/domain/canvas/documentModalRoute.test.ts lib/domain/canvas/documentPost.test.ts components/collabboard/documentQueuedContinuation.behavior.test.tsx components/collabboard/documentReadAffordance.behavior.test.tsx`
6. `npx vitest run` — expected baseline before PATCH-152 additions: 82/82 test files, 956/956 tests. Report the new observed totals.
7. `npm run typecheck` — expected clean.
8. `find components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types -name "*.d.ts" | wc -l` — expected 410.
9. `rm -rf .next && npm run build`
10. `npm run verify:bridge-exclusion` — expected "Bridge exclusion proven across 891 emitted files." Report the observed count rather than assuming it.
11. `ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"` — expected MARKER ABSENT.
12. `cp -r .next .next-ordinary-backup && rm -rf .next && E2E_BRIDGE_BUILD=1 npm run build`
13. `ls .next/E2E_BRIDGE_BUILD && echo "MARKER PRESENT"` — expected MARKER PRESENT.
14. `rm -rf .next && mv .next-ordinary-backup .next`
15. `npm run verify:bridge-exclusion` — expected 891 again.
16. `ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"` — expected MARKER ABSENT again.
17. `git checkout -- components/collabboard/canvas/excalidraw_fork` — only if a build step disturbed tracked/generated fork content; do not run unnecessarily.
18. `git diff --check`
19. Final scope/cap audit: exact changed-file census; insertions/deletions/changed-line total per file; aggregate production count; aggregate test count; exact allowlist match.
20. `git status --short` after the implementation commit — must again show exactly the five protected paths.

Do not use placeholders such as "run relevant tests." Do not reuse a prior patch's baselines unless
the current repository confirms them at the current HEAD.

## 15. Deferred findings — no patch number allocated to any of these

1. **Note post selection-reactivity defect** (§2 OQ-3) — `NoteEditor.tsx` passes no `onUpdate`,
   `shouldRerenderOnTransaction` defaults to `false`; Link/Comment enablement in the Note post does
   not react to selection changes. Proven live this session. Not fixed here.
2. **Box control for Document** (§2 OQ-1) — deferred candidate, no patch number.
3. **Clipart-modal Document divergence** (PATCH-149 §26.1) — permanently unnumbered by prior
   product-owner directive; unaffected by this patch.
4. **`CanvasModals.tsx` identity-expression divergence** — three different display-name derivation
   expressions coexist in the file (`:361` full_name-or-email, `:388` name-or-local-part — the OQ-2
   pinned expression, and none previously for Document). Not unified here; Route B pins the `:388`
   expression for Document only.

## 16. Commit

Exact commit subject:

```
fix(document): restore text toolbar controls
```

Do not amend previous commits. Do not push.

## 17. Return classifications

```
A. PATCH-152 IMPLEMENTATION COMPLETE LOCALLY
B. HARD STOP — GOVERNANCE AMENDMENT REQUIRED
C. BLOCKED — ENVIRONMENT
D. FAILED — IMPLEMENTATION
```

Return exactly one. The report must include: classification; starting/ending HEAD; implementation
commit; commit subject; initial/final Git status; protected-worktree status; exact changed-file
census with insertions/deletions/changed-line counts; aggregate production/test counts; allowlist
and cap results; every §8 proof-point result; the §9 primary regression-guard evidence in full
(before/after DOM state, proof of genuine non-empty selection, selected text, proof no manual
rerender was used); OQ-2 identity results; all eight §10 negative-control results with
mutation-application and byte-identical-restoration verification; full validation results
(typecheck, declaration count, ordinary/E2E build, exclusion count, marker checks, `.next` and
Excalidraw-fork restoration, `git diff --check`); confirmation of no new dependency, no
package/lockfile change, no database/API change, no Save/discard or persistence change, no
excluded-file edit, Box/Align/Note-fix exclusion confirmations; disclosed deviations; hard stops
encountered; confirmation nothing was pushed. The report must end exactly:

```
Implementation is complete and returned for independent review. No patch closure is claimed.
```

## 18. Independent closure-review requirements

Closure of PATCH-152 requires an independent reviewer to re-verify (not merely re-read) at least:
the §9 primary regression guard, all eight §10 negative controls (re-applied and re-verified, not
trusted from the implementer's report), the full validation matrix at §14, and that none of the
§11 prohibited files or §6 exclusions were touched. Only an independent reviewer may mark this
patch CLOSED; the implementer's own return is never a closure.

## 19. Status

| Patch | Status |
|---|---|
| **PATCH-149** (all sub-units) | Unaffected by this patch; see PATCH-149.md for its own status |
| **PATCH-150** | **RESERVED and separate**, unchanged |
| **PATCH-151** | **CLOSED** (`cca070e`), unchanged |
| **PATCH-152** | **AUTHORIZED FOR IMPLEMENTATION · UNBLOCKED** — production ≤166 / 2 files; tests ≤300 / 2 files; OQ-1/OQ-2/OQ-3 settled per §2 |

No production or test file was modified by this governance turn. Nothing was pushed.
