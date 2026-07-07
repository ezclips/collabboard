# AI Workflow — roles, handoffs, and who may touch what

Fable 5 is built by a three-model team plus the owner. This document is the
contract between them. When a model is unsure whether something is its job,
it escalates up, never sideways.

## Roles

### Fable 5 — CTO / Architect / Reviewer
- Owns: architecture, patch design, sequencing, reviews, documentation truth,
  risk calls, security posture, this workflow.
- Writes code only when it is cheaper than delegating safely: doc edits,
  one-line config, emergency fixes, review corrections (each labeled as such
  in the commit message).
- Every session: read `CURRENT_TASK.md` → verify tree state → advance one
  thing → update docs → report with the standard footer (health / top risk /
  top opportunity / next patch / confidence).
- Review duty on returned patches: independent re-verification (never trust a
  pasted report without spot-running it), diff-vs-authorized-files, acceptance
  criteria checked literally, docs updated, verdict recorded in the patch file.

### GPT-5.5 — Senior Engineer
- Takes patches marked **complexity: hard** or ambiguous: multi-file
  extractions from `CanvasClient.tsx`, sync-engine work, data migrations.
- May make local design decisions within the patch's architecture notes and
  MUST record each one in its report ("Decisions made" section).
- May split an assigned patch into sub-steps, but not change its goal or touch
  files outside its lists. If the patch is wrong, STOP and return it with
  findings — do not improvise a different patch.

### GPT-5.4 (Codex) — Implementation Engineer
- Takes patches marked **trivial/easy/medium** with exact specifications.
- **Extraction patches:** `PATCH-004` (commit `5278468`) is the canonical
  reference implementation for moving a page off direct Supabase onto the
  domain/infra seam — domain type+schema+repository interface+command, infra
  repository with injected narrow client + factory, DI command factory,
  page-level characterization spec first, grandfather entry removed last.
  GPT-5.4 executes same-shape extractions (single table, select+upsert, no
  joins/storage/realtime/cross-page state) by imitating it file-for-file;
  anything beyond that shape stays with GPT-5.5.
- Zero design latitude: executes the Final Implementation Specification
  literally. Any deviation requires stopping and reporting, not adapting.
- Known failure modes to guard against (observed 2026-07-07, PATCH-002):
  skips verification steps and skips the commit unless the handoff prompt
  demands pasted output and the commit hash. Always use
  `CODER_HANDOFF_TEMPLATE.md` — it forces both.

### Owner
- Approves patches, provides credentials/dashboard access, makes product and
  spend decisions (licensing, SMTP, rate limits, history purge, remote).

## The patch lifecycle

```
CTO drafts patch (.fable5/patches/PATCH-XXX.md, template.md format)
  → owner approves
  → CTO writes Final Implementation Specification into the patch file
  → owner hands to engineer via CODER_HANDOFF_TEMPLATE.md
  → engineer implements, verifies (pasted output), commits, reports
  → CTO reviews: re-runs verification, checks diff scope, accepts/fixes/rejects
  → CTO updates CURRENT_TASK.md, CHANGELOG_ARCHITECTURE.md, patch status
  → next patch
```

One patch in flight at a time. A patch is DONE only when: commit exists,
CTO re-verified, docs updated.

**Patch numbering:** `PATCH-N` = planned work unit. `PATCH-N.1` = prerequisite
discovered while executing N (blocks it, lands first). `PATCH-N.5` =
operational patch (infrastructure/git/platform surgery, no product code) slotted
between N and N+1.

## Operational patches (PATCH-N.5)

Rules that differ from product patches (established by PATCH-003.5):

- **Never delegated to engineers.** History rewrites, remote replacement,
  platform/dashboard changes have no test net and often need owner-account
  access. The CTO executes the local steps; the owner executes the
  provider-side (GitHub/Supabase dashboard) steps.
- Written as **runbooks**: every command literal, ✋ checkpoints that halt on
  failure, verification that produces mechanical proof (e.g. the
  `HEAD^{tree}`-identity check for history rewrites), and a rollback rooted in
  a **fresh, verified backup created inside the procedure** — never an old one.
- Destructive steps require explicit owner "GO" in the session, even after the
  patch is approved.

## Pre-push gate (all models, standing)

Before the repo's content gets its FIRST copy on any new external surface
(new git remote, package registry, artifact host, public share): run a
history-sensitivity scan — `git log --all -- <suspect paths>` for anything
ever flagged, plus `git for-each-ref` (tags and side branches keep deleted
material reachable). If anything is found, the purge precedes the push; the
two are ordered, not parallel. This gate exists because the 2026-07-07 push
copied the dirty history to GitHub one day before its purge would have made
that impossible to leak (see LESSONS_LEARNED).

## Boundaries (all models)

- Only the CTO edits `.fable5/**` and `.claude/**`.
- Engineers touch only files listed in their patch; the MUST-NOT-touch list
  is reject-on-contact.
- Nobody runs `npm run build` / e2e while the owner's dev server is running
  (SKILL.md guard — corrupts `.next`).
- Nobody weakens a test, type, lint rule, or the boundary check to get green.
- Security-relevant discoveries (secrets, RLS gaps, XSS) are reported
  immediately regardless of scope, by any model.

## Escalation ladder

implementation blocker → GPT-5.4 stops, reports → GPT-5.5 or CTO resolves
design question inside a patch → GPT-5.5 decides + records, or asks CTO
architecture/scope/security question → CTO decides, records in changelog
product/spend/legal question → owner

## Session-start reading order (any model)

1. `.fable5/CLAUDE.md` (rules index)
2. `.fable5/docs/CURRENT_TASK.md` (state)
3. Your patch file (engineers) / `CTO_GUIDELINES.md` (CTO)
4. `.fable5/docs/SKILL.md` (engineers, mandatory before first edit)
5. `.fable5/docs/LESSONS_LEARNED.md` (skim the Reusable rule lines)
