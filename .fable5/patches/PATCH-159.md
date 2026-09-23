# PATCH-159 — put the transcript fix where a transcript actually renders, and remove the branch that can never run

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Supersedes: PATCH-158 (WITHDRAWN — its §3.2 named the wrong paragraph; the
analysis that found this came from the implementer's refusal to build it)

---

## 1. PATCH-157 SHIPPED DEAD. Here is the proof.

The owner reported no visible change. They were right, and the reason is worse
than PATCH-158 assumed.

A transcript is stored as `kind = 'text'`. The reader routes on kind, explicitly:

```
components/collabboard/KnowledgeSourceReaderDrawer.tsx:801
    if (reader.kind === KNOWLEDGE_TEXT_KIND) {
      return <KnowledgeTextSourceView ... />;
    }
    if (reader.kind !== 'pdf') { ...unsupported... }
    return <KnowledgeDocumentDetails ... />;
```

`KnowledgeDocumentDetails` is reached **only** when `kind === 'pdf'`, and it is
rendered in exactly one place in the codebase (verified: the only other
references are type-only imports). `transcript_representation` is non-null only
on text documents.

**Therefore the `transcriptBlocksByPage` branch PATCH-157 added can never be
true in the product.** It is dead code with seven tests asserting a configuration
the application cannot produce — the exact shape this program has been burned by
before (PATCH-156 Part A: a format value that compiled, tested and was
unreachable), and the exact shape PATCH-157's own round-2 review criticised in
the implementer's work.

I authored that spec. It named one file because I searched for a renderer of
page text, found `PAGE_TEXT_ROOT`, saw `transcriptRepresentation` already a prop
there, and concluded I had the right component. That prop exists on the PDF
reader for the **disclosure notice**, not for rendering text. Matching a prop name
is not evidence of a code path.

**The real renderer** is `components/collabboard/KnowledgeTextSourceView.tsx`:

```tsx
<p className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">
```

`pre-wrap`, **monospace**, 13px. That is exactly what the owner's screenshot
shows, doubled spaces and all.

There are three renderers of document text, not two:

| Component | Renders | Transcript reaches it? |
|---|---|---|
| `KnowledgeTextSourceView` | the reader's TEXT path | **YES — the real target** |
| `KnowledgeDocumentDetails` | the reader's PDF path | never (kind-gated) |
| `KnowledgePdfCanvasSurface` | the canvas card | only as a 600-char excerpt |

---

## 2. What to do

### 2.1 Revert PATCH-157's transcript branch from the PDF reader

In `components/collabboard/KnowledgeDocumentDetails.tsx`, remove what cannot run:

- the `transcriptBlocksByPage` `useMemo` and its two imports;
- the conditional root `className` — restore
  `"select-text whitespace-pre-wrap text-xs leading-5 text-gray-700"`;
- the block `<span>` mapping — restore the single `highlightedText(...)` call
  (keeping the hoisted `pageTextArgs` local is fine and desirable; it is what
  holds the toolbar source test's 400-character window);
- the `rangeStart` / `rangeEnd` parameters and every clamp that exists only to
  serve them, including the `<mark>` clip. Restore `pushUnmatched` to its
  original two-line form.

**Two things STAY, deliberately:**

1. `anchorHere` keeps its original definition `isArrival && !navigationAnchored`
   — the block-range half goes with the ranges. The ring and the
   navigation-target attributes keep using `isArrival`. That is the pre-157
   behaviour and it must be exactly restored.
2. **Keep test 12**, the shared-emphasis guard ("a citation split into two
   segments rings BOTH"). It has nothing to do with transcripts: it pins genuine
   pre-existing PDF behaviour that nothing else pinned, which is how PATCH-157's
   intermediate version broke it unnoticed. Keep it and make sure it still
   passes.

Delete the transcript-specific tests in `KnowledgeDocumentDetails.test.tsx`
(tests 6, 6b, 7, 8, 9, 9b, 10, 11 and the short/long fixture helpers). They
assert a configuration the application cannot reach.

`lib/domain/knowledge/knowledgeTranscriptReadingLayout.ts` and its 14 tests
**STAY UNCHANGED** — they are correct, independently property-verified, and §2.2
is about to use them for real.

### 2.2 Apply the reading layout in `KnowledgeTextSourceView`

**The constraint is the same and is stated by the file itself:**

> offsets index the SOURCE text, and a renderer that reorders, drops or inserts
> characters makes every one of them wrong.

So: group and restyle, never rewrite. The rendered `textContent` must still
reconstruct `text` verbatim.

- The component takes a new optional prop
  `transcriptRepresentation?: KnowledgeTranscriptStoredRepresentation | null`.
  `KnowledgeSourceReaderDrawer` passes `reader.transcriptRepresentation` — it
  already holds it and already passes it to the PDF reader at line ~835.
  **Null/absent means not a transcript**; never infer it from the text's shape.
- **Not a transcript** (Markdown, .txt, .docx text): render exactly as today —
  `whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed`. The
  mono/pre-wrap is deliberate for a source document, as the comment there
  explains. Nothing about that path may change.
- **A transcript:** compute `knowledgeTranscriptReadingBlocks(text)` and render
  one `<span data-transcript-reading-block="" className="block">` per block
  (`mb-4` on all but the last). The paragraph becomes
  `whitespace-normal break-words text-[15px] leading-7 text-gray-800` — NOT
  monospace: a transcript is speech, not source text, and mono is what makes it
  read like a log file.
- **The existing highlight must keep working.** Today it is one `split`
  (`before` / `marked` / `after`) built from `highlight.charStart/charEnd`. In
  block mode the marked range may straddle a boundary, so it renders as one
  `<mark>` per block it covers. Clamp against the block, keep offsets ABSOLUTE,
  never rebase. `markRef` goes on the FIRST such mark only — the fragment
  holding the highlight's true start — so a citation scrolls to the start of the
  quote, not to its second paragraph. (That is the settled rule from PATCH-157's
  round 3; it applies here for real.)
- `data-knowledge-text-source-range` and every other existing attribute keep
  their current meaning and placement.

---

## 3. Tests

**`components/collabboard/KnowledgeTextSourceView.test.tsx`** (extend):

1. **THE GATE.** With a transcript representation, the rendered container's
   `textContent` equals `text` exactly — every `\n`, every doubled space. Use a
   fixture long enough that `knowledgeTranscriptReadingBlocks` returns **at
   least 3 blocks**, and assert that block count in the test by calling the real
   module, so the test fails loudly if the fixture or the target constant drifts
   into the one-block case.
2. More than one `[data-transcript-reading-block]` is emitted, and the paragraph
   is **not** monospace (`font-mono` absent).
3. **Without** a transcript representation: zero blocks, `font-mono` and
   `whitespace-pre-wrap` still present, `textContent` verbatim. This must fail if
   the transcript branch is applied unconditionally — confirm by temporarily
   forcing the branch, and report what you saw.
4. A highlight wholly inside one block still renders exactly one `<mark>` with
   the right text.
5. A highlight straddling a block boundary renders a `<mark>` in more than one
   block; the concatenation of the marks equals `text.slice(charStart, charEnd)`;
   the container's `textContent` is still verbatim. Derive the range from the
   computed block boundaries — do not hardcode offsets.
6. The existing non-transcript highlight tests still pass untouched.

---

## 4. Allowed files

```
components/collabboard/KnowledgeTextSourceView.tsx
components/collabboard/KnowledgeTextSourceView.test.tsx
components/collabboard/KnowledgeSourceReaderDrawer.tsx      (one prop, nothing else)
components/collabboard/KnowledgeDocumentDetails.tsx         (revert only)
components/collabboard/KnowledgeDocumentDetails.test.tsx    (revert only, keep test 12)
```

**Forbidden:** `lib/domain/knowledge/knowledgeTranscriptReadingLayout.ts` and its
test (landed, correct — reuse unmodified), `KnowledgePdfCanvasSurface.tsx`,
`KnowledgePageCache.tsx`, `knowledgeSourceTextSelection.ts`, `lib/infra/`,
`app/api/`, `supabase/migrations/`, `package.json`.

The card's 600-character excerpt is **out of scope** and is a separate decision.

---

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/KnowledgeTextSourceView.test.tsx
npx vitest run components/collabboard/KnowledgeDocumentDetails.test.tsx
npx vitest run
```

Failing FILE set equal to the 26 baseline. `KnowledgeTextSourceView.test.tsx` and
`KnowledgeDocumentDetails.test.tsx` are **not** baseline members — both must pass
outright. Also confirm the toolbar source test still passes
(`keeps the grip out of the canonical text root`), since §2.1 moves code near the
400-character window it guards; report the measured distance.

No production build; a dev server is running.

**AND ONE THING NO GATE CAN CHECK, WHICH IS WHY THIS PATCH EXISTS:** state
plainly in your report which code path a transcript takes to reach the renderer
you changed, quoting the routing that proves it. A passing test is not evidence
that the product can reach the code.

---

## 6. Hard stops

- Any `textContent` mismatch, or any change to the source text.
- A failing-file set differing from the 26, or new failing names inside a
  baseline member.
- Discovering that a transcript does not in fact reach
  `KnowledgeTextSourceView` — stop and report, do not chase it further.

---

## 7. Commit message (verbatim)

```
fix(knowledge): put the transcript reading layout where a transcript renders

PATCH-157 shipped dead. The reader routes on kind: a transcript is kind 'text'
and renders through KnowledgeTextSourceView, while KnowledgeDocumentDetails is
reached only when kind is 'pdf'. transcript_representation is non-null only on
text documents, so the branch 157 added to the PDF reader could never be true.
Seven tests asserted a configuration the application cannot produce.

It was authored that way because the search found a renderer of page text that
already had a transcriptRepresentation prop -- a prop that is there for the
disclosure notice, not for rendering. Matching a prop name is not evidence of a
code path. There are three renderers of document text, and the routing, not the
grep, says which one a transcript reaches.

So: the unreachable branch and the range-clamping that existed only to serve it
are removed from the PDF reader, which returns byte-for-byte to its pre-157
rendering. The reading-layout module is unchanged and is now used for real, in
KnowledgeTextSourceView, where a transcript loses its monospace and its
per-cue line breaks and reads as paragraphs. A citation highlight straddling a
paragraph renders in each, and scrolls to the first.

Kept from 157: the shared-emphasis guard on the PDF path. It pins pre-existing
behaviour nothing else pinned, which is how 157's intermediate version broke it
unnoticed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
