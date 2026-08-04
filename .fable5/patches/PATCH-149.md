# PATCH-149 — DOCUMENT POST USABILITY, MODAL CLEANUP, PDF-READY FOUNDATION

**Status:** **SPLIT · PATCH-149A AUTHORIZED (bounded modal cleanup) · PATCH-149B BLOCKED ON A
PRODUCT DECISION (document editor identity) · TWO DEFECTS UNLOCATED, NOT AUTHORIZED · NOT PUSHED**
**Authored:** 2026-08-04 (governance architect). **Base:** `177645b`. **First authoring of this
number** — `git log --all --diff-filter=A -- .fable5/patches/PATCH-149.md` is empty.
**Inherits:** PATCH-138 label finding · PATCH-139 D3/D5/D6 · PATCH-140 component 6 ·
PATCH-151 O1/O2/O4. **PATCH-139 and PATCH-151 are not reopened.**

---

## 0. Input availability — recorded

The brief cited `/mnt/data/PFD_Plan(1).zip`. **That path does not exist in this environment.**
The plan was located and read in full at
**`C:\Users\rmeic\.gemini\antigravity\brain\PFD_Plan\`** (extracted directory; `.zip`/`.rar`
copies also present, plus `C:\Users\rmeic\Projects\dev\PFD_Plan.zip`).

Read: `implementation_plan_PDF_Document_Integration.md` (v2.0, 2026-07-19, authoritative),
plus the directory listing of `patch_090.md`–`patch_105.md`, `implementation_plan_LLM.md`,
`review_and_improvements.md`. **No governance below rests on an unread file.** ("PFD" is the
archive's own spelling of "PDF"; cf. `PATCH-133:1191`, where the same typo silently voided a
reconciliation table.)

---

## 1. The finding that governs everything else

**The Document Post is built on the wrong editor, and the right one already exists.**

| | Document Post (today) | Note Post (today) |
|---|---|---|
| Created by | toolbar `case 'document'` → `CanvasClient.tsx:5400-5418` | toolbar `case 'note'` → `:5398` |
| Persisted type | **`type: 'card'`** (PATCH-134: no new type) | `type: 'text'`/`'note'` |
| Modal opened | `setIsCardEditorOpen(true)` → **`CardEditor.tsx`** | `setIsNoteEditorOpen(true)` → **`NoteEditor.tsx`** |
| Size | **175 lines** | **1,165 lines** |
| Editor | plain **`<textarea>`** | **TipTap** — `useEditor`, `StarterKit`, `Underline`, `FontSize`, `Comment`, `CalloutExtension` |
| Formatting toolbar | 5 buttons, **zero `onClick`** | `NoteEditorToolbar.tsx` (240 lines) — bold, italic, underline, bullet/ordered list, align, link, font size, **all wired** |
| Persistence format | plain text | **HTML** via `editor.getHTML()` (`:658`, `:286`) |
| Extension registry | none | **`NOTE_EXTENSIONS`** (`:24-29`) |

**TipTap is already a dependency** — `@tiptap/react` ^3.0.7, `starter-kit` ^3.0.7, plus
`extension-underline`, `-link`, `-highlight`, `-color`, `-text-style`, `-placeholder` (^3.13.0),
`package.json:62-69`.

**The authoritative PDF plan targets the editor the Document Post does not use.** Its §1 Design
Decision: *"The `note` post (TipTap editor) is the home for assembling text highlights into
structured Markdown/HTML documents… Document assembly is restricted to the `note` post."* Its
Phase 2 integration point is **`[MODIFY] components/collabboard/editors/NoteEditor.tsx`**.

This is a **P6 "one implementation per concern" duality**, and it is the root cause of user
defect 1, of PATCH-140's transferred body-format question, and of the PDF-foundation choice.
**All three are one decision**, which is why they are split out below rather than guessed at.

---

## 2. Source census at `177645b`

| Concern | Exact path | Current behaviour | State owner | Persistence | Read-only | 149? |
|---|---|---|---|---|---|---|
| Document creation | `app/dashboard/canvas/[id]/CanvasClient.tsx:5400-5418` | builds `type:'card'`, `id:'new'`, opens CardEditor | `setPadletToEdit` | — | n/a | **149B** |
| Document tool id | `components/collabboard/canvas/ui/canvasToolbarRegistry.tsx` | tool id `'document'`, `FileText` (PATCH-134) | registry | — | n/a | no |
| Post type union | `types/collabboard.ts:97` | **no `'document'` member**; documents are `'card'` | schema | — | n/a | **binding** |
| Document modal | `components/collabboard/CardEditor.tsx` | textarea + decorative toolbar | local `useState` | plain text | genuine (PATCH-139/151) | **149A + 149B** |
| Header icon block | `CardEditor.tsx:86-97` | **`w-16 h-16` block, `backgroundColor: metadata?.iconBgColor \|\| '#ec4899'` (pink); `<img>` only when `metadata?.svgUrl`** | — | — | separate branch | **149A** |
| Formatting toolbar | `CardEditor.tsx:133-142` | 5 `<Button>`s, **no handlers** | — | nothing | absent when read-only | **149B** |
| Title input | `CardEditor.tsx:100-106` | editable input (`!readOnly` only) | `title` state | `padlets.title` | absent | 149A (layout only) |
| Content state | `CardEditor.tsx:145-151` | `<textarea>`, native `readOnly` | `content` state | `padlets.content` | correct | **149B** |
| Save handler | `CardEditor.tsx:58-72` `handleSave` | read-only → `onClose()`; else `onSave(...)` then `onClose()` | — | via `usePadletSave.ts:973` | short-circuit | **149A (guard) + 149B (semantics)** |
| Close handlers | `CardEditor.tsx:78` backdrop, `:124` X button | **both call `handleSave`** — close *is* the commit | — | — | non-writing | **149B** |
| Explicit Save button | — | **none exists anywhere in CardEditor** | — | — | — | **149B** |
| Escape handling | — | **no key handler** (PATCH-139 §13g) | — | — | — | 149B |
| Real document editor | `components/collabboard/editors/NoteEditor.tsx` | TipTap, working toolbar, HTML | `useEditor` | **HTML** | — | **149B** |
| Note toolbar | `components/collabboard/editors/NoteEditorToolbar.tsx` | wired controls | props | — | — | **149B** |
| Clipart read-only viewer | `CardEditor.tsx:117-124` | `<img svgUrl>` + `{title \|\| 'View Document'}` | — | — | PATCH-151 | **regression guard only** |
| Capability routing | `CanvasClient.tsx:5701`, `:5705`; `FreeformPadletCards.tsx:1761` | `selectCardModalRoute(canUseFreeformEditButton)` | — | — | closed | **frozen** |
| Labels | `CardPreview.tsx:71,149` `Open card` · `CardActionsToolbar.tsx:79` `Card view` | see §5 | — | — | — | **149A (partial)** |
| Tests | `components/collabboard/CardEditor.test.tsx` (16) · `CardPreview.test.tsx` (29) · `ClipartCardDraftModal.test.tsx` (45) · `lib/domain/canvas/cardModalRoute.test.ts` (6) | green | — | — | — | — |

### 2a. Identity answer — required by the brief

The current "Document" is: **a `card` post** (`types/collabboard.ts:97`), created by a
**toolbar-only `document` tool id**, rendered in **`CardEditor`**, whose content is
**plain textarea text** — *not* TipTap, *not* deliberate HTML. It is a **mixed legacy
implementation**: `CardEditor`'s own `wordCount` strips `/<[^>]*>/` (`:56`) and card bodies are
sanitised with `DOMPurify` on render, so HTML *may* already be present in some rows from other
paths, while the editor itself writes plain text. **The stored shape is not uniform and must be
measured per-row before any conversion** (§7).

**PATCH-134's no-new-type decision stands.** Nothing in this census is a hard blocker requiring a
`'document'` padlet type, and none is authorized.

---

## 3. Defect-by-defect result

| # | User-reported defect | Root cause at HEAD | Disposition |
|---|---|---|---|
| **1** | Formatting/style buttons don't work | `CardEditor.tsx:135-140` — five `<Button>`s with **no `onClick` whatsoever**. A `<textarea>` cannot support rich formatting; a working TipTap editor exists elsewhere (§1) | **149B** — see §4 |
| **2** | No clear way to leave/finish the active text/container | **NOT LOCATED.** `CardEditor` is a textarea inside a modal with no focus trap, no key handler and no container concept — the defect is not reproducible there. Candidates: `NoteEditor` TipTap node/container editing, or Excalidraw canvas text/container editing | **NOT AUTHORIZED** — §8 |
| **3** | Underline/line-post element present where it shouldn't be | **NOT ATTRIBUTABLE.** `CardEditor` has **no** underline control and no line control. `Underline` exists only in `NoteEditorToolbar`/`NoteEditor` (legitimately). A canvas "line mode" exists in `FreeformPadletCards`. The brief forbids conflating text-underline with horizontal-rule | **NOT AUTHORIZED** — §8 |
| **4** | Pink clipart icon + empty reserved placeholder in the document modal header | **CONFIRMED, exactly.** `CardEditor.tsx:86-97`: a `w-16 h-16` (64px) rounded block painted `metadata?.iconBgColor \|\| '#ec4899'` — **pink** — whose `<img>` renders only `{metadata?.svgUrl && …}`. A Document post has **no `svgUrl`**, so the block renders **empty and pink**, consuming 64px + `gap-6` | **149A** |
| **5** | Title/content should reclaim the removed space | Direct consequence of 4; the title `<div className="flex-1">` sits beside the block | **149A** |
| **6** | Coherent terminology and flow | §5 | **149A (partial) + 149B** |
| **7** | Editable close is the only persistence path | **CONFIRMED.** Backdrop (`:78`) and X (`:124`) both call `handleSave`; **no Save button exists**. PATCH-139 D3 | **149B — product decision** |
| **8** | Read-only must remain genuinely non-editable | Already true and independently proven (PATCH-139 §13f, PATCH-151 §14d) | **regression guard only** |
| **9** | Brittle whole-file `handleSave` source guard | `CardEditor.test.tsx` asserts `toContain('if (readOnly) {')` over the whole file. PATCH-151 §14i **demonstrated** it passes while the short-circuit is deleted, if the literal exists elsewhere | **149A** |

### 3a. Formatting-control census (brief-mandated classification)

`CardEditor.tsx:135-140`, all five:

| Control | Handler | Classification |
|---|---|---|
| Bold | none | **C — unsupported by the current editor** |
| Italic | none | **C** |
| Link | none | **C** |
| List | none | **C** |
| AlignLeft | none | **C** |

**All five are class C, not A or B.** None is "merely unwired": a plain `<textarea>` has no rich
representation to toggle. Wiring them would mean adding an editor — and `NoteEditor` already is
that editor. This is precisely why the brief's instruction *"wire a supported control correctly, or
remove the unsupported control"* cannot be executed without first settling §4: under
`CardEditor`, the supported set is **empty**, so "remove" would mean shipping a Document Post with
**no formatting at all** — which the brief's own false-green rule flags. **The contradiction is
resolved by the editor decision, not by choosing a side of it here.**

---

## 4. PATCH-149B — the product decision that must be taken first

**Question:** *what is the Document Post's editor?*

| | **Option B1 — Route Documents to `NoteEditor` (TipTap)** | **Option B2 — Keep `CardEditor`, strip its fake toolbar** |
|---|---|---|
| Defect 1 | Fixed — handlers already exist and work | Not fixed; Document Post ships with no formatting |
| Body format (PATCH-140 §6) | Resolved — HTML via `getHTML()` | Unresolved; stays plain text |
| PDF foundation | **Option P1 available immediately** — `NOTE_EXTENSIONS` is the extension registry the plan needs; a future `PdfHighlight` node attaches without replacing the editor | P2/P3 needed later, and the plan's named integration point would still not be the Document |
| PDF plan alignment | Matches §1 exactly ("document assembly is restricted to the `note` post") | Diverges from the authoritative plan |
| P6 duality | Resolved — one document editor | Preserved — two |
| Cost/risk | Existing `type:'card'` document rows hold **plain text**; TipTap must load them safely. Modal ownership, PATCH-139/151 routing targets and the read-only viewer all point at `CardEditor` today | Small and contained |

**This is not a decision governance may take unilaterally.** It changes which modal a Document
opens, and it implies a **content-format compatibility strategy for existing rows** (§7). The
brief forbids inventing a new architecture and requires preferring the narrowest correction —
but the narrowest correction (B2) *knowingly leaves the headline defect unfixed* and diverges from
the authoritative plan. **Recorded as a decision request, per the brief's own instruction to
record rather than invent.**

**Also inside 149B:** save-versus-close. Census: X and backdrop both commit; **no Save button; no
Escape handler; `padletToEdit.id === 'new'` distinguishes create from update**
(`usePadletSave.ts:973-1000`), and the empty-draft guard silently discards blank new documents.

| Save/close option | Assessment |
|---|---|
| **A — explicit Save + non-saving close** | Cleanest, but **destructive without a discard flow**: today every close commits, so users have never been asked to save. Requires new UI + dirty tracking + discard confirmation |
| **B — save-on-close, clearly communicated** | Narrowest; preserves persistence exactly; needs only honest labelling ("Done"/"Save & close") |
| **C — auto-save** | Largest change; no dirty/undo model exists |
| **D — blocked on product decision** | **SELECTED** |

**Selected: OPTION D — BLOCKED.** A and B are both defensible and the choice is user-facing and
irreversible in effect. The brief explicitly anticipated this: *"If source evidence cannot resolve
this safely, record a product decision request rather than inventing destructive behaviour."*
Source evidence resolves *what happens today*; it cannot resolve *what should*.

---

## 5. Terminology contract

Settled now (149A), because it is independent of §4:

| Concept | Contract |
|---|---|
| Opening an existing card/document | **`Open card`** — already shipped by PATCH-139 §13n at `CardPreview.tsx:71,149`; **retained, not renamed again** |
| Obsolete "Card view" action | `CardActionsToolbar.tsx:79` `label: 'Card view'` opens the **editable** editor and is governed by a `showCardView` flag with **four readers, one declaration and zero writers** (PATCH-139 §12). **Authorized for removal in 149A** — it is a mode toggle that can never be on, and PATCH-134 Scope C already reserved its removal |
| Editable document modal title | Deferred to 149B — the title depends on which editor owns it |
| Read-only document modal title | `View Document` — **retained** (PATCH-151 §14e proved the fallback); **must not regress** |
| Inverted labels | The PATCH-138 inversion (`Edit card` → read-only viewer) was **already dissolved** by PATCH-139's capability routing plus the neutral `Open card`. **Nothing inverted remains.** No half-rename is authorized |

---

## 6. PDF-ready foundation — **OPTION P4 (defer), with the seam documented**

**Selected: P4 — DEFER STRUCTURAL CHANGE.** Not because no seam is possible, but because
**the seam is determined by §4**:

- If **B1** is chosen, the correct option becomes **P1 — existing TipTap document model**, at
  near-zero cost: `NOTE_EXTENSIONS` (`NoteEditor.tsx:24-29`) is already an extension registry, and
  the repo already ships custom nodes (`extensions/FontSize`, `extensions/Comment`,
  `CalloutExtension`) — the exact pattern a future `PdfHighlight` node would follow.
- If **B2** is chosen, a **P2/P3** envelope or adapter must be introduced later, against plain
  text.

**Authorizing a foundation now would mean building an adapter for an editor that may be replaced
in the next patch.** That is the rebuild the brief exists to avoid.

**The seam future PDF patches will use — recorded, as P4 requires:**

1. **Node registry:** `NOTE_EXTENSIONS`, `NoteEditor.tsx:24-29` — where a `PdfHighlight` node
   registers (plan Phase 2 / PATCH-100).
2. **Serialization boundary:** `editor.getHTML()` (`:658`) on write, `content: initialContent`
   (`:235`) + the `:286` reconciliation on read.
3. **Reference metadata carrier:** node attributes — `pdfDocumentId`, `pdfHighlightId`,
   `pageNumber`, `bbox`, `colour`, `excerpt`, `sourceFilename`, `sourceNavigationTarget`. These
   are **node attrs, never improvised text strings**, and never loose `padlets.metadata` keys.
4. **Live-reference rule:** the plan's §3.1 *"Paste-as-embed creates a live reference (not a
   copy)"* — the node stores identifiers, the excerpt is display cache only.
5. **Sources/backlinks:** the plan's `note_post_links` table + Phase 2 badge UI. **Nothing is
   reserved in the UI now** — no empty panel, no placeholder.

**Explicitly not added by any part of PATCH-149:** `pdfjs-dist`, `react-pdf`, PDF schema or
migrations, `pdf_documents`, `pdf_pages`, `pdf_highlights`, `note_post_links`, upload, viewer,
highlight creation, a `'pdf'` post type, source badges, backlinks UI, drag-and-drop PDF logic, or
a `PdfHighlight` node implementation. **Plan Phase 0 is not started here.**

---

## 7. Legacy compatibility

**Measured shape:** `padlets.content` is `TEXT`. `CardEditor` writes **plain text**;
`NoteEditor` writes **HTML**; `CardEditor:56` strips tags for `wordCount` and render paths
sanitise via `DOMPurify`, so **some `type:'card'` rows may already contain HTML** from non-editor
paths. The corpus is therefore **mixed and unmeasured per row**.

**Binding rules for whichever option §4 selects:**

- **Read compatibility is mandatory** — every existing document must open. TipTap accepts an HTML
  string, so plain text loads as a single paragraph; this must be **proven on a real stored row**,
  not assumed.
- **No bulk conversion.** The brief forbids silently converting all documents; PATCH-133's hard
  stop requires any `card`-row migration to be **reversible** and to **never touch clipart cards**
  (`metadata.svgUrl` is the discriminator).
- **Lazy conversion only**, on explicit user edit, if conversion happens at all.
- **Schema-free.** No migration is authorized by PATCH-149. If 149B's implementation is found to
  require one, that is a **hard stop** and must return to governance.

---

## 8. Unlocated defects — NOT AUTHORIZED, reproduction required

Defects **2** (cannot exit the active text/container) and **3** (underline/line-post artefact)
**could not be located in the Document modal**, and the brief forbids guessing
(*"Do not guess. Base the selected solution on current source."*).

`CardEditor` has no container concept, no focus trap, no key handler, no underline control and no
line control. The plausible homes are **`NoteEditor`** (TipTap node/container editing) or
**Excalidraw canvas text/container editing** — and the brief's own hard stop says that if the exit
defect belongs to Excalidraw and cannot be bounded, authorization must stop.

**Required before authorization:** which surface, reproduced — the Document modal, the Note modal,
or the canvas. A one-line answer converts both into bounded work; without it, any allowlist would
be speculative.

---

## 9. PATCH-149A — AUTHORIZED SCOPE

Everything here is independent of §4, demonstrable at parent, and cannot be invalidated by the
editor decision.

### Production allowlist — exact

| # | Path | Permitted change | Max lines | Forbidden neighbours |
|---|---|---|---|---|
| 1 | `components/collabboard/CardEditor.tsx` | In the **`!readOnly`** header branch only (`:86-97`): stop rendering the icon block when `metadata?.svgUrl` is absent, so the title reclaims the width | **12** | Must not touch `handleSave`, the textarea, the footer, the `readOnly` branch (`:117-124`, PATCH-151), the close button, or the decorative toolbar (`:133-142`, that is 149B) |
| 2 | `components/collabboard/editors/CardActionsToolbar.tsx` | Remove the obsolete **`Card view`** entry (`:79`) and its now-unused `onToggleCardView` wiring | **20** | Must not alter colour/icon/caption/reaction/comment entries, or any other label |
| 3 | `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | Remove only the `onToggleCardView` prop passed to the **live** toolbar (`:6008-6012`) | **8** | **Must not touch `onEditContent` (`:1758-1766`) or `selectCardModalRoute`**; must not touch the dead `{false && …}` block (`:1789`) |

**Production total ≤ 40 changed lines.** `CanvasClient.tsx` is **not** allowlisted — no route
ownership requires it. `ClipartCardDraftModal.tsx`, `CardPreview.tsx`, `NoteEditor*`,
`usePadletSave.ts`, `package.json`, schema, presentation code and the Excalidraw fork are frozen.

### Test allowlist — exact

| # | Path | Coverage | Max lines |
|---|---|---|---|
| 1 | `components/collabboard/CardEditor.test.tsx` | document header renders **no** icon block and **no** pink `#ec4899`; clipart read-only viewer still renders image + title (PATCH-151 regression); **scoped** `handleSave` guard replacing the whole-file substring | **45** |
| 2 | `components/collabboard/ClipartCardDraftModal.test.tsx` | only if removing `onToggleCardView` touches its asserted toolbar prop set | **20** |

**The scoped guard replaces PATCH-151 O1's brittle assertion** and must slice to the handler:

```ts
const src = fs.readFileSync('components/collabboard/CardEditor.tsx', 'utf8');
const body = src.slice(src.indexOf('const handleSave'), src.indexOf('};', src.indexOf('const handleSave')));
expect(body).toMatch(/if \(readOnly\)\s*\{\s*onClose\(\);\s*return;/);
```

No jsdom, no Testing Library, no Playwright, no `package.json` change.

### Induced failures — each demonstrable at `177645b`

1. Rendering `CardEditor` editable with document metadata (**no `svgUrl`**) yields
   `backgroundColor:#ec4899` and a `w-16 h-16` block → header test fails.
2. `CardActionsToolbar` source/render contains `label: 'Card view'` → terminology test fails.
3. The current guard passes while `handleSave`'s short-circuit is deleted (PATCH-151 §14i
   reproduced this) → the scoped guard fails at parent, the whole-file one does not.

### Negative controls — reverted, never committed

1. Restore the icon block for a no-`svgUrl` document → header test fails.
2. Reintroduce `Card view` → terminology test fails.
3. Delete `handleSave`'s short-circuit **while adding `if (readOnly) {` elsewhere** → the scoped
   guard must fail (the whole-file guard did not — that is the point).
4. Remove the clipart `<img>` from the read-only branch → PATCH-151 regression test fails.
5. Replace `selectCardModalRoute` at either call site → PATCH-151's route guard fails.

### Validation matrix

Focused `CardEditor` · `CardPreview` (29/29 unchanged) · `ClipartCardDraftModal` (45/45 unless
allowlisted) · `cardModalRoute` route guards (6/6) · **full Vitest** (baseline **66 files /
763 tests**) · clean one-run `npm run typecheck` (**410** declarations, exit 0) ·
`npx tsc --noEmit` · `npx next build` · bridge exclusion (**891** files, no marker) · clean E2E
build (marker `1`) · ordinary `.next` restored · `git diff --check` · only the five protected
paths outside committed history.

### False-green protection

Reject: styling-only changes · removing the icon block from the **read-only clipart** branch ·
leaving a layout gap where the block was · renaming `Open card` again · half-renaming the
terminology pair · touching `selectCardModalRoute` · whole-file substring guards where slicing is
possible · absorbing any 149B item · adding PDF anything.

---

## 10. Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Current editor identity cannot be established | **NOT TRIGGERED** — established precisely (§1, §2a) |
| **Save-versus-close requires an unresolved destructive product decision** | **TRIGGERED → 149B** (§4) |
| Structured-content preparation requires a schema migration | **NOT TRIGGERED** — P4 defers; no migration authorized |
| **Formatting fixes require replacing the editor** | **TRIGGERED → 149B** — all five controls are class C; the fix *is* an editor decision (§3a) |
| **Text/container exit defect belongs to Excalidraw and cannot be bounded** | **TRIGGERED (unresolved)** — not located; §8 |
| PDF preparation would require Phase 0 | **NOT TRIGGERED** — Phase 0 explicitly not started |
| File set cannot be narrowed | **NOT TRIGGERED for 149A** — 3 files, ≤40 lines |
| Existing document compatibility cannot be preserved | **NOT TRIGGERED** — untouched by 149A; binding rules set for 149B (§7) |

**Three hard stops trigger, all inside 149B. None blocks 149A.** Hence the split.

---

## 11. Status and dependencies

**PATCH-149A: OPEN · AUTHORIZED · ≤40 production lines across 3 files.**
**PATCH-149B: OPEN · BLOCKED — two product decisions required:**

> **B-i — Document editor identity.** Should the Document Post open **`NoteEditor` (TipTap)** —
> fixing formatting, resolving the body format, unlocking PDF Option P1 and matching the
> authoritative plan, at the cost of a compatibility strategy for existing plain-text `card` rows —
> or remain on **`CardEditor`** with its five non-functional controls removed?
>
> **B-ii — Save versus close.** Keep **save-on-close** (today's behaviour, relabelled honestly), or
> introduce an **explicit Save with a non-saving close**, which requires dirty tracking and a
> discard flow?

**Also required, not a decision but a reproduction:** which surface exhibits defects 2 and 3 (§8).

| Patch | Status |
|---|---|
| **PATCH-149A** | **OPEN · AUTHORIZED** |
| **PATCH-149B** | **OPEN · BLOCKED** on B-i and B-ii |
| PATCH-139 / 151 | CLOSED — routing frozen, not reopened |
| PATCH-140 | SUPERSEDED — its component 6 is B-i |
| PATCH-150 | **RESERVED, separate** — presentation index-domain divergence; untouched |
| PATCH-141 | DEFERRED — not authorizable |
| PATCH-135 · 146 · 147 | OPEN / RESERVED, non-blocking |
| PDF plan PATCH-090…105 | **Future work, architectural dependency only.** Phase 0 not started |

---

## 12. Recorded diagnostic notes

- **The feature was built on the wrong side of a duality nobody re-checked.** A 1,165-line TipTap
  editor with a fully wired toolbar sat one directory away while the Document Post shipped a
  175-line textarea with five painted buttons. Four patches refined the *routing to* that textarea
  without asking whether it was the right destination.
- **"Buttons don't work" was an architecture report.** The five controls are not broken wiring;
  they are a rich-text toolbar drawn over a plain textarea. Classifying them A/B/C/D — as the
  brief demanded — is what converted a bug list into a design decision.
- **The authoritative plan already named the answer.** Its §1 says document assembly lives in the
  `note` post and its Phase 2 modifies `NoteEditor.tsx`. The PDF work was never going to attach to
  `CardEditor`; PATCH-149 is where that becomes visible instead of expensive.
- **An empty pink square is a precise bug.** `iconBgColor || '#ec4899'` with a conditional `<img>`
  renders nothing but its own background whenever the card has no clipart — the defect the user
  described in colour, reproduced exactly from source.
