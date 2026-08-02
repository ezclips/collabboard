# PATCH-134 — Main-toolbar Document creation + bounded create-tool registry extraction

**Status: OPEN · ARCHITECTURE BOUNDED · NARROW IMPLEMENTATION AUTHORIZED (SCOPES A, B, D, E)
· SCOPE C BLOCKED BY A TRIGGERED HARD STOP**

**Governance only. No production or test file was modified in this patch. Nothing pushed.**

Authored 2026-08-02 (CTO). HEAD at authoring: `b851cde`
(`docs(patch-133): incorporate document plan archive`).

Predecessor: PATCH-133 (source census §1–§18, archive review §19).
Snapshot checkpoint `snapshot/pre-document-architecture-2026-08-02` / tag
`pre-document-architecture-2026-08-02` → `c0fa799`. **Not modified by this patch.**

Five unrelated pending paths remain **protected** and untouched: `.gitignore`, the three
`app/api/ai/*` routes, `scripts/live-access-login.mjs`.

---

## 0. Two corrections before anything else

### 0a. The authorized test path does not exist as given

The owner decision names `components/canvas/ClipartCardDraftModal.test.tsx`. **That file
does not exist.** The real path is:

```
components/collabboard/ClipartCardDraftModal.test.tsx
```

The intent is unambiguous — it is the spec asserting the exact live toolbar-label list
(`:417`) — so the allowlist in §9 uses the real path. Recorded rather than silently
substituted, because an allowlist that names a nonexistent file cannot be enforced.

### 0b. ⚠ PATCH-133 §4d is WRONG for Freeform, and this changes the work

PATCH-133 §4d recorded that removing the canvas card toolbar's "Card view" entry "orphans
nothing", because `openPadletInTypeEditor` (`CanvasClient.tsx:5795`) provides a second path
to the same modal. The owner decision restates that as current source truth: *"live Freeform
call site is redundant because the same editor can be opened through the existing
canvas/context path."*

**Source now proves otherwise for the Freeform layout.** §7 has the full chain. In short: a
`type: 'card'` post in Freeform renders through an **exclusive** branch
(`FreeformPadletCards.tsx:1706`) wrapped in `NotePostContextMenu`, which is passed **no
edit/open callback and contains no Edit item** — only cut/copy/duplicate/synced-copy/delete/
group/lock/layer-order. `FreeformPadletCards` never receives or calls
`openPadletInTypeEditor`, and `DrawingLayout` does not render `FreeformPadletCards`.

§4d generalized from the existence of `openPadletInTypeEditor` in `CanvasClient` without
checking that Freeform never wires it for card posts. **The "Card view" button is the only
opener of the edit-mode `CardEditor` for a Freeform card post.** Scope C's own hard stop —
*"removing the live Card view entry removes the only editor opener in that context"* — is
therefore **TRIGGERED**, and §8 blocks that removal and re-sequences it.

Scopes A, B, D and E are unaffected and remain fully bounded.

---

## 1. Subject and authorized outcome

| Scope | Outcome | Verdict |
|---|---|---|
| **A** | Extract the create-tool registry out of `CanvasClient.tsx` | **AUTHORIZED** |
| **B** | Add a first-class **Document** entry to the main canvas toolbar | **AUTHORIZED** |
| **C** | Remove the misleading "Card view" entry from the live canvas card toolbar | **BLOCKED** — §0b, §7, §8 |
| **D** | `ClipartCardDraftModal` keeps its editor opener, unchanged | **AUTHORIZED (no-op by construction)** |
| **E** | Keyboard shortcut policy | **AUTHORIZED: no shortcut** — §6 |

No canvas-card redesign. No editor/read-only modal split. No new post type, table, or
persistence model.

---

## 2. Current source truth — preserved and re-verified at `b851cde`

Every item the owner listed, re-checked against source rather than carried forward:

| Claim | Status |
|---|---|
| `CardActionsToolbar` label "Card view" uses `LayoutGrid` and `onToggleCardView` | **CONFIRMED** — `CardActionsToolbar.tsx:77-82` |
| `onToggleCardView` actually opens `CardEditor` | **CONFIRMED** — `FreeformPadletCards.tsx:6008-6012`; `ClipartCardDraftModal.tsx:194-196` |
| `metadata.showCardView` is read but never written | **CONFIRMED** — 4 reads, 0 writes; declared `types/collabboard.ts:203` |
| The live Freeform call site is redundant | **REFUTED — see §0b/§7** |
| `ClipartCardDraftModal`'s call site is not redundant and writes through `onChange` | **CONFIRMED** — `ClipartCardDraftModal.tsx:427-440` |
| `{false && …}` block is not a user-facing path | **CONFIRMED** — `FreeformPadletCards.tsx:1785` |
| `type='card'` is overloaded for clipart and document-like cards | **CONFIRMED** — `CanvasClient.tsx:5794-5795` |
| No document table, no document post type | **CONFIRMED** |
| `CardPreview` viewer remains unreachable — out of scope | **CONFIRMED** — `onEditContent` never destructured (`CardPreview.tsx:19-27`) |
| Board-level permission resolution unresolved — out of scope | **CONFIRMED** — `resolveBoardPermission` does not exist |
| Multi-board reuse unsupported — out of scope | **CONFIRMED** — single `padlets.board_id` |

---

## 3. Scope A — the extraction boundary, proven

### 3a. Exact extraction unit

| Item | Location | Lines |
|---|---|---|
| `GraphLineToolIcon` — local SVG, used **only** by the registry | `CanvasClient.tsx:174-186` | 13 |
| `MapPinToolbarIcon` — local SVG, used **only** by the registry | `CanvasClient.tsx:188-196` | 9 |
| `canvasSpecificTools` | `CanvasClient.tsx:5357-5367` | 11 |
| `toolbarGroups` | `CanvasClient.tsx:5369-5442` | 74 |
| | **Total moved** | **≈ 107** |

Verified single-use of both icon components: `GraphLineToolIcon` appears exactly twice in
the file (declaration + registry), `MapPinToolbarIcon` likewise.

### 3b. Why this boundary is clean — **the registry is already 100 % declarative**

The decisive fact: **`toolbarGroups` contains no callbacks.** Every entry is
`{ icon, label, color, bg, type }` plus optional `disabled` / `hint`; groups add
`id`, `label`, `priority`, `alwaysVisible`. Behavior is bound entirely downstream —
`CanvasSidebar` receives `handleToolClick: (type: string) => void` as a **separate prop**
(`CanvasSidebar.tsx:32`) and dispatches by the `type` string.

**Therefore the extraction moves zero command ownership, zero persistence, zero placement
logic, zero modal state and zero Supabase access.** The hard stop *"registry extraction
requires moving command ownership"* is **NOT triggered** — it cannot be, because none is
present in the moved code.

### 3c. The type contract already exists

`CanvasSidebar.tsx:5-23` already exports `SidebarToolItem` and `SidebarToolGroup`. The
extracted module **imports and returns those existing types**. No new type surface, no
duplicated shape, no P6 breach.

### 3d. Authorized shape

One new file, one pure function, no React state, no hooks:

```
components/collabboard/canvas/ui/canvasToolbarRegistry.tsx
```

```ts
export type CanvasToolbarFlags = {
  isMapLayout: boolean;
  isFreeformLayout: boolean;
  isFreeformGraphMode: boolean;
  isTimelineLayout: boolean;
  chronoMode: ChronoMode | string;
  canManageCanvasShare: boolean;
  canUseFreeformEditButton: boolean;
};

export function buildCanvasToolbarGroups(flags: CanvasToolbarFlags): SidebarToolGroup[]
```

`.tsx`, not `.ts`, because the two local SVG icon components move with it.

`CanvasClient` then holds one call:
`const toolbarGroups = buildCanvasToolbarGroups({ … });`

**Exactly the inputs above — verified as the complete set of free variables** in the moved
code: `isMapLayout`, `isFreeformLayout`, `isFreeformGraphMode`, `isTimelineLayout`,
`chronoMode`, `canManageCanvasShare`, `canUseFreeformEditButton`. Nothing else is read.

### 3e. Consumer census — **exactly one consumer**

`toolbarGroups` is referenced twice in the entire repository: its declaration
(`CanvasClient.tsx:5369`) and its single use (`CanvasClient.tsx:5877`, `groups={toolbarGroups}`).
`canvasSpecificTools` is referenced twice: declaration and `toolbarGroups`. **No other file
imports either.**

**Decoy warning, carried from PATCH-133 §11a:** `components/DraggableToolbar.tsx` (223 lines)
contains a plausible-looking tool registry and has **zero importers**. It is dead code. It
is **not** the extraction target, must **not** be edited, extended, or used as the new
registry's home, and must **not** be deleted in this patch (deletion is unrelated cleanup).

### 3f. Line-count contract

`CanvasClient.tsx` is **8,436 lines** at `b851cde`. The extraction removes ≈ 107 lines and
adds ≈ 8 (one import + one call). Twelve lucide icons become unused in `CanvasClient`
(`Sparkles`, `StickyNote`, `CheckSquare`, `MessageCircle`, `BookOpen`, `ImageIcon`,
`CloudDownload`, `UserPlus`, `MoveRight`, `Columns3`, `MapIcon`, plus `Table`/`Upload`/
`PenTool`/`Settings`/`Link` which have other uses and **must stay**).

**Binding requirement: `CanvasClient.tsx` must be strictly shorter after this patch than
before — a net reduction of at least 90 lines.** The implementer reports the before/after
count. The hard stop *"CanvasClient line count increases materially"* is converted into a
measured gate, which is the whole point of refusing the growth waiver.

**Unused-import removal is authorized only for imports the extraction actually orphans**,
proven by grep. Removing any other import is out of scope.

---

## 4. Scope B — Document creation command ownership

### 4a. The command exists. No new one is authorized.

`saveCard` — declared `hooks/canvas/usePadletSave.ts:973-1069`, consumed at
`CanvasClient.tsx:7479`. It fully supports creation from a draft:

| Path | Behavior | Line |
|---|---|---|
| `padletToEdit.id === 'new'` | insert branch | `:978` |
| **Freeform** | places directly via `getNewPostPosition(180, 220)`, inserts `type: 'card'`, 180×220 | `:982`, `:993-1010` |
| **Drawing** | `checkPlacementRequired` → `onDrawingPlacementStart(draft)` → the real Drawing placement flow, editor closed, save returns early | `:983-989` → `usePadletSave.ts:290-301` |
| Wall / Columns / Grid | `checkGridPlacementRequired` → placement prompt | `:304-311` |
| Timeline / Scheduler | ghost-container / time-slot placement | `:321-333` |
| Container child | `metadata.parentId` → insert **and** append to the container's `childPadletIds` | `:1013-1032` |
| Existing post | update branch | `:1033-1043` |

**`PendingPostDraft.kind` already includes `'card'`** (`types/collabboard.ts:318`) — the
placement pipeline supports card drafts end-to-end today, with no type change.

**Hard stop *"no safe existing document-like creation command exists"* — NOT triggered.**
`saveCard` is the selected command. **Do not write a new creation command, and do not
improvise creation through UI state.**

### 4b. Authorized `handleToolClick` arm

Follows the existing modal-first pattern used by `note`/`link`/`todo`/`table`
(`CanvasClient.tsx:5492-5570`) exactly — build an unsaved draft, open the editor, let
`saveCard` persist:

```
case 'document':
  closeDrawingSelectedShapePanel();
  closeAllToolbarLaunchedUi();
  setPadletToEdit({
    id: 'new', board_id: canvasId,
    title: '', content: '', type: 'card',
    position_x: 0, position_y: 0, width: 180, height: 220,
    created_at: …, updated_at: …,
    metadata: { ...createMetadata },
  });
  setIsCardEditorOpen(true);
  break;
```

`width`/`height` are **180 × 220 to match `saveCard`'s own insert**, not the 280 × 250 the
note/link/todo arms use — otherwise the draft and the persisted row disagree. This is a
deliberate deviation from the sibling arms and must not be "corrected" to 280 × 250.

`type: 'card'` and **no `svgUrl`** is what makes it document-like rather than clipart, per
the §3b overload in PATCH-133. **No `'document'` type is introduced in this patch.**

### 4c. Tool definition

| Property | Value | Reason |
|---|---|---|
| `type` (stable ID) | `"document"` | The `type` string *is* the stable ID in this registry; it must not collide with the post type |
| `label` | `"Document"` | |
| `icon` | `FileText` (lucide) | Already the document glyph in `CardEditor.tsx:118`; visually distinct from `StickyNote` (Note) and `Table` |
| `color` / `bg` | `text-sky-700` / `hover:bg-sky-50` | Unused by any existing create tool |
| Group | `create` (Group 2) | |
| Order | **immediately after `Note`** — AI · Note · **Document** · To-do · Comment · Table | Note is its nearest neighbor conceptually; AI stays first per the existing comment; every other tool keeps its relative order |
| Tooltip | the `label` | The registry has no separate tooltip field; `CanvasSidebar` renders `label` |
| Visibility | inherited — the whole sidebar is gated by `canUseCanvasToolbar` (`CanvasClient.tsx:282`, `:5871`) | **No new permission predicate.** Workspace-level gate only, per the owner's out-of-scope ruling |
| Mobile / overflow | inherited — group `priority: 2`, `alwaysVisible: true` | Adding a 6th tool to Group 2 changes `GROUP_H` by 44 px in `CanvasSidebar`'s collapse arithmetic (`CanvasSidebar.tsx:37`); the group is `alwaysVisible`, so it is never collapsed, but the **overall fit must be verified at a small viewport** |

### 4d. Governed risk — dismissal creates an empty card

`CardEditor`'s backdrop `onClick` is wired to `handleSave` (`CardEditor.tsx:78`), and the X
button likewise (`:124`). For a draft with `id === 'new'`, **clicking away from the modal
will call `saveCard` and insert an empty card.**

**This must be measured before the patch is accepted, not assumed.** The implementer reports
what actually happens when the Document tool is clicked and the modal is dismissed without
typing. If an empty post is created:

- **Authorized fix (narrow):** in the `id === 'new'` branch only, skip the insert when title,
  content and description are all empty, and close without persisting.
- **Not authorized:** changing `CardEditor`'s close/save wiring for existing posts, adding a
  dirty-state system, or altering any sibling save command.

This is P3 territory (never surprise the user with content they did not create), and it is
the one behavioral risk the modal-first pattern introduces.

---

## 5. Scope D — Clipart draft modal preservation

**No change. Not on the production allowlist.**

`ClipartCardDraftModal.tsx:194-196` (`onToggleCardView` → `setIsCardViewOpen(true)`) and its
`CardEditor` at `:427-440` (writing back through `onChange`) are preserved **by not being
touched**. Because Scope C is blocked (§8), `CardActionsToolbar` is not modified either, so
the clipart toolbar keeps the "Card view" entry with identical behavior.

The label stays **"Card view"** in this patch. Renaming it to something accurate (e.g. "Open
editor") would change a label asserted by a closed-patch test and affects the canvas toolbar
too; per the owner's instruction, that is **recorded for a later patch**, together with the
Scope C removal (§8).

---

## 6. Scope E — ActionRegistry decision: **NO SHORTCUT**

`lib/collabboard/ActionRegistry.ts` (74 lines) exists and is real. Its `RegisteredAction`
type declares `shortcut?: string` (`:45`) and its `ActionId` union already contains
`'create.note'` (`:19`).

**But source proves the mechanism is inert:**

- `'create.note'` is **declared and never registered** — its only occurrence repo-wide is
  the union member itself.
- **`RegisteredAction.shortcut` is never read anywhere in application code.** Every
  `.shortcut` match in the repository is inside the vendored `excalidraw_fork`. There is no
  keyboard dispatcher that maps a keystroke to a registered action.
- All eight `actionRegistry` consumers are **context menus**, which call
  `actionRegistry.execute(id, ctx)` directly on click.

Registering a Document shortcut today would therefore create a **shortcut that never fires**
— exactly the decorative-affordance defect PATCH-120 §1 found on `CardActionsToolbar` and
PATCH-133 §6a found on `CardEditor`'s formatting buttons. **Three instances of this pattern
are now on record in this codebase; adding a fourth under governance would be inexcusable.**

**Decision: no keyboard shortcut for Document in PATCH-134.** The owner's rule — *do not add
a shortcut merely because the registry exists* — is upheld with source evidence, and the
archive-derived rule ("use ActionRegistry for shortcuts") is **retained for when a dispatcher
exists**. Building that dispatcher is its own patch and is not authorized here.

---

## 7. Scope C — the blocking proof

The chain, each link verified:

1. A Freeform `type: 'card'` post renders in an **exclusive** branch —
   `FreeformPadletCards.tsx:1706` `{padlet.type === 'card' && (…)}`.
2. That branch wraps the card in **`NotePostContextMenu`** (`:1707-1718`), passing
   `onSelect`, `onDelete`, `onBringToFront/Forward`, `onSendBackward/ToBack`, `onLock`,
   `onCreateSyncedCopy`. **No edit/open callback is passed.**
3. `NotePostContextMenu` itself renders **no Edit or Open item** — cut, copy, duplicate,
   create-synced-copy, delete, group-into-column, lock, and four layer-order items only.
4. The generic Freeform hover pencil (`showModalEditButton` → `openFreeformPadletModal`,
   `:3216-3222`) — which *does* handle `type === 'card'` at `:418-419` — lives in a
   **different, non-card** render branch and never runs for card posts.
5. `FreeformPadletCards` never receives or calls `openPadletInTypeEditor`; it is not among
   its props.
6. `DrawingLayout` does **not** render `FreeformPadletCards`, so the live
   `CardActionsToolbar` (`FreeformPadletCards.tsx:5987`) is **Freeform-only**.
7. Wall, Map and Drawing each wire `onOpenTarget` / `onPadletEdit` →
   `openPadletTargetFromContextMenu` / `openPadletInTypeEditor` → `setIsCardEditorOpen(true)`
   (`CanvasClient.tsx:6567`, `:6753`, `:6808-6814`, `:6847`, `:6962`). **Freeform does not.**

**Conclusion: in Freeform, `CardPreview.onOpenToolbar` → `CardActionsToolbar` → "Card view"
is the only path to the edit-mode `CardEditor` for a card post.** Removing it would strand
every existing Freeform card post — and, after Scope B ships, every newly created Document —
with no way to reopen its content.

**Hard stop TRIGGERED. Scope C is NOT authorized in PATCH-134.**

---

## 8. Re-sequencing — where the removal goes instead

The blocked removal is not abandoned; it is **ordered correctly**.

- **PATCH-135** already owns the canvas card contract, including *"open affordance: explicit,
  visible, keyboard-reachable"* (PATCH-133 §11b/§11d). **That affordance is the prerequisite
  the removal was missing.**
- Therefore: **the "Card view" removal moves into PATCH-135, as its final step, gated on the
  new open affordance being live and tested in Freeform.** Only then is the entry genuinely
  redundant — which is what §4d asserted prematurely.
- The `CardActionsToolbar` label rename (§5) moves with it, so the label-list test changes
  once rather than twice.

**Net effect on PATCH-134: strictly additive.** It adds a tool and moves a registry; it
removes no user-facing capability. That is a better shape than the original scope, and it
falls out of the evidence rather than from caution.

---

## 9. Allowlists

### 9a. Production allowlist — exactly 2 files

| File | Authorized change |
|---|---|
| `components/collabboard/canvas/ui/canvasToolbarRegistry.tsx` | **NEW.** `buildCanvasToolbarGroups` + the two moved SVG icon components + the Document entry |
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | Delete lines 174-196 and 5357-5442; add the import + one call; add the `case 'document':` arm to `handleToolClick`; remove **only** the imports the extraction orphans |

**Explicitly NOT on the allowlist** (Scope C blocked, Scope D no-op):
`CardActionsToolbar.tsx` · `FreeformPadletCards.tsx` · `ClipartCardDraftModal.tsx` ·
`CardEditor.tsx` · `CardPreview.tsx` · `CanvasSidebar.tsx` · `usePadletSave.ts` ·
`types/collabboard.ts` · `components/DraggableToolbar.tsx`.

**One conditional exception:** if §4d's measurement proves the empty-card defect,
`hooks/canvas/usePadletSave.ts` is added for the **narrow `id === 'new'` empty-draft guard
in `saveCard` only** — nothing else in that 1,423-line file. If a wider change looks
necessary, **stop and report** rather than widening.

### 9b. Test allowlist — exactly 2 files

| File | Authorized change |
|---|---|
| `e2e/characterization/patch-134-document-toolbar.spec.ts` | **NEW** — the §10 contract |
| `components/collabboard/ClipartCardDraftModal.test.tsx` | **Evaluated: no change expected.** It asserts the clipart toolbar label list `['Color','Icon','Caption','Card view','Reaction','Comment']` (`:417`). Because Scope C is blocked, `CardActionsToolbar` is untouched and this assertion must still pass **unchanged**. It is allowlisted per the owner decision so that *if* it fails, the failure is investigated under an authorized path — **not so that it may be edited.** **Any edit to this file requires stopping and reporting first.** |

**Watch item, run but NOT allowlisted:** `components/collabboard/CardPreview.test.tsx:286`
reads `CardActionsToolbar.tsx` source and asserts it contains `'TextCursor'`. That file is
untouched, so the test must pass. **If it fails, stop.**

**Do not modify any PATCH-120/121/122/123/125/128/129/130/132 test.**

---

## 10. Test contract

The new spec must assert, against a real board through real UI:

1. **Document appears** in the main canvas toolbar's Create group.
2. **Stable ID** — the tool is identified by its `type` string, never by index.
3. **Deterministic order** — the Create group reads exactly
   `AI · Note · Document · To-do · Comment · Table`.
4. **Freeform activation** follows the real placement flow: click Document → `CardEditor`
   opens → save → a `type: 'card'` post exists on the canvas at a real position.
5. **Drawing activation** follows the real Drawing placement flow: click Document → save →
   **the Drawing placement path is entered** (editor closes, placement begins), not a direct
   insert.
6. **Permission-hidden users do not receive the tool** — a workspace `readonly` role sees no
   sidebar at all (`canUseCanvasToolbar`). Must be proven by role, **not** by CSS.
7. *(Scope C — deferred to PATCH-135.)*
8. **`ClipartCardDraftModal` still exposes its editor opener** and it still opens `CardEditor`.
9. **Clipart draft edits still write through `onChange`.**
10. **Existing create tools retain labels, order and behavior** — at minimum Note still
    creates a note post through its own path.
11. **Extraction changes no command behavior** — every pre-existing tool group and label
    renders identically; the canvas-specific group still appears/disappears with layout.
12. **Sidebar/context-menu editor opening remains functional** in the layouts that have it
    (Wall/Map/Drawing), and the Freeform "Card view" opener still works (it is retained).
13. **No new document type or schema row** — the created post is `type: 'card'`; no
    `'document'` value is written.
14. **No unrelated `CanvasClient` behavior changes.**

Plus, from §3f and §4d: **the `CanvasClient.tsx` line count decreases by ≥ 90**, and the
**dismiss-without-typing behavior is measured and reported**.

Carried standard: **`--repeat-each=3`**.

### 10a. False-green rejection

Reject if: the test calls `handleToolClick` / `saveCard` / any creation handler directly;
Document appears only in a mocked toolbar; **Drawing and Freeform are not both exercised**;
the clipart draft modal is not tested; the exact-label test is deleted rather than left
passing; `CanvasClient` grows or gains another inline registry block; the extraction moves
persistence or placement logic; a new document schema/type is introduced; permissions are
simulated by hiding CSS instead of by role; or the Scope C removal is performed anyway.

---

## 11. Retained archive-derived rules

Adopted, per the owner: `ActionRegistry` for shortcuts (**deferred — §6, no dispatcher
exists**); `Result<T, DomainError>` for genuinely new domain commands (**none required —
§4a**); zod on route inputs (**no routes touched**); no Supabase `.from()` in routes (**no
routes touched**); never expose `getSupabaseAdmin()` in client code (**standing**); preserve
strangler naming and do not rename legacy `padletId` contracts casually (**binding — the new
registry uses the existing `SidebarToolItem` shape verbatim and renames nothing**).

**Archived PATCH-090–105 numbers remain VOID** (PATCH-133 §19c) and are not referenced.

---

## 12. Hard stops — evaluated

| Hard stop | Verdict |
|---|---|
| No safe existing document-like creation command | **NOT triggered** — `saveCard` (§4a) |
| Extraction requires moving command ownership | **NOT triggered** — the registry is purely declarative (§3b) |
| Tool visibility relies on unresolved board permissions | **NOT triggered** — inherits the existing workspace gate; no new predicate (§4c) |
| Removing the live "Card view" removes the only editor opener in that context | **TRIGGERED** (§7) → Scope C blocked, re-sequenced to PATCH-135 (§8) |
| Clipart modal tests reveal hidden dependencies | **NOT triggered** — the label assertion is real but unaffected, because Scope C is blocked (§9b) |
| One allowlist cannot satisfy both extraction and behavior safely | **NOT triggered** — 2 files, with one narrow conditional third (§9a) |
| `CanvasClient` line count increases materially | **NOT triggered** — converted into a measured ≥ 90-line reduction gate (§3f) |

**One of seven triggered.** It removes Scope C and leaves A, B, D, E fully bounded.

---

## 13. Commit contract

- Governance (this document): `docs(patch-134): authorize document toolbar integration`
- Implementation, when run: `refactor(canvas): extract create-tool registry` **then**
  `feat(canvas): add Document to the main toolbar` — **two commits**, because the mechanical
  extraction must be reviewable as behavior-preserving on its own (repo rule 8: a refactor
  with behavior diffs is two PRs).
- Tests: `test(canvas): characterize document toolbar creation`

**Do not push. Do not close PATCH-134. Do not modify the snapshot branch or tag.**

---

## 14. Status

**PATCH-134: OPEN · ARCHITECTURE BOUNDED · NARROW IMPLEMENTATION AUTHORIZED FOR SCOPES A, B,
D, E · SCOPE C BLOCKED BY TRIGGERED HARD STOP AND RE-SEQUENCED INTO PATCH-135 · EXTRACTION
BOUNDARY PROVEN DECLARATIVE · `saveCard` SELECTED AS THE CREATION COMMAND · NO NEW POST TYPE
· NO KEYBOARD SHORTCUT · NOT PUSHED.**

**PATCH-133: OPEN — amended by §0b of this patch, not closed. PATCH-132 / 130 / 129 / 128:
CLOSED — not modified or reopened. PATCH-131: OPEN · BLOCKED — not modified.**

---

## 15. Recorded diagnostic notes

- **"A second path exists" is a claim about a specific surface, not about a codebase.**
  PATCH-133 §4d saw `openPadletInTypeEditor` handling `type === 'card'` in `CanvasClient` and
  concluded the toolbar entry was redundant. It is redundant in Wall, Map and Drawing — and
  load-bearing in Freeform, which never wires that callback for card posts. **Before calling
  an affordance redundant, name the surface and trace the alternative on that surface;
  the existence of a handler is not the existence of a path to it.**
- **The hard-stop list did its job by catching its own author's earlier finding.** Scope C
  was written on the strength of §4d, and Scope C's own stop condition is what invalidated
  it. **Stop conditions are worth most when they can fire against the premise of the task
  that defined them.**
- **Refusing the growth waiver produced a better patch, not just a longer one.** Forced to
  extract first, the registry turned out to be entirely declarative — so the extraction is
  mechanical, reviewable in isolation, reduces the god-component by ~107 lines, and leaves a
  reusable insertion point. **An inline addition would have been three lines and would have
  bought none of that.**
- **A registry with a `shortcut` field and no dispatcher is a trap for the next
  implementer.** `ActionRegistry` looks ready — typed `shortcut`, a `create.note` ID already
  reserved. Neither is wired. **Before honoring a convention "because the mechanism exists",
  verify the mechanism executes**; this codebase has now produced three decorative
  affordances (toolbar no-ops, formatting buttons, and this) by skipping that check.

---

## 16. Amendment — §7 refined: one indirect opener exists, for container children only (2026-08-02, CTO)

A completed consumer census re-confirmed §7's file lists and line numbers exactly, and
surfaced one call site §7 did not name:

```
components/collabboard/canvas/ui/CanvasModals.tsx:265-271
  onOpenChildPadlet={(childId) => { … setIsContainerEditorOpen(false);
                                    openPadletInTypeEditor(child); }}
```

This is the **Container Editor's child list**. It reaches `openPadletInTypeEditor`, and for
`type: 'card'` that reaches `setIsCardEditorOpen(true)`.

**Refinement, not refutation.** It is a second opener **only** for a card that is already a
**container child**, and only via first opening that container's editor. It is unreachable
for a free-standing Freeform card.

Consequences:

1. **§7's conclusion stands and Scope C remains BLOCKED.** `handleToolClick`'s Document arm
   (§4b) creates a **free-standing** post unless a container context supplies `parentId`, so
   the default product of this patch is exactly the case with no alternative opener — as are
   all existing free-standing Freeform cards.
2. **§7's wording is corrected** from "the only path to the edit-mode `CardEditor` for a card
   post" to: **the only path for a free-standing Freeform card post; container children have
   an additional indirect path through the Container Editor.**
3. **PATCH-135 inherits a sharper acceptance bar.** When it removes the "Card view" entry
   (§8), its new open affordance must be proven on a **free-standing** Freeform card, not on
   a container child — a container child would pass while the real gap remained open.

### 16a. Recorded diagnostic note

- **A refuted claim and a narrowed claim need different handling, and the difference is worth
  the ten minutes.** The extra call site was real and §7 had not named it; the reflex is
  either to ignore it (the conclusion is unchanged) or to reopen the finding (something was
  missed). Neither is right. **Naming the exception makes the remaining claim precise and
  gives the successor patch a sharper test** — here, that the affordance must be proven on a
  free-standing card. An unnamed exception would have surfaced later as a reviewer's doubt
  about the whole blocking argument.

---

## 17. Amendment — RESPONSIVE LIBRARY REGRESSION CONFIRMED; NARROW CORRECTION AUTHORIZED (2026-08-02, CTO)

Independent review of the PATCH-134 implementation returned **FAIL — RESPONSIVE TOOLBAR
REGRESSION**. **The finding is confirmed.** PATCH-134 is **not closed**.

Implementation commits under review: `923e644` (`refactor(canvas): extract toolbar registry`)
and `e5bf95e` (`feat(canvas): add document creation tool`). HEAD at amendment: `e5bf95e`.

### 17a. Implementation state — the authorized scopes landed correctly

| Contract | Result |
|---|---|
| Registry extracted to `canvasToolbarRegistry.tsx` | ✅ present, 5,934 bytes |
| `CanvasClient.tsx` net reduction ≥ 90 lines (§3f) | ✅ **8,436 → 8,339 = 97 lines** |
| Create order `AI · Note · Document · To-do · Comment · Table` | ✅ registry `:95-100` |
| Document tool shape (`FileText`, `text-sky-700`, `type: "document"`) | ✅ registry `:97` |
| Two-commit split (refactor, then feature) | ✅ |

**The regression is not a defect in either authorized scope.** The extraction is
behavior-preserving; the tool definition matches §4c exactly. The regression is a
**second-order consequence** of the sixth Create tool interacting with a collapse threshold
neither scope touched — which is precisely why §4c's mobile/overflow row required the fit to
be verified at a small viewport, and why that verification was insufficiently pursued.

### 17b. The regression, independently reproduced from source

`CanvasSidebar.tsx:37-38, 62-86`:

```
OVERHEAD_H = 105
GROUP_H(n) = 20 + n * 44
needed = OVERHEAD_H + Σ GROUP_H(group)
collapse candidates = groups where !alwaysVisible && priority > 1, highest priority number first
```

Freeform board, editor role, share-manager, no graph mode:

| Group | Tools | `GROUP_H` | Priority | `alwaysVisible` |
|---|---|---|---|---|
| canvas | 2 | 108 | 1 | ✅ |
| create | **5 → 6** | **240 → 284** | 2 | ✅ |
| structure (**Library**) | 1 | 64 | 4 | ❌ |
| media | 4 | 196 | 5 | ❌ |
| draw | 1 | 64 | 6 | ❌ |
| share | 1 | 64 | 7 | ✅ |
| settings | 1 | 64 | 8 | ✅ |

`needed`: **905 before → 949 after.** Collapse order by descending priority:
**draw (64) → media (196) → structure (64).**

With `avail ≈ 664` (720 viewport − the 56 px `CANVAS_TITLE_HEADER_HEIGHT`):

- **Before:** `canSave = 905 − 664 = 241`. draw → 177; media → **−19**, loop breaks.
  **Library survives.**
- **After:** `canSave = 949 − 664 = 285`. draw → 221; media → 25; **25 > 0 → structure
  collapses.** **Library is gone.**

**The review's 240 → 284 figures and its collapse-order conclusion are exactly reproduced.**
The single 44 px increment crosses the threshold with 25 model-pixels to spare — the
narrowest possible margin.

`CanvasSidebar.tsx:120`: `if (collapsedIds.has(group.id)) return null;` — **confirmed. A
collapsed group is removed from the DOM.** There is no overflow menu, no More button, no
keyboard path, no touch path, no secondary access. **Library becomes completely
inaccessible.**

### 17c. Findings recorded as required

| Finding | Verdict |
|---|---|
| Document remains visible because Create is `alwaysVisible` | **CONFIRMED** — registry `:103` |
| Library was visible before PATCH-134 at 720 px | **CONFIRMED** — §17b |
| Library is absent from the DOM after PATCH-134 at 720 px | **CONFIRMED** — `return null`, not `display:none` |
| PATCH-125's failure correctly identifies lost Library access | **CONFIRMED** — `patch-125-shared-reaction-picker.spec.ts:124-126` asserts the Library tool is visible **and clicks it**; the config uses `devices['Desktop Chrome']` = **1280×720** with no override. This is a genuine product assertion at exactly the affected viewport, **not** a stale characterization detail |
| Extraction did not independently alter spacing or collapse behavior | **CONFIRMED** — `CanvasSidebar.tsx` untouched by `923e644`; `GROUP_H`/`OVERHEAD_H` unchanged |
| The additive sixth Create tool crossed the existing threshold | **CONFIRMED** |
| Media and Draw were already collapsed at this viewport | **CONFIRMED** |
| No collapsed-group affordance exists | **CONFIRMED** |

**Classification: product regression. `Library` is a core structural tool with no alternative
path, and P3/repo-rule-10 territory — a user at the default supported viewport silently
loses a capability.**

### 17d. Correction — AUTHORIZED, with a fit condition that must be measured first

**Authorized:** mark the `structure` group `alwaysVisible: true` in
`components/collabboard/canvas/ui/canvasToolbarRegistry.tsx`. **One property, one file.**

The rationale is accepted in full: an overflow system needs new interaction design,
accessibility, mobile behavior, focus handling, tests and files; PATCH-134 is a Document
integration patch, not a toolbar redesign; Library was accessible at 720 px and must remain
so.

**But rationale item 5 — "the measured always-visible set remains within the supported 720 px
height" — is NOT yet established, and my own arithmetic says it is close enough to fail.**

Under the sidebar's **own** model, after the correction at `avail ≈ 664`:

```
always-visible = 105 + 108 + 284 + 64 + 64 + 64 = 689
collapsible savings = draw 64 + media 196 = 260  →  949 − 260 = 689
689 > 664  →  the model overflows by ~25 px, and no further group is eligible
```

The algorithm cannot collapse an `alwaysVisible` group, so it collapses everything it may and
**stops while still over budget**. The sidebar is `overflow-visible` (`:97`) — **it does not
scroll.** An over-budget sidebar therefore clips or overlaps rather than scrolling.

**However, the model is not the DOM.** Derived from the rendered Tailwind classes
(`:122-129` — `gap-1`, `text-[9px] leading-none` label, `w-9 h-9` = 36 px tools, outer
`gap-3`, `py-6`), the real always-visible height is approximately:

```
48 (py-6) + 17 (back) + 89 (canvas) + 249 (create) + 49 (structure) + 49 (share)
+ 49 (settings) + 32 (collapse btn) + 7 × 12 (gap-3)  ≈  654
```

**≈ 654 ≤ ≈ 664 — it fits, by roughly ten pixels.**

The two numbers disagree because **`GROUP_H(n) = 20 + 44n` overestimates the real
≈ `13 + 40n`** — about 4 px per tool plus 7 px per group. On the six-tool Create group alone
the model is ~35 px pessimistic.

**This has a sharp consequence worth stating plainly: the regression is partly an artifact of
an inaccurate height model, not purely a real shortage of space.** The sixth tool added
44 model-pixels but only ~40 real pixels, and it crossed a threshold the model had already
biased low. **Correcting `GROUP_H` is NOT authorized here** — it would change unrelated
responsive thresholds across every layout, breaching correction-contract item 13. It is
recorded for a future toolbar patch.

**Binding condition on the correction.** My ≈ 654 figure is **derived from class names, not
measured in a browser.** It is within ~10 px of the limit, and any of these makes it fail: a
global app header above the canvas area, a taller title header, a third canvas-specific tool
(graph mode adds "Graph Line" → +40 px real), or a layout with a larger canvas group.

**Therefore: the §17e viewport matrix must be measured on the real UI BEFORE the correction
is accepted.** If the always-visible set does not fit at any supported viewport, **STOP and
request a broader toolbar-overflow patch** — do not force clipping. This is the review's own
escalation rule, and it is live, not theoretical.

**Specifically flagged for measurement: Freeform with graph mode enabled** (`isFreeformGraphMode`
→ a third canvas tool). That configuration is ~40 real pixels worse than the one computed
above and is the most likely to fail.

### 17e. Viewport matrix — required evidence

Measured on the real UI, with a Freeform board (and, where noted, Drawing), recording per row:
**visible groups · collapsed groups · Library present · Document present · clipping/overlap ·
sidebar `scrollHeight` vs `clientHeight`.**

| Viewport | Required outcome |
|---|---|
| 1920×1080 | existing layout preserved; nothing newly collapsed |
| 1440×900 | existing layout preserved |
| 1366×768 | Library present |
| **1280×720** | **Library present and clickable; Document present; no clipping** — the regression viewport |
| 1024×600 (or the narrowest supported practical viewport) | Library present, or an explicit STOP |
| **1280×720, Freeform graph mode ON** | added by this amendment — the worst case (§17d) |

`scrollHeight > clientHeight` on a container that cannot scroll **is** the clipping signal.
Report the raw numbers, not a judgement.

### 17f. Allowlists

**Production — exactly 1 file:** `components/collabboard/canvas/ui/canvasToolbarRegistry.tsx`
(add `alwaysVisible: true` to the `structure` group; nothing else).

**Must NOT be edited:** `CanvasSidebar.tsx` (including `GROUP_H`/`OVERHEAD_H`) ·
`CanvasClient.tsx` · `usePadletSave.ts` · `CardActionsToolbar.tsx` · any editor or modal file.

**Tests:**

- `e2e/characterization/patch-134-document-toolbar.spec.ts` — update **only** to add the
  §17g assertions.
- `e2e/characterization/patch-125-shared-reaction-picker.spec.ts` — **run FIRST, unchanged.**
  **Expected to pass without edits** once Library is visible again. **It is allowlisted only
  so that a still-failing run is investigated under an authorized path — not so it may be
  edited.** Its `:124-126` Library assertion is correct and must survive verbatim. **Editing
  it to accept Library disappearing is an automatic rejection.** Any edit requires stopping
  and reporting first.

### 17g. Correction contract — required assertions

At **1280×720**, against the real sidebar: (1) Library present in the DOM, visible and
**clickable**; (2) Document present; (3) Create order `AI · Note · Document · To-do ·
Comment · Table`; (4) Media and Draw may still collapse per existing policy; (5) no
always-visible group disappears; (6) no duplicate group; (7) no clipping — report
`scrollHeight`/`clientHeight`; (8) the sidebar remains scroll-free, which is the existing
contract (`overflow-visible`); (9) Library reachable by mouse, keyboard and touch through its
normal button; (10) wider viewports unchanged; (11) narrower practical viewports do not hide
Library; (12) no overflow menu or new interaction model; (13) no unrelated responsive
threshold changed — `GROUP_H` and `OVERHEAD_H` byte-identical.

Carried standard: **`--repeat-each=3`**.

**False-green rejection:** Library in source but not in the rendered DOM · Library present but
clipped below the viewport · the test raises viewport height to dodge the regression · the
existing Library assertion removed · Library rendered with `display:none` · a mocked registry
instead of the real sidebar · Document removed to restore fit · an optional group deleted ·
collapse logic bypassed globally.

### 17h. Status

**PATCH-134: OPEN · DOCUMENT TOOL IMPLEMENTED · REGISTRY EXTRACTION IMPLEMENTED · RESPONSIVE
LIBRARY REGRESSION CONFIRMED · NARROW RESPONSIVE CORRECTION AUTHORIZED · FIT AT 1280×720 MUST
BE MEASURED BEFORE ACCEPTANCE · SCOPE C STILL BLOCKED AND RE-SEQUENCED TO PATCH-135 · NOT
CLOSED · NOT PUSHED.**

Snapshot branch `snapshot/pre-document-architecture-2026-08-02` and tag
`pre-document-architecture-2026-08-02` remain at `c0fa799` — **not modified.**

### 17i. Recorded diagnostic notes

- **An additive change with no shared state still had a second-order consequence, through a
  height budget.** Nothing in either commit touched `CanvasSidebar`, spacing, or collapse
  logic; the sixth tool simply pushed a sum past a threshold and silently deleted a different
  group from the DOM. **"Purely additive" describes the diff, not the behavior — anything
  entering a fixed budget must be checked against the budget's consumers, not just its own
  correctness.**
- **§4c named this risk and the verification was not carried out.** The mobile/overflow row
  said the group is `alwaysVisible` so never collapsed, "**but the overall fit must be
  verified at a small viewport**." That sentence was right and was not executed. **A risk
  recorded in a contract is not a risk mitigated; it needs an assertion attached, or it is
  just a well-informed omission.** The §17e matrix is that assertion.
- **The failing test was a product assertion wearing a characterization test's clothes.**
  PATCH-125's spec clicks Library to open the external library — its failure reported a real
  capability loss, not a stale expectation. **Before "updating" a characterization assertion
  to match new behavior, check whether it asserts a capability; if it does, the new behavior
  is the defect.**
- **The model that decides collapse is ~4 px per tool more pessimistic than the DOM it
  models.** The regression sits inside that error bar: 949 model-pixels vs ~654 real. So the
  fix probably works, and probably-works is exactly why §17d makes measurement a gate rather
  than a formality. **When a decision depends on an approximation, record the approximation's
  error and where the true value must be measured — never let the model's number and the real
  number be quoted interchangeably.**

---

## 18. Amendment — FIT GATE FAILED; OVERFLOW PREREQUISITE REQUIRED (2026-08-02, CTO)

The §17d fit gate was executed. **It failed.** The one-line correction was measured and then
**fully reverted** — no implementation remains, no commit was created, no production or test
file is changed, nothing was pushed. Verified at `7dd5aab`: `canvasToolbarRegistry.tsx` has no
`alwaysVisible` on the `structure` group, and the working tree contains only the five
protected paths.

**Classification: RESPONSIVE CORRECTION INSUFFICIENT · BROADER OVERFLOW PATCH REQUIRED.**

### 18a. Measured real-DOM matrix (graph-enabled worst case, with the correction applied)

| Viewport | `clientHeight` | `scrollHeight` | Toolbar bottom | Clipping | Library | Document |
|---|---|---|---|---|---|---|
| 1920×1080 | 1080 | 1080 | 884 | 0 | ✅ | ✅ |
| 1440×900 | 900 | 900 | 642 | 0 | ✅ | ✅ |
| 1366×768 | 768 | 768 | 642 | 0 | ✅ | ✅ |
| **1280×720** | 720 | 720 | 642 | **0** | ✅ | ✅ |
| **1024×600** | 600 | **672** | 641 | **41 px** | ✅ | ✅ — but **always-visible Settings is clipped** |

**PATCH-125 passed unchanged** during the attempted correction.

### 18b. What the measurement settles

1. **§17d's prediction was right in both directions.** The graph-enabled configuration was
   correctly identified as the worst case, and the correction *does* fit at 1280×720 — the
   measured toolbar bottom is **642**, against my derived estimate of ≈ 654. Ten pixels of
   margin was the right thing to refuse to assert. **Had the gate been waved through on the
   estimate, 1280×720 would have passed and 1024×600 would have shipped broken.**
2. **The correction is insufficient, not wrong.** It fixes the regression it targeted and
   fails a viewport it never addressed.
3. **⚠ The 1024×600 failure is almost certainly PRE-EXISTING, not caused by PATCH-134.**
   Removing the `structure` group's ~49 real pixels from the measured 672 leaves ≈ 623,
   still over the 544 available (600 − the 56 px title header). Under the model at HEAD:
   `needed = 993`, `avail = 544`, all three collapsible groups collapse, and the surviving
   always-visible set is still ≈ 669 model-pixels. **So the toolbar clips at 1024×600 today,
   with or without PATCH-134's Document tool.** This is **derived, not measured** — it must be
   confirmed at HEAD as PATCH-135's first measurement (§4a there). If confirmed, PATCH-134
   introduced exactly one regression (Library at 1280×720), and PATCH-135 additionally repairs
   a defect that predates it.

### 18c. What is NOT authorized

Per the review, and adopted verbatim: no further `alwaysVisible` flag; no hiding Settings; no
deleting tools; no reducing hit-target sizes without accessibility review; no relying on
browser clipping; no increasing test viewport height; no making the whole page scroll; no
arbitrary responsive thresholds; no compressing labels until unreadable.

**`structure.alwaysVisible = true` is withdrawn as an authorized correction.** §17d is
superseded on that point; its diagnosis (§17b, §17c) stands unchanged.

### 18d. Commits retained

`923e644` (`refactor(canvas): extract toolbar registry`) and `e5bf95e`
(`feat(canvas): add document creation tool`) **remain in place and are not reverted.**
`e5bf95e` also carries the **empty-draft guard** in `hooks/canvas/usePadletSave.ts` (+22
lines) — the §9a conditional allowlist exception, exercised because §4d's dismissal risk was
confirmed real.

The Document tool is therefore live and the Library regression is live with it. **That is a
deliberate, recorded state**: reverting would also revert the extraction that PATCH-135 needs
as its insertion point, and the owner has directed that the commits stand. **PATCH-134 cannot
close, and no further document work may proceed, until PATCH-135 lands.**

### 18e. Status

**PATCH-134: OPEN · DOCUMENT TOOL IMPLEMENTED · REGISTRY EXTRACTION IMPLEMENTED ·
EMPTY-DRAFT GUARD IMPLEMENTED · RESPONSIVE TOOLBAR REGRESSION CONFIRMED · ONE-LINE VISIBILITY
CORRECTION PROVEN INSUFFICIENT · BROADER TOOLBAR OVERFLOW PREREQUISITE REQUIRED ·
IMPLEMENTATION BLOCKED · NOT CLOSED.**

Blocking prerequisite: **PATCH-135 — Responsive Canvas Toolbar Overflow.** Scope C (the "Card
view" removal) remains blocked and re-sequenced — now into **PATCH-136** (§18f).

Snapshot branch and tag remain at `c0fa799` — not modified.

### 18f. Sequence renumbering

A new prerequisite takes the number 135; the document sequence shifts by one. Historical
planning numbers are non-authoritative (PATCH-133 §19c); this follows current evidence.

| Number | Subject |
|---|---|
| **PATCH-135** | **Responsive canvas toolbar overflow** (new prerequisite) |
| PATCH-136 | Document canvas-card presentation — **inherits Scope C**, the "Card view" removal, gated on the free-standing-card open affordance (§8, §16) |
| PATCH-137 | Editor / read-only modal split + permission enforcement |
| PATCH-138 | Document persistence, lifecycle, reconciliation, import/export |
| PATCH-139 | Links, backlinks, archive, reusable multi-board appearances — still not authorizable |

### 18g. Recorded diagnostic notes

- **The gate earned its keep on its first use.** §17d refused to assert a ten-pixel margin and
  demanded measurement. The margin turned out to be real at 1280×720 — the estimate was off by
  12 px and in the safe direction — **and the matrix caught a different viewport failing
  entirely.** The value was not in doubting the estimate; it was in measuring *more viewports
  than the one the correction was aimed at.*
- **A fix that passes its target case can still be the wrong fix.** `alwaysVisible` resolved
  1280×720 exactly as designed. It was rejected because it moves a group from "collapsible" to
  "unconditionally consuming height" in a budget that is already over-subscribed at the
  smallest supported viewport. **Adding to the always-visible set is not a correction
  strategy; it is deferred debt with a smaller viewport's name on it.**
- **The investigation surfaced a defect older than the patch under review.** The 1024×600
  clipping appears to predate PATCH-134 entirely. **Recorded as derived-not-measured and
  handed to PATCH-135 as its first measurement**, rather than quietly folded into this patch's
  blame or quietly fixed without being named.
