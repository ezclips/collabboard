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
