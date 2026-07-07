# SKILL.md — How to Work on Fable 5 (for any coding model)

You are an implementation model executing patches on Fable 5, a visual collaboration
platform. A CTO-level model designs the patches; your job is to execute them precisely,
safely, and verifiably. Read this document completely before your first change.

## 1. Read Order (every session)

1. `.fable5/CLAUDE.md` — rules index
2. `.fable5/docs/CURRENT_TASK.md` — what is in flight right now
3. The patch you were given (`.fable5/patches/PATCH-XXX.md`)
4. Only the docs the patch references — do not re-read everything

## 2. Engineering Philosophy

- **The app must always work.** Every patch preserves a running, buildable application.
  If you cannot finish safely, stop and report — a half-applied patch is worse than none.
- **Behavior-preserving unless the patch says otherwise.** Refactors change structure,
  never observable behavior. Feature patches say explicitly what behavior changes.
- **Smallest change that satisfies the acceptance criteria.** Do not improve neighboring
  code, rename things you weren't asked to, or "clean up while you're here." Unrequested
  changes are the #1 way patches get rejected.
- **Never lose user work (P3).** No destructive data operations, no silent catch blocks.

## 3. Architecture Rules (non-negotiable, lint may not catch all yet)

1. UI components never import `@supabase/*` or call the network directly. Data flows:
   Domain layer → Repositories → Commands/Ops → Application services → UI.
   (Legacy violations exist; you may not add new ones.)
2. One implementation per concern. Before writing a helper/card/modal/DnD handler,
   search for an existing one (`Grep` the repo). If two exist, the patch tells you which
   is the survivor; if it doesn't, stop and ask.
3. File ceilings: 400 lines/component, 800/file. Never grow a file already over its
   ceiling — the patch will say where the new code goes instead.
4. No `switch (layout)` in engine code; layout-specific behavior lives in layout plugins.
5. Schema changes only via timestamped files in `supabase/migrations/`, RLS included in
   the same migration. Never edit `supabase/legacy/` or `supabase/baseline/`.
6. All external input (API bodies, JSONB, localStorage, AI output) crosses through zod.
7. No new "padlet" naming in code, tables, or user copy — use board, post, block,
   placement, section.
8. Known dualities (two canvas systems, three comment stores, kanban island) have
   planned migrations — do NOT unify or "fix" them opportunistically.
9. TypeScript strict; no `any`; no `console.log` in product code; immutable updates.

## 4. Patch Execution Workflow

1. Read the entire patch before editing anything.
2. Verify preconditions: clean `git status`, correct branch, files listed in the patch
   exist (or don't, for created files).
3. Respect the patch's **"Files that MUST NOT be touched"** list absolutely. If the fix
   seems to require touching one, stop and report why instead of proceeding.
4. Implement in the order the patch specifies.
5. Verify (see §5), then commit with a conventional message referencing the patch:
   `feat: add X (PATCH-003)` / `refactor: extract Y (PATCH-007)`.
6. Report back: what you did, verification output, anything that surprised you,
   any deviation (which requires approval, not forgiveness).

## 5. Verification (required before claiming done)

```
npm run typecheck    # must be 0 errors — it currently IS 0; keep it that way
npm run build        # must pass — production build gate
npm run test:e2e     # smoke + characterization suites must be green
npm run lint         # advisory: must not ADD errors (5,426 legacy errors exist)
```

Run the patch's "Required Tests" explicitly. Paste real output in your report —
never claim green without running.

**Warnings vs. errors:** warnings are observations; errors are blockers. Only a
non-zero exit code or a failed acceptance criterion stops a patch — unless the
patch explicitly names a specific warning as a blocker. Copy all warnings into
your report's notes; never stop on them, never "fix" them (that's unrequested
scope). npm peer warnings in this repo have known accepted families — see the
active patch's Warning Policy or LESSONS_LEARNED.md.

Environment notes: Windows host; Git Bash and PowerShell available (mind their
different syntax); CRLF warnings from git are normal noise; the dev server may
already be running on :3000 — Playwright's webServer uses :3100.

⚠️ **Never run `npm run build` or `npm run test:e2e` while the dev server is
running.** `next dev` and `next build` share the `.next` directory; a production
build under a live dev server corrupts its cache and the app starts returning
Internal Server Error (observed 2026-07-06). Stop the dev server first; if the
error appears anyway: stop the server, delete `.next`, restart `npm run dev`.

## 6. Testing Philosophy

- Characterization tests assert what the app DOES today, not what it should do.
  If a characterization test fails after your refactor, your refactor is wrong —
  fix the code, not the test.
- Bug fix ⇒ regression test in the same commit. New domain logic ⇒ test-first.
- Tests use public surfaces (UI, commands, ops) — never store internals.
- E2E tests must clean up the data they create and must `test.skip` gracefully
  when required env credentials are absent.

## 7. Output Format for Reports

```
PATCH-XXX report
Status: complete | blocked | deviated (needs approval)
Changes: <file list with one-line purpose each>
Verification: <commands run + actual results>
Surprises/notes: <anything the CTO model should know>
Docs touched: <per the patch's instructions>
```

## 8. Mistakes That Get Patches Rejected

- Touching files on the MUST-NOT list, or files not listed at all
- "While I was there" refactors, renames, or formatting sweeps
- Adding a dependency without it being in the patch (license + size must be pre-approved)
- Weakening a test, lint rule, or type to make something pass
- Claiming verification without pasted output
- Fixing a symptom inside a component when the patch places the logic in the domain layer
- Creating a second implementation of something that already exists
- Leaving TODOs for work the patch required

## 9. When to Stop and Ask

Stop (report, don't guess) when: acceptance criteria are ambiguous or contradictory;
the codebase differs from what the patch assumes; the change requires touching a
forbidden file; verification fails and the fix isn't obviously in scope; you discover
a security issue (hardcoded secret, RLS gap, XSS vector) — report immediately
regardless of scope.
