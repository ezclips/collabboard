# PATCH-133 — First-class Document post: architecture, source census and UX governance

**Status: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED**

**Governance and diagnosis only. No production or test file was modified in this patch.
Nothing was pushed.**

Authored 2026-08-02 (CTO). HEAD at authoring: `c0fa799`
(`docs(patch-132): close active thumbnail auto-scroll`).

Five unrelated pending paths remain dirty and are **protected** — untouched by this patch
and by every patch it authorizes: `.gitignore`, `app/api/ai/classify-intent/route.ts`,
`app/api/ai/convert-component/route.ts`, `app/api/ai/generate-component/route.ts`,
`scripts/live-access-login.mjs`.

---

## 0. Reading correction

The task named `.fable5/architecture.md`. **That file does not exist.** The root
architecture document is `.fable5/docs/ARCHITECTURE.md`, which is what was read
(together with `docs/PERMISSIONS.md`, `docs/DATABASE.md`, `.fable5/CLAUDE.md`, and
PATCH-120 / 122 / 123 / 125 / 128 / 129 / 130 / 131 / 132). Recorded so the next reader
does not conclude the architecture doc was skipped.

---

## 1. Subject and user intent

The user wants a **first-class Document post**. As stated:

- a Document / "Card view" action exists today inside a modal / clipart-editing toolbar;
  the location is confusing and should be **removed once its ownership is proven**;
- Document creation should move to the **main canvas toolbar**;
- a document should appear on the canvas as a **note-like post**: document icon, title,
  first lines of content, word count, clear open affordance;
- a **compact generic document icon** may remain, but only for empty / minimized /
  archive / fallback presentation;
- opening a document shows a **large document modal**;
- editable users get an **editor** modal; read-only users get a **non-editing** modal with
  no mutation controls;
- later phases *may* add Scrintal-like links, backlinks, reusable documents, archive and
  search, and multiple board appearances. **None of that is authorized now.**

### 1a. Supplied product references

Six screenshots were described: (1) the current Card view / Document control in the modal
editing toolbar; (2) the existing large Document Card modal; (3) a richer document editor
with a vertical formatting toolbar; (4) export options — PDF, Word, Markdown, plain text;
(5) a compact document-file canvas representation; (6) a note-like canvas card direction.

**The screenshots were not available to this diagnosis as image files** — only the user's
written description of them. Every finding below is therefore derived from **source**, and
where a screenshot claim is confirmed or contradicted by source, the source wins and the
difference is recorded. **Per the task's own instruction, no removal is authorized from
screenshots alone** (§4f).

---

## 2. Uploaded-plan review — **NOT REVIEWED · BLOCKING**

`PFD_Plan.rar`, reported to contain prior integration plans and PATCH-090…PATCH-105
material.

| Check | Result |
|---|---|
| Present in repository | **No** — no `.rar`/`.zip`/`.7z` anywhere under the repo |
| Present in `~/Downloads`, `~/Desktop`, `~/Documents`, `~/OneDrive`, `C:\Users\rmeic\Projects` | **No** — a recursive `*PFD*` scan returned only `Downloads\[Guru3D]-DDU\…\driverfilesKMPFD.cfg`, unrelated |
| Extraction tooling available | **Yes** — `7z` is on PATH (scoop shim) and 7-Zip is installed |

**Classification: THE ARCHIVE WAS NOT SUPPLIED TO THIS ENVIRONMENT. The blocker is
availability, not tooling.**

This distinction matters. The task pre-authorized a fallback ("if the RAR cannot be
extracted, require a ZIP") that assumes a *format* problem. **A ZIP would not help** — the
file is not on this machine. What is required is the file itself, by any of: placing
`PFD_Plan.rar` (or a `.zip`, or an extracted directory) somewhere under
`C:\Users\rmeic\Projects\dev\starter\` or `~/Downloads\`, and naming the path.

Consequences, held firmly:

1. **No contract in this patch may depend on the archive's contents.** Everything below is
   derived from the live repository only.
2. **PATCH-090…PATCH-105 exist in this repository** (`.fable5/patches/`) and were spot-read.
   The archive's copies are **historical proposals**, not current truth, and per the task
   must not be imported as patch numbers or implementation contracts.
3. **`PATCH-098` does not exist in the repo** (the sequence skips 097 → 099), as do gaps at
   116, 118, 119, 126. If the archive contains a "PATCH-098", it is *not* a Fable 5 patch
   and must not be treated as one.
4. Until the archive is reviewed, **status cannot rise above DIAGNOSIS INCOMPLETE**, even
   though the *source* census below is complete and bounded.

---

## 3. Source census — what exists today

Searched across `app/`, `components/`, `lib/`, `types/`, `hooks/`, `supabase/`, `e2e/`,
excluding `node_modules` and the vendored `excalidraw_fork`.

### 3a. Term census

| Term | Result |
|---|---|
| `DocumentCard`, `DocumentEditor`, `DocumentModal` | **zero occurrences** — no such component exists |
| `CardView` | 10 files (see §4) |
| `card-view` | zero |
| `"Card view"` | `CardActionsToolbar.tsx:79` (the label) + 2 assertions in `ClipartCardDraftModal.test.tsx` |
| `clipart` | `ClipartCardDraftModal.tsx`, `ExternalClipartBrowserModal.tsx`, `app/api/openclipart`, 1 unit test, 1 e2e spec |
| `wordCount` | **two independent implementations** — `CardEditor.tsx:56`, `CardPreview.tsx:44` |
| TipTap / ProseMirror | present and in real use (`NoteEditor`, `CommentEditor`, `CommentPopup`, `CommentRow`, custom extensions) |
| Lexical, Slate, Quill | **zero** — not dependencies, not used |
| `contentEditable` | 1 occurrence (not in the card/document path) |
| `docx`, `jspdf`, `turndown`, `html2canvas`, `file-saver` | all present as dependencies **and implemented** — see §8 |
| `canEdit` / `readOnly` / `permission` | see §7 |

**No file in the repository is named for "document."** The feature the user calls
"Document" is implemented under the name **"card"**.

### 3b. The naming collision that runs through this whole patch

| User-facing concept | Code name | Where |
|---|---|---|
| Document post | `type: 'card'` **without** `metadata.svgUrl` | `types/collabboard.ts:97` |
| Clipart post | `type: 'card'` **with** `metadata.svgUrl` | same union, disambiguated at runtime |
| "Document Card" (modal label) | `CardEditor` | `CardEditor.tsx:111` renders the literal string `'Document Card'` |
| "List Card" (modal label) | same component | `metadata.counterType === 'cards'` |

The dispatch that separates them is a **two-line runtime test**, not a type:

```
app/dashboard/canvas/[id]/CanvasClient.tsx:5794
  else if (post.type === 'card' && post.metadata?.svgUrl) setIsClipartDraftModalOpen(true);
  else if (post.type === 'card')                          setIsCardEditorOpen(true);
```

**One post type serves two products, told apart by the presence of an icon URL.** This is
the single most important structural fact in this census, and §11 hangs off it.

---

## 4. Current-button ownership — **PROVEN, and it is not what the label says**

The task required exact ownership before any removal. Answer:

### 4a. The button

`components/collabboard/editors/CardActionsToolbar.tsx:77-82`

```tsx
{
    icon: LayoutGrid,
    label: 'Card view',
    onClick: () => onToggleCardView(),
    active: isCardView,
},
```

Owning component: **`CardActionsToolbar`** (136 lines) — a shared, hardcoded five-or-six
entry vertical toolbar (Color · Icon · [Caption] · Card view · Reaction · Comment). Its
hardcoded shape is already governed: PATCH-122 §15a established that the array is fixed and
that additive extension requires explicit authorization.

### 4b. What the callback actually does — **the label is wrong**

`onToggleCardView` **does not toggle a view.** At both live call sites it opens the
`CardEditor` modal in **edit** mode:

| Call site | Body | Live? |
|---|---|---|
| `FreeformPadletCards.tsx:6008-6012` | `setCardToolbarPadletId(null); setPadletToEdit(…); setIsCardEditorOpen(true)` | **LIVE** — canvas card toolbar |
| `ClipartCardDraftModal.tsx:194-196` | `setIsCardViewOpen(true)` → renders `<CardEditor …>` at `:427` | **LIVE** — clipart draft modal |
| `FreeformPadletCards.tsx:1803-1807` | same as the first | **DEAD** — the whole block is gated `{false && cardToolbarPadletId === padlet.id && (…)}` at `:1785` |

So the honest name for this control is **"Open document editor."** The user's instinct that
the location is confusing is correct, and the label is confusing too.

### 4c. `isCardView` / `metadata.showCardView` — **a dead flag**

`showCardView` is **read in four places and written in none**:

```
FreeformPadletCards.tsx:1763, :1790, :5987   (read)
ClipartCardDraftModal.tsx:180                (read)
types/collabboard.ts:203  showCardView?: boolean;   (declared)
```

No assignment exists anywhere in `app/`, `components/`, `lib/` or `types/`. Therefore the
button's `active` highlight **can never be true**, and the flag it reflects is a
never-written metadata key. It is not a feature with a bug; it is an unfinished feature.

### 4d. Would removal orphan functionality? — **No, but only because of a second path**

A second, independent opener for the same modal exists:

```
app/dashboard/canvas/[id]/CanvasClient.tsx:5795   (openPadletInTypeEditor)
  else if (post.type === 'card') setIsCardEditorOpen(true);
```

reached from the context menu (`openPadletTargetFromContextMenu`) and the type-editor
dispatch. **Removing the toolbar entry therefore orphans nothing for canvas card posts** —
provided that path is verified live before removal, not merely read.

**One removal is NOT safe.** In `ClipartCardDraftModal`, the same button is the **only**
opener for `isCardViewOpen`, and that `CardEditor` writes back through `onChange`
(`:429-440`) into the clipart draft. Removing it there deletes a real capability from the
clipart flow. **PATCH-134 must treat the two call sites separately.**

### 4e. Sibling findings on the same surface — two more dead paths

- **`CardPreview.onEditContent` is dead.** It is declared in the props interface
  (`CardPreview.tsx:12`) and passed by `FreeformPadletCards.tsx:1757`, but **is not
  destructured in the component's parameter list** (`:19-27`) and is never called.
- Because the only body of `onEditContent` is `setIsCardViewerOpen(true)`
  (`FreeformPadletCards.tsx:1758-1761`), **the read-only Card Viewer is unreachable.** The
  `<CardEditor … readOnly={true}>` instance mounted at `CanvasClient.tsx:7456-7467` — the
  one the user wants to become the read-only document modal — **can never be opened by any
  current user action.**

This is a load-bearing discovery. The read-only document modal is not "a mode that needs
improving"; it is **untested dead code that has never run in production**, and §6 must be
read with that in mind.

### 4f. Availability and scope

| Question | Answer |
|---|---|
| All post types or only some? | **Only `type: 'card'`** — the toolbar is reachable only via `CardPreview`, which Freeform renders for card posts |
| Available to read-only users? | **No, in effect.** The Freeform opener `onOpenToolbar` is gated `canUseFreeformEditButton ? … : undefined` (`FreeformPadletCards.tsx:1752`), and the clipart draft modal is itself an editing surface. **But this is UI-only gating** (§7) |
| Shared icon or callback? | `LayoutGrid` is unique within `CardActionsToolbar`; the `onToggleCardView` prop name is shared by all three call sites and by `ClipartCardDraftModal.test.tsx:104/149/882` |
| Governed by prior patches? | Yes — PATCH-120 §1 (no-op callbacks on this toolbar), PATCH-122 §15a (hardcoded array), PATCH-123, PATCH-125. **Their characterization tests assert the exact label list** including `'Card view'` (`ClipartCardDraftModal.test.tsx:417`) |

**§4f last row is a hard constraint:** `ClipartCardDraftModal.test.tsx:417` asserts
`['Color', 'Icon', 'Caption', 'Card view', 'Reaction', 'Comment']`. Removing or renaming the
entry **will fail an existing committed test**. That test belongs to closed PATCH-120/122
work. Updating it is legitimate (it characterizes the label list, and the list is changing
by authorization) but it **must be an explicit, named part of PATCH-134's test allowlist**,
not an incidental edit — otherwise it will read as tampering with closed-patch evidence.

---

## 5. Document data model — **classification 3: UI-ONLY PROTOTYPE**, with one partial

| Asked | Present? | Evidence |
|---|---|---|
| A document post type | **No** | `types/collabboard.ts:97` union has no `'document'`; `'card'` is overloaded (§3b) |
| A document entity / table | **No** | no `documents` table in `supabase/baseline/schema_snapshot_2026-07-05.sql` |
| Document body storage | **Partial** | `padlets.content text` — generic post body, shared with every other type |
| Rich-text JSON | **No** | TipTap exists for notes/comments; the card path uses a **plain `<textarea>`** |
| Markdown or HTML storage | **Undefined — see below** | |
| Title | **Yes** | `padlets.title text` |
| Description | **Partial** | `metadata.description`, written only by `CardEditor` |
| Word count | **Computed, twice, inconsistently** | `CardEditor.tsx:56` vs `CardPreview.tsx:44` |
| Preview / excerpt | **No** | nothing generates or stores one |
| Document version | **No** | |
| Permissions independent of board | **No** | §7 |

### 5a. The HTML/plain-text contradiction

Both word counters strip HTML tags before counting:

```
CardEditor.tsx:56   content.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length
CardPreview.tsx:44  (content || '').replace(/<[^>]*>/g, '').trim() → split(/\s+/).length
```

…which means the code **expects `content` to be HTML**. But the only editor for that field
is a **`<textarea>`** (`CardEditor.tsx:145-151`), which renders HTML as literal source text
and cannot produce it. So either the field is plain text and the stripping is dead defensive
code, or the field contains HTML from some other writer and the editor displays raw markup
to the user.

**This is unresolved and must not be guessed.** It is a required first measurement for
PATCH-137 (§11), and it is a **hard stop** for any migration that assumes a format.

### 5b. The two word counts disagree

`CardEditor` applies `.filter(Boolean)`; `CardPreview` does not. For empty content,
`''.split(/\s+/)` returns `['']` → **`CardPreview` reports "1 words" for an empty document**
while the modal reports "0 words". A visible defect, a P6 duplication, and a warning that
word count must become **one** domain function, not a third inline copy.

### 5c. Multi-board reuse — **NOT SUPPORTED BY THE SCHEMA. Do not attempt.**

`padlets` has a single `board_id uuid` (plus a legacy `canvas_id uuid`). One row is on
exactly one board. There is no placement/appearance table.

The user's own framing — *do not introduce multi-board reuse unless the current schema
already supports it safely* — resolves cleanly: **it does not.** The
entity/appearance separation must be preserved as a **naming and layering discipline**
(§10) so a future placements table is cheap, and **not** as a schema change now.

### 5d. One thing the schema does allow

`padlets.type` is `character varying(50)` with **no CHECK constraint and no enum**. A new
`'document'` value therefore needs **no migration** — only the TypeScript union and the code
that switches on it. Conversely, nothing at the database level prevents a typo'd type from
being written. Both facts matter to PATCH-137.

---

## 6. Modal ownership — one component, `readOnly` prop, decorative toolbar

**`components/collabboard/CardEditor.tsx` (171 lines)** is the "large Document Card modal"
from screenshot 2. It is currently **structure C** (one editor configured read-only).

Three instances exist:

| Instance | Mode | Reachable? |
|---|---|---|
| `CanvasClient.tsx:7456` | `readOnly={true}` | **No** — §4e |
| `CanvasClient.tsx:7469` | edit | Yes — toolbar (§4b) and context menu (§4d) |
| `ClipartCardDraftModal.tsx:427` | edit | Yes — clipart draft only |

### 6a. Findings against the user's requirements

| Requirement | Current state |
|---|---|
| Formatting toolbar | **Decorative.** The six buttons at `:135-140` (Bold, Italic, Link, List, AlignLeft) have **no `onClick`**. They render, accept clicks, and do nothing — the identical defect PATCH-120 §1 found on `CardActionsToolbar` |
| Rich-text body | **No.** A `<textarea>` (`:145`). TipTap is available in-repo but unused here |
| Word count | Yes (`:108`), inconsistent with the card (§5b) |
| Description | Edit mode only (`:156-167`) — **absent in read-only** |
| Title in read-only | **Not rendered.** The read-only header (`:117-121`) replaces the title with a static `FileText` icon and the literal string "View Document" |
| No mutation callbacks in read-only | **Fails.** `onSave` is mounted unconditionally; safety is a single early `return` inside `handleSave` (`:59-62`). The backdrop `onClick` is wired to `handleSave` (`:78`), i.e. the mutation entry point is bound to a click on empty space |
| Export actions | **None** |
| Delete / archive actions | **None** |
| Save state | **None** — no dirty flag, no explicit Save; closing saves |
| Type safety | `initialMetadata: any`, `metadata: any` (`:12-13`) — violates the repo's no-`any` rule |

### 6b. Governing conclusion for the modal split

Read-only correctness here is **not** achieved by hiding buttons — the current component
demonstrates exactly why. It hides the toolbar and the footer, and still mounts the mutation
callback and binds it to the backdrop.

**Required structure: B — one shell, two distinct bodies.**

- a shared `DocumentModalShell` (chrome, header, close, word count, a11y/focus trap);
- a `DocumentViewer` body that **is not given** `onSave`, `onDelete`, or any mutation prop —
  the props do not exist on its interface, so an unauthorized mutation path is a **type
  error**, not a code-review catch;
- a `DocumentEditor` body that receives them.

**A is acceptable** (two components sharing a renderer) if it reaches the same property.
**C is rejected** — it is the current design and it already failed.

---

## 7. Permission census — **HARD STOP TRIGGERED**

### 7a. What exists

- `types/permissions.ts` — clean model: `BoardPermission = admin | moderator | editor |
  commenter | reader`, workspace roles, `AuthContext`.
- `lib/auth/permissions.ts` (239 lines) — `getBoardPermission` (via the
  `get_board_permission` RPC), `boardPermissionSatisfies`, `requireBoardPermission`,
  `getPermissionContext`, legacy mapping.
- RLS policies from migration `001`.

`ARCHITECTURE.md` calls permissions the healthiest subsystem. **That verdict is about the
model, not about its use in the canvas.**

### 7b. What the canvas actually does

```
app/dashboard/canvas/[id]/CanvasClient.tsx:278
  const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);
app/dashboard/canvas/[id]/CanvasClient.tsx:282
  const canUseCanvasToolbar = canUseFreeformEditButton;
```

`canEditWorkspace` (`lib/workspace/context.ts:45`) returns
`role === 'owner' || 'admin' || 'member'` — a **workspace** role.

Three consequences:

1. **`resolveBoardPermission` — the single resolution function mandated by
   `PERMISSIONS.md` §1 — does not exist.** Zero occurrences repo-wide.
2. **The board-permission machinery is called from exactly one place in the entire
   application: `app/api/share-link/route.ts:53,70`.** No canvas surface calls
   `getBoardPermission`, `requireBoardPermission`, or `boardPermissionSatisfies`.
3. **The whole canvas is gated by one boolean derived from a workspace role.** Board
   `editor` / `commenter` / `reader` are **not distinguishable** on any canvas surface.

### 7c. The six capabilities the task asked for

| Capability | Exists? |
|---|---|
| `canViewDocument` | **No** — implied by board access |
| `canEditDocument` | **No** — approximated by `canUseFreeformEditButton` (workspace-level) |
| `canDeleteDocument` | **No** |
| `canExportDocument` | **No** — and export today has **no gate at all** (§8) |
| `canComment` | **No** as a document capability |
| `canLink` | **No** |

### 7d. Classification

**HARD STOP: "permission enforcement exists only in presentation code" — CONFIRMED for the
canvas surface.** RLS is the real floor (as `PERMISSIONS.md` §4 already admits: "direct
client writes mean RLS is currently the *only* real check").

**HARD STOP: "viewer/editor roles cannot be distinguished" — CONFIRMED at board
granularity, NOT at workspace granularity.** A workspace `readonly` user *is*
distinguishable today. A board-level `reader` or `commenter` is not.

This does **not** block the whole feature. It blocks **PATCH-136 specifically** (§11), and
the task's instruction — *prefer a structure that prevents unauthorized mutation paths
rather than merely hiding buttons* — is precisely the right response: the §6b type-level
split is what makes a read-only document modal safe **even while the capability source
remains coarse.**

### 7e. Explicitly not inferred

Per the task: **board view permission does not grant export permission.** Recorded as a
governing rule, and §8 shows the current code violates it by omission.

---

## 8. Export census — **all four formats already exist**, in the wrong place, ungated

`components/collabboard/AIComponentExportMenu.tsx` (275 lines), client-side, all
dependencies dynamically imported.

| Format | State | Implementation |
|---|---|---|
| Plain text | **Implemented** | `:53-54` — HTML → text → `Blob` → `saveAs` |
| Markdown | **Implemented** | `:57-60` — `turndown@^7.2.2` |
| Word / DOCX | **Implemented** | `:64-140` — `docx@^9.6.1`, markdown→paragraph mapping with heading levels |
| PDF | **Implemented, with a serious caveat** | `:161-199` — `html2canvas` rasterizes the DOM, `jspdf@4.2.1` pastes the **image** across A4 pages |

Findings:

1. **Screenshot 4 is real and already shipped** — but it is bound to **AI-component posts
   only**. Single consumer: `FreeformPadletCards.tsx:3190`. It takes `code` (HTML string)
   and `getTargetElement()` (a live DOM node for the PDF raster).
2. **The PDF is an image.** No selectable text, no copy/paste, no screen-reader access, no
   text search, and file size scales with pixels. For a *document* product this is a
   material quality problem, not a detail. **PATCH-138-or-later must decide** whether
   document PDF export re-uses this path or gets a text-native one.
3. **There is no permission check of any kind** on the export menu — not even the
   presentation-level `canUseFreeformEditButton`. Anyone who can see the post can export it.
   Directly contrary to §7e.
4. **A second, independent export implementation exists**:
   `components/presentation/exporters/exportToPDF.ts` and `exportToPPTX.ts`. Adding a third
   for documents would breach **P6**. The survivor must be designated before any document
   export work.
5. Filename generation: `fileBase` from the post title. Embedded-media behavior inside
   exports: **not measured** — recorded as an unmeasured cell, not assumed.

**Authorization: NO new export format, and no export entry point, in the initial toolbar /
card / modal patches.** Export is deferred to its own patch with a permission gate designed
in from the start.

---

## 9. Placement map — Freeform and Drawing

| Surface | How a post appears |
|---|---|
| **Freeform** | `FreeformPadletCards.tsx` (6,368 lines) renders `CardPreview` directly for `type: 'card'` (`:1747`) |
| **Drawing** | Every post is backed by an Excalidraw **`embeddable`** element carrying `link: padlet://<post-id>`; the React card is a DOM overlay. Reconciliation at `DrawingLayout.tsx:393, 558, 1223-1265, 1312` and `useCanvasActions.ts:141` |

Implication: **a document post gets Drawing placement for free**, because Drawing keys off
`padlet://<id>` and not off the post type — *provided* the document reuses the shared card
renderer rather than introducing a parallel one.

### 9a. Import/export round-trip — a measured, specific risk

`lib/export/serialize.ts:242` selects `title, content, type, metadata, …` generically, and
`import_workspace_bundle` restores them. **Document body and metadata will round-trip.**

**But PATCH-132 §19e measured that Excalidraw `embeddable` scene elements did NOT survive an
export/import round trip** on a real board. A Drawing-placed document would therefore keep
its row and lose its canvas appearance — the post survives, its placement does not.

**Classification: the "import/export would silently lose document content" hard stop is
PARTIALLY TRIGGERED — placement is at risk, content is not.** This is the difference between
the entity and its appearance (§10) showing up as a concrete, already-measured defect. It is
PATCH-137's problem and must be measured, not assumed, before that patch is authorized.

---

## 10. Governing model — entity, appearance, experience

Adopted as the patch's organizing principle:

```
DOCUMENT ENTITY            the content: title, body, description, derived word count
        ↓
DOCUMENT APPEARANCE        one placement of that entity on one board (position, size, card)
        ↓
DOCUMENT MODAL EXPERIENCE  viewer or editor, chosen by capability
```

Rules that follow, binding on PATCH-134…137:

1. **Never equate the entity with a placement in a name, a type, or a function signature.**
   `openDocument(documentId)`, not `openDocument(cardOnThisBoard)`.
2. **Today, entity and appearance are the same row** (§5c). That is an accepted, recorded
   *implementation* fact — it must not become an *architectural* assumption.
3. **Excerpt/word count belong to the entity, in domain code** — one function, consumed by
   card and modal alike. Not a third inline copy (§5b). This is the P6 answer to the task's
   "does excerpt generation belong in domain or presentation code" question: **domain.**
4. **Multi-board reuse is not authorized** and no code may be shaped to imply it exists.

---

## 11. Proposed UX contract

### 11a. Main-toolbar integration — insertion point and pattern

- Registry: **`app/dashboard/canvas/[id]/CanvasClient.tsx:5369`**, `toolbarGroups`, Group 2
  `'create'` (currently AI · Note · To-do · Comment · Table). Document belongs here,
  **after Note**.
- Handler: **`handleToolClick`**, same file, `:5441`; per-type `case` arms from `:5492`.
- Renderer: `components/collabboard/canvas/ui/CanvasSidebar.tsx`, via
  `CanvasClient.tsx:5876`.
- Gate: `canUseCanvasToolbar` (`:282`) — workspace-level (§7b).
- Tooltips: `label` per tool. **Keyboard shortcuts: none exist for any tool** — do not
  invent one for Document. Overflow/collapse: `isToolbarCollapsed`, persisted to
  `user_metadata.preferences.toolbarCollapsed`, with a `priority` field per group.

**Decoy warning: `components/DraggableToolbar.tsx` (223 lines) is DEAD CODE** — it contains
a plausible-looking `{ id, icon, label, type }` tool registry including a `FileText` "Note"
entry, and **has zero importers**. An implementer searching for "the toolbar" will find it
first. It must not be edited, and PATCH-134 must say so explicitly.

**Creation pattern — answer to the task's A/B/C/D question: B, modal-first.** Every existing
creation tool (`note`, `table`, `link`, `todo` — `:5492-5570`) constructs an **unsaved draft
`{ id: 'new', … }` Padlet**, opens the type's editor, and persists on save. Document must do
the same. It is the smallest approach consistent with the architecture, it needs no new
pipeline, and it avoids C's litter of empty posts from mis-clicks.

### 11b. Canvas card contract

**Reuse `CardPreview`, extended — do not copy the Note renderer.** Reasons: `CardPreview` is
already the registered renderer for `type: 'card'` on both surfaces (§9), already renders
icon/title/word count, and is already governed by PATCH-120/122/123/125. The canvas *note*
renderer is inline within `FreeformPadletCards.tsx` (6,368 lines) and is not extractable
without a refactor far larger than this feature — and copying it would import unrelated
mutation behavior, which the task explicitly forbids.

| Element | Contract |
|---|---|
| Icon | Document glyph when `!svgUrl`. **Today this slot renders a bare grey box** (`CardPreview.tsx:144`) — that placeholder *is* the current document card |
| Title | `padlets.title`; truncate with `line-clamp`, never reflow card height |
| Excerpt | **New** — first lines of body, from **one domain function** (§10.3) |
| Word count | Same domain function; fixes §5b |
| Label | "Document" |
| Accent | Reuse existing `topStripColor` / `iconBgColor` metadata; no new keys |
| Open affordance | Explicit, visible, keyboard-reachable — §11d |
| Empty document | Icon + title + "Empty document"; **never "1 words"** |
| Dimensions | Unchanged from current card sizing; excerpt fills available space and clips |

The **compact generic document icon** the user described stays available exactly as the
`svgUrl`-absent / empty / fallback presentation — it is what already exists, and it is not
a second component.

### 11c. Modal contract

Per §6b: **structure B**, shared shell + two bodies, mutation props absent (not disabled) on
the viewer.

| | Edit mode | Read-only mode |
|---|---|---|
| Title | editable input | **rendered** (fixing §6a) |
| Body | editable | rendered |
| Word count | ✅ | ✅ |
| Description | ✅ | **rendered** (fixing §6a) |
| Formatting toolbar | must be **functional or absent** — never decorative (PATCH-120 §1) | absent |
| Save state | explicit | none |
| `contentEditable` / textarea | yes | **must not be mounted** |
| Editing keyboard shortcuts | yes | not bound |
| Mutation callbacks | passed | **not in the type** |
| Export | separately permitted, deferred (§8) | separately permitted, deferred |
| Delete / archive | capability-gated | absent |

### 11d. Open-behavior contract

| Interaction | Behavior |
|---|---|
| Single click | **Select only** — never open |
| Double click | Open |
| Explicit Open affordance | Open — the primary, discoverable path |
| Enter on a selected card | Open |
| Touch | Tap = select; the explicit affordance = open. **No double-tap-to-open** |
| Read-only user | Opens the viewer |
| Drag conflict | **Open must not fire when a drag occurred.** Gate on pointer movement below a threshold between down and up. A `click` handler alone is not sufficient, and the existing `data-no-drag` / `onPointerDown` stopPropagation idiom (`FreeformPadletCards.tsx:3186-3188`) is the house pattern to follow |

---

## 12. Scrintal-inspired future architecture — recorded, **NOT AUTHORIZED**

Every row below is future work. None is authorized by this patch. Sources are separated as
the task required.

| Capability | Verified Scrintal behavior | User-requested adaptation | Repository support today | Future inference |
|---|---|---|---|---|
| Short / long-form cards | — | ✅ requested | Partial — card + modal exist | Maps to §11b/§11c |
| Compact vs expanded layouts | — | ✅ requested | Partial — the empty/fallback icon (§11b) | Small |
| One document on many boards | — | ✅ requested (later) | **None** — §5c | Requires a placements table |
| Durable bidirectional links | — | ✅ requested | **None** | New entity + backlink index |
| Links persist after board removal | — | ✅ requested | **None** | Depends on entity/placement split |
| Backlinks + search sidebar | — | ✅ requested | **None** | Needs a search index |
| Archive/library independent of boards | — | ✅ requested | **None** | Depends on the split |
| File/image/PDF/media attachments | — | ✅ requested | Partial — `file_url`/`file_type` columns exist | Moderate |
| Read-only sharing | — | ✅ requested | Partial — `share_links` + `/share/[token]` exist | Needs §7's capability work |

**"Verified Scrintal behavior" is empty on purpose.** No Scrintal product was inspected
during this diagnosis. Every entry in the second column is the **user's description of what
they want**, which is a perfectly good requirement source and a **poor** citation for what a
competitor does. Recording them as "verified" would manufacture evidence. If verified
competitor behavior is wanted, it needs its own research pass.

**No Scrintal branding, visual assets, or proprietary implementation may be copied.**

---

## 13. Patch decomposition

The task's proposed sequence is **kept in its numbering and largely in its shape**, with two
evidence-driven changes: PATCH-134 absorbs the dead-flag cleanup its own ownership proof
uncovered, and **PATCH-136 gains a blocking prerequisite** because §7 triggered a hard stop.

### PATCH-134 — Document creation in the main toolbar; retire the old entry

- **Outcome:** a "Document" tool in the Create group opens the document editor; a saved
  document appears on the canvas. The `Card view` entry is removed from the canvas card
  toolbar and **retained** in the clipart draft modal (§4d).
- **Ownership:** `toolbarGroups`/`handleToolClick` (CanvasClient), `CardActionsToolbar`,
  `FreeformPadletCards`, `ClipartCardDraftModal`.
- **Dependencies:** none. **Prerequisites:** the §2 archive review.
- **Likely production allowlist:** `CardActionsToolbar.tsx` (make the entry optional —
  additive, per PATCH-122 §15a), `FreeformPadletCards.tsx` (drop the prop at the live call
  site; delete the `{false && …}` dead block at `:1785-1810`), `CanvasClient.tsx` (registry
  + one `case`), `types/collabboard.ts` (add `'document'`; retire `showCardView`).
- **Test allowlist:** a new `e2e/characterization/patch-134-document-toolbar.spec.ts`, **and
  explicitly** `components/collabboard/ClipartCardDraftModal.test.tsx` (§4f — the label
  assertion must change, and that change must be authorized by name).
- **Hard stops:** the toolbar-removal proof must be **live**, not read (§4d); `CanvasClient`
  is **8,526 lines**, far past the 800-line ceiling, and repo rule 3 forbids growing it — so
  either the registry entry is a genuinely minimal addition with an explicit, recorded
  ceiling waiver, **or** the create-tool registry is extracted first. **This must be decided
  before the allowlist is granted, not during implementation** (PATCH-129 §15b: never grant
  an allowlist the authorized shape cannot satisfy).
- **Excludes:** card rendering changes, modal changes, permissions, export.

### PATCH-135 — Document card rendering and open affordance

- **Outcome:** the §11b card; the §11d open behavior.
- **Ownership:** `CardPreview.tsx`; a new domain module for excerpt + word count.
- **Prerequisites:** PATCH-134.
- **Likely production allowlist:** `CardPreview.tsx`, `lib/domain/documents/*` (new),
  `FreeformPadletCards.tsx` (open affordance wiring only).
- **Hard stops:** no third word-count implementation (§5b); no coupling to Note mutation
  behavior; drag must not open (§11d).
- **Excludes:** modal internals, permissions, export, Drawing-specific work.

### PATCH-136 — Editor / viewer modal split and permission enforcement

- **Outcome:** §11c, with viewer safety enforced by **types**, not by hidden buttons.
- **Ownership:** `CardEditor.tsx` → shell + two bodies.
- **Prerequisites:** PATCH-135, **and a board-level capability source (§7d)**.
- **BLOCKING PREREQUISITE:** either (a) a real capability resolution — the
  `resolveBoardPermission` that `PERMISSIONS.md` §1 already mandates and that does not exist
  — reaching the canvas, or (b) an explicit, recorded owner decision that the document
  viewer/editor split ships against the **workspace-level** `canEditWorkspace` boolean as an
  interim, with the board-level gap stated in the patch. **(b) is acceptable only because
  the §6b type-level split is safe under a coarse capability source; it is not acceptable as
  a permanent answer.**
- **Hard stops:** no `any` in the new interfaces; a decorative formatting toolbar is a
  rejection (PATCH-120 §1); the viewer must not mount an editable field or a mutation prop.
- **Excludes:** export, delete/archive, links.

### PATCH-137 — Persistence, lifecycle, reconciliation, import/export compatibility

- **Outcome:** documents survive reload, realtime, Drawing↔Freeform, and workspace
  export/import.
- **Prerequisites:** PATCH-136.
- **Required first measurements** — none may be assumed: the §5a HTML-vs-plain-text question;
  the §9a Drawing-embeddable round-trip loss; behavior of legacy `type: 'card'` rows under
  the new `'document'` type.
- **Hard stops:** any migration of existing `card` rows must be **reversible** and must not
  touch clipart cards (§3b); no silent content loss (P3, repo rule 10).
- **Excludes:** everything in PATCH-138.

### PATCH-138 — Links, backlinks, archive, reusable multi-board appearances

- **Status: NOT AUTHORIZED and not authorizable from this census.** Requires the
  entity/placement schema split (§5c) and a search index. Recorded so the sequence has a
  visible terminus, not as a queued work item.

### A note on export

**Export gets no patch number here.** It exists (§8), it is ungated, it has a second
implementation, and its PDF is a raster image. Slotting it into this sequence would imply
those three problems are the document feature's to solve. They are their own patch, and
its first job is choosing the surviving implementation.

---

## 14. Risks

1. **The `'card'` overload (§3b).** Every change to card behavior touches clipart. The two
   are separated by `metadata?.svgUrl` at runtime, so a type-level mistake is invisible to
   the compiler and visible only in the clipart flow.
2. **`CanvasClient.tsx` at 8,526 lines is the natural insertion point** and is exactly the
   file the repo rules forbid growing (§13, PATCH-134 hard stop).
3. **Closed-patch tests assert the toolbar label list** (§4f). An unauthorized edit there
   would look like tampering with accepted evidence.
4. **The read-only modal has never executed** (§4e). Treating it as working code and
   "improving" it will produce confident, untested claims.
5. **Permission gating is presentation-only in the canvas** (§7d). Any statement that a
   read-only user "cannot" do something is currently a statement about buttons, not access —
   RLS is the only real floor.
6. **Drawing placement is lost on export/import** (§9a) — already measured, not speculative.
7. **Dead code will mislead an implementer**: `DraggableToolbar.tsx` (no importers),
   `FreeformPadletCards.tsx:1785` (`{false && …}`), `CardPreview.onEditContent` (never
   destructured), `metadata.showCardView` (never written).
8. **The archive is unreviewed** (§2). Historical plans may contradict every finding here,
   and a contract finalized before reading them may have to be reopened.

---

## 15. Hard stops — evaluated against the task's list

| Hard stop | Verdict |
|---|---|
| Document data ownership unclear | **PARTIAL** — the row is clear; the body's **format** is not (§5a) |
| Existing button has multiple responsibilities | **TRIGGERED** — one prop, three call sites, two live, two different behaviors, a misleading label, and a dead `active` flag (§4b/§4c) |
| Permission enforcement only in presentation code | **TRIGGERED** (§7d) |
| Viewer/editor roles indistinguishable | **TRIGGERED at board level**, not at workspace level (§7d) |
| Content stored only in transient component state | **NOT triggered** — `padlets.content` is durable |
| Import/export would silently lose content | **PARTIAL** — content survives, Drawing placement does not (§9a) |
| Drawing and Freeform require incompatible entities | **NOT triggered** — both key off the same post row (§9) |
| Historical plans conflict with current schema | **UNKNOWN** — cannot be evaluated; archive absent (§2) |
| Proposed one-file allowlist cannot satisfy the contract | **TRIGGERED for PATCH-134** — the contract needs 4 production files, one of which is over the ceiling (§13) |

**Five of nine triggered or partially triggered. Implementation remains blocked.** None of
them is fatal to the feature; each is a specific, named thing to resolve, and four resolve
inside PATCH-134/136's own scope.

---

## 16. Next authorized action

**No implementation. No production or test edits.** In order:

1. **Supply the archive** (§2) — `PFD_Plan.rar`, a `.zip`, or an extracted directory, with a
   path. Nothing depending on it can be finalized first.
2. **Resolve the §5a content-format question** by measurement on a real board: is
   `padlets.content` for a non-clipart `card` post plain text or HTML, and who writes it?
3. **Decide the §13 PATCH-134 allowlist shape** — minimal registry addition under a recorded
   ceiling waiver, or extract the create-tool registry first.
4. **Decide the §13 PATCH-136 prerequisite** — real board-permission resolution, or a
   recorded interim on the workspace boolean.

When 1–4 are answered, PATCH-134 becomes authorizable and this patch moves to
**OPEN · ARCHITECTURE BOUNDED · NEXT PATCH AUTHORIZABLE**.

---

## 17. Status

**PATCH-133: OPEN · DIAGNOSIS INCOMPLETE · IMPLEMENTATION BLOCKED · SOURCE CENSUS COMPLETE ·
UPLOADED ARCHIVE NOT SUPPLIED · DOCUMENT MODEL CLASSIFIED AS UI-ONLY PROTOTYPE · BUTTON
OWNERSHIP PROVEN · FIVE OF NINE HARD STOPS TRIGGERED · NO IMPLEMENTATION IN THIS TURN · NOT
PUSHED.**

**PATCH-132 / 130 / 129 / 128: CLOSED — not modified or reopened. PATCH-131: OPEN · BLOCKED
— not modified.**

Commit contract for this turn: `docs(patch-133): map document post architecture`. Docs only.

---

## 18. Recorded diagnostic notes

- **A control's label is not its behavior.** "Card view" toggles nothing; it opens an editor.
  Its `active` state reads a metadata flag that no code writes. Three separate signals — the
  label, the prop name, and the dead flag — all pointed at a feature that was never
  finished. **Before governing the removal of a control, read what its callback does at
  every call site; the name is the least reliable evidence available.**
- **"Dead code" came in four flavors on one surface** (§7 of the risks): no importers, a
  `{false && …}` gate, a prop declared-and-passed-but-never-destructured, and a
  written-nowhere metadata key. The third is the dangerous one — it type-checks, it is
  passed at the call site, and it silently does nothing. **A prop that appears in an
  interface and at a call site is not proof it runs; check the destructuring.**
- **The healthiest subsystem in the architecture doc is unused where it matters most.**
  `PERMISSIONS.md` calls permissions "🟢 best subsystem" and mandates
  `resolveBoardPermission`; that function does not exist, and the board-permission API is
  called from exactly one route. **A doc's verdict on a model is not a claim about its
  adoption — census the call sites, not the exports.**
- **The census shrank two of the five proposed patches and grew one.** Export turned out to
  be already built (so it left the sequence), Drawing placement turned out to be free (so it
  left PATCH-137's core), and PATCH-136 grew a blocking permission prerequisite that the
  original decomposition did not anticipate. **This is the PATCH-132 §19k pattern repeating:
  measurement reshapes the plan, and the reshaping is only possible before implementation
  starts.**

---

## 19. Amendment — ARCHIVE REVIEW COMPLETE; THE ARCHIVE IS A DIFFERENT FEATURE (2026-08-02, CTO)

The §2 blocker is resolved. The archive was supplied, extracted and read in full.

**Headline result: the archive does not describe the Document post feature. It describes
PDF integration.** It is a coherent, technically strong, 16-patch plan for uploading PDFs,
rendering them in a modal viewer, extracting highlights, dragging highlights onto the
canvas, and linking them back to Note posts. **It contains no toolbar plan, no document
post type, no document card, no document editor/viewer split, and no reference to any of
the fifteen source-proven PATCH-133 findings.**

**Nothing in §1–§18 is retracted, and nothing in the archive contradicts it.**

### 19a. Archive path and extraction

| | |
|---|---|
| Path | `C:\Users\rmeic\Projects\dev\PFD_Plan.zip` (447,857 bytes) |
| Extracted to | `…\scratchpad\pfd_extract\` — **outside the repository** |
| Tool | `7z x` |
| Result | **Clean, complete, 30 files** |
| Repository impact | **None.** No file copied in, staged or committed. `git status` unchanged apart from this document |

**§2's tooling analysis is confirmed, and its naming guess was right.** "PFD" is a
transposition of **PDF**. The blocker really was availability, not format — the ZIP
extracted first try with the tooling that was already installed.

### 19b. File inventory (30 files, 6,552 lines of Markdown)

**Planning documents (5)**

| File | Lines | What it is |
|---|---|---|
| `task.md` | 21 | A 4-phase checklist. **Every box unticked.** |
| `implementation_plan.md` | 77 | The earliest plan — note-post extension + PDF modal + drag routing + AI synthesis |
| `implementation_plan_PDF_Document_Integration.md` | 434 | The main architecture document; competitor feature table, schema, phases |
| `implementation_plan_LLM.md` | 188 | A **rival** architecture — Markdown-in-Storage + `pgvector`, explicitly replacing the relational model |
| `review_and_improvements.md` | 125 | Technical review: 7 critical bugs, 4 architectural gaps, 5 competitor feature gaps |

**Patch drafts (16):** `patch_090.md` … `patch_105.md`, 122–694 lines each, **all marked
`Status: draft`**.

| # | Title |
|---|---|
| 090 | PDF Post Type + Domain Skeleton |
| 091 | PDF Database Schema + RLS Policies |
| 092 | Supabase Storage Buckets + RLS |
| 093 | Server-Side PDF Processor |
| 094 | PDF Upload API Route |
| 095 | PDF Viewer Modal |
| 096 | Highlight Creation (Text + Area) |
| 097 | Highlight Overlay Rendering (Coordinate Math) |
| 098 | Highlight Card Renderer + PDF Document Card |
| 099 | Drag-and-Drop Routing |
| 100 | Note Post Integration + Bidirectional Links |
| 101 | PDF Search |
| 102 | Realtime Collaboration |
| 103 | Sticky Notes, Tagging, Export |
| 104 | OCR + Readwise/Zotero Importers |
| 105 | Multi-PDF Compare, Polish, E2E Tests |

**Machine-generated (9):** `.system_generated/logs/transcript*.jsonl`,
`.system_generated/messages/*.json`, two `*.metadata.json`. Session transcripts and cursor
state. **Classification 8 — historical noise.** Not reviewed for content; they are tool
exhaust, not planning material.

### 19c. ⚠ CRITICAL — the archived patch numbers collide with real, closed Fable 5 patches

**§2.3 predicted this and was right, but understated it.** §2 reasoned that because the
repo's sequence skips 098, an archived "PATCH-098" would not be a Fable 5 patch. The truth
is worse: **all sixteen numbers are occupied, and every single one is a different piece of
work.**

| # | Archive claims | The repository's actual PATCH-### |
|---|---|---|
| 090 | PDF Post Type + Domain Skeleton | Atomic Container Child Create-and-Append |
| 091 | PDF Database Schema + RLS | Drawing-Layout Comment Persistence Diagnosis |
| 092 | Storage Buckets + RLS | Strict Drawing-Layout Comment Persistence |
| 093 | Server-Side PDF Processor | Comment EDIT UI Diagnosis (Drawing Layout) |
| 094 | PDF Upload API Route | Comment EDIT Save-Persistence Diagnosis |
| 095 | PDF Viewer Modal | Atomic Cross-Container Move: Design Contract |
| 096 | Highlight Creation | Bounded PATCH-088 Setup-Close Runner Hardening |
| 097 | Highlight Overlay Coordinate Math | Render Application-Owned AI Containers in the Slider/Player |
| **098** | Highlight Card + PDF Document Card | **DOES NOT EXIST — the repo sequence skips 098** |
| 099 | Drag-and-Drop Routing | Render Current Structured AI Content in the Runtime Slider/Player |
| 100 | Note Post Integration + Bidirectional Links | Render Synchronous Structured AI Containers in Snapshot Surfaces |
| 101 | PDF Search | Bounded Mermaid Diagram Readiness Wait |
| 102 | Realtime Collaboration | Bounded Legacy-HTML Image Readiness Wait |
| 103 | Sticky Notes, Tagging, Export | Fix Excalidraw Fractional-Index Fixtures |
| 104 | OCR + Readwise/Zotero Importers | Extract the Column-Layout Container-Creation Command Family |
| 105 | Multi-PDF Compare, Polish, E2E | Fable Harness Reliability Foundation |

**Governing rule, binding on every future turn: the archived numbers 090–105 are VOID as
identifiers.** They must never be cited, resurrected, or reused. Any future PDF work takes
**new, unoccupied numbers**. The task's standing instruction — *do not import old patch
numbers or implementation contracts directly* — is not a stylistic preference here; obeying
it is the only thing preventing sixteen collisions with closed, accepted work.

This also means the archive's drafts were **never** Fable 5 patches, despite each one
carrying a "**Fable 5 alignment:**" header line. They were authored *against* Fable 5
conventions by a model that read the docs, but they were never numbered by this governance
process and never entered `.fable5/patches/`.

### 19d. PATCH-090–105 relevance map

Files-still-exist column verified against the working tree at `c7b5a57`.

| # | Original purpose | Expected files | Still exist? | Impl. status | Conflict with current architecture | Reusable decision | Obsolete assumption | Prerequisite now required | Destination |
|---|---|---|---|---|---|---|---|---|---|
| 090 | `'pdf'` post type + `lib/domain/pdf/` skeleton, branded IDs, `pdfjs-dist` local worker | `types/collabboard.ts` ✅; `lib/domain/pdf/*` ❌; `next.config.ts` ✅ | **Type file yes, all new dirs no** | **5 — not started** | Low. Adds a union member exactly as §5d says is possible without migration | **Branded IDs; local worker over CDN; one type-surface patch before all dependents** | `pdfjs-dist` "will be installed" — **it is not a dependency** | Add the dep; renumber | Pattern → PATCH-137; feature → new PDF patch |
| 091 | `pdf_documents`, `pdf_pages`, `pdf_highlights`, `note_post_links` + RLS | 4 new tables | **None exist** | **5 — not started** | **HIGH — see §19f.** `pdf_documents` RLS is owner-only | Timestamped migrations; RLS in the same migration; GIN indexes | That owner-only RLS suits a collaborative board | Board-scoped RLS rewrite | New PDF patch only |
| 092 | Storage buckets `pdfs`, `pdf-thumbnails` + RLS | 2 buckets | **Unverified — not checked live** | **5 — not started** | Low | Buckets before the upload route | — | Bucket audit | New PDF patch |
| 093 | Server-side processor, thumbnails, TOC/scan detection | `lib/infra/pdf/processor.ts` ❌ | No | **5 — not started** | Medium — needs the `canvas` npm package (native build) | `Result<T, DomainError>`; thin domain command wrapping infra | Original used a **fictional** `pdfjsLib.createCanvas()` (BUG-5) | `canvas` dep + native toolchain | New PDF patch |
| 094 | `app/api/pdf/upload/route.ts` | ❌ | No | **5 — not started** | Low | **zod on every input; domain commands instead of direct Supabase in routes; explicit `runtime='nodejs'`** | — | 090–093 | Pattern → PATCH-137 |
| 095 | Modal PDF viewer + subcomponents | `components/pdf/*` ❌ | No | **5 — not started** | **HIGH — mandates TanStack Query hooks; `@tanstack/react-query` is NOT a dependency** (only `react-table`) | **Modal over split-pane; no `fetch()` in components; split to respect the 400-line ceiling** | That a query library is present | Add the dep or pick another pattern | Modal shell pattern → PATCH-136 |
| 096 | Text + area highlight creation | ❌ | No | **5 — not started** | Low | `getClientRects()` per line, not one merged rect | — | 095 | New PDF patch |
| 097 | Overlay coordinate math | documentation-only | n/a | **5 — not started** | None | **PDF→CSS Y-flip and stored per-page dimensions; a doc-only patch for subtle math** | Hardcoded A4 `792×1122` — wrong twice over (A4 is 595×842) | — | Method → keep |
| **098** | Highlight card + **PDF document card** | `components/pdf/PdfDocumentCard.tsx` ❌; `CardShell` ✅ (`components/collabboard/shells/CardShell.tsx`) | Shell yes, cards no | **5 — not started** | Medium — **this is the archive's closest touch to PATCH-135** | **Card = thumbnail + filename + page count + click-to-open; backlink count on the card face; `post.*` naming in new code with an adapter comment at the legacy `CardShell.padletId` boundary** | Assumes a `'pdf'` type exists | Renumber; 090 | **Card grammar → PATCH-135** |
| 099 | Drag-and-drop routing, freeform vs structured | `useCanvasInteractions.ts` ✅, `PlacementPrompt.tsx` ✅, `usePadletSave.ts` ✅ | **All three exist** | **5 — not started** | Low — the surfaces it names are real | **Freeform drops directly; structured layouts interrupt with the placement prompt; strangler — add a `case`, don't rename the hook** | Calls `createPost()` "or the correct name — verify before implementing" | Verify the real function | Placement grammar → PATCH-137 |
| 100 | Note-post embedding + bidirectional links (`note_post_links`) | `NoteEditor.tsx` ✅; table ❌ | Editor yes, links no | **5 — not started** | Medium | **Backlinks as a first-class table, not a metadata array; a "Sources" panel separate from embedded content** | Original used `VueNodeViewRenderer` **in a React app** (BUG-6) | Renumber; entity/placement decision | **Link model → PATCH-138** |
| 101 | Full-text PDF search | ❌ | No | **5 — not started** | Low | Repository class over `.from()` in routes; GIN over `ilike` | — | 091 | Search → PATCH-138 |
| 102 | Realtime highlight sync | ❌ | No | **5 — not started** | Low | **CRITICAL security fix recorded: never `getSupabaseAdmin()` in a client hook; anon key + RLS** | — | 091 | **Rule → keep repo-wide** |
| 103 | Sticky notes, tagging, **export** | ❌ | No | **5 — not started** | Medium — **a third export implementation** (§8 already has two) | Convert coordinates before the component; zod on export inputs | Export is Markdown-only, highlights-only, **auth-checked but not permission-checked** | Designate the surviving exporter | Export patch (still unnumbered) |
| 104 | OCR + Readwise/Zotero importers | ❌ | No | **5 — not started** | Low | **Dependency inversion: domain owns the interface, infra implements** | — | 091 | Pattern → keep |
| 105 | Multi-PDF compare, polish, E2E | `ActionRegistry.ts` ✅ | Registry yes | **5 — not started** | Low | **Keyboard shortcuts via `ActionRegistry`, never raw `addEventListener`; E2E in `e2e/characterization/`** | — | everything above | **Shortcut rule → PATCH-134** |

**Implementation status, summarized: 16 of 16 are classification 5 — never started.** Zero
of the proposed new directories (`lib/domain/pdf/`, `hooks/pdf/`, `components/pdf/`) exist.
Zero of the four proposed tables exist. Zero of `pdfjs-dist`, `react-pdf`, `canvas`,
`@tanstack/react-query`, or any OCR package is in `package.json`.

**The archive is a plan that was written, reviewed, revised — and never executed.**

### 19e. Reconciliation against the fifteen source-proven findings — **the archive is silent on all fifteen**

The task required each PATCH-133 finding be reconciled against the archive. A full-text
search of all 21 Markdown files for every term returned **zero matches on every one**:

`Card view` · `showCardView` · `CardActionsToolbar` · `CardEditor` · `CardPreview` ·
`ClipartCardDraftModal` · `DraggableToolbar` · `toolbarGroups` · `CanvasClient` ·
`wordCount` · `word count` · `document post` · `'document'` · `canEditWorkspace` ·
`canUseFreeformEditButton` — **all 0 files.**

| # | PATCH-133 finding | Archive position |
|---|---|---|
| 1 | "Card view" is a mislabeled `CardEditor` opener | **Silent** |
| 2 | `metadata.showCardView` read, never written | **Silent** |
| 3 | Freeform and Clipart call sites differ in ownership | **Silent** |
| 4 | The `CardPreview` viewer path is unreachable | **Silent** |
| 5 | No document table | **Silent** — proposes PDF tables, not a document table |
| 6 | No document post type | **Partially adjacent** — proposes `'pdf'`, never `'document'` |
| 7 | `type='card'` overloaded for clipart/document | **Silent** |
| 8 | `padlets.type` accepts a new value without migration | **Implicitly agrees** — 090 adds `'pdf'` with no migration |
| 9 | `padlets.board_id` blocks multi-board reuse | **Implicitly agrees** — `pdf_documents.board_id` is likewise single (§19g) |
| 10 | Word-count implementations disagree | **Silent** |
| 11 | Board permissions don't reach canvas surfaces | **Silent, and assumes otherwise** (§19f) |
| 12 | Read-only mode still mounts mutation behavior | **Silent, and would repeat the mistake** (§19f) |
| 13 | Export exists for AI-component posts only | **Silent** — proposes a third exporter unaware of the first two |
| 14 | `CanvasClient.tsx` must not grow un-decided | **Silent** — never names the file |
| 15 | `DraggableToolbar.tsx` is dead code | **Silent** |

**Classification: no conflict, and no corroboration.** The task's instruction — *do not
overwrite current source findings merely because an older plan differs* — never had to be
exercised. **The archive cannot overwrite findings it never addresses.** All fifteen stand
exactly as recorded, on source evidence alone.

This is the single most useful outcome of the review, and it is a negative result: **the
historical plans do not contain a document-post design.** Anyone hoping the archive would
shorten PATCH-134 should stop hoping.

### 19f. Permissions — the archive is **unsafe on three of four** questions, and internally inconsistent

The task named four specific assumptions to look for.

| Assumption | Archive position | Verdict |
|---|---|---|
| Board-level reader/editor roles already reach the canvas | **Never considered.** No archive file mentions any canvas permission symbol | **Unsafe by omission** |
| Viewer mode may reuse the editable component | Not addressed — **no viewer/editor split is proposed anywhere** | **Unsafe by omission** |
| Hiding controls is sufficient authorization | **Yes, explicitly.** `implementation_plan_PDF_Document_Integration.md:271` — "**No edit pencil for read-only users**" is the *entire* read-only design | **UNSAFE — CONFIRMED** |
| Export follows edit permission automatically | **Worse.** The export route (`patch_103.md:157`) checks only that a user is *authenticated*, then relies on owner-only RLS. No permission tier is consulted | **UNSAFE — CONFIRMED** |

**"No edit pencil for read-only users" is precisely the failure mode PATCH-133 §6b rejected
on source evidence.** The current `CardEditor` hides its toolbar and footer in read-only
mode and still mounts `onSave`, still binds it to the backdrop click. The archive proposes
the same shape for a new surface. **Current source evidence takes precedence, as the task
directs: §6b's structure B — mutation props absent from the viewer's type — stands, and the
archive strengthens rather than weakens the case for it, by showing the mistake being made
independently a second time.**

**A genuine internal inconsistency in the archive, recorded precisely rather than
flattened:** its RLS is not uniformly owner-only.

- `pdf_documents` / `pdf_pages` / `pdf_highlights` (`patch_091.md:196-231`) —
  `auth.uid() = user_id`. **Owner-only.** A PDF uploaded by one board editor would be
  invisible to every collaborator on that board.
- `note_post_links` (`patch_091.md:283-313`) — joins `boards` and `board_members`.
  **Board-scoped, and correct in shape.**

So the archive knew how to write board-scoped RLS and did it for one table out of four.
**On a collaborative board product, owner-only RLS for shared content is a design defect,
not a conservative default** — it silently converts a shared artifact into a private one.
Any future PDF patch must rewrite the first three policies to the board-scoped form the
fourth already demonstrates.

**Reusable and worth keeping:** `patch_102.md`'s CRITICAL fix — `getSupabaseAdmin()` (the
service-role key) must never appear inside a React hook, because it lands in the browser
bundle. That is a correct, general, repo-wide security rule and the strongest single
contribution in the archive.

### 19g. Document entity model — what the archive actually proposed

| Asked | Archive proposal | Against the current single-`board_id` model |
|---|---|---|
| A separate documents table | **No document table.** Four *PDF* tables (`pdf_documents`, `pdf_pages`, `pdf_highlights`, `note_post_links`) | Compatible in shape; irrelevant to documents |
| A new padlet type | **`'pdf'`**, appended to the same union PATCH-133 §5d examined — never `'document'` | **Compatible** — confirms §5d from an independent direction |
| Content stored in metadata | Partially — `extracted_highlights`, `source_pdf_id`, `pdf_highlight_id` in post metadata | Compatible; the metadata-absorbs-features pattern DATABASE.md already flags |
| Rich-text JSON | **Yes, indirectly** — TipTap node embedding in Note posts (`patch_100.md`) | Compatible; TipTap is already a dependency |
| HTML | Not proposed | Leaves §5a's HTML-vs-plain-text question **unanswered** |
| Markdown | **Yes, twice** — as export output (`patch_103`) and, in the rival LLM plan, as the *primary storage format* in Supabase Storage | The LLM variant conflicts with everything else |
| Independent entities + board placements | **No.** `pdf_documents.board_id` is a plain single FK (`patch_091.md:75`) | **Agrees with §5c** |
| Multi-board reuse | **Never proposed anywhere in the archive** | — |

**Two findings follow.**

1. **The archive independently arrives at single-board ownership.** It had a clean
   opportunity to propose a placements table for `pdf_documents` and did not. §5c's
   conclusion — multi-board reuse is not supported and must not be attempted now — is
   therefore **reinforced from two directions**. The task's rule, *do not authorize
   multi-board reuse from historical plans alone*, is satisfied trivially: **the historical
   plans do not propose it.**
2. **The archive contains two mutually incompatible data models for the same feature.**
   `implementation_plan_PDF_Document_Integration.md` + patches 090–105 specify relational
   tables. `implementation_plan_LLM.md` explicitly proposes to "**replace complex relational
   tables (`pdf_pages`, `pdf_highlights`)**" with Markdown files in Storage plus a
   `pgvector` index. **Both are present, neither is marked superseded, and the patch drafts
   silently implement only the first.** Anyone reading the archive front-to-back could
   implement either and believe it was the plan. Classification **8 — historical noise —
   applies to the LLM variant until its author says otherwise**, but its existence means
   *no* archive proposal may be cited as "the plan" without naming the file it came from.

### 19h. Scrintal — the four categories kept strictly separate

**§12's deliberately empty "verified Scrintal behavior" column stays empty.** The archive
mentions Scrintal 19 times, and the task explicitly warned against treating that as
verification. It is not.

| Category | Content |
|---|---|
| **Historical archive proposals** | Bidirectional highlight↔note links (P0); backlink count on the card face; a "Sources"/backlinks panel on Note posts; page-thumbnail strip; note embedding as live reference rather than copy; "Combine Blocks into Docs" (P3); PDF embedded inside a Note post (P2) |
| **Current user requirements** (from the PATCH-133 brief) | Links, backlinks, reusable documents, archive/search, multiple board appearances — all explicitly deferred |
| **Current repository support** | **None of it.** No links table, no backlink index, no search index, no archive |
| **Future architecture** | PATCH-138, still not authorizable |
| **Verified external Scrintal behavior** | **EMPTY.** No Scrintal product was inspected by this diagnosis or, on the available evidence, by the archive's author |

`review_and_improvements.md:4` says "**Reviewed against:** Heptabase, Scrintal PDF/Document
feature sets", and `implementation_plan_PDF_Document_Integration.md:40` says features "were
discovered through research of Scrintal, Heptabase, Logseq, Obsidian, LiquidText,
MarginNote, Readwise, Zotero". **Those are claims of research, not citations of it** — no
URL, version, date, or screenshot appears anywhere in the archive. A second model asserting
a competitor's behavior is not verification; **it is the same unverified claim with one more
hop of provenance.** Recorded because promoting it would be the easiest and most invisible
way to manufacture evidence in this entire review.

### 19i. Strongest conflicts with current repository truth

1. **Sixteen patch-number collisions** with closed, accepted work (§19c). The most damaging
   error available in this material, and the easiest to make.
2. **Owner-only RLS on shared board content** (§19f) — three of four tables.
3. **"No edit pencil for read-only users"** as a complete authorization design (§19f) —
   independently repeating the defect §6b rejected.
4. **Export with no permission tier** (§19f), proposing a **third** export implementation
   into a repo that already has two (§8) — a direct P6 breach.
5. **Two rival data models in one archive** (§19g).
6. **Four missing dependencies presented as present** — `pdfjs-dist`, `react-pdf`, `canvas`,
   `@tanstack/react-query`. `task.md` even records "*npm install failed due to excalidraw
   versioning, but code assumes it's present*" — **an acknowledged unmet prerequisite
   carried forward as an assumption.** The vendored Excalidraw fork that blocked that
   install is still vendored.

### 19j. Reusable architecture — what genuinely survives

Retained as **method**, never as authorization, and never under its old number:

- **One type-surface patch before all dependents** (090) — every later patch compiles
  against a single agreed surface. Directly applicable to PATCH-134→137.
- **`Result<T, DomainError>` + thin domain commands wrapping infra** (093, 094, 104).
- **zod on every route input; no direct `.from()` in routes; repositories own queries**
  (094, 101).
- **Never `getSupabaseAdmin()` in a client hook** (102) — the archive's best contribution.
- **Dependency inversion: domain declares the interface, infra implements** (104).
- **Strangler discipline stated concretely** (098, 099) — new code uses `post.*`; legacy
  props like `CardShell.padletId` are *not* renamed; new behavior arrives as a `case` in the
  existing hook. This matches repo rule 9 and is directly reusable by PATCH-135.
- **Keyboard shortcuts through `ActionRegistry`, never raw `addEventListener`** (105) —
  `lib/collabboard/ActionRegistry.ts` exists. **Promoted into PATCH-134:** §11a recorded
  that no tool has a shortcut today; if one is ever added, this is the mechanism.
- **A documentation-only patch for subtle math** (097) — a legitimate governance shape.
- **The card grammar** (098): thumbnail/icon + name + count + click-to-open, with a
  live-fetched badge on the card face. **The nearest thing in the archive to a document card
  spec, and it corroborates §11b's independently derived contract.**
- **Modal over split-pane** — the archive reversed its own source article's side-by-side
  design in favor of a modal, matching the user's request and §11c.

### 19k. Superseded, unsafe, and noise

- **Superseded (4):** the whole of `implementation_plan.md` by
  `implementation_plan_PDF_Document_Integration.md`; the original pre-review patch bodies by
  the `review_and_improvements.md` rewrites; the CDN worker by the local worker (GAP-2); the
  side-by-side viewer by the modal.
- **Unsafe without prerequisites (6):** every patch depending on the four absent
  dependencies; 091's owner-only RLS; 093's native `canvas` build; 095's TanStack Query
  assumption; 103's ungated export; 102's realtime, which depends on 091's schema.
- **Historical noise (8):** the nine `.system_generated/*` files; the `implementation_plan_LLM.md`
  rival model until explicitly revived; `implementation_plan.md`'s open questions, which its
  own successor already answered.

### 19l. Revised patch sequence

**The §13 sequence is confirmed and unchanged in shape.** The archive supplies no evidence
to move a boundary, because it addresses a different feature. Three refinements, each
justified by archive evidence rather than by preference:

| Patch | Change | Justification |
|---|---|---|
| **PATCH-134** | Unchanged scope. **Add:** if any keyboard shortcut is introduced, it registers through `ActionRegistry` | Archive 105; `ActionRegistry.ts` verified present |
| **PATCH-135** | Unchanged scope. **Add:** adopt the 098 card grammar and its strangler naming rule — new code uses `post.*`, the legacy `CardShell.padletId` boundary gets an adapter comment and is **not** renamed | Archive 098; corroborates §11b; matches repo rule 9 |
| **PATCH-136** | Unchanged, and its blocking prerequisite is **reinforced**. Two independent designs have now proposed hiding controls as the whole of read-only authorization | §19f |
| **PATCH-137** | Unchanged. **Add** to its required first measurements: the §5a HTML-vs-plain-text question is **not** answered by the archive | §19g |
| **PATCH-138** | Unchanged — still **not authorizable**. The archive's `note_post_links` shape is recorded as a **candidate** link model (a real table with board-scoped RLS, plus a panel listing links independently of embedded content), not as authorization | Archive 100, 101 |

**PDF integration is NOT part of this sequence.** It is a separate feature with its own
dependencies, its own storage, its own security review, and its own numbers — **new,
unoccupied ones**. Folding it into the document sequence would repeat exactly the mistake
§13 avoided when it removed export.

### 19m. Remaining hard stops

| Hard stop | Movement |
|---|---|
| Historical plans conflict with current schema | **RESOLVED → they do not, because they never address documents** (§19e). The PDF-specific conflicts in §19i belong to a future PDF patch, not to PATCH-134–137 |
| Document body format unclear (§5a) | **UNCHANGED — still open.** The archive does not answer it |
| Existing button has multiple responsibilities (§4) | **UNCHANGED** — archive silent |
| Permission enforcement only in presentation code (§7) | **UNCHANGED, evidence strengthened** (§19f) |
| Viewer/editor indistinguishable at board level (§7) | **UNCHANGED** |
| One-file allowlist cannot satisfy PATCH-134 (§13) | **UNCHANGED** — the `CanvasClient.tsx` ceiling decision is still owed |
| Import/export loses Drawing placement (§9a) | **UNCHANGED** |

**One of nine hard stops resolved; six unchanged; two were never triggered.** The resolved
one was the only one the archive could have touched.

### 19n. Can PATCH-134 be authored?

**Not yet — and the reason has narrowed to two decisions, neither of which needs more
research.**

Both are owner/architecture calls, not diagnostics:

1. **The `CanvasClient.tsx` ceiling decision** (§13, §15). The file is 8,526 lines; repo
   rule 3 forbids growing it; the tool registry lives inside it. Either a recorded ceiling
   waiver for a minimal registry addition, **or** extract the create-tool registry first as
   its own patch. **Until this is decided, PATCH-134's production allowlist cannot be
   granted** — PATCH-129 §15b is the standing lesson against granting an allowlist the
   authorized shape cannot satisfy.
2. **The `ClipartCardDraftModal.test.tsx` label-assertion change** (§4f) must be explicitly
   named in PATCH-134's test allowlist, because it is closed-patch evidence.

Everything else PATCH-134 needs is now on record. **The §16 next-action list shortens from
four items to two: items 1 (supply the archive) and 2 (the content-format question) are
resolved and deferred respectively** — item 2 belongs to PATCH-137, not PATCH-134, and does
not block toolbar work.

**When 1 and 2 above are decided, PATCH-134 is authorable in the same turn.**

### 19o. Status

**PATCH-133: OPEN · ARCHIVE REVIEW COMPLETE · SOURCE CENSUS COMPLETE · ARCHITECTURE
DECISIONS REQUIRED · IMPLEMENTATION BLOCKED · ARCHIVE IS A PDF-INTEGRATION PLAN, NOT A
DOCUMENT-POST PLAN · ARCHIVED PATCH NUMBERS 090–105 VOID AS IDENTIFIERS · ZERO ARCHIVE
PROPOSALS IMPLEMENTED · NO CONFLICT WITH THE FIFTEEN SOURCE-PROVEN FINDINGS · NOT PUSHED.**

**PATCH-132 / 130 / 129 / 128: CLOSED — not modified or reopened. PATCH-131: OPEN · BLOCKED
— not modified.** Snapshot branch `snapshot/pre-document-architecture-2026-08-02` and tag
`pre-document-architecture-2026-08-02` both remain at `c0fa799` — **not modified.**

### 19p. Recorded diagnostic notes

- **A supplied archive's most valuable finding can be that it is about something else.**
  The review was scoped to reconcile historical document plans against current source; the
  reconciliation table came back silent on all fifteen points because "PFD" was "PDF" and
  the material describes a different feature. **A negative result, stated plainly, is worth
  more than a strained mapping** — the alternative was to force PDF-highlight architecture
  onto a document-post patch and call it continuity.
- **Numbered artifacts from outside the governance process are a collision hazard, and the
  collision is silent.** Sixteen drafts each carried a "Fable 5 alignment" header and each
  claimed a number belonging to closed, accepted work. Nothing in the files themselves
  reveals the conflict; only checking the numbers against the real patch directory does.
  **Verify identifiers against the registry before reading content — provenance first,
  substance second.**
- **The same authorization mistake was made twice, independently.** `CardEditor`'s read-only
  mode hides controls and keeps the mutation path; the archive proposes "no edit pencil for
  read-only users" for a new surface. Two designs, two authors, one failure mode.
  **That is evidence the mistake is attractive, not that it is acceptable** — and it is the
  strongest argument yet for §6b's type-level split, where the unsafe version does not
  compile.
- **An archive can disagree with itself.** Two rival data models sit side by side with
  neither marked superseded, and one acknowledged unmet prerequisite ("npm install failed …
  but code assumes it's present") is carried forward as an assumption. **Cite the file, never
  "the archive"** — and treat a failed prerequisite recorded in a checklist as a blocker that
  survived into the plan, not as a footnote.
