# PATCH-149 — DOCUMENT POST USABILITY, MODAL CLEANUP, PDF-READY FOUNDATION

**Status:** **STAGED · PATCH-149A CLOSED (`c23be50`) · PATCH-149B0 CLOSED (`c9ea345`, review §17) ·
PATCH-149B1 **SPLIT after measurement** (§19) — corpus measured (2 Document rows, zero HTML,
predicate **P1 safe**), routing census corrected (`DrawingLayout` not reachable; the two reachable
routes are capability-gated but drop the title) · **PATCH-149B1a CLOSED (`c44a2ac` + correction
`856f54b`) · REVIEWED §20 (classification 4, correction required) → CORRECTED → REVIEWED §21
(classification 1, PASS · READY FOR CLOSURE)** · **PATCH-149B1b SPLIT (S2, §22) — B1b-i IMPLEMENTED
(`80011ee`) · REVIEWED §23 → CLASSIFICATION 4, CORRECTION REQUIRED (§23.15: F3 title/description reset
on parent re-render) — DID NOT CLOSE; B1b-ii BLOCKED, NOT RELEASED** · PATCH-149B2 BLOCKED behind
B1b-ii · PATCH-149C RESERVED · NOT PUSHED**
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

---

## 13. PATCH-149A — INDEPENDENT CLOSURE REVIEW

**Reviewed:** 2026-08-04 (independent closure reviewer). **Implementation commit:** `c23be50`
`fix(document): clean modal header and remove dead card view`. **Parent:** `a53a5f0`. All evidence
below was re-executed independently in this review, not taken from the implementation's own
report.

### Source-scope result

Confirmed via `git diff a53a5f0 c23be50 --numstat`: **exactly five files**, all within budget.

| File | Lines changed | Budget | Result |
|---|---|---|---|
| `CardEditor.tsx` | 6 (2 ins / 4 del) | ≤12 | ✓ |
| `editors/CardActionsToolbar.tsx` | 9 (1 ins / 8 del) | ≤20 | ✓ |
| `canvas/ui/FreeformPadletCards.tsx` | 5 (0 ins / 5 del) | ≤8 | ✓ |
| `CardEditor.test.tsx` | 36 (34 ins / 2 del) | ≤45 | ✓ |
| `ClipartCardDraftModal.test.tsx` | 2 (1 ins / 1 del) | ≤20 | ✓ |

**Production total: 20 lines** (budget ≤40). `git diff a53a5f0 c23be50 -- <frozen paths>` returned
empty for `CanvasClient.tsx`, `lib/domain/canvas/cardModalRoute.ts`, `NoteEditor.tsx`,
`NoteEditorToolbar.tsx`, `ClipartCardDraftModal.tsx`, `CardPreview.tsx`, `package.json`, `.fable5`.
**Confirmed unchanged.**

### Ordinary Document header result

Confirmed by direct source read: `CardEditor.tsx:86-95` now reads
`{metadata?.svgUrl && <div className="w-16 h-16 …">…</div>}`. For a document with no `svgUrl`,
**the entire block — including its `gap-6` contribution — is absent**, not merely visually hidden;
this was verified with a fresh `renderToStaticMarkup` render showing no `w-16 h-16`, no `#ec4899`,
no `<img>` in the output. The title `<div className="flex-1">` is the header's only remaining
child, so it reclaims the full width. **Not a hidden-but-space-consuming false green.**

### Clipart regression result

Verified against both branches: editable branch (`:86-95`, `!readOnly`) still renders the `<img>`
when `svgUrl` is present (confirmed via render); read-only branch (`:114-123`, PATCH-151's viewer,
**untouched by this diff**) still renders `<img src={metadata.svgUrl}>` with `View Document`
fallback. `ClipartCardDraftModal.tsx` has **zero diff** — confirmed directly, not inferred. Creation
flow (`ClipartCardDraftModal`'s own `CardEditor` mount at `:427-443`) is unchanged.

### Reclaimed-layout result

Confirmed: the conditional wraps the *entire* 64px block plus its `shadow-inner`/background, not
just the `<img>` — there is no leftover empty pink square and no reserved column. **Not rejected.**

### Dead Card view result — Classification A

`CardActionsToolbar.tsx`'s `tools` array no longer contains a `'Card view'` entry (confirmed by
direct read of the current tool list: Color, Icon, optional Caption, Reaction, Comment). The live
prop wiring at `FreeformPadletCards.tsx:6010-6015`(new) no longer passes `onToggleCardView`
(confirmed by diff — 5 lines removed, `onEditContent` at `:1758-1766` untouched). The **dead**
`{false && cardToolbarPadletId === padlet.id && (…)}` block (`:1791`) still contains its own
`onToggleCardView` at `:1808` — read directly and confirmed unreachable (`false &&` short-circuits
before evaluation; `cardToolbarPadletId` cannot make it reachable).

Grep for `showCardView` repo-wide (9 hits) confirms it has **zero writers** outside governance
prose and the type declaration — only readers remain (`FreeformPadletCards.tsx:1768,1795,5992`,
`ClipartCardDraftModal.tsx:180`). No live or user-visible route to the removed action exists
anywhere in the codebase.

**One thing worth recording that the implementation report did not claim, and that this review
verified independently:** removing the `'Card view'` entry from `CardActionsToolbar`'s shared
`tools` array — rather than only removing the prop at each call site — also **inertly dead-ends**
`ClipartCardDraftModal.tsx`'s own `isCardViewOpen`/`setIsCardViewOpen` state (`:59, :194-196,
:428-440`). That state's only setter is inside the `onToggleCardView` callback passed to
`CardActionsToolbar`, and since the toolbar no longer renders a button that invokes it, the
callback — and the `CardEditor` it would open at `:427-443` — is now unreachable through the UI,
**without a single line changing in the frozen file**. The test `'keeps Color, Icon, and Card view
actions functional'` (`ClipartCardDraftModal.test.tsx:871-884`) still passes because it invokes
`props.onToggleCardView()` directly off the React element `ClipartCardDraftModal` authored, bypassing
`CardActionsToolbar`'s button layer entirely — it tests that the wiring *would* still work if
reconnected, not that a live button exists. This is a deeper and more complete removal than the
allowlist strictly required, and it required no scope expansion to achieve.

**`onToggleCardView?: () => void` classification: A — acceptable compatibility residue.** No
visible action, no live invocation anywhere in the codebase (verified above, not assumed), retained
solely so the frozen `ClipartCardDraftModal.tsx` and the dead `{false && …}` block remain
typecheck-valid. `isCardView` was correspondingly left untouched at every call site, exactly as
governed. `Open card` (`CardPreview.tsx:71,149`) confirmed unchanged — present verbatim, and its
removal was independently proven to break 3 PATCH-139 tests (see Negative controls).

### Scoped `handleSave` guard result — Classification A

Read `CardEditor.test.tsx:92-98` directly. The test slices `src.indexOf('const handleSave')` to
`src.indexOf('};', start)` — a narrow, function-body-only slice, not a whole-file scan — then
asserts the short-circuit pattern is present in that slice **and** that `if (readOnly)` precedes
`onSave(` within it. Independently reproduced PATCH-151 §14i's exact failure mode: with the literal
relocated outside `handleSave` (short-circuit deleted from the function, `if (readOnly) { /* decoy
*/ }` added below it, same literal text preserved elsewhere in the file), **the scoped guard fails**
— confirmed by direct test run, not assumed. The anchors (`const handleSave` / next `};`) are stable
for this file's structure and narrow enough to exclude the rest of the 174-line file. **Classification
A — adequate for the current node-only test environment.** No jsdom or package change required or
requested.

### Runtime-semantics result

Confirmed unchanged by direct source read and diff: `handleSave`'s save-on-close and read-only
short-circuit logic (`:58-72`) is untouched — the diff touches only the header JSX, never the
handler body. Viewer no-op `onSave`, modal close behaviour, `selectCardModalRoute` and both its call
sites, the `?openPadlet=` route, normal-card and clipart-card routing, `NoteEditor`/`NoteEditorToolbar`
(zero diff, confirmed), and persistence format are all untouched. **No PATCH-149B work is present**
— no Save button, no dirty tracking, no editor-identity change, nothing routed to `NoteEditor`.

### Parent induced-failure result

Independently reproduced at `a53a5f0` by checking out the three parent production files against
the current (HEAD) test files:

1. Ordinary-document header test — **failed** (`w-16 h-16`/`#ec4899` block present in parent's
   output, reproduced verbatim in the assertion diff).
2. `Card view` label test — **failed** (`'Card view'` present in parent's toolbar label array).
   Combined run: **2 failed / 61 passed** (matches the two independently-reproduced defects; the
   implementation's own report of "1 failed/62" and "1 failed/44" reflects running the files
   separately — the totals reconcile).
3. Scoped-guard defeat of the old whole-file assertion was independently reproduced separately
   (below, under negative controls) rather than assumed from the implementation's report.

All three parent defects are corrected at `c23be50`.

### Negative controls — 5/5, independently executed and reverted

All five were performed by this reviewer directly (not re-trusted from the implementation), each
reverted via `git checkout HEAD --` and confirmed byte-identical via `git hash-object` against the
committed blob before and after:

1. Restored the ordinary icon wrapper (reverted the conditional) → header test **failed** as
   expected.
2. Removed the clipart `<img>` from the read-only branch (`:114-123`) → PATCH-151 regression test
   **failed** as expected (`renders the clipart image and content…`).
3. Restored the `Card view` tool-array entry (via parent-file swap, combined with #1 above) →
   label test **failed** as expected.
4. Moved `handleSave`'s short-circuit out of the function body while leaving `if (readOnly) {`
   elsewhere in the file → scoped guard test **failed** as expected (the defect the scoped guard
   exists to catch).
5. Altered `Open card` → `Open card ALTERED` in `CardPreview.tsx` → **3** PATCH-139 tests failed
   as expected.

All files hash-matched their committed blobs after revert:
`CardEditor.tsx=a282407…`, `CardEditor.test.tsx=aaba4ec…`, `CardActionsToolbar.tsx=2b48357…`,
`ClipartCardDraftModal.test.tsx=ef1c075…`, `FreeformPadletCards.tsx=f453f8f…`,
`CardPreview.tsx=85f6db6…`.

### Tests and builds — independently rerun

- Focused (`CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute`): **98/98**.
- Full Vitest: **66/66 files, 765/765 tests**.
- Clean `npm run typecheck` (preflight + `tsc --noEmit`): **exit 0**.
- `npx next build`: **first attempt failed** on a stale `.next` cache left over from an earlier
  session build (`uncaughtException [TypeError: Cannot read properties of undefined (reading
  'length')]`, no stack trace pointing at application code) — **not attributable to this
  implementation**. After `rm -rf .next` and rebuilding clean: **exit 0**.
- `npm run verify:bridge-exclusion`: **891 files, no marker, exit 0.**
- `npm run build:e2e`: **exit 0**, `.next/E2E_BRIDGE_BUILD` contains `1`.
- Ordinary `.next` restored (`rm -rf .next && next build`): **exit 0**, marker absent, exclusion
  re-verified clean at 891 files.
- `git diff --check`: **exit 0**.

### Observations (non-blocking)

- The stale-`.next`-cache build failure on first attempt is worth a standing note: a leftover
  `.next` from a prior E2E or interrupted build in the same working tree can produce an opaque
  `uncaughtException` with no actionable stack trace. `rm -rf .next` before any governed build
  verification removes the ambiguity. Not a defect in this patch; recorded so the next
  implementer or reviewer doesn't misattribute it.
- The `onToggleCardView?` optional-prop residue (Classification A) is exactly the shape PATCH-149's
  own §9 anticipated ("Do not require modifying ClipartCardDraftModal merely to delete an unused
  prop unless the remaining prop causes actual behavior or false product semantics") — it causes
  neither.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx.image-canvas-editor-temp.bak` is a
  tracked backup file containing a stale pre-149A copy of the dead block (`onToggleCardView` at its
  own line 1624). It was untouched by `c23be50` and is out of scope for PATCH-149A, but its
  presence in version control is itself an anomaly worth flagging for a future housekeeping patch —
  not raised as a finding against this closure.

### Final classification

**1 — PASS · READY FOR CLOSURE.**

No CRITICAL or HIGH issues. No false greens. All acceptance criteria independently re-verified
rather than trusted. The one build hiccup was traced to environment cache state, reproduced as
non-reproducible after a clean rebuild, and is not attributable to the changed files.

### PATCH-149A status

**CLOSED.**

### PATCH-149B status

**Unchanged — OPEN · BLOCKED** on B-i (document editor identity) and B-ii (save-versus-close),
per §4. Not evaluated or reopened by this review.

---

## 14. PATCH-149B — MIGRATION ARCHITECTURE · **BLOCKED**

**Authored:** 2026-08-04 (governance architect). **Base:** `e6e9122`. **Product decisions B-i and
B-ii are supplied and binding** (§14.1). **Result: the migration is architecturally correct and is
NOT authorized for implementation, because it cannot be verified in the current test environment
(§14.5), and because `NoteEditor` cannot be reused without restructuring 1,165 untested lines
(§14.4).** No production or test file was modified in this authoring turn.

### 14.1 Supplied product decisions — recorded as binding

**B-i — Editor identity.** Document Posts must use the existing TipTap `NoteEditor` path. No second
rich-text editor. No new `document` padlet type. Continue persisting as the existing card type if
that is narrowest. **Accepted, and confirmed correct by §14.4 evidence** — the direction is right;
only its *verifiability* blocks it.

**B-ii — Save/close.** Explicit Save · non-saving Close · unsaved-change confirmation · backdrop and
Escape follow the same dirty rules · read-only Close immediate and non-writing · never silently
auto-save on Close. **Accepted. Not implementable inside `NoteEditor` without changing Note Post
behaviour** (§14.7) — which B-ii does not authorize, since it governs Document Posts only.

### 14.2 Route and type census (measured at `e6e9122`)

| Concern | Exact path | State owner | Persisted type | Modal component | Capability guard | Content format | Title | Close/Save behaviour | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| Document tool | `canvasToolbarRegistry.tsx:97` — `{ icon: FileText, label: "Document", type: "document" }` | registry | — | — | workspace toolbar gate | — | — | — | frozen |
| Document creation | `CanvasClient.tsx:5400-5418` | `setPadletToEdit` | **`'card'`**, `title:''`, `content:''`, 180×220, `metadata:{...createMetadata}` — **no discriminator** | `CardEditor` via `setIsCardEditorOpen(true)` | — | plain text | `padlets.title` | — | **B2** |
| Note creation | `CanvasClient.tsx:5380-5399` | `setPadletToEdit` | `'text'`, `title:'New Note'`, 280×250 | `NoteEditor` via `setIsNoteEditorOpen(true)` | — | HTML | hardcoded | — | frozen |
| Open (all routes) | `CanvasClient.tsx:5692-5708` `openPadletInTypeEditor` | — | — | branch chain | `selectCardModalRoute(canUseFreeformEditButton)` | — | — | — | **frozen (PATCH-139/151)** |
| ↳ clipart branch | `:5700-5703` — `type==='card' && metadata?.svgUrl` | — | `'card'` | `ClipartCardDraftModal` / `CardEditor` viewer | capability | — | — | — | **frozen** |
| ↳ document branch | `:5704-5707` — `type==='card'` (no `svgUrl`) | — | `'card'` | `CardEditor` editor / viewer | capability | plain text | `title` | save-on-close | **B2** |
| ↳ fallback | `:5708` `else setIsNoteEditorOpen(true)` | — | `'text'`/other | `NoteEditor` | none | HTML | — | save-on-close | frozen |
| Context-menu route | `CanvasClient.tsx:5713-5721` `openPadletTargetFromContextMenu` → same `openPadletInTypeEditor` | — | — | — | inherited | — | — | — | frozen |
| Section "open post" | `CanvasClient.tsx:6480`, `:6570`, `:6729` — `setPadletToEdit(post); setIsNoteEditorOpen(true)` | — | — | `NoteEditor` | **none — bypasses `openPadletInTypeEditor` entirely** | — | — | — | **observation, §14.11** |
| Preview affordance | `CardPreview.tsx:71,149` `aria-label="Open card"` → `onEditContent` | — | — | — | `FreeformPadletCards.tsx:1761` capability | — | — | — | **frozen (PATCH-139)** |
| Direct `?openPadlet=` | `openPadletInTypeEditorRef` (`CanvasClient.tsx:5711`) | — | — | same chain | same capability | — | — | — | **frozen** |
| Editable document modal | `CanvasClient.tsx:~7379` `<CardEditor isOpen={isCardEditorOpen} …>` | `CanvasClient` | `'card'` | `CardEditor` | — | plain text | prop | `handleSave` on X + backdrop | **B2/B3** |
| Read-only document viewer | `CanvasClient.tsx:7366-7377` `<CardEditor isOpen={isCardViewerOpen} … readOnly onSave={() => setIsCardViewerOpen(false)}>` | `CanvasClient` | `'card'` | `CardEditor` | capability-routed | plain text | prop | no-op save, immediate close | **B2** |
| Note modal mount | **`components/collabboard/canvas/ui/CanvasModals.tsx:136-149`** (474 lines) — *not* `CanvasClient` | `CanvasModals` | `'text'` | `NoteEditor` | none | HTML | **not passed** | save-on-close | **B2** |
| Document save | `usePadletSave.ts:973` `saveCard(data: {title, content, metadata})` | hook | `'card'` | — | — | plain text | **has title** | insert on `id==='new'` | **B3** |
| Note save | `usePadletSave.ts:359` `saveNote(data: SaveNoteData)` | hook | `'text'` | — | — | HTML | **no title field; hardcodes `'New Note'`** | insert on `id==='new'` | **B2 blocker** |
| Empty-draft guard | `usePadletSave.ts:981-999` | hook | — | — | — | — | — | **silently discards blank new cards** | **answers C-lifecycle, §14.8** |

### 14.3 Document predicate — **STABLE, verified; hard stop NOT triggered**

Every `type: 'card'` creation site in the repository was enumerated and traced:

| # | Site | Produces `svgUrl`? | Is a Document? |
|---|---|---|---|
| 1 | `CanvasClient.tsx:5408` — Document tool | **no** | **yes** |
| 2 | `CanvasClient.tsx:4868` — `handleFreeformCardDrop` | yes | no (clipart) |
| 3 | `CanvasClient.tsx:7503` — clipart library pick | yes | no (clipart) |
| 4 | `RowColumnContainerCard.tsx:284` — SVG drop into container | yes | no (clipart) |
| 5 | `usePadletSave.ts:1024` — `saveCard` insert | inherits draft metadata | either |
| 6 | `CanvasClient.tsx:1695-1704` — draft `kind:'card'` | inherits draft metadata | either |

`kind: 'card'` is produced at **exactly one** site — `usePadletSave.ts:1006`, the `saveCard`
placement-prompt draft — so #5 and #6 are not independent creators; they re-persist an existing
draft's own metadata. **Therefore no path creates a non-clipart `type:'card'` post except the
Document tool.**

**THE DOCUMENT PREDICATE (single, exact, reused everywhere):**

```
isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl
```

This is not new: it is already the de-facto discriminator at `CanvasClient.tsx:5700` vs `:5704`, and
PATCH-134 §239 states it verbatim (*"`type: 'card'` and no `svgUrl` is what makes it document-like
rather than clipart"*). It correctly **excludes** clipart cards (`svgUrl`), text/sticky notes
(`'text'`), comments (`'comment'`), embedded media (`'image'`/`'link'`), and every other type.
**No new metadata discriminator is required or authorized** — introducing one would create a second
source of truth for the same concern (P6) and would not classify legacy rows anyway.

### 14.4 Editor migration option — **M4 · HARD STOP** (target M2 once unblocked)

`NoteEditor` was read in full. It **cannot** host a Document Post as it stands:

| Requirement | `NoteEditor` at `e6e9122` | Verdict |
|---|---|---|
| Mountable inside a document modal | **No** — it *is* a modal: `:697-700` renders `fixed inset-0 z-[1000] … bg-black/50` with its own overlay click handler, and `:692` returns `null` unless `isOpen` | **M1 impossible** — nesting yields modal-in-modal |
| Document-sized surface | **No** — `:749` hardcodes `width: '280px'` (sticky-note geometry) | blocker |
| `title` prop | **Absent** from `NoteEditorProps` (`:88-122`) | blocker — Documents own a title (`saveCard.title`) |
| `readOnly` prop | **Absent entirely** | blocker — read-only Document view is a required deliverable |
| Save contract | `:102-119` `onSave` emits `content, cardColor, topStrip, textColor, reactions, badgeColor, detachedComments` — **no `title`, no metadata passthrough** | blocker — incompatible with `SaveCardData {title, content, metadata}` |
| Explicit Save | **None** — `:657` `handleSaveAndClose`, `:672` `handleClose → handleSaveAndClose`, `:677` `handleOverlayClick → handleSaveAndClose` | **the identical B-ii defect** |
| Dirty state | **None** — no dirty flag, no change callback, no imperative getter, no baseline | blocker |
| Escape handling | **None** at modal level (`:997` is a comment-input-local key handler only) | blocker |

**M1 (mount directly): impossible** — nested modals, no title, no readOnly, wrong save shape.
**M2 (narrow wrapper): collapses into M3** — a wrapper cannot suppress `NoteEditor`'s own overlay,
280px card, or save-on-close without editing `NoteEditor` itself.
**M3 (extract shared TipTap core): the only technically viable route** — and it means restructuring
a **1,165-line component with zero test coverage** that owns the shipped Note Post, in an
environment that **cannot execute it** (§14.5). The extraction would move `useEditor`,
`NOTE_EXTENSIONS`, 11 formatting handlers, the comment-thread system, colour state and popup
wiring — i.e. most of the file.

**SELECTED: M4 — HARD STOP.** The brief's own hard stop *"NoteEditor cannot be reused without
duplicating most of it"* is triggered on measured evidence. **M2 remains the correct target** once
§14.5 is resolved; this is a sequencing block, not a rejection of B-i.

### 14.5 **Decisive blocker — the migration cannot be verified in this environment**

Measured, not assumed:

1. `vitest.config.ts` sets **`environment: 'node'`**.
2. **`jsdom` and `happy-dom` are absent from `node_modules`.** (`@testing-library/{dom,jest-dom,react}` are present but cannot render without a DOM environment.)
3. The include glob is `components/collabboard/*.test.tsx` — it does **not** cover
   `components/collabboard/editors/`, where `NoteEditor` lives. A test placed beside it would not
   even be collected.
4. **`NoteEditor` has no test file. Zero.**
5. **Proven by direct probe** (temporary throwaway config + probe file, both deleted; tree verified
   clean): `renderToStaticMarkup(<NoteEditor isOpen initialContent="<p>Legacy HTML body</p>" … />)`
   **does not throw — it returns a string of length 0.** Because `useEditor({immediatelyRender:
   false})` leaves `editor` null on first render, `:692` returns `null`.

**Consequence.** Every SSR string assertion — the only technique this repository's card/document
tests possess — evaluates against **empty markup**. Required test items **5, 6, 7, 8, 10, 11, 12,
13, 14, 15, 16, 17, 21** (legacy plain-text load, HTML load, formatting persistence, dirty
tracking, Save writes, baseline reset, clean/dirty close, Keep editing, Discard, backdrop, Escape,
read-only has no Save/toolbar, TipTap seam) are **unachievable**.

**Worse than unachievable — actively dangerous.** The read-only assertions (`expect(markup).not.
toContain('Save')`, `not.toContain('toolbar')`) would **pass vacuously against an empty string**.
That is precisely the false green this patch's own rules demand rejection of, and it would
manufacture a green validation matrix for a migration nobody had tested.

**The brief forbids the remedy:** *"Do not add jsdom or dependencies unless current NoteEditor tests
already require and support them."* There are no NoteEditor tests. **Adding jsdom is therefore not
authorized here, and without it the migration cannot be honestly validated.** This is the blocker.

### 14.6 TipTap serialization contract (recorded; sufficient for P1, no envelope needed)

- **Input:** `content: initialContent` (`:235`) — TipTap accepts an HTML string; plain text loads as a single paragraph.
- **Reset:** `:285-289` — `setContent(initialContent)` when `initialContent !== editor.getHTML()`.
- **Output:** `editor.getHTML()` (`:658`) — **HTML string**, written to `padlets.content` (`TEXT`).
- **Empty:** TipTap emits `<p></p>` for an empty document, **not** `''` — load-bearing for dirty comparison (§14.7) and for the empty-draft guard (`usePadletSave.ts:981-999`, which strips tags via `/<[^>]*>/g` before testing emptiness — so `<p></p>` correctly reads as empty).
- **Sanitization:** at render, via `DOMPurify` on card/note bodies — not at write.
- **Custom-node preservation:** `NOTE_EXTENSIONS` (`:23-37`) already registers custom nodes/marks (`FontSize`, `Comment`) whose attributes round-trip through `getHTML()` as `data-*` attributes — `Comment` is read back at `:243-272` from `data-comment-id`, `data-comment-thread`, `data-user-id`, `data-timestamp`, `data-color`. **This proves the mechanism a future `PdfHighlight` node needs already works end-to-end in HTML.**
- **Title:** stored **separately** (`padlets.title`), never inside content.
- **Metadata:** `saveNote` spreads `...padletToEdit?.metadata` (`:362`) — passthrough preserved.

**Conclusion: PDF foundation Option P1 is confirmed sufficient. No schema change, no persistence
envelope, no versioning is required** — and none is authorized. The seam is exactly: register a node
in `NOTE_EXTENSIONS`; carry reference data as **node attributes** serialized to `data-*` in HTML;
no modal-level PDF special-casing.

### 14.7 Save/dirty-state architecture (specified, not authorized)

`NoteEditor` currently exposes **none** of: current HTML to the parent, change callback, dirty
callback, imperative getter, Save button, keyboard shortcut, or baseline reset. The governed
contract, for whichever patch implements it:

- **One source of truth:** a `dirty` boolean derived from `normalize(currentTitle, currentHTML) !== normalize(baselineTitle, baselineHTML)`.
- **Normalization boundary (required, because raw HTML comparison is unstable):** compare
  `editor.getHTML()` against a baseline that was itself produced by loading the stored content into
  the editor and reading `getHTML()` back — never against the raw stored string. A stored plain-text
  `"hello"` becomes `<p>hello</p>` on load; comparing raw-vs-serialized would mark every legacy
  document dirty on open. Treat `<p></p>` as equal to `''`.
- Successful Save resets the baseline. Switching documents resets the baseline. **Read-only never becomes dirty.**
- **Save UI:** semantic `<button>` labelled `Save`; disabled when not dirty; `saveCard` is `async`, so a pending state and an error path are required — **errors must surface, never be swallowed** (P3/P10).
- **Save does not close** (B-ii §2). No `Ctrl/Cmd+S` — no existing shortcut infrastructure was found, and adding one is out of scope.

### 14.8 New-document lifecycle — **C1, already the architecture**

`usePadletSave.ts:981-999`: when `padletToEdit.id === 'new'`, `saveCard` inserts **only** on save,
and **silently discards** a draft whose title, tag-stripped content, description and metadata are
all empty. So today: **the row is created on first Save; nothing is orphaned; discard-before-save
is already a no-op.**

**SELECTED: C1 — create the row only on first Save.** It is the least destructive option, it is
what the code already does, and it makes Discard trivially safe (close without persisting; no row
exists to delete). **C2 is explicitly rejected** — creating a placeholder row up front would require
Discard to *delete* it, introducing a destructive path where none exists today.

### 14.9 Read-only rendering — decision recorded, blocked with the rest

**Preferred: a `NoteEditor`-derived read-only renderer** (TipTap in `editable: false`), so viewer and
editor content semantics cannot diverge and future PDF-reference nodes render in both. It must
preserve: capability routing, accessible Close, **no toolbar, no Save, no mutation, no dirty
dialog**, meaningful title, formatted content — and must not regress clipart-card viewing
(PATCH-151 §14). **Blocked by §14.5**: "no toolbar / no Save" is exactly the assertion pair that
passes vacuously on empty SSR output, so this decision cannot be safely validated yet. Until then
the current `CardEditor` read-only viewer (PATCH-151, closed and green) **remains in place
untouched**.

### 14.10 Formatting contract — `NoteEditorToolbar` census

All controls are **wired and functional** (`NoteEditorToolbar.tsx:94-127` ↔ handlers at
`NoteEditor.tsx:308-314`) — in stark contrast to `CardEditor`'s five class-C no-ops (§3a):

| Control | Handler | Persists via `getHTML()` | Document classification |
|---|---|---|---|
| Text style / Bold / Italic / Strikethrough / Underline | `onTextStyle`, `toggleBold`, `toggleItalic`, `toggleStrike`, `toggleUnderline` | yes | **working — include** |
| Bullet list / Numbered list / Code | `toggleBulletList`, `toggleOrderedList`, `toggleCodeBlock` | yes | **working — include** |
| Link | `handleLink` (`:316`), disabled without selection | yes | **working — include** |
| Comment (text) | `onTextComment`, `Comment` extension | yes (`data-*`) | working — **defer**, overlaps three existing comment systems |
| **Align** | `onAlign` — **passed `undefined` at the call site** (`:711-739` never supplies `onAlign`); `@tiptap/extension-text-align` is **not** in `NOTE_EXTENSIONS` | no | **class C — dead; must not be shown on the Document toolbar** |
| Box mode: Card color / Reaction / Post comment | wired | metadata | **note-only — exclude from Documents** |

**Contract:** the Document toolbar exposes only the proven-working text controls; it **must not**
render `Align` (unsupported, would repeat the exact defect PATCH-149 was raised for), and must not
render box-mode note chrome. **No formatting capability beyond existing TipTap extensions is added.**

### 14.11 Unlocated defects — still unlocated; **PATCH-149C**

- **Text/container exit (defect 2).** Re-inspected `NoteEditor`: there is **no modal-level key
  handler and no Escape handling** (the only `Escape` at `:997` is local to a comment input), and
  **no focus trap**. Dismissal is exclusively backdrop-click → `handleSaveAndClose`. So a user who
  clicks *inside* the 280px card has no keyboard exit — consistent with the complaint, but the same
  is true of several surfaces, and **the reporting surface was never identified**. Candidate homes
  remain `NoteEditor`, the Excalidraw text container, and canvas text-edit mode. **Not authorized —
  reproduction still required.**
- **Underline / line-post (defect 3).** `Underline` in `NoteEditorToolbar.tsx:106` is a **legitimate,
  working formatting control and must not be removed on suspicion.** No horizontal-rule control
  exists (`StarterKit`'s `horizontalRule` is bundled but unexposed by the toolbar). A canvas line
  tool exists separately in `FreeformPadletCards`. **Not authorized — the complaint cannot be tied
  to a specific reproducible element.**

**Required to unblock either:** which surface, and what the user clicked immediately before. One
sentence converts both into bounded work.

**Also recorded (new, incidental):** `CanvasClient.tsx:6480`, `:6570`, `:6729` open posts via
`setPadletToEdit(post); setIsNoteEditorOpen(true)` **without** passing through
`openPadletInTypeEditor`, therefore **without the `selectCardModalRoute` capability check**. This is
outside PATCH-149's scope and is **not** a Document-Post route (Documents are `type:'card'` and are
not reachable through these section handlers), so it is **not** a PATCH-139/151 regression — but it
is a capability-routing inconsistency worth its own investigation. **Recorded, not authorized.**

### 14.12 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| No stable Document predicate exists | **NOT TRIGGERED** — `type==='card' && !svgUrl`, verified complete against all six creation sites (§14.3) |
| **`NoteEditor` cannot be reused without duplicating most of it** | **TRIGGERED** (§14.4) — it is a self-contained modal with no title, no readOnly, wrong save shape; M1/M2 both fail |
| Legacy content cannot be read safely without schema migration | **NOT TRIGGERED** — TipTap accepts plain text and HTML; no migration needed (§14.6). *But the corpus remains unmeasured per row* (§7), so the adapter spec is not yet writable |
| New-document discard behaviour unresolvable | **NOT TRIGGERED** — C1 is already the architecture (§14.8) |
| TipTap output cannot preserve future custom nodes | **NOT TRIGGERED** — `Comment` proves attribute round-trip through HTML (§14.6) |
| Save errors cannot be surfaced safely | **NOT TRIGGERED** — `saveCard` is async and throwable; a pending/error path is specifiable (§14.7) |
| Requires touching broad generic card persistence | **NOT TRIGGERED** — no schema/type change; `saveCard` already carries `{title, content, metadata}` |
| Exit/underline defects unlocatable and would require guessing | **TRIGGERED → split to PATCH-149C** (§14.11) — does not block the migration |
| **(New) The migration cannot be validated in the current test environment** | **TRIGGERED — DECISIVE** (§14.5), proven by probe |

### 14.13 Split decision and authorization status

**PATCH-149B is SPLIT and NOT AUTHORIZED for implementation.**

| Unit | Scope | Status |
|---|---|---|
| **PATCH-149B0** | *Prerequisite.* Governed decision on the test environment (§14.14) + per-row measurement of the `type:'card'` content corpus (plain vs HTML vs empty vs malformed), which §7 left unmeasured and which the legacy adapter spec depends on | **REQUIRED FIRST — owner decision** |
| **PATCH-149B1** | Document predicate helper + legacy-content adapter, as **pure functions with node tests**, plus read-only TipTap renderer | **BLOCKED** on B0 |
| **PATCH-149B2** | Explicit Save · dirty baseline · discard confirmation · backdrop/Escape unification | **BLOCKED** on B1 |
| **PATCH-149C** | Reproducible text-exit and/or underline-line defect | **BLOCKED** on reproduction (§14.11) |

**No production allowlist, test allowlist, line budget, induced-failure plan or negative-control set
is issued in this document.** Issuing one would authorize work whose acceptance criteria cannot be
evaluated (§14.5) — the validation matrix would be structurally incapable of distinguishing a
correct migration from an empty render. The allowlists are written **after** B0, when it is known
whether behavioural tests are possible.

**Explicitly NOT authorized and NOT added by anything above:** PDF upload · PDF schema ·
`pdfjs-dist` · viewer · highlights · PDF nodes · source badges · backlinks UI · drag-and-drop PDF ·
a `'document'` padlet type · a second rich-text editor · any `jsdom`/dependency change · any edit to
`selectCardModalRoute`, the normal-card route, the clipart route, `ClipartCardDraftModal`, clipart
creation, the read-only clipart header, or the no-op read-only save route (**all frozen per
PATCH-139/151**).

### 14.14 The single question that unblocks everything

> **May the test environment gain a DOM (`jsdom` or `happy-dom`) plus a `vitest.config.ts` include
> glob covering `components/collabboard/editors/`, so that `NoteEditor` — currently 1,165 lines with
> zero tests — can be characterized *before* Document Posts are migrated onto it?**

- **If yes:** the sequence becomes B0 (add environment + characterize current `NoteEditor` behaviour)
  → B1 → B2, and M2 becomes implementable behind a real safety net. This is the recommended path;
  it also retires the standing risk that the Note Post has no regression coverage at all.
- **If no:** the migration cannot proceed honestly. The only alternative consistent with B-i would be
  source-guard-only validation, which §14.5 shows produces vacuous passes — and PATCH-151 §14i
  already demonstrated in this very file family how a source-text guard passes while the behaviour it
  claims to protect is gone. **Governance will not authorize a migration validated that way.**

**PATCH-149A:** CLOSED (`c23be50`, review `e6e9122`).
**PATCH-149B:** **OPEN · BLOCKED** — architecture defined, implementation not authorized.
**PATCH-149C:** RESERVED — blocked on reproduction.
**PATCH-150:** RESERVED, separate (presentation index-domain divergence); untouched.

---

## 15. PATCH-149B0 — NOTEEDITOR DOM CHARACTERIZATION HARNESS · **AUTHORIZED**

**Authored:** 2026-08-04 (governance architect). **Base:** `e25fe32`. The owner has authorized a
DOM-capable test environment and an expanded include glob for NoteEditor characterization. **This
is test infrastructure, not product functionality. Production scope is empty.**

**Every compatibility claim below was measured by executing it**, using a `npm install --no-save`
probe (which leaves `package.json` and `package-lock.json` untouched — hashes verified identical
before and after: `b769e4c…` / `605a84f…`) plus a temporary probe test, both fully removed and the
suite re-verified at 66/66 · 765/765 before this document was written. **Nothing here is inferred.**

### 15.1 Environment choice — **OPTION T2 · ADD `jsdom` AS A DEV DEPENDENCY**

| Option | Result |
|---|---|
| **T1 — already available** | **REJECTED.** `node_modules/jsdom` and `node_modules/happy-dom` are both absent; `npm ls jsdom happy-dom` returns empty. Neither is declared nor transitively installed. |
| **T2 — add `jsdom`** | **SELECTED.** See compatibility below. |
| **T3 — add `happy-dom`** | Not needed. `jsdom` proved compatible on first attempt with zero polyfills; T3 is reserved as a fallback only if `jsdom` later proves heavy. |
| **T4 — blocked** | **NOT TRIGGERED.** |

**Compatibility — verified, not assumed:**

- **`jsdom` and `happy-dom` are declared *optional peerDependencies* of `vitest@3.2.7`**
  (`peerDependenciesMeta` marks both `optional: true`). Adding `jsdom` is therefore the officially
  supported path, **not** a workaround.
- Node **v24.11.1** satisfies vitest's `engines: ^18 || ^20 || >=22`.
- **`jsdom@29.1.1`** installed and ran cleanly against the current React 19.2.7 / Next 15.5.20 /
  TipTap 3.x / TypeScript 5 stack.
- **No upgrade of React, Next.js, Vitest, TipTap, TypeScript or Node tooling is required or authorized.**

### 15.2 TipTap actually mounts — the load-bearing measurement

Mounting `NoteEditor` under `jsdom` via `react-dom/client` + React 19 `act`:

| Measurement | Result |
|---|---|
| Mount error | **none** |
| Rendered DOM | **9,024 characters** (vs **0** under `environment: 'node'` — §14.5) |
| ProseMirror mounted | **yes** (`ProseMirror` class present) |
| Legacy HTML content rendered | **yes** — `<p>Legacy HTML body</p>` visible as text |
| Empty content | **safe** — 9,114 chars, ProseMirror present, no throw |
| Buttons rendered | **12** |
| `Bold` control | present |
| **`Align` control** | **present and rendered** — so §14.10's dead control is *measurable*, not merely inferred |
| Closed state (`isOpen=false`) | **0 characters** |

**Browser-API census under `jsdom@29.1.1`:**

| API | Present | Needed by this scope |
|---|---|---|
| `window`, `document`, `getSelection`, `Range`, `DOMParser`, `MutationObserver`, `requestAnimationFrame`, `getBoundingClientRect` | **yes** | yes — all satisfied |
| `ResizeObserver` | **no** | **not required** — mount succeeded without it |
| `matchMedia` | **no** | **not required** — mount succeeded without it |

**Therefore NO setup file and NO polyfills are authorized.** The brief permits polyfills only when
*actually required*; measurement proves none is. Should a future characterization open a Radix-backed
popup (`TextStylePopup`, `LinkPopup`, `CommentPopup`, `EmojiReactionPicker`), `ResizeObserver` and
`matchMedia` may become necessary — **that is a B0 follow-up, not authorized now**, and popup
interaction is explicitly out of scope (§15.5).

### 15.3 **Mandatory teardown discipline — a real hazard, and its proven fix**

The first probe produced a genuine stability failure:

```
ReferenceError: document is not defined
  ❯ EditorView.get root  prosemirror-view/dist/index.js:5586
  ❯ DOMObserver.flush    prosemirror-view/dist/index.js:4685
  ❯ Timeout._onTimeout   prosemirror-view/dist/index.js:4615
Vitest caught 1 unhandled error during the test run.
This might cause false positive tests.
```

ProseMirror's `DOMObserver` schedules a `setTimeout` flush that fires **after** the jsdom
environment is torn down. Vitest itself flags this as a false-positive risk — which would have
undermined the very honesty this harness exists to provide.

**Proven fix, and it is binding:** unmounting every mounted root in `afterEach`
(`act(() => root.unmount())` plus removing the container) **eliminated the error completely** —
second probe ran 4/4 clean with zero unhandled errors. **No polyfill, no `NoteEditor` change, no
production change.**

> **BINDING RULE:** every `NoteEditor` characterization test **must** unmount in `afterEach`.
> A test file that mounts without unmounting is a **rejectable defect**, not a style preference.

### 15.4 Include-glob defect — and the trap that must not be sprung

Current: `include: ['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts', 'scripts/harness/**/*.test.ts', 'components/collabboard/*.test.tsx']`.

The final entry is **non-recursive**, so `components/collabboard/editors/` — where `NoteEditor`
lives — is **not discovered**. That is the defect.

**MEASURED TRAP:** `components/collabboard` contains **148** `*.test.ts*` files, of which
**143 belong to the vendored Excalidraw fork**. A recursive
`components/collabboard/**/*.test.tsx` would therefore silently pull in **143 vendored fork tests** —
precisely the "no vendored/fork files become included accidentally" hard stop, and it would also
corrupt the 66/765 baseline beyond recognition.

**AUTHORIZED CHANGE — exactly one array entry added, non-recursive:**

```
'components/collabboard/editors/*.test.tsx'
```

Verified: `components/collabboard/editors/` currently contains **0** test files and exactly one
subdirectory (`extensions/`, no tests). A single-level glob there captures **0 fork files, 0 E2E
files, 0 generated files** and creates **no duplicate discovery** (it is disjoint from the existing
non-recursive `components/collabboard/*.test.tsx`). **Recursive globs are forbidden.**

### 15.5 Environment strategy — **per-file, not global**

**AUTHORIZED: the `// @vitest-environment jsdom` docblock on the characterization file only.**
`test.environment` in `vitest.config.ts` **stays `'node'`.**

**Verified by execution:** the probe ran with the config declaring `environment: 'node'` while the
file's docblock declared `jsdom` — and it got a full DOM. The per-file override works on
`vitest@3.2.7`.

**Consequence: all 765 existing tests keep running in `node`.** Nothing is migrated to jsdom.
The brief's *"Do not make all 765 existing tests run in jsdom unless source evidence proves that is
the only safe option"* is satisfied by the narrowest possible means — no environment-match globs, no
second Vitest project, no config `environment` change.

### 15.6 Characterization contract — behaviour to *record*, never to correct

Already measured by probe; the implementation must assert these as the frozen baseline:

| # | Contract | Measured value at `e25fe32` |
|---|---|---|
| 1 | Closed state | `isOpen=false` ⇒ container innerHTML length **0** |
| 2 | Open state | real DOM > 1,000 chars; overlay `fixed inset-0 z-[1000]`; ProseMirror present; toolbar present |
| 3 | **Save-on-close order** | backdrop click ⇒ callbacks fire **`["save", "close"]`** — save strictly before close |
| 4 | Backdrop | dismissal **does persist** (current defect — characterize, do not fix) |
| 5 | **Escape** | **no handler exists** — `keydown{Escape}` ⇒ `onSave` calls **0**, `onClose` calls **0**. Assert the absence; **do not invent support** |
| 6 | Content init | `<p>Legacy HTML body</p>` renders as text; `initialContent=""` initializes safely |
| 7 | Formatting toolbar | working controls locatable; **`Align` renders** despite being unwired (§14.10) — measure, do not change |
| 8 | Editor constraints | 280px card; **no `title` prop**; **no `readOnly` prop** |
| 9 | **Save callback shape** | keys exactly `['content','cardColor','topStrip','textColor','reactions','badgeColor','detachedComments']` — **no `title`, no `metadata`** (empirically confirms §14.4) |
| 10 | **Non-vacuity** | at least one assertion must **fail** if the modal renders empty while `isOpen` — e.g. `expect(container.innerHTML.length).toBeGreaterThan(1000)` **plus** a positive content assertion. A test that only checks "did not throw" or accepts an empty container is **rejected** |

**Out of scope:** opening popups, formatting-command execution, dirty state, read-only, adapters,
Save/Close correction. Those are B1/B2.

### 15.7 Allowlists and line budgets

**PRODUCTION ALLOWLIST: EMPTY.** No production file may change. `NoteEditor.tsx` and
`NoteEditorToolbar.tsx` are **explicitly forbidden**, as is every file frozen by PATCH-139/151.

| # | Path | Permitted change | Max lines |
|---|---|---|---|
| 1 | `package.json` | add **`"jsdom": "^29.1.1"`** to `devDependencies` **only** | **1** |
| 2 | `package-lock.json` | resolution for `jsdom` + its required transitives **only** | not line-budgeted; **bounded by rule** — no unrelated refresh, no churn beyond the added package |
| 3 | `vitest.config.ts` | add exactly one `include` entry (§15.4). **`environment` must remain `'node'`** | **1** |
| 4 | `components/collabboard/editors/NoteEditor.characterization.test.tsx` | **new file** — the entire characterization suite, with the `// @vitest-environment jsdom` docblock and mandatory `afterEach` unmount | **220** |

**No test setup file is authorized** (§15.2 — no polyfill is required).

**Test authoring constraints:** mount with `react-dom/client` `createRoot` + React 19 `act` — both
from **declared** dependencies. **`@testing-library/react` must NOT be used:** it is present at
16.2.0 but is **extraneous**, leaking from the vendored Excalidraw fork's own devDependencies
(`npm ls` shows `@excalidraw/excalidraw@0.18.0 -> @testing-library/react@16.2.0 … extraneous`).
Depending on it would couple the suite to the fork's dependency tree and could vanish on any
install. **Do not mock `NoteEditor`; mount the real component.**

### 15.8 Dependency safety

devDependency only · pinned via the normal `package-lock.json` · `jsdom@29.1.1` verified against
Node 24.11.1 / vitest 3.2.7 · **no unrelated dependency refresh** · transitive impact to be recorded
from the actual lockfile diff · `npm audit` **informational only** unless the addition directly
introduces a new high-severity finding (the probe install surfaced pre-existing advisories unrelated
to `jsdom`; these are **not** this patch's to resolve).

### 15.9 Induced failures — all reproducible at parent `e25fe32`

1. A test placed at `components/collabboard/editors/*.test.tsx` is **not discovered** by
   `npx vitest run` — the glob is non-recursive (§15.4).
2. Forced to run under `environment: 'node'`, DOM APIs are unavailable and **`NoteEditor` renders a
   0-length string** (§14.5, reproduced again here).
3. `renderToStaticMarkup` open-state assertions **pass vacuously** on that empty output — the
   original false green.
4. The governed DOM test **fails** if `NoteEditor` returns `null` while `isOpen=true` (negative
   control 3).

After implementation: discovered by the standard command · jsdom initializes · open-state observes
real UI · save-on-close order characterized as `["save","close"]`.

### 15.10 Negative controls — each must be reproduced, reverted, and hash-verified

1. Remove the `// @vitest-environment jsdom` docblock → characterization **fails**.
2. Remove the `editors/*.test.tsx` include entry → the file is **not discovered** (assert the file
   count / discovery, not merely a pass).
3. Force `NoteEditor` to return `null` while open → **non-vacuity test fails**. *Production
   modification must be reverted and verified byte-identical via `git hash-object`; never committed.*
4. Polyfill control — **N/A by measurement** (§15.2). If the implementer finds a polyfill genuinely
   required, that is a **scope change requiring governance**, not a silent addition.
5. Reverse the expected save/close order to `["close","save"]` → lifecycle test **fails**.
6. **Remove the `afterEach` unmount → the ProseMirror teardown `ReferenceError` returns** (§15.3).
   This control is **mandatory**: it proves the discipline is load-bearing rather than decorative.

### 15.11 False-green protection

Reject if: the test only asserts "did not throw" · an empty container is accepted · source-string
checks substitute for DOM behaviour · all tests are moved to jsdom · **production is modified to make
tests easier** · any characterized defect is *corrected* here · the glob captures E2E/vendor/fork
tests · dependency changes extend beyond `jsdom` · `NoteEditor` is mocked instead of mounted · a
mounted root is left unmounted.

### 15.12 Validation matrix

Focused characterization suite · **proof of discovery through the ordinary `npx vitest run`** (not a
custom config) · `CardEditor` / `CardPreview` / `ClipartCardDraftModal` / `cardModalRoute`
regressions · **full Vitest — expect 67 files (66 + 1) and 765 + N tests; report both totals** ·
clean one-run `npm run typecheck` (410 declarations, exit 0) · `npx next build` · bridge exclusion
(**891** files, no marker) · clean E2E build (marker `1`) · ordinary `.next` restored and exclusion
re-verified · `git diff --check` · **explicit `package.json` + `package-lock.json` diff inspection** ·
only the five protected worktree paths outside committed history.

**Known environment note (from the PATCH-149A closure, §13):** a stale `.next` can produce an opaque
`uncaughtException [TypeError: Cannot read properties of undefined (reading 'length')]`. Run
`rm -rf .next` before build verification; it is not a defect of this patch.

### 15.13 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| DOM package incompatible with current Node/Vitest | **NOT TRIGGERED** — `jsdom` is an optional peer of vitest 3.2.7; `jsdom@29.1.1` ran on Node 24.11.1 |
| Requires upgrading Vitest or React | **NOT TRIGGERED** — no upgrade of any kind |
| **TipTap cannot mount without extensive browser emulation** | **NOT TRIGGERED** — mounted with **zero polyfills**; `ResizeObserver`/`matchMedia` absent and unneeded |
| **Suite becomes materially unstable** | **NOT TRIGGERED — but only because of §15.3.** The unmount discipline is the mitigation and is therefore binding |
| **Include change causes duplicate/unintended discovery** | **NOT TRIGGERED — narrowly avoided.** A recursive glob would have captured **143 vendored fork tests**; the authorized single-level glob captures **0** |
| Lockfile churn cannot be bounded | **NOT TRIGGERED** — one devDependency plus its transitives; no refresh authorized |
| Production changes required for basic mounting | **NOT TRIGGERED** — mounted unmodified at `e25fe32` |

### 15.14 Authorization status

**PATCH-149B0: OPEN · AUTHORIZED.** 4 infrastructure/test files, **0 production files**, ≤222
budgeted lines plus a bounded lockfile resolution.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`; review `e6e9122`) |
| **PATCH-149B0** | **OPEN · AUTHORIZED — next implementation unit** |
| **PATCH-149B1** | **BLOCKED until B0 closes** (predicate helper · legacy adapter · read-only renderer) |
| **PATCH-149B2** | **BLOCKED until B1 closes** (explicit Save · dirty baseline · discard confirmation) |
| **PATCH-149C** | **BLOCKED on user reproduction** of the exit / underline defects (§14.11) |
| **PATCH-150** | **RESERVED and separate** — presentation index-domain divergence; untouched |

**Recorded for B1's benefit:** this harness already proves, executably, three claims §14 could only
argue from source — save fires **before** close, the save payload carries **no title or metadata**,
and **Escape does nothing**. B1 inherits them as measured baselines rather than assertions.

---

## 16. PATCH-149B0 AMENDMENT — STALE PATCH-125 PACKAGE-FILE FREEZE · **RESOLVED, CLASS A**

**Authored:** 2026-08-04 (governance architect). **Base:** `76b95a3`, against the B0 implementation
left uncommitted in the working tree. **Scope: one additional test file. Zero production. Zero
change to the already-authorized B0 allowlist.**

### 16.1 Blocker diagnosis

Implementation reported the full suite at **1 failed / 774 passed** (67 files, 775 tests), the sole
failure being `components/collabboard/EmojiReactionPicker.test.tsx:105`:

```ts
expect(execFileSync('git', ['diff', '--', 'package.json', 'package-lock.json'])).toBe('');
```

This fires on **any** working-tree diff to either file — including the governed, owner-authorized
`jsdom` addition — because the assertion checks the *files*, not the *dependency*.

### 16.2 The PATCH-125 invariant — read from source, not inferred

`.fable5/patches/PATCH-125.md` was read in full. Its actual requirement:

- **§3e:** *"`package.json` and `package-lock.json` remain PROHIBITED. Dependency removal is not
  authorized…"* — this is PATCH-125's own **scope boundary** (§5's "Prohibited unless source proves
  necessary" list, alongside `ReactionDisplay.tsx`, `CardActionsToolbar.tsx`, etc.), telling
  **PATCH-125's implementer** not to touch those files while migrating reaction pickers. It is not
  phrased as, and nothing else in the document treats it as, a permanent prohibition binding every
  future patch.
- **§7, the 22 required tests:** none specifies a `git diff` check. Item set §4/§7 governs behaviour
  — *"No post Reaction path imports or renders `emoji-picker-react`"* (contract item 2, test item 3)
  — never file immutability.
- **§4 contract + §3e together** reduce to exactly one durable invariant: **`emoji-picker-react`
  must remain declared and must not be removed.** The `toBe('')` diff check was the **implementer's
  own proxy** for that invariant, and a strictly stronger one than governance asked for — it was
  never itself authorized by PATCH-125's text.

**Conclusion: the assertion has been over-scoped since PATCH-125 shipped (`3ea20ec`) and would have
blocked *any* future dependency change to these two files, not only PATCH-149B0's.** This is a
latent defect in a regression guard, exposed — not caused — by B0.

### 16.3 Scope classification: **A — ACCEPTABLE GOVERNANCE AMENDMENT**

B is not applicable: PATCH-125 itself never mandated immutable package files (§16.2). C is not
applicable: a narrow semantic correction exists, was drafted, executed, and proven correct
end-to-end (§16.4–16.6) without touching PATCH-125's actual production contract or any of its other
21 required tests.

### 16.4 Authorized correction — exact

**File:** `components/collabboard/EmojiReactionPicker.test.tsx`, the single `it` block at
(pre-amendment) lines 102–106. **Change type:** replace the file-level zero-diff assertion with a
line-level "was this dependency's line removed" assertion; retain both existing presence checks
unchanged.

```ts
  it('does not remove emoji-picker-react from package files', () => {
    expect(source('package.json')).toContain('"emoji-picker-react"');
    expect(source('package-lock.json')).toContain('"emoji-picker-react"');
    const diff = execFileSync('git', ['diff', '--', 'package.json', 'package-lock.json'], { encoding: 'utf8' });
    const removedLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    expect(removedLines.find((l) => l.includes('emoji-picker-react'))).toBeUndefined();
  });
```

**Verified — this was drafted and executed by this governance turn as a probe, then reverted; it is
authorized for the implementation engineer to reapply, not left applied here** (this document
records source of truth; the working tree was returned to its pre-amendment state, hash
`bca4f77…`, matching the already-uncommitted B0 implementation exactly).

**Line budget: 6 changed lines** (`git diff --numstat`: 4 insertions, 2 deletions) — within the
authorized ≤8.

No other line in the file changes. `execFileSync` remains imported (already present, line 1) —
no new import required.

### 16.5 Amended allowlist

| Category | Path | Authorization |
|---|---|---|
| Infrastructure | `package.json` | unchanged from §15.7 |
| Infrastructure | `package-lock.json` | unchanged from §15.7 |
| Infrastructure | `vitest.config.ts` | unchanged from §15.7 |
| Test | `components/collabboard/editors/NoteEditor.characterization.test.tsx` | unchanged from §15.7 |
| **Test (new)** | **`components/collabboard/EmojiReactionPicker.test.tsx`** | **one `it` block only, ≤8 changed lines, exact shape §16.4** |

**Production remains frozen — zero files, unchanged from §15.7.** No PATCH-125 production source
(`EmojiReactionPicker.tsx` or any of the 6 reaction call-site files) may change. No other `it` block
in `EmojiReactionPicker.test.tsx` may change — the other 21 PATCH-125 assertions (migration census,
non-reaction consumers, structure/search, persistence-route source guards) are untouched and remain
binding exactly as PATCH-125 left them.

### 16.6 Induced failure and validation — executed by this governance turn as probe evidence

**Before correction** (stale assertion + governed jsdom diff, reproduced): **67 files, 775 tests,
774 passed, 1 failed** — matches the implementer's report exactly.

**After correction:** **67/67 files, 775/775 tests — full suite green.**

**Negative controls — all 4 executed, all reverted, all hash-verified byte-identical to the
pre-control state:**

1. Removed `"emoji-picker-react"` from `package.json` → corrected test **fails** on the first
   `toContain` (`package.json` restored via targeted single-line insert, not `npm`/`JSON.stringify`,
   to avoid the same comma-style reformatting hazard noted in §15; hash confirmed `2657dea…`,
   matching the implementer's own file exactly).
2. Deleted the full `node_modules/emoji-picker-react` resolved block plus the root dependency line
   from `package-lock.json` (3 occurrences → 0) → corrected test **fails** on the second `toContain`
   (hash restored to `8189984…`).
3. Restored the original whole-file `toBe('')` assertion → **fails** against the governed jsdom diff
   — this is the original blocker, re-derived to confirm the amendment is what resolves it, not
   something else (file restored to the corrected version, hash `b6f3ebe…`).
4. Removed `node_modules/jsdom` (directory moved aside, `package.json`/lockfile text untouched) →
   `NoteEditor.characterization.test.tsx` **fails outright at environment-init** (`Cannot find
   package 'jsdom'`, 0 tests collected) — proving the B0 dependency is genuinely load-bearing for a
   real test file, not merely declared. Directory restored; suite reconfirmed 10/10 immediately
   after.

**Full validation matrix, this turn:** full Vitest 67/67 · 775/775 (post-correction) and 67/67 ·
775/775 again after every negative control's revert (no residual state). `git diff --numstat` on
the amendment: `4 2`. The build/typecheck/exclusion/E2E matrix was already proven clean by the prior
implementation turn against the same 4 unchanged B0 files (§15.12) and is unaffected by a
test-only, non-production correction; the implementation engineer's own commit turn re-runs it
per the standing contract.

### 16.7 False-green check

The correction does not merely delete protection: both presence checks (`toContain`) are retained
verbatim, and the diff-based check is *narrower but still binding* — it fails on the exact defect it
exists to catch (accidental removal) while no longer failing on unrelated, authorized additions. It
does not touch PATCH-125's other 21 assertions, its production contract, or its census. **Rejected
alternative:** deleting the whole `it` block — this would satisfy "stop failing" but strictly weaken
PATCH-125's regression coverage, which is explicitly forbidden by this amendment's own brief
("do not merely delete all dependency-protection assertions").

### 16.8 Authorization status

**PATCH-149B0: OPEN · AUTHORIZED, amended.** The implementation engineer may now apply exactly the
§16.4 correction to `EmojiReactionPicker.test.tsx`, re-run the validation matrix, and commit all
five authorized files together:

```
test(editor): characterize NoteEditor in jsdom
```

**The commit must not include `.fable5`.**

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`; review `e6e9122`) |
| **PATCH-149B0** | **OPEN · AUTHORIZED, amended** — 4 infrastructure/test files (§15) + 1 test
  correction (§16), 0 production, full suite proven 67/67 · 775/775 |
| **PATCH-149B1** | **BLOCKED until B0 closes** |
| **PATCH-149B2** | **BLOCKED until B1 closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Existing B0 implementation files were not altered by this turn** — `package.json`,
`package-lock.json`, `vitest.config.ts`, and `NoteEditor.characterization.test.tsx` remain at
exactly the hashes the implementation turn left them (`2657dea…`, `8189984…`, `44fa672…`,
`fb0a121…`). `EmojiReactionPicker.test.tsx` was probed to prove §16.4 correct, then **reverted to
its committed HEAD state** (`bca4f77…`) — this document, not the working tree, is where the
correction is authorized from.

---

## 17. PATCH-149B0 — INDEPENDENT CLOSURE REVIEW

**Reviewed:** 2026-08-04 (independent closure reviewer). **Implementation commit:** `c9ea345`
`test(editor): characterize NoteEditor in jsdom`. **Parent:** `e73b7de`. All evidence below was
re-executed independently; nothing was taken on the implementer's word.

### 17.1 Source-scope result

`git show --numstat c9ea345` — **exactly the five authorized files, 707 insertions / 3 deletions:**

| File | +/− | Budget |
|---|---|---|
| `package.json` | 1 / 0 | ≤1 ✓ |
| `package-lock.json` | 551 / 0 | bounded ✓ |
| `vitest.config.ts` | 1 / 1 | ≤1 ✓ |
| `NoteEditor.characterization.test.tsx` | 150 / 0 | ≤220 ✓ |
| `EmojiReactionPicker.test.tsx` | 4 / 2 | ≤8 ✓ |

Filtering the commit's file list against the allowlist returns **empty** — no sixth file. **Zero
production files.** `git diff e73b7de c9ea345` over `NoteEditor.tsx`, `NoteEditorToolbar.tsx`,
`app/**`, `hooks/**`, `lib/**`, `types/**`, `supabase/**`, `components/collabboard/canvas/**`
(CanvasClient, CardEditor, modal routing, presentation, Excalidraw fork) returns **empty**.
**No `.fable5` file appears in the commit.**

### 17.2 `package.json` result

Adds exactly `"jsdom": "29.1.1"` to `devDependencies`, alphabetically placed. **No script changes**
— critically, none of the leading-comma `harness:*` script lines were reformatted, which the
implementer's own report flagged as an `npm install` hazard they had to work around by hand. No
dependency upgrades. React 19.2.7, Next 15.5.20, Vitest ^3.2.7, TipTap 3.x, TypeScript ^5 all
untouched.

### 17.3 `package-lock.json` result

- **Removed lines: 0.** The diff is *purely additive*.
- **39 new package entries, and 39 `"dev": true` markers** — a 1:1 match, so every added package is
  dev-only. Nothing leaks into the production dependency graph.
- Root `packages[""].devDependencies.jsdom = "29.1.1"`; `packages["node_modules/jsdom"].version =
  "29.1.1"`, `dev: true`.
- Enumerated all 39 added packages: `jsdom` plus recognized transitives only — `@asamuzakjp/*`,
  `@csstools/*`, `@bramus/specificity`, `@exodus/bytes`, `bidi-js`, `css-tree`, `data-urls`,
  `decimal.js`, `entities`, `html-encoding-sniffer`, `is-potential-custom-element-name`, `lru-cache`,
  `mdn-data`, `parse5`, `saxes`, `symbol-tree`, `tldts`, `tldts-core`, `tough-cookie`, `tr46`,
  `undici`, `w3c-xmlserializer`, `webidl-conversions`, `whatwg-mimetype`, `whatwg-url`,
  `xml-name-validator`, `xmlchars`. **No unrelated package, no version change to any pre-existing
  entry, no removal.**
- Lockfile parses as valid JSON.

### 17.4 Vitest include / discovery result

Sole config change: one appended non-recursive entry `'components/collabboard/editors/*.test.tsx'`.
`environment: 'node'` **unchanged**. No `**` recursion, no `setupFiles`, no `environmentMatchGlobs`,
no second project.

`npx vitest list --filesOnly` — **67 files total**, of which under `components/collabboard`:
the five pre-existing top-level tests plus **exactly one** new `editors/` file. Grep of the
discovered list for `excalidraw_fork`, `/e2e/`, `node_modules` returns **0**. No duplicate
discovery (the two globs are disjoint; the new file appears once).

**Independently confirmed the trap governance identified was real and avoided:** removing the new
entry (NC2) returns discovery to exactly **66 files / 765 tests**, proving the entry contributes
precisely **1 file / 10 tests** and nothing else — no fork tests, no hidden inflation.

### 17.5 jsdom environment result

`// @vitest-environment jsdom` is **line 1** of the characterization file, and applies to that file
only. No shared setup file. Global environment still `node`. **No polyfills** — grep for
`ResizeObserver`, `matchMedia`, `polyfill` returns empty, matching §15.2's measurement that none is
required. **`@testing-library/react` is not imported** (grep empty), avoiding the extraneous
fork-transitive trap; the suite uses `createRoot` from `react-dom/client` and `act` from `react`,
both declared dependencies.

### 17.6 Characterization result — all 10 contract items present

| §15.6 item | Verified in source and by execution |
|---|---|
| 1 Closed state | `isOpen={false}` ⇒ `innerHTML.length` **toBe(0)** |
| 2 Open non-vacuity | `length > 1000` **plus** overlay class, `.ProseMirror` node, text content, button count — see §17.7 |
| 3 Legacy HTML | `<p>Legacy HTML body</p>` / `<p>Stored note</p>` asserted via `textContent` (so raw tags cannot pass as literal text); `initialContent=""` asserts `.ProseMirror` present |
| 4 Toolbar | `button[title*="Bold"]`, `[title*="Italic"]`, and **`[title*="Text alignment"]`** — dead `Align` characterized as *present*, not removed |
| 5/6 Close & backdrop | backdrop is `container.firstElementChild`, i.e. the real overlay carrying `onClick={handleOverlayClick}` — **not** a child element; asserts `['save','close']` |
| 7 Escape | `onSave`/`onClose` both `not.toHaveBeenCalled()` — absence pinned, support not invented |
| 8 Modal constraints | overlay `fixed inset-0 z-[1000]`; card `style.width === '280px'`; `NoteEditorProps` sliced to assert **no `title:`, no `readOnly:`** |
| 9 Payload | exact 7-key sort-comparison, plus explicit `not.toContain('title')` / `not.toContain('metadata')` |
| 10 Cleanup | `afterEach` unmounts every root through `act` and removes containers |

**Nothing is corrected.** Save-on-close, backdrop persistence, the missing Escape handler, the dead
`Align` control, the absent `title`/`readOnly` props are all recorded as-is. No PDF work, no
`readOnly`/`title` addition, no toolbar change.

**On item 8 — one honest scoping note:** the "no `title`/`readOnly` prop" assertion is a **source
slice**, not DOM behaviour, and the test names itself accordingly (*"source-level; not observable
from rendered DOM"*). That is the correct treatment — a prop's *absence* has no DOM manifestation to
assert — and it is paired with real DOM assertions in the same block (the 280px width). This is not
the "source strings substituting for DOM behaviour" false-green: 9 of 10 tests are behavioural.

### 17.7 Non-vacuity proof — independently executed

Forced `NoteEditor` to `return null` while open (`if (true)` at `:692`, a genuine production
perturbation): **7 of 10 tests failed**, and the designated non-vacuity assertion failed with
exactly the intended message — **`AssertionError: expected 0 to be greater than 1000`**. An empty
container **cannot** pass. Production reverted and verified byte-identical (`3fd235f…`), never
committed.

For contrast, re-ran the *old* technique under `environment: 'node'`: `renderToStaticMarkup` on an
open `NoteEditor` still returns **length 0** — confirming §14.5's original finding and that this
suite is the first thing in the repository capable of catching an empty render.

### 17.8 Lifecycle, backdrop, Escape, payload results

- **Visible close / backdrop:** callbacks fire **`['save','close']`** — save strictly precedes close;
  `onSave` called exactly once. The event is dispatched on the overlay itself (the element that owns
  `handleOverlayClick`), so the `e.target === e.currentTarget` guard is genuinely exercised rather
  than bypassed by a child click. NC4 (reversing the expected order) **fails**, proving the ordering
  is pinned rather than incidentally satisfied.
- **Escape:** 0 saves, 0 closes — matching `NoteEditor`'s complete absence of a modal-level key
  handler (§14.11).
- **Payload:** exactly `['badgeColor','cardColor','content','detachedComments','reactions','textColor','topStrip']`
  — **no `title`, no `metadata`**, executably confirming §14.4's source-derived claim.

### 17.9 Teardown result — hazard reproduced, discipline proven load-bearing

Focused suite run **8 consecutive times with cleanup: 8/8 clean** — no `ReferenceError`, no Vitest
unhandled-error warning, no ProseMirror `DOMObserver` warning.

With the `afterEach` unmount removed (NC5), the same 8-run loop reproduced the warning on **2 of 8
runs** (runs 4 and 7). This **independently confirms both halves of §15.3**: the hazard is real, and
it is nondeterministic — exactly why governance made the discipline binding rather than relying on a
single green run. **The unmount is load-bearing, not decorative.** Restored; 8/8 clean again.

### 17.10 PATCH-125 amendment — **Classification A: semantic correction preserving the invariant**

Retains both presence assertions verbatim (`package.json` and `package-lock.json` each
`toContain('"emoji-picker-react"')`). Replaces the file-level `toBe('')` with a scan of **removed
diff lines only** for `emoji-picker-react`. Only that one `it` block changed; the other 21 PATCH-125
assertions (10-site migration census, reaction-path exclusion, three non-reaction consumers,
structure/search, persistence-route source guards, Note/Todo/Link semantics) are **untouched**, and
the file's test count is unchanged at **10**. No dependency-protection assertion was deleted.

**The decisive differential, executed on one identical diff:** with `package.json` reverted to its
pre-jsdom state (a working-tree diff whose only removal is the `jsdom` line) —

- the **old** assertion **fails** (`expected 'diff --git a/package.json…' to be ''`);
- the **corrected** assertion **passes** (10/10).

Yet the corrected assertion still **fails** when the dependency is actually removed — NC6
(`package.json` line deleted) and NC7 (all 3 lockfile occurrences invalidated) both fail on the
presence checks. **It tolerates governed additions while still catching real removal.** That is
class A, not a weakened invariant.

Cross-checked against `.fable5/patches/PATCH-125.md` directly: §3e's *"`package.json` and
`package-lock.json` remain PROHIBITED"* sits in that patch's **§5 prohibited-files list** (beside
`ReactionDisplay.tsx`, `CardActionsToolbar.tsx`, `IconSelector.tsx` …) — an implementer scope
boundary, not a permanent freeze; and none of its **22 required tests (§7)** specifies a diff
assertion. §16.2's diagnosis is confirmed correct.

### 17.11 Induced failures — all four reproduced at parent

1. Parent `vitest.config.ts` include array **lacks** the `editors/` entry — the new test is not
   discovered.
2. Under `environment: 'node'`, DOM APIs are unavailable — NC1 (docblock removed) fails **9/10**,
   with only the pure source-slice test surviving.
3. `renderToStaticMarkup` on an open `NoteEditor` in `node` returns **length 0** — vacuous by
   construction.
4. The old `EmojiReactionPicker` assertion **fails** against a governed package diff (§17.10).

All four are resolved at `c9ea345`.

### 17.12 Negative controls — 9/9 executed, reverted, hash-verified

| # | Control | Result |
|---|---|---|
| 1 | Remove jsdom docblock | 9/10 fail ✓ |
| 2 | Remove `editors/` include entry | discovery drops to 66 files / 765 tests ✓ |
| 3 | Force `NoteEditor` null while open | 7/10 fail, non-vacuity assertion `expected 0 to be greater than 1000` ✓ |
| 4 | Reverse save/close order | lifecycle test fails ✓ |
| 5 | Omit root unmount | teardown warning reproduced **2/8 runs** ✓ (nondeterministic, as documented) |
| 6 | Remove `emoji-picker-react` from `package.json` | corrected test fails ✓ |
| 7 | Invalidate lockfile entry | corrected test fails ✓ |
| 8 | Restore whole-file zero-diff assertion | fails against governed package diff ✓ |
| 9 | Remove `node_modules/jsdom` | env init fails, `Cannot find package 'jsdom'`, 0 tests collected ✓ |

Post-control hashes all match the committed blobs: `package.json` `2657dea…`, `package-lock.json`
`8189984…`, `vitest.config.ts` `44fa672…`, characterization test `fb0a121…`,
`EmojiReactionPicker.test.tsx` `b6f3ebe…`, **`NoteEditor.tsx` `3fd235f…` (production, untouched)**.

*Process note: two `sed` invocations during this review failed on delimiter/escaping and left their
target files unmodified. Both were caught by immediate `git hash-object` verification before any
conclusion was drawn — the apparent "10/10 pass" in each case was the unmodified baseline, not a
control result, and each control was then re-run correctly. Recorded because a hash check is the
only thing that distinguishes "control passed" from "control never ran."*

### 17.13 Full validation

Focused (characterization · EmojiReactionPicker · CardEditor · CardPreview · ClipartCardDraftModal ·
cardModalRoute): **6/6 files, 118/118 tests.**
**Full Vitest: 67/67 files, 775/775 tests** (66+1 files, 765+10 tests), no `Errors` line.
`npm run typecheck`: **exit 0**, **410 declarations** confirmed by direct count.
`npx next build`: **exit 0**. Bridge exclusion: **891 files**, marker absent.
`npm run build:e2e`: **exit 0**, `.next/E2E_BRIDGE_BUILD` = **`1`**.
Ordinary `.next` restored: build exit 0, exclusion **891 files**, **marker absent**.
`git diff --check`: **exit 0**.
Worktree outside committed history: only the five protected paths.

### 17.14 False-green review

None of the rejection conditions holds: no production file changed · behaviour characterized, not
corrected · an empty container provably cannot pass (§17.7) · 9 of 10 tests are DOM-behavioural ·
global environment still `node` · `@testing-library/react` unused · discovery captures zero fork
tests · no teardown warnings with the shipped cleanup · lockfile churn is jsdom-only and additive ·
the PATCH-125 invariant still catches real removal · Save/Close unchanged · `Align` still rendered ·
no `readOnly`/`title` added · no PDF work.

### 17.15 Observations (non-blocking)

- **The `Align` control is now pinned as present.** This is correct for B0 (characterize, don't
  correct), but §14.10 rules `Align` must **not** appear on the Document toolbar. Whichever patch
  acts on that will need to update this assertion in the same commit — it is a deliberate tripwire,
  not an obstacle, and worth naming so it is not mistaken for a regression later.
- **`NoteEditor` remains characterized, not covered.** Ten tests over a 1,165-line component pin the
  seams B1/B2 depend on (mount, content load, save payload, lifecycle order, Escape absence); they
  are not a regression suite for the Note Post's colour, comment-thread, reaction or popup systems,
  none of which has any test. That gap predates B0 and is not B0's to close — but B1 should not
  mistake a green characterization suite for freedom to restructure `NoteEditor` safely.
- **The nondeterministic teardown warning (2/8) deserves its binding rule.** Had the implementer
  validated with a single run and no cleanup, it would likely have passed and shipped a latent
  cross-file flake. This is the clearest evidence in the patch that §15.3 earned its "binding" status.

### 17.16 Final classification

**2 — PASS WITH NON-BLOCKING OBSERVATIONS.**

No CRITICAL or HIGH issues. Every governed acceptance criterion was independently re-executed rather
than trusted. The three observations in §17.15 are forward-looking notes for B1, not defects in B0.

### 17.17 Status

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`; review `e6e9122`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`; this review) |
| **PATCH-149B1** | **RELEASED — eligible for governance authorship.** Not authorized here; scope (Document predicate helper · legacy-content adapter · read-only TipTap renderer) must be governed in its own turn, and §14.13's B0 prerequisite of a **per-row `type:'card'` content-corpus measurement** remains outstanding input to the adapter spec |
| **PATCH-149B2** | **BLOCKED until B1 closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** of the exit / underline defects (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**No implementation was modified by this review; `c9ea345` was not amended; nothing was pushed.**

---

## 18. PATCH-149B1 — DOCUMENT FOUNDATION · **BLOCKED (S3)**

**Authored:** 2026-08-04 (governance architect). **Base:** `9e254e4`. No production or test file was
modified in this turn. **Authorization is withheld on two independent grounds**: the mandatory
corpus measurement could not be executed (§18.1), and the routing census uncovered a previously
unrecorded defect that changes the shape of the patch (§18.3).

### 18.1 Corpus measurement — **NOT OBTAINED. This is the blocking gate.**

The brief makes real-corpus measurement the mandatory first step and forbids authorizing the adapter
without it. It could **not** be completed:

- A live corpus **does exist and is reachable** — `.env.local` declares `NEXT_PUBLIC_SUPABASE_URL`
  and `SUPABASE_SERVICE_ROLE_KEY`, and the repo ships `scripts/live-access-login.mjs`.
- A measurement script was written to `scratchpad/corpus149b1.mjs`. It queries
  `padlets where type='card'`, partitions on `metadata.svgUrl`, and emits **aggregates only** —
  per-class counts, metadata-key frequency, title presence, `data-*` occurrence, tag-name shape,
  newline counts and 8-char SHA1s. **It never prints stored content.**
- **Execution was denied by the environment's permission classifier** (live-database read via a
  service-role key). No workaround was attempted, and none should be.

**This is materially different from "no corpus exists."** It is one approval away. Governance must
not substitute assumption for the measurement it declared mandatory — especially in a patch whose
entire adapter contract (plain-text vs HTML vs escaped-HTML vs malformed) is specified *from* that
distribution. **No adapter is authorized.**

**Unblock requirement:** permission to run
`node scratchpad/corpus149b1.mjs` (read-only `select` on `padlets`, aggregates only), or an
equivalent export the owner produces. Everything in §18.6 becomes writable immediately afterward.

*Secondary evidence only, not a substitute:* `CardEditor` writes plain text via a `<textarea>`;
`CardEditor.tsx:56` strips tags for its word count; card bodies are `DOMPurify`-sanitised at render —
so HTML *may* already exist in some rows from non-editor paths. That is exactly the ambiguity the
measurement exists to resolve, and it cannot be resolved by reading source.

### 18.2 Document predicate — verified, unchanged, and sound

Re-confirmed against §14.3's census: all six `type:'card'` producers, with `kind:'card'` traced to a
single producer (`usePadletSave.ts:1006`, the `saveCard` placement draft). The predicate stands:

```
isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl
```

Document included · clipart excluded (`svgUrl`) · text/note (`'text'`), comments, embedded media all
excluded by type. **No source path creates a non-clipart `type:'card'` post except the Document
tool.** The predicate is *source-complete*; what remains unproven is whether **legacy/imported rows**
satisfy it without being user-facing Documents — which only §18.1 can answer. **The brief's own hard
stop applies: "If ordinary non-document cards also satisfy the predicate, stop."** Source says no;
data has not yet been asked.

### 18.3 Route census — **new defect found; it changes B1's shape**

§14.2's census covered the Freeform routes. Extending it to the remaining layouts revealed that the
three "incidental ungated openers" recorded in §14.11 are **not** the unrelated capability nit that
entry assumed:

| Site | Enclosing component | Handler | Behaviour |
|---|---|---|---|
| `CanvasClient.tsx:6480` | **`ColumnsLayout`** | `onOpenPost` | `setPadletToEdit(post); setIsNoteEditorOpen(true)` |
| `CanvasClient.tsx:6570` | **`RowCanvasDnD`** | `onOpenPost` | same |
| `CanvasClient.tsx:6729` | **`DrawingLayout`** | `onEditPadletAsPost` | same |

All three open **any post type — including a `type:'card'` Document — directly in `NoteEditor`**,
bypassing `openPadletInTypeEditor` and therefore bypassing `selectCardModalRoute`.

**Three consequences, all load-bearing for B1:**

1. **§14.11's classification was wrong and is corrected here.** It reasoned Documents "are not
   reachable through these section handlers." They are: a Document is a post, and these handlers
   accept any post. This is a **Document-related route**, squarely inside B1's ownership ("Trace all
   Document opening routes … Branch only on the exact Document predicate").
2. **Documents already reach TipTap in three layouts today** — via the wrong entry point, with no
   title handling, no capability check, and `saveNote`'s note-shaped payload (`SaveNoteData` has no
   `title`; §14.2). B1's premise that Documents are exclusively a `CardEditor` concern is incomplete.
3. **These routes are ungated.** The brief forbids leaving a Document route ungated and forbids
   weakening PATCH-139/151. B1 must gate them — which means touching `CanvasClient` in three more
   places than the allowlist sketch anticipated, and re-verifying that gating Columns/Rows/Drawing
   post-opening does not regress **Note/Todo/Link/Image** posts that legitimately use those same
   handlers.

**This is not a reason to abandon B1 — it is a reason not to authorize it on an incomplete census.**
The correct scope cannot be budgeted until the non-Document impact of gating those three handlers is
measured.

### 18.4 Architecture — **R1 selected (conditionally), extraction is feasible**

Measured on `NoteEditor.tsx`: **one** `useEditor` call (`:232-282`), `NOTE_EXTENSIONS` a
module-level `const` (`:23-37`, unexported, zero state coupling), 19 `useState` hooks, 39 `editor.`
references, 11 `editor?.` guards.

The single extraction friction is `editorProps.handleClick` (`:241-279`), which closes over
Note-specific comment UI (`noteCardRef`, `setLinkedTextPosition`, `setCommentPopupPosition`,
`setActiveThread`, `setCommentPopupOpen`). A hook that accepts optional `editorProps`/`handleClick`
overrides resolves this cleanly.

**Selected: R1 — extract a narrow `useDocumentEditor`-style hook** owning `useEditor`, the shared
extension registry, content init, HTML serialization and `editable` state; consumed by both the
existing `NoteEditor` modal and a new Document wrapper (M2). R2 is the fallback if the shell/body
split proves cleaner in implementation; **R3 is rejected** — duplication of the extension registry
would immediately re-create the P6 duality this patch exists to end. **No wholesale rewrite.**

**Conditional**, because the B0 closure's own observation (§17.15) applies: 10 characterization tests
pin mount/content/lifecycle seams but leave `NoteEditor`'s colour, comment-thread, reaction and popup
systems **entirely untested**. R1 touches the `useEditor` call those systems depend on. Extraction
should be preceded by characterizing at least the `handleClick` comment-anchor path, or the net
safety of B0 is spent rather than banked.

### 18.5 Contracts settled by measurement (carry forward unchanged)

- **Serialization** (§14.6): in `content: initialContent`; out `editor.getHTML()`; empty is
  `<p></p>` not `''`; sanitisation at render via `DOMPurify`; **custom node attributes round-trip as
  `data-*`, proven by the shipped `Comment` extension** (`:243-272` reads back
  `data-comment-id`/`-thread`/`-user-id`/`-timestamp`/`-color`). No envelope, no schema change.
- **PDF seam** (§14.6, §6): future nodes register in the shared extension registry; attributes
  survive `getHTML()`; no modal-level PDF branch. **Nothing PDF is added.**
- **Toolbar / Align** (§14.10): Document mode must expose only proven-working text controls
  (text-style, bold, italic, strike, underline, bullet/ordered list, code, link) and **must not
  render `Align`** — `onAlign` is never supplied and `extension-text-align` is absent from
  `NOTE_EXTENSIONS`; B0 measured it as *visibly rendered*, so a mode/capabilities-filtered surface is
  required. `Align` is **not** removed globally from the Note Post without separate evidence.
- **Title** (§14.2): stays in `padlets.title`, never embedded in body HTML; `saveCard` carries
  `{title, content, metadata}` while `saveNote` carries **no title** — any Document route through
  note-shaped save is a title-loss hazard and must be treated as such.
- **Read-only:** `editable:false` on the same core; no toolbar, no Save, no title input, no dirty
  state, no write on close; clipart viewer (PATCH-151) untouched.
- **Lifecycle:** B1 preserves current save-on-close **as characterized**, adds no new silent-write
  route, and leaves Save/dirty/discard entirely to **B2**.

### 18.6 Split decision — **S3 · BLOCKED**, with S2 as the shape on unblock

Neither S1 nor S2 can be responsibly authorized now: S1 is out on size alone once §18.3's gating work
is counted, and S2's **B1a is precisely the unit that depends on the missing corpus** (predicate +
adapter + core extraction). Authorizing B1a minus the adapter would ship a predicate and a hook with
no consumer — speculative code of exactly the kind §14.13 declined to authorize.

**On unblock, the expected shape is S2:**

| Unit | Scope | Gate |
|---|---|---|
| **B1a** | corpus measurement · predicate helper · legacy-content adapter · R1 core extraction | §18.1 |
| **B1b** | Document wrapper · routing (incl. the three §18.3 handlers) · read-only integration · toolbar filtering | B1a closed |

Allowlists, per-file line budgets, induced-failure plan and negative controls are **deliberately not
issued** — the same discipline applied in §14.13. Issuing budgets before the corpus distribution and
the §18.3 blast radius are known would produce numbers with no evidentiary basis, and the brief's own
rule applies: *"Do not force unsafe compression merely to fit numbers."*

### 18.7 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| **Real corpus contains non-Document rows satisfying the predicate** | **UNKNOWN — measurement denied (§18.1). BLOCKING.** Source evidence says no; data unasked |
| **Corpus shapes cannot be safely distinguished** | **UNKNOWN — same cause. BLOCKING** |
| Extraction requires broad NoteEditor rewrite | **NOT TRIGGERED** — R1 feasible; one `useEditor`, module-level registry, single `handleClick` friction (§18.4) |
| Existing NoteEditor behavior cannot be preserved | **NOT TRIGGERED**, but under-covered — B0 pins 10 seams, not the comment/colour/reaction systems (§18.4) |
| Plain text cannot be adapted without schema changes | **NOT TRIGGERED** — TipTap accepts an HTML string; no migration needed |
| Custom attributes do not survive serialization | **NOT TRIGGERED** — proven by the `Comment` extension |
| Read-only TipTap still permits mutation | **UNVERIFIED** — `editable:false` not yet exercised in the B0 harness; must be proven, not assumed |
| **Routing requires weakening PATCH-139/151** | **NOT TRIGGERED — but the inverse defect exists**: three routes are already ungated and must be *strengthened* (§18.3) |
| Cannot be tested with the B0 harness | **NOT TRIGGERED** — B0 harness (jsdom, `editors/*.test.tsx`) is closed and green |
| **Production scope cannot be bounded** | **TRIGGERED** — §18.3 adds unbudgeted `CanvasClient` gating whose non-Document blast radius is unmeasured |

**Three hard stops trigger: two from the denied measurement, one from the newly-found routing
defect.**

### 18.8 Status

**PATCH-149B1: OPEN · BLOCKED (S3).** Predicate, architecture (R1/M2), serialization, PDF seam,
toolbar, title and read-only contracts are all settled and recorded above; only the corpus-dependent
adapter and the §18.3-dependent routing budget remain.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`; review §17) |
| **PATCH-149B1** | **OPEN · BLOCKED** — corpus measurement denied (§18.1) + routing scope unbounded (§18.3) |
| **PATCH-149B2** | **BLOCKED until B1 closes** — owns Save/dirty/discard/Close/Escape; B1 leaves the seams, implements none |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

### 18.9 Correction to §14.11 — recorded

§14.11 classified the three layout openers as "not a Document-Post route … not a PATCH-139/151
regression." **That classification is superseded by §18.3.** They *are* Document-reachable and they
*are* ungated. The reasoning error is worth naming: it inferred reachability from where Documents are
*created* (Freeform) rather than from what the handlers *accept* (any post). PATCH-139/151 remain
correctly closed — their Freeform routes are sound — but the capability surface was never complete.

> **§18.3 and §18.9 are themselves partly superseded by §19.3.** The measured census shows
> `DrawingLayout` is **not** Document-reachable, and the two routes that are reachable are **capability-
> gated after all**. The defect is real but is a *title-loss* hazard, not a permission bypass. §19.3
> supersedes; this section is retained to show the correction chain.

---

## 19. PATCH-149B1 — MEASURED AMENDMENT · **AUTHORIZED, SPLIT (S2)**

**Authored:** 2026-08-04 (governance architect). **Base:** `204c755`. The owner approved a one-time
SELECT-only corpus inspection; it was executed, recorded, and the script deleted. Both §18 blockers
are resolved. No production or test file was modified in this turn.

### 19.1 Corpus measurement — method, safeguards, deletion

**Method.** `scratchpad/corpus149b1.mjs` (Node + `@supabase/supabase-js`, service-role key read from
`.env.local`) issued **one** query:
`supabase.from('padlets').select('type,title,content,metadata,width,height').eq('type','card')`.

**SELECT-only, verified.** A grep for `.insert(|.update(|.delete(|.upsert(|.rpc(` over the script
returned only `crypto.createHash().update()` — no Supabase mutation, no RPC, no write-back. Exactly
one `.from()/.select()` pair.

**Privacy safeguards.** The script printed **aggregates only**: per-class counts, metadata *key*
frequency (never values), title present/empty **counts**, `data-*` presence counts, tag-*name* sets,
character length, newline counts, geometry buckets, and 8-char SHA1s used solely for duplicate-shape
counting. **No stored content, no title text, no ids, no board/workspace/user identifiers** were
emitted. Nothing below is an excerpt of user data.

**Deletion.** The script was removed from both the repo root (where it was copied only so Node could
resolve `@supabase/supabase-js`) and the scratchpad; no report file was written; `git status` shows
only the five pre-existing protected paths. **No credentials or query results remain in the worktree.**

### 19.2 Aggregate corpus result — and it reframes the patch

| Measure | Value |
|---|---|
| Total `type:'card'` rows | **142** |
| Clipart rows (`metadata.svgUrl`) | **140** |
| **Rows satisfying the predicate (non-clipart)** | **2** |
| Content classification | `plain-text` **1** · `malformed-html-like-text` **1** |
| HTML fragments / full HTML documents / JSON / escaped-HTML / empty | **0 each** |
| Rows with `data-*` attributes | **0** |
| Rows with TipTap-style markup (`<strong>`, `<ul>`, `<h1>`…) | **0** |
| Titles | present **2**, empty **0** |
| `metadata.kind === 'card'` | **0** |
| Metadata key frequency | `description` **2** · `parentId` **1** · `zIndex` **1** |
| Geometry | `180x220` **1** · `300x200` **1** |
| Distinct structural shapes | **2** (no duplicates) |
| Newlines | LF-only **1** · none **1** |

**Three findings that change the risk model:**

1. **The "mixed corpus" premise is refuted by measurement.** §7 and §14.6 warned that some
   `type:'card'` rows might already hold HTML from non-editor paths. **Zero rows contain HTML** — no
   tags, no `data-*`, no TipTap markup. The adapter's HTML-input branch has **no real instance**, so
   the migration's actual risk is far lower than governance had assumed. It must still be implemented
   (defensively, and because `NoteEditor` emits HTML on save), but it is not load-bearing for
   existing data.

2. **The escaping requirement is real, not hypothetical.** The `malformed-html-like-text` row is
   **9,250 characters, 332 LF newlines, and zero matched tags** — i.e. plain prose containing bare
   `<`/`>` characters. Naively passing it to TipTap as HTML would silently swallow everything from the
   first `<` onward. **This single row is the strongest fixture shape in the corpus** and the reason
   the adapter must escape rather than trust. It also proves paragraph/newline preservation matters:
   332 newlines must survive as structure.

3. **Both rows are provably genuine Documents.** `metadata.description` appears in **2 of 2** rows,
   and `description` is written *only* by `CardEditor`'s footer input (`CardEditor.tsx:29`, persisted
   through `handleSave`). Both rows therefore passed through the Document editor. Combined with the
   source-complete producer census (§14.3), no evidence of an "ordinary non-Document card" exists.

**Geometry is explicitly rejected as a discriminator.** One row is `300x200`, which **no** creation
site produces (all card creators use 180×220, or 200×200 for a container clipart drop). The
explanation is user resizing, which is ordinary. Recorded so a future patch does not mistake geometry
for provenance.

### 19.3 Predicate classification — **P1 · SAFE FOR ALL MEASURED ROWS**

`isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl` holds for **2 of 2** measured
rows, both independently corroborated as Documents by `metadata.description`. Clipart (140 rows) is
excluded by `svgUrl` with no ambiguity. **No stable-discriminator work is required; no hard stop.**

**Stated honestly:** n = 2 is a small Document corpus. P1 is a statement about *the entire accessible
corpus*, not about a large sample — the strength of the predicate rests primarily on the
source-complete producer census (§14.3), with the corpus confirming rather than establishing it. The
implementation must still treat unclassifiable content defensively (§19.6), because the next
Document written is not covered by a measurement of the previous two.

### 19.4 Cross-layout route census — §18.3 **corrected on two counts**

| Route | Component | Invoked for | Capability gate | Destination | Bypasses `openPadletInTypeEditor`? | Document-reachable? |
|---|---|---|---|---|---|---|
| `CanvasClient:6480` `onOpenPost` | **`ColumnsLayout`** → `ColumnsCanvasRow:344,409` → `ColumnPostContextMenu.onOpen` | any post | **`disabled={!isEditable}`**, and `isEditable={canUseFreeformEditButton}` (`:6466`) | `setIsNoteEditorOpen(true)` | yes | **YES** |
| `CanvasClient:6570` `onOpenPost` | **`RowCanvasDnD`** → `RowLane:418,478` → `ColumnPostContextMenu.onOpen` | any post | **`disabled={!isEditable}`**, `isEditable={canUseFreeformEditButton}` (`:6551`) | `setIsNoteEditorOpen(true)` | yes | **YES** |
| `CanvasClient:6729` `onEditPadletAsPost` | **`DrawingLayout`** → `CanvasContextMenu:172` | **only when `isContainerType`** — `padlet.type === 'container' \|\| metadata.isContainer === true` (`:105`) | n/a | `setIsNoteEditorOpen(true)` | yes | **NO** |

**Correction 1 — `DrawingLayout` is not Document-reachable.** `CanvasContextMenu:172` calls
`onEditPadletAsPost` only under `isContainerType && onEditPadletAsPost`, otherwise `onEdit(padlet)`.
A Document is `type:'card'` without `metadata.isContainer`, so it never takes that branch. **§18.3
over-reported the blast radius by one route.**

**Correction 2 — the two reachable routes are capability-gated, and by the *right* boolean.** Both
sites disable the context menu with `disabled={!isEditable}`, and `isEditable` is wired from
**`canUseFreeformEditButton`** (`:6466`, `:6551`) — **the same boolean
`selectCardModalRoute(canUseFreeformEditButton)` consumes**. A read-only user cannot open the menu at
all, so they reach *no* modal rather than the wrong one. **This is not a permission bypass, and
PATCH-139/151 are not weakened.** §18.3's "ungated" framing was wrong.

**The real defect, correctly stated — a P3 data-integrity hazard, not a security one.** An *editable*
user opening a Document from Columns or Rows lands in **`NoteEditor`**, whose save contract
`SaveNoteData` has **no `title` field** (`usePadletSave.ts:34-47`; `saveNote` hardcodes
`title: 'New Note'` only on insert and never updates title thereafter). Saving therefore **cannot
persist the Document's title**, and writes note-shaped metadata (`cardColor`, `topStrip`,
`reactions`, `badgeColor`, `detachedComments`) onto a Document row. Both measured Documents have
titles, so this is a live path to losing user work (**P3**, P10).

**Non-Document blast radius.** `onOpenPost` is a generic handler: Note, Todo, Link, Image and
embedded-media posts also flow through it and **must keep their current destinations**. The fix must
therefore branch *only* on the Document predicate and fall through untouched for everything else —
which is precisely why RTE-C is selected below over centralisation.

### 19.5 Routing architecture — **RTE-C · shared Document open helper**

- **RTE-A rejected:** a central dispatcher would put Note/Todo/Link/Image/comment routing on the
  table across three layouts — exactly the "generic modal-permission redesign without evidence" the
  brief forbids.
- **RTE-B rejected:** duplicating the predicate + capability branch at each of three owners
  re-creates the P6 duality this patch exists to end.
- **RTE-C selected:** one narrow helper returning the Document modal destination, consumed by the two
  layout owners **and** the existing Freeform path, composing with — never replacing —
  `selectCardModalRoute`. Non-Document posts fall through to today's behaviour, untouched.
- RTE-D not needed: with `DrawingLayout` excluded, the routing work is two call sites.

**Capability authority unchanged:** reuse `canUseFreeformEditButton` and `selectCardModalRoute`;
introduce no second role model; never infer permission from callback presence; client gating remains
UI-only and is not the persistence authorization boundary.

### 19.6 Adapter contract (now specified against measured shapes)

One boundary, `lib/domain/canvas/documentContentAdapter.ts`, pure and node-testable:

- `classifyDocumentContent(raw)` → `empty | plain-text | html | escaped-html | malformed | json | unknown`.
- `toEditorHtml(raw)` — **plain text (the measured majority case): HTML-escape `&`, `<`, `>` first**,
  then map newlines to paragraph/`<br>` structure so the 332-newline row survives. **Never** hand raw
  text to TipTap as HTML.
- `html` — pass through the existing `DOMPurify` boundary; preserve supported marks **and `data-*`
  attributes** (the PDF seam; §14.6).
- `empty` → empty TipTap document. `malformed`/`unknown` → **fail safe by treating as plain text**;
  never silently drop visible source.
- `fromEditorHtml(html)` — normalize for persistence; treat `<p></p>` as empty; **metadata passes
  through untouched**.
- **No bulk migration, no schema change.** Lazy normalization only on a later user save, and **B1
  does not change save semantics** (B2 owns that).

### 19.7 Split decision — **S2**, and the budgets that force it

Counting the work: 3 new domain/editor files + `NoteEditor` hook adoption + a Document wrapper +
toolbar mode-filtering + 2 routing call sites + `CanvasClient` wiring exceeds the brief's own
one-patch ceiling (≈6 production files / 250 production lines). **S2 is selected; nothing is
compressed to fit.**

**PATCH-149B1a — predicate, adapter, shared core.** Production allowlist:

| # | Path | Change | Max lines |
|---|---|---|---|
| 1 | `lib/domain/canvas/documentPost.ts` | **new** — `isDocumentPost` predicate, pure | **25** |
| 2 | `lib/domain/canvas/documentContentAdapter.ts` | **new** — §19.6 adapter, pure | **110** |
| 3 | `components/collabboard/editors/useSharedTipTapEditor.ts` | **new** — R1 hook: `useEditor`, exported extension registry, content init, `getHTML`, `editable` flag; accepts optional `editorProps`/`handleClick` override (the one measured coupling, §18.4) | **90** |
| 4 | `components/collabboard/editors/NoteEditor.tsx` | consume the hook; **behaviour-preserving only** — no lifecycle, toolbar, comment, colour or reaction change | **45** |

**Production total ≤ 270 lines / 4 files.** Tests: `documentPost.test.ts` (≤80, node),
`documentContentAdapter.test.ts` (≤160, node), `useSharedTipTapEditor.test.tsx` (≤120, **jsdom**, in
`components/collabboard/editors/`), plus ≤20 lines of additions to
`NoteEditor.characterization.test.tsx`. **Test total ≤ 380 / 4 files.**

**PATCH-149B1b — wrapper, routing, read-only, toolbar. BLOCKED until B1a closes.** Indicative scope
(budgets issued at its own authoring): `DocumentEditor.tsx` (new wrapper, editable + read-only via
`editable:false`), `NoteEditorToolbar.tsx` (mode/capabilities filtering, **Align excluded from
Document mode only**), the RTE-C helper's two layout call sites plus the Freeform path, and
`CanvasClient`/`CanvasModals` wiring.

### 19.8 Induced failures — each demonstrable at parent `204c755`

**B1a:** (1) no `isDocumentPost` helper exists — the predicate is inlined at `CanvasClient:5700/5704`;
(2) no content adapter exists — plain text with `<` reaches no escaping boundary anywhere;
(3) no shared TipTap core exists — `NOTE_EXTENSIONS` is module-private and unexported
(`NoteEditor.tsx:23`), consumed by exactly one `useEditor`;
(4) feeding the measured 9,250-char angle-bracket shape to TipTap as HTML **loses content** — the
proof that §19.6's escaping rule is required.

**B1b (recorded, proven at its own authoring):** the Document predicate routes to `CardEditor`;
read-only Documents render textarea semantics; `Align` renders in the only rich-text toolbar;
Columns/Rows open Documents in `NoteEditor` where a save drops the title (§19.4).

### 19.9 Negative controls

**B1a:** classify clipart as Document → predicate test fails · classify a `'text'` note as Document →
fails · treat plain `<example>` text as HTML → round-trip test fails on lost content · strip `data-*`
in the adapter → attribute round-trip fails · drop the newline mapping → the 332-newline fixture
fails · change `NoteEditor`'s save payload or lifecycle during hook adoption → B0 characterization
fails (10 tests) · unexport/duplicate the extension registry → shared-core test fails.

**B1b:** render read-only with an editable editor · expose a toolbar in read-only · restore `Align` in
Document mode · route a Document back to `CardEditor` · bypass capability on the layout routes ·
embed title into body HTML · add a PDF-specific branch. Each must be detected.

### 19.10 Validation matrix

Corpus evidence (§19.1–19.2, recorded — not re-runnable without fresh approval) · adapter tests ·
predicate tests · shared-core jsdom tests · **B0 `NoteEditor` characterization regression, 10/10
unchanged** · `CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute` · routing
source-slices where full render is impractical · **full Vitest (baseline 67 files / 775 tests)** ·
clean one-run `npm run typecheck` (**410** declarations) · `npx next build` · bridge exclusion
(**891** files) · clean E2E build (marker `1`) · ordinary `.next` restored and exclusion re-verified ·
`git diff --check` · only the five protected worktree paths. **No new test environment; no package or
schema change.**

### 19.11 Hard stops — re-evaluated

| Hard stop | Result |
|---|---|
| Real corpus contains non-Document rows satisfying the predicate | **NOT TRIGGERED** — 2/2 rows are Documents, corroborated by `metadata.description` (§19.2) |
| Corpus shapes cannot be safely distinguished | **NOT TRIGGERED** — two shapes, both plain text; zero HTML |
| Extraction requires broad NoteEditor rewrite | **NOT TRIGGERED** — R1, one `useEditor`, single `handleClick` coupling |
| Existing NoteEditor behavior cannot be preserved | **NOT TRIGGERED** — B0's 10 characterization tests are the guard; still under-covered for comment/colour/reaction (§18.4), so B1a is behaviour-preserving only |
| Plain text cannot be adapted without schema changes | **NOT TRIGGERED** — escaping + newline mapping; no migration |
| Custom attributes do not survive serialization | **NOT TRIGGERED** — proven by the shipped `Comment` extension |
| Read-only TipTap still permits mutation | **UNVERIFIED — deferred to B1b**, must be proven in the B0 harness, not assumed |
| **Routing requires weakening PATCH-139/151** | **NOT TRIGGERED** — §19.4 shows both reachable routes already gate on `canUseFreeformEditButton`; RTE-C composes with `selectCardModalRoute` |
| Cannot be tested with the B0 harness | **NOT TRIGGERED** |
| **Production scope cannot be bounded** | **RESOLVED** — `DrawingLayout` excluded; B1a is 4 files / ≤270 lines |

### 19.12 Status

**PATCH-149B1a: OPEN · AUTHORIZED** — 4 production files, ≤270 production lines, ≤380 test lines.
**PATCH-149B1b: OPEN · BLOCKED until B1a closes.**

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **OPEN · AUTHORIZED — next implementation unit** |
| **PATCH-149B1b** | **BLOCKED until B1a closes** — wrapper · RTE-C routing · read-only · toolbar |
| **PATCH-149B2** | **BLOCKED until B1b closes** — Save/dirty/discard/Close/Escape; B1 leaves seams, implements none |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Carried to B1b as a first-class item:** the Columns/Rows title-loss path (§19.4). It is a live P3
hazard today, independent of the TipTap migration, and must not be lost behind the foundation work.

---

## 20. PATCH-149B1a — INDEPENDENT CLOSURE REVIEW · **CLASSIFICATION 4 · CORRECTION REQUIRED**

**Reviewed:** 2026-08-04 (independent closure reviewer). **Commit under review:** `c44a2ac`
`refactor(editor): extract shared TipTap document foundation`, parent `82b099c`. All evidence below
was re-executed independently; nothing was taken from the implementer's report. **No implementation
file was modified by this review** — every perturbation was reverted and hash-verified.

### 20.1 Source scope — **EXACT, within budget**

Eight files, matching the §19.7 allowlist precisely.

| File | Lines | Budget | |
|---|---|---|---|
| `lib/domain/canvas/documentPost.ts` | 6 | 25 | ✅ |
| `lib/domain/canvas/documentContentAdapter.ts` | 55 | 110 | ✅ |
| `components/collabboard/editors/useSharedTipTapEditor.ts` | 72 | 90 | ✅ |
| `components/collabboard/editors/NoteEditor.tsx` | 43 (3+/40−) | 45 | ✅ |
| **Production** | **176** | **270** | ✅ |
| `documentPost.test.ts` | 52 | 80 | ✅ |
| `documentContentAdapter.test.ts` | 125 | 160 | ✅ |
| `useSharedTipTapEditor.test.tsx` | 111 | 120 | ✅ |
| `NoteEditor.characterization.test.tsx` | 9 | 20 | ✅ |
| **Tests** | **297** | **380** | ✅ |

**Verified unchanged in `c44a2ac`** (`git diff --numstat` empty for each): `CanvasClient.tsx`,
`FreeformPadletCards.tsx`, `cardModalRoute.ts`, `CardPreview.tsx`, `CardEditor.tsx`,
`ClipartCardDraftModal.tsx`, `usePadletSave.ts`, `NoteEditorToolbar.tsx`, `SafeHtmlContent.tsx`,
`extensions/Comment.ts`, `package.json`, `package-lock.json`. No `.fable5` file, no routing file, no
persistence hook, no schema, no migration, no presentation code, no Excalidraw fork file. **No PDF
production code** — the single `pdf` occurrence is a comment in the hook naming the extension seam,
which is what §6/P4 asked for.

### 20.2 Document predicate — **CORRECT**

`isDocumentPost(post) ≡ post.type === 'card' && !post.metadata?.svgUrl` matches §19.3 exactly. Pure,
deterministic, no React/persistence/permission work, no new `document` type, tolerant of absent
metadata, and structurally incapable of consulting title or geometry (they are not in its
`Pick<Padlet,'type'|'metadata'>` signature). Accepts ordinary Documents; excludes clipart and
`text`/`todo`/`link`/`image`/`comment`/`file`.

**Empty-string `svgUrl` edge — NOT blocking.** `metadata.svgUrl === ''` is falsy, so the row
classifies as a Document. That is the governed reading ("absence of a *usable* svgUrl") and matches
real source semantics: every clipart producer writes a non-empty URL, and an empty string would
render no clipart. Correct as written.

**Open duality (authorized, not a defect):** the predicate remains inlined at `CanvasClient:5700/5704`
because `CanvasClient` is outside B1a's allowlist. P6 duality closes when B1b wires the helper.

### 20.3 Adapter — classification and safety

Structure is right: one pure boundary, three exported functions, reusing the project's existing
DOMPurify sanitizer rather than a second one. `SUPPORTED_TAG` is a genuine real-tag allowlist — it is
`SafeHtmlContent.looksLikeHtml`'s tag set plus `s` and `mark` (which correspond to the shipped
`StarterKit` strike and `Highlight` extensions), so it is consistent with the precedent, broad enough
for current NoteEditor output, and **not** a permissive `<word>` detector. `fromEditorHtml` normalizes
`<p></p>`/whitespace to `''` and touches neither title nor metadata.

**Malformed angle-bracket proof — PASSES decisively, and is quantified.** Mounting the corpus-shaped
fixture (9,000 chars, 600 LF, zero real tags) in real jsdom TipTap:

| Path | Visible chars | Text after first `<` | Paragraphs |
|---|---|---|---|
| **Raw → TipTap as HTML** (parent behaviour / NC2) | **4,399** — 51% lost | **swallowed** | 1 (600 newlines gone) |
| **Through `toEditorHtml`** | **8,400** | **retained** | 201 `<p>` + 201 `<br>` |

8,400 = 9,000 − 600 newlines, i.e. **every non-newline character survives** and newlines become
structure. §19.6's escaping rule is load-bearing and correctly implemented for this shape.

**F2 — mixed real-tag + bare-bracket content silently drops text. DEFECT.** Measured:

```
toEditorHtml('Use <example> as a placeholder <p>and real markup</p>')
  → 'Use  as a placeholder <p>and real markup</p>'      // "example" gone
```

One real tag flips the whole string to `html`, and DOMPurify then strips the unknown `<example>`
element **and its text**. This violates §19.6's explicit rule — *"`malformed`/`unknown` → fail safe by
treating as plain text; **never silently drop visible source**"* — and it is the same defect class the
patch exists to eliminate. It is currently **unreachable in production** (corpus has 0 HTML rows;
NoteEditor serializes user-typed brackets as entities before storage), so it is latent, not live —
but it is a defect in the delivered boundary, not future work.

### 20.4 Corpus fidelity — **CLEAN**

Fixtures are synthetic (`'Line one <not a tag\n\nLine two > also not one\n'.repeat(40)`) and reproduce
the measured structural risks — bare brackets, many LF newlines, zero real tags — without copying
stored content. **No real corpus content, title, or identifier appears in any test or in this
governance record.**

### 20.5 Custom attributes — **PRESERVED, with the boundary stated precisely**

`data-comment-id` and `data-color` survive `DOMPurify.sanitize` (default `ALLOW_DATA_ATTR: true`), and
both are the **actual** attribute names emitted by the shipped `Comment` mark (`extensions/Comment.ts`
renders `data-comment-id`, `data-comment-text`, `data-comment-thread`, `data-user-id`,
`data-user-name`, `data-timestamp`, `data-color`). A round-trip through real TipTap `getHTML()`
confirms retention. No PDF-specific attribute or node exists in production; the seam is a comment.

**Precise boundary — the guarantee is narrower than "custom attributes survive."** What is guaranteed
is **sanitizer-allowed `data-*` attributes**. A future custom node using a non-`data-*` attribute
would be stripped and is **not** covered by this patch's evidence. Recorded so B1b does not inherit an
overbroad assumption.

### 20.6 Shared hook — architecture **CORRECT**, contract **DEFECTIVE**

Extracts exactly the reusable foundation (`useEditor`, one exported registry, initial content,
`editable`, `onUpdate`, `getHTML` access, caller-supplied `editorProps`) and owns **none** of the
modal shell, sticky-note layout, reactions, colour popup, comment popup, overlays, title, persistence,
routing, or Save/Close lifecycle. **Exactly one authoritative registry** — `SHARED_TIPTAP_EXTENSIONS`
is declared once and no duplicate exists anywhere in the tree.

**Editor-props boundary — architecturally correct.** Leaving `editorProps.attributes` with the caller
is right: the hook hard-codes none of NoteEditor's 280px sticky-note styling, NoteEditor still supplies
its own attributes, and a Document wrapper can supply different layout attributes. That it also
resolved a 47→43 line-budget overage does not weaken the reasoning.

**F1 — the hook emits a phantom `onUpdate` on mount. DEFECT.** Proven by differential probe with
identical extensions and content:

| Harness | `onUpdate` calls before any interaction |
|---|---|
| Raw `useEditor` | **0** |
| `useSharedTipTapEditor` | **1** — `"<p>start</p>"` |

**Mechanism:** `@tiptap/core@3.13.0` `setEditable(editable, emitUpdate = true)` emits `"update"`
**unconditionally**, without comparing to the current value. The hook's
`useEffect(() => { if (editor) editor.setEditable(editable); }, [editable, editor])` therefore fires a
content-less update on every mount.

**This corrects the implementer's stated diagnosis.** The report attributed the extra call to TipTap
firing `onUpdate` on creation; TipTap does not (0 calls above). The cause is the hook's own effect —
and the shared-hook test's `not.toHaveBeenCalled()` assertion was **removed** to accommodate an
artifact the hook itself introduced. The surviving assertion (`toHaveBeenCalled()` after an
interaction) cannot detect a regression here.

**Why it blocks rather than defers:** the delivered API documents `onUpdate` as firing "on content
change"; it demonstrably fires when content did not change. B2 explicitly owns dirty state and discard
confirmation, whose canonical implementation is `onUpdate → setDirty(true)` — on this foundation every
freshly-opened Document would be dirty on arrival and prompt a discard confirmation the user never
earned (P3, P10). NoteEditor is unaffected today only because it does not use `onUpdate`.

**Proven correction, one line, inside the authorized file and budget:**

```ts
if (editor && editor.isEditable !== editable) editor.setEditable(editable);
```

Re-probed with this guard: phantom count **0**; raw-vs-hook parity restored. (Applied only as a probe
and reverted; `useSharedTipTapEditor.ts` is byte-identical to `c44a2ac` at
`4b321f518a2dd3e49a50a2ac9f8ea15fa606bbd3`.)

### 20.7 `editable=false` — **REAL, not cosmetic**

Measured under real jsdom TipTap with `editable={false}`:

```
contenteditable = "false"   editor.isEditable = false
view.editable   = false     options.editable  = false
```

This is genuine ProseMirror editable state, which rejects user-originated input — **not** a CSS or
attribute veneer. The core flag is real, as the brief required.

Programmatic commands still mutate (`chain().focus().insertContent(' HACKED').run()` →
`<p> HACKEDlocked</p>`). That is ordinary ProseMirror semantics and is precisely the hard stop §19.11
recorded as **"UNVERIFIED — deferred to B1b"**; it remains deferred, now with a measurement attached.
**Observation:** the shipped test asserts only the `contenteditable` attribute; asserting
`editor.isEditable` would bind the stronger fact the evidence supports.

### 20.8 NoteEditor adoption — **NARROW EXTRACTION, NO REWRITE**

The diff replaces 10 import lines with 1, deletes the 16-line `NOTE_EXTENSIONS` array, swaps the
`useEditor` call header for the hook, and removes the now-duplicated content-reset `useEffect`. The
`attributes` block and the ~37-line `handleClick` body appear as **unchanged context** — preserved at
their original nesting and semantics. No modal UI moved, no save lifecycle changed, no title or
`readOnly` prop added, no Align/reaction/colour/comment/focus behaviour touched.

**Regression: 11/11 pass**, including all 10 unmodified B0 characterization tests — closed state
renders nothing; open state renders real DOM (>1000 chars) with the same overlay class, ProseMirror
body and toolbar; Align still present; legacy HTML initializes; visible Close and backdrop both save
**then** close; Escape does nothing; payload keys unchanged with no `title`/`metadata`; 280px width
intact; cleanup stable with no delayed ProseMirror warning.

The added source guard is correctly scoped to shared-hook adoption (`useSharedTipTapEditor(` present,
`useEditor(` and `NOTE_EXTENSIONS` absent) and provably detects reversion (NC7).

### 20.9 jsdom adapter-test deviation — **CLASSIFICATION A**

`documentContentAdapter.test.ts` opts into jsdom via a per-file docblock because `dompurify` throws
`DOMPurify.sanitize is not a function` under plain Node. This is **correct use of the already-approved
B0 harness**: only that file opts in, `vitest.config.ts`'s global `environment: 'node'` is untouched,
no setup file, polyfill, mock or dependency was added, and it exercises the **real** sanitizer instead
of mocking it away. The implementer flagged it proactively. §19.7's "node" annotation was the
governance error, not the implementation's — corrected here.

### 20.10 Induced failures — **6/6 reproduced at `82b099c`**

1. `documentPost.ts` absent. 2. `documentContentAdapter.ts` absent. 3. malformed content handed to
TipTap as HTML loses 51% of it (§20.3 table). 4. `useSharedTipTapEditor.ts` absent. 5. `NoteEditor`
owns `useEditor` directly (`:232`) over a module-private, unexported `NOTE_EXTENSIONS` (`:23`).
6. no `isDocumentPost`/`toEditorHtml`/`classifyDocumentContent` symbol exists anywhere in the tree.
The implementation resolves 1, 2, 4, 5, 6 fully and 3 for all non-mixed shapes (see F2).

### 20.11 Negative controls — **10/10 detected, 10/10 reverted and hash-verified**

| # | Perturbation | Detection |
|---|---|---|
| 1 | classify clipart as Document | predicate suite **2 fail** |
| 2 | treat all angle-bracket input as HTML | 51% content loss measured |
| 3 | omit `<` escaping | adapter suite **4 fail** |
| 4 | strip `data-*` (`ALLOW_DATA_ATTR:false`) | adapter suite **1 fail** |
| 5 | force `editable=true` when `false` requested | hook suite **1 fail** |
| 6 | second extension registry in NoteEditor | hook suite **1 fail** |
| 7 | restore direct `useEditor` ownership | characterization **10 fail** |
| 8 | reverse Close/save order | characterization **1 fail** |
| 9 | remove Align | characterization **1 fail** |
| 10 | fake PDF production branch | source gate flags it |

Post-revert hashes, all matching `c44a2ac`: `documentPost.ts` `257ee9e4…`,
`documentContentAdapter.ts` `0eabf1a6…`, `useSharedTipTapEditor.ts` `4b321f51…`, `NoteEditor.tsx`
`6220f21d…`, `NoteEditorToolbar.tsx` `f15694bf…`.

### 20.12 Validation — **all green**

Full Vitest **70/70 files · 813/813 tests** (matching the expected totals) · `npm run typecheck`
exit 0 · **410** declarations · `npx next build` exit 0 · bridge exclusion **891** files ·
`npm run build:e2e` exit 0 with marker **`1`** · ordinary `.next` restored, exclusion re-verified at
**891**, marker **absent** · `git diff --check` exit 0 · worktree shows only the five pre-existing
protected paths.

**Environment observation:** the first ordinary build of this review failed with
`TypeError: Cannot read properties of undefined (reading 'length')` against the `.next` left in the
worktree; `rm -rf .next` followed by a rebuild succeeded and every subsequent build was clean. A stale
build cache, not a code defect — recorded so it is not re-diagnosed later.

### 20.13 False-green review

Checked against every reject criterion. **Not triggered:** real corpus content in tests · NoteEditor
behaviour changed · Align removed · save/close changed · routing changed · persistence changed ·
Document wrapper added · read-only Document modal added · second TipTap registry · PDF production code
· `editable=false` cosmetic (proven real, §20.7) · adapter tests mocking the sanitizer (proven real,
§20.9) · production scope exceeded.

**Partially triggered — "malformed corpus-shaped text is interpreted as HTML":** the pure
corpus-shaped row is handled correctly, but a *mixed* string containing one real tag is classified
`html` and loses its malformed portion (F2, §20.3).

### 20.14 Observations (non-blocking, for B1b)

1. **Classification surface narrowed 7 → 4.** §19.6 specified `empty | plain-text | html |
   escaped-html | malformed | json | unknown`; four are implemented. `json`/`unknown` fold into
   `plain-text` harmlessly. `escaped-html` has no class and no entity decoding, so
   `&lt;p&gt;hi&lt;/p&gt;` double-escapes to a literal `&lt;p&gt;…` display — **content preserved, no
   loss**, but diverging from `SafeHtmlContent`'s `decodeEntitiesDeep` precedent. Zero corpus
   instances. Either implement the classes or amend §19.6 to the four that exist.
2. `NoteEditor.tsx`'s `useSharedTipTapEditor({ initialContent,` brace-hugging formatting is a
   diff-minimisation artifact that reads oddly; cosmetic, safe to normalise in a later patch.
3. The hook-test `editable=false` assertion could bind `editor.isEditable` (§20.7).
4. The Columns/Rows title-loss path (§19.4) remains carried to B1b, untouched and still live.

### 20.15 Required correction — **narrow and fully specified**

Scope is confined to two already-authorized files; **no new file, no budget increase, no re-authoring
of §19.**

| # | File | Correction |
|---|---|---|
| **F1** | `useSharedTipTapEditor.ts` | Guard the editable effect: `if (editor && editor.isEditable !== editable) editor.setEditable(editable);` (proven, §20.6) |
| **F1t** | `useSharedTipTapEditor.test.tsx` | Restore an assertion that `onUpdate` is **not** called before any interaction, so the phantom cannot regress |
| **F2** | `documentContentAdapter.ts` | Do not let one real tag make the whole string `html` when unmatched bare brackets remain. Either escape residual bare brackets before sanitizing, or require the input to be *wholly* tag-structured to classify as `html` and fall back to escaped text otherwise — §19.6's "never silently drop visible source" must hold for mixed input |
| **F2t** | `documentContentAdapter.test.ts` | Add the mixed-content case: `'Use <example> as a placeholder <p>and real markup</p>'` must retain `example` |

**Explicitly out of correction scope:** the predicate, the extraction, the registry, the editor-props
boundary, NoteEditor's diff, and the jsdom decision — all reviewed and **correct as shipped**. They
must not be re-opened.

### 20.16 Classification and status

**CLASSIFICATION 4 — OPEN · IMPLEMENTATION CORRECTION REQUIRED.**

The architecture is right and the great majority of the work is correct and well-evidenced. Two proven
defects sit in the delivered foundation's contract — a phantom `onUpdate` (with a weakened test that
would hide its regression) and silent content loss on mixed input — and both land in exactly the seams
B1b and B2 are about to build on. Correcting them costs a handful of lines now; inheriting them means
re-opening a closed foundation later.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **OPEN · CORRECTION REQUIRED** (§20.15) — `c44a2ac` stands; correction lands on top |
| **PATCH-149B1b** | **BLOCKED — not released.** B1a did not close |
| **PATCH-149B2** | **BLOCKED until B1b closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

No implementation file was modified by this review. Nothing was pushed.

---

## 21. PATCH-149B1a — SECOND INDEPENDENT CLOSURE REVIEW (POST-CORRECTION) · **CLASSIFICATION 1 · CLOSED**

**Reviewed:** 2026-08-04 (independent closure reviewer, second pass). **Commits under review:**
`c44a2ac` (original) + `856f54b` `fix(editor): preserve document content and suppress phantom updates`
(correction), against §20's two required fixes. All evidence below was re-executed independently.
**No implementation file was modified by this review** — every perturbation was reverted and
hash-verified against `HEAD` (`856f54b`).

### 21.1 Correction source scope — **EXACT**

`git diff --numstat c44a2ac 856f54b` touches exactly the four authorized files: `useSharedTipTapEditor.ts`
(+3/−1), `useSharedTipTapEditor.test.tsx` (+13/−8), `documentContentAdapter.ts` (+15/−3),
`documentContentAdapter.test.ts` (+23/−0) — 54 insertions / 12 deletions, matching the reported total
exactly. No new file. `git diff --name-only 82b099c 856f54b -- . ':!.fable5'` returns exactly the
original eight B1a files — the combined implementation-plus-correction still touches nothing beyond
the §19.7 allowlist. Re-verified unchanged: `CanvasClient.tsx`, `FreeformPadletCards.tsx`,
`cardModalRoute.ts`, `CardPreview.tsx`, `CardEditor.tsx`, `ClipartCardDraftModal.tsx`,
`usePadletSave.ts`, `NoteEditorToolbar.tsx`, `package.json`, `package-lock.json`. No `.fable5` file in
either commit. No routing, persistence, schema, presentation, or Excalidraw fork file touched. No
Document wrapper, no read-only modal, no PDF implementation, no save/dirty/discard work — none of
B1b/B2 leaked in.

### 21.2 F1 — phantom update — **RESOLVED**

Implementation: `editor.setEditable(editable, false)` — exactly the prescribed non-emitting form.

Independently measured at `HEAD` with a fresh probe harness (not reusing the shipped test file):

| Check | Result |
|---|---|
| Mount, `onUpdate` calls | **0** |
| `true→false` editable toggle, `onUpdate` calls | **0** |
| `false→true` editable toggle, `onUpdate` calls | **0** |
| Real content mutation (`insertContent`) | **fires**, with correct serialized HTML |
| `editable=false`: `isEditable` / `view.editable` / `options.editable` | **all `false`** — genuine ProseMirror state, not cosmetic |

Update callbacks are not globally suppressed — real mutation still fires (verified both in the
independent probe and via the shipped test at `useSharedTipTapEditor.test.tsx:105-115`). This is
behavioral restoration, not test concealment: the probe used a harness the implementer never wrote,
and it confirms zero calls on mount **and** on both toggle directions — stronger than governance's
literal ask (only mount + one toggle direction were required).

**Diagnosis correction carried from §20 is now moot** — the fix targets the actual mechanism
(`setEditable`'s `emitUpdate` parameter), not a test-side workaround, so the corrected diagnosis and
the corrected code agree.

### 21.3 F2 — mixed-content loss — **RESOLVED**

Implementation: `isWhollySupportedHtml(raw)` — extracts every tag-like token via
`TAG_LIKE = /<\/?[a-zA-Z][^<>]*>/g` and requires **all** of them to match the anchored
`SUPPORTED_TAG` allowlist before classifying as `html`; otherwise falls through to `malformed` →
escaped visible text. One real tag can no longer promote an adjacent unsupported/bare sequence into
the sanitizer.

Independently re-measured, all seven required examples:

| Input | Class | Visible text (DOM-parsed) |
|---|---|---|
| `Use <example> as a placeholder` | malformed | `<example>` fully visible |
| `<p>Hello <strong>world</strong></p>` | **html** | paragraph + bold survive as markup |
| `Use <example> as a placeholder <p>and real markup</p>` | **malformed** | `example`, `as a placeholder`, `and real markup` **all present**; input string unmutated |
| `<p>Open paragraph` (unclosed) | html | `Open paragraph` fully visible (DOMPurify auto-closes) |
| `x < y && y > z` | malformed | `x < y && y > z` fully visible |
| `<span data-comment-id="c1" data-color="#fff">hi</span>` | html | both `data-*` attributes survive |
| `null` / `''` / whitespace | empty | unchanged (`''`) |

Boundary cases independently probed beyond the governed list, all fail-safe: **uppercase tags**
(`<STRONG>`) classify `html` correctly (regex is `/i`); **self-closing** `<br/>` classifies `html`
correctly; **comment-like** (`<!-- internal -->`) and **doctype-like** (`<!DOCTYPE html>`) sequences
are not tag-like per `TAG_LIKE` (no letter immediately follows `<`) and fall through to `malformed` —
no crash, no data loss, visible text fully retained. These forms are outside current governed editor
output and are recorded as a non-blocking boundary, not a defect.

`isWhollySupportedHtml` is **not** a permissive `<word>` matcher — it requires membership in the fixed
17-name allowlist, tested per isolated token via an **anchored** (`^...$`) pattern, not a substring
search against the raw string (the mechanism that caused the original defect). No new dependency was
introduced (still `dompurify` only). Determinism/no-mutation re-confirmed (`input` string
byte-identical after `classifyDocumentContent` and after `toEditorHtml`, both before and after this
review's own probes).

### 21.4 Induced failures — **reproduced at `c44a2ac`, resolved at `856f54b`**

A probe harness independent of the shipped tests was run against the pre-correction files
(`useSharedTipTapEditor.ts`/`documentContentAdapter.ts` checked out at `c44a2ac`, correction test
files layered on top):

- **F1 at parent:** mount → **1** phantom call; toggle → **2** calls (mount effect + toggle effect,
  both emitting under the old unconditional default) — both assertions fail as required.
- **F2 at parent:** `classifyDocumentContent(mixed)` → `'html'`; assertion fails as required.
- **Control:** the `editable=false` realness check **passed even at parent** — confirming that
  specific property was never broken and the correction did not need to touch it.

At `856f54b` (current `HEAD`), the same three probes all pass: 0 phantom calls, mixed content
preserved, `editable=false` remains real.

### 21.5 Negative controls — **12/12 detected, 12/12 reverted and hash-verified**

**F1 (3):** restore emitting `setEditable(editable)` → 2 tests fail · suppress `onUpdate` entirely →
real-mutation test fails · force `editable=true` regardless of prop → editable=false test fails.

**F2 (4):** restore old "one supported tag ⇒ html" rule → 3 tests fail · disable html classification
entirely → 3 tests fail · strip unsupported tag-like sequences instead of escaping → 6 tests fail ·
strip `data-*` attributes → 1 test fails (isolated to the adapter suite; the hook suite's own
Comment-attribute round-trip test, which does not route through the adapter, is correctly unaffected).

**Original B1a regressions re-checked (5):** clipart classified as Document → predicate suite 2 fail ·
direct `useEditor` restored in NoteEditor → characterization suite 10/10 fail · Close/save order
reversed → characterization 1 fail · `Align` removed from toolbar → characterization 1 fail · second
extension registry introduced → hook suite 1 fail.

All 9 governed files (`documentPost.ts`, `documentContentAdapter.ts`, `useSharedTipTapEditor.ts`,
`NoteEditor.tsx`, and their four test files, plus `NoteEditorToolbar.tsx`) independently hashed against
`HEAD` after every perturbation-and-revert cycle: **all match exactly**, no drift.

### 21.6 Adapter classification surface — **A: semantically adequate, no amendment needed**

§19.6 specified a seven-label surface (`empty | plain-text | html | escaped-html | malformed | json |
unknown`); four are implemented (`empty | plain-text | html | malformed`), unchanged by this
correction. Re-confirmed non-blocking: `json`/`unknown` inputs fold into `plain-text` (no tag-like
tokens found → escaped, nothing lost) or `malformed` (bare brackets present → escaped, nothing lost);
`escaped-html` has zero corpus instances and, if it ever appears, double-escapes to visible literal
`&lt;p&gt;…` — content preserved, just not decoded to the SafeHtmlContent-style visual the label would
imply. No governed content shape is misclassified in a way that loses data. **No governance wording
amendment required** — the four-label implementation satisfies the contract's actual behavioral
requirement (never silently drop visible source).

### 21.7 Custom-attribute boundary — **restated, unchanged, sufficient**

Guaranteed: sanitizer-allowed `data-*` attributes survive (default `ALLOW_DATA_ATTR: true`), confirmed
against the shipped `Comment` extension's real attribute names (`data-comment-id`, `data-comment-text`,
`data-comment-thread`, `data-user-id`, `data-user-name`, `data-timestamp`, `data-color`). **Not**
guaranteed: arbitrary non-`data-*` custom attributes. No PDF-specific attribute or node exists in
production. This boundary is sufficient as the extension seam for any future TipTap node whose state
serializes through `data-*` — exactly the pattern the shipped `Comment` mark already uses — without
requiring any change to the adapter.

### 21.8 Shared hook — **regression-free**

Single authoritative `SHARED_TIPTAP_EXTENSIONS` registry, still declared exactly once tree-wide
(re-confirmed via NC-ORIG-5). Hook owns exactly `useEditor`, the registry, content init, `editable`,
`onUpdate`, and caller-supplied `editorProps` — no modal shell, no Note-specific layout, no
persistence, no title, no routing, no Save/Close lifecycle. The F1 fix is fully contained inside the
hook's own `editable`-sync effect and touches nothing else in its contract.

### 21.9 NoteEditor — **regression-free, 11/11**

Characterization suite unchanged and passing in full: closed state renders nothing; open state
produces real DOM (>1000 chars) with the same overlay class, ProseMirror body, and toolbar; `Align`
still present; legacy HTML initializes; visible Close and backdrop both save then close, in that
order; Escape is a no-op; payload keys unchanged with no `title`/`metadata`; 280px width intact;
extraction-ownership source guard holds (`useSharedTipTapEditor(` present, `useEditor(` and
`NOTE_EXTENSIONS` absent). No B1b or B2 behavior appears anywhere in the diff.

### 21.10 Document predicate — **byte-identical, unaffected**

`documentPost.ts` hash `257ee9e4…` matches `HEAD` exactly — the correction touched only the two
authorized files and never approached the predicate. All 10 predicate tests pass; NC-ORIG-1
(clipart-as-Document) still correctly detected.

### 21.11 Full validation — **all green, matching expected totals exactly**

Full Vitest **70/70 files · 816/816 tests** (813 baseline + 3 net new: +2 F2 adapter tests, +1 net
hook test after consolidating two F1 assertions into fewer, denser `it()` blocks) · `npm run
typecheck` exit 0 · **410** declarations · `npx next build` exit 0 · bridge exclusion **891** files ·
`npm run build:e2e` exit 0, marker **`1`** · ordinary `.next` restored, exclusion re-verified at
**891**, marker **absent** · `git diff --check` exit 0 · worktree shows only the five pre-existing
protected paths throughout.

### 21.12 False-green review

Checked against every reject criterion in the review brief. **None triggered:** mount emits an update
(0, independently measured) · toggling editable emits a content update (0, both directions) · real
mutations no longer emit (they do, verified) · mixed content still loses characters (it does not,
DOM-measured) · valid HTML is always escaped (it is not — `<p>Hello <strong>world</strong></p>` still
renders as markup) · Comment data attributes stripped (they survive) · tests only compare output
length (this review used real DOM `textContent` parsing throughout, independent of the shipped tests'
own approach) · NoteEditor behavior changed (11/11 unchanged) · routing or persistence changed (zero
diff) · PDF-specific code introduced (none) · correction exceeded the four-file authorization (exactly
four) · prior tests weakened to accept a regression (the two tests that changed shape — F1's mount
assertion and the consolidated toggle test — both got *stronger*, not weaker: the original passing
assertion was `toHaveBeenCalled()` after interaction only; it now additionally asserts zero calls
before interaction and zero calls on toggle, which is new coverage, not removed coverage).

### 21.13 Observations (non-blocking, carried to B1b)

1. Comment-like (`<!-- -->`) and doctype-like (`<!DOCTYPE>`) sequences are outside current governed
   editor output; they classify `malformed` and are escaped safely (§21.3). No action needed unless a
   future content source can produce them.
2. §19.6's seven-label classification surface remains four in practice (§21.6) — recorded again as a
   documentation-only gap, not a functional one; amend §19.6's wording in a future patch if desired,
   or leave as-is since behavior satisfies the contract.
3. The Columns/Rows title-loss path (§19.4) remains carried to B1b, untouched and still live.
4. `editor.setEditable(editable, false)` suppresses the update event on **every** editable change,
   including one a future feature might want to observe (e.g., analytics on read-only toggles). Not a
   defect against this patch's contract, but worth a one-line note if B1b/B2 ever need to react to
   editable-state transitions specifically rather than content changes.

### 21.14 Classification and status

**CLASSIFICATION 1 — PASS · READY FOR CLOSURE.**

Both defects recorded in §20 are independently confirmed resolved, using probes this review wrote
itself rather than trusting the shipped tests. The fixes are minimal, mechanism-targeted (TipTap's own
non-emitting API; a stricter tag-token check using the same allowlist philosophy already in the
codebase), fully contained within the four authorized files and their line budgets, and introduce no
new regression across 12 independently-verified negative controls spanning both the correction and the
original B1a surface. Full validation matches expected totals exactly.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b** | **ELIGIBLE FOR GOVERNANCE** — not authorized or implemented by this review |
| **PATCH-149B2** | **BLOCKED until B1b closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

No implementation file was modified by this review. Nothing was pushed.

---

## 22. PATCH-149B1b — DOCUMENT WRAPPER, TITLE-SAFE ROUTING, READ-ONLY, TOOLBAR · **AUTHORIZED, SPLIT (S2)**

**Authored:** 2026-08-04 (governance architect). **Base:** `564a40d`. Every line number below was
re-measured at this HEAD; no historical number was trusted. No production or test file was modified in
this turn.

### 22.1 Route census — measured at `564a40d`

`openPadletInTypeEditor` (`CanvasClient.tsx:5685-5709`) is the central router. Its card branches:

```
:5700  card && metadata.svgUrl  → selectCardModalRoute(canUseFreeformEditButton)==='editor'
                                   ? ClipartDraftModal : CardViewer        (clipart)
:5704  card                     → selectCardModalRoute(...)==='editor'
                                   ? CardEditor        : CardViewer        (DOCUMENT)
```

**Finding C1 — `:5704` *is* the exact Document predicate.** Clipart is fully consumed by `:5700`, so
every post reaching `:5704` satisfies `post.type === 'card' && !post.metadata?.svgUrl`. The predicate
is already structurally present, inlined and unnamed.

| # | Route | Owner / path | Types | Capability | Destination now | Title | Content | Metadata | Editable | Save cb | Close cb | B1b destination |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Freeform preview/open | `FreeformPadletCards` ← `openPadletInTypeEditor` (`:5864`) | all | `selectCardModalRoute(canUseFreeformEditButton)` | CardEditor / CardViewer | **passed** | passed | passed | both | `saveCard` | closes+clears | **Document wrapper** |
| 2 | Direct `?openPadlet=` | `:341-351` → `openPadletInTypeEditorRef` → `:5685` | all | same | CardEditor / CardViewer | **passed** | passed | passed | both | `saveCard` | closes+clears | **Document wrapper** |
| 3 | Freeform context menu | `openPadletTargetFromContextMenu` (`:5713-5721`) → `:5685` | all | same | CardEditor / CardViewer | **passed** | passed | passed | both | `saveCard` | closes+clears | **Document wrapper** |
| 4 | CanvasModals | `CanvasModals.tsx` owns NoteEditor/Link/Todo/… — **does not own CardEditor**; CardEditor renders in `CanvasClient:7365-7390` | — | — | — | — | — | — | — | — | — | **hosts Document wrapper** (§22.9) |
| 5 | **ColumnsLayout** | `:6479-6482` `onOpenPost` — **bypasses `:5685`** | any | `isEditable={canUseFreeformEditButton}` (`:6466`) | **NoteEditor** | **LOST** | passed | note-shaped | editable only | `saveNote` | — | **Document wrapper** |
| 6 | **RowCanvasDnD** | `:6568-6571` `onOpenPost` — **bypasses `:5685`** | any | `isEditable={canUseFreeformEditButton}` (`:6551`) | **NoteEditor** | **LOST** | passed | note-shaped | editable only | `saveNote` | — | **Document wrapper** |
| 7 | DrawingLayout | `:6727-6731` `onEditPadletAsPost` | **containers only** — `CanvasContextMenu.tsx:172` runs it only under `isContainerType && onEditPadletAsPost`, else `onEdit` | n/a | NoteEditor | n/a | n/a | n/a | n/a | n/a | n/a | **unchanged — not Document-reachable** |
| 8 | Drawing normal edit | `:6718-6726` `onPadletEdit` → `:5685` | all | via `:5685` | CardEditor / CardViewer | passed | passed | passed | both | `saveCard` | closes+clears | **Document wrapper** |
| 9 | Wall / Timeline / Map | `onOpenTarget` at `:6663`, `:6757`, `:6872` → `openPadletTargetFromContextMenu` → `:5685` | all | via `:5685` | CardEditor / CardViewer | passed | passed | passed | both | `saveCard` | closes+clears | **Document wrapper** |
| 10 | **Creation** (`case 'document'`) | `:5401-5418` — drafts `{id:'new', type:'card', title:'', content:'', metadata:{...createMetadata}}` then `setIsCardEditorOpen(true)` | new | creation permission upstream | CardEditor | `''` | `''` | createMetadata | editable | `saveCard` | closes+clears | **Document wrapper (editable)** |

**Earlier findings re-confirmed at HEAD:**

- Columns and Rows **are** Document-reachable — **CONFIRMED** (rows 5, 6).
- Both **are** capability-gated upstream by `canUseFreeformEditButton` — **CONFIRMED** (`:6466`, `:6551`).
- Both currently send Documents into note-shaped data — **CONFIRMED**; `SaveNoteData`
  (`usePadletSave.ts:34-48`) has **no `title` field**, and `saveNote` writes note metadata
  (`cardColor`, `topStrip`, `reactions`, `badgeColor`, `detachedComments`).
- Title can be lost — **CONFIRMED**, and it is the only live P3 data-loss path in this patch.
- DrawingLayout is not Document-reachable — **CONFIRMED unchanged** (row 7).

**Finding C2 — exactly two bypasses exist.** Every other route funnels through `:5685`. The routing
work is therefore two call sites plus the central branch plus creation — bounded, as §19.5 predicted.

**Finding C3 — `CardViewer` is shared.** The read-only `CardEditor` instance (`:7365-7376`) serves
**both** clipart-read-only (`:5702`) and Document-read-only (`:5706`). B1b must move only the Document
half; **clipart read-only stays on `CardEditor`**.

**Finding C4 — `CardEditor` is a `<textarea>` with a fully inert toolbar.** `CardEditor.tsx:147-153`
is a plain `<textarea>` (no TipTap, no formatting). Its toolbar buttons (`:137-142`) have **no
`onClick` handlers at all** — six permanently dead controls, including an `AlignLeft`. This is the
same inert-control defect class as Note's Align, and it is the strongest induced-failure proof that
Documents need a real editor.

### 22.2 Title contract — **preservable with no persistence change**

`SaveCardData` (`usePadletSave.ts:136-140`) is already `{ title: string; content: string; metadata: any }`,
and `saveCard` (`:973+`) writes `title` on both insert (`:1022`) and update (`:1060`, `:1077`).
**`usePadletSave` is therefore NOT in the allowlist** — the hard stop "title cannot be preserved
without broad persistence changes" is **NOT TRIGGERED**.

Required: title loads from `padlets.title`; editable in editable mode only; visible but non-editable in
read-only; **never embedded into TipTap HTML**; persisted through `saveCard`; **not dropped in Columns
or Rows** (they must stop using `saveNote` for Documents); empty title falls back to the visible
placeholder `"Untitled document"` for display while persisting `''` (no invented title string); no
clipart icon and no empty-placeholder regression (PATCH-138/151).

`metadata` passes through unchanged except `metadata.description`, which the current `CardEditor`
footer owns and `saveCard` persists — the wrapper **must** keep a description input so the field is not
silently dropped from the Document save payload.

### 22.3 Document wrapper contract (M2)

One new component, `components/collabboard/editors/DocumentEditor.tsx`.

**Props:**

```ts
interface DocumentEditorProps {
  isOpen: boolean;
  title: string;
  initialContent: string;         // raw stored content — wrapper adapts it
  metadata: Record<string, any> | null;
  readOnly?: boolean;             // default false
  onSave: (data: { title: string; content: string; metadata: any }) => void;
  onClose: () => void;
}
```

The payload is **exactly `SaveCardData`** — no new save type, no adapter shim.

**Owns:** modal shell (`role="dialog"`, `aria-modal="true"`, `aria-label`), title display/input,
description input, adaptation of `initialContent` via `toEditorHtml`, the shared TipTap editor via
`useSharedTipTapEditor`, editable/read-only mode, Document toolbar selection, temporary
save-on-close compatibility, accessible Close (`aria-label="Close"`), metadata pass-through.

**Must not:** duplicate the TipTap extension registry (consumes `useSharedTipTapEditor` only); become a
NoteEditor copy (no reactions, no card colour, no top strip, no badge, no detached comments); own route
permissions (receives `readOnly`, never computes capability); own PDF behaviour; embed title into body
HTML; change persistence schema.

**Accessibility note:** `NoteEditor` has no `role="dialog"`, `aria-modal`, or Close `aria-label` at
HEAD. The Document wrapper must have all three — this is new correct behaviour, not a NoteEditor
regression, and NoteEditor is explicitly **not** changed by this patch.

### 22.4 Temporary save/close lifecycle — **explicit debt, B2 replaces it**

B1b **must not** implement B2. The temporary rule:

| Mode | Close (X) | Backdrop | Escape | Persistence |
|---|---|---|---|---|
| **Editable** | save-then-close via `onSave` + `onClose` | same as Close (matches `CardEditor:78` today) | characterized as a **no-op** (matches `CardEditor` and `NoteEditor` at HEAD) | exactly one `saveCard` call |
| **Read-only** | close only | close only | no-op | **none** |

Required: no new write path (reuse `saveCard`); **no duplicate save** — Close must not both call
`onSave` and trigger a backdrop save; title and adapted HTML saved together in one payload; read-only
close invokes no persistence; no dirty state, no discard confirmation, no autosave, no explicit Save
button.

**Recorded as temporary debt.** This is *not* the intended product behaviour. **PATCH-149B2 owns**
replacing editable save-on-close with an explicit Save plus discard protection. B1b leaves the seam:
all lifecycle decisions live in the wrapper's two handlers, not scattered across routes.

### 22.5 Read-only contract

`editable: false` through `useSharedTipTapEditor` — proven genuine in §21.2 (`isEditable`,
`view.editable`, `options.editable` all `false`). Required: formatted content visible; title visible;
**no title input**; **no description input**; **no toolbar**; no Save action; accessible Close; no
persistence callback; closes immediately; no dirty state; no mutation through ordinary DOM interaction;
registered custom TipTap nodes/marks render; adapted legacy content displays correctly.

**Programmatic bypass acknowledged:** §21.2 measured that `chain().insertContent()` still mutates a
non-editable editor. The wrapper therefore **must not expose any editor command surface in read-only
mode** — no toolbar, no keyboard-shortcut handlers, no exported editor instance. Non-editability is
enforced by absence of a command surface plus the real `editable:false` flag, and that combination is
what the tests must assert.

`CardEditor` is **not** the long-term Document viewer — it is a textarea (§22.1 C4).

### 22.6 Toolbar — **TB-A selected** (variant prop, Document filters on handler presence)

Measured cause of inert controls: `NoteEditorToolbar.tsx:193` maps **every** entry in `textModeTools`
unconditionally, and `:109` includes Align whose `onClick` is `onAlign`. `NoteEditor.tsx:677-689`
supplies ten handlers and **never supplies `onAlign`** — so Align renders permanently dead. Underline
**is** real (`:680 onUnderline={handleUnderline}`, backed by the `Underline` extension in
`SHARED_TIPTAP_EXTENSIONS`) and **must remain**; PATCH-149C is unresolved and must not be used to
justify removing it.

- **TB-B rejected:** deriving visibility from handler presence *globally* would delete Align from the
  **Note** toolbar, changing Note behaviour and breaking
  `NoteEditor.characterization.test.tsx:129`.
- **TB-C rejected:** a separate `DocumentToolbar` duplicates the control-rendering loop — a P6 second
  implementation of the same concern.
- **TB-A selected:** add `variant?: 'note' | 'document'` (default `'note'`).
  - `'note'` → **byte-identical current behaviour**, including Align.
  - `'document'` → text tools only, **filtered to entries whose `onClick` is defined**, and **no
    box-mode toggle** (Document has no card colour, reactions, or top strip in `SaveCardData`).
  Align is excluded structurally, because the wrapper never passes `onAlign` — not by name-based
  removal. This prevents the *next* inert control too.

Every visible Document toolbar control must be proven to execute a real TipTap command, change editor
state, and survive `getHTML()` serialization.

### 22.7 Routing — **RTE-C**, one pure destination helper

New `lib/domain/canvas/documentModalRoute.ts`:

```ts
export type DocumentModalDestination = 'document-editor' | 'document-viewer';

export function selectDocumentModalDestination(
  post: Pick<Padlet, 'type' | 'metadata'>,
  canEditWorkspace: boolean,
): DocumentModalDestination | null;
```

Returns `null` for every non-Document post so callers **fall through to today's behaviour untouched**;
otherwise composes the existing capability decision. It **reuses `selectCardModalRoute`** internally
(`'editor' → 'document-editor'`, `'viewer' → 'document-viewer'`) — semantically exact, so no second
role model is created and PATCH-139/151 remain authoritative. It **uses `isDocumentPost`** rather than
re-inlining the predicate, closing the §20.2 duality.

Required behaviour: editable capability → editable wrapper · read-only capability → read-only wrapper ·
clipart → existing clipart route (`:5700`, untouched) · non-Document card → n/a (none exist, C1) ·
Note/Todo/Link/Image/table/container/comment/drawing/ai-component → **unchanged destinations**.
Generic posts must never be routed through the Document helper — the `null` return is what guarantees
that, and a test must prove it.

**Capability source:** `canUseFreeformEditButton` (`CanvasClient:254`, from
`canEditWorkspace(currentWorkspaceRole)`). No new permission model. Permission is never inferred from
callback presence. Client gating remains UI-only and is not the persistence authorization boundary.

### 22.8 Creation lifecycle — **preserved exactly**

Measured at HEAD: `saveCard` (`usePadletSave.ts:990-999`) returns **without inserting** when
`id === 'new'` and title, tag-stripped content, and `metadata.description` are all empty and no
meaningful metadata exists. A blank draft therefore never orphans a row.

Required: new Document opens the **editable** wrapper; title/content start empty from the existing
`case 'document'` draft; the first temporary save-on-close creates the row through `saveCard`
unchanged; read-only creation does not exist; **no row is inserted merely by opening the modal**; no
destructive delete flow is added. B2 later redefines explicit first Save and discard.

### 22.9 Where the wrapper renders — **CanvasModals**, not CanvasClient

`CanvasClient.tsx` is **8,346 lines**, far over the 800-line ceiling; house rule 3 forbids growing a
file already over it. `CanvasModals.tsx` (474 lines, under ceiling) already owns `NoteEditor` and the
other type editors. **The Document wrapper renders in `CanvasModals`**; `CanvasClient` gains only modal
state, the route branches, and prop pass-through. This also keeps modal ownership in one place (P6).

### 22.10 Adapter integration

The wrapper initializes content **only** through `toEditorHtml(initialContent)` and normalizes on save
through `fromEditorHtml(editor.getHTML())`. Required: measured plain-text Documents open visibly;
malformed angle-bracket Documents open without loss (§21.3); future valid HTML opens formatted; **no
bulk migration**; read-only viewing never rewrites content; editable save may lazily normalize; title
and metadata stay separate. **No layout may bypass the adapter** — because every layout reaches the
same wrapper, this is structurally guaranteed, and a test must prove Columns/Rows use it too.

### 22.11 CardEditor ownership after B1b

- The exact Document predicate must no longer open `CardEditor` — routes `:5704`/`:5705` and creation
  `:5417` move to the wrapper.
- `CardEditor` is **not deleted**: it still serves **clipart read-only** (`:5702` → `CardViewer`,
  finding C3).
- Ordinary non-Document card behaviour: none exists (C1) — nothing to preserve, and this must be
  stated rather than silently assumed.
- Clipart editable (`ClipartCardDraftModal`) unchanged.

A test must prove no Document route reaches `CardEditor` and no Document route reaches note-shaped
`NoteEditor`.

### 22.12 Split — **S2**, two independently testable units

Combined scope measures ≈5 production files / ≈320 production lines / ≈4 test files / ≈520 test lines —
over the brief's own 6-file/300-line/400-test-line guidance. The wrapper and the routing are
independently testable (the wrapper is a pure component; the destination helper is a pure function), so
the split is clean rather than compressed. **Nothing is compressed to fit a number.**

#### PATCH-149B1b-i — wrapper, read-only, toolbar · **AUTHORIZED**

| # | Path | Change | Max lines |
|---|---|---|---|
| 1 | `components/collabboard/editors/DocumentEditor.tsx` | **new** — §22.3 wrapper, editable + read-only | **200** |
| 2 | `components/collabboard/editors/NoteEditorToolbar.tsx` | TB-A `variant` prop; `'note'` byte-identical | **25** |

**Production ≤ 225 / 2 files.** Tests: `DocumentEditor.test.tsx` (≤170, **jsdom**),
`DocumentEditor.readonly.test.tsx` (≤120, **jsdom**). **Tests ≤ 290 / 2 files.**

Delivered unwired, exactly as B1a delivered the hook — reachability arrives in B1b-ii.

#### PATCH-149B1b-ii — routing and wiring · **BLOCKED until B1b-i closes**

| # | Path | Change | Max lines |
|---|---|---|---|
| 1 | `lib/domain/canvas/documentModalRoute.ts` | **new** — §22.7 pure helper | **35** |
| 2 | `components/collabboard/canvas/ui/CanvasModals.tsx` | render the wrapper (§22.9) | **40** |
| 3 | `app/dashboard/canvas/[id]/CanvasClient.tsx` | modal state; `:5704-5706`; creation `:5417`; Columns `:6479`; Rows `:6568` | **45** |

**Production ≤ 120 / 3 files.** Tests: `documentModalRoute.test.ts` (≤110, node),
`documentRoutes.source.test.ts` (≤120, node, scoped source slices). **Tests ≤ 230 / 2 files.**

`hooks/canvas/usePadletSave.ts` is **explicitly excluded** — `SaveCardData` already carries title
(§22.2). No schema change. No package change.

### 22.13 Induced failures — each demonstrable at `564a40d`

1. **Freeform Document opens `CardEditor`** — `CanvasClient:5705`; `CardEditor.tsx:147` is a
   `<textarea>`.
2. **Columns/Rows route Documents to note-shaped data** — `:6479-6482`, `:6568-6571` call
   `setIsNoteEditorOpen(true)` directly, bypassing `:5685`.
3. **Title absent from `SaveNoteData`** — `usePadletSave.ts:34-48` has no `title` key.
4. **No Document wrapper exists** — no `DocumentEditor.tsx` in the tree.
5. **Read-only Document uses textarea semantics** — `:5706` → `CardViewer` → `CardEditor` `<textarea readOnly>`.
6. **Align present in the only rich-text toolbar** — `NoteEditorToolbar.tsx:109` renders it although
   `NoteEditor` never passes `onAlign`; `CardEditor.tsx:142` renders a second, fully handler-less one.
7. **No shared all-layout Document destination** — no `documentModalRoute.ts`; the predicate is inlined
   and unnamed at `:5704`.

Each production correction must map to one of these.

### 22.14 Negative controls — all 14 must be detected

1. route Document back to `CardEditor` · 2. route Columns Document to `NoteEditor` · 3. drop `title`
from the save payload · 4. classify clipart as Document · 5. expose toolbar in read-only · 6. force
read-only `editable=true` · 7. restore Align in Document mode · 8. bypass adapter for plain text ·
9. bypass adapter for malformed text · 10. invoke save on read-only close · 11. duplicate save on
editable close · 12. route Note/Todo/Link/Image through the Document wrapper · 13. leave direct-link or
one layout route on the old destination · 14. introduce a PDF-specific branch.

Each perturbation must be reverted and **hash-verified** byte-identical.

### 22.15 Required test coverage

**B1b-i** — wrapper items 1-14 and read-only items 15-24 of the brief, under the closed jsdom harness
with real TipTap. Toolbar control tests must assert a real command ran (editor state changed **and**
`getHTML()` reflects it), not merely that a button exists. Read-only non-editability must assert the
genuine flags (`isEditable`/`view.editable`) **and** the absence of any command surface, not only
`contenteditable`.

**B1b-ii** — routing items 25-38. `documentModalRoute.test.ts` covers 25-30 directly as a pure
function. `documentRoutes.source.test.ts` covers 31-38 with **scoped source slices** around each named
route branch — slice the `openPadletInTypeEditor` body, the Columns `onOpenPost` body, the Rows
`onOpenPost` body and the creation `case 'document'` block, and assert each references the shared
Document destination. **Whole-file substring counts are forbidden.** The suite must fail if any one
layout bypasses the shared route.

**Regressions (both units):** NoteEditor characterization 11/11 green and unmodified · Note toolbar
still includes Align · `CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute` ·
`documentPost` · `documentContentAdapter` · `useSharedTipTapEditor` · creation flow unchanged · no PDF
production code.

### 22.16 False-green protections

Reject either unit if: a Document route still reaches `CardEditor` or note-shaped `NoteEditor` · title
is absent from any Document save payload · read-only performs any write · read-only exposes a toolbar
or command surface · `editable=false` is asserted only via `contenteditable` · a toolbar test asserts
only that a button renders · a second TipTap registry appears · Align returns to Document mode · the
adapter is bypassed on any path · `NoteEditor` behaviour changes · Note's Align disappears · source
tests use whole-file substring counts · PDF code appears · scope exceeds the allowlist · B2 behaviour
(explicit Save, dirty state, discard confirmation) appears.

### 22.17 PDF extension seam — confirmed clean

`SHARED_TIPTAP_EXTENSIONS` remains the single registration point; a registered node renders in both
editable and read-only modes because both use the same hook; the serializer preserves allowed `data-*`
attributes (§21.7 boundary: sanitizer-allowed `data-*` only); the wrapper contains no PDF branch; title
and modal routing are independent of any future PDF node. **No visible PDF placeholder, source panel,
or backlinks area.**

### 22.18 Validation matrix

Both units: wrapper jsdom tests · read-only tests · toolbar command tests · adapter regressions ·
routing helper tests · scoped CanvasClient route checks · NoteEditor characterization · `CardEditor` ·
`CardPreview` · `ClipartCardDraftModal` · `cardModalRoute` · **full Vitest** · clean one-run
`npm run typecheck` · **410** declarations · `npx next build` · bridge exclusion **891** · clean E2E
build (marker `1`) · ordinary `.next` restored and exclusion re-verified · marker absent ·
`git diff --check` · only the five protected worktree paths.

**Baseline entering B1b: 70/70 files · 816/816 tests · 410 declarations · 891 exclusion files.**

### 22.19 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Title cannot be preserved without broad persistence changes | **NOT TRIGGERED** — `SaveCardData` already carries `title`; `usePadletSave` untouched (§22.2) |
| Document routes cannot be separated from generic routes | **NOT TRIGGERED** — helper returns `null` for non-Documents; only 2 bypasses exist (C2) |
| Wrapper requires duplicating the TipTap registry | **NOT TRIGGERED** — consumes `useSharedTipTapEditor` |
| Read-only cannot be proven non-editable | **NOT TRIGGERED** — §21.2 proved the flag real; command-surface absence covers the programmatic gap |
| Temporary save-on-close creates a new data-loss path | **NOT TRIGGERED** — it *removes* one (title loss); it reuses `saveCard` and adds no new write |
| New-Document creation would orphan rows | **NOT TRIGGERED** — `saveCard:990-999` early-returns on blank drafts |
| One layout cannot be brought under the shared destination | **NOT TRIGGERED** — Columns/Rows are two ordinary callbacks |
| Production scope cannot be bounded | **RESOLVED by S2** — 2 files/≤225 then 3 files/≤120 |
| B2 becomes inseparable from B1b | **NOT TRIGGERED** — lifecycle is confined to the wrapper's two handlers (§22.4) |

### 22.20 Status

**PATCH-149B1b-i: OPEN · AUTHORIZED** — 2 production files, ≤225 production lines, ≤290 test lines.
**PATCH-149B1b-ii: OPEN · BLOCKED until B1b-i closes** — 3 production files, ≤120 production lines,
≤230 test lines.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`, reviews §20/§21) |
| **PATCH-149B1b-i** | **OPEN · AUTHORIZED — next implementation unit** |
| **PATCH-149B1b-ii** | **BLOCKED until B1b-i closes** |
| **PATCH-149B2** | **BLOCKED until B1b-ii closes** — explicit Save, dirty state, discard, Close/Escape |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Carried debt, explicitly:** the temporary save-on-close lifecycle (§22.4) is not the product
behaviour and must not survive B2. **Carried defect:** `CardEditor`'s six handler-less toolbar buttons
(C4) remain on the clipart-read-only surface after B1b; they are outside this patch's authorization and
are recorded here so they are not mistaken for Document scope.

No production or test file was modified in this turn. Nothing was pushed.

---

## 23. PATCH-149B1b-i — INDEPENDENT CLOSURE REVIEW · **CLASSIFICATION 4 · CORRECTION REQUIRED**

**Reviewed:** 2026-08-04 (independent closure reviewer). **Commit under review:** `80011ee`
`feat(document): add TipTap document editor and viewer`, parent `f31b2bc`. All evidence re-executed
independently with probes this review authored. **No implementation file was modified** — every
perturbation reverted and hash-verified against `HEAD`.

### 23.1 Source scope — **EXACT, within budget**

| File | Lines | Budget | |
|---|---|---|---|
| `DocumentEditor.tsx` (new) | 141 | 200 | ✅ |
| `NoteEditorToolbar.tsx` | 13 (11+/2−) | 25 | ✅ |
| **Production** | **154** | **225** | ✅ |
| `DocumentEditor.test.tsx` (new) | 166 | — | ✅ |
| `DocumentEditor.readonly.test.tsx` (new) | 102 | — | ✅ |
| **Tests** | **268** | **290** | ✅ |

Verified unchanged in `80011ee`: `CanvasClient.tsx`, `CanvasModals.tsx`, `documentPost.ts`,
`documentContentAdapter.ts`, `useSharedTipTapEditor.ts`, `NoteEditor.tsx`,
`NoteEditor.characterization.test.tsx`, `CardEditor.tsx`, `CardPreview.tsx`,
`ClipartCardDraftModal.tsx`, `usePadletSave.ts`, `package.json`, `package-lock.json`. No `.fable5`
file, no routing file, no schema, no presentation code, no Excalidraw fork.
`lib/domain/canvas/documentModalRoute.ts` **correctly does not exist** (B1b-ii scope). No PDF code.

### 23.2 Wrapper architecture — **CORRECT**

Consumes `useSharedTipTapEditor` and `documentContentAdapter`; imports `SaveCardData` **as a type only**
(`import type`), so no runtime coupling to the persistence hook. A grep for `useEditor`, `_EXTENSIONS`,
`DOMPurify`/`sanitize`, `supabase`/`.from(`, capability booleans and `pdf` returns **nothing** — no
direct `useEditor`, no duplicated registry, no duplicated sanitizer, no persistence query, no
route-permission logic, no PDF branch. It is an unwired wrapper, exactly as authorized.

### 23.3 Props and save payload

Props are exactly `{ isOpen, title, initialContent, metadata, readOnly?, onSave, onClose }`. `onSave`
is typed `(data: SaveCardData) => void` — **no new persistence model was introduced**. Measured
payload: `{ title, content: fromEditorHtml(getHTML()), metadata: { ...metadata, description } }` —
title carried separately, content normalized through the adapter, unrelated metadata keys
(`parentId`, `zIndex`) preserved, and the title provably absent from body HTML.

**`metadata.description` — classification A (correct).** The wrapper keeps a description input and
folds it back as `{ ...metadata, description }`, which is byte-for-byte the incumbent
`CardEditor.tsx:63-70` semantics, so `saveCard` behaves identically. `saveCard:990-999` filters
`description === ''` out of its blank-draft "meaningful metadata" test, so the creation lifecycle is
preserved. **Non-blocking nuance:** when a row has no `description` key at all, saving adds
`description: ''`. This is additive, benign, and inherited from `CardEditor` rather than introduced
here — recorded so B2 does not mistake it for new behaviour.

**Fallback title is not persisted.** `'Untitled document'` is a `placeholder` on the input and the
read-only display fallback only; the saved value is the raw state, so an untouched empty title
persists as `''`. Correct.

### 23.4 Editable Document — verified

Title renders as an editable input; description input is separate from body; TipTap body is editable;
content passes through `toEditorHtml`; Document toolbar renders; **Align absent**; every visible control
has a real handler; title never enters editor HTML; metadata preserved; Close invokes `onSave` once
then `onClose` once; backdrop follows the same order; clicks inside the panel do **not** save
(`stopPropagation` on the inner container); mount does not save; Escape is a characterized no-op; there
is no explicit Save button and no dirty/discard UI. **B2 behaviour is absent, as required.**

### 23.5 Read-only Document — verified, structurally safe

Title renders as text with the `Untitled document` fallback; no title input; no description input;
formatted body renders; `contenteditable="false"`; **no toolbar renders at all** — the entire
`NoteEditorToolbar` subtree is behind `{!readOnly && …}`, so no command surface is exposed, satisfying
§22.5's requirement that read-only safety not rest on the `editable` flag alone (§21.2 measured that
programmatic commands bypass it). No Save button; accessible Close (`aria-label="Close"`); Close and
backdrop each invoke `onClose` exactly once and `onSave` **zero** times; no dirty/discard UI; the
registered `Comment` mark's `data-comment-id` renders; malformed legacy content stays visible.

### 23.6 Modal shell

Overlay + panel + header + accessible Close, `role="dialog"`, `aria-modal="true"`, and a mode-specific
`aria-label` — all three of which `NoteEditor` lacks at HEAD, so this is new correct behaviour, not a
NoteEditor regression. **Measured size: `width: 640px; maxHeight: 80vh`** with an internal
`overflow-y-auto` body — appropriate for long-form documents and a reasonable envelope for future
PDF-linked content; the 280px sticky-note card was **not** copied. No pink clipart block, no icon
placeholder, no reserved icon column.

**Non-blocking observation:** backdrop dismissal is implemented as `onClick` on the overlay plus
`stopPropagation` on the inner container, rather than `NoteEditor`'s `e.target === e.currentTarget`
check. Behaviourally equivalent today and proven by test; if B1b-ii/B2 ever render a popup as a sibling
of the panel inside the overlay, the `target`-equality form would be the safer idiom.

### 23.7 Toolbar variant — **TB-A implemented correctly**

`variant` defaults to `'note'`. The filter is applied **only** when `isDocument`
(`NoteEditorToolbar.tsx:166`), so Note mode still renders `currentTools` unchanged — no global
handler-presence filter leaked. The box-mode toggle is hidden only for Document. No duplicate
`DocumentToolbar` was created.

**Visible Document controls, independently enumerated and each proven to serialize:**

| Control | Command | Serialized result |
|---|---|---|
| Bold | `toggleBold` | `<p><strong>hello world</strong></p>` |
| Italic | `toggleItalic` | `<p><em>hello world</em></p>` |
| Strikethrough | `toggleStrike` | `<p><s>hello world</s></p>` |
| **Underline** | `toggleUnderline` | `<p><u>hello world</u></p>` |
| Bullet list | `toggleBulletList` | `<ul><li><p>…</p></li></ul>` |
| Numbered list | `toggleOrderedList` | `<ol><li><p>…</p></li></ol>` |
| Code block | `toggleCodeBlock` | `<pre><code>…</code></pre>` |

Plus the accessible `Close` button. **Align, Text style, Link, Comment and the box-mode toggle are all
absent** — Align structurally, because `DocumentEditor` never passes `onAlign`, not by name-matching.
**Underline is retained on evidence** (a real `toggleUnderline` producing `<u>`); the unresolved
PATCH-149C report was correctly not treated as authority to remove it. **Zero inert controls.**

### 23.8 NoteEditor and adapter regressions — clean

NoteEditor characterization **11/11 green, file unmodified**: Align still visible, Close saves then
closes, backdrop saves then closes, Escape no-op, payload keys unchanged, no title/`readOnly` prop,
modal shell unchanged, teardown stable. Adapter used consistently for plain text, malformed
angle-bracket content, valid HTML and empty content; malformed fixtures lose no visible characters;
valid HTML stays formatted; no phantom `onUpdate` on mount (B1a's F1 fix holds through the wrapper).

### 23.9 Induced failures — 5/5 reproduced at `f31b2bc`

`DocumentEditor.tsx` absent · no `variant`/`isDocument`/`visibleTools` concept in the toolbar · Align
rendered unconditionally via `currentTools.map` (`:193`) so it could not be excluded for Documents
without affecting Notes · no read-only TipTap Document wrapper · no component consumed `SaveCardData`.

### 23.10 Negative controls — 12/12 detected, 12/12 reverted and hash-verified

Align-in-Document (1 fail) · Align-hidden-globally (Note characterization 1 fail) · toolbar-in-read-only
(1) · read-only-forced-editable (1) · title-removed-from-payload (1) · title-embedded-in-body (1) ·
metadata-dropped (1) · save-on-read-only-close (1) · duplicate-backdrop-save (**2**) ·
adapter-bypassed (1) · PDF-branch (1) · duplicate-registry (1). Post-revert hashes match `HEAD` for all
four files.

### 23.11 Validation — all green

Full Vitest **72/72 files · 833/833 tests** · `npm run typecheck` exit 0 · **410** declarations ·
`npx next build` exit 0 · bridge exclusion **891** · `build:e2e` exit 0 with marker **`1`** · ordinary
`.next` restored, exclusion re-verified **891**, marker **absent** · `git diff --check` exit 0 ·
worktree shows only the five protected paths.

### 23.12 **F3 — the user's typed title is silently discarded on a parent re-render. DEFECT.**

`DocumentEditor.tsx:37-43` synchronises state from props:

```ts
useEffect(() => {
  if (isOpen) { setTitle(initialTitle); setDescription(...); setMetadata(...); }
}, [isOpen, initialTitle, initialMetadata]);   // <-- initialMetadata in deps
```

`initialMetadata` is an **object**, so the effect refires whenever the caller passes a new reference —
and `CanvasClient` renders the incumbent `CardEditor` as
`initialMetadata={padletToEdit?.metadata || {}}` (`:7374`, `:7388`), which yields a **fresh `{}` on
every render** whenever the row's metadata is null/undefined. That is precisely the caller pattern
B1b-ii is scheduled to reuse. `NoteEditor.tsx:144-152` documents and guards this exact hazard class
("prevents infinite loops if a caller passes an unstable array reference (e.g. `|| []` on every
render)"); the precedent was available and not applied.

**Measured, reproducing the real caller pattern:**

| Stored `metadata` | Caller expression | After typing | After ONE unrelated parent re-render | **Persisted title** |
|---|---|---|---|---|
| `undefined` / `null` | `padletToEdit?.metadata \|\| {}` → fresh `{}` | `User Renamed This` | **`Stored Title`** | **`Stored Title`** ❌ |
| `{ parentId: 'p1' }` | stable reference | `User Renamed This` | `User Renamed This` | `User Renamed This` ✅ |

The user renames a Document, any unrelated re-render occurs (realtime update, a sibling post moving,
canvas state change), the input silently reverts, and **the stale title is what gets written**. The
description is reset by the same effect. The body survives (the hook's content effect keys on the
adapted *string*, whose value is stable), so the blast radius is title + description.

**Why this blocks.** B1b exists to end title loss — §19.4 carried the Columns/Rows title-loss path as a
first-class **P3** item, and §22.2 requires the title to persist through the wrapper. Delivering a
wrapper that discards the user's title under a caller pattern already present in the repository is a
defect in the governed contract, not a future concern. It is latent only because the wrapper is
unwired; B1b-ii makes it live. The shipped tests cannot catch it — every test mounts once and never
re-renders the parent.

**Correction is narrow** and stays inside the one authorized file: make the sync effect not clobber
live user edits — e.g. key it on a stable identity rather than the metadata object, drop
`initialMetadata` from the dependency list and read metadata at save time, or bail out when the
incoming values are unchanged (`NoteEditor`'s documented pattern). Any of these is a few lines.

### 23.13 False-green review

Not triggered: direct `useEditor` · duplicated registry · title embedded in body · read-only exposing
controls · read-only writing · Align in Document · Align missing from Note · save on mount · double
save · B2 behaviour · routing or persistence changed · PDF code · tests asserting only markup presence
(they invoke real commands and assert serialized output, and this review re-proved each control
independently). **Triggered: "metadata/title loss"** — via F3 (§23.12), for the title and description.

### 23.14 Observations (non-blocking)

1. Backdrop uses `stopPropagation` rather than `target === currentTarget` (§23.6).
2. Saving adds `description: ''` to rows that had no description key — inherited from `CardEditor`,
   benign (§23.3).
3. ProseMirror emits `TypeError: target.getClientRects is not a function` to stderr under jsdom when
   list/code-block commands scroll the selection into view. Harmless jsdom limitation; no test fails.
   Recorded so it is not re-diagnosed later.
4. `metadata` is held in component state but only ever written from props; once F3 is fixed it could
   simply be read from props at save time, removing a state slice.

### 23.15 Required correction

| # | File | Correction |
|---|---|---|
| **F3** | `DocumentEditor.tsx` | Stop the prop-sync effect from overwriting live user input when the caller passes an unstable `metadata` reference (§23.12) |
| **F3t** | `DocumentEditor.test.tsx` | Add a regression test that types a title, re-renders the parent with `metadata={x \|\| {}}`, and asserts the typed title both survives and is the value persisted |

**Explicitly out of correction scope** — reviewed and correct as shipped: wrapper architecture, props
and payload contract, read-only mode, modal shell, toolbar variant and control set, adapter
integration, and the temporary save-on-close lifecycle. These must not be re-opened.

### 23.16 Classification and status

**CLASSIFICATION 4 — OPEN · IMPLEMENTATION CORRECTION REQUIRED.**

The architecture is right and nearly all of the work is correct and well-evidenced — clean shared-core
reuse, genuinely structural read-only safety, a Document toolbar with seven proven-live controls and
zero inert ones, and no regression anywhere in the existing suites. One proven defect remains, and it
is in the exact property this patch exists to protect: the user's title. It is contained, it has an
obvious minimal fix inside the single authorized file, and fixing it now is far cheaper than
discovering it after B1b-ii wires the wrapper into live routes.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **OPEN · CORRECTION REQUIRED** (§23.15) — `80011ee` stands; correction lands on top |
| **PATCH-149B1b-ii** | **BLOCKED — not released.** B1b-i did not close |
| **PATCH-149B2** | **BLOCKED until B1b-ii closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

No implementation file was modified by this review. Nothing was pushed.

---

## 24. PATCH-149B1b-i — SECOND INDEPENDENT CLOSURE REVIEW (POST-CORRECTION) · **CLASSIFICATION 2 · CLOSED**

**Reviewed:** 2026-08-04 (independent closure reviewer). **HEAD:** `4c37205`. **Commits under review:**
`80011ee` `feat(document): add TipTap document editor and viewer` + `4c37205`
`fix(document): preserve draft fields across parent rerenders`. Every result below was re-executed with
probes this review authored (`__review_f3_probe.test.tsx`, `__review_stale_save.test.tsx`, 11 assertions
across 8 groups) — the implementer's own tests were used only as corroboration, never as evidence. All
probes and perturbations removed; every touched file hash-verified back to `HEAD`.

### 24.1 Correction scope — **EXACT (2 files)**; combined test budget **amended upward**

`4c37205` changes exactly `DocumentEditor.tsx` (+8/−4) and `DocumentEditor.test.tsx` (+110/−0).
`DocumentEditor.readonly.test.tsx` and `NoteEditorToolbar.tsx` are **byte-unchanged since `80011ee`**
(`git diff 80011ee 4c37205` on those paths is empty), as §23.15 required.

Combined B1b-i (`f31b2bc..4c37205`, governance file excluded):

| File | Lines | Budget | |
|---|---|---|---|
| `DocumentEditor.tsx` | 145 | 200 | ✅ |
| `NoteEditorToolbar.tsx` | 13 (11+/2−) | 25 | ✅ |
| **Production** | **158** | **225** | ✅ |
| `DocumentEditor.test.tsx` | 276 | — | |
| `DocumentEditor.readonly.test.tsx` | 102 | — | |
| **Tests** | **378** | **290 (§22.12)** | ⚠ **+88 — amended** |

**Observation O1 — the test budget is exceeded, and the overrun is governance-caused, not drift.**
§23.15 mandated F3t and set no revised cap; the correction brief then required six distinct scenarios,
which cannot fit in the 14 lines §22.12 left. The overrun is **entirely regression tests for the defect
governance itself ordered**, contains no production line, and every added test is load-bearing (§24.11).
**Recorded as an amendment to §22.12: B1b-i tests ≤ 380 / 2 files.** No source-scope rule was breached.

Nothing else changed anywhere: `CanvasClient.tsx`, `CanvasModals.tsx`, `NoteEditor.tsx`,
`NoteEditor.characterization.test.tsx`, `useSharedTipTapEditor.ts`, `documentContentAdapter.ts`,
`documentPost.ts`, `CardEditor.tsx`, `CardPreview.tsx`, `ClipartCardDraftModal.tsx`,
`usePadletSave.ts`, `package.json`, `package-lock.json`, schema/persistence, presentation code and the
Excalidraw fork are all outside the four-file combined diff.
`lib/domain/canvas/documentModalRoute.ts` **correctly still does not exist** (B1b-ii scope). A token scan
of `DocumentEditor.tsx` for `pdf`, `supabase`, `.from(`, `useEditor(`, `DOMPurify`, `_EXTENSIONS =`,
`dirty`, `discard`, `unsaved`, `autosave` returns **one** hit: the §22.4 comment naming B2 as the owner
of that lifecycle. **No routing, no persistence, no PDF, no B2 work.**

### 24.2 F3 — **RESOLVED**, proven in both directions

Corrected effect (`DocumentEditor.tsx:39-44`):

```ts
useEffect(() => {
  if (isOpen) { setTitle(initialTitle); setDescription(initialMetadata?.description || ''); }
}, [isOpen, initialTitle, initialMetadata?.description]);   // primitives only
```

The `metadata` state slice was **deleted** (closing §23.14 observation 4), and the payload now reads
`{ ...(initialMetadata || {}), description }` from the live prop.

| | `80011ee` | `4c37205` |
|---|---|---|
| Draft title after unrelated fresh-`{}` rerender | **`Stored Title`** ❌ | `User Renamed This` ✅ |
| Draft description after same | **`''`** ❌ | `User Description` ✅ |
| **`onSave` payload actually persisted** | **`{title:"Stored Title", description:""}`** ❌ | **`{title:"User Renamed This", description:"User Description"}`** ✅ |

The persistence half was measured directly by logging the payload (probe P9), not inferred from the
input value — at `80011ee` the user's typed title **and** description are both silently written away.
This is the P3 data-loss path §22.2 exists to close, and it is now closed.

Confirmed against the eight §23-required properties: (1) the object reference is gone from the
dependency list; (2) a value-equivalent fresh object does not reset (P2); (3) an unrelated key change
does not reset (P3); (4) a changed `initialTitle` while open **does** adopt (P6); (5) a changed
`initialMetadata.description` while open **does** adopt (P6); (6) closed→open resets an abandoned draft
(P4); (7) no permanent stale state — every genuine prop change still propagates; (8) **no** deep
equality, **no** stringified dependency, **no** dirty-state machinery, **no** new required prop.

### 24.3 Dependency strategy — **classification B** (acceptable, non-blocking identity caveat)

Primitive dependencies are sufficient without a Document ID prop. **Observation O2 — residual corner:**
the effect cannot distinguish a *same-open* switch between two Documents whose title **and** description
are both identical; body would swap (the hook keys on the adapted string) while the draft title would
not. **Not reachable at HEAD** — every route sets `padletToEdit` and *then* opens, the overlay is
`fixed inset-0` so no second card is clickable while open, and backdrop click saves-and-closes. Per the
review brief's own test ("an actual live route can switch documents while the modal remains continuously
open"), **no identity prop is required**. **B1b-ii must re-verify this** when it wires the real routes;
if any route ever re-targets the wrapper without an `isOpen` transition, an identity key becomes
mandatory.

### 24.4 Fresh empty-object rerender — **PASS**

Exact `CanvasClient:7374` caller pattern (`metadata={stored.metadata || {}}`, stored metadata
`undefined`), three consecutive unrelated rerenders: title and description both survive verbatim, and
Close persists the edited values, not the stale ones. Also asserted: **`onSave` fires zero times during
the rerenders** — no phantom save.

### 24.5 Equivalent metadata object — **PASS**

Newly allocated `{ description:'orig', parentId:'p1', zIndex:3 }` on rerender: both draft title and
draft description unchanged. (The shipped test asserts title only; this review additionally proved
description.)

### 24.6 Unrelated metadata update — **PASS**; latest-at-save is **classification A**

With `zIndex` 1→2 on rerender: draft title survives, draft description survives, body survives, and the
save payload carries `zIndex: 2` — the **latest** value — plus `parentId:'p1'` and the edited
description. **Incoming metadata is not mutated:** both prop objects were `Object.freeze`d and no throw
occurred, the frozen object is unchanged after save, and `payload.metadata` is a *new* object
(`not.toBe` the input). No user-edited field is overwritten.

**"Latest metadata at save time" — classification A (correct conflict-minimizing behaviour).** It
strictly dominates the opening snapshot: NC3 proves the snapshot alternative silently **drops** a newer
unrelated key written by another client during the editing session, which is exactly the P3 class this
patch exists to remove. Non-blocking nuance: the merge is last-writer-wins per key at save time; B2's
explicit-Save model should state that contract deliberately rather than inherit it.

### 24.7 Reopen contract — **PASS**, `isOpen` proven load-bearing

Reopening the **same** Document (title *and* description identical across close→reopen) discards the
abandoned draft and restores both supplied values — so the reset is driven by the `isOpen` transition
alone, not by an incidental title change. Reopening a **different** Document initialises the new title
and description. NC2 (removing `isOpen` from the dependency array) fails this pair, confirming the
dependency is genuinely load-bearing and the test genuinely isolates it.

### 24.8 Same-open prop change — **appropriate**

While open, a changed `initialTitle` and a changed `initialMetadata.description` are both adopted, even
over a local edit. For a caller switching the selected Document with the wrapper mounted this is the
**correct** behaviour — it is what prevents the stale-mix state described in O2 for every case where the
two Documents differ in either field. It is also, unavoidably, last-write-wins against an in-flight edit
when an external realtime update changes the stored title mid-edit; that trade-off is inherent to a
component with no dirty state and is **owned by B2**, not by B1b-i.

### 24.9 Body preservation — **PASS**

TipTap content is unaffected by a fresh `{}`, an equivalent object, or an unrelated key change. Proven
beyond the shipped test: a **user-applied Bold** (a real `toggleBold` on a real selection) survives an
unrelated-key rerender and is present as `<strong>` in the saved `content`. `useSharedTipTapEditor`'s
content effect keys on the adapted *string*, whose value is stable across these rerenders, so
`setContent` is never re-invoked. No phantom update and no save occurs during any rerender.

### 24.10 Save payload — **correct**

One `SaveCardData`-shaped payload per editable Close/backdrop: current user-edited `title`,
`fromEditorHtml(getHTML())` content, latest unrelated metadata keys, current user-edited
`description`. Title is provably **not** embedded in the body (NC12 detects it); description is not in
the body; the metadata input object is not mutated; stale initial values are not persisted.

### 24.11 Test review — six tests, six distinct mechanisms

Fresh-`{}` · equivalent-object · unrelated-key-plus-latest-metadata · same-document reopen ·
different-document reopen · body preservation. Each is independently load-bearing, proven by the
negative-control matrix hitting **different** subsets: NC1 (6 fails), NC2 (2), NC3 (2), NC4 (6), NC5
(5), NC6 (3), NC11 (2), NC12 (1). No case passes only by sharing a weak assertion. **Minor note:** the
equivalent-object test asserts title but not description, and its `Parent` takes an unused `n` prop
purely to force a rerender — cosmetic, and this review covered the description case independently.

### 24.12 Regressions — all clean

**Read-only** (file unmodified, 6/6 green): title as text with the `Untitled document` fallback, no
title input, no description input, **no toolbar at all**, `editable:false`/`contenteditable="false"`,
Close and backdrop invoke `onClose` once and `onSave` **zero** times, accessible Close, no dirty/discard
UI — and this review additionally proved read-only is unaffected by a fresh-`{}` rerender.
**Lifecycle:** editable Close saves-then-closes exactly once, backdrop identical, inner clicks never
save, Escape still a characterized no-op, no explicit Save button, no dirty state, no discard
confirmation, no autosave. **Toolbar:** Document still excludes Align (structurally — no `onAlign` is
passed), Note still includes it, all seven Document controls remain real, NoteEditor characterization
**11/11 green and unmodified**. **Adapter/shared core:** plain text, malformed angle-bracket content and
valid HTML all behave as in §23.8; single shared registry; no sanitizer or TipTap duplication.

### 24.13 Induced failure — reproduced at `80011ee`, absent at `4c37205`

The pre-correction production file was materialised with `git show 80011ee:<path> > <path>` (not
`git stash`, which can silently reapply the fix). At `80011ee`: **3/3** of this review's rerender probes
fail and **3/3** of the shipped regression tests fail — 6 failures total, all with the stale
`Stored Title` — plus the payload probe proving stale persistence. At `4c37205`: **11/11** probes pass
and the payload is the user's edit. File restored, hash `8d20a8c…` = `HEAD`.

### 24.14 Negative controls — **12/12 detected, 12/12 reverted hash-identical**

| # | Perturbation | Detected |
|---|---|---|
| 1 | restore full `initialMetadata` object dependency | 6 fails |
| 2 | remove `isOpen` from the dependency array | 2 fails (both reopen tests) |
| 3 | snapshot metadata at opening only | 2 fails (latest-key) |
| 4 | reset fields on every render | 6 fails |
| 5 | remove title from save payload | 5 fails |
| 6 | remove description from save payload | 3 fails |
| 7 | expose toolbar in read-only | 1 fail |
| 8 | show Align in Document mode | 1 fail |
| 9 | hide Align in Note mode (global filter) | 1 fail (Note characterization) |
| 10 | call save from read-only close | 1 fail |
| 11 | duplicate save on backdrop (drop `stopPropagation`) | 2 fails |
| 12 | embed title into body | 1 fail |

Post-revert: `DocumentEditor.tsx` `8d20a8c44c4840d25a44c0dd04771d67d1aa655b`, `NoteEditorToolbar.tsx`
`a3bf76c2fd7f6ef4c9f456f82daff53892d56fd9` — both **MATCH** baseline.

### 24.15 Validation — all green

Focused suites **80/80** (DocumentEditor 17, read-only 6, NoteEditor characterization 11, shared hook
10, adapter 20, `documentPost` 10, `cardModalRoute` 6) · full Vitest **72/72 files · 839/839 tests**
(833 + 6 new) · `npm run typecheck` exit 0 · **410** declarations · `npx next build` exit 0 · bridge
exclusion **891** · `build:e2e` exit 0 with marker **`1`** and exclusion correctly *failing* on that
build (proving the check is live) · ordinary `.next` restored, exclusion re-verified **891**, marker
**absent** · `git diff --check` exit 0 · worktree shows only the five protected paths.

**Observation O3 — environmental, recorded so it is not re-diagnosed.** The first `npx next build`
crashed with `uncaughtException [TypeError: Cannot read properties of undefined (reading 'length')]`
against the `.next` directory left over from the previous session's E2E-build cycle. `rm -rf .next`
followed by a rebuild succeeded with exit 0. **Not caused by the correction** — the same stale artifact
predates it. Rule: after any `build:e2e` / ordinary-build swap cycle, clear `.next` before trusting a
build result.

### 24.16 False-green review

None of the twelve rejection triggers fired: equivalent metadata objects no longer reset drafts · reopen
still resets abandoned drafts · latest metadata keys are carried, not dropped · the metadata input is
not mutated · stale title/description are not persisted · body does not reset on parent rerender · no
save fires during rerender · read-only behaviour is unchanged · no B2 behaviour appeared · no routing or
persistence change · the correction is exactly two files · no test was weakened (the reopen test was
*strengthened* to isolate `isOpen`, and NC2 proves it).

### 24.17 Observations (non-blocking)

1. **O1** — combined test lines 378 vs §22.12's 290; governance-caused, budget amended (§24.1).
2. **O2** — same-open switch between two Documents with identical title *and* description is
   indistinguishable to the primitive dependency set; unreachable at HEAD, **re-verify in B1b-ii**
   (§24.3).
3. **O3** — stale `.next` from an E2E-build cycle breaks the next ordinary build (§24.15).
4. Latest-metadata-at-save is last-writer-wins per key; B2 should state the contract explicitly
   (§24.6).
5. Equivalent-object test asserts title only and carries an unused `n` prop — cosmetic (§24.11).
6. Carried from §23 and still true: backdrop uses `stopPropagation` rather than
   `target === currentTarget`; saving adds `description: ''` to rows that had no description key
   (inherited from `CardEditor`); ProseMirror emits a harmless `getClientRects` `TypeError` to stderr
   under jsdom.

### 24.18 Classification and status

**CLASSIFICATION 2 — PASS WITH NON-BLOCKING OBSERVATIONS. PATCH-149B1b-i CLOSES.**

F3 is genuinely fixed at the narrowest correct boundary — primitives in the dependency list, one state
slice *removed* rather than added, and metadata read from the live prop at save time, which also closes
a second latent overwrite path the original review had only flagged as a tidy-up. The correction stayed
inside its two authorized files, weakened nothing, and every other property §22 governs remains proven.
The three observations are recorded, not blocking: one is a budget the correction brief itself
necessitated, one is an unreachable corner that B1b-ii must re-check, and one is a build-artifact
hygiene rule.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`, reviews §20/§21) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, reviews §23/§24) |
| **PATCH-149B1b-ii** | **RELEASED FOR GOVERNANCE — not authorized, not implemented.** Must re-verify O2 |
| **PATCH-149B2** | **BLOCKED until B1b-ii closes** — explicit Save, dirty state, discard, Close/Escape |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Carried debt, unchanged:** the temporary save-on-close lifecycle (§22.4) must not survive B2;
`CardEditor`'s six handler-less toolbar buttons (§22.1 C4) remain on the clipart-read-only surface.

No implementation file was modified by this review. Nothing was pushed.
