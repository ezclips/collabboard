# PATCH-179 — Readable transcripts: a space may move, the letters may not

Status: AUTHORIZED (owner decision, 2026-09-24)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-178 (`823f2d24`)
Read first: `lib/domain/knowledge/transcriptPunctuationProjection.ts`, the whole file, including
its header

---

## 1. Why — measured, and decided by the owner

Live on the chess transcript after PATCH-178, 6 of 10 passages became readable. The CTO
diagnosed the 4 refusals. They were not misheard words. The AI had moved a space, and the
letters were IDENTICAL:

| Captions | Model | Letters | Today |
|---|---|---|---|
| `queen spawn` | `queen's pawn` | `queenspawn` = `queenspawn` | refused (`word-mismatch`) |
| `theorybased` | `theory-based` | `theorybased` = `theorybased` | refused (`word-count-mismatch`) |
| `setup based` | `setup-based` | same | accepted (a hyphen join) |

**The owner's rule (PATCH-162) is: every letter and digit unchanged, in order.** The projection
is stricter than that: it also freezes where the word boundaries fall. The owner has now decided
that a boundary may move, bounded to neighbouring words.

**The accepted risk, stated:** a moved space can change meaning, for example `now here` versus
`nowhere`. The letters are still exactly what the captions said, and "As spoken" always shows
the original captions.

## 2. The rule — `lib/domain/knowledge/transcriptPunctuationProjection.ts`

`projectTranscriptPunctuation(original, modelOutput)` keeps its signature and its result
type.

### 2.1 When a passage is accepted

1. **Letters must be identical.** Compute each side's LETTER STREAM: the concatenation of
   `comparablePart` over its word parts, i.e. letters and digits only, lowercased. If the two
   streams differ in any way, REFUSE. This is the same `validation` error shape as today:
   - use `reason: 'word-count-mismatch'` when the part counts differ;
   - otherwise use `reason: 'word-mismatch'`, with the first differing PART index for the
     original.

   Keep both messages' wording style.
2. **Every boundary change must be local.** The streams are equal, so compare boundary
   positions. A boundary is the letter offset where a part starts; offset 0 is excluded. The
   offsets both sides share split the stream into REGIONS. Inside a region the two sides may
   have different boundaries. **Every region must contain at most 3 original parts AND at most
   3 model parts.** Otherwise REFUSE with a new `reason: 'boundary-shift-too-wide'`, and
   `firstDifference` set to the original part index where that region starts. The message:
   `The model regrouped too many words at position {i}. The words must not change, so this
   chunk was not used.`
3. **Today's case still works.** If every boundary is shared (the common case), the behaviour
   is today's, byte for byte.

### 2.2 How the output is built

- The output is built from the **model's segmentation** (its parts, hyphens and spaces), but
  every letter and digit is taken from the ORIGINAL letter stream at the same global offset.
  The original's own case is kept, except for the first letter of each MODEL part, which may
  take the model's case exactly as today.
- In-word apostrophes and hyphens from the model are kept as today. Trailing allowed marks are
  kept as today.
- Implement this by slicing the original's letter stream at the model's part boundaries into
  "virtual original parts", then running the EXISTING per-part rebuild loop over
  `(virtualOriginalPart, modelPart)` pairs. Don't write a second rebuild.

### 2.3 What stays the same

- Update the header comment and the GUARANTEE block. The guarantee becomes: "Every letter and
  digit in the output comes from the original, in the same order, with nothing added,
  removed, reordered or substituted. The model contributes only punctuation, in-word
  apostrophes and hyphens, the case of a part's first letter, and **where spaces fall, within
  at most three neighbouring words**."
- `PunctuationProjection` gains `resegmentedParts: number`, a diagnostic counting the model
  parts inside non-trivial regions. Nothing reads it except tests.
- Chunking, `readableTranscriptParagraphs` and ALLOWED_MARKS are unchanged.

### 2.4 Before coding: check who reads the readable text

Is the READABLE text ever mapped back word by word to the original (for example to cue
timestamps or highlights)? Search `components/`, `lib/` and `app/`:
- If nothing maps it back, say so in your report.
- **If something does, STOP and ask.**

## 3. Tests — `lib/domain/knowledge/transcriptPunctuationProjection.test.ts`

**ADD:**
- `they play kings pawn queen spawn is that` + `They play king's pawn, queen's pawn, is that`
  → accepted. The output is exactly `They play king's pawn, queen's pawn, is that`, with its
  letters from the original.
- `theorybased openings` + `Theory-based openings` → accepted, output `Theory-based openings`.
- `setupbased` + `setup based` → accepted, output `setup based`.
- `now here` + `nowhere` → accepted. A named test for the stated risk, with a comment saying the
  owner accepted it.
- Refused with `boundary-shift-too-wide`:
  - `a b c d` + `abcd` (4 parts regrouped);
  - `ab cd ef gh` + `a bc de fg h`: the whole stream regrouped, with no shared boundary inside.
- Still refused (letters changed): `night` + `knight`; an added word; a removed word; two words
  swapped (`pawn queen` + `queen pawn`, unless the letters coincide).
- **Case:** `iphone` + `iPhone` keeps the original's lowercase `p` (only the first letter's
  case may change). Assert the exact output.
- **PROPERTY TEST.** A deterministic seeded loop of 3,000 cases: random word lists; the model
  output is a random transform:
  - moving a space within ≤3 words, adding marks, recasing, or adding apostrophes and hyphens,
    and sometimes changing a letter;
  - for EVERY accepted case, the output's letter stream equals the original's, exactly and
    case-insensitively, and each output letter's case equals the original's, except at the
    first letter of a part;
  - every case where a letter was changed is refused.

**Existing tests:**
- Any existing test that asserts a now-allowed case is refused (for example a merge or split
  with identical letters) changes DELIBERATELY. List each one in your report with its old and
  new expectation.
- Every other existing assertion is untouched.
- The route and reader suites (`transcriptPunctuateRoute.test.ts`,
  `KnowledgeTextSourceView.test.tsx`) must pass unchanged. If one pins a now-allowed refusal,
  report it before changing it.

## 4. Allowed files

```
lib/domain/knowledge/transcriptPunctuationProjection.ts
lib/domain/knowledge/transcriptPunctuationProjection.test.ts
```

Everything else is forbidden. Never use git stash, reset, restore, checkout, clean, commit or
push. Never run a production build.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/knowledge lib/server/ai/transcriptPunctuateRoute.test.ts components/collabboard/KnowledgeTextSourceView.test.tsx
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the §2.4 finding;
- every existing test whose expectation changed;
- the output.

Do not commit. The CTO measures live on the chess transcript.

## 6. Commit message (verbatim)

```
feat(transcript): a readable transcript may move a space, never a letter

The captions of the chess video say "queen spawn" and "theorybased"; the speaker said
"queen's pawn" and "theory-based". The model wrote them correctly and the readable view
refused the whole passage, because it froze where the word boundaries fell as well as the
letters. The owner's rule was always the letters: every letter and digit unchanged, in
order. A passage is now accepted when its letters are exactly the captions' letters, with
spaces allowed to move within at most three neighbouring words; every letter shown still
comes from the captions themselves.

A moved space can change meaning ("now here" and "nowhere"), which the owner accepted; the
letters are always exactly what the captions said, and "As spoken" always shows them as
they were.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
