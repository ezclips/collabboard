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

---

## 20. SHELL-CONVERGENCE CORRECTION — **SUPERSEDES THE SMART-SCOPE PROPOSAL**

**Authored:** 2026-08-05 (governance architect). **Base:** `57e3fcf51cc08133bf8660a3db395a493edd7a86`.
No production or test file was modified in this turn.

### 20.1 Supersession

The uncommitted "Smart-scope" correction proposal (panel repositioning + per-command
selection-scoping + inline-quote extension) is **SUPERSEDED and must not be authored or
implemented**. It treated the symptoms — each popup and each command patched separately inside a
separately-composed `DocumentEditor`. The Product Owner has ruled that the root cause is
architectural: **the Document editor is a hybrid that re-implements the Note shell instead of
sharing it.** Sections §1–§19 remain the historical record of PATCH-152 as implemented at
`57e3fcf` and are not deleted or rewritten.

### 20.2 Product Owner decision

The Document post must use the **complete Note editor shell** as its authoritative design and
interaction template. The target architecture is:

```
Shared Note-derived editor shell          Document-specific centre
- overlay + modal layout                  - title
- left toolbar (72px)                     - rich document body
- Text mode / Box mode                    - description
- right secondary-panel region            - Save / Close
- panel positioning + spacing             - Save/discard lifecycle
- stored + visible selection              - editable / read-only mode
- link / text-comment workflows           - permission handling
- card colour / reaction / post-comment   - future internal links + backlinks
- responsive + interaction rules          - future structured blocks / PDF refs
```

### 20.3 Architecture routes — measured

| | **Route A — extract a shared shell** | **Route B — NoteEditor as shell host** | **Route C — narrow composition layer** |
|---|---|---|---|
| New file | `PostEditorShell.tsx` | none | `PostEditorShell.tsx` (thin) |
| Files touched | shell + `NoteEditor.tsx` + `DocumentEditor.tsx` | `NoteEditor.tsx` (grows) + `DocumentEditor.tsx` | shell + `DocumentEditor.tsx` |
| Extraction volume | shell layout + mode + panel/selection coordination (~250 lines out of NoteEditor) | none — Document threaded *into* Note | layout + mode + panel coordination only |
| Risk to Note | **Medium** — real refactor, mitigated by a characterization net | **High** — Document lifecycle entangles Note | **None initially** |
| Risk to Document lifecycle | Low — centre keeps Save/discard verbatim | High | Low |
| Prevents future drift | **Yes — one authoritative shell** | Partly | **No — two shells coexist** |
| Supports read-only | Yes (shell gains the concept) | Awkward — Note has none | Yes |
| Supports future Document/PDF blocks | Yes — centre is a slot | Poor | Yes |
| **Blocking constraint** | — | **`NoteEditor.tsx` is 1128 lines, already over the 800-line ceiling; CLAUDE.md rule 3 forbids growing it. ROUTE B IS PROHIBITED.** | leaves the drift the PO ruled against |

**SELECTED: ROUTE A**, executed in three governed stages (§20.5). Route B is prohibited by the
file-ceiling rule. Route C is rejected because it would leave two shells — the exact divergence
this correction exists to end — even though it is the smallest diff. **The route was not chosen
for fewest changed lines.**

### 20.4 Ownership map

| # | Concern | Current owner | Intended owner | Path · symbol | Reuse | Extraction | Lifecycle risk | Coverage today |
|---|---|---|---|---|---|---|---|---|
| 1 | Shell layout | inline in Note | **shell** | `NoteEditor.tsx:659-670` overlay + `flex items-start gap-3` | yes | **required** | none | thin (1 test) |
| 2 | Toolbar | shared already | shell | `NoteEditorToolbar.tsx` | **yes, as-is** | none | none | good |
| 3 | Text/Box mode state | inline in Note | **shell** | `NoteEditor.tsx:107` `toolbarMode` | yes | required | none | none |
| 4 | Secondary panels | split: flex siblings (`:1060`, `:1082`) + card-absolute (`:738`, `:747`) | **shell right region** | as listed | yes | required | none | none |
| 5 | Selection handling | partial in Note (`:122` `savedSelection`, `:123` `lastSelection`) | **shell** | — | partial | required + **new visible decoration** | none | none |
| 6 | Note centre | Note | **Note centre slot** | `NoteEditor.tsx:709-843` | n/a | unchanged | **must not change** | thin |
| 7 | Document centre | Document | **Document centre slot** | `DocumentEditor.tsx:225-330` | n/a | unchanged | **must not change** | strong (33 tests) |
| 8 | Document Save/discard | Document | **Document centre — unchanged** | `DocumentEditor.tsx:110-142` | n/a | **none** | **Tier 3 protected** | strong |
| 9 | Read-only | Document only | **shell honours, centre renders** | `DocumentEditor.tsx:38` `readOnly` | yes | shell gains concept | medium | 9 tests |
| 10 | Permissions | upstream | **unchanged — modal parent** | `CanvasModals.tsx:162`, `documentModalRoute.ts` | yes | none | **out of scope** | good |
| 11 | Card colour | Note box mode | shell box mode | `NoteEditor.tsx:686` + layout wrappers | yes | none | none | none for Document |
| 12 | Reaction | Note box mode | shell box mode | `NoteEditor.tsx:687`, `EmojiReactionPicker` | yes | none | none | none for Document |
| 13 | Text comment | both | shell | `NoteEditor.tsx:316-371`; `DocumentEditor.tsx:196-221` | yes | consolidate | none | Document only |
| 14 | Post-level comment | Note only | shell box mode | `NoteEditor.tsx:373-405` `detachedComments` | yes | required | none | none for Document |
| 15 | Document card render | `PostCardContent.tsx:913-919` | unchanged funnel | early return, content-only | yes | **extend branch** | none | none |
| 16 | Internal links / backlinks | **do not exist** | future centre | — | — | — | — | — |
| 17 | Attachments / files | **no Document abstraction** | future centre | — | — | — | — | — |
| 18 | PDF code / types | **none in repo** | future centre slot | — | — | — | — | — |
| 19 | Future extension points | none | Document centre | — | — | typed slots only | none | — |

**Document card funnel confirmed:** `PostCardContent.tsx` is rendered by **21 files / 23 call
sites** (Wall, Columns, Grid, Freeform, Row/Table, Map popup, presentation slide renderer,
container/nested paths, previews). Its Document branch at `:913-919` is a single early return.
**One branch change reaches every layout — layout-by-layout edits are NOT authorized.**
`cardColor` is already applied generically by layout wrappers (`WallCanvas.tsx:181`,
`RowCanvas.tsx:153/214`, `FreeformPadletCards.tsx:1351`).

### 20.5 Mandatory staging

Shell extraction against an 11-test Note net would be reckless; CLAUDE.md rule 8 requires
behaviour-preserving refactors to ride a characterization suite. Three commits, in order:

- **152-C1 — Note characterization net (TESTS ONLY, zero production lines).** Characterize the
  Note shell behaviours a refactor could silently break: Text/Box switching, TextStylePopup open
  and option set, Link workflow, text-comment workflow, card-colour panel, reaction picker,
  detached post-comments, panel placement, tooltips and disabled states. **Gate: C2 may not begin
  until C1 is green.**
- **152-C2 — extract `PostEditorShell` and migrate Note onto it.** Strictly behaviour-preserving;
  every C1 test must pass **unchanged**. Net effect on Note must be zero user-visible change.
- **152-C3 — migrate Document onto the shell; add Box mode and Document card rendering.**

### 20.6 Allowlist and caps

**152-C1 — tests only**

| File | Cap |
|---|---|
| `components/collabboard/editors/NoteEditor.characterization.test.tsx` | ≤320 changed |

**152-C2 — extraction**

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/PostEditorShell.tsx` | new | ≤380 |
| `components/collabboard/editors/NoteEditor.tsx` | existing | ≤420 changed (net line count **must decrease**) |
| `components/collabboard/editors/postEditorShell.behavior.test.tsx` | new | ≤260 |

**152-C3 — Document convergence**

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/DocumentEditor.tsx` | existing | ≤300 changed |
| `components/collabboard/editors/PostEditorShell.tsx` | existing | ≤120 changed |
| `components/collabboard/editors/NoteEditorToolbar.tsx` | existing | ≤20 changed |
| `components/collabboard/PostCardContent.tsx` | existing | ≤60 changed |
| `components/collabboard/canvas/ui/CanvasModals.tsx` | existing | ≤16 changed |
| `components/collabboard/editors/documentShellIntegration.behavior.test.tsx` | new | ≤300 |
| `components/collabboard/documentCardBoxRender.behavior.test.tsx` | new | ≤200 |
| `components/collabboard/editors/DocumentEditor.test.tsx` | existing | ≤40 changed |

**Aggregates:** C1 ≤320 test. C2 ≤800 production / ≤260 test. C3 ≤516 production / ≤540 test.
**`vitest.config.ts`, `package.json`, lockfiles, schema, migrations, the Excalidraw fork and all
governance files remain prohibited.** `DocumentCardContent.tsx` and `CardPreview.tsx` are **not**
authorized unless C3 inspection proves them necessary; if so, stop and request an amendment.

### 20.7 Contracts

**Panel contract.** The shell owns a single right-hand panel region rendered as a **flex sibling
after the centre**, matching `NoteEditor.tsx:1060`. No editor may position a shared panel itself.
Panels must never render inside the toolbar wrapper, over the centre, below the description, or
at an invented absolute position. Exactly one panel is open at a time; closing restores the plain
shell; Save and Close stay reachable. Responsive fallback must be defined for insufficient
horizontal space.

**Selection contract.** The shell owns: active panel, open/close state, stored range, **visible
selection indication while focus is in a panel**, restoration of the range before applying any
action, cleanup on cancel/close, and safe invalidation when content changes. The visible
indicator must be a render-time ProseMirror `Decoration` — **it must never enter saved HTML** and
must never be confused with a user-chosen `highlight` mark.

**Mode contract.** Text and Box modes switch via the shell's back-arrow. Box exposes Card colour,
Reaction and post-level Comment — **functional, never decorative**. Text-comment (selected text)
and post-level Comment (the card) are **permanently distinct features and must not be merged**.

**Read-only contract.** Read-only shows title, formatted body, description, working links and
future reference blocks, plus a Close/exit control. It must not show or permit the editing
toolbar, mode controls, Save, colour/reaction mutation, text-comment creation, or edit handles.
**Reactions and post-level comments remain *viewable* in read-only mode; mutation is suppressed.**
The same stored content drives both modes — **a second serialization format is prohibited.**

**Permission contract.** Unchanged and out of scope. `CanvasModals.tsx:162` and
`documentModalRoute.ts` continue to decide capability; the shell only honours the resulting
`readOnly` flag. Authenticated identity continues to come from the modal parent (OQ-2 Route B,
§2) — the shell must not derive identity.

**Document card contract.** `PostCardContent.tsx:913-919` extends to render card colour and top
strip, reaction state and the post-comment indicator for Document posts, reusing
`ReactionDisplay` and `EmbeddedCommentList`. One branch; no per-layout edits.

### 20.8 Future extension points and the PDF boundary

The Document centre may define **typed, inert slots only** for: internal Document links,
backlinks, structured blocks, embedded images and files, PDF document/page/highlight references,
page coordinates, source title and preview, jump-to-source, and read-only reference rendering.

**Prohibited under PATCH-152:** PDF upload/processing, `pdfjs-dist` or any new dependency, OCR,
vector search, database tables, schema migrations, storage buckets, PDF rendering, highlight
extraction, annotation UI, export implementation. **Slots must not change saved HTML** — proven
by test. *No PDF plan document exists in this repository and none was supplied to the governance
turn; this boundary is derived solely from the Product Owner's stated requirements. If a plan
exists, it must be supplied and this section re-verified before C3.*

### 20.9 Formatting semantics — **DEFERRED, decision packet required**

Per the Product Owner, the Smart-scope design is **not** carried forward, and **no inline-quote
extension may be created and `useSharedTipTapEditor.ts` may not be edited** until the shell is
settled and a semantic decision is returned. Measured facts, to be re-verified against the shell:

| Command | Effect on a substring | Scope |
|---|---|---|
| `toggleHeading(1/2)`, `toggleCodeBlock`, `toggleBlockquote` | restyle the **entire paragraph** | block node |
| `setColor`, `setHighlight`, `setFontSize`, `toggleCode`, bold/italic/underline/strike/link | apply to the selection | inline mark |

Registered marks: `link, textStyle, bold, code, italic, strike, underline, highlight, comment`.
Registered nodes: `paragraph, blockquote, bulletList, codeBlock, doc, hardBreak, heading,
horizontalRule, listItem, orderedList, text`. The packet must distinguish partial-block,
whole-block and multi-block selection. **C3 ships the shell's existing Note formatting semantics
unchanged**; any change to those semantics is a separate governed decision.

### 20.10 Mandatory proofs

All suites render through the real chain **`CanvasModals` → shell → centre**; mounting
`DocumentEditor` alone is not sufficient evidence.

1. editable Document opens in the shared shell; 2. Note and Document use the **same** shell
component; 3. Document centre renders title/body/description; 4. Note centre unchanged;
5. Text toolbar parity; 6. Box toolbar parity; 7. Text panel opens right; 8. Link panel opens
right; 9. Comment panel opens right; 10. no panel overlaps the centre at the governed desktop
viewport; 11. panel close restores the shell; 12. selected text stays visibly identified while a
panel holds focus; 13. Link applies to the original selection; 14. text Comment applies to the
original selection; 15. Card colour works end-to-end; 16. Reaction works end-to-end;
17. post-level Comment works end-to-end; 18. text Comment and post-level Comment stay distinct;
19. editable user sees toolbar and Save; 20. read-only user sees neither; 21. read-only user sees
formatted content; 22. Save/discard unchanged; 23. Note behaviour unchanged; 24. Document card
rendering consistent across the shared funnel; 25. no duplicate edit controls; 26. extension
slots do not change saved HTML; 27. no PDF functionality present; **28.** the OQ-2 Route B
identity expression in `CanvasModals.tsx` is asserted end-to-end — this path is currently
**uncovered**, and a broken expression passes all 967 tests today (proven by control 16).

### 20.11 Negative controls

All seventeen are mandatory: 1. force a separate local Document toolbar; 2. place a panel inside
the toolbar wrapper; 3. remove the shared right-panel slot; 4. break stored-selection
restoration; 5. persist the temporary decoration; 6. hide Box mode from Document; 7. disconnect
Card colour rendering; 8. disconnect Reaction rendering; 9. disconnect post-level Comment
rendering; 10. expose editing controls in read-only mode; 11. hide formatted content in read-only
mode; 12. alter Note centre content; 13. alter Document Save/discard; 14. route Document through
the old hybrid composition; 15. duplicate the shell implementation; 16. break authenticated
Comment identity; 17. add a premature PDF dependency or schema artifact.

Each must be anchor-verified as landed (grep/hash/exact diff), make its named test fail, be
restored **byte-identically**, and be followed by a clean rerun. A perturbation that does not land
is not a control; a test that stays green under a landed perturbation is a closure failure.

### 20.12 Validation

Per stage: focused suite · `NoteEditor.characterization.test.tsx` · Document editor + read-only +
discard + shared-hook suites · Document lifecycle/routing suite · card-render suite · full
`npx vitest run` · `npm run typecheck` · declaration count · `rm -rf .next && npm run build` ·
`npm run verify:bridge-exclusion` · ordinary marker absence · E2E build and marker presence ·
`.next` restoration and re-verification · Excalidraw fork state · `git diff --check` · final
protected-worktree check.

**Baselines measured at `57e3fcf`: 83/83 test files · 967/967 tests · 410 declarations ·
exclusion 891 emitted files · ordinary marker absent · E2E marker present · typecheck clean.**
Each stage re-measures against its own parent; baselines are not reused across stages.

### 20.13 Lifecycle hard boundary and hard stops

Do not redesign Save/discard, autosave, dirty-state, Document creation lifecycle, authentication,
permissions architecture, routing, schema, migrations, unrelated post types, PDF implementation
or Clipart controls.

**Stop without committing if:** no safe shell boundary can be held; the only viable approach
duplicates `NoteEditor`; the extraction changes any Note behaviour; Document Save/discard must be
rewritten; the persisted Document format must change; read-only requires a broader permissions
amendment; Box requires schema or migration work; PDF preparation would require implementation;
a required file is outside the allowlist; any cap would be exceeded; a perturbation cannot be
landed or restored byte-identically; the protected worktree changes.

### 20.14 Deferred findings — no patch number allocated

1. **Clipart duplicate edit button** — recorded, **not fixed here**; the extraction must not alter
   Clipart controls.
2. **Inert secondary controls in the Document Comment popup** — Edit/Strikethrough/Delete render
   but have no handlers; the inline edit path **silently discards the user's edit** (P3). Should be
   resolved by the shell consolidating the comment workflow.
3. ~~**Note selection-reactivity defect** — `NoteEditor` toolbar state is stale; unfixed.~~
   **STRUCK — INCORRECT. Superseded by §21.2**, which records
   `NOTE SELECTION REACTIVITY: FUNCTIONAL THROUGH LOAD-BEARING INCIDENTAL STATE UPDATE`.
   Do not rely on this row.
4. **`CanvasModals.tsx` identity-expression divergence** — three display-name derivations coexist.
5. **`CardEditor.tsx`** — a legacy card modal with five inert, handler-less toolbar buttons over a
   plain `<textarea>`; a P6 duplicate of the Document editing surface. Recorded, unscheduled.

### 20.15 Commit rule

Exactly one implementation commit per stage, after every gate for that stage passes:

```
152-C1   test(note): characterize Note editor shell behaviour
152-C2   refactor(editors): extract shared post editor shell
152-C3   fix(document): converge Document onto the shared editor shell
```

Do not amend `57e3fcf` or any previous commit. Do not rebase. Do not push.

### 20.16 Status

| Item | Status |
|---|---|
| **Smart-scope correction** | **SUPERSEDED** — must not be authored or implemented |
| **PATCH-152** | **OPEN · shell-convergence correction authorized, staged C1 → C2 → C3** |
| **Formatting semantics** | **DEFERRED** — decision packet required before any change |
| **PATCH-150** | **RESERVED and separate**, unchanged |
| **PATCH-151** | **CLOSED** (`cca070e`), unchanged |

No production or test file was modified in this turn. Nothing was pushed.

## 21. C1 CORRECTION AMENDMENT — coverage completion and selection-reactivity correction

**Authored:** 2026-08-06 (governance architect). **Base:** `0c08558af02a4447ec7efcbd78813b5b992deb4f`.
No production or test file was modified in this turn. This section amends §20.6, §20.11 and
§20.14.3 for stage 152-C1 only. Sections §1–§20 are otherwise unchanged.

### 21.1 C1 review outcome — recorded

Stage 152-C1 was implemented at `0c08558` (309 changed test lines, zero production lines) and
**independently reviewed: FAIL — CORRECTION REQUIRED.** The net is otherwise sound — 30/30
focused, 986/986 full, all eight §20.11-derived controls landed and failed correctly, existing
11 tests byte-identical (0 deletions), real-DOM interaction throughout.

**The failure:** *link removal is entirely uncovered*, proven by two independent landed
perturbations that each left the suite green:

| Probe | Perturbation of `NoteEditor.tsx` | Result |
|---|---|---|
| G1 | neutralize `editor.chain().focus().unsetLink().run()` | **30 passed — no test fired** |
| G2 | disconnect `onRemoveLink={handleRemoveLink}` | **30 passed — no test fired** |
| G3 *(control)* | neutralize `setLink({ href: url })` | 1 failed — suite *is* link-sensitive |

`LinkPopup.tsx:275` wires **Cancel** to `handleRemoveLink`, so the existing Cancel test does not
incidentally cover removal. Two further gaps were bounded and are now **also mandatory** by
Product Owner decision: reaction *application* (probe H1 — 30 passed) and detached post-comment
*submission* (probe H2 — 30 passed). Opening a picker or a panel is not evidence that it applies.

### 21.2 NOTE SELECTION REACTIVITY — correction, supersedes §20.14.3

**§20.14.3 is STRUCK.** Its claim that "`NoteEditor` toolbar state is stale" is **incorrect** and
must not be relied on by any implementer.

```
NOTE SELECTION REACTIVITY:
FUNCTIONAL THROUGH LOAD-BEARING INCIDENTAL STATE UPDATE
```

Established facts, from perturbation evidence against the **real** `NoteEditor`:

1. Real selection changes **do** update Link and selected-text Comment state.
2. `NoteEditor.tsx:257-262` handles `selectionUpdate` by calling `setLastSelection`.
3. `setLastSelection` is a **React state update**.
4. That state update is what causes the toolbar rerender. `NoteEditorToolbar` derives enablement
   from `hasSelection={!editor.state.selection.empty}` (`NoteEditor.tsx:701`), evaluated at
   render time, and `shouldRerenderOnTransaction` is `false` — so nothing else schedules it.
5. The behaviour is **functional today**.
6. The mechanism is **incidental and load-bearing**: the *rerender* is functional, the *stored
   value* is not. `handleLink` reads `editor.state.selection` directly and never consumes
   `lastSelection`.

**Isolating proof** (both landed, both restored byte-identically):

| Probe | Perturbation | Result | Conclusion |
|---|---|---|---|
| R1 | remove the state update, keep the handler | **7 failed** (4 Link, 2 text-Comment, 1 thread) | the rerender is required |
| R2 | keep the state update, corrupt the value to `{from:-1,to:-1}` | **30 passed** | the stored value is irrelevant |

**Any statement that selection alone does not rerender the real `NoteEditor` is withdrawn.**

**On the earlier probe.** The finding recorded in §20.14.3 came from a **replica probe** that
omitted the real `setLastSelection` effect. It therefore did not reproduce the production
component accurately and **is not authoritative runtime evidence.** It is retained only as a
record of how the error arose. Runtime claims about Note require perturbation of the real
component.

### 21.3 C2 preservation rule — binding

C2 **must preserve equivalent live selection reactivity** when Note moves to `PostEditorShell`.

The extracted shell **may** either continue using `setLastSelection`, **or** replace it with
another explicit local selection-update rerender mechanism. It **must** preserve all current
user-visible behaviour:

- selecting text **enables** Link;
- selecting text **enables** selected-text Comment;
- clearing the selection **disables** both;
- **no unrelated user action is required** to observe either transition.

**The implementation must not remove the rerender effect of `setLastSelection` without an
equivalent tested replacement.** Replacing it with a `useRef` or any other non-rendering store is
prohibited.

**Mandatory C2 negative control (additional to §20.11's seventeen):**

> **C2-NC18 — remove the shell's selection-update rerender mechanism.**
> Expected: the Note **Link selection-reactivity** test fails **and** the Note **selected-text
> Comment selection-reactivity** test fails. A green suite under this perturbation is a C2
> closure failure.

### 21.4 Revised C1 cap — amends §20.6

| File | Old cap | **New cap** |
|---|---|---|
| `components/collabboard/editors/NoteEditor.characterization.test.tsx` | ≤320 changed | **≤370 changed** |

**Aggregate C1 test cap: ≤370 changed lines. Aggregate C1 production cap: 0 — unchanged.**

The cap is **cumulative against the original governed C1 parent
`e0be00237c6044d168eac907b71b0cf405647e76`** — *not* against `0c08558`. Measured cumulative at
`0c08558`: **309 changed**. Remaining headroom for the correction: **61 changed lines.**
No second test file. No production file. No `vitest.config.ts` change.

### 21.5 Required correction tests

All three mount the **real** `NoteEditor` and interact through the rendered jsdom DOM. Source
inspection, snapshots, mocks and handler-spies are not acceptable as primary proof.

**REQUIRED TEST 1 — link removal.** Verified reachable: `LinkPopup.tsx:145` enters VIEW MODE when
`initialUrl` is non-empty, rendering `title="Remove link"` (`:215-222`) wired to
`handleRemoveLink` → `onRemoveLink()`.

1. render Note content containing a real existing link;
2. create a real selection over the linked text;
3. open `LinkPopup` through the real toolbar control;
4. confirm the existing URL is **prefilled**;
5. activate the real link-removal affordance;
6. confirm the `<a>` element is **removed**;
7. confirm the linked **text remains**;
8. confirm surrounding text remains unchanged;
9. confirm no unrelated text is modified.

**REQUIRED TEST 2 — reaction application.** Verified reachable: `EmojiReactionPicker.tsx:174-186`
renders option buttons carrying `title={emoji}` wired to `onSelectEmoji`; `NoteEditor.tsx:725-726`
applies to `reactions`; `NoteEditor.tsx:827-839` renders them.

1. switch to Box mode;
2. open the real Reaction picker;
3. choose a **real reaction option**;
4. prove the current Note reaction state or rendered reaction output updates;
5. prove the picker path is connected to actual **application**, not only opening.

**REQUIRED TEST 3 — detached post-comment submission.** Verified reachable:
`NoteEditor.tsx:1042-1053` input + Enter → `handleAddDetachedComment` (`:389-405`) →
`setDetachedComments`; observable via the thread list (`:916`), the card badge (`:764-785`) and
`postCommentCount` (`:690`), which retitles the toolbar control to `View 1 comment`.

1. switch to Box mode;
2. open the real detached post-level Comment surface;
3. enter a comment;
4. submit **through the real UI**;
5. prove the detached Comment thread/state updates;
6. prove **no selected-text comment mark** is created;
7. preserve the distinction between text Comment and post-level Comment.

**Selector hazard — binding.** The detached panel's input and `CommentPopup`'s input **share the
placeholder `Add a comment...`** (`NoteEditor.tsx:1046`, `CommentPopup.tsx:483`). Test 3 must
scope its query so it cannot bind to `CommentPopup`.

### 21.6 Negative controls for the C1 correction — twelve

The existing eight are **preserved and must be re-run**. Four are added.

| # | Control | Expected failure |
|---|---|---|
| 1 | disconnect Text/Box mode switch | mode + box-tool tests fail |
| 2 | disconnect TextStylePopup opening | style-popup + placement tests fail |
| 3 | disconnect LinkPopup opening | Link workflow tests fail |
| 4 | disconnect selected-text Comment opening | text-Comment tests fail |
| 5 | disconnect Card colour | card-colour + placement tests fail |
| 6 | disconnect Reaction picker | reaction-picker test fails |
| 7 | disconnect detached post-level Comment | post-comment test fails |
| 8 | render panel content inside the toolbar wrapper | panel-placement test fails |
| **9** | **neutralize the `unsetLink` command** | **link-removal test fails** |
| **10** | **disconnect `onRemoveLink={handleRemoveLink}`** | **link-removal test fails** |
| **11** | **neutralize reaction application** | **reaction-application test fails** |
| **12** | **neutralize detached-comment submission** | **detached-submission test fails** |

**For all twelve, every one of these is mandatory:**

- the mutation anchor occurs **exactly once** (abort if 0 or >1);
- the mutation is **proven to have landed**;
- the file's **SHA-256 changes**;
- the **expected test fails**;
- the original bytes are **restored from a saved snapshot**;
- the **SHA-256 returns to the pre-mutation value**;
- a **clean focused rerun passes**.

**A mutation that fails to land is not a control and must not be accepted.** A landed mutation
that leaves its named test green is a correction failure.

**Restoration method — binding.** This repository has `core.autocrlf=true`. **Do not use
`git checkout --` for restoration**, which rewrites line endings and invalidates byte-level
comparison. Snapshot the original bytes before the first mutation and write them back verbatim.

**Landed-verification method — binding.** Verify by **positive facts only**: the replacement
string is present with the expected occurrence count, the SHA-256 differs from baseline, and the
byte-length delta equals the expected delta. **Do not verify by asserting the anchor is absent** —
when a replacement contains its anchor as a prefix, that check produces a false negative.

### 21.7 Validation — exact commands

```
npx vitest run components/collabboard/editors/NoteEditor.characterization.test.tsx
npx vitest run
npm run typecheck
find components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types -name "*.d.ts" | wc -l
rm -rf .next && npm run build
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
cp -r .next .next-ordinary-backup
rm -rf .next && E2E_BRIDGE_BUILD=1 npm run build
ls .next/E2E_BRIDGE_BUILD && echo "MARKER PRESENT"
rm -rf .next && mv .next-ordinary-backup .next
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
git diff --check
```

**Baseline measured at `0c08558` (independently re-verified at review): 83/83 test files ·
986/986 tests · 410 declarations · exclusion 891 emitted files · ordinary marker absent · E2E
marker present · typecheck clean.** The correction adds tests only: test-file count must stay
**83**, and the test count must rise from 986 by exactly the number of tests added. Every other
figure must be unchanged. New observed totals must be reported.

### 21.8 Allowlist for the C1 correction

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/NoteEditor.characterization.test.tsx` | existing | ≤370 cumulative changed vs `e0be002` |

**No second test file. No production file. No `vitest.config.ts` change. No governance change
during the correction turn.** Temporary negative-control mutations of `NoteEditor.tsx` are
permitted **only** under §21.6 and must be restored byte-identically. The protected worktree rules
of §12 remain in force: `.gitignore`, `app/api/ai/classify-intent/route.ts`,
`app/api/ai/convert-component/route.ts`, `app/api/ai/generate-component/route.ts` and
`scripts/live-access-login.mjs` must never be edited, staged, restored, cleaned or moved.

### 21.9 Hard stops for the C1 correction

Stop without committing if: the cumulative ≤370 cap is insufficient; any production file would be
required; a second test file is required; the real removal affordance cannot be exercised from
`NoteEditor`; reaction application cannot be observed through the real UI; detached Comment
submission cannot be observed through the real UI; a mutation cannot be landed or restored
byte-identically; the protected worktree changes; or any existing C1 test would have to be
weakened, skipped or deleted to make the correction pass.

### 21.10 Commit rule and implementation HEAD

One correction commit:

```
152-C1 correction   test(note): complete Note editor shell characterization coverage
```

**The implementation turn must start from the full SHA of this governance commit, not from
`0c08558`.** Do not amend `0c08558` or any previous commit. Do not rebase. Do not push.

### 21.11 Status

| Item | Status |
|---|---|
| **PATCH-152** | **OPEN** |
| **152-C1** | **FAIL — CORRECTION REQUIRED**; coverage completion authorized under §21 |
| **152-C2** | **BLOCKED** until the C1 correction passes independent review |
| **152-C3** | **BLOCKED** |
| **§20.14.3** | **STRUCK** — superseded by §21.2 |
| **Note selection reactivity** | **FUNCTIONAL THROUGH LOAD-BEARING INCIDENTAL STATE UPDATE** |
| **Formatting semantics** | **DEFERRED** — unchanged |
| **PATCH-150** | **RESERVED**, unchanged |
| **PATCH-151** | **CLOSED**, unchanged |

No production or test file was modified in this turn. Nothing was pushed.

## 22. STAGE 152-C2 — EXTRACT `PostEditorShell`, MIGRATE NOTE ONTO IT

**Authored:** 2026-08-06 (governance architect). **Base:** `0a565160dff9f1c0f0f42878afd93275f3afb341`.
No production or test file was modified in this turn. This section governs stage 152-C2 only and
amends the C2 rows of §20.6. §§1–21 are unchanged.

### 22.1 C1 acceptance — recorded

**152-C1 PASSED independent review and is ACCEPTED BY THE PRODUCT OWNER.** Accepted baseline at
`0a56516`: **33/33 focused Note tests · 83/83 test files · 989/989 tests · 410 declarations ·
exclusion 891 · ordinary marker absent · E2E marker present · typecheck clean.** Cumulative C1
test cost: 370/370 changed lines against `e0be002`. Zero production lines.

All 33 characterization tests are **binding regression gates for C2**.

### 22.2 Architecture — Route A confirmed, alternatives re-rejected

**SELECTED: ROUTE A — extract `PostEditorShell.tsx` and migrate Note onto it.** Confirmed
unchanged from §20.3.

**ROUTE B (NoteEditor as shell host) — PROHIBITED.** `NoteEditor.tsx` is **1128 lines**, already
over the 800-line ceiling; CLAUDE.md rule 3 forbids growing it. Threading slot props into the
existing component while the shell stays embedded there is explicitly prohibited.

**ROUTE C (toolbar-wrapper-only extraction) — PROHIBITED.** Extracting a toolbar wrapper while
`NoteEditor` keeps panel placement, mode state, selection coordination or the shell row leaves two
parallel shell compositions. The extraction **must remove those four responsibilities from
`NoteEditor`.**

### 22.3 Measured shell boundary — **a structural finding that binds C2**

Repository tracing at `0a56516` shows the current Note "right-side panel region" holds **two of
six panels**, not six. The shell row (`NoteEditor.tsx:665` `flex items-start gap-3`) has these DOM
children:

| Region member | Line | Placement today |
|---|---|---|
| Left zone → toolbar | `:670`, `:672` | flex child |
| Note card (280px) | `:709` | flex child |
| Detached post-comment popup | `:846` | flex child, but **viewport-`fixed`** at computed coords |
| `TextStylePopup` wrapper | `:1060` | **true flex sibling, right-side region** |
| Card colour panel | `:1082` | **true flex sibling, right-side region** |

The remaining three mount **inside the Note card** and position themselves:

| Panel | Line | Self-positioning |
|---|---|---|
| `EmojiReactionPicker` | `:715-735` | `absolute left-full top-0 ml-2` |
| `LinkPopup` | `:738` | `absolute right-0 top-1/2 -translate-y-1/2 translate-x-full` (`LinkPopup.tsx:148`) |
| `CommentPopup` | `:747` | `fixed z-[3000]` at computed coords (`CommentPopup.tsx:498`) |

**Consequence.** Relocating `LinkPopup`, `CommentPopup`, `EmojiReactionPicker` or the detached
popup into the flex-sibling region would **visibly move them on screen**. That contradicts
"strictly behaviour-preserving" and the C2 success condition "Note lifecycle remains unchanged".

**It would also pass silently.** Of the 33 C1 tests, only C1/9 asserts placement, and only for
`TextStylePopup` and the Card colour panel. The Link, Comment, Reaction and detached tests are
placement-agnostic. A C2 that moved four panels would go green.

**Governed resolution — the shell owns *coordination* for six, *placement* for two:**

- **Placement ownership (C2):** the shell's right-side region hosts exactly the two panels that
  already occupy it — `TextStylePopup` and the Card colour panel.
- **Coordination ownership (C2):** the shell owns active-panel identity, mutual exclusion,
  open/close, and close-cleanup for **all six** panels.
- **Placement of the other four is FROZEN at its current mount point and positioning for C2.**
  Converging them into the shared region is a **visible change deferred to a later governed
  stage**; it requires PO sign-off and new characterization first. **C2 must not attempt it.**

C2 must add tests that **pin the current mount point of all four frozen panels** so no later stage
can move them silently. See proof 22.10/21–24 and control 22.11/19.

### 22.4 Ownership split

**`PostEditorShell.tsx` owns:** overlay and modal frame · shell row and its sibling ordering ·
left toolbar region and placement · Text/Box mode state and switching · centre-slot placement ·
the right-side secondary-panel region (two panels, §22.3) · active-panel identity and mutual
exclusion for all six panels · panel open/close coordination and close cleanup · the
**render-triggering selection state** (§22.5) · selection capture and restoration before panel
actions · toolbar disabled/active state inputs · shared shell spacing, dimensions and visual
classes · backdrop and keyboard interaction boundary **exactly as Note implements it today**.

**`NoteEditor.tsx` retains:** TipTap editor creation (`useSharedTipTapEditor`) · Note title/body
content and centre markup · Note formatting callbacks · Save lifecycle · close lifecycle · card
colour state · reactions state · detached-comments state · selected-text comments · identity
values (`user1`/`R`) · data serialization · metadata persistence · existing defaults · the 280px
card width and appearance.

**Prohibited moves into the shell:** persistence of any kind · metadata mutation · TipTap schema
or extension registration · Note business state. Where a shell callback needs Note state, define a
**narrow typed prop**. **Do not build a god component.**

### 22.5 Selection reactivity — binding extraction requirement

Accepted classification, unchanged:

```
NOTE SELECTION REACTIVITY:
FUNCTIONAL THROUGH LOAD-BEARING INCIDENTAL STATE UPDATE
```

`NoteEditorToolbar` derives enablement from `hasSelection={!editor.state.selection.empty}`
(`NoteEditor.tsx:701`), evaluated at render time; `shouldRerenderOnTransaction` is `false`, so the
**only** thing scheduling that render is the `setLastSelection` React state update in the
`selectionUpdate` handler (`NoteEditor.tsx:257-262`). Re-verified at C1 review: removing it fails
**8** of the 33 tests; corrupting the stored value while keeping the update leaves 33/33 green —
the *rerender* is load-bearing, the *stored value* is not.

**C2 must preserve:** selecting text enables Link · selecting text enables selected-text Comment ·
clearing the selection disables both · **no unrelated click, action or rerender is required.**

**C2 may:** keep `setLastSelection`, or replace it with a clearer shell-owned state update.

**C2 may not:** move selection state into `useRef` only · remove the React rerender effect · rely
on editor internals rerendering incidentally · defer toolbar refresh until another action ·
weaken any existing selection-reactivity test.

**The shell must explicitly own or explicitly receive the render-triggering selection state.** The
mechanism must be named and commented at its definition — it must not be incidental a second time.

### 22.6 Detached-comments stability — **ROUTE D2 SELECTED**

The C1 review confirmed this current defect: `NoteEditor.tsx:100` `initialDetachedComments = []`
creates a fresh array on every render when the prop is omitted; the sync effect at `:147-152`
(`JSON.stringify` compare, dep `[initialDetachedComments]`) then re-runs and **wipes locally added
detached comments**. Proven by perturbation: forcing the effect to re-run every render made the
detached-submission test fail with the comment absent. It is currently **unreachable** — the sole
production caller `CanvasModals.tsx:179` passes
`padletToEdit?.metadata?.detachedComments || EMPTY_COMMENTS`, with `EMPTY_COMMENTS` a module-level
constant at `CanvasModals.tsx:9`. (`CanvasModals.tsx:277` is `ContainerEditor`, a different
component.)

**`PostEditorShell` is exactly the kind of new caller that would make it reachable.**

| | **Route D1 — caller stability** | **Route D2 — hoist the Note default** |
|---|---|---|
| Exact file | `PostEditorShell.tsx` (+ every Note call path) | `NoteEditor.tsx` |
| Exact symbol | shell prop plumbing + a module const per caller | `initialDetachedComments` default at `:100` + one new module-level constant |
| Changed-line cost | ~4–8, spread across callers | **2** |
| Lifecycle risk | none | **none** — reference identity only; the effect's `JSON.stringify` compare means content behaviour is bit-identical on every reachable path |
| Test impact | none | none — C1/13 already passes a stable ref; no other test adds detached comments |
| Prevents future reintroduction | **No** — `NoteEditor`'s own default stays defective; any future omitting caller re-breaks it | **Yes** — the default itself becomes stable, structurally |
| Recommendation | insufficient alone | **SELECTED** |

**ROUTE D2 IS SELECTED**, with the D1 rule folded in as a standing constraint:

1. Replace the inline `= []` default with a **module-level stable constant** in `NoteEditor.tsx`.
2. **Standing constraint:** neither `PostEditorShell` nor any Note call path may introduce a fresh
   array literal for detached comments. No inline `= []`, no `|| []` at a call site.

**Scope honesty.** D2 is behaviour-preserving on **every reachable production path** (proven
above), and observably different only on the omitted-prop path, which has **no production caller**.
On that path it converts silent user-work loss into correct retention — required by CLAUDE.md
rule 10 (P3). This is the **one intentional behaviour delta in C2**, bounded to two lines, and it
must be proven by both the §22.10/15 test and the §22.11/15 control. **It does not license any
other lifecycle change.**

### 22.7 Contracts

**Centre slot.** The shell accepts the Note centre as a supplied React node or equivalent typed
slot. **The shell must not know Note title/body semantics.** Structural order is fixed:
`toolbar → centre → active secondary panel`, with the panel a **flex sibling**. The panel must
never be nested in the toolbar wrapper, positioned over the centre, rendered below it, or
absolutely positioned by `NoteEditor`.

**Panel contract.** One right-side region, holding the two panels of §22.3. Only one secondary
panel may occupy it at a time. Opening a panel must not unmount the centre, move the panel into
the toolbar, create a second shell, alter Note body HTML, or lose the selection before the action
applies. Close behaviour unchanged.

**Text/Box contract.** Exact current control sets, in order. Text mode: `Switch to Box Design`,
`Change text formatting`, `Bold (Ctrl+B)`, `Italic (Ctrl+I)`, `Strikethrough`,
`Underline (Ctrl+U)`, `Bullet list`, `Numbered list`, `Text alignment`, `Code block`,
`Link text first!`/`Add link to selected text`, `Highlight text first!`/`Add comment to selected
text`. Box mode: `Switch to Text Design`, `Change card background and top strip color`,
`Add emoji reaction to this post`, `Add a comment to this post`. **No control may disappear. No
duplicate toolbar may appear. The unwired Align control stays unwired. Do not correct tooltips or
labels.**

**Link contract.** Preserve: disabled without selection · enabled with selection · popup opening ·
URL prefill · Apply · Cancel · **removal** · former-link text preservation · surrounding-text
preservation. The accepted C1 link-removal test must pass **unchanged**.

**Selected-text Comment contract.** Preserve enablement, popup opening, hardcoded `user1`/`R`
identity, and selection-scoped mark application. **Do not merge with post-level Comment.**

**Reaction contract.** Preserve picker opening, real option selection, rendered reaction output
and close behaviour. **Reaction persistence stays in `NoteEditor`;** the shell owns panel
coordination only.

**Detached post-Comment contract.** Preserve panel opening, real input submission, rendered
thread, count/badge/title, separation from selected-text Comment, absence of any selected-text
mark, and **persistence across shell rerenders**. **Detached-comment persistence stays in
`NoteEditor`.**

**Detached input semantics.** The detached key handler reads closure state
(`NoteEditor.tsx:1048-1052`) while `CommentPopup` reads `e.currentTarget.value`
(`CommentPopup.tsx:474`). **Preserve current user-visible behaviour; do not refactor this
asymmetry unless the extraction forces it.** If touched, prove: normal typing then Enter still
submits · no comment is lost · no duplicate submission · tests keep realistic React sequencing
(separate `act()` boundaries).

### 22.8 Lifecycle hard boundary

**Do not change:** save-on-backdrop (save then close, in that order) · close callbacks · Escape
behaviour (currently neither saves nor closes) · content serialization · the 280px card width ·
default colour behaviour · reaction persistence · comment persistence · Note TipTap extensions ·
identity values · `CanvasModals` routing · authentication · permissions · database schema ·
migrations. **C2 is a shell extraction, not a Note redesign.**

### 22.9 Allowlist, caps and the file-size rule

**Production**

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/PostEditorShell.tsx` | **new** | ≤380 |
| `components/collabboard/editors/NoteEditor.tsx` | existing | ≤420 changed |

**Aggregate production ≤800 changed.**

**Tests**

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/postEditorShell.behavior.test.tsx` | **new** | ≤300 *(amends §20.6's ≤260 — 30 proofs and 18 controls do not fit 260)* |
| `components/collabboard/editors/NoteEditor.characterization.test.tsx` | existing | **0 — READ-ONLY** |

**Aggregate test ≤300.** No second characterization file. No broad snapshot suites.

**`NoteEditor.characterization.test.tsx` is read-only during C2.** Editing it requires a hard stop
and a governance amendment proving a specific assertion is implementation-specific rather than
behavioural. A C2 that needs to change a C1 test has failed to preserve behaviour until proven
otherwise.

**File-size rule.** `NoteEditor.tsx` is **1128 lines** today, over the 800 ceiling. C2 must
**reduce it**, satisfying CLAUDE.md rule 3 ("never grow a file already over the ceiling").

- **Hard requirement: final `NoteEditor.tsx` ≤ 1060 lines** (≥68 fewer). It must decrease.
- **Target: ≤ 1030.** Measured removable shell surface is ~134 lines (`:659-670` frame,
  `:671-707` toolbar block, `:1059-1079` and `:1081-1123` panels, `:254-268` selection effect,
  six state declarations), against ~50 lines of shell invocation returning.
- **Qualitative rules, which are the real gate — a line count alone must not be gamed:**
  `NoteEditor.tsx` must contain **no** shell-row layout string, **no** direct `NoteEditorToolbar`
  render, **no** right-side panel-region layout, and **no** duplicated shell JSX. Verified by test,
  not by inspection.
- **Do not authorize a superficial split** into helper files to hit a number.
  `PostEditorShell.tsx` must stay focused — **a 1000-line replacement shell is prohibited.**
- `NoteEditor.tsx` remains over 800 after C2. Full ceiling compliance requires extracting the Note
  **centre** as well; that is **deferred and unscheduled**, recorded here so it is not lost.

**Not authorized:** `DocumentEditor.tsx` · `NoteEditorToolbar.tsx` (unless a typed shell-prop
boundary provably cannot be expressed otherwise — then stop and request an amendment) ·
`CanvasModals.tsx` (D2 makes a caller adjustment unnecessary; if C2 believes otherwise, stop) ·
TipTap registry files · `useSharedTipTapEditor.ts` · shared schema · migrations · PDF files ·
Document card files · permissions files · `vitest.config.ts` · `package.json` · lockfiles · the
Excalidraw fork · all governance files. **Protected worktree (§12) unchanged and untouchable.**

### 22.10 Mandatory proofs

All render the **real** `NoteEditor`; a synthetic shell harness is not sufficient evidence for
Note behaviour.

1. `PostEditorShell` renders toolbar, centre and panel as siblings; 2. `NoteEditor` consumes
`PostEditorShell`; 3. exactly one shell exists — no second shell composition anywhere;
4. Text mode unchanged; 5. Box mode unchanged; 6. mode switching unchanged; 7. `TextStylePopup`
unchanged; 8. Link workflow unchanged; 9. link removal unchanged; 10. selected-text Comment
unchanged; 11. Card colour unchanged; 12. Reaction **application** unchanged; 13. detached Comment
opening unchanged; 14. detached Comment **submission** unchanged; **15. a detached comment
survives a shell rerender** — open with none, add one, force a shell rerender, comment still
visible, badge/title still correct, no sync-effect wipe, and this holds when the supplied initial
list is empty **and** when the prop is omitted entirely; 16. detached badge/title unchanged;
17. selected-text and post-level Comment remain distinct; 18. selection enables Link
**immediately**; 19. selection enables selected-text Comment **immediately**; 20. clearing the
selection disables both; **21.–24. the four frozen panels keep their current mount points** —
`LinkPopup` and `EmojiReactionPicker` inside the card, `CommentPopup` viewport-`fixed`, the
detached popup viewport-`fixed` (§22.3); 25. panels remain after the centre; 26. panels are not
inside the toolbar wrapper; 27. centre stays mounted while panels open; 28. Save/backdrop order
unchanged; 29. Escape behaviour unchanged; 30. card width 280px unchanged; 31. serialization
unchanged (same `onSave` key set); 32. `CanvasModals.tsx:179` still supplies stable detached data;
33. no Document production file changed; 34. no read-only behaviour change; 35. no PDF or
future-Document implementation introduced.

### 22.11 Negative controls — eighteen, all mandatory

1. bypass `PostEditorShell` and render the old local shell; 2. duplicate the toolbar in
`NoteEditor`; 3. render a secondary panel inside the toolbar wrapper; 4. render the panel before
the centre; 5. remove the mode-switch callback; 6. **remove the shell's selection-update rerender
mechanism** — expected: the Link and selected-text Comment selection-reactivity tests fail, **and
the link-removal test fails** because it depends on selection enablement; 7. replace the selection
state with `useRef` only — same expectation as 6; 8. disconnect `LinkPopup` opening; 9. disconnect
link removal (both `unsetLink` and the `onRemoveLink` wiring, as two sub-controls);
10. disconnect selected-text Comment opening; 11. disconnect Card colour; 12. disconnect Reaction
application; 13. disconnect detached Comment opening; 14. disconnect detached Comment submission;
**15. reintroduce an unstable empty-array reference into the governed path** — expected: the
detached-comment persistence-after-rerender test fails; 16. move Note persistence into
`PostEditorShell`; 17. alter the backdrop save/close order; 18. alter Escape behaviour;
**19. relocate one frozen panel (§22.3) into the shared right-side region** — expected: the
corresponding mount-point test fails.

**For every control:** the anchor must occur **exactly once** (abort on 0 or >1) · the mutation
must be **proven landed** · SHA-256 must change · the expected byte-length delta must be observed ·
the intended test must **fail** · the original bytes must be restored **from a saved snapshot** ·
SHA-256 must return exactly · a clean focused rerun must pass. **No control may touch a protected
path.** A mutation that does not land is not a control; a landed mutation whose named test stays
green is a C2 failure.

**Restoration method — binding.** `core.autocrlf=true`. **Do not use `git checkout --`** — it
rewrites line endings and invalidates byte comparison. Snapshot bytes first, write them back
verbatim.

**Landed-verification method — binding.** Verify by **positive facts only**: replacement present
at the expected occurrence count, SHA-256 differs, byte-length delta matches. **Never verify by
asserting the anchor is absent** — a replacement containing its anchor as a prefix yields a false
negative, and an ambiguous replacement colliding with pre-existing text yields a false positive.
Both failure modes were observed during C1.

### 22.12 Validation — exact commands

```
npx vitest run components/collabboard/editors/postEditorShell.behavior.test.tsx
npx vitest run components/collabboard/editors/NoteEditor.characterization.test.tsx
npx vitest run components/collabboard/editors/useSharedTipTapEditor.test.tsx
npx vitest run components/collabboard/EmojiReactionPicker.test.tsx
npx vitest run components/collabboard/editors/DiscardChangesDialog.test.tsx
npx vitest run components/collabboard/editors/DocumentEditor.test.tsx components/collabboard/editors/DocumentEditor.readonly.test.tsx
npx vitest run
npm run typecheck
find components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types -name "*.d.ts" | wc -l
rm -rf .next && npm run build
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
cp -r .next .next-ordinary-backup
rm -rf .next && E2E_BRIDGE_BUILD=1 npm run build
ls .next/E2E_BRIDGE_BUILD && echo "MARKER PRESENT"
rm -rf .next && mv .next-ordinary-backup .next
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
git diff --check
wc -l components/collabboard/editors/NoteEditor.tsx components/collabboard/editors/PostEditorShell.tsx
```

**Baseline at `0a56516`: 83/83 test files · 989/989 tests · 410 declarations · exclusion 891 ·
ordinary marker absent · E2E marker present · typecheck clean · `git diff --check` clean.**
C2 adds one test file: final test-file count **84**; test count rises from 989 by exactly the
number added. **`NoteEditor.characterization.test.tsx` must report 33/33 unchanged.** Every other
figure must be unchanged. Report new observed totals, plus both post-extraction line counts.

### 22.13 Success condition

C2 is complete only when: `PostEditorShell` is the **authoritative** shell · `NoteEditor` consumes
it · all **33** C1 tests pass **unchanged** · the new shell-ownership tests pass · Note lifecycle
is unchanged · `NoteEditor.tsx` line count **materially decreases** and the §22.9 qualitative rules
hold · **no second shell remains** · selection reactivity survives its control · detached comments
survive shell rerenders · **no Document production file changes.**

### 22.14 Hard stops

Stop without committing if: one authoritative shell cannot be extracted · `NoteEditor` must grow ·
Note lifecycle must change · a C1 test must be modified · detached-comments stability cannot be
made explicit · selection reactivity cannot be preserved · a Document production file must change ·
persisted content must change · TipTap schema must change · database or migration work is required ·
a required file falls outside the allowlist · any cap would be exceeded · a mutation cannot be
landed or restored byte-identically · the protected worktree changes · relocating a frozen panel
appears necessary. On a hard stop: create no commit, restore all mutations, return to zero
unauthorized diff, and report the exact blocker.

### 22.15 Commit rule and implementation HEAD

One implementation commit, after every gate passes:

```
152-C2   refactor(editors): extract shared post editor shell
```

**The implementation turn starts from the full SHA of this governance commit, not `0a56516`.**
Do not amend `0a56516`, `f519510`, `0c08558` or any previous commit. Do not rebase. Do not push.

### 22.16 Status

| Item | Status |
|---|---|
| **PATCH-152** | **OPEN** |
| **152-C1** | **PASS · ACCEPTED BY PRODUCT OWNER** (`0a56516`) |
| **152-C2** | **AUTHORIZED** — Route A, staged per §22 |
| **152-C3** | **BLOCKED** until C2 passes independent review |
| **Frozen-panel convergence** | **DEFERRED** — visible change, needs PO sign-off (§22.3) |
| **Note centre extraction / 800-line compliance** | **DEFERRED**, unscheduled (§22.9) |
| **Formatting semantics** | **DEFERRED** — unchanged (§20.9) |
| **PATCH-150** | **RESERVED**, unchanged |
| **PATCH-151** | **CLOSED**, unchanged |

No production or test file was modified in this turn. Nothing was pushed.

## 23. PRE-C3 PREPARATION AND STAGE 152-C3 — DOCUMENT MIGRATION ONTO `PostEditorShell`

**Authored:** 2026-08-06 (governance architect). **Base:** `8c8f0da79f3a4f1cc3188e2ee611b605e30d5769`.
No production or test file was modified in this turn. This section governs pre-C3 preparation and
the C3 contract. §§1–22 are unchanged.

### 23.1 C2 acceptance — recorded

**152-C2 PASSED independent review and is ACCEPTED BY THE PRODUCT OWNER.** Accepted baseline at
`8c8f0da`: **84/84 test files · 1008/1008 tests · 410 declarations · exclusion 891 · ordinary
marker absent · E2E marker present · typecheck clean · `NoteEditor.tsx` 1040 lines ·
`PostEditorShell.tsx` 137 lines.** Cumulative C2 cost: 407 production + 274 test changed lines.

All 33 C1 tests and all 19 C2 shell tests are **binding regression gates for C3.**

### 23.2 Preparation route — **P1 SELECTED**

**ROUTE P1 (preparation commit before C3) is SELECTED.** Rationale, decisive over P2:

1. All three preparation items are **corrections to accepted C2 work** — a Note-behaviour pin, a
   C2-artifact encoding defect, and a C2 test comment. Attributing them to C3 would mean C3 does
   not measure from the accepted C2 baseline.
2. The preparation commit is **test-and-comment only, with zero production diff**, which is the
   cheapest artifact this process can review independently. Folding it into a C3-A that also
   begins Document work invites the two scopes to contaminate each other's caps and controls.
3. §23.4 establishes that line-ending normalization produces **no commit diff at all**. It must be
   a recorded worktree operation performed *before* any C3 harness snapshot. Keeping it in a
   dedicated preparation turn removes any chance of a C3 harness capturing an LF baseline.
4. Repository history is uniformly staged (C1, C1-correction, C2 each committed and reviewed
   separately). P1 matches that precedent; P2 does not.

**C3 itself is additionally substaged — see §23.14. Only P1 is authorized by this section.**

### 23.3 Preparation item 1 — real panel-coordination test (MANDATORY)

The C2 review proved the gap: mutating the real call site from
`openPanel('comment', ['textStyle', 'cardColor', 'reaction'])` to `openPanel('comment', [])`
**lands cleanly and leaves all 52 tests green.** The synthetic `useShellPanels` harness pins the
hook contract, not the production transition.

**Required test — real `NoteEditor`, in `postEditorShell.behavior.test.tsx`:**

1. render the real `NoteEditor`; 2. open `TextStylePopup`; 3. open Card colour — current behaviour
permits coexistence, so assert both are open simultaneously; 4. open the Reaction picker — assert
coexistence likewise; 5. create a real text selection; 6. activate selected-text Comment;
7. prove Comment opens; 8. prove `TextStylePopup` closed; 9. prove Card colour closed; 10. prove
Reaction picker closed; 11. prove Link is unaffected — opening Link does **not** close
`TextStylePopup`; 12. prove no generic one-panel-only policy exists — assert at least one pair of
panels still coexists after the Comment transition completes and is dismissed.

Steps 3 and 4 are conditional on measured current behaviour: **measure first.** If Card colour and
Reaction cannot in fact coexist with `TextStylePopup` today, characterize what *is* true and record
the measurement in the implementation report — **do not force coexistence that does not exist.**

**Binding acceptance:** the test must **fail** when the real call site's closing list is emptied,
and must **pass** unmodified at `8c8f0da`. Mandatory control NC-P1 (§23.7).

### 23.4 Preparation item 2 — line-ending normalization (MANDATORY, ZERO-DIFF)

> **AMENDED BY §24.2.** Step 2's acceptance criterion below — requiring `git status --short` to show
> the file as *not modified*, and making the contrary observation a hard stop — rested on a
> non-sequitur and is **superseded**. `git status` reports `M` from stat-cache staleness after a
> direct byte rewrite, independently of content. **The authoritative proof is in §24.2**; read it
> instead of step 2. The rest of this section stands.

**Measured state at `8c8f0da`:** the committed blob for `PostEditorShell.tsx` is **LF**; the
worktree copy is **LF**; `NoteEditor.tsx` worktree is **CRLF**; `core.autocrlf=true`;
`git diff --check` warns *"LF will be replaced by CRLF the next time Git touches it."*

**Consequence — this is the governed hazard:** because `autocrlf` normalizes CRLF→LF on add, the
committed blob is already correct. Rewriting the worktree file to CRLF therefore produces
**no commit diff whatsoever.** Normalization is a **worktree-only operation, not a commit
deliverable.** It cannot be "included in a commit" and any implementation claiming it was has
misunderstood the mechanism.

**Exact governed sequence:**

1. Rewrite `components/collabboard/editors/PostEditorShell.tsx` in place, LF → CRLF, **content
   bytes otherwise unchanged**.
2. Prove semantic emptiness: `git status --short` must show the file as **not modified**, and
   `git diff -- <file>` must be **empty**. This is the proof that only line endings changed.
3. Record the **new worktree SHA-256** in the implementation report.
4. `git diff --check` must be clean and the warning must be gone.
5. Re-run the focused suites; runtime output must be unchanged.

**Binding sequencing rule.** Normalization happens **before** any C3 mutation-harness snapshot is
taken. The C3 harness baseline for `PostEditorShell.tsx` is the **post-normalization CRLF SHA-256**,
never the current LF hash. **A harness that snapshots an LF baseline and later restores a
CRLF-normalized file is a C3 failure**, not a tolerable discrepancy.

**Hard stop.** If step 2 shows the file *as modified*, the blob is not LF and this analysis is
wrong — **stop, change nothing, and report**.

### 23.5 Preparation item 3 — test comment correction (COMMENT ONLY)

In `postEditorShell.behavior.test.tsx`, `addAndRerender`'s comment *"Force a PostEditorShell
rerender unrelated to the detached-comment state"* is inaccurate: `setMode` lives in the child, and
the `centre` element is referentially stable, so React bails out of that subtree — `NoteEditor`
does not re-render and its sync effect does not re-run. The wipe the test genuinely detects is
triggered by the **submission** rerender (confirmed by controls 15 and X3).

**Authorized: correct the comment only.** The mode-toggle steps stay — they are harmless and assert
the shell survives the toggle. **Do not change the test's behaviour or assertions** except as
§23.3 requires. **Do not renumber or rename the existing tests.**

### 23.6 Preparation allowlist and caps

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/postEditorShell.behavior.test.tsx` | existing | **≤66 changed** *(amends §22.9's ≤300 file cap to ≤340 total)* |
| `components/collabboard/editors/PostEditorShell.tsx` | existing | **0 committed lines** — worktree renormalization only, proven zero-diff |
| `components/collabboard/editors/NoteEditor.tsx` | existing | **0 — READ-ONLY** |
| `components/collabboard/editors/NoteEditor.characterization.test.tsx` | existing | **0 — READ-ONLY** |

**No production file may change in preparation.** No other file is authorized. Protected worktree
(§12) unchanged and untouchable.

### 23.7 Preparation negative controls — three, all mandatory

**NC-P1** — empty the real closing list: `openPanel('comment', ['textStyle','cardColor','reaction'])`
→ `openPanel('comment', [] /* NC-P1 */)`. Expected: the new §23.3 test **fails**. *(Use a unique
replacement: the bare `openPanel('comment')` form already occurs twice and collides — the C2 review
hit exactly this ambiguity abort.)*

**NC-P2** — invert one coexistence assertion by adding `'link'` to the real closing list. Expected:
the §23.3 step-11/12 assertions **fail**, proving the test detects **over**-closing as well as
under-closing.

**NC-P3** — revert `PostEditorShell.tsx` to LF after normalization. Expected: `git diff --check`
re-emits the CRLF warning. Proves the normalization is real and detectable.

Standing method, unchanged and binding: anchor occurs **exactly once**; verify landing by
**positive facts only** (replacement present at expected count, SHA-256 differs, byte-delta
matches); **never** assert anchor absence; restore from a saved byte snapshot; **never**
`git checkout --`; confirm exact SHA-256 return; clean focused rerun.

### 23.8 Preparation validation and commit

```
npx vitest run components/collabboard/editors/postEditorShell.behavior.test.tsx
npx vitest run components/collabboard/editors/NoteEditor.characterization.test.tsx
npx vitest run components/collabboard/editors/DocumentEditor.test.tsx components/collabboard/editors/DocumentEditor.readonly.test.tsx
npx vitest run
npm run typecheck
find components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types -name "*.d.ts" | wc -l
rm -rf .next && npm run build
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
cp -r .next .next-ordinary-backup
rm -rf .next && E2E_BRIDGE_BUILD=1 npm run build
ls .next/E2E_BRIDGE_BUILD && echo "MARKER PRESENT"
rm -rf .next && mv .next-ordinary-backup .next
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
git diff --check
git status --short
```

**Expected:** Note characterization **33/33 unchanged** · shell suite **19 + the new coordination
test** · Document suites **39/39 unchanged** · full Vitest **84/84 files**, tests rise from 1008 by
exactly the number added · 410 declarations · exclusion 891 · ordinary marker absent · E2E marker
present · typecheck clean · `git diff --check` clean **with the CRLF warning gone**.

One commit: `test(note): pin real panel coordination transition`. Do not amend `8c8f0da` or any
earlier commit. Do not rebase. Do not push.

### 23.9 C3 architecture — Document consumes the shell

`DocumentEditor.tsx` (362 lines) today renders its **own complete second shell**: overlay
`fixed inset-0 z-[1000] … bg-black/50` (`:225`) and shell row `flex items-start gap-3` (`:231`).
**C2 removed the Note shell duplicate; C3 removes the Document one.** After C3 exactly one shell
composition exists repo-wide.

**`PostEditorShell` owns for Document:** overlay/frame · shell row and sibling order · toolbar
region · Text/Box mode · centre-slot placement · the right-side panel region · panel coordination ·
selection reactivity · selection restoration · the render-only selection indicator (§23.12) ·
shared spacing and layout.

**`DocumentEditor` retains:** title · rich body · description · Save · Close · dirty state ·
Save/discard lifecycle · Document serialization (`toEditorHtml`/`fromEditorHtml`) · permissions and
`readOnly` inputs · Document metadata mutation · `DiscardChangesDialog` · the Escape handler
(§23.10) · future extension slots.

**Prohibited moves into the shell:** Document persistence · dirty-state computation · serialization ·
`SaveCardData` shaping · metadata mutation · TipTap schema or extension registration.

### 23.10 Keyboard boundary — **§22.4 IS AMENDED**

§22.4 assigned the "backdrop and keyboard interaction boundary" to the shell "exactly as Note
implements it today". **Measured conflict:** Note has **no** Escape handling (C1 characterization
*"does not save or close on Escape"*; C2 control 18 proves that adding Escape to the shell breaks
two C1 tests). Document **has** Escape handling (`DocumentEditor.tsx:129-139`) covered by Document
tests 31–33 (*clean Escape closes; dirty Escape confirms; Escape inside the confirmation returns to
editing*). A shell-owned keyboard boundary cannot satisfy both.

**Governed resolution — binding:** **`PostEditorShell` does not own Escape and must not add any
`keydown` listener.** The keyboard boundary belongs to the **consumer**. Note keeps none; Document
keeps its existing handler unchanged. §22.4's "keyboard interaction boundary" clause is **struck**.

**Backdrop, by contrast, is already shell-compatible.** The existing `onBackdropClick` prop takes
Note's save-then-close and Document's `attemptClose` without modification. Note the mechanism
differs: Document guards by `stopPropagation` on the inner row (`:231`); the shell guards by
`e.target === e.currentTarget`. Both satisfy Document test 29/30 (*inner clicks never trigger it*),
and the shell's guard is strictly the safer of the two. **Prove test 29/30 passes unchanged.**

**`DiscardChangesDialog`** is `fixed inset-0 z-[1100]` with its own `stopPropagation` (`:25-27`) —
it is a self-positioned full-screen overlay and **does not need to live inside the shell**.
`DocumentEditor` renders it as a sibling of the shell. **Do not add an overlay slot to the shell
for it.**

### 23.11 Document panel convergence — deliberate UI correction

**Measured today:** every Document secondary panel is rendered **inside the toolbar column**
(`<div className="relative min-w-[72px]">`, `:233`) and escapes it with `absolute left-full top-0
ml-2` — `TextStylePopup` (`:259`), `LinkPopup` (`:276`), `CommentPopup` (`:283`). All three vanish
entirely in read-only because the whole block is `{!readOnly && …}` (`:232`).

**C3 requirement — converge into the shell's right-side region.** All Document secondary panels
(`TextStylePopup`, `LinkPopup`, selected-text `CommentPopup`, Card colour, Reaction, post-level
Comment) must render as **flex siblings to the right of the Document centre**, must not open inside
the toolbar, must not open below the description, must not overlap the centre, and must not use
absolute placement invented by `DocumentEditor`.

**This is a deliberate, visible Document UI correction — approved by the Product Owner.** It is
*not* a Note change: **the four frozen Note panels (§22.3) do not move in C3** and their C2
mount-point tests must stay green. Frozen-panel convergence for Note remains DEFERRED.

### 23.12 Selection visibility — feasible, governed design

**Determination: implementable inside `PostEditorShell` without changing Note behaviour.** The
shell already receives the editor through `useShellSelection(editor)`. The governed mechanism is a
**render-only rect overlay**: compute client rects from `editor.view.coordsAtPos(from/to)` and
render absolutely-positioned presentational divs above the centre.

It **must**: keep the original selection visibly identifiable while focus is in a panel · restore
the correct range before Apply · clear on close/cancel · invalidate safely when content changes ·
**never** persist into saved HTML · **never** become a real mark.

**It must not**: add a ProseMirror plugin or decoration · touch `useSharedTipTapEditor.ts` · use or
extend the `Highlight` mark · alter the TipTap schema.

**Opt-in per consumer** (e.g. `selectionIndicator?: boolean`, default off) so **Note renders
byte-identically to C2**. Mandatory control NC-C11 (§23.16).

### 23.13 Read-only, Text/Box, and card-rendering contracts

**Read-only.** Editable: toolbar visible · Text/Box controls visible · Save visible · mutations per
permission. Read-only: title visible · formatted body visible · description visible · links
functional · reference blocks renderable · Close available · **no** toolbar, Text/Box switch, Save,
formatting mutation, colour mutation, reaction mutation, or comment creation where permission
forbids. Reactions and comments stay viewable where existing permissions already allow.
**One serialization format only — do not create a second read-only content format.** The existing
6 read-only tests must pass **unchanged**.

**Text/Box.** Text-mode control set and order match Note exactly (§22.7). **Document Box mode
becomes functional** with Card colour, Reaction and post-level Comment. Selected-text Comment stays
a **Text**-mode feature; post-level Comment stays a **Box**-mode feature; **do not merge them.**

**This changes an accepted characterization.** `DocumentEditor.test.tsx:86` currently asserts
*"no Box"*. That test **must be amended** when Box mode lands — explicitly authorized here, and
only for the Box-switch assertion. **Every other Document assertion is read-only.** `Align` stays
unwired. Do not correct tooltips or labels.

**Document card rendering — TRACED, AND IT DOES NOT CONVERGE.** `PostCardContent.tsx` has a single
Document branch (`:913`, `isDocumentPost(padlet) && onOpenDocument`) reaching one shared
`DocumentCardContent`, but it renders **only** body HTML and `textColor`. Card colour, reaction
output and comment counts are **not** rendered by any shared funnel: `cardColor` and `reactions`
chrome is concentrated in `FreeformPadletCards.tsx` (6.4k lines, a known strangler target, ~20
call sites) plus one `PostCardContent` path gated on `useDrawingContainerImageBinding` (`:671`).
`PostCardContent` is consumed by **two parallel canvas stacks** (`components/canvas/*` legacy and
`components/collabboard/canvas/*`) across at least eight renderers.

**Therefore: tracing proves no shared card-chrome funnel exists.** Per the Product Owner's own
rule — *"authorize only the shared rendering funnel if possible; do not authorize layout-by-layout
edits unless tracing proves no shared funnel exists"* — **Document card metadata rendering is NOT
authorized in C3.** Delivering it would require editing `FreeformPadletCards.tsx` and multiple
layout renderers, which is a strangler-scale change and is explicitly out of scope. It becomes
**decision packet DP-2 (§23.18)** and a separate stage. **C3 persists Box-mode metadata; it does
not render it on cards.**

### 23.14 C3 substaging — only the shape is governed here

| Substage | Scope | Status |
|---|---|---|
| **P1** | coordination test · normalization · comment | **AUTHORIZED** (§23.3–23.8) |
| **C3-A** | Document consumes `PostEditorShell`; panel convergence; shell selection reactivity; keyboard amendment. **No new features.** | **NOT YET AUTHORIZED** — needs its own turn after P1 review |
| **C3-B** | extract shared Box-mode panels (Card colour, Reaction, post-level Comment) from `NoteEditor` into shared components; wire Document Box mode | **NOT YET AUTHORIZED** — requires DP-3 |
| **C3-C** | Document card metadata rendering | **BLOCKED** on **DP-2** |

**Why C3-B cannot be folded into C3-A.** Card colour (~50 lines) and the post-level Comment popup
(~200 lines) are implemented **inline inside `NoteEditor.tsx`**. Document cannot obtain them by
duplication — CLAUDE.md rule 2 (P6, one implementation per concern) forbids a third comment UI, and
`DocumentEditor` at 362 lines would breach the 400-line component ceiling immediately. The only
compliant path is extraction into shared components, which **must edit `NoteEditor.tsx`** — a file
this section does not authorize. That is **decision packet DP-3**.

### 23.15 C3-A allowlist and caps — evidence-derived, for the future authorization turn

| File | Evidence | Cap |
|---|---|---|
| `components/collabboard/editors/DocumentEditor.tsx` | owns the duplicate shell being removed | ≤300 changed |
| `components/collabboard/editors/PostEditorShell.tsx` | gains the selection indicator + opt-in props | ≤120 changed, **file ≤380** |
| `components/collabboard/editors/NoteEditorToolbar.tsx` | `variant='document'` gates the Box switch (`:164-165`, `:185-198`); Box mode cannot be enabled without it | ≤40 changed |
| `components/collabboard/editors/documentEditorShell.behavior.test.tsx` | **new** | ≤320 |
| `components/collabboard/editors/DocumentEditor.test.tsx` | **only** the `:86` "no Box" assertion, and only in C3-B | ≤10 changed |

**Aggregate production ≤460 · aggregate test ≤330.** `DocumentEditor.tsx` must stay **≤400 lines**
(CLAUDE.md rule 3); if convergence cannot fit, extract the Document centre rather than breach it.

**Not authorized in C3-A:** `NoteEditor.tsx` · `NoteEditor.characterization.test.tsx` ·
`postEditorShell.behavior.test.tsx` · `DocumentEditor.readonly.test.tsx` · `DocumentCardContent.tsx` ·
`PostCardContent.tsx` · `FreeformPadletCards.tsx` · `CanvasModals.tsx` *(already wires `readOnly`,
identity and keyed remount at `:145-175`; trace shows no change needed — if C3 believes otherwise,
**stop and request an amendment**)* · `useSharedTipTapEditor.ts` · TipTap extensions · schema ·
migrations · PDF files · `vitest.config.ts` · `package.json` · lockfiles · the Excalidraw fork ·
all governance files. **Protected worktree (§12) untouchable.**

### 23.16 C3-A proofs and controls — carried into the authorization turn

**Proofs.** 1. editable Document uses `PostEditorShell`; 2. read-only Document uses the same centre
serialization without editing controls; 3. exactly one shell repo-wide; 4. Document toolbar matches
Note's Text-mode set and order; 5. Text/Box switching works; 6.–11. Text style, Link, selected-text
Comment, Card colour, Reaction and post-level Comment each open **to the right of the centre** as
flex siblings *(6–8 in C3-A; 9–11 in C3-B)*; 12. panels never overlap or unmount the centre;
13. selected text stays visibly identifiable while a panel holds focus; 14. Link applies to the
original selection; 15. selected-text Comment applies to the original selection; 16.–18. Card
colour, Reaction and post-level Comment persist into Document metadata *(C3-B)*; 19. text Comment
and post-level Comment remain distinct; 20. Save/discard/dirty lifecycle unchanged — Document tests
pass unchanged except the authorized `:86` amendment; 21. read-only hides every mutation affordance;
22. formatted read-only content still renders; 23. **all 33 C1 + 19 C2 + the §23.3 test pass
unchanged**; 24. all four frozen Note panel placements unchanged; 25. the real Note coordination
transition stays pinned; 26. no PDF implementation; 27. no serialization change — `toEditorHtml`/
`fromEditorHtml` output byte-identical; 28. **card-rendering convergence explicitly out of scope
(DP-2)**.

**Controls.** Bypass shell · duplicate toolbar · Document panel below description · Document panel
inside toolbar · panel overlapping centre · break selection restoration · **NC-C11: persist the
temporary selection indicator into saved HTML** · expose toolbar in read-only · disconnect Card
colour · disconnect Reaction · disconnect post-level Comment · merge text and post-level Comment ·
break `CanvasModals` identity/`readOnly` routing · move a frozen Note panel · empty the real Note
coordination close-list · introduce a PDF dependency · change persisted HTML · **add an Escape
listener to the shell** (must fail Note C1 Escape). Every mutation must land by positive facts,
fail its named test, restore byte-identically from a saved snapshot, and rerun clean.

### 23.17 Formatting semantics — decision packet (DEFERRED, unchanged)

§20.9 remains **DEFERRED**. C3 **preserves existing Note formatting semantics**; the abandoned
Smart-scope design is **not revived**. No inline quote extension. No `useSharedTipTapEditor.ts`
change. No TipTap schema change without Product Owner approval.

Measured current Document behaviour, for the PO's later decision — `DocumentEditor.tsx:142-169`:
**inline marks** apply to the selected range · **heading** `h1`/`h2` via `toggleHeading` after
`clearNodes().unsetFontSize()`, whole-block by ProseMirror semantics · **blockquote**
`toggleBlockquote`, whole-block · **code block** `toggleCodeBlock`, whole-block · **partial-block
selection** applies inline marks to the range but promotes block commands to the whole block ·
**whole-block selection** behaves identically · **multi-block selection** applies the block command
to every touched block. `normal`/`small` additionally set font size and colour; `callout` inserts a
`⚠ ` prefix plus highlight — a Document-only affordance with no Note equivalent. **The
block-command-promotes-to-whole-block asymmetry is the substantive open question** and is the one
item requiring a product decision before formatting is touched.

### 23.18 Decision packets required before further authorization

**DP-1 — keyboard boundary. CLOSED by §23.10** (shell never owns Escape; §22.4 amended).
**DP-4 — selection visibility. CLOSED by §23.12** (render-only rect overlay, opt-in, feasible).

**DP-2 — Document card metadata rendering. OPEN, PO decision required.** No shared card-chrome
funnel exists (§23.13). Options: **(a)** accept freeform-only rendering as an interim and defer the
rest; **(b)** build a shared card-chrome funnel first, as its own patch — the clean answer, and
aligned with the `FreeformPadletCards` strangler; **(c)** defer Document card metadata rendering
entirely until that strangler completes. **Recommendation: (b) as a separate patch, with (c) as the
interim posture.** Layout-by-layout edits are not recommended under any option.

**DP-3 — shared Box-mode panel extraction. OPEN, PO decision required.** Enabling Document Box mode
requires extracting Card colour and the post-level Comment popup out of `NoteEditor.tsx` into shared
components, which edits an accepted, characterized file. Options: **(a)** authorize the extraction
under the C1/C2 characterization net as C3-B; **(b)** ship C3-A shell migration only and defer Box
mode. **Recommendation: (a)**, sequenced strictly after C3-A passes review, since the 33+19+1 test
net is exactly the safety apparatus such an extraction needs.

### 23.19 PDF boundary — recorded direction, no code

**Approved product direction, recorded:** the **Document post is the future structured-writing and
PDF-assembly destination**; **Note remains lightweight**; **prior plan assumptions targeting Note
assembly or `note_post_links` are superseded.**

**No PDF plan document was supplied with this authorization turn and none exists in the repository**
(`find . -name "*.pdf"` outside `node_modules` returns nothing). The direction above is recorded
**solely from the Product Owner's written instruction in this turn.** No PDF plan content has been
inferred, reconstructed, or assumed. Any C3 requirement that depends on the plan's specifics
requires the plan to be supplied first.

**C3 adds no PDF code.** Prohibited now: PDF upload · `pdfjs-dist` · OCR · vector search · database
tables · migrations · storage buckets · PDF rendering · highlight extraction · PDF annotations ·
export implementation. Inert, type-safe extension boundaries are permitted **only if strictly
necessary**; **if no code is necessary now, add none** — which is the expected outcome.

### 23.20 Lifecycle hard boundary and hard stops

**Do not redesign:** Document Save/discard · dirty-state calculation · serialization · modal
routing · authentication · permissions architecture · database schema · migrations · Note
behaviour · the PDF system.

**Stop without committing if:** the real Note coordination transition cannot be pinned without
changing Note behaviour · line endings cannot be normalized with an empty commit diff (§23.4 step 2)
· Document cannot consume `PostEditorShell` safely · Document lifecycle must change · read-only must
be broadly redesigned · persisted content must change · TipTap schema must change · a frozen Note
panel must move · PDF implementation is required now · files cannot be bounded · HEAD or the
protected worktree differs · production or tests become dirty during governance authoring · any cap
would be exceeded · a mutation cannot be landed or restored byte-identically.

### 23.21 Status

| Item | Status |
|---|---|
| **PATCH-152** | **OPEN** |
| **152-C1** | **PASS · ACCEPTED** (`0a56516`) |
| **152-C2** | **PASS · ACCEPTED** (`8c8f0da`) |
| **P1 preparation** | **AUTHORIZED** — §23.3–23.8 |
| **152-C3-A** | **NOT AUTHORIZED** — needs a turn after P1 independent review |
| **152-C3-B** | **BLOCKED** on **DP-3** |
| **152-C3-C** | **BLOCKED** on **DP-2** |
| **DP-1 / DP-4** | **CLOSED** (§23.10 / §23.12) |
| **Frozen Note panel convergence** | **DEFERRED** — unchanged (§22.3) |
| **Note centre extraction / 800-line compliance** | **DEFERRED**, unscheduled (§22.9) |
| **Formatting semantics** | **DEFERRED** — packet in §23.17 |
| **PATCH-150** | **RESERVED**, unchanged |
| **PATCH-151** | **CLOSED**, unchanged |

No production or test file was modified in this turn. Nothing was pushed.

## 24. STAGE 152-C3-A — MIGRATE `DocumentEditor` ONTO `PostEditorShell`

**Authored:** 2026-08-06 (governance architect). **Base:** `6c8fdd34d63058aa3a75c7673c2863bc0310ff91`.
No production or test file was modified in this turn. This section governs stage 152-C3-A only and
amends §23.4. §§1–23 are otherwise unchanged.

### 24.1 P1 acceptance — recorded

**P1 PASSED independent review and is ACCEPTED BY THE PRODUCT OWNER.** Accepted baseline at
`6c8fdd3`: **84/84 test files · 1009/1009 tests · 410 declarations · exclusion 891 · ordinary
marker absent · E2E marker present · typecheck clean · shell suite 20/20 · Note characterization
33/33 · Document suites 39/39.**

All 33 C1 tests, all 20 shell tests (including the P1 real-coordination test) and all 39 Document
tests are **binding regression gates for C3-A.**

### 24.2 §23.4 AMENDED — line-ending acceptance criterion corrected

§23.4 step 2 required that `git status --short` show the file as *not modified*, and made the
contrary observation a hard stop on the stated premise that *"the blob is not LF and this analysis
is wrong"*. **That premise was a non-sequitur and is hereby struck.** `git status` reports `M` from
**stat-cache staleness** after a direct byte rewrite, independently of content; it is not evidence
of a content difference. P1 observed exactly this and correctly proceeded on stronger evidence.

**Authoritative normalization proof — binding, replacing §23.4 step 2:**

1. the worktree file is CRLF;
2. `git diff -- <file>` is empty;
3. `git diff --cached -- <file>` is empty;
4. `git hash-object <file>` **equals the HEAD blob** (this applies the same clean filter as
   `git add` and is the conclusive test);
5. the index is clean;
6. `git diff --check` no longer emits the line-ending warning for that file;
7. runtime tests are unchanged.

**Recorded:** a transient `git status --short` `M` is **not by itself a hard stop**; filtered blob
equality plus empty worktree and index diffs is conclusive; **no staging residue may remain.**

**Normalized worktree SHA-256 for `PostEditorShell.tsx`:**
`fc0f350908952a41be9c35b4278c453a596081298a4afc0210940e1d941d0bb2`.
**All C3-A mutation harnesses must snapshot this normalized CRLF form**, never the superseded LF
form (`5732643b7eba503e080cd070eacf8b385dd7c79f805eeaf53935bcaec54d11c0`).

### 24.3 Product Owner decisions — recorded

**DP-2 — Document card metadata rendering: DEFERRED.** PATCH-152 must not implement layout-by-layout
Document card colour, reaction or post-comment chrome. Rendering across all layouts requires a
future **shared card-chrome funnel patch**. **Not authorized under C3-A:** `FreeformPadletCards.tsx`,
layout-by-layout card edits, duplicated card chrome, any Document card metadata rendering.

**DP-3 — shared Box component extraction: APPROVED FOR C3-B ONLY.** C3-B may extract reusable Card
colour and post-level Comment components from `NoteEditor` for Document reuse. **C3-A must not
perform that extraction** and must pass independent review first.

### 24.4 Measured Document baseline — the trace that binds C3-A

Repository tracing at `6c8fdd3`. **These are measurements, not assumptions**; each one changes the
contract below.

| # | Measured fact | Consequence |
|---|---|---|
| 1 | `DocumentEditor.tsx` renders its **own complete second shell** — overlay `fixed inset-0 z-[1000] … bg-black/50` (`:225`) and shell row `flex items-start gap-3` (`:231`) | C2 removed the Note duplicate; C3-A removes this one. After C3-A exactly one shell composition exists repo-wide |
| 2 | All three Document panels render **inside the toolbar column** `<div className="relative min-w-[72px]">` (`:233`) and escape via `absolute left-full top-0 ml-2` | This is what convergence corrects |
| 3 | `NoteEditorToolbar` **already fully suppresses the mode toggle** for `variant='document'` — `{!isDocument && (<>…toggle…</>)}` (`:183-198`) | **`NoteEditorToolbar.tsx` needs no change.** See §24.9 |
| 4 | `ToolbarPassthroughProps` is `Omit<…, 'mode' \| 'onModeChange' \| 'hasSelection'>`, so **`variant` already passes through the shell** | Document supplies `toolbar={{ variant: 'document', … }}`; shell `mode` becomes inert |
| 5 | `visibleTools` filters `typeof t.onClick === 'function'` **for the document variant only** (`:166`) | Document's control set is defined by which handlers it passes. See the Align correction, §24.9 |
| 6 | `TextStylePopup.tsx` has **no self-positioning** — the caller positions it | Converges trivially; **no change** |
| 7 | `CommentPopup.tsx` has three modes; with **no `position` prop** it renders the panel directly and *"Parent component handles positioning"* (`:491-508`). Document passes no `position` | Converges by changing Document's wrapper only; **no change** |
| 8 | `LinkPopup.tsx` **hardcodes** `absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2` at **both** return sites (`:148`, `:232`) with **no positioning prop** | **Blocks convergence.** `LinkPopup.tsx` must be added to the allowlist. See §24.10 |
| 9 | Document **already enforces strict mutual exclusion** across its three panels — `handleLink` (`:178-180`), `onTextStyle` (`:245`), `handleTextComment` (`:204-206`) each close the other two | `openPanel(id, closing[])` reproduces this exactly. **No new semantics.** Note and Document legitimately differ — which is why C2 rejected a global policy |
| 10 | Selection survives panel focus today only via `preventFocusLoss` (`onMouseDown` → `preventDefault`) on the popups. `handleAddLink` (`:182`) performs **no** range restoration; only Comment restores (`:212`) | Explicit restoration is a **defensive addition**, not a redesign. See §24.11 |
| 11 | `DiscardChangesDialog` is `fixed inset-0 z-[1100]` with its own `stopPropagation` (`:25-27`) | Self-positioned full-screen overlay; renders as a **sibling of the shell**. No shell slot |
| 12 | `CanvasModals.tsx:145-175` already passes `readOnly`, `currentUserId={user?.id}`, `currentUserName={…}` and keys a remount on open/close and Document id | **No `CanvasModals.tsx` change required.** See §24.15 |
| 13 | `DocumentEditor.test.tsx:86` asserts `Text alignment` is **absent** and `Switch to Box` is **absent** | Both remain true after migration → **`DocumentEditor.test.tsx` needs no change.** It becomes a free regression gate |
| 14 | **No test mounts the real `CanvasModals`** (54 props); existing references are source-level assertions only | The OQ-2 integration test must build a first-of-its-kind fixture. Costed in §24.16 |

### 24.5 Scope

**C3-A includes:** shared shell adoption · Document centre preservation · editable/read-only shell
differences · Document Text-mode toolbar integration through the shell · right-side placement of
the three existing Document secondary panels · Document selection reactivity via the shell ·
selection restoration · opt-in temporary visible-selection indication · unchanged Save/discard.

**C3-A excludes:** shared Card colour extraction · shared post-level Comment extraction · Document
Box-mode completion · Document card metadata rendering · PDF functionality · formatting-semantics
redesign.

### 24.6 Ownership split

**`PostEditorShell` owns for Document:** modal overlay and frame · shell row and sibling order ·
left toolbar region and the toolbar it renders · centre-slot placement · the right-side panel
region · Text mode (inert for Document, §24.9) · active-panel coordination · the render-triggering
selection state · stored selected-range · restoration before Link/Comment/format actions · the
opt-in visible-selection boundary · shared spacing · the backdrop event boundary.

**`DocumentEditor` retains:** TipTap editor creation · title · body · description · Save · Close ·
dirty-state logic · Save/discard lifecycle · Document serialization (`toEditorHtml`/`fromEditorHtml`)
· Document-specific metadata · `readOnly` input and permission interpretation · **Escape handling**
· `DiscardChangesDialog` ownership.

**Prohibited moves into the shell:** Document persistence · dirty-state computation · serialization ·
`SaveCardData` shaping · metadata mutation · TipTap schema or extension registration · any Document
content semantics. The shell receives the centre as an **opaque React node**.

### 24.7 Keyboard and backdrop boundaries

**Keyboard — §22.4's shell-keyboard-ownership clause is SUPERSEDED (confirming §23.10).**
`PostEditorShell` **must not register any global `keydown` listener** and must expose no keyboard
behaviour beyond consumer callbacks. Note keeps its characterized *absence* of Escape handling;
`DocumentEditor` keeps its existing Escape handler (`:129-139`) covered by Document tests 31–33.
Control 16 (§24.18) enforces this.

**Backdrop.** The shell owns the overlay `e.target === e.currentTarget` guard; `DocumentEditor`
supplies its existing `attemptClose` through `onBackdropClick`. Document's current guard is
`stopPropagation` on the inner row; the shell's guard is strictly safer and must keep Document
tests 29/30 (*clean backdrop closes; dirty backdrop confirms; inner clicks never trigger it*)
green **unchanged**. **Do not alter** dirty-state detection, Save/discard decisions, dialog
ordering or Escape semantics.

### 24.8 Centre contract

Preserve exactly: title input · rich body editor · description · Save button · Close button ·
current serialization · current Save/discard lifecycle. Current dimensions (`width: 640px`,
`maxHeight: 80vh`, `:300`) are preserved unless shell alignment provably requires a governed
wrapper change — **which must be reported, not assumed.**

### 24.9 Toolbar contract — **including a correction to the brief**

**Preserved Document Text controls, exactly as measured today:** `Text style` · `Bold` · `Italic` ·
`Strikethrough` · `Underline` · `Bullet list` · `Numbered list` · `Code block` · `Link` ·
selected-text `Comment`.

**CORRECTION — `Text alignment` is NOT part of the Document set and must NOT be added.** The C3-A
brief lists it among controls to preserve. Measurement (§24.4/5) shows Document does **not** pass
`onAlign`, so the document-variant filter drops it, and `DocumentEditor.test.tsx:86` **asserts its
absence**. Adding it would (a) break an accepted characterization test, and (b) ship an unwired
control — forbidden by §22.7 (*"The unwired Align control stays unwired"*) and by the brief's own
principle that no functional-looking control may ship without behaviour. **Document keeps no Align
control in C3-A.**

**Incomplete Box mode — governed resolution: the existing `variant='document'` suppression is the
mechanism.** Because the mode toggle is already gated behind `{!isDocument}` (§24.4/3) and `variant`
already passes through the shell's toolbar props (§24.4/4), Document supplies
`toolbar={{ variant: 'document', … }}` and **no Box switch is rendered at all**. The shell's
internal `mode` state becomes inert for Document. This is the *"hide the mode switch"* option, and
it requires **zero change to `NoteEditorToolbar.tsx`** — which is therefore **removed from the
allowlist**. `DocumentEditor.test.tsx:86`'s `Switch to Box` absence assertion is the regression
gate. Control 6 (§24.18) enforces it.

### 24.10 Panel convergence — and the `LinkPopup` blocker

**C3-A panel set:** `TextStylePopup`, `LinkPopup`, selected-text `CommentPopup`. Each must render
**after the centre in DOM order**, as a **flex sibling** in the shell's right-side region, **not**
nested in the toolbar, **not** below the description, **not** absolutely escaping the toolbar
column, and **not** overlapping the centre. The centre stays mounted while a panel is open.

**Mutual exclusion:** exactly one Document secondary panel is active at a time — this **reproduces
current Document behaviour** (§24.4/9), expressed as `openPanel(id, [other, other])`. It is **not**
a new global policy and **must not** be applied to Note, whose panels legitimately coexist (pinned
by the P1 test).

**`LinkPopup.tsx` must change — the one file the brief did not list.** Evidence (§24.4/8): both of
its return paths hardcode `absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2`. A flex
sibling wrapping it would be collapsed to zero width while the panel floats outside — that is
"absolutely escaping", which this section forbids. **Authorized: a narrow opt-in positioning prop**
(e.g. `inline?: boolean`, default `false`) that, when set, renders the panel without the absolute
positioning wrapper. **The default must preserve today's markup byte-identically so Note is
unaffected** — guarded by the 33 C1 tests, the 20 shell tests and control 18.

**Do not move any frozen Note panel** (§22.3). Their four C2 mount-point tests must stay green.

### 24.11 Selection reactivity, restoration and visibility

**Reactivity.** Document must consume the shell's `useShellSelection`, replacing its local
`forceSelectionTick` effect (`:73-78`). Prove: selection immediately enables Link · selection
immediately enables selected-text Comment · clearing disables both · no unrelated click required ·
existing linked text can be selected and edited/removed · **Note selection behaviour unchanged**.

**Restoration.** Opening a panel moves focus off TipTap. The shell stores the range; Document
restores it **immediately before applying** Text style, Link, or selected-text Comment. Measurement
(§24.4/10) shows today's retention relies on `preventFocusLoss` and that `handleAddLink` restores
nothing — so this is a **defensive addition**, and it must be a **no-op when the live selection
already equals the stored range**, proven by the 39 Document tests staying green. On close/cancel:
clear temporary UI state, **do not mutate body HTML**, and leave no stale range. If content changed
so the stored range is invalid, **fail safely — never apply to the wrong text.**

**Visibility — opt-in, render-only.** Governed route: a rect overlay derived from
`editor.view.coordsAtPos`, owned by `PostEditorShell`, **opt-in per consumer** (e.g.
`selectionIndicator?: boolean`, default off) so **Note output stays byte-identical**. Required: the
selected text remains visibly identifiable while a panel holds focus · the indicator tracks the
stored range · clears on close/cancel · clears when the range becomes invalid · **never enters
saved HTML** · never becomes a mark. **Prohibited:** any ProseMirror plugin or decoration · any
`useSharedTipTapEditor.ts` change · any TipTap schema change · reuse or extension of the
`Highlight` mark. **Ownership and cost:** `PostEditorShell.tsx`, estimated 50–70 lines, inside the
§24.16 cap. Controls 11 and 12 enforce it.

### 24.12 Read-only contract

Read-only Document uses the **same centre serialization** — **a second read-only format is
prohibited**. Required: title visible · formatted body visible · description visible · links
usable · Close available · **no** toolbar, **no** Text/Box switch, **no** Save, **no** formatting
mutation, **no** comment creation, **no** card mutation. **No hidden toolbar and no
disabled-but-focusable mutation controls** — the toolbar and panels must be **absent from the DOM**,
not merely styled out. Escape stays governed by existing Document behaviour. The 6 existing
read-only tests must pass **unchanged**.

### 24.13 Formatting semantics — DEFERRED, unchanged

§20.9/§23.17 remain **DEFERRED**. C3-A preserves current command semantics exactly. **Do not**
implement Smart scope · create an inline quote extension · change heading, blockquote or code-block
semantics · change the TipTap schema · change `useSharedTipTapEditor.ts`. Inline marks stay
selection-scoped per current TipTap behaviour; block commands stay block-level. **C3-A must not
present partial-block heading/quote formatting as solved.**

### 24.14 PDF boundary

**Recorded direction:** the **Document post is the future structured-writing and PDF-assembly
destination**; **Note remains lightweight**; **previous Note-targeted assembly assumptions
(including `note_post_links`) are superseded.** As recorded in §23.19, **no PDF plan document was
supplied and none exists in the repository**; nothing about its specifics has been inferred.

**No PDF code in C3-A.** Prohibited: PDF dependencies · upload · rendering · OCR · vector search ·
database tables · migrations · storage · PDF blocks · highlight extraction · annotations · export.
**If no extension point is required for the shell migration, add none** — the expected outcome.

### 24.15 `CanvasModals` and the OQ-2 identity test

**Trace result: no `CanvasModals.tsx` change is required.** It already supplies `readOnly`
(`documentModalDestination === 'document-viewer'`), real authenticated identity
(`currentUserId={user?.id}`, `currentUserName={user?.user_metadata?.name || …}`), and a keyed
remount. It is therefore authorized at **0 changed lines**; if C3-A believes otherwise it must
**stop and request an amendment**.

**OQ-2 must nevertheless be proven end-to-end.** No test mounts the real `CanvasModals` today
(§24.4/14), so C3-A must build the first such fixture and prove the chain
**`CanvasModals` → `DocumentEditor` → `PostEditorShell` → selected-text `CommentPopup`** surfaces
the **real authenticated identity**, not a placeholder. A source-level assertion is **not
sufficient**. If the 54-prop fixture proves impractical within the cap, **stop and request an
amendment** — do not silently downgrade to a source-level proof.

### 24.16 Allowlist and caps — evidence-derived

**Production**

| File | Evidence | Cap |
|---|---|---|
| `components/collabboard/editors/DocumentEditor.tsx` | owns the duplicate shell being removed (§24.4/1-2) | ≤200 changed, **file ≤400** |
| `components/collabboard/editors/PostEditorShell.tsx` | gains stored-range API + opt-in selection overlay (§24.11) | ≤110 changed, **file ≤260** |
| `components/collabboard/editors/LinkPopup.tsx` | hardcoded absolute positioning blocks convergence (§24.4/8, §24.10) | **≤14 changed** |
| `components/collabboard/canvas/ui/CanvasModals.tsx` | trace shows sufficient today (§24.15) | **0 — stop and amend if needed** |

**Aggregate production ≤324.** `DocumentEditor.tsx` must end **≤400 lines** (CLAUDE.md rule 3); if
convergence will not fit, **extract the Document centre rather than breach the ceiling**, and report it.

**Removed from the brief's candidate list by evidence:** `NoteEditorToolbar.tsx` (§24.4/3-4 — the
suppression already exists and `variant` already passes through).

**Tests**

| File | State | Cap |
|---|---|---|
| `components/collabboard/editors/documentShellIntegration.behavior.test.tsx` | **new** | ≤340 |
| `components/collabboard/editors/postEditorShell.behavior.test.tsx` | existing — **only** a bounded addition proving Note is unaffected by the opt-in overlay | ≤25 changed, **file ≤365** |
| `components/collabboard/editors/DocumentEditor.test.tsx` | existing | **0 expected** (§24.4/13) — stop and amend if a change appears necessary |
| `components/collabboard/editors/DocumentEditor.readonly.test.tsx` | existing | **0 expected** — same rule |
| `components/collabboard/editors/NoteEditor.characterization.test.tsx` | existing | **0 — READ-ONLY** |

**Aggregate test ≤365.** One integration suite rendering the real chain is preferred. **Do not**
duplicate the 33 Note tests. **No snapshot-heavy suites.**

**Not authorized:** `NoteEditor.tsx` · Note characterization tests · `PostCardContent.tsx` ·
`DocumentCardContent.tsx` · `FreeformPadletCards.tsx` · shared card chrome · Card colour extraction ·
post-level Comment extraction · `useSharedTipTapEditor.ts` · `CommentPopup.tsx` · `TextStylePopup.tsx`
(both proven unnecessary, §24.4/6-7) · TipTap extensions · schema · migrations · PDF files ·
`vitest.config.ts` · `package.json` · lockfiles · the Excalidraw fork · all governance files.
**Protected worktree (§12) unchanged and untouchable.**

### 24.17 Required proofs — forty-two

1. editable Document consumes `PostEditorShell`; 2. exactly one shell; 3. exactly one toolbar;
4. centre remains title/body/description/Save/Close; 5. Text toolbar control set and order match
the governed Document set of §24.9 (**no Align**); 6. incomplete Box mode cannot be entered — no
`Switch to Box` control exists; 7. `TextStylePopup` opens right of centre; 8. `LinkPopup` opens
right of centre; 9. selected-text `CommentPopup` opens right of centre; 10. panels are after the
centre in DOM order; 11. panels are not inside the toolbar wrapper; 12. panels do not render below
the description; 13. panels do not overlap the centre at the governed desktop viewport; 14. centre
stays mounted while panels are open; 15. selection immediately enables Link; 16. selection
immediately enables selected-text Comment; 17. clearing the selection disables both; 18. Link
applies to the original stored selection; 19. link removal applies to the original stored
selection; 20. selected-text Comment applies to the original stored selection; 21. the visible
indicator appears while a panel holds focus; 22. it clears on close; 23. **it never enters
serialized HTML**; 24. an invalidated stored range fails safely without mutating the wrong text;
25. Save/discard unchanged; 26. backdrop attempt-close unchanged; 27. Escape unchanged; 28.
read-only uses the same serialization; 29. read-only hides the toolbar (absent from the DOM); 30.
read-only hides Save; 31. read-only exposes no mutation panels; 32. formatted body visible in
read-only; 33. links usable in read-only; 34. Note shell tests remain **20/20**; 35. Note
characterization remains **33/33**; 36. all four frozen Note panel placements unchanged; 37. the
real Note Comment close-list test stays green; 38. **OQ-2 authenticated Comment identity proven
end-to-end through the real `CanvasModals` chain**; 39. no Box extraction; 40. no card-rendering
change; 41. no PDF code; 42. no schema or serialization change — `toEditorHtml`/`fromEditorHtml`
output byte-identical.

### 24.18 Negative controls — twenty-one, all mandatory

1. bypass `PostEditorShell` for Document; 2. duplicate the Document toolbar; 3. place
`TextStylePopup` below the description; 4. place `LinkPopup` inside the toolbar; 5. place
`CommentPopup` over the centre; 6. enable incomplete Box mode (drop `variant='document'`);
7. remove the selection rerender; 8. replace selection state with `useRef` only; 9. break
stored-range restoration for Link; 10. break stored-range restoration for Comment; 11. persist the
selection overlay into saved HTML; 12. leave the overlay visible after close; 13. expose the
toolbar in read-only; 14. expose Save in read-only; 15. alter the Save/discard lifecycle; 16. **add
a global `keydown` listener to the shell** (must fail Note's C1 Escape test); 17. break
`CanvasModals` authenticated identity; 18. **flip `LinkPopup`'s new positioning default** (must fail
a Note test, proving Note is unaffected); 19. remove the real Note Comment close-list; 20. introduce
a PDF dependency; 21. change serialized Document HTML.

**For every control:** the anchor must occur **exactly once** (abort on 0 or >1); the replacement
must not already be present (ambiguity abort); verify landing by **positive facts only**
(replacement present at expected count, SHA-256 differs, byte-length delta matches); **never**
assert anchor absence; restore from a **saved byte snapshot**; confirm exact SHA-256 return; clean
focused rerun. **Never `git checkout --`.** `core.autocrlf=true`. **Baseline `PostEditorShell.tsx`
bytes are the normalized CRLF form of §24.2.**

### 24.19 Validation — exact commands

```
npx vitest run components/collabboard/editors/documentShellIntegration.behavior.test.tsx
npx vitest run components/collabboard/editors/DocumentEditor.test.tsx components/collabboard/editors/DocumentEditor.readonly.test.tsx
npx vitest run components/collabboard/editors/postEditorShell.behavior.test.tsx
npx vitest run components/collabboard/editors/NoteEditor.characterization.test.tsx
npx vitest run components/collabboard/editors/DiscardChangesDialog.test.tsx
npx vitest run components/collabboard/editors/useSharedTipTapEditor.test.tsx
npx vitest run
npm run typecheck
find components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/types -name "*.d.ts" | wc -l
rm -rf .next && npm run build
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
cp -r .next .next-ordinary-backup
rm -rf .next && E2E_BRIDGE_BUILD=1 npm run build
ls .next/E2E_BRIDGE_BUILD && echo "MARKER PRESENT"
rm -rf .next && mv .next-ordinary-backup .next
npm run verify:bridge-exclusion
ls .next/E2E_BRIDGE_BUILD 2>/dev/null || echo "MARKER ABSENT"
git diff --check
file components/collabboard/editors/PostEditorShell.tsx
git status --short
git diff --cached
```

**Expected:** Document suites **39/39 unchanged** · shell suite **20 + any bounded addition** ·
Note characterization **33/33 unchanged** · `DiscardChangesDialog` 3/3 · `useSharedTipTapEditor`
10/10 · full Vitest **85 test files** (84 + the new integration suite), tests rise from **1009** by
exactly the number added · 410 declarations · exclusion 891 · ordinary marker absent · E2E marker
present · typecheck clean · `git diff --check` clean · `PostEditorShell.tsx` **still CRLF** ·
**clean index** · only the five protected worktree paths.

**Note for the implementer:** this shell's `grep -c` under-reports. Use `grep -n <pattern> | wc -l`
wherever a count is used as evidence.

### 24.20 Hard stops

Stop without committing if: Document cannot consume `PostEditorShell` safely · a second shell
would remain · the Document lifecycle must change · read-only must be broadly redesigned ·
persisted Document content or serialization must change · the TipTap schema must change · a frozen
Note panel must move · Note behaviour must change · Card colour or post-level Comment extraction
appears necessary · Document Box mode appears necessary · Document card metadata rendering appears
necessary · PDF code is required · `CanvasModals.tsx` must change · a `DocumentEditor` test must
change · the OQ-2 fixture cannot fit the cap · `DocumentEditor.tsx` would exceed 400 lines · any
other cap would be exceeded · a mutation cannot be landed or restored byte-identically · the
protected worktree changes. **On a hard stop: create no commit, restore all mutations, return to
zero unauthorized diff, and report the exact blocker.**

### 24.21 Commit rule and implementation HEAD

One implementation commit, after every gate passes:

```
152-C3-A   refactor(editors): migrate document editor onto shared shell
```

**The implementation turn starts from the full SHA of this governance commit.** Do not amend
`6c8fdd3`, `8a480a6`, `8c8f0da` or any earlier commit. Do not rebase. Do not push.

### 24.22 Status

| Item | Status |
|---|---|
| **PATCH-152** | **OPEN** |
| **152-C1** | **PASS · ACCEPTED** (`0a56516`) |
| **152-C2** | **PASS · ACCEPTED** (`8c8f0da`) |
| **P1** | **PASS · ACCEPTED** (`6c8fdd3`) |
| **152-C3-A** | **AUTHORIZED** — §24 |
| **152-C3-B** | **APPROVED IN PRINCIPLE (DP-3)** — **BLOCKED** until C3-A passes independent review |
| **152-C3-C** | **DEFERRED (DP-2)** — separate shared card-chrome patch |
| **Frozen Note panel convergence** | **DEFERRED** — unchanged (§22.3) |
| **Note centre extraction / 800-line compliance** | **DEFERRED**, unscheduled (§22.9) |
| **Formatting semantics** | **DEFERRED** — packet in §23.17 |
| **PATCH-150** | **RESERVED**, unchanged |
| **PATCH-151** | **CLOSED**, unchanged |

No production or test file was modified in this turn. Nothing was pushed.
