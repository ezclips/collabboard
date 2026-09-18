# AGENTS.md

Behavior guidelines for coding agents working in this repository.

This file is intentionally short and operational. It adapts the widely shared
Karpathy-style guardrails for agentic coding work and combines them with this
repo's existing local guidance in `.agent/skill.md` and `.agent/skills/`.

## 1. Think Before Coding

- Do not silently guess when the request is ambiguous.
- State important assumptions before making non-trivial changes.
- If multiple interpretations are plausible, surface them instead of picking one invisibly.
- If the requested approach looks riskier or more complex than needed, say so plainly.

## 2. Prefer Simple Solutions

- Solve the requested problem with the minimum code needed.
- Do not add speculative abstractions, options, or infrastructure.
- Match existing patterns unless there is a concrete reason not to.
- If a small direct fix works, prefer it over a broad redesign.

## 3. Make Surgical Changes

- Touch only code that is directly relevant to the task.
- Do not refactor adjacent code unless the task requires it.
- Do not remove comments, helpers, or old code unless your change makes them obsolete or the user asked.
- Keep diffs narrow and easy to review.

## 4. Work Toward Verifiable Outcomes

- Define what success looks like before changing code.
- When fixing bugs, reproduce or localize the failure path first.
- When practical, verify with the smallest useful check: lint, typecheck, focused test, or direct inspection.
- If verification is not possible, say exactly what remains unverified.
- **A check that encodes the same assumption as the code proves nothing.** Found
  twice, the hard way: a Gemini response fixture that declared the wrong container,
  so it could never fail while the adapter 502'd on every live call; and a git-diff
  hash gate that assumed an environment it could not control. Prefer evidence from
  the real system — a live call, the live catalog, a real captured response body —
  and when only a fixture is possible, say so out loud.
- **No provider adapter is done until it has made a live call.** A fixture built
  from a published shape is not a live call. Gemini was live-broken for text from
  the day it shipped, and only a live attempt found it, because every AI call in
  this project resolves to the managed default. State which adapters you have
  actually called, and which you could not.

## 5. Repo-Specific Notes

- Read `.agent/skill.md` for current repo implementation notes.
- Use relevant files under `.agent/skills/` when the task clearly matches them.
- Prefer `rg` for search and keep context gathering targeted.
- Avoid unrelated cleanup in this codebase because the worktree may contain ongoing user changes.

## 6. Communication

- Be direct, concise, and explicit about tradeoffs.
- For substantial work, give a short plan before editing.
- After changes, summarize what changed, how it was verified, and any remaining risk.

## 7. Known Failure Signature: Dead UI in Dev

Markup looks correct, but every `onClick` on the page is dead and nothing is
visibly wrong. Do not start by blaming the component you were last editing.

- **Cause.** The persistent Playwright Chromium keeps its profile inside the
  project at `.runtime-fixtures/playwright-profile/` and rewrites cache files
  continuously. Next's watcher ignores only `node_modules` and `.next`, so it
  recompiles forever — the root-layout chunk is rewritten roughly every 6 seconds
  while completely idle. A request arriving mid-rewrite is gzipped from a file
  webpack is still writing, so the browser receives a **truncated script**, throws
  `SyntaxError: Invalid or unexpected token`, and React never hydrates.
- **Check first.** That SyntaxError in the console; whether the served chunk's
  decompressed size matches the file on disk; whether its mtime is advancing while
  nothing is happening.
- **Already fixed** in `next.config.ts` as dev-only watch ignores
  (`.runtime-fixtures/`, `.playwright-mcp/`, `test-results/`,
  `playwright-report/`), with the first two in `.gitignore`. Production builds are
  unaffected — do not "fix" this again without evidence it has regressed.
- **Related trap.** Navigation written as `<button onClick={router.push(...)}>`
  also dies with the bundle, because it has no href. Use `<Link>` / `<a href>`;
  reserve `router.push` for programmatic redirects (post-submit, auth).
- **Say which build you verified against.** `next dev` and a production
  `next build` / `next start` share `.next`, so a result from one says nothing
  about the other — and never build while a dev server is running.
