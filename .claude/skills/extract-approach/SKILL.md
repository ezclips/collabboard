---
name: extract-approach
description: Record HOW a non-trivial architecture/coding problem was solved, immediately after solving it, so future models (CTO or implementer) reuse the approach instead of re-deriving it. Trigger after any debugging session with a surprise, any review that found a defect, any decision that reversed an earlier one, or any task that took 3+ attempts.
---

# Extract Approach — turn solved problems into permanent knowledge

## When this skill fires

Immediately after (not "later"):
- a bug whose root cause was different from the initial hypothesis
- a task that needed 3+ attempts or an unexpected workaround
- a review that found a defect in a spec, patch, or implementation
- an architectural decision that was made, reversed, or corrected
- any discovery about this repo's quirks (build system, auth, selectors, quotas)

If the fix was obvious and first-try, do NOT record it — noise kills the archive.

## Where knowledge lives (one home per fact — P6)

| Kind | Home |
|---|---|
| Project lessons + incident write-ups | `.fable5/docs/LESSONS_LEARNED.md` |
| Architectural decisions/reversals | `.fable5/docs/CHANGELOG_ARCHITECTURE.md` |
| Standing rules for implementers | `.fable5/docs/SKILL.md` |
| Roles & handoff protocol | `.fable5/docs/AI_WORKFLOW.md` |
| The extraction method itself | this file |

Update the existing entry if the topic already exists. Never write the same
fact in two homes; link instead.

## The note format (write into LESSONS_LEARNED.md)

```
### <short title> (<date>, <patch/incident ref>)
**Symptom:** what was observed.
**Wrong path(s):** what was tried/believed first and why it was wrong.
**Root cause:** the actual mechanism, one paragraph.
**Fix:** what resolved it (commit ref).
**Reusable rule:** one sentence a future model can apply without context.
```

The **Reusable rule** line is the product; everything above it is evidence.
If you cannot write the reusable rule, you have not finished understanding
the problem.

## The extraction method (how to get the rule out of the incident)

1. State the *first* hypothesis you had and why it was reasonable — the gap
   between it and the truth is exactly what the note must close.
2. Name the mechanism, not the symptom ("glob character classes" not "ignore
   didn't work").
3. Generalize one level up, no further: "escape `[]` in ESLint ignore paths
   for Next dynamic routes" — not "be careful with globs".
4. Decide enforcement: is a note enough, or should the rule become a lint
   check, a SKILL.md guard, a template line, or a test? Prefer mechanisms
   over memory (a rule nobody re-reads doesn't exist).

## Approach index (what has been extracted so far)

Solved-problem records live in `.fable5/docs/LESSONS_LEARNED.md`. Highlights
by problem class:

- **Legacy-codebase refactor safety** → characterization net first, strangler
  extraction second, freeze third (PATCH-001/002 sequence).
- **Debugging "impossible" persistent failures** → bypass layers one at a time
  to isolate (dev-server 500s = shared `.next`; login 429s = provider per-IP
  buckets, proven by hitting GoTrue directly).
- **UI test authoring in a selector-hostile codebase** → live discovery runs
  that dump real DOM state; read component source for affordances; never
  guess labels ("Move to Trash" ≠ "Delete").
- **Delegating to implementation models** → specs must contain exact file
  contents, verification commands with expected results, and an induced-failure
  proof; assume verification/commit steps get skipped unless demanded.
- **Docs as system, not prose** → every decision has exactly one owning doc;
  update it in the same commit as the change.
