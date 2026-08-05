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
