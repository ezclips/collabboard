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

---

## 25. PATCH-149B1b-ii — DOCUMENT ROUTING AND MODAL INTEGRATION · **AUTHORIZED (BUDGET AMENDED)**

**Authored:** 2026-08-04 (governance architect). **Base:** `26ec7c0`. Every line number below was
**re-measured at this HEAD**; no number from §22.1 was trusted, and §22.1 is **corrected** by this
section. No production or test file was modified in this turn.

### 25.1 Route census — re-measured at `26ec7c0`

Method: enumerate every call site of `setIsCardEditorOpen(true)`, `setIsCardViewerOpen(true)`,
`setIsClipartDraftModalOpen(true)` and `setIsNoteEditorOpen(true)` across the whole tree, then trace
each back to its trigger. Only five files reference `setPadletToEdit` at all (`CanvasClient`,
`FreeformPadletCards`, `CanvasModals`, `CanvasEditorContext`, `usePadletSave`); `CanvasEditorContext`
owns no card-modal state, so the census below is closed.

| # | Route | Path measured at HEAD | Types | Capability source | Destination now | Title | Content | Metadata | Save cb | Funnels? | B1b-ii destination |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Central router** `openPadletInTypeEditor` | `CanvasClient:5685-5709`; card branch `:5704-5707` | all | `selectCardModalRoute(canUseFreeformEditButton)` `:5705` | CardEditor / CardViewer | passed | passed | passed | `saveCard` | — (is the funnel) | **Document wrapper** |
| 2 | Deep link `?openPadlet=` | `:342-351` → `openPadletInTypeEditorRef` → `:5685` | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 3 | Context-menu open | `openPadletTargetFromContextMenu` `:5713-5721` → `:5685` | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 4 | Wall `onOpenTarget` | `:6662-6664` → 3 | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 5 | Timeline `onOpenTarget` | `:6757` (`canUseFreeformEditButton ? … : undefined`) → 3 | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 6 | Map `onEditPinPost` | `:6871-6873` → 3 | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 7 | Drawing `onPadletEdit` | `:6718-6725` → `:5685` | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 8 | Drawing `onEditPadletAsPost` | `:6726-6730`; **container-guarded** at `CanvasContextMenu:172` (`isContainerType && onEditPadletAsPost ? … : onEdit`) | containers only | n/a | NoteEditor | n/a | n/a | n/a | `saveNote` | n/a | **unchanged — not Document-reachable** |
| 9 | Columns `onEditPost` | `:6477` → 3 | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 10 | Rows `onEditPost` / `onOpenTarget` | `:6566`, `:6572` → 3 | all | via 1 | via 1 | passed | passed | passed | `saveCard` | ✅ | via 1 |
| 11 | **Columns `onOpenPost`** | `:6478-6481` — `setPadletToEdit(post); setIsNoteEditorOpen(true);` | any | none in callback (`isEditable` `:6466` gates the affordance) | **NoteEditor** | **LOST** | passed | note-shaped | `saveNote` | ❌ **BYPASS** | **Document wrapper** |
| 12 | **Rows `onOpenPost`** | `:6568-6571` — identical body | any | none in callback (`isEditable` `:6551`) | **NoteEditor** | **LOST** | passed | note-shaped | `saveNote` | ❌ **BYPASS** | **Document wrapper** |
| 13 | **Freeform `openFreeformPadletModal`** | `FreeformPadletCards:402-444`; card branch `:420-421`; trigger = hover pencil `:3221-3235` under `showModalEditButton` (`:3091`) | all | **none in the router**; affordance hidden unless `canUseFreeformEditButton` | **CardEditor** (also for clipart) | passed | passed | passed | `saveCard` | ❌ **BYPASS (NEW)** | **Document wrapper** |
| 14 | **Freeform `CardPreview.onEditContent`** | `FreeformPadletCards:1758-1766`; rendered for `padlet.type === 'card'` `:1708`; buttons `CardPreview.tsx:65-74`, `:144-150` | cards | `selectCardModalRoute(canUseFreeformEditButton)` `:1761` | CardEditor / CardViewer (**no clipart split**) | passed | passed | passed | `saveCard` | ❌ **BYPASS (NEW)** | **Document wrapper** |
| 15 | Freeform `onToggleCardView` | `FreeformPadletCards:1808-1812`, inside `{false && …}` `:1791` | — | — | **DEAD** | — | — | — | — | — | **untouched — recorded as dead** |
| 16 | **Creation** `case 'document'` | `CanvasClient:5401-5418` — drafts `{id:'new', type:'card', title:'', content:'', metadata:{...createMetadata}}` then `setIsCardEditorOpen(true)` `:5417` | new | creation permission upstream | CardEditor | `''` | `''` | createMetadata | `saveCard` | ❌ direct | **Document wrapper (editable)** |
| 17 | Clipart open | `:5700-5702` | clipart | `selectCardModalRoute` | ClipartDraftModal / CardViewer | — | — | — | — | — | **unchanged** |
| 18 | Clipart replace | `:7513` | clipart | — | ClipartDraftModal | — | — | — | — | — | **unchanged** |
| 19 | CanvasModals | `components/collabboard/canvas/ui/CanvasModals.tsx` (474 lines) — owns NoteEditor/Link/Table/Todo/Container/Comment/Image/Drawing/AI; **does not own CardEditor**, which renders at `CanvasClient:7366-7391` | — | — | — | — | — | — | — | — | **hosts the Document wrapper** (§22.9) |
| 20 | Sidebar / search / mobile | **none exist** — no other file sets card-modal state | — | — | — | — | — | — | — | — | n/a |

**Path correction:** the brief's `components/collabboard/CanvasModals.tsx` does not exist. The real path
is **`components/collabboard/canvas/ui/CanvasModals.tsx`**.

#### Prior findings — reconfirmed or corrected

- **C1 reconfirmed.** `:5704` *is* the exact Document branch: clipart is fully consumed by `:5700`, so
  every post reaching `:5704` satisfies `type === 'card' && !metadata?.svgUrl`.
- **C3 reconfirmed.** `isCardViewerOpen` is shared between clipart read-only (`:5702`) and Document
  read-only (`:5706`). Only the Document half moves.
- **C4 reconfirmed.** `CardEditor.tsx` (173 lines) is a `<textarea>` with six handler-less toolbar
  buttons.
- **Columns/Rows bypass — reconfirmed** (rows 11, 12), and both carry a **second, funnelling** entry
  point (`onEditPost`, rows 9/10). Only `onOpenPost` bypasses.
- **DrawingLayout not Document-reachable — reconfirmed** (row 8).
- **C2 — “exactly two bypasses exist” — WRONG at HEAD. Corrected to C2′: there are FOUR.** Columns
  `onOpenPost`, Rows `onOpenPost`, `openFreeformPadletModal`, and `CardPreview.onEditContent`.
  §22.1's claim that freeform open funnels through `openPadletInTypeEditor` is false, because of C5.

#### New findings

- **C5 — `openPadletInTypeEditor` is a dead prop on `FreeformPadletCards`.** `CanvasClient:5864` passes
  `openPadletInTypeEditor={openPadletInTypeEditor}`, but the identifier appears **nowhere** in
  `FreeformPadletCards.tsx` and is **not declared** in `FreeformPadletCardsProps` (`:143`) — an excess
  prop, silently discarded. Freeform therefore runs its **own duplicate type router** (row 13), a P6
  second implementation of `openPadletInTypeEditor`. This is why §22.1 mis-measured route 1.
- **C6 — `saveCard` closes the modal itself.** `usePadletSave.ts:996-997`, `:1007`, `:1069-1070` call
  `setIsCardEditorOpen(false)` **and** `setPadletToEdit(null)`. A new `documentModalDestination` state
  is *not* cleared by `saveCard`. This is safe **only** because the wrapper calls `onSave(...)` then
  `onClose()` synchronously in the same handler, so the Document modal closes through its own
  `onClose`, and `saveCard`'s `useCallback` closure has already captured the live `padletToEdit`. This
  ordering is now a **governed contract** and must be tested (§25.8 T-13), not assumed.
- **C7 — the freeform pencil does not split clipart.** Row 13 sends a clipart card to `CardEditor`,
  whereas the central router sends it to `ClipartDraftModal` (`:5701`). Row 14 has the same gap.
  **Pre-existing, out of B1b-ii scope, carried in §25.13** so it is not mistaken for Document work.
- **C8 — an existing test hard-codes the helper occurrence count.**
  `lib/domain/canvas/cardModalRoute.test.ts:44` asserts `selectCardModalRoute(` appears **exactly 2**
  times in `CanvasClient.tsx` (measured: 2 in `CanvasClient`, 1 more in `FreeformPadletCards`, which
  that assertion does not see). B1b-ii changes those branches, so this file **must** be in the
  allowlist. The implementer must **re-measure** the new number, never guess it.

### 25.2 O2 identity corner — **ID-B (reachable, but naturally remounts)** · no identity prop required

`CanvasModals` already wraps **every** editor in a keyed div:

```tsx
<div key={isNoteEditorOpen ? `note-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'note-closed'}>
```

measured at `:136` (Note), `:152` (Link), `:181` (Table), `:195` (Todo), `:226` (Container), `:354`
(Image), `:387` (Drawing), `:426` (AI). The key changes on **both** a post-id change **and** an
open/close transition, so React unmounts and remounts the editor on a document switch — resetting all
draft state structurally, with no dirty-state machinery.

The incumbent `CardEditor` instances at `CanvasClient:7366` and `:7380` carry **no key at all** — which
is precisely the environment in which O2 was raised. Rendering the Document wrapper in `CanvasModals`
under the identical keyed-div idiom therefore resolves O2 **by construction**, and independently
vindicates §22.9's choice of host.

**Governed:** the Document wrapper **must** render inside
`<div key={documentModalDestination ? \`document-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}\` : 'document-closed'}>`.
**No `documentId` prop, no React `key` on the wrapper itself, no dirty-state behaviour.** A negative
control removing the keyed div must fail the suite (§25.9 NC11).

### 25.3 Routing helper — **RTE-C**, one pure destination function

New `lib/domain/canvas/documentModalRoute.ts`:

```ts
export type DocumentModalDestination = 'document-editor' | 'document-viewer';

export function selectDocumentModalDestination(
  post: Pick<Padlet, 'type' | 'metadata'> | null | undefined,
  canEditWorkspace: boolean,
): DocumentModalDestination | null;
```

Required: uses **`isDocumentPost`** (never re-inlines the predicate — closes the §20.2 duality); reuses
**`selectCardModalRoute(canEditWorkspace)`** internally (`'editor' → 'document-editor'`,
`'viewer' → 'document-viewer'`) so no second role model is created and PATCH-139/151 stay
authoritative; returns **`null`** for every non-Document post and for `null`/`undefined`, so callers
fall through to today's behaviour untouched; **no React, no state, no role inference, no persistence,
no capability computation of its own, no PDF branch**.

Capability source stays `canUseFreeformEditButton` (`CanvasClient:254`, from
`canEditWorkspace(currentWorkspaceRole)`). **Permission is never inferred from callback presence.**
Client gating remains UI-only and is not the persistence authorization boundary.

### 25.4 Modal state — **one variable, not two**

`CanvasClient` gains exactly one new state slice:

```ts
documentModalDestination: DocumentModalDestination | null
```

`isOpen` is `destination !== null`; `readOnly` is `destination === 'document-viewer'`. A boolean pair
(`isDocumentEditorOpen` + `isDocumentViewerOpen`, or open + readOnly) is **rejected**: two variables can
desynchronise into an editable viewer, and the helper's own return type already carries both facts (P6).

`CanvasModals` receives `documentModalDestination` and `setDocumentModalDestination` plus the explicit
capability boolean it needs; it derives `isOpen`/`readOnly` and must not recompute capability.

### 25.5 Rewiring contract — per route

Every rewired site follows the same shape: ask the helper first; **`null` ⇒ existing behaviour
byte-identical**.

| Route | Change |
|---|---|
| Central `:5704-5707` | Document branch opens the wrapper; clipart `:5700-5702` **untouched** |
| Columns `onOpenPost` `:6478-6481` | helper first; `null` ⇒ current `setIsNoteEditorOpen(true)` unchanged |
| Rows `onOpenPost` `:6568-6571` | identical treatment |
| `openFreeformPadletModal` card branch `:420-421` | helper first; `null` ⇒ current `setIsCardEditorOpen(true)` unchanged (**clipart behaviour preserved exactly** — C7 is not fixed here) |
| `CardPreview.onEditContent` `:1758-1766` | helper first; `null` ⇒ current `selectCardModalRoute` branch unchanged |
| Creation `case 'document'` `:5417` | opens the wrapper editable; draft shape at `:5403-5416` unchanged |

**Payload:** the wrapper receives `title={padletToEdit?.title || ''}`,
`initialContent={padletToEdit?.content || ''}`, `metadata={padletToEdit?.metadata || null}`,
`onSave={saveCard}` in editable mode and a **non-writing** `onSave` in read-only mode, `onClose` that
sets `documentModalDestination` to `null` **and** `padletToEdit` to `null`.

`metadata` **should be passed as `padletToEdit?.metadata ?? null`, not `|| {}`** — the wrapper's prop
type already accepts `null`, and the `|| {}` idiom is the exact unstable-reference pattern that caused
F3 (§23.12). This is a hardening requirement, not a style preference; F3 is fixed either way (§24.2),
but the repository should stop propagating the pattern.

**Not permitted:** no new write path (reuse `saveCard`); no schema change; no `SaveNoteData` for
Documents; no capability recomputation downstream; no B2 behaviour.

### 25.6 `usePadletSave` — **still excluded**, on measured grounds

`SaveCardData` is already `{ title, content, metadata }` (`usePadletSave.ts:136-140`) and `saveCard`
writes `title` on insert and update. The C6 modal-close side effect does **not** force an edit, because
the wrapper owns its own close. **`hooks/canvas/usePadletSave.ts` is NOT in the allowlist.** If the
implementer finds the Document modal cannot close without editing `saveCard`, that is a **hard stop**,
not a licence to widen scope.

**Creation lifecycle preserved exactly:** `saveCard:980-999` early-returns without inserting when
`id === 'new'` and title, tag-stripped content and `metadata.description` are all empty with no
meaningful metadata. A blank new Document must still orphan no row.

### 25.7 Scope, allowlist and **budget amendment**

§22.12 budgeted B1b-ii at 3 production files / ≤120 lines / ≤230 test lines. That estimate was derived
from the **incorrect** two-bypass census (C2). With four bypasses, the dead-prop finding (C5) and the
test collision (C8), the true scope is larger. §22.12 states *“Nothing is compressed to fit a number”*;
the number is therefore **amended, with the measurement that forced it recorded above**.

| # | Path | Change | Max lines |
|---|---|---|---|
| 1 | `lib/domain/canvas/documentModalRoute.ts` | **new** — §25.3 pure helper | **35** |
| 2 | `components/collabboard/canvas/ui/CanvasModals.tsx` | render the wrapper under the keyed div (§25.2); new props | **55** |
| 3 | `app/dashboard/canvas/[id]/CanvasClient.tsx` | `documentModalDestination` state; `:5704-5707`; creation `:5417`; Columns `:6478`; Rows `:6568`; pass state + capability to `CanvasModals` | **55** |
| 4 | `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | rewire the two bypasses (`:420-421`, `:1758-1766`) only | **30** |
| 5 | `lib/domain/canvas/cardModalRoute.test.ts` | re-measure the occurrence-count assertion (C8) | **10** |

**Production ≤ 175 / 4 files. Existing-test edit ≤ 10 / 1 file.**
New tests: `documentModalRoute.test.ts` (≤110, node), `documentRoutes.source.test.ts` (≤160, node,
scoped source slices). **New tests ≤ 270 / 2 files.**

**File-ceiling note (house rule 3).** `CanvasClient.tsx` is **8,346 lines** and
`FreeformPadletCards.tsx` is **6,343** — both far over the 800 ceiling, and rule 3 forbids growing a
file already over it. Both edits are therefore capped hard and must be **rewiring, not addition**:
replace an inline destination decision with a helper call. The implementer should aim for a **net-zero
or negative** delta in file 4 and must justify any net growth in file 3 beyond the state slice and the
`CanvasModals` prop pass-through. Removing the dead `openPadletInTypeEditor` prop at `CanvasClient:5864`
(C5) is **permitted and encouraged** within the file-3 budget.

**Explicitly excluded:** `hooks/canvas/usePadletSave.ts` · `CardEditor.tsx` · `CardPreview.tsx` ·
`ClipartCardDraftModal.tsx` · `NoteEditor.tsx` · `NoteEditorToolbar.tsx` · `DocumentEditor.tsx` ·
`DocumentEditor.test.tsx` · `DocumentEditor.readonly.test.tsx` · `useSharedTipTapEditor.ts` ·
`documentContentAdapter.ts` · `documentPost.ts` · `NoteEditor.characterization.test.tsx` ·
`package.json` · `package-lock.json` · schema/migrations · presentation code · the Excalidraw fork.
**The B1b-i wrapper is closed and must not be reopened** — if routing appears to need a wrapper change,
stop and request a governance amendment.

### 25.8 Required test coverage

`documentModalRoute.test.ts` (pure, node):

- T-1 Document + `canEditWorkspace=true` → `'document-editor'`.
- T-2 Document + `false` → `'document-viewer'`.
- T-3 clipart card (`metadata.svgUrl`) → `null` in **both** capability states.
- T-4 note, todo, link, image, table, container, comment, drawing, ai-component → `null`.
- T-5 `null`/`undefined` post → `null`.
- T-6 the new-Document draft shape (`type:'card'`, no `svgUrl`) → `'document-editor'`.
- T-7 the module imports `isDocumentPost` and `selectCardModalRoute` and re-inlines neither predicate.
- T-8 deterministic and side-effect free.

`documentRoutes.source.test.ts` (node, **scoped source slices — whole-file substring counts are
forbidden**): slice and assert each of

- T-9 `openPadletInTypeEditor` body — Document branch references the shared destination; the clipart
  branch at `:5700` is **unchanged**.
- T-10 Columns `onOpenPost` body · T-11 Rows `onOpenPost` body.
- T-12 `openFreeformPadletModal` body · T-13 the `CardPreview onEditContent` body in
  `FreeformPadletCards`.
- T-14 creation `case 'document'` block.
- T-15 **no** Document-reachable slice still references `setIsCardEditorOpen(true)` or
  `setIsNoteEditorOpen(true)`.
- T-16 `CanvasModals` renders the wrapper inside a keyed div whose key contains `padletToEdit?.id` and
  a closed sentinel (O2 / §25.2).
- T-17 read-only Documents receive a non-writing save callback, and capability is passed explicitly
  rather than inferred from callback presence.
- T-18 (C6) the wrapper's save-then-close ordering is preserved at every editable Document call site.

**The suite must fail if any one layout bypasses the shared route.**

**Regressions:** NoteEditor characterization 11/11 green and unmodified · `DocumentEditor` 17/17 and
read-only 6/6 unmodified · `CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute`
(count re-measured) · `documentPost` · `documentContentAdapter` · `useSharedTipTapEditor` · creation
flow unchanged · no PDF production code.

### 25.9 Negative controls — all 14 must be detected and reverted hash-identically

1. route the Document branch back to `CardEditor` (`:5704`) · 2. leave Columns `onOpenPost` on
`NoteEditor` · 3. leave Rows `onOpenPost` on `NoteEditor` · 4. leave `openFreeformPadletModal` on
`CardEditor` · 5. leave `CardPreview.onEditContent` on `CardEditor` · 6. drop `title` from the wrapper
props · 7. classify clipart as a Document · 8. route Note/Todo/Link/Image through the Document helper ·
9. leave creation `:5417` on `CardEditor` · 10. force read-only capability to editable ·
11. **remove the keyed remount div in `CanvasModals`** (O2) · 12. pass `saveCard` as the read-only save
callback · 13. leave the deep-link route on the old destination · 14. introduce a PDF-specific branch.

### 25.10 Induced failures — each demonstrable at `26ec7c0`

1. `lib/domain/canvas/documentModalRoute.ts` does not exist; the Document predicate is inlined and
   unnamed at `:5704`.
2. A freeform Document opens `CardEditor` — a `<textarea>` (`CardEditor.tsx:147`).
3. Columns and Rows `onOpenPost` call `setIsNoteEditorOpen(true)` directly (`:6480`, `:6570`) and
   `SaveNoteData` (`usePadletSave.ts:34-48`) **has no `title` field** — the live P3 title-loss path.
4. `openFreeformPadletModal` (`FreeformPadletCards:420-421`) opens `CardEditor` with **no**
   `selectCardModalRoute` call at all.
5. `openPadletInTypeEditor` is passed to `FreeformPadletCards` and silently discarded (C5).
6. A read-only Document opens `CardViewer` → `CardEditor` `<textarea readOnly>` (`:5706`).
7. The incumbent `CardEditor` instances (`CanvasClient:7366`, `:7380`) have **no remount key**, unlike
   every editor in `CanvasModals`.

Each production correction must map to one of these.

### 25.11 False-green protections

Reject if: any Document route still reaches `CardEditor`, note-shaped `NoteEditor`, or
`ClipartCardDraftModal` · title is absent from any Document save payload · a source test uses whole-file
substring counts · the keyed remount div is absent · capability is inferred from callback presence ·
read-only receives a writing callback · clipart routing changes · Note/Todo/Link/Image/table/container/
comment/drawing/ai-component destinations change · `NoteEditor` behaviour changes · the B1b-i wrapper or
its tests are edited · `usePadletSave` is edited · scope exceeds the allowlist · PDF code appears · B2
behaviour (explicit Save, dirty state, discard confirmation, Escape redesign) appears.

### 25.12 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| Title cannot be preserved without persistence changes | **NOT TRIGGERED** — `SaveCardData` already carries `title` (§22.2) |
| Document routes cannot be separated from generic routes | **NOT TRIGGERED** — the helper returns `null` for non-Documents; four bounded bypasses (C2′) |
| The Document modal cannot close without editing `saveCard` | **NOT TRIGGERED** — the wrapper's `onSave`-then-`onClose` ordering closes it (C6); if disproven in implementation, **stop** |
| O2 requires a new identity prop | **NOT TRIGGERED** — resolved ID-B by the existing keyed-div idiom (§25.2) |
| Rewiring requires growing a file already over the 800 ceiling | **CONSTRAINED, not triggered** — both edits are rewiring with hard caps; C5's dead-prop removal offsets file 3 |
| Clipart behaviour cannot be preserved while rewiring freeform | **NOT TRIGGERED** — the `null` fall-through preserves it exactly; C7 stays carried |
| Read-only Document cannot be separated from clipart read-only | **NOT TRIGGERED** — clipart keeps `isCardViewerOpen` (C3); only the Document half moves |
| B2 becomes inseparable from B1b-ii | **NOT TRIGGERED** — lifecycle stays inside the wrapper's two handlers (§22.4) |
| Production scope cannot be bounded | **RESOLVED by the §25.7 amendment** — 4 files / ≤175 lines, measured, not estimated |

**Split evaluated and rejected.** §22.15 requires that the suite fail *if any one layout bypasses the
shared route* — an all-or-nothing property. Splitting the helper/central branch from the four bypasses
would ship an intermediate state in which Columns and Rows still destroy Document titles (P3). B1b-ii
ships as **one unit**.

### 25.13 Validation matrix

Helper tests · scoped route-source tests · `DocumentEditor` editable + read-only · NoteEditor
characterization · `CardEditor` · `CardPreview` · `ClipartCardDraftModal` · `cardModalRoute` ·
`documentPost` · `documentContentAdapter` · `useSharedTipTapEditor` · **full Vitest** · clean one-run
`npm run typecheck` · **410** declarations · `npx next build` · bridge exclusion **891** · clean E2E
build (marker `1`) · ordinary `.next` restored and exclusion re-verified · marker absent ·
`git diff --check` · only the five protected worktree paths.

**Baseline entering B1b-ii: 72/72 files · 839/839 tests · 410 declarations · 891 exclusion files.**

**Build hygiene (§24.15 O3):** clear `.next` before trusting any build result that follows a
`build:e2e` / ordinary-build swap.

### 25.14 Status

**PATCH-149B1b-ii: OPEN · AUTHORIZED** — 4 production files, ≤175 production lines, 1 existing-test edit
≤10 lines, ≤270 new test lines, 14 negative controls, 7 induced failures.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, reviews §23/§24) |
| **PATCH-149B1b-ii** | **OPEN · AUTHORIZED — next implementation unit** |
| **PATCH-149B2** | **BLOCKED until B1b-ii closes** — explicit Save, dirty state, discard, Escape/backdrop |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |

**Carried debt and defects — recorded so they are not mistaken for Document scope:**

1. The temporary save-on-close lifecycle (§22.4) must not survive B2.
2. `CardEditor`'s six handler-less toolbar buttons (§22.1 C4) remain on the clipart-read-only surface.
3. **C7** — the freeform pencil and `CardPreview.onEditContent` send **clipart** cards to `CardEditor`
   rather than `ClipartDraftModal`, diverging from the central router. Pre-existing; **not** fixed by
   B1b-ii, which preserves it byte-identically via the `null` fall-through.
4. **C5** — `openFreeformPadletModal` is a P6 duplicate of `openPadletInTypeEditor`. B1b-ii removes only
   its Document branch; collapsing the two routers entirely is a separate refactor.
5. **Row 15** — `FreeformPadletCards:1791` gates a whole toolbar behind `{false && …}`; dead code,
   untouched.

No production or test file was modified in this turn. Nothing was pushed.

---

## 26. PATCH-149B1b-ii AMENDMENT — CLIPART EXCLUSION · **PRODUCT-OWNER DIRECTIVE, CLASS A**

**Amended:** 2026-08-04 (governance architect, on product-owner direction). **Base:** `4dc1e93`.
This section **amends §25 in place by reference** — where §26 and §25 differ, §26 governs. No production
or test file was modified in this turn.

### 26.1 Directive recorded

1. **No PATCH-152 is reserved.** No follow-up patch number is allocated for the clipart divergence.
2. **Clipart Posts are not Document Posts.**
3. **Remove or suppress the Document-modal button/action for clipart posts.**
4. **Do not reroute or redesign clipart editing in PATCH-149B1b-ii.**
5. **Preserve the existing clipart editor/viewer behaviour otherwise.**

Intended Document behaviour, restated as the governing product contract:

| Post | Capability | Destination |
|---|---|---|
| Document Post | editable | `DocumentEditor`, `readOnly={false}` |
| Document Post | read-only | **the same** `DocumentEditor`, `readOnly={true}` |
| **Clipart post** | either | **never offered the Document modal** — existing clipart editor/viewer, unchanged |

### 26.2 Predicate verification — clipart is outside `isDocumentPost`, measured

`isDocumentPost` (`lib/domain/canvas/documentPost.ts:5`) is
`post.type === 'card' && !post.metadata?.svgUrl`. Re-verified at `4dc1e93`:

- **`metadata.svgUrl` is the sole clipart discriminator in the codebase.** `CardPreview.tsx:37` computes
  `const isClipartCard = !!svgUrl` — the *identical* test the predicate negates — and the central
  router's clipart branch (`CanvasClient:5700`) uses `post.type === 'card' && post.metadata?.svgUrl`.
  A tree-wide scan for an alternative persisted flag (`isClipart`, `clipartUrl`, `iconUrl`) finds
  **none**; `iconUrl` exists only in `lib/imports/*` for external file-import previews and is never a
  post-metadata key.
- **`selectDocumentModalDestination` therefore returns `null` for every clipart post**, in **both**
  capability states, and the `null` fall-through (§25.5) leaves clipart on its existing destination
  byte-identically.

**Finding C9 — clipart-ness is mutable at runtime, and the asymmetry favours the exclusion.**
The icon-replace flow (`CanvasClient:7530-7545`) calls `updatePadletMetadata(id, { svgUrl })` and
clears the title, converting an existing card into a clipart card. Nothing anywhere **removes**
`svgUrl` — a tree-wide scan for `svgUrl: null`, `svgUrl: undefined` and `delete …svgUrl` returns
nothing. So the transition is **one-way**: a Document can become clipart, but clipart can never become a
Document. Combined with §26.3's per-open evaluation rule, this makes the exclusion permanent once a post
is clipart.

### 26.3 Affordance requirement — how the suppression must be implemented

The Document modal must be **unreachable** for clipart, not merely visually hidden after the fact.

- **Governed mechanism:** every rewired route asks `selectDocumentModalDestination` **at the moment the
  route runs**, reading the post's **live** metadata. A `null` result means the route falls through to
  its current behaviour unchanged. Clipart therefore never sets `documentModalDestination`, so the
  wrapper never mounts for it.
- **The destination must never be cached, memoized per post, or stored anywhere but the single
  `documentModalDestination` state slice set at open time** (§25.4). Because clipart-ness is mutable
  (C9), a cached decision could outlive its inputs.
- **No new clipart-specific branch, guard, prop or predicate may be added.** The exclusion is already
  structural through `isDocumentPost`; a second clipart test would be a P6 duplicate of the
  discriminator and is **rejected**.
- **No clipart affordance may be removed, relabelled, reordered or restyled.** "Remove or suppress the
  Document-modal button/action for clipart" is satisfied by clipart never being offered the Document
  modal in the first place; the existing pencil/open affordances remain exactly as they are today and
  continue to open the existing clipart editor/viewer.

**Consequence for §25.5:** the freeform rows (`openFreeformPadletModal:420-421`,
`CardPreview.onEditContent:1758-1766`) keep the `null` fall-through **exactly as authorized**. This
amendment does not change the mechanism; it raises the clipart exclusion from an implementation detail
to a **product contract with its own tests and false-green trigger**.

### 26.4 C7 — closed as recorded divergence, **no follow-up patch**

§25.1 C7 recorded that the freeform pencil and `CardPreview.onEditContent` send clipart to `CardEditor`
while the central router sends it to `ClipartDraftModal`. Per directive items 4 and 5 this is
**deliberately preserved and not scheduled**. §25.14 carried item 3 is **reclassified**:

> ~~Carried defect~~ → **Recorded behavioural divergence. Deliberately preserved. Out of scope for
> PATCH-149B1b-ii and every successor. No patch number is reserved.** It is recorded solely so a future
> reader does not mistake it for Document scope or for a regression introduced by B1b-ii.

The same treatment applies to §25.14 item 4 (C5, the duplicate freeform router): recorded, not
scheduled, **no patch number reserved**. B1b-ii removes only its Document branch.

### 26.5 Additional required tests — clipart exclusion

Appended to §25.8. These are **blocking**, not optional.

- **T-19** `selectDocumentModalDestination` returns `null` for a clipart post
  (`type:'card'`, `metadata.svgUrl` present) with `canEditWorkspace=true` **and** with `false`.
  (Strengthens §25.8 T-3 from a helper detail to a product contract.)
- **T-20** A clipart post carrying **every other Document-shaped field** (non-empty `title`,
  non-empty `content`, `metadata.description`) still returns `null` — the discriminator is `svgUrl`
  alone and no other field can promote a clipart post into a Document.
- **T-21** Scoped source slices: no rewired route (`openPadletInTypeEditor` card branch, Columns
  `onOpenPost`, Rows `onOpenPost`, `openFreeformPadletModal`, `CardPreview.onEditContent`, creation
  `case 'document'`) can set `documentModalDestination` on a path reachable by a clipart post; the
  clipart branch at `CanvasClient:5700-5702` and the clipart replace flow at `:7513` are **textually
  unchanged**.
- **T-22** No second clipart predicate is introduced: `svgUrl` appears in the B1b-ii diff **zero**
  times, and `isDocumentPost` remains the only Document/clipart discriminator consulted by routing.
- **T-23** Post-C9 ordering: a post whose metadata gains `svgUrl` is routed as clipart on its **next**
  open, proving the destination is computed per-open rather than cached.

### 26.6 Amended negative controls

§25.9 NC7 ("classify clipart as a Document") is **retained and strengthened**: the perturbation must
make `isDocumentPost` — or the routing call site — treat `metadata.svgUrl` as non-disqualifying, and
must be detected by **T-19, T-20 and T-21 together**, not by a single assertion. Two further controls
are added, bringing the total to **16**:

15. **cache the destination** per post instead of recomputing per open → **T-23 fails**.
16. **add a second, clipart-specific guard** alongside `isDocumentPost` → **T-22 fails**.

All 16 must be detected and reverted hash-identically.

### 26.7 Amended false-green protections

Added to §25.11 — reject if:

- a clipart post can reach `DocumentEditor` in **either** capability state;
- any clipart affordance is removed, hidden, relabelled, reordered or restyled;
- clipart editing or viewing behaviour changes in any way;
- a second clipart predicate or a clipart-specific routing branch is introduced;
- the Document destination is cached rather than computed per open;
- a follow-up patch number is reserved for C5 or C7.

### 26.8 Unchanged by this amendment

§25.2 (O2 → ID-B, keyed remount div) · §25.3 (helper contract) · §25.4 (single
`documentModalDestination` state) · §25.6 (`usePadletSave` excluded) · §25.7 (allowlist: 4 production
files ≤175 lines, `cardModalRoute.test.ts` ≤10, new tests ≤270) · §25.10 (7 induced failures) ·
§25.12 (hard stops; split rejected) · §25.13 (validation matrix, baseline 72/72 files · 839/839 tests ·
410 declarations · 891 exclusion files).

The test-line ceiling in §25.7 is **raised from 270 to 300** to accommodate T-19–T-23; the production
allowlist and line caps are **unchanged**, because the clipart exclusion requires **no production line
at all** — it is already structural.

### 26.9 Status

**PATCH-149B1b-ii: OPEN · AUTHORIZED (as amended by §26)** — 4 production files, ≤175 production lines,
1 existing-test edit ≤10 lines, ≤300 new test lines, 16 negative controls, 7 induced failures.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, reviews §23/§24) |
| **PATCH-149B1b-ii** | **OPEN · AUTHORIZED, AMENDED (§25 + §26)** — next implementation unit |
| **PATCH-149B2** | **BLOCKED until B1b-ii closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-151** | **CLOSED** — referenced by `cardModalRoute.test.ts`; untouched |
| **PATCH-152** | **NOT RESERVED** — no number allocated; C5 and C7 are recorded, not scheduled |

No production or test file was modified in this turn. Nothing was pushed.

---

## 27. PATCH-149B1b-iii — DOCUMENT "READ" AFFORDANCE · **AUTHORIZED, BLOCKED UNTIL B1b-ii CLOSES**

**Authored:** 2026-08-04 (governance architect, on product-owner direction). **Base:** `2679c12`.
Every path, line number and file size below was **measured at this HEAD**. No production or test file was
modified in this turn.

### 27.1 Why this is a separate unit, not a B1b-ii amendment

The directive was measured before being costed. The affordance is **presentation**, B1b-ii is
**routing**, and the two have disjoint owners: B1b-ii's four files (`documentModalRoute.ts`,
`CanvasModals.tsx`, `CanvasClient.tsx`, `FreeformPadletCards.tsx`) contain **no preview rendering code
at all**. Folding the affordance in would take B1b-ii from 4 files/≤175 lines to ~11 files/~200 lines
and mix two concerns in one review.

**PATCH-149B1b-ii's authorization is therefore UNCHANGED** (§25 as amended by §26): routing only,
4 production files, ≤175 production lines. This section adds a new unit, sequenced after it.

**Dependency:** the Read button has nothing to call until B1b-ii creates `documentModalDestination` and
the open handler. B1b-iii is **authorized but blocked** until B1b-ii closes. This is a technical
sequencing dependency, not an open question.

### 27.2 Exact affordance owner — measured, and **it is two owners, not one**

The brief proposed `CardPreview.tsx` or `FreeformPadletCards.tsx`. Both are wrong as a complete answer.

**Finding C10 — a Document Post has no preview branch of its own today.** In
`components/collabboard/PostCardContent.tsx` the clipart branch returns at `:894-905`, the AI branch at
`:908-911`, and a Document (non-clipart card) falls through to the **TEXT / DEFAULT branch at
`:915-931`** — byte-identical to how a note or text post renders, wrapped in
`className="select-none pointer-events-none"`. Nothing in the tree renders a Document preview
distinctly.

**Finding C11 — freeform does not share that renderer.** `CardPreview.tsx` (191 lines) is
**self-contained**; it imports `resolveCaptionStyle`, `Edit2` and `ReactionDisplay`, and **never renders
`PostCardContent`**. Freeform Documents therefore render through `CardPreview` (`FreeformPadletCards:1748`)
while every other layout renders through `PostCardContent`.

| Owner | Path | Lines | Serves |
|---|---|---|---|
| **A — freeform** | `components/collabboard/CardPreview.tsx` | 191 | Freeform canvas cards (`FreeformPadletCards:1748`, `:6044`) |
| **B — everything else** | `components/collabboard/PostCardContent.tsx` | **932 — over the 800 ceiling** | Columns, Rows, Wall, Drawing, Map, Grid, container editor, presentation |

**Finding C12 — `PostCardContent` also serves non-canvas surfaces.** Measured call sites include
`components/presentation/FullscreenPresentation.tsx:316`,
`components/presentation/slide-renderer/createSlideRenderer.tsx:192`,
`components/collabboard/editors/ContainerEditor.tsx:395`, `components/map/PostPopup.tsx:175` and
`components/collabboard/RowColumnContainerCard.tsx:407`. **The Read button must never appear in a
presentation slide or inside the container editor**, so it cannot be rendered unconditionally — it must
be opt-in via a supplied handler (§27.4).

**Finding C13 — the live layout stack is mixed across both canvas trees.** Measured from
`CanvasClient` imports and mount points: Columns → `components/canvas/layouts/ColumnsLayout.tsx`
(`:18`, mounted `:6465`); Rows → `components/collabboard/row/RowCanvasDnD.tsx` → `RowLane.tsx`
(`:29`, `:6550`); Wall → `components/canvas/WallCanvas.tsx` (`:24`, `:6619`); Drawing →
`components/collabboard/canvas/layouts/DrawingLayout.tsx` (`:19`, `:6699`); Map → `MapCanvas` →
`components/map/PostPopup.tsx` (`:113`); Freeform → `FreeformPadletCards.tsx` (`:125`, `:7032`).
`ColumnsLayoutRenderer.tsx`, `GridLayoutRenderer.tsx` and `ColumnsSection.tsx` are mounted only by
`components/collabboard/canvas/LiveCanvas.tsx` — the **second canvas system**, which house rule 9
forbids touching opportunistically. **They are out of scope**, and their absence from the affordance is
recorded, not fixed.

**Finding C14 — context cannot avoid prop threading.** `CanvasEditorProvider` is mounted at
`CanvasClient:7031-7053` and wraps **only** `<FreeformPadletCards>` (`:7032`). Columns (`:6465`), Rows
(`:6550`), Wall (`:6619`), Drawing (`:6699`) and Map are **outside** the provider. Supplying the open
handler by context would require relocating the provider — an architecture change beyond this patch.
**Explicit props are therefore the governed mechanism (AFF-A);** the context alternative (AFF-B) is
recorded as rejected with its reason.

### 27.3 Product contract

| Post | Capability | Read button | Modal |
|---|---|---|---|
| Document | editable | **shown** | `DocumentEditor` `readOnly={false}` — title, text and formatting editable under the §22.4 temporary lifecycle |
| Document | read-only | **shown** | **the same** `DocumentEditor` `readOnly={true}` |
| **Clipart** | either | **never** | unchanged clipart editor/viewer |
| Note, Todo, Link, Image, table, container, comment, drawing, ai-component | either | **never** | unchanged destinations |

The button is **capability-independent**; only the modal it opens differs. **No separate "Edit" button
is authorized in this patch.**

Read-only mode is already closed and proven (§24.12, `DocumentEditor.readonly.test.tsx` 6/6): title as
text, **no** title input, **no** description input, **no** toolbar, **no** Save action, `editable:false`
plus total absence of a command surface, and `onSave` invoked **zero** times on Close **and** backdrop.
B1b-iii must not reopen the wrapper; it must prove the **route** delivers `readOnly={true}`.

### 27.4 Delivery mechanism — **AFF-A**, one new component, two owners delegate to it

New `components/collabboard/DocumentCardContent.tsx`: renders the sanitized Document body exactly as
`PostCardContent:915-931` does today, plus a semi-transparent overlay button labelled **"Read"**.

- This **mirrors the pattern the file already uses** — `ClipartCardContent` is delegated to at
  `PostCardContent:894-905` — so it is not a new idiom (P6).
- `PostCardContent` gains a Document branch **before** the TEXT/DEFAULT return, delegating when
  `isDocumentPost(padlet)` **and** an `onOpenDocument` handler was supplied. **≤12 lines** — the file is
  932 lines and over the ceiling, so house rule 3 caps this at a delegation, never an inline
  implementation.
- `CardPreview` renders the same overlay for freeform, gated identically. Its existing `onEditContent`
  pencil is **unchanged**.
- The current default branch is `pointer-events-none`; the overlay button must re-enable pointer events
  **on the button only**, and must `stopPropagation` so it does not also trigger the card's own click.
- Accessibility: a real `<button type="button">` with an accessible name, keyboard-focusable — not a
  `div` with an `onClick`.

**Opt-in by handler presence is for affordance rendering only. Capability must still be passed
explicitly** to the destination helper (§25.3); permission is never inferred from callback presence
(§22.7). These are two different decisions and the tests must keep them separate.

### 27.5 Production allowlist — re-measured

| # | Path | Change | Lines | Max |
|---|---|---|---|---|
| 1 | `components/collabboard/DocumentCardContent.tsx` | **new** — body + Read overlay | new | **70** |
| 2 | `components/collabboard/PostCardContent.tsx` | delegation branch only (932, over ceiling) | +≤12 | **12** |
| 3 | `components/collabboard/CardPreview.tsx` | freeform overlay (191) | +≤25 | **25** |
| 4 | `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | pass handler (6,343, over ceiling) | +≤10 | **10** |
| 5 | `components/canvas/layouts/ColumnsLayout.tsx` | thread handler (506) | +≤10 | **10** |
| 6 | `components/collabboard/row/RowLane.tsx` | thread handler (527) | +≤10 | **10** |
| 7 | `components/collabboard/row/RowCanvasDnD.tsx` | pass through (425) | +≤10 | **10** |
| 8 | `components/canvas/WallCanvas.tsx` | thread handler (783) | +≤10 | **10** |
| 9 | `components/collabboard/canvas/layouts/DrawingLayout.tsx` | thread handler (3,529, over ceiling) | +≤8 | **8** |
| 10 | `components/map/PostPopup.tsx` | thread handler (224) | +≤8 | **8** |
| 11 | `app/dashboard/canvas/[id]/CanvasClient.tsx` | supply `openDocumentModal` to each live layout (8,346, over ceiling) | +≤25 | **25** |

**Production ≤ 198 / 11 files.** Tests: `DocumentCardContent.test.tsx` (≤140, jsdom),
`documentAffordance.source.test.ts` (≤120, node, scoped slices). **Tests ≤ 260 / 2 files.**

Files 2, 4, 9 and 11 are **over the 800-line ceiling**; every one of them is capped at **prop threading
or delegation** and may contain no new rendering logic. Any implementer who cannot stay inside a cap
must **stop and request an amendment**, not spill.

**Explicitly excluded:** `DocumentEditor.tsx` and both its test files (closed, §24) ·
`documentModalRoute.ts` and everything else in the B1b-ii allowlist · `usePadletSave.ts` ·
`ClipartCardDraftModal.tsx` · `NoteEditor.tsx` · `ContainerChildPreviewCard.tsx` /
`PostPreviewCard.tsx` (different renderer) · `LiveCanvas.tsx`, `ColumnsLayoutRenderer.tsx`,
`GridLayoutRenderer.tsx`, `ColumnsSection.tsx` (second canvas system, C13) · presentation code ·
`ContainerEditor.tsx` · schema/migrations · Excalidraw fork.

### 27.6 Required tests

`DocumentCardContent.test.tsx` (jsdom):

- **A-1** a Document post renders a visible, accessible **"Read"** button.
- **A-2** the button renders for **editable and read-only** capability alike.
- **A-3** clicking it invokes the supplied open handler exactly once, and does **not** also trigger the
  card's own click handler (`stopPropagation`).
- **A-4** the button is a real focusable `<button>` reachable by keyboard.
- **A-5** the Document body still renders sanitized and line-clamped exactly as before.
- **A-6** **no** button renders when no handler is supplied (presentation / container-editor safety).
- **A-7** **clipart** (`metadata.svgUrl`) renders **no** Read button in either capability state.
- **A-8** note, todo, link, image, table, container, comment, drawing, ai-component render **no** Read
  button.

`documentAffordance.source.test.ts` (node, **scoped slices — whole-file substring counts forbidden**):

- **A-9** every live Document presentation route (Freeform, Columns, Rows, Wall, Drawing, Map) supplies
  the open handler — the suite **must fail if any one route omits it**.
- **A-10** presentation and container-editor call sites supply **no** handler.
- **A-11** the destination receives capability **explicitly**, not inferred from handler presence.
- **A-12** `isDocumentPost` is the only predicate gating the button; `svgUrl` appears **zero** times in
  the B1b-iii diff (§26.3 — no second clipart predicate).

**Read-only proof (blocking, per directive):**

- **A-13** a read-only user opening via the Read button reaches `DocumentEditor` with
  `readOnly={true}`, and the rendered modal exposes **no** title input, **no** description input,
  **no** toolbar and **no** Save control.
- **A-14** a read-only user's Close **and** backdrop each invoke `onClose` once and the persistence
  callback **zero** times.
- **A-15** no ordinary DOM interaction in read-only mutates the document (`contenteditable="false"`
  **and** absence of any command surface — never `contenteditable` alone, §22.16).

### 27.7 Negative controls — 10, each detected and reverted hash-identically

1. show the Read button for clipart → A-7 fails · 2. show it for notes → A-8 fails · 3. hide it for
read-only users → A-2 fails · 4. render it unconditionally (presentation leak) → A-6/A-10 fail ·
5. drop `stopPropagation` → A-3 fails · 6. omit the handler on one layout → A-9 fails · 7. infer
capability from handler presence → A-11 fails · 8. force `readOnly={false}` for a read-only user →
A-13 fails · 9. add a second clipart predicate → A-12 fails · 10. render a `div` instead of a
`button` → A-4 fails.

### 27.8 Induced failures — demonstrable at `2679c12`

1. No Document preview branch exists — a Document renders through `PostCardContent:915-931`,
   the same return that serves notes.
2. That branch is `pointer-events-none`, so no in-preview affordance is even clickable.
3. `CardPreview.tsx` renders no Read control; its only pencil is `onEditContent`.
4. `DocumentCardContent.tsx` does not exist.
5. No layout passes a Document-open handler to its preview renderer.

### 27.9 Hard stops — evaluated

| Hard stop | Result |
|---|---|
| The affordance cannot be added without growing files over the ceiling | **CONSTRAINED, not triggered** — files 2/4/9/11 are capped at delegation or prop threading; all rendering lives in the new file 1 |
| Consistency across routes requires a shared wrapper that does not exist | **NOT TRIGGERED** — two owners cover every live route (C10/C11); the suite fails if any route omits the handler (A-9) |
| Context could avoid the fan-out | **REJECTED with cause** — the provider wraps freeform only (C14) |
| Clipart cannot be excluded structurally | **NOT TRIGGERED** — `PostCardContent`'s clipart branch returns at `:894`, **before** the Document branch, so clipart cannot reach it even if the gate were removed; `isDocumentPost` gates it again |
| Read-only cannot be proven non-editable through the route | **NOT TRIGGERED** — the wrapper is closed and proven (§24.12); A-13–A-15 prove the route delivers it |
| The second canvas system must also be changed | **NOT TRIGGERED** — `LiveCanvas` is out of scope by house rule 9 (C13), recorded |
| Scope cannot be bounded | **RESOLVED** — 11 files, ≤198 lines, per-file caps |

### 27.10 Validation matrix

`DocumentCardContent` tests · affordance source tests · `DocumentEditor` editable 17/17 and read-only
6/6 **unmodified** · `CardPreview` · `CardEditor` · `ClipartCardDraftModal` · NoteEditor
characterization 11/11 · `documentPost` · `cardModalRoute` · `documentModalRoute` · **full Vitest** ·
clean one-run `npm run typecheck` · **410** declarations · `npx next build` · bridge exclusion **891** ·
clean E2E build (marker `1`) · ordinary `.next` restored and exclusion re-verified · marker absent ·
`git diff --check` · only the five protected worktree paths. Clear `.next` before trusting any build
that follows a `build:e2e` swap (§24.15 O3).

**Baseline is B1b-ii's closing baseline, not today's** — B1b-ii lands first and moves the test counts.

### 27.11 Status

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, §23/§24) |
| **PATCH-149B1b-ii** | **OPEN · AUTHORIZED, AMENDED (§25 + §26) — unchanged by this section.** Routing only; next implementation unit |
| **PATCH-149B1b-iii** | **OPEN · AUTHORIZED · BLOCKED until B1b-ii closes** — 11 production files, ≤198 lines, ≤260 test lines, 10 negative controls |
| **PATCH-149B2** | **BLOCKED until B1b-iii closes** |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-152** | **NOT RESERVED** — unchanged by this section |

**Recorded, not scheduled** (no patch numbers reserved): C5 duplicate freeform router · C7 freeform
clipart divergence · C13 the second canvas system (`LiveCanvas` + its renderers) lacking the affordance ·
`PostCardContent:611` already carrying a second inline clipart predicate, pre-existing.

No production or test file was modified in this turn. Nothing was pushed.

---

## 28. PATCH-149B1b-ii — INDEPENDENT CLOSURE REVIEW · **CLASSIFICATION 2 · CLOSED**

**Reviewed:** 2026-08-05 (independent closure reviewer). **HEAD:** `510aa8d`
`feat(document): route documents through TipTap modal`, parent `937d931`. Every result below was
re-executed with probes this review authored (`__review_b1bii_helper.test.ts`,
`__review_b1bii_identity.test.tsx` — 16 assertions across 3 groups); the implementer's tests were used
only as corroboration. All probes deleted, every perturbation reverted and hash-verified.

### 28.1 Source scope — **EXACT (7 files), all budgets respected**

| File | Δ | Budget | |
|---|---|---|---|
| `lib/domain/canvas/documentModalRoute.ts` (new) | 16 | 35 | ✅ |
| `components/collabboard/canvas/ui/CanvasModals.tsx` | 36 (36+/0−) | 55 | ✅ |
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | 26 (21+/5−) | 55 | ✅ |
| `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | 19 (17+/2−) | 30 | ✅ |
| **Production** | **97** | **175** | ✅ |
| `documentModalRoute.test.ts` (new) | 91 | — | |
| `documentRoutes.source.test.ts` (new) | 166 | — | |
| **New tests** | **257** | **300** | ✅ |
| `cardModalRoute.test.ts` | 7 (6+/1−) | 10 | ✅ |

Total 353 insertions / 8 deletions, matching the implementer's report exactly.

Verified **unchanged** in `510aa8d`: `DocumentEditor.tsx` + both its test files · `CardPreview.tsx` ·
`PostCardContent.tsx` · `NoteEditor.tsx` · `NoteEditorToolbar.tsx` · `CardEditor.tsx` ·
`ClipartCardDraftModal.tsx` · `usePadletSave.ts` · `package.json` · `package-lock.json` ·
`ColumnsLayout.tsx` · `RowLane.tsx` · `RowCanvasDnD.tsx` · `WallCanvas.tsx` · `DrawingLayout.tsx` ·
`PostPopup.tsx`. **No `.fable5` file, no schema/migration, no presentation code, no Excalidraw fork**
in the commit. `DocumentCardContent.tsx` correctly **does not exist** (B1b-iii scope).

**Path note (carried from §25.1):** the brief's `components/collabboard/CanvasModals.tsx` does not
exist; the real file is `components/collabboard/canvas/ui/CanvasModals.tsx`.

### 28.2 Helper — **correct**

`documentModalRoute.ts` (16 lines) calls `isDocumentPost(post)`, delegates capability to
`selectCardModalRoute(canEditWorkspace)`, and returns only the three governed values. Grep confirms
**no React, no state, no persistence, no role inference, and zero `svgUrl` occurrences** — the
discriminator is never duplicated (§26.3). Nothing is memoised; the function is a pure expression
evaluated per call.

Independently re-derived (8 probe groups, all passing):

| Input | editable | read-only |
|---|---|---|
| Document (`card`, no `svgUrl`) | `document-editor` | `document-viewer` |
| **clipart** (`card` + `svgUrl`) | **`null`** | **`null`** |
| text/note/todo/link/image/table/container/comment/drawing/ai-component | `null` | `null` |
| `null`/`undefined` post | `null` | `null` |

Also proved: **(9)** adding `metadata.svgUrl` flips the *next* result to `null` while the original
object still resolves as a Document — no global latch; **(10)** five interleaved
Document/clipart/editable/read-only calls return `['document-editor', null, 'document-viewer', null,
'document-editor']` — **no caching**; frozen post + frozen metadata are **not mutated**; and a
24-combination input sweep never escapes the three allowed return values.

### 28.3 State architecture — **one slice, as governed**

`CanvasClient` adds exactly one state variable,
`documentModalDestination: DocumentModalDestination | null` (`:511`). `isOpen` is `!== null`,
`readOnly` is `=== 'document-viewer'`. **No boolean pair, no duplicated editor/viewer payload, no dirty
state, no new persistence state.** The selected post remains the existing shared `padletToEdit`, so id,
title, content and complete metadata are carried by one object that every route assigns whole.

### 28.4 Closing contract — correct; **one non-blocking latent gap**

`onClose` clears `documentModalDestination` **and** `padletToEdit`, byte-consistent with all nine
incumbent editors in `CanvasModals`. It closes only the Document modal; Note/Card/clipart state is
untouched. No B2 lifecycle behaviour appears.

**Observation O4 (non-blocking) — two "close every editor" helpers do not reset the new slice.**
`handleToolClick`'s close-all block (`CanvasClient:5349-5360`) and
`closeDrawingEditorsBeforePadletEdit` (`:5729-5742`) enumerate editors explicitly and **omit**
`setDocumentModalDestination(null)`. Measured reachability: `DocumentEditor`'s overlay is
`fixed inset-0 z-[1000]` (identical to `NoteEditor:661`) and its backdrop handler saves-and-closes, so
the toolbar and canvas cannot be clicked while a Document modal is open — **no reachable collision
exists**, and clearing shared `padletToEdit` therefore cannot strand a second open modal. Recorded
because `closeDrawingEditorsBeforePadletEdit` previously *did* close the incumbent `CardEditor`
(`setIsCardEditorOpen(false)`), so this is a narrowing of an existing guard rather than new behaviour.
**PATCH-149B2 owns modal lifecycle and must add the destination to both helpers.**

### 28.5 O2 keyed remount — **PASS**, key proven load-bearing

`CanvasModals` renders `DocumentEditor` inside
`key={documentModalDestination ? \`document-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}\` : 'document-closed'}`
— the identical idiom used at `:147/:163/:192/:206/:237/:365/:398/:437`.

Independently proved with a byte-faithful replica of that wrapper around the **real** `DocumentEditor`:

- Switching to a **different Document with identical title *and* description** (`doc-a` → `doc-b`,
  both `"Same Title"` / `"Same Desc"`) **discards the in-progress draft** — the exact O2 corner.
- **Embedded negative control:** with the key removed, the same switch **leaks the draft**
  (`"unsaved draft title"` survives), because `DocumentEditor`'s primitive-dependency effect cannot
  fire when title and description are unchanged. The key is therefore genuinely load-bearing, not
  incidental.
- Key is **id-based, not title/description-based**: `document-doc-a` ≠ `document-doc-b` while both
  posts' title and description are equal.
- Closed→open and open→closed both change the key; `id: 'new'` maps to `document-new`.
- Same Document + a **freshly allocated** metadata object keeps the draft — B1b-i's F3 fix still holds
  through the wrapper.
- **No `documentId` prop was added** — `DocumentEditor.tsx` contains no `documentId` token and is
  byte-unchanged.

### 28.6 CanvasModals integration — **correct**

Imports `DocumentEditor`, renders it **exactly once**, and passes `isOpen`, `readOnly`, `title`,
`initialContent`, `metadata`, `onSave`, `onClose`. `metadata={padletToEdit?.metadata ?? null}` — the
governed hardening (§25.5), **not** a freshly allocated `{}`. Editable mode receives the real
`saveCard`; read-only receives a module-level `noopDocumentSave`, mirroring the existing
read-only `DrawingEditor` idiom (`:424`). Title/content/metadata come from the full selected post, never
Note-shaped data. `DocumentEditor` itself is untouched.

**Read-only has no reachable write path, proven two ways:** the wrapper's read-only branch exposes no
command surface and never invokes `onSave` (re-proved here — Close *and* backdrop both fire `onClose`
only, `onSave` zero times, `contenteditable="false"`), *and* the callback it would invoke is inert.

### 28.7 Central route — **correct**

The clipart branch (`:5706-5709`) is **textually unchanged** and still precedes Document handling. The
exact-Document branch (`:5710-5713`) now calls the helper and stores the destination; `setPadletToEdit(post)`
at `:5698` assigns the complete post. The branch contains **no** `setIsCardEditorOpen`,
`setIsCardViewerOpen`, `setIsNoteEditorOpen` or `setIsClipartDraftModalOpen`. Non-Document fallthrough
(`todo`/`link`/`table`/`container`/`comment`/`drawing`/`ai-component`/final `else`) is unchanged.

### 28.8 Direct-link and shared routes — **all inherit**

Traced at HEAD: direct `?openPadlet=` (`:344-351` → `openPadletInTypeEditorRef` → `:5691`) · context
menus (`openPadletTargetFromContextMenu:5719`) · Wall `onOpenTarget` · Timeline `onOpenTarget` · Map
`onEditPinPost` · Drawing `onPadletEdit` · Columns/Rows `onEditPost`/`onOpenTarget` ·
**ContainerEditor child open** (`CanvasModals:306 openPadletInTypeEditor(child)`). Every one funnels
into the single central function and inherits Document routing with **no duplicated branch**.

**Exhaustive bypass sweep:** every remaining live `setIsCardEditorOpen(true)` (3) and
`setIsNoteEditorOpen(true)` (8) call site was enumerated and individually cleared —
`FreeformPadletCards:429` and `:1777` are the clipart `else` arms; `:1826` is inside `{false && …}`
(dead, §25.1 row 15); `CanvasClient:3260`/`:3962`/`:5402` create `type: 'text'`; `:5714`, `:6492`,
`:6585` and `FreeformPadletCards:435` are guarded `else` arms; `:6744` is the container-guarded Drawing
path. **No live Document route bypasses the helper.**

### 28.9 Freeform router and CardPreview edit path — **both corrected**

`openFreeformPadletModal` (`:424-429`) and `CardPreview.onEditContent` (`:1768-1781`) each call the
helper first with `canUseFreeformEditButton` passed explicitly, store the complete post via
`setPadletToEdit(padlet)`, and open the Document destination. Neither opens `CardEditor` or
`NoteEditor` for a Document. **Clipart falls through byte-identically** — `openFreeformPadletModal`
keeps `setIsCardEditorOpen(true)`, `onEditContent` keeps its `selectCardModalRoute` editor/viewer
split. Non-Document types are untouched. `canUseFreeformEditButton` and `setDocumentModalDestination`
were correctly added to the `useCallback` dependency list.

### 28.10 C5 — **classification A: governance census correction only**

§25.1 C5 claimed `CanvasClient` passed a dead `openPadletInTypeEditor` prop to `FreeformPadletCards`.
**That finding was wrong, and this review confirms the implementer's correction.** Measured at HEAD:
the `<FreeformPadletCards>` JSX block contains **0** occurrences of `openPadletInTypeEditor`; the
identifier appears **0** times anywhere in `FreeformPadletCards.tsx`; and the prop at
`CanvasClient:5872` belongs to the **`<CanvasModals>`** element (which begins at `:5826`), where it is
genuinely consumed at `CanvasModals:90/123/306` for `ContainerEditor.onOpenChildPadlet`.

The original error was a **line-attribution mistake** — a `grep` hit inside the `CanvasModals` JSX was
attributed to the `FreeformPadletCards` element because §22.1 had recorded freeform as routing through
`openPadletInTypeEditor`. **There was no dead prop to remove**, so the implementer correctly performed
no removal. **§25.1 C5 is hereby struck**; §25.10 induced-failure item 5 and §25.14 carried item 4 are
void insofar as they rest on it. The substantive part of C2′ is unaffected: `FreeformPadletCards`
*does* contain its own complete duplicate router, which is why the two freeform bypasses were real and
have now been corrected.

**Lesson recorded:** a `grep -n` hit inside a large JSX region must be attributed to its enclosing
element by locating the element's opening tag, not by proximity to a remembered line number.

### 28.11 Columns and Rows — **corrected**

Both `onOpenPost` callbacks (`:6487-6493`, `:6580-6586`) now `setPadletToEdit(post)` (preserving id,
title, content and complete metadata), call the helper with the explicit capability boolean, open the
Document destination when non-null, and **fall through to the original `setIsNoteEditorOpen(true)`
unchanged** otherwise. Documents no longer reach `NoteEditor` or `SaveNoteData`. Actual Note posts are
**not** rerouted — NC14 (making Columns route unconditionally) is detected. Layout, ordering, DnD and
selection logic are untouched.

### 28.12 Drawing — **remains Document-unreachable**

`DrawingLayout.tsx` is byte-unchanged. `onEditPadletAsPost` (`:6741-6745`) still opens `NoteEditor`,
and `CanvasContextMenu:172` still gates it behind
`isContainerType && onEditPadletAsPost ? onEditPadletAsPost(padlet) : onEdit(padlet)` — a Document is a
non-container card, so it takes `onEdit` → `onPadletEdit` → the central router. The scoped test slices
that exact guard string. No duplicate Document branch was added.

### 28.13 Creation — **preserved**

`case 'document'` (`:5404-5423`) keeps the draft shape unchanged (`id:'new'`, `title:''`, `content:''`,
`type:'card'`, `metadata:{...createMetadata}`) and now sets `setDocumentModalDestination('document-editor')`
directly — always editable, matching the original's unconditional `setIsCardEditorOpen(true)`. No row is
inserted on open; `usePadletSave.ts` is byte-unchanged so `saveCard:980-999`'s blank-draft early return
still prevents orphans. No read-only creation path, no delete flow.

### 28.14 Title / content / metadata and capability — **preserved on all four families**

Every corrected family assigns the **whole post** to `padletToEdit` and lets `CanvasModals` read
`title`/`content`/`metadata` from it; no route reconstructs `{content, metadata}` or Note-shaped data.
NC9/NC10/NC11 (omitting title, metadata, content) are each detected. Metadata is passed by reference
and never mutated — proven with a frozen object through the helper, and `DocumentEditor` spreads rather
than mutates (§24.6).

All **five** helper call sites pass `canUseFreeformEditButton` explicitly; capability is never inferred
from callback presence, no new role model was introduced, and `selectCardModalRoute` remains the sole
authority (reused inside the helper). NC1 (editable→viewer) and NC2 (read-only→editor) are both
detected.

### 28.15 CardEditor and NoteEditor ownership — **clean**

No exact Document route reaches `CardEditor` via the central route, the Freeform router, the
`CardPreview` edit callback, Columns, Rows, direct link, read-only mode or creation (§28.8 sweep).
`CardEditor` remains reachable only for **clipart** and the dead `{false && …}` block — the preserved
C7 divergence, **not** a Document regression. No exact Document reaches `NoteEditor`; actual Notes
still do; `NoteEditor.tsx` and its characterization suite (11/11) are unchanged.

### 28.16 Clipart preservation — **byte-equivalent**

`isDocumentPost` excludes clipart; the helper returns `null` in **both** capability states; **no second
clipart predicate exists in production** — every `svgUrl` line in the commit is inside a *test* file,
and the helper's own source asserts zero occurrences. Clipart routes, labels, buttons, styling and
modal destinations are untouched; the C7 divergence is preserved exactly. Destination is recomputed
after a runtime `svgUrl` addition (§28.2 case 9). **No visible Document Read button exists yet** — a
scan of the commit for `>Read<`, `DocumentCardContent`, `onOpenDocument` or any overlay affordance
returns nothing.

### 28.17 `cardModalRoute.test.ts` — **correctly re-measured, not weakened**

The count moved `2 → 1`, matching an independent measurement of `selectCardModalRoute(` in
`CanvasClient.tsx`. It remains an **exact** `.toBe(1)` — not `>=`, not truthiness, not broad matching —
and the added comment states precisely why (the Document branch now delegates to
`selectDocumentModalDestination`, whose own reuse lives in a different file).

### 28.18 B1b-iii boundary — **respected**

No Read overlay, no semi-transparent preview button, no layout prop fan-out. `CardPreview.tsx`,
`PostCardContent.tsx`, `ColumnsLayout.tsx`, `RowLane.tsx`, `RowCanvasDnD.tsx`, `WallCanvas.tsx`,
`DrawingLayout.tsx` and `PostPopup.tsx` are all byte-unchanged; `DocumentCardContent.tsx` does not
exist. The only `FreeformPadletCards` change is routing, as §27.5's exception permits.

### 28.19 Recovery disclosure — **NON-BLOCKING**, verified independently

The implementer disclosed that induced-failure preparation discarded uncommitted work which was then
re-applied. This review did **not** rely on that narrative. Verified instead:

- `git diff HEAD` across all four production files is **empty** — the working tree equals the committed
  tree;
- the parent-version pattern `if (selectCardModalRoute(canUseFreeformEditButton) === 'editor') setIsCardEditorOpen(true);`
  appears **nowhere** in `CanvasClient.tsx` — no parent content survived;
- every re-applied branch is covered: central route, creation, Columns, Rows, both Freeform bypasses,
  `CanvasModals` integration and the key — each has a dedicated test and a dedicated negative control,
  and each was independently re-proved failing at `937d931`;
- the worktree contains **no** implementation residue — no `.bak`, `.orig`, `__hidden` or stray file;
  only the five long-standing protected paths.

Independently re-running the swap and restoring with `git checkout HEAD --` reproduced all four
baseline hashes exactly, confirming the committed tree is self-consistent.

### 28.20 Test review — sound

Route assertions use **scoped slices** of the named function or callback bodies via an explicit
`slice(source, startMarker, endMarker)` helper that throws on a missing marker; a broken anchor fails
loudly rather than silently passing. Whole-file counting is used **only** where the governed assertion
is itself a whole-file property (`<DocumentEditor` rendered exactly once; `svgUrl` absent from the
helper) — never for a route branch. Helper tests exercise real behaviour, not source text. One line-ending
robustness fix (normalising CRLF before a multi-line marker search) is present and correct.

### 28.21 Validation — all green

Focused suite **208/208** (12 files) · full Vitest **74/74 files · 875/875 tests** ·
`npm run typecheck` exit 0 · **410** declarations · clean `.next` + `npx next build` exit 0 · bridge
exclusion **891** · `build:e2e` exit 0 with marker **`1`** and the `E2E_BRIDGE_BUILD` artifact present ·
ordinary `.next` restored, exclusion re-verified **891**, marker **absent** · `git diff --check` exit 0 ·
worktree shows only the five protected paths.

### 28.22 Induced failures — 7/7 reproduced at `937d931`

1. `documentModalRoute.ts` absent · 2. central Document branch opens `CardEditor` · 3. Freeform router
opens `CardEditor` · 4. `CardPreview.onEditContent` opens `CardEditor` · 5. Columns opens `NoteEditor` ·
6. Rows opens `NoteEditor` · 7. `CanvasModals` contains **0** `DocumentEditor` references. Confirmed by
direct source inspection **and** by running the governed suite against the parent tree (14 failures,
plus the helper module unresolvable). All resolved at `510aa8d`; all four files hash-restored.

### 28.23 Negative controls — **16/16 detected, 16/16 reverted hash-identical**

| # | Perturbation | Detected |
|---|---|---|
| 1 | editable Document → viewer | 7 fails |
| 2 | read-only Document → editor | 4 fails |
| 3 | classify clipart as Document | 8 fails |
| 4 | central Document route → CardEditor | 3 fails |
| 5 | Freeform Document route → CardEditor | 2 fails |
| 6 | CardPreview edit route → CardEditor | 1 fail |
| 7 | Columns Document → NoteEditor | 1 fail |
| 8 | Rows Document → NoteEditor | 1 fail |
| 9 | omit title | 1 fail |
| 10 | omit metadata | 1 fail |
| 11 | omit content | 1 fail |
| 12 | remove keyed wrapper | 1 fail |
| 13 | fail to clear selected Document | 1 fail |
| 14 | route a Note through DocumentEditor | 1 fail |
| 15 | cache the destination | **16 fails** |
| 16 | add a second clipart guard | 1 fail |

Run against the governed suite **and** this review's independent probes. Post-revert hashes:
`documentModalRoute.ts` `add2a6cf…`, `CanvasClient.tsx` `9d450ef8…`, `CanvasModals.tsx` `c42eeeeb…`,
`FreeformPadletCards.tsx` `719b4ed7…` — all **MATCH** baseline.

### 28.24 False-green review

None of the fourteen rejection triggers fired: all four Document bypasses corrected · no live Document
route bypasses the helper · title/content/metadata carried · Columns/Rows no longer use `NoteEditor`
for Documents · `CardEditor` unreachable for Documents · clipart behaviour unchanged · no second
discriminator · key present and id-based · selected Document cleared safely · no B1b-iii UI · no B2
behaviour · no persistence change · no PDF code · route tests use branch slices, not loose matching.

### 28.25 Observations (non-blocking)

1. **O4** — `handleToolClick` and `closeDrawingEditorsBeforePadletEdit` omit
   `setDocumentModalDestination(null)`; unreachable behind the full-screen overlay today, **B2 must add
   it** (§28.4).
2. **C5 struck** — §25.1's dead-prop finding was a line-attribution error; recorded so the mistaken
   census is not repeated (§28.10).
3. The central route's Document branch calls `setDocumentModalDestination(helper(...))` without a
   null-guard. Safe today because C1 guarantees every post reaching that branch is a Document (clipart
   is consumed above), so the helper cannot return `null` there — but it is the one call site whose
   correctness rests on an upstream invariant rather than a local check.
4. `DocumentEditor`'s overlay shares `z-[1000]` with `NoteEditor`; inherited from B1b-i, not introduced
   here.
5. Carried unchanged: the temporary save-on-close lifecycle (§22.4) must not survive B2;
   `CardEditor`'s six handler-less toolbar buttons; the C7 clipart divergence; `FreeformPadletCards`'s
   duplicate router (Document branch now corrected, rest recorded); `PostCardContent:611`'s
   pre-existing inline clipart predicate; the second canvas system (`LiveCanvas`).

### 28.26 Classification and status

**CLASSIFICATION 2 — PASS WITH NON-BLOCKING OBSERVATIONS. PATCH-149B1b-ii CLOSES.**

All four Document bypasses are corrected at the narrowest boundary, the helper is genuinely pure and
uncached, the O2 identity corner is closed by a key this review proved load-bearing, and title, content,
complete metadata and capability survive every route. Clipart is untouched in production and excluded
structurally. Scope is exact, every budget respected, and the recovery incident left the committed tree
clean and fully covered. The observations are a lifecycle gap B2 already owns, a governance census
correction, and recorded context.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, §23/§24) |
| **PATCH-149B1b-ii** | **CLOSED** (`510aa8d`, reviews §25–§26 authored, §28 closure) |
| **PATCH-149B1b-iii** | **RELEASED FOR IMPLEMENTATION** — authorized in §27; not started. Re-verify O2 per §25.2 when threading layout props |
| **PATCH-149B2** | **BLOCKED until B1b-iii closes** — must also close O4 (§28.4) |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-152** | **NOT RESERVED** — unchanged |

No implementation file was modified by this review. Nothing was pushed.

---

## 29. PATCH-149B1b-iii — INDEPENDENT CLOSURE REVIEW · **CLASSIFICATION 4 · CORRECTION REQUIRED**

**Reviewed:** 2026-08-05 (independent closure reviewer). **Implementation commit:** `f841990`
`feat(document): add read affordance to document previews`. **Parent:** `cd791bf`.
Every figure below was re-measured or re-executed in this review; nothing is taken from the
implementer's report.

**The production implementation is correct on every product-contract dimension this review could
test.** It does not close, for two independent reasons: **three governed negative controls do not
hold** (§29.14) and **the Document body loses `metadata.textColor` on the interactive path**
(§29.6), a measurable deviation from §27.4's "exactly as `PostCardContent:915-931` does today".
Both corrections are small and neither requires re-architecture.

### 29.1 Source scope — **EXACT (15 files), one census correction**

`git show --numstat f841990` — 15 files, **367 insertions / 5 deletions**, matching the report.

Verified absent from the commit: any `.fable5` file · `DocumentEditor.tsx` and both its test files ·
`documentModalRoute.ts` · `documentPost.ts` · `NoteEditor.tsx` · `hooks/canvas/usePadletSave.ts` ·
`CanvasModals.tsx` · `package.json` / `package-lock.json` · schema/migrations · any PDF code · any
B2 lifecycle code. Each confirmed byte-unchanged against `cd791bf` by direct diff, not by assertion.
No modal-routing semantic change: `CanvasModals:152-163` — the keyed remount, `isOpen`, `readOnly`
and the `noopDocumentSave` split — is byte-identical to B1b-ii.

Every production file contains **only** shared affordance rendering, Document delegation, callback
threading or invocation of the existing B1b-ii route. No role check, no persistence call, no modal
state and no new predicate appears in any visual owner.

**Census correction:** the report states **114** production changed lines. Measured: **113
insertions + 5 deletions = 118** changed production lines (tests are 254, as reported). Both figures
sit far inside the ≤198 aggregate cap, so nothing turns on it, but the recorded number is 118.

### 29.2 Production-scope amendment — **VALIDATED, classification A**

Both extra files are genuine live render boundaries, and both were traced before being accepted.

**`components/canvas/layouts/ColumnsCanvasRow.tsx` — REQUIRED.** `ColumnsLayout.tsx`'s own single
`<PostCardContent>` (`:495`) is inside `<DragOverlay>` and is `pointer-events-none` — a drag ghost,
which must **not** carry the affordance and correctly does not. The live column card renders at
`ColumnsCanvasRow:449`. Without this file the handler reaches nothing in Columns. Change is 4 lines:
interface field, destructure, and the `<PostCardContent onOpenDocument={...}>` wiring.

**`components/map/MapCanvas.tsx` — REQUIRED.** `MapCanvas:796` is the only renderer of `<PostPopup>`;
`PostPopup` cannot receive a handler any other way. Change is 3 lines, pass-through only.

Neither file gained logic beyond threading. §27.5's abbreviated names were a governance census
error, not implementer scope growth — the same class as §28.10's C5 correction.

**Retrospective amendment to §27.5, effective now:**

| # | Path | Change | Actual | Amended max |
|---|---|---|---|---|
| 12 | `components/canvas/layouts/ColumnsCanvasRow.tsx` | thread handler to the live column card | 4 | **≤6** |
| 13 | `components/map/MapCanvas.tsx` | pass handler to `PostPopup` | 3 | **≤5** |
| 9 | `components/collabboard/canvas/layouts/DrawingLayout.tsx` | thread handler | 9 | **≤8 → ≤9** |

**B1b-iii production allowlist: 11 → 13 files. Aggregate cap ≤198 preserved and satisfied (118).**
Classified as a census / render-owner correction. **No implementation correction is required on
scope.**

### 29.3 Drawing dependency line — **VALIDATED**

`renderEmbeddable` (`DrawingLayout:2218-2253`) captures `onOpenDocument` in the `DrawingEmbeddableCard`
it returns. `openDocumentFromPreview` is a plain function body in `CanvasClient` — **not** memoized —
so it takes a new identity every render and closes over `canUseFreeformEditButton`. Omitting it from
the dependency array would let Drawing route through a stale capability after any permission change:
the wrong modal for the wrong user. The ninth line is neither formatting nor avoidable without
reducing correctness. Context-menu routing is untouched — `CanvasContextMenu:172`'s
`isContainerType && onEditPadletAsPost` guard is unchanged and slice-asserted. **Cap amended to ≤9.**

Recorded, non-blocking: `DrawingLayout:811-813` already carries an idiom for exactly this problem —
`onPadletEditRef`, commented "Ref so renderEmbeddable can call onPadletEdit without adding it to
deps". Adding an unstable callback to the array instead defeats that memoization on every
`CanvasClient` render. Correct, but a second idiom where the file already had one (P6).

### 29.4 `DocumentCardContent` architecture — **sound**

53 lines. Single shared visual implementation; both owners delegate to it. `content` supplied →
body **and** button (`PostCardContent`); `content` omitted → button only, layered over
`CardPreview`'s own preview. Opt-in strictly via `onRead`.

Confirmed absent: capability logic, role checks, persistence, modal state, `isDocumentPost`,
`svgUrl` / `isClipart` / any clipart discriminator, PDF behaviour. The source suite asserts the last
two directly and both assertions were proven load-bearing (§29.14 NC10).

The optional-`content` design does **not** create two inconsistent UI modes: the button markup,
`aria-label`, `type` and click semantics are identical in both, and only the caller-supplied
`className` differs (larger inset-x pill inside a card body; smaller bottom-right pill over a
freeform preview). The one real inconsistency it does introduce is §29.6.

### 29.5 Visual affordance and accessibility — **PASS**

Real `<button type="button">`, visible label `Read`, accessible name `aria-label="Read document"`,
natively keyboard-focusable, no `tabindex="-1"`. Visible without hover — the class list contains no
`opacity-0`, unlike the two existing pencils at `CardPreview:139` and `:150`, which are
`opacity-0 group-hover:opacity-100`. Semi-transparent `bg-black/40` deepening to `bg-black/60` on
hover **and** `focus-visible`, plus a `focus-visible:outline-2 outline-white` ring.
`pointer-events-auto` re-enables interaction on the button alone inside the
`pointer-events-none select-none` preview.

Preview content stays visible — the overlay is `absolute` at `bottom-2`, never replacing the body.
Styling matches the existing house treatment (`ColumnsLayout:480`'s "Add section" control uses the
same `bg-black/40 hover:bg-black/60` pair). Not confusable with a destructive or edit-only action:
it is a labelled text button, while every edit affordance in these owners is an unlabelled `Edit2`
pencil icon.

### 29.6 Body fidelity — **FINDING, correction required**

`PostCardContent`'s TEXT/DEFAULT branch (`:926-941`) renders the body with
`color: padlet.metadata?.textColor || "#1F2937"`. `DocumentCardContent` reproduces the wrapper,
classes, `WebkitLineClamp: 12`, overflow rules and the identical
`DOMPurify.sanitize(decodeHtmlEntities(rawContent || ""))` pipeline — **but drops the `color`
declaration.**

§27.4 requires the new component render the body "exactly as `PostCardContent:915-931` does today";
A-5 requires "sanitized and line-clamped exactly as before". It does not.

Consequence: the same Document renders **with** its text colour in presentation, the container
editor and any other handler-less surface (default branch) and **without** it in Columns, Rows,
Drawing and Map (Document branch). Latent today — no card editor writes `metadata.textColor`
(`CardEditor.tsx` and `DocumentEditor.tsx` never reference it; only `NoteEditor:626` does) — but it
is a live divergence the moment a Document carries the field, and it is the kind of split that is
very hard to attribute later.

Undetected because **no test asserts the body at all on the handler-supplied path**: the only body
assertion (`DocumentCardContent.test.tsx:62`) runs the *no-handler* case, which never reaches
`DocumentCardContent`. **Fix: one line in `DocumentCardContent` plus one assertion.**

### 29.7 Event handling — **PASS**

Click invokes the handler exactly once and the parent `onClick` zero times
(`DocumentCardContent.test.tsx:41-57`, proven load-bearing by NC6). The existing `onEditContent`
pencil does not co-fire (`:82-89`, proven by NC5). Prevention is local: a single
`e.stopPropagation()` inside the button's own `onClick`; no global handler, no capture-phase
interception, no `preventDefault`. Keyboard activation is the browser default for a real `<button>`.

**Pointer/mousedown propagation is deliberately not stopped, and this is correct in every live
owner.** Freeform already calls `e.stopPropagation()` in the card wrapper's own `onMouseDown`
(`FreeformPadletCards:1746-1749`) before any drag begins; Columns, Rows and Wall attach dnd-kit
`listeners` to an ancestor wrapper, where a `mousedown` reaching the button would at most begin a
drag the subsequent `click` still resolves; `PostPopup:64-73` stops `mousedown`/`pointerdown`
wholesale for Mapbox. No reachable drag conflict was demonstrated — **non-blocking**.

### 29.8 `PostCardContent` — **PASS**

Clipart early-return remains first at `:898`; the AI branch remains at `:920`; the Document branch
sits between them, gated `isDocumentPost(padlet) && onOpenDocument`, delegating only. Non-Documents
and handler-less Documents fall through to the untouched TEXT/DEFAULT return. 12/12 lines, exactly
at cap, no inline rendering. Note, todo, link, image and ai-component were each mounted **with** a
handler and render no button.

### 29.9 `CardPreview` / Freeform — **PASS, one latent note**

`CardPreview`'s clipart branch returns at `:125`, before the overlay ever mounts. The shared
component is rendered once; no duplicate overlay exists in the file. `onEditContent` and
`onOpenToolbar` are unchanged, as is B1b-ii's destination selection inside `onEditContent`.
Freeform builds the handler from `selectDocumentModalDestination(padlet, canUseFreeformEditButton)`
and passes `undefined` when it returns `null` — no new predicate, no new state.

The second `CardPreview` call site (`FreeformPadletCards:6063`, the card-toolbar preview) correctly
receives no handler.

Latent, non-blocking: `CardPreview` has **no local `isDocumentPost` gate** — it renders the overlay
whenever a handler is supplied, delegating the Document decision entirely to the caller's route
helper. Correct today because the one live caller gates properly, and it is what keeps the file free
of a second predicate (§27.6 A-12) — but §27.4's "gated identically" is satisfied by the caller, not
by the file.

### 29.10 Columns · Rows · Wall · Drawing · Map — **all traced to the live renderer**

| Layout | Chain re-traced | Result |
|---|---|---|
| Columns | `CanvasClient:6503` → `ColumnsLayout` → `ColumnsCanvasRow:449` → `PostCardContent` | live; complete `post` passed |
| Rows | `CanvasClient:6597` → `RowCanvasDnD` → `RowLane:508` → `PostCardContent` | live; complete `post` passed |
| Wall | `CanvasClient:6651` → `WallCanvas` | **no live target** — see below |
| Drawing | `CanvasClient:6736` → `DrawingLayout` → `DrawingEmbeddableCard:665` → `PostCardContent` | live; complete `padlet` passed |
| Map | `CanvasClient:6894` → `MapCanvas:796` → `PostPopup:177` → `PostCardContent` | live; complete `post` passed |

Every wiring uses `onOpenDocument ? () => onOpenDocument(post) : undefined` — the complete post
object, never a reconstruction, never an id-only projection. Drag, ordering, selection, popup close
and context-menu behaviour are untouched in all five; the only diff lines are interface fields,
destructures and the pass-through itself. The three `<PostCardContent>` renders inside `DragOverlay`
(`ColumnsLayout:495`, `WallCanvas:735`, `RowCanvasDnD:395`) correctly receive no handler.

**Wall — the implementer's report is accurate.** Verified independently and doubly:
`CanvasClient:1344-1348` filters `wallOrderedPadlets` to `rootContainers` only, and
`WallCanvas:154/201` renders `null` for any non-container. `WallCanvas`'s single changed line adds
the prop to `WallCanvasProps` **and nothing else** — it is never destructured (`:216-231`) and never
consumed. No false render path was fabricated and no dead UI was added; the interface is ready if a
Document render path becomes live. **Non-blocking architecture observation, correctly disclosed.**

Recorded: the source suite's `OWNER_FILES` loop asserts only that the string `onOpenDocument`
*appears* in `WallCanvas.tsx`. It passes on a declaration that is never consumed, so for Wall it
proves nothing about wiring. Harmless while Wall has no Document surface; it must not be mistaken
for A-9 coverage there.

### 29.11 `CanvasClient` — **PASS**

One function, `openDocumentFromPreview` (`:5719-5727`), reusing B1b-ii's helper and both state
setters. No duplicated `selectDocumentModalDestination`, no new modal state, no role inference, no
selected-post state, no `DocumentEditor` or lifecycle change. Passed unchanged to all five
interactive owners — `onOpenDocument={openDocumentFromPreview}` occurs **exactly 5 times**,
independently re-counted. Capability stays explicit at this owner, exactly as §27.4 requires.

### 29.12 Editable and read-only routes — **both PASS**

Proven through the real `DocumentEditor` in a harness that mirrors `CanvasModals`' wiring, not
through mocks.

Editable: Read is visible, click passes the complete Document, `selectDocumentModalDestination`
returns `document-editor`, the modal renders `readOnly={false}`, the title input
(`placeholder="Untitled document"`) is present and the §22.4 temporary save-on-close lifecycle is
untouched.

Read-only: Read is visible — **the same button, from the same code path** — click passes the same
complete Document, the helper returns `document-viewer`, the modal renders `readOnly={true}` with
**no** title input, **no** description input, **no** toolbar, **no** Save control and no exposed
command surface, and Close invokes the persistence callback **zero** times. `contenteditable="false"`
is asserted **in addition to** command-surface absence, never alone (§22.16). Backdrop and the
remaining read-only guarantees are carried by `DocumentEditor.readonly.test.tsx` 6/6, re-run green
and byte-unchanged.

### 29.13 Clipart · passive safety · O2 identity

**Clipart — PASS, structurally excluded twice.** `PostCardContent:898` returns before the Document
branch; `CardPreview:125` returns before the overlay. No added production line contains `svgUrl`,
`isClipart`, `clipartUrl` or any equivalent — the single occurrence in the whole diff is the
`clipart()` **test fixture**, which the exclusion test requires. `ClipartCardDraftModal.tsx` is
byte-unchanged. No clipart button, styling, ordering or route was altered.

**Passive safety — PASS by construction.** All five passive `PostCardContent` call sites were
inspected directly and none supplies a handler: `FullscreenPresentation:316`,
`createSlideRenderer:192`, `ContainerEditor:395`, `RowColumnContainerCard:407`, `WallLayout:37`
(plus the second canvas system's `ColumnsLayoutRenderer`, `GridLayoutRenderer`, `ColumnsSection`,
`SortablePadlet`, `PadletComponent`). No handler → preview still renders, no button, no fake
disabled control, no exception.
**Recorded gap:** §27.6 **A-10** required a *test* asserting this. None exists — the source suite
never inspects the presentation or container-editor call sites. The property holds today; it is
undefended.

**O2 identity — PASS in production, undefended at one owner.** Every handler receives the original
post; no layout reconstructs a partial. Two Documents with identical title and description resolve
to distinct ids through independent handlers. `CanvasModals:152-154`'s
`document-${padletToEdit?.id}` key is unchanged and remains load-bearing — which is precisely why
§29.14 NC8b matters. No new identity prop and no metadata-derived identity was introduced.

### 29.14 Negative controls — **9 of 13 detected; three governed controls DO NOT HOLD**

Thirteen controls were applied independently (§27.7's ten plus the review directive's variants),
each run against both new suites, each reverted from a pre-taken backup and **all 15 files
SHA-256-verified identical after every single one**. Restoration is exact.

| # | Control | Result |
|---|---|---|
| 1 | Read overlay added to `CardPreview`'s clipart branch | **DETECTED** (1) |
| 2 | Document gate widened to any type (Note) | **DETECTED** (3) |
| 3a | Read handler hidden from read-only users — **Freeform owner** | **NOT DETECTED** |
| 3b | Read handler hidden from read-only users — **`CanvasClient` owner** | **NOT DETECTED** |
| 4 | Capability inferred (`selectDocumentModalDestination(post, true)`) | **DETECTED** (1) |
| 5 | Read also fires `onEditContent` | **DETECTED** (1) |
| 6 | `stopPropagation` removed | **DETECTED** (1) |
| 7 | Button rendered unconditionally (presentation leak) | **DETECTED** (4) |
| 8a | `setPadletToEdit(padlet)` dropped — Freeform | **DETECTED** (1) |
| 8b | `setPadletToEdit(post)` dropped — **`CanvasClient`** | **NOT DETECTED** |
| 9 | Shared component replaced by a faithful inline duplicate in `CardPreview` | **NOT DETECTED** |
| 10 | Second clipart discriminator added to `DocumentCardContent` | **DETECTED** (1) |
| 11 | `<button>` replaced by `<div role="presentation">` | **DETECTED** (6) |

**This contradicts the implementer's reported 10/10.** That figure was reached against
self-retargeted perturbations; three governed defect surfaces are genuinely undefended.

**NC3 — the patch's central product contract is untested at the owners.** §27.3 makes the button
capability-**independent** and §27.7 #3 makes "hide it for read-only users" a mandatory control.
Gating the handler on `destination === 'document-editor'` in **either** owner ships **21/21 green**.
A-2 is proven only inside a test-local harness that supplies the handler unconditionally — it never
exercises the owners' handler construction. A future edit that hides Read from read-only users would
pass every check in this patch.

**NC8b — O2 identity is undefended at the owner that serves four of the six layouts.** Deleting
`setPadletToEdit(post)` from `openDocumentFromPreview` ships green. Because `CanvasModals` keys the
Document modal on `padletToEdit?.id`, the live consequence is that Read in Columns, Rows, Drawing or
Map opens **whatever document was last selected** — wrong content, or a stale/blank modal. The
implementer added exactly this assertion for Freeform (NC8a detects) and did not carry it to
`CanvasClient`.

**NC9 — the shared-component contract is undefended.** A byte-faithful inline `<button>` in
`CardPreview` — same `aria-label`, same `stopPropagation`, same classes — ships green. Nothing
asserts `CardPreview` delegates to `DocumentCardContent`. §27.4's single-implementation requirement
therefore rests on inspection alone. Lowest severity of the three, but it is a governed control.

**No test was weakened around any control.** These are gaps that were never closed, not regressions.

### 29.15 Induced failures — **5/5 reproduced at `cd791bf`**

Run in two attributable stages, from a pre-taken backup, with all 15 hashes verified identical
afterwards.

Stage A — `PostCardContent` and `CardPreview` reverted to parent, `DocumentCardContent.tsx` removed:
`documentAffordance.source.test.ts` fails to collect (**IF1** — module absent);
`DocumentCardContent.test.tsx` **6 failed / 3 passed**, comprising the `CardPreview` Document case
(**IF2**), the interactive `PostCardContent` branch and identity cases (**IF3**), and both harness
capability cases (**IF5** — read-only users have no visible Document-opening affordance).

Stage B — the nine owner files and `CanvasClient` reverted to parent: source suite **8 failed / 4
passed**, every owner-threading and `CanvasClient` assertion failing (**IF4**).

At `f841990` all five are resolved.

### 29.16 Validation — all green

Focused (`CardPreview` · `CardEditor` · `ClipartCardDraftModal` · NoteEditor characterization ·
`DocumentCardContent` · affordance source): **6/6 files, 124/124 tests**. Document family
(`documentPost` · `cardModalRoute` · `documentModalRoute` · `DocumentEditor` 17/17 ·
`DocumentEditor.readonly` 6/6 · both new suites): **7/7 files, 75/75**.
**Full Vitest: 76/76 files, 896/896 tests** — exactly the expected totals (74+2, 875+21).
`npm run typecheck`: **exit 0**, **410** declarations. `.next` cleared · `npx next build` exit 0 ·
bridge exclusion **891 files**, marker absent · `npm run build:e2e` exit 0, `.next/E2E_BRIDGE_BUILD`
= **`1`** · ordinary `.next` restored, exclusion **891**, marker absent. `git diff --check` exit 0.
Worktree outside committed history: only the five long-standing protected paths.

### 29.17 False-green review

Read appears for both capabilities · read-only opens the viewer · clipart never receives Read ·
passive presentation never receives Read · the visual implementation is not duplicated · no live
Document layout lacks the callback · the complete post reaches every handler · Read never co-fires
edit · callback presence is never used as permission · modal routing is not duplicated · no B2,
persistence or PDF code appears · both extra files contain threading only · Drawing's ninth line is
necessary · no test was weakened. **The implementation passes every false-green criterion.** What it
does not pass is the evidence bar: §27.7 requires each control to be detected, and three are not.

### 29.18 Required corrections

Production — one line:

1. Restore `color: padlet.metadata?.textColor || '#1F2937'` to `DocumentCardContent`'s body style
   (§29.6). `DocumentCardContent.tsx` is 53/70; the cap absorbs it.

Test evidence — four assertions:

2. Assert both owners construct the Read handler **without** consulting capability (closes NC3).
3. Assert `setPadletToEdit(post)` inside `openDocumentFromPreview`'s slice (closes NC8b).
4. Assert `CardPreview` renders `<DocumentCardContent` (closes NC9).
5. Assert the Document body renders sanitized and line-clamped **with** a handler supplied, and
   carries the text colour (defends §29.6, closes the A-5 gap).

Recommended, not required: an A-10 assertion that the presentation and container-editor call sites
supply no handler (§29.13).

**Test budget:** 254/260 is nearly exhausted. The test cap is therefore amended from **≤260 to
≤290** for these five additions only. No production cap changes beyond §29.2.

The corrections are additive and touch no closed file. Everything in §29.1–§29.13 and §29.15–§29.16
is accepted as re-verified and must **not** be re-litigated in the correction turn.

### 29.19 Observations (non-blocking)

1. `DrawingLayout` now carries two idioms for keeping `renderEmbeddable` current — the pre-existing
   `onPadletEditRef` and the new dependency entry — and the latter defeats that memoization on
   every `CanvasClient` render (§29.3). Making `openDocumentFromPreview` a `useCallback`, or
   mirroring the ref, would resolve both. Recorded for B2's consideration; not required here.
2. `CardPreview` has no local Document gate; correctness rests on its single caller (§29.9).
3. `WallCanvas`'s prop is accepted and discarded; the source suite's string check cannot tell that
   apart from wiring (§29.10).
4. §27.6 **A-10** has no test (§29.13).
5. Production census is **118**, not the reported 114 (§29.1).
6. Carried unchanged from §28.25: **O4** remains open and is B2's (§28.4) — correctly untouched
   here · the central route's unguarded `setDocumentModalDestination(helper(...))` ·
   `DocumentEditor`'s shared `z-[1000]` · the temporary save-on-close lifecycle (§22.4) ·
   `PostCardContent:611`'s pre-existing inline clipart predicate · C7 · the second canvas system.

### 29.20 Classification and status

**CLASSIFICATION 4 — OPEN · IMPLEMENTATION CORRECTION REQUIRED.**

The scope deviations are **validated and retrospectively amended** (§29.2, §29.3) — they were a
governance census error, not scope growth, and required no implementation change. The affordance
itself is right: one shared component, capability-blind button, capability-explicit route, clipart
excluded twice, presentation safe by construction, the complete post preserved end to end. B1b-iii
does not close because three governed negative controls do not hold and the body drops
`metadata.textColor`. Both are narrow, additive fixes.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, §23/§24) |
| **PATCH-149B1b-ii** | **CLOSED** (`510aa8d`, §28) |
| **PATCH-149B1b-iii** | **OPEN · CORRECTION REQUIRED** — implemented at `f841990`; scope amended (§29.2/§29.3); five corrections listed in §29.18; test cap ≤290 |
| **PATCH-149B2** | **BLOCKED — B1b-iii has not closed**; must also close O4 (§28.4) |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-152** | **NOT RESERVED** — unchanged |

No implementation file was modified by this review. Nothing was pushed.

---

## 30. PATCH-149B1b-iii — CORRECTIVE SCOPE AMENDMENT · **F4 REQUIRES TWO FILES**

**Authored:** 2026-08-05 (governance architect), on an implementation hard stop. **Base:** `e8729c7`.
No production or test file was modified in this turn.

### 30.1 Hard-stop report — **CORRECT, and the fault is governance's**

The correction engineer stopped with **B — HARD STOP, GOVERNANCE AMENDMENT REQUIRED** before
touching any file, and returned a clean worktree. The stop is **upheld**: §29.18's one-file
authorization was unsatisfiable, and the engineer was right not to spill into a second file to make
it work.

Re-verified at `e8729c7`:

- `DocumentCardContentProps` (`DocumentCardContent.tsx:5-13`) is exactly
  `{ content?: string; onRead?: () => void; className?: string }`. **No post, no metadata, no colour
  of any kind reaches this component.**
- Only **two** production call sites exist. `PostCardContent.tsx:915` is the sole one that passes
  `content`, i.e. the only site that renders a body:
  `<DocumentCardContent content={DOMPurify.sanitize(decodeHtmlEntities(rawContent || ""))} onRead={onOpenDocument} />`.
  `CardPreview.tsx:192` passes `onRead` and `className` only — its Document branch is icon, title
  and word-counter, with **no body text at all**.
- Therefore F4 is unreachable from inside `DocumentCardContent.tsx`. Honouring
  `metadata.textColor` requires a value to arrive, and the only place a real value can originate is
  the `PostCardContent` delegation site.

**§29.18 correction #1 was mis-worded and is hereby corrected.** It read "Restore
`color: padlet.metadata?.textColor || '#1F2937'` to `DocumentCardContent`'s body style", which
presumes `padlet` is in scope in that file. It is not, and never was — §27.4 deliberately kept the
component post-free. The defect finding in §29.6 stands unchanged and fully verified; only the
prescribed remedy was wrong. Recorded in the same spirit as §28.10's C5 strike, so the mistaken
census is not repeated.

**No implementer error occurred.** Nothing was implemented, nothing was amended, nothing was pushed.

### 30.2 Corrective production allowlist — **11 → 13 files stands (§29.2); the *correction* uses two**

The B1b-iii **implementation** allowlist remains the 13 files amended in §29.2. This section
authorizes only the **corrective delta** on top of `f841990`, which may touch exactly these two:

| # | Path | Corrective change | Max delta |
|---|---|---|---|
| 1 | `components/collabboard/DocumentCardContent.tsx` | accept `textColor` and apply it to the body style | **≤8 changed lines** |
| 2 | `components/collabboard/PostCardContent.tsx` | pass `textColor` at the **existing** delegation site only | **≤4 changed lines** |

**Maximum corrective production total: ≤12 changed lines across two files.**

`DocumentCardContent.tsx` is 53 lines against §27.5's ≤70 file cap; the ≤8 delta fits without
touching that cap. `PostCardContent.tsx` remains over the 800-line ceiling, so its ≤4 delta is a
**prop pass-through at the existing call site and nothing else** — no new branch, no new logic, no
second delegation.

**No other production file may change.** Specifically unchanged: `CardPreview.tsx` ·
`FreeformPadletCards.tsx` · `CanvasClient.tsx` · `ColumnsLayout.tsx` · `ColumnsCanvasRow.tsx` ·
`RowLane.tsx` · `RowCanvasDnD.tsx` · `WallCanvas.tsx` · `DrawingLayout.tsx` · `PostPopup.tsx` ·
`MapCanvas.tsx` · `DocumentEditor.tsx` and both its test files · `documentModalRoute.ts` ·
`documentPost.ts` · `NoteEditor.tsx` · `usePadletSave.ts` · `CanvasModals.tsx` · package files ·
schema · `.fable5`.

### 30.3 Test allowlist — **unchanged from §29**

| Path | Cap |
|---|---|
| `components/collabboard/DocumentCardContent.test.tsx` | — |
| `lib/domain/canvas/documentAffordance.source.test.ts` | — |

**Aggregate test cap remains ≤290 changed lines** (currently 254: 140 + 114). **No third test file.**

### 30.4 `textColor` prop contract

`DocumentCardContent.tsx` gains:

```
textColor?: string | null;
```

applied as `textColor || '#1F2937'` — the incumbent-equivalent expression from
`PostCardContent`'s TEXT/DEFAULT branch (`:937`). The runtime shape on `Padlet['metadata']` is
`textColor?: string` (`types/collabboard.ts:152`, `:159`); `| null` is permitted tolerance for
null-bearing metadata records and costs nothing.

`PostCardContent.tsx` passes exactly `textColor={padlet.metadata?.textColor}` at its existing
`<DocumentCardContent>` delegation, and nowhere else.

**Required behaviour:**

- an explicitly supplied `metadata.textColor` is applied to the interactive Document body;
- missing, `null` or empty `textColor` falls back to **`#1F2937`**;
- handler presence changes **only** whether Read appears — never body fidelity;
- the sanitiser (`DOMPurify.sanitize(decodeHtmlEntities(...))`) is unchanged;
- body typography, `WebkitLineClamp: 12`, overflow rules and both wrapper `div`s are unchanged;
- the Read button's markup, `aria-label`, `type`, click semantics and styling are unchanged;
- passive / TEXT-DEFAULT rendering in `PostCardContent` is unchanged;
- **`CardPreview` remains button-only and does not pass `textColor`** — it renders no body, so
  there is nothing to colour. Passing it there would be scope growth and is a false-green
  condition (§30.7).

**The prop is presentation-only.** It must not mutate metadata, inspect capability, inspect post
type, inspect `svgUrl`, add persistence, or introduce a new colour model. Colour handling stays in
exactly one place: the shared component, fed by the one owner that renders a body.

### 30.5 T1–T4 remain required, unchanged

The amendment resolves the F4 mechanism only. **All four test protections from §29.18 remain
mandatory and blocking**, and B1b-iii does not close until each is load-bearing:

**T1 — owner capability-blindness.** Prove the Read handler is supplied to read-only users at the
**actual owners** (`FreeformPadletCards`'s local handler and `CanvasClient`'s
`openDocumentFromPreview`), not merely inside a component harness that hands `onRead` in by hand.
The test must fail when an owner is changed to supply the handler only for
`destination === 'document-editor'`. This is §27.3's central product contract and it is currently
undefended (§29.14 NC3a/NC3b).

**T2 — selected-document assignment.** A scoped slice of `openDocumentFromPreview`'s body must
require **both** `setPadletToEdit(post)` **and** `setDocumentModalDestination(destination)`. Whole-file
occurrence counts are forbidden. The existing Freeform-specific `setPadletToEdit(padlet)` proof is
retained, not replaced. Load-bearing because `CanvasModals:152-154` keys the Document modal on
`padletToEdit?.id` (§29.14 NC8b).

**T3 — shared delegation.** A scoped slice of `CardPreview`'s Document branch must require
`DocumentCardContent` **and** reject a byte-faithful inline duplicate. Asserting that the string
`DocumentCardContent` appears somewhere in the file is insufficient (§29.14 NC9).

**T4 — interactive body fidelity.** Behavioural, real-DOM, with **both** `content` and `onRead`
supplied: explicit `textColor` honoured; absent `textColor` yields `#1F2937`; body visible; Read
button present; sanitiser and text rendering unchanged. **Source-string inspection of the rendered
colour is not acceptable proof** (§30.7).

Recommended but not blocking, carried from §29.13: an **A-10** assertion that the presentation and
container-editor call sites supply no handler.

### 30.6 Induced failures and negative controls

**Induced failure — demonstrable at `f841990`:**

1. an explicit `metadata.textColor` is dropped from the interactive Document body;
2. neither the `textColor` prop nor the call-site pass-through exists;
3. T1, T2 and T3's protections are absent or insufficient — each of the three governed
   perturbations ships green (independently reproduced in §29.14).

**Negative controls — nine, each detected and reverted byte-identically:**

1. omit `textColor` at the `PostCardContent` call site → T4 explicit-colour test fails;
2. ignore the supplied `textColor` inside `DocumentCardContent` → T4 explicit-colour test fails;
3. force the `#1F2937` fallback even when an explicit colour is supplied → T4 explicit-colour test
   fails (this control is what proves the value is genuinely plumbed and not hard-coded);
4. gate the Read handler on `destination === 'document-editor'` at an owner → T1 fails;
5. remove `setPadletToEdit(post)` from `openDocumentFromPreview` → T2 fails;
6. replace `CardPreview`'s delegation with a faithful inline duplicate → T3 fails;
7. remove `onRead` while retaining body → Read-presence assertion fails;
8. remove body content while retaining `onRead` → body assertion fails;
9. add a local `svgUrl` / clipart discriminator to `DocumentCardContent` → the existing
   no-second-discriminator test fails.

Controls 2 and 3 are **not** redundant: 2 proves the prop is read, 3 proves the incumbent
expression is `textColor || '#1F2937'` and not a constant.

### 30.7 False-green rejection

Reject the correction if:

- `textColor` is hard-coded, or defaulted in a way that never accepts the real value;
- `PostCardContent.tsx` is left outside the corrective allowlist and F4 is "solved" some other way;
- the full post or the whole `metadata` object is passed into `DocumentCardContent` — the prop must
  be the narrowest presentation value, not a post handle;
- `CardPreview.tsx` is modified for F4;
- colour handling appears in more than one owner;
- the rendered colour is proven only by inspecting source strings rather than the real DOM;
- any of T1, T2 or T3 remains undefended;
- routing semantics, B2 lifecycle, persistence, clipart or PDF behaviour changes;
- corrective production exceeds ≤12 lines or two files, or tests exceed ≤290 lines or two files.

### 30.8 Status

| Item | Value |
|---|---|
| **Corrective production allowlist** | **2 files** — `DocumentCardContent.tsx` (≤8), `PostCardContent.tsx` (≤4) |
| **Corrective production cap** | **≤12 changed lines** |
| **Test allowlist** | 2 files, unchanged from §29 |
| **Test cap** | **≤290 changed lines** (254 used) |
| **T1–T4** | **all four remain required and blocking** |

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, §23/§24) |
| **PATCH-149B1b-ii** | **CLOSED** (`510aa8d`, §28) |
| **PATCH-149B1b-iii** | **OPEN · CORRECTION AUTHORIZED AND UNBLOCKED** — implemented at `f841990`; review §29; corrective scope amended here; F4 + T1–T4 outstanding |
| **PATCH-149B2** | **BLOCKED — B1b-iii has not closed**; must also close O4 (§28.4) |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-152** | **NOT RESERVED** — unchanged |

No production or test file was modified in this turn. Nothing was pushed.

---

## 31. PATCH-149B1b-iii — FINAL CLOSURE REVIEW · **CLASSIFICATION 2 · CLOSED**

**Reviewed:** 2026-08-05 (independent closure reviewer). **Correction commit:** `0985bb7`
`fix(document): preserve preview styling and affordance routing guards`. **Implementation:**
`f841990`. **Governance:** §29 (review), §30 (corrective scope amendment).
Every figure below was re-measured or re-executed in this review.

**F4 is resolved and T1–T4 are all load-bearing, each proven by an independent perturbation this
review constructed rather than by re-running the implementer's own controls. PATCH-149B1b-iii
CLOSES.**

### 31.1 Correction scope — **EXACT, both caps respected**

`git show --numstat 0985bb7` — **4 files, 47 insertions / 8 deletions**, no new file, matching the
report exactly.

| File | Delta | Cap (§30.2/§30.3) |
|---|---|---|
| `components/collabboard/DocumentCardContent.tsx` | 4 / 1 | ≤8 ✓ |
| `components/collabboard/PostCardContent.tsx` | 1 / 1 | ≤4 ✓ |
| `components/collabboard/DocumentCardContent.test.tsx` | 21 / 0 | — |
| `lib/domain/canvas/documentAffordance.source.test.ts` | 21 / 6 | — |

**Corrective production aggregate 7 / ≤12.** Test files reach **290 / ≤290** — exactly at the
amended cap, nothing to spare.

Verified byte-unchanged between `f841990` and `0985bb7`: `CardPreview.tsx` ·
`FreeformPadletCards.tsx` · `CanvasClient.tsx` · `ColumnsLayout.tsx` · `ColumnsCanvasRow.tsx` ·
`RowLane.tsx` · `RowCanvasDnD.tsx` · `WallCanvas.tsx` · `DrawingLayout.tsx` · `PostPopup.tsx` ·
`MapCanvas.tsx` · `DocumentEditor.tsx` and **both** its test files · `CanvasModals.tsx` ·
`documentModalRoute.ts` · `documentPost.ts` · `hooks/canvas/usePadletSave.ts` · `package.json` ·
`package-lock.json` · schema. `0985bb7` touched **no** `.fable5` file.

### 31.2 Combined B1b-iii census — **13 files, 121 lines, every cap satisfied**

Re-measured `cd791bf → 0985bb7`, production only:

| File | Lines | Cap |
|---|---|---|
| `DocumentCardContent.tsx` | 56 | ≤70 ✓ |
| `PostCardContent.tsx` | **12** | ≤12 ✓ (at cap) |
| `CardPreview.tsx` | 4 | ≤25 ✓ |
| `FreeformPadletCards.tsx` | 4 | ≤10 ✓ |
| `ColumnsLayout.tsx` | 3 | ≤10 ✓ |
| `ColumnsCanvasRow.tsx` | 4 | ≤6 ✓ (§29.2) |
| `RowLane.tsx` | 4 | ≤10 ✓ |
| `RowCanvasDnD.tsx` | 3 | ≤10 ✓ |
| `WallCanvas.tsx` | 1 | ≤10 ✓ |
| `DrawingLayout.tsx` | 9 | ≤9 ✓ (§29.2) |
| `PostPopup.tsx` | 4 | ≤8 ✓ |
| `MapCanvas.tsx` | 3 | ≤5 ✓ (§29.2) |
| `CanvasClient.tsx` | 14 | ≤25 ✓ |

**Aggregate 121 / ≤198.** The §29.2 retrospective 13-file amendment **remains valid and is
confirmed**; the correction consumed none of the remaining headroom in any file it did not own.
`PostCardContent.tsx` sits exactly at its ≤12 cap — the correction modified an already-added line,
so the count did not grow.

### 31.3 F4 — **RESOLVED**

`DocumentCardContent.tsx` gains `textColor?: string | null` and applies
`color: textColor || '#1F2937'` as the final entry of the **body** style object, inside the
`content !== undefined` block. Semantics are byte-equivalent to `PostCardContent`'s TEXT/DEFAULT
branch (`color: padlet.metadata?.textColor || "#1F2937"`), including declaration order.

The Read button is untouched: its `className`, `aria-label`, `type`, `stopPropagation` and the
`className || <default overlay>` fallback are unchanged, and it carries **no** inline style at all.
No metadata object, post, capability, type, `svgUrl`, persistence or route logic entered the
component — the prop is a bare presentation value, the narrowest possible (§30.7).

`PostCardContent.tsx` changed **one line**: the existing delegation now reads
`<DocumentCardContent content={DOMPurify.sanitize(decodeHtmlEntities(rawContent || ""))} textColor={padlet.metadata?.textColor} onRead={onOpenDocument} />`.
No new branch, no second delegation. Sanitiser, clamp, typography, both wrappers, the clipart
early-return, the AI branch and the TEXT/DEFAULT branch are all unchanged.

**The §29.6 divergence is closed:** a Document now renders with identical body colour whether it is
reached through the interactive Document branch or the passive default branch.

**Behavioural result, re-verified in real DOM:** `#ff0000` → `rgb(255, 0, 0)`; `undefined`, `null`
and `''` each → `rgb(31, 41, 55)`; body content visible; Read button present; body markup byte-identical
with and without a handler; the colour lands on `.tiptap` and the button's `style` attribute is
`null`. `metadata.textColor` was additionally traced end-to-end through a real `PostCardContent`
mount.

### 31.4 T1 — **load-bearing at both owners**

**Freeform.** The scoped slice (between `onReadDocument={(() => {` and
`isSelected={isPadletSelected(padlet.id)}`) pins the exact capability-blind construction
`return d ? () => { setPadletToEdit(padlet); setDocumentModalDestination(d); } : undefined;` and
additionally rejects `/d\s*===\s*['"]document-(editor|viewer)['"]/`. Capability reaches only
`selectDocumentModalDestination(padlet, canUseFreeformEditButton)`, never the supply decision.
Independently detected **both** phrasings of the defect — an `=== 'document-editor'` ternary gate and
an inserted `if (d === 'document-viewer') return undefined;` guard.

**CanvasClient.** The scoped `openDocumentFromPreview` body positively requires
`if (!destination) return;` and rejects `/destination\s*!==?\s*['"]document-editor['"]/`. The callback
prop itself is passed to all five interactive owners unconditionally (exactly 5 occurrences,
re-counted); capability is resolved **inside** the callback. Independently detected the governed
defect written as `if (destination !== 'document-editor') return;`.

Neither proof relies on the component harness — the harness tests remain, but T1 is carried entirely
by owner-level source slices, as §30.5 required.

One narrow asymmetry is recorded in §31.9 O1.

### 31.5 T2 — **load-bearing**

The assertion slices the actual `openDocumentFromPreview` body (from the `const openDocumentFromPreview = (post: Padlet) => {`
declaration to `const openPadletTargetFromContextMenu`) and requires
`/setPadletToEdit\(post\);\s*setDocumentModalDestination\(destination\);/`. The whitespace-tolerant
form is correct and necessary — `CanvasClient.tsx` uses **CRLF**, so a literal `\n` match would
false-fail. No whole-file occurrence count is used for this property.

Independently detected deletion of `setPadletToEdit(post)` from the real callback body, **and** — a
bonus the contract did not require — detected reordering the two calls so the destination is set
before the selected post.

**A first attempt at this control did not fail, and the cause was the control, not the test:**
`setPadletToEdit(post);` occurs **five** times in `CanvasClient.tsx` and a first-occurrence replace
landed on `openPadletInTypeEditor` (`:5698`), never touching `openDocumentFromPreview` (`:5724`).
Re-anchored on the full unique callback body, the control detects immediately. Recorded because it
is exactly the mis-targeting failure §29.14 warned about, and because a "0 failures" result must
never be accepted without checking that the perturbation landed.

The separate Freeform selected-post proof (`setPadletToEdit(padlet)`) is retained and still passes.

### 31.6 T3 — **load-bearing**

The proof slices `CardPreview.tsx` from `{/* Edit Button */}` (`:135`) to end of file (`:195`) — the
non-clipart return branch only, excluding the clipart branch at `:56-126` and all setup. It requires
`<DocumentCardContent` **and** `onRead={onReadDocument}`, and rejects any
`<button … aria-label="Read document">`. This is a genuinely scoped slice, not a whole-file search
for the component name.

Independently detected a byte-faithful inline duplicate — same `aria-label`, same
`stopPropagation`, same overlay classes, same visible label. The §29.14 NC9 gap is closed.

### 31.7 T4 — **load-bearing, real DOM**

Real jsdom mounts with body content **and** `onRead`, inspecting `HTMLElement.style` rather than
source strings. Covers explicit colour, all three fallback inputs, body visibility, Read presence,
body/Read coexistence, sanitiser preservation (`innerHTML` compared across handler/no-handler
mounts), colour ownership (body styled, button `style` attribute `null`), and structural invariance
across handler presence. The `PostCardContent` end-to-end thread is asserted in the same test and
fails when the pass-through prop is removed.

### 31.8 Regression review, induced failures, negative controls, validation

**Product contract re-confirmed in full.** One shared `DocumentCardContent` (T3 now enforces it) ·
Read visible to editable **and** read-only users (harness 14/15 plus owner-level T1) · editable →
`document-editor` `readOnly={false}` with a title input · read-only → `document-viewer`
`readOnly={true}` with no title input, no description input, no toolbar, no Save, no command
surface, `contenteditable="false"` asserted **in addition to** command-surface absence, and `onSave`
invoked **zero** times on Close · `DocumentEditor.readonly.test.tsx` 6/6 green and byte-unchanged ·
clipart receives no Read in either owner and the correction diff contains **zero**
`svgUrl`/`isClipart`/`clipart` additions · passive surfaces without a handler receive no Read · all
thirteen layout threadings intact · complete post id/title/content/metadata reaches routing ·
`CanvasModals:152-154`'s `document-${padletToEdit?.id}` keyed remount byte-unchanged and still
load-bearing · no B2 lifecycle, no persistence change, no PDF code.

**Induced failures — all reproduced at `f841990`, all resolved at `0985bb7`:**

- `f841990` production + corrected tests → **1 failed / 22 passed**: explicit `textColor` cannot
  reach the body and the interactive body ignores metadata colour.
- All three T-defects applied simultaneously (editor-only gate at both owners, `setPadletToEdit`
  removed, CardPreview inline duplicate) against the **`f841990` tests** → **21/21 pass** — the old
  suite is blind to every one.
- The identical tree against the **corrected tests** → **3 failed / 20 passed**, one failure per
  T-item. This single paired run is the cleanest demonstration that T1, T2 and T3 are load-bearing
  and were not merely re-fitted to the implementer's own perturbations.

All backup/restore cycles hash-verified: **all 7 tracked files SHA-256-identical after every
control**.

**Negative controls — 14 run, 13 detected, 1 recorded gap:**

| # | Control | Result |
|---|---|---|
| 1 | omit `textColor` pass-through at `PostCardContent` | **DETECTED** |
| 2 | accept the prop but ignore it | **DETECTED** |
| 3 | force `#1F2937` despite an explicit colour | **DETECTED** |
| 4 | gate Read on `document-editor` — Freeform, `===` ternary | **DETECTED** |
| 4b | gate Read on `document-editor` — CanvasClient, `!==` early return | **DETECTED** |
| 4c | editor-only gate — CanvasClient, `=== 'document-viewer'` added line | **NOT DETECTED** (§31.9 O1) |
| 4d | editor-only gate — Freeform, `=== 'document-viewer'` added line | **DETECTED** |
| 5 | remove `setPadletToEdit(post)` from the real callback body | **DETECTED** |
| 5b | reorder destination before selected post | **DETECTED** |
| 6 | faithful inline duplicate in `CardPreview` | **DETECTED** |
| 7 | remove `onRead` while retaining body | **DETECTED** (7 failures) |
| 8 | remove body content while retaining Read | **DETECTED** |
| 9 | local `svgUrl` discriminator in `DocumentCardContent` | **DETECTED** |

Controls 2 and 3 together prove the colour is genuinely plumbed and not hard-coded — 2 that the prop
is read, 3 that the incumbent `textColor || '#1F2937'` expression is intact. **All nine governed
§30.6 controls are detected.** No test was weakened anywhere; every change to the two test files is
additive or a tightening.

**Validation — all green.** Focused (`DocumentCardContent` · affordance source · `CardPreview` ·
`CardEditor` · `ClipartCardDraftModal` · NoteEditor characterization · `DocumentEditor` 17/17 ·
`DocumentEditor.readonly` 6/6 · `documentModalRoute` · `documentPost` · `cardModalRoute`):
**11/11 files, 180/180 tests**. **Full Vitest: 76/76 files, 898/898 tests** — exactly the expected
totals. `npm run typecheck` **exit 0**, **410** declarations. `.next` cleared · `npx next build`
exit 0 · bridge exclusion **891 files**, marker absent · `npm run build:e2e` exit 0,
`.next/E2E_BRIDGE_BUILD` = **`1`** · ordinary `.next` restored, exclusion **891**, marker absent.
`git diff --check` exit 0. Worktree outside committed history: only the five long-standing protected
paths.

**False-green review.** Explicit `textColor` reaches the body · the fallback is not hard-coded
(control 3) · Read is not hidden from read-only users · the selected post is assigned before the
destination opens (control 5b) · `CardPreview` does not duplicate the shared UI · clipart gets no
Read · passive surfaces get no Read · body and Read do not diverge between handler paths · routing
semantics unchanged · no B2, persistence or PDF code · no test weakened. **Every criterion passes.**

### 31.9 Observations (non-blocking)

1. **O1 — the two T1 guards are asymmetric.** Freeform rejects
   `/d === 'document-(editor|viewer)'/` (both values); `CanvasClient` rejects only
   `/destination !=|!== 'document-editor'/`. An editor-only gate expressed at `CanvasClient` as an
   **added** `if (destination === 'document-viewer') return;` line is therefore undetected
   (control 4c), because `if (!destination) return;` survives alongside it. The **governed** control
   is detected in both its natural phrasings, and the guard cannot be *replaced* — only supplemented
   — so this is a narrowing, not a hole in the product contract. One-line fix when the file is next
   touched: widen the CanvasClient pattern to
   `/destination\s*(===|!==?)\s*['"]document-(editor|viewer)['"]/`. **Not required for closure.**
2. Freeform's T1 assertion pins an exact single-line string. It is precise and load-bearing but will
   break on innocent reformatting; a future editor should re-derive it rather than delete it.
3. Test budget is fully consumed at **290/290**. Any further B1b-iii test work needs a cap amendment.
4. Carried unchanged from §29.19: `DrawingLayout` now holds two idioms for keeping `renderEmbeddable`
   current, and the dependency entry defeats its memoization on every `CanvasClient` render —
   recorded for B2's consideration · `CardPreview` has no local Document gate; correctness rests on
   its single caller · `WallCanvas`'s prop is accepted and discarded, and the `OWNER_FILES` string
   check cannot distinguish that from wiring · §27.6 **A-10** still has no test · combined production
   census is **121**.
5. Carried unchanged from §28.25: **O4** remains open and is **B2's** (§28.4) — correctly untouched
   here · the central route's unguarded `setDocumentModalDestination(helper(...))` ·
   `DocumentEditor`'s shared `z-[1000]` · the temporary save-on-close lifecycle (§22.4) must not
   survive B2 · `PostCardContent:611`'s pre-existing inline clipart predicate · C7 · the second
   canvas system (`LiveCanvas`).

### 31.10 Classification and status

**CLASSIFICATION 2 — PASS WITH NON-BLOCKING OBSERVATIONS. PATCH-149B1b-iii CLOSES.**

F4 is fixed at the narrowest possible seam — one prop, one pass-through, seven production lines —
and the fix is defended by three independent controls that distinguish "plumbed" from "hard-coded".
T1, T2 and T3 are each proven load-bearing against defects this review constructed, and the paired
old-tests/new-tests run against an identical defective tree (21/21 green versus 3 failures) settles
that the §29.14 gaps are genuinely closed rather than papered over. The retrospective 13-file
amendment holds, every per-file and aggregate cap is satisfied, and nothing outside the two-file
corrective allowlist moved. The remaining observations are one guard asymmetry with a known one-line
fix, an exhausted test budget, and context carried forward from earlier sections.

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`, §23/§24) |
| **PATCH-149B1b-ii** | **CLOSED** (`510aa8d`, §28) |
| **PATCH-149B1b-iii** | **CLOSED** (`f841990` + `0985bb7`; reviews §29, scope amendment §30, closure §31) |
| **PATCH-149B2** | **ELIGIBLE FOR GOVERNANCE** — unblocked by this closure. Must close **O4** (§28.4) and must not preserve the §22.4 temporary save-on-close lifecycle. **Not authorized and not started.** |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-152** | **NOT RESERVED** — unchanged |

No implementation file was modified by this review. Nothing was pushed.

---

## 32. PATCH-149B2 — EXPLICIT DOCUMENT SAVE LIFECYCLE · **AUTHORIZED AS A TWO-STAGE SPLIT**

**Authored:** 2026-08-05 (governance architect). **Base:** `97582bf`. Every path, line number, type
and behaviour below was **measured at this HEAD**. No production or test file was modified in this
turn.

**Outcome: authorized, split into B2-i and B2-ii.** Three measurements drove the shape of this
patch and are stated up front because they overturn the brief's default assumptions:

- **`saveCard` cannot report failure today** — it swallows every error (`catch (e) { console.error(...) }`)
  and its Promise always resolves. A narrowly scoped result contract is therefore **authorized**, not
  optional (§32.3).
- **SAVE-A is architecturally impossible** without changing state that `CardEditor` shares. `saveCard`
  calls `setPadletToEdit(null)` on success, and the whole Document modal — `isOpen`, `title`,
  `initialContent`, `metadata` and its React `key` — is derived from `padletToEdit`. **SAVE-B is
  mandated by measurement, not preference** (§32.4).
- **There are seven Document-modal entry points across two files**, not one. A switch guard placed
  only on `openDocumentFromPreview` would leave six unguarded paths that silently destroy a dirty
  draft (§32.14).

### 32.1 Current-lifecycle census — measured at `97582bf`

| Aspect | Measured behaviour |
|---|---|
| Title state | `useState(initialTitle)` (`DocumentEditor:33`), re-synced by an `isOpen`-gated effect on **primitives** (`:39-44`, the §23.15 F3 fix) |
| Description state | `useState(initialMetadata?.description \|\| '')` (`:34`), same effect |
| Body state | Owned by TipTap via `useSharedTipTapEditor` (`:46-49`); **no** `onUpdate` subscriber is passed, so React never observes body edits today |
| `onSave` timing | **Save-on-close.** `handleSaveAndClose` (`:51-63`) calls `onSave(...)` then `onClose()` unconditionally |
| Close button | `onClick={handleSaveAndClose}` (`:120`) — **saves** |
| Backdrop | `onClick={handleSaveAndClose}` on the overlay (`:70`); panel stops propagation (`:75`) — backdrop **saves** |
| Escape | **No handler anywhere.** Currently a no-op, characterized by `DocumentEditor.test.tsx:156` |
| Read-only | `handleSaveAndClose` guards with `if (!readOnly)`; no title input, no description, no toolbar, no Save, `editable:false` (§24.12, 6/6) |
| Creation draft | `padletToEdit.id === 'new'`; **no row exists before first save** |
| `saveCard` early return | Blank new draft → `setIsCardEditorOpen(false); setPadletToEdit(null); return;` (`usePadletSave:995-999`) — **no insert, no signal** |
| Placement deferral | `checkPlacementRequired` (`:277-299`) returns `true` **only for new posts** in drawing/non-freeform/non-map layouts; it calls `closeEditor()` and defers the insert. For `id !== 'new'` it returns `false` immediately |
| Return type | `async (data: SaveCardData) => { … }` — declared `Promise<void>`; **returns `undefined` on every path**, and `createdPadlet` is a local never returned |
| Error behaviour | `catch (e) { console.error('Failed to save card:', e); }` — **swallowed. The Promise always resolves.** |
| Sync or async | Genuinely `async`, but the **`CanvasModals` prop type erases it**: `saveCard: (...args: any[]) => any` (`CanvasModals:86`), and `DocumentEditorProps.onSave` is `(data: SaveCardData) => void` (`DocumentEditor:16`) |
| `CanvasModals` close | `onClose={() => { setDocumentModalDestination(null); setPadletToEdit(null); }}` (`:164-167`) |
| Selected-post cleanup | Owned by `CanvasModals`' `onClose` **and** independently by `saveCard` itself |
| Keyed remount | `key={documentModalDestination ? \`document-${padletToEdit?.id ?? 'new'}\` : 'document-closed'}` (`:151-155`) — B1b-ii/§28.5, load-bearing |
| Read-only save stand-in | `noopDocumentSave` (`CanvasModals:13`) |

**`saveCard` has exactly three real consumers** — `onSave={saveCard}` for `CardEditor`
(`CanvasClient:7419`), `void saveCard({…})` in `ClipartCardDraftModal`'s close
(`CanvasClient:7432`), and the Document modal. (`components/kanban-canvas/store.tsx`'s `saveCard` is
a **different** function from `@/lib/kanban/supabaseAdapter` and is out of scope.)
**Both non-Document consumers ignore the returned Promise.**

### 32.2 Hard stops — evaluated honestly

| Hard stop | Result |
|---|---|
| Save success/failure cannot be observed | **TRIGGERED as-is, RESOLVED by narrow authorization.** Errors are swallowed; the fix is a result return across 3 call sites, not a save-layer redesign (§32.3) |
| Callback returns before the real save completes | **TRIGGERED for one measured path only** — new-post placement deferral. Governed as an explicit `'deferred'` result; the modal must never report success there (§32.3) |
| `saveCard` mutates state incompatibly with a persistent open modal | **TRIGGERED.** Decides SAVE-B (§32.4) |
| Save-and-stay-open needs a created-row identity | **TRIGGERED** — `saveCard` never returns the created row. Also decides SAVE-B |
| Dirty state cannot be normalized safely | **NOT TRIGGERED** — `fromEditorHtml` already collapses `''` and `'<p></p>'` to `''` |
| Competing modal actions cannot be intercepted | **NOT TRIGGERED** — `handleToolClick` is one function; `closeDrawingEditorsBeforePadletEdit` has exactly **one** call site (`CanvasClient:6747`) |
| Route-switch continuation needs a broad modal rewrite | **NOT TRIGGERED, but it is what forces the split** — seven entry points across two files (§32.14) |
| Read-only and editable cannot stay separated | **NOT TRIGGERED** — already separated throughout |
| Persistence exceeds a narrow callback result contract | **NOT TRIGGERED** if §32.3 is obeyed |
| Entanglement with PDF or PATCH-149C | **NOT TRIGGERED** — both explicitly excluded |

**No hard stop blocks authorization.** Two are triggered by the current code and are resolved by
changes this section authorizes at their exact minimum size.

### 32.3 Save callback and persistence boundary — **result contract, never a throwing contract**

`saveCard` gains a **discriminated result**; it must **not** be converted to throw. Two existing
consumers ignore the Promise, so a throwing contract would convert every save failure into an
unhandled rejection — a regression in files B2 does not own.

```
export type SaveCardResult =
  | { status: 'saved' }
  | { status: 'skipped-blank' }      // existing blank-new-draft early return
  | { status: 'deferred-placement' } // checkPlacementRequired took over
  | { status: 'failed'; error: unknown };
```

- `saveCard`'s `catch` returns `{ status: 'failed', error: e }` **and keeps the existing
  `console.error`**; it must not rethrow.
- The success tail returns `{ status: 'saved' }`.
- The blank early return returns `{ status: 'skipped-blank' }`; the placement branch returns
  `{ status: 'deferred-placement' }`.
- **The `catch` must remain outside the `setIsCardEditorOpen(false); setPadletToEdit(null)` pair.**
  It already is — those calls sit inside the `try` after the awaits — which is precisely why a failed
  save leaves `padletToEdit` intact and the draft recoverable. This ordering is now **load-bearing**
  and a negative control must prove it.
- No other `usePadletSave` export changes. `saveImage`, `saveNote` and the rest are untouched.

`DocumentEditorProps.onSave` becomes
`(data: SaveCardData) => Promise<SaveCardResult | void> | SaveCardResult | void`, and
`CanvasModals`' `saveCard: (...args: any[]) => any` is narrowed to the real signature so the result
survives the boundary. A `void`/`undefined` result must be treated as **success** so that
`noopDocumentSave` and any future caller stay valid — but the read-only branch never invokes it.

**Forbidden:** awaiting a fire-and-forget call, treating `'skipped-blank'` or `'deferred-placement'`
as `'saved'` for baseline purposes, or claiming success from a Promise that resolved before the
insert completed.

### 32.4 SAVE-A vs SAVE-B — **SAVE-B, decided by measurement**

| Question | Measured answer |
|---|---|
| Does `saveCard` return the created row or id? | **No.** `createdPadlet` is local; every path returns `undefined` |
| Is `padletToEdit` updated after creation? | **No.** It is set to `null` (`usePadletSave:1066`) |
| Can an open modal survive its own save? | **No.** `isOpen`, `title`, `initialContent`, `metadata` and the React `key` all derive from `padletToEdit`; nulling it unmounts the modal |
| Do existing modal patterns save-and-close? | **Yes** — `CardEditor`, `NoteEditor`, `ContainerEditor` and the current Document lifecycle all close on save |
| Would keeping it open need broad synchronization? | **Yes** — a created-row id contract plus removing `saveCard`'s state side-effects, which `CardEditor` shares |

**SAVE-B: Save persists and closes the modal on success.** SAVE-A would require changing shared
state semantics in a file B2 is only authorized to touch for a result contract.

**This is not save-on-close by another name.** Close, backdrop and Escape must never invoke `onSave`
under any circumstances; only the explicit Save control may. The §22.4 temporary lifecycle is
**removed completely** — `handleSaveAndClose` must not survive in any form.

### 32.5 Dirty-state definition and baseline normalization

Dirty is `draft ≠ lastSavedBaseline` over exactly three fields:

| Field | Comparison |
|---|---|
| `title` | exact user-visible string, **no trimming** |
| `description` | exact user-visible string, **no trimming** |
| body | `fromEditorHtml(editor.getHTML())` on both sides |

- **Normalization is `fromEditorHtml` and nothing new** — it already maps `''` and `'<p></p>'` to
  `''`, so an untouched empty Document and a fully-cleared one compare clean. Do not add a second
  normalizer, and do not normalize with `toEditorHtml` (that is the inbound direction).
- **Never compare TipTap object identity, editor state or `getJSON()` references.**
- Baseline initializes at open from the same props the draft initializes from, so a Document is
  **clean on open by construction**.
- Reverting any field to its baseline value must return the document to clean — dirty is a
  comparison, never a latch.
- Unrelated metadata keys are **not** baseline fields. A concurrent outside metadata change must not
  make the local draft dirty; §23.15 F3's "read unrelated keys from the latest prop at save time"
  behaviour is preserved exactly.
- The phantom mount update B1a fixed (`setEditable(editable, false)`, §20.15 F1) must not mark
  dirty. Observing body changes requires an `onUpdate` subscriber that does not exist today —
  whatever mechanism is chosen, **mounting must not produce a dirty document**, and a dedicated test
  (item 9) and negative control (NC5) enforce it.

### 32.6 Explicit Save contract

On Save, in order: gather `title`; gather `description`; gather `fromEditorHtml(editor.getHTML())`;
spread unrelated keys from the **latest** `metadata` prop (`{ ...(initialMetadata || {}), description }`,
unchanged from `:59`); invoke `onSave` **exactly once**; await it if thenable; then branch on the
result.

| Result | Behaviour |
|---|---|
| `'saved'` (or `void`) | update baseline to the just-saved values, clear dirty, clear any error, **close** (SAVE-B) |
| `'failed'` | **stay open**, keep draft, keep dirty **true**, keep the selected Document, show an accessible error, allow retry, **do not** call `onClose`, **do not** update baseline |
| `'skipped-blank'` | the draft is genuinely blank, so closing is correct; **must not** report success or write a baseline that would mask a later genuine edit |
| `'deferred-placement'` | the modal closes because `saveCard` already cleared the selection; **must not** report a completed save |

### 32.7 Close, backdrop, Escape

| State | Close | Backdrop | Escape |
|---|---|---|---|
| Editable, clean | close immediately, **no save** | close immediately, **no save** | close immediately, **no save** |
| Editable, dirty | open discard confirmation, modal stays open | open discard confirmation, modal stays open | open discard confirmation, modal stays open |
| Confirmation open | — | — | close the confirmation, return to editing |
| Read-only | close immediately | close immediately | close immediately |
| Saving in progress | blocked (§32.9) | blocked | blocked |

Clicks inside the panel must continue to stop propagation (`:75`) so they never reach backdrop
handling. **Escape ownership:** the Document modal registers **one** listener while open, and the
confirmation takes precedence while it is open. No duplicate global listeners, and no listener
survives unmount. There is no existing modal-level Escape convention in this tree to conform to —
every measured `Escape` handler in `components/collabboard/editors/` is on an inner input — so B2-i
establishes it for the Document modal only and must not retrofit other editors.

### 32.8 Discard confirmation — **two actions**

`Keep editing` and `Discard changes`. **No third `Save` action** — it would fork save-error handling
into the confirmation and is explicitly rejected.

- `Keep editing` — closes only the confirmation, preserves every draft field, returns focus to the
  Document modal.
- `Discard changes` — closes the confirmation, closes the Document modal, clears the selected
  Document through the existing `onClose`, performs **no** save, discards title, description and body.

**No `window.confirm`.** The measured alternatives are unsuitable: `components/kanban-canvas/ConfirmModal.tsx`
belongs to the separate kanban system (house rule 9), and `CanvasClient:7722`'s inline delete-confirm
has **no `role` and no accessible name** and lives in a file B2-i does not touch. A dedicated
`DiscardChangesDialog.tsx` is therefore authorized.

Accessibility, all required: `role="alertdialog"`, an accessible name, an explicit unsaved-changes
message, keyboard-focusable actions, initial focus on `Keep editing` (the safe action), focus
containment where the primitive supports it, defined Escape semantics (§32.7), focus returned to the
Document modal on `Keep editing`, and no interaction with the underlying modal while it is open.

### 32.9 Saving state and save errors

Visible Save button in editable mode; **absent** in read-only. While a save is in flight: Save is
disabled and shows a loading label or indicator; a second Save is impossible; Close, backdrop, Escape
and discard are **blocked** until completion. **Two concurrent saves must be unreachable** — proven
by test 17 and NC10. Cancellation is not authorized in B2.

On failure: modal open, draft intact, dirty still true, selected Document intact, error visible and
accessible, retry possible, error cleared or replaced on retry, `onClose` **not** called, baseline
**not** updated.

Save enablement when clean: **disabled**, matching the dirty-state contract. If implementation finds
a repository convention that strongly contradicts this, it must stop and request an amendment rather
than silently enable it.

### 32.10 Creation flow

Opening a blank draft performs **no** write — `padletToEdit.id === 'new'` and no row exists until
`saveCard` inserts. A blank, untouched draft is **clean**, so Close, backdrop and Escape all exit
with no confirmation and no write. Editing title, description or body makes it dirty and all three
exits then require confirmation. Discard produces **no** row and there is **no** delete-on-discard
path. Save creates the row through the existing `saveCard` insert. A blank Save hits the existing
early return and must surface as `'skipped-blank'` — never as a completed save. No orphan row on
open. Because SAVE-B closes on success, **no created-row identity reconciliation is required**, which
is the second reason SAVE-A was rejected.

### 32.11 Read-only contract — unchanged, and must not regress

No title input, no description input, no toolbar, no Save, no dirty state, no discard confirmation,
no persistence callback, no command surface; Close, backdrop and Escape all close immediately.
`DocumentEditor.readonly.test.tsx` (6/6, §24.12) is **extended, never weakened** — its existing
assertions, including `renders no dirty/discard UI`, must all still pass unmodified in meaning.

### 32.12 O4 — competing-modal cleanup · **O4-C with queued continuation**

§28.4/§28.25 recorded that `handleToolClick` (`CanvasClient:5352-5364`) and
`closeDrawingEditorsBeforePadletEdit` (`:5738-5751`) close every editor flag but never clear
`documentModalDestination`.

**The naive fix is now forbidden.** Adding an unconditional `setDocumentModalDestination(null)` would
silently destroy a dirty draft — it would satisfy §28.4 while violating the binding product decision.
§28.4's observation is hereby **superseded** by this section.

**Decision: O4-C — close if clean, block if dirty — with a queued continuation.**

| Document state | Behaviour |
|---|---|
| Clean editable | close the Document modal, clear the selected Document, **continue** the requested action |
| Read-only | close immediately, **continue** |
| Dirty editable | **block** the competing action, open the discard confirmation, queue the action; `Discard changes` runs the queued action, `Keep editing` **discards the queue** and changes nothing |

The continuation must carry everything needed to resume: for a tool click, the `toolType` string; for
a Document switch, the **complete target post** and its capability-derived destination — never an id
alone (§25.2/O2). A queued continuation must never survive `Keep editing`, and must never be replaced
by a newer request without an explicit governed rule.

`onBeforeToolClick` on `CanvasSidebar` (`:98-103`) is **not** a viable interception point: it is
`void` and `dispatchTool` calls `handleToolClick` unconditionally afterwards. The guard therefore
belongs at the **top of `handleToolClick` itself**, which is a single function with one definition.
`closeDrawingEditorsBeforePadletEdit` has exactly one call site and is guarded the same way.

### 32.13 Route-switch / preview-open contract

Clicking Read (or any Document-open path) while a Document modal is open:

- current draft **clean** → switch and remount through the existing keyed boundary;
- current draft **dirty** → discard confirmation first; on `Discard changes` continue to the queued
  target, on `Keep editing` cancel the switch entirely;
- current document **read-only** → switch immediately.

**One document's Save must never write another document's payload.** The queued target and the live
draft are separate values, and the keyed remount (`CanvasModals:151-155`) must remain load-bearing
and unmodified.

### 32.14 Entry-point census — **seven write sites, all must be guarded**

Measured writers of `setDocumentModalDestination` outside `CanvasModals`' own close:

| # | Site | Path |
|---|---|---|
| 1 | `CanvasClient:5423` | creation — `case 'document'` |
| 2 | `CanvasClient:5712` | central router `openPadletInTypeEditor` |
| 3 | `CanvasClient:5725` | `openDocumentFromPreview` (B1b-iii Read) |
| 4 | `CanvasClient:6500` | Columns `onOpenPost` |
| 5 | `CanvasClient:6594` | Rows `onOpenPost` |
| 6 | `FreeformPadletCards:428` | freeform bypass router |
| 7 | `FreeformPadletCards:1775` | freeform `onEditContent` pencil |
| 8 | `FreeformPadletCards:1784` | freeform Read affordance (B1b-iii) |

**`FreeformPadletCards` opens the Document modal without passing through `CanvasClient`.** Any guard
applied only to `openDocumentFromPreview` leaves seven unguarded paths. B2-ii must cover **all** of
them, and its source suite must fail if any one is missed — the same shape as B1b-iii's A-9.

### 32.15 State ownership — **D, split across the two stages**

- **Draft, baseline, dirty computation, save-in-flight and save-error live in `DocumentEditor`.**
  The TipTap editor instance is **never** exposed as a prop or ref.
- **Switch intent and queued continuations live at the modal owner** (`CanvasClient`, with a pure
  helper). No TipTap or draft state may leak into `CanvasClient`.
- **No capability logic in `DocumentEditor`** — routing stays with `selectDocumentModalDestination`.
- **No generic application-wide modal state machine.**

Smallest cross-boundary contract:

- `onRequestClose(reason: 'close-button' | 'backdrop' | 'escape')` — B2-i may keep this internal if
  the discard flow is fully local;
- `onDirtyChange(isDirty: boolean)` — **must fire only on clean↔dirty transitions**, never per
  keystroke. `CanvasClient` is 8,300+ lines; a per-character callback would re-render the entire
  canvas. This is a binding constraint, not a suggestion.
- `onSaveSuccess` / `onDiscardConfirmed` — only if B2-ii proves they are required.

### 32.16 Authorized scope — **SPLIT into B2-i and B2-ii**

The split is required, not preferred: the combined work exceeds the 5-file / 320-line production
threshold, and O4's seven-entry-point coordination is a materially different concern from the
editor-local lifecycle.

**B2-i — DocumentEditor-local lifecycle.**

| # | Path | Change | Max |
|---|---|---|---|
| 1 | `components/collabboard/editors/DocumentEditor.tsx` | explicit Save, dirty/baseline, save state + error, backdrop/Escape, discard wiring; **remove `handleSaveAndClose` entirely** (145 lines today) | **≤130** |
| 2 | `components/collabboard/editors/DiscardChangesDialog.tsx` | **new** — accessible `alertdialog`, two actions | **≤70** |
| 3 | `components/collabboard/canvas/ui/CanvasModals.tsx` | narrow the erased `saveCard` prop type; pass the result through | **≤12** |
| 4 | `hooks/canvas/usePadletSave.ts` | **`SaveCardResult` only** (§32.3) | **≤20** |

**B2-i production ≤ 232 / 4 files.**

| Test file | Max |
|---|---|
| `components/collabboard/editors/DocumentEditor.test.tsx` | **≤200** |
| `components/collabboard/editors/DocumentEditor.readonly.test.tsx` | **≤30** |
| `components/collabboard/editors/DiscardChangesDialog.test.tsx` (**new**, jsdom) | **≤90** |
| `lib/domain/canvas/documentSaveLifecycle.source.test.ts` (**new**, node, scoped slices) | **≤80** |

**B2-i tests ≤ 400 / 4 files.**

**Explicitly authorized test rewrite.** `DocumentEditor.test.tsx:116` (`Close saves exactly once
then closes exactly once`), `:127` (`backdrop click saves exactly once …`) and `:156` (`Escape is
characterized as a no-op`) are **characterizations of the temporary §22.4 lifecycle**. B2-i must
**invert** them, not delete them: Close and backdrop must be re-asserted to save **zero** times, and
Escape must gain real behaviour. Every other test in both files, including all six read-only
assertions and the six §23.15 F3 draft-stability tests, must survive unchanged in meaning.

**B2-ii — route switching, queued continuations, O4.**

| # | Path | Change | Max |
|---|---|---|---|
| 1 | `app/dashboard/canvas/[id]/CanvasClient.tsx` | guard sites 1-5, `handleToolClick`, `closeDrawingEditorsBeforePadletEdit`, continuation state (8,300+ lines — guards and threading only) | **≤90** |
| 2 | `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | guard sites 6-8 (6,300+ lines — guards only) | **≤30** |
| 3 | `components/collabboard/canvas/ui/CanvasModals.tsx` | dirty reporting / continuation plumbing | **≤15** |
| 4 | `lib/domain/canvas/documentSwitchGuard.ts` | **new** — pure decision helper, mirroring the `documentModalRoute.ts` precedent | **≤50** |

**B2-ii production ≤ 185 / 4 files.** Tests: `documentSwitchGuard.test.ts` (**new**, ≤90),
`documentSwitchGuard.source.test.ts` (**new**, node scoped slices, ≤110), and ≤50 changed lines in
the B1b-iii affordance suites if threading requires it. **B2-ii tests ≤ 250 / 3 files.**

Files 1, 2 and `usePadletSave.ts` are **over the 800-line ceiling**; each is capped at guards,
threading or a result type and may contain no new rendering or business logic. An implementer who
cannot stay inside a cap must **stop and request an amendment, not spill**.

**B2 does not own:** PDF nodes, source references, backlinks, autosave, version history,
PATCH-149C's unresolved formatting/container issues, or any generic modal redesign.
**Explicitly excluded files:** `documentModalRoute.ts` · `documentPost.ts` · `documentContentAdapter.ts` ·
`useSharedTipTapEditor.ts` · `NoteEditor.tsx` · `CardEditor.tsx` · `ClipartCardDraftModal.tsx` ·
`DocumentCardContent.tsx` and its owners · all B1b-iii layout threading · `LiveCanvas.tsx` and the
second canvas system · presentation code · schema/migrations · Excalidraw fork.

### 32.17 Required tests — 56 items

**Dirty state (B2-i):** 1 clean on open · 2 title edit dirties · 3 description edit dirties · 4 body
edit dirties · 5 title revert returns clean · 6 description revert returns clean · 7 body revert to
normalized baseline returns clean · 8 unrelated rerender does not change dirty · 9 phantom mount
update does not dirty · 10 successful Save resets baseline.

**Save (B2-i):** 11 Save visible editable · 12 Save absent read-only · 13 clean Save disabled ·
14 dirty Save enabled · 15 payload title/body/metadata correct · 16 exactly one save · 17 duplicate
clicks blocked · 18 saving indicator · 19 SAVE-B close on success · 20 failure leaves modal open ·
21 failure preserves draft · 22 failure preserves dirty · 23 retry succeeds · 24 baseline updates
only on success.

**Close / discard (B2-i):** 25 clean Close no save · 26 dirty Close confirms · 27 Keep editing
preserves draft · 28 Discard closes without save · 29 clean backdrop closes · 30 dirty backdrop
confirms · 31 clean Escape closes · 32 dirty Escape confirms · 33 confirmation Escape returns to
editing · 34 read-only Close/backdrop/Escape close without save.

**Creation (B2-i):** 35 blank untouched closes without confirmation · 36 edited blank confirms ·
37 Discard creates no row · 38 Save creates through the existing path · 39 blank no-op Save does not
fake persistence · 40 no orphan row on open.

**Route switch / O4 (B2-ii):** 41 clean switches · 42 dirty blocks · 43 Discard runs the queued
switch · 44 Keep editing cancels the queue · 45 same for `handleToolClick` · 46 same for
`closeDrawingEditorsBeforePadletEdit` · 47 read-only switches immediately · 48 no stale selected-post
payload · 49 no cross-document save. **Plus 49a: the source suite must fail if any one of the eight
§32.14 entry points is left unguarded.**

**Regressions (both):** 50 B1b-iii Read affordance intact · 51 read-only no command surface ·
52 NoteEditor unchanged · 53 CardEditor unchanged · 54 clipart unchanged · 55 no PDF code ·
56 PATCH-149C controls unchanged.

Behavioural tests use real React DOM and real TipTap in the existing jsdom setup. Source tests use
**scoped slices**; whole-file substring counts are forbidden. **No new dependencies.**

### 32.18 Induced failures — demonstrable at `97582bf`

1. Editable Close saves automatically (`DocumentEditor:120` → `handleSaveAndClose`).
2. Backdrop saves automatically (`:70`).
3. No Save button exists anywhere in the component.
4. No dirty state exists — there is no baseline and no body-change subscriber.
5. No discard confirmation exists in any form.
6. Escape is a no-op — characterized by `DocumentEditor.test.tsx:156`.
7. Save failures cannot be surfaced — `saveCard` swallows and returns `undefined`.
8. `handleToolClick` and `closeDrawingEditorsBeforePadletEdit` never clear the Document modal.
9. Switching documents bypasses unsaved-change protection at all eight §32.14 entry points.

Each authorized change must resolve a listed parent failure or a governed source proof. Anything
that resolves neither is out of scope.

### 32.19 Negative controls — 20, each detected and reverted hash-identically

1. retain save-on-close in **any** path · 2. dirty Close without confirmation · 3. dirty backdrop
without confirmation · 4. dirty Escape closes directly · 5. mark a clean draft dirty on mount ·
6. ignore title in the dirty calculation · 7. ignore body · 8. update the baseline before the save
resolves · 9. close on a failed save · 10. allow duplicate Save · 11. hide the save error ·
12. read-only renders Save · 13. Discard invokes save · 14. Keep editing clears the draft ·
15. blank draft creates a row on open · 16. competing tool silently clears a dirty Document ·
17. queued switch opens the wrong Document · 18. clear the selected Document before the confirmation
resolves · 19. preserve the temporary save-on-close lifecycle anywhere · 20. add a PDF-specific
branch.

**Additionally required by §32.3:** moving `setPadletToEdit(null)` into or above `saveCard`'s
`catch`, which would destroy the draft on failure, must be detected.

**Every control must be shown to land on the intended code before "0 failures" is accepted as
detection** (§31.5 — `setPadletToEdit(post);` alone occurs five times in `CanvasClient.tsx`; a
first-occurrence replace silently hits the wrong function). Anchor on a unique enclosing block.

### 32.20 False-green rejection

Reject if: any editable Close path still saves · dirty backdrop or Escape silently discards ·
clean/dirty uses raw editor identity · success cannot be distinguished from failure · a failed save
closes the modal · duplicate saves are possible · read-only gains Save or confirmation · creation
opens a row before Save · O4 clears the modal regardless of dirty state · switching can overwrite the
target or current payload · fewer than all eight §32.14 entry points are guarded · `onDirtyChange`
fires per keystroke · B1b-iii's Read affordance regresses · clipart changes · persistence scope
broadens beyond `SaveCardResult` · `handleSaveAndClose` survives in any form · PDF or PATCH-149C work
appears.

### 32.21 Validation matrix

DocumentEditor lifecycle tests · discard dialog tests · save failure/retry tests · creation tests ·
route-switch/O4 tests · B1b-iii affordance tests · B1b-ii routing/source tests · DocumentEditor
read-only tests · NoteEditor characterization 11/11 · CardEditor · ClipartCardDraftModal · **full
Vitest** · clean one-run `npm run typecheck` · **410** declarations · remove `.next` · ordinary
`npx next build` · bridge exclusion **891** · clean E2E build, marker `1` · ordinary `.next` restored,
exclusion re-verified, marker absent · `git diff --check` · only the five protected worktree paths.

**Baseline: 76/76 test files · 898/898 tests · 410 declarations · 891 exclusion files.** B2-i lands
first and moves the counts; B2-ii's baseline is B2-i's closing baseline.

### 32.22 Status

| Patch | Status |
|---|---|
| **PATCH-149A** | **CLOSED** (`c23be50`) |
| **PATCH-149B0** | **CLOSED** (`c9ea345`) |
| **PATCH-149B1a** | **CLOSED** (`c44a2ac` + `856f54b`) |
| **PATCH-149B1b-i** | **CLOSED** (`80011ee` + `4c37205`) |
| **PATCH-149B1b-ii** | **CLOSED** (`510aa8d`, §28) |
| **PATCH-149B1b-iii** | **CLOSED** (`f841990` + `0985bb7`, §§29–31) |
| **PATCH-149B2-i** | **AUTHORIZED · READY FOR IMPLEMENTATION** — 4 production files, ≤232 lines; 4 test files, ≤400 lines; SAVE-B; 20 negative controls |
| **PATCH-149B2-ii** | **AUTHORIZED · BLOCKED until B2-i closes** — 4 production files, ≤185 lines; 3 test files, ≤250 lines; O4-C with queued continuation; all eight §32.14 entry points |
| **PATCH-149C** | **BLOCKED on user reproduction** (§14.11) |
| **PATCH-150** | **RESERVED and separate**; untouched |
| **PATCH-152** | **NOT RESERVED** — unchanged |

**O4 is now owned by B2-ii**, and §28.4's "add `setDocumentModalDestination(null)`" observation is
**superseded** by §32.12 — the unconditional form is forbidden.

**Recorded, not scheduled** (no patch numbers reserved): the §31.9 O1 CanvasClient guard asymmetry ·
`DrawingLayout`'s duplicated `renderEmbeddable` idiom · `CardPreview`'s missing local Document gate ·
`WallCanvas`'s inert prop · §27.6 A-10's missing test · C5 · C7 · C13's second canvas system ·
`PostCardContent:611`'s pre-existing inline clipart predicate.

No production or test file was modified in this turn. Nothing was pushed.
