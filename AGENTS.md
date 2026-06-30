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

## 5. Repo-Specific Notes

- Read `.agent/skill.md` for current repo implementation notes.
- Use relevant files under `.agent/skills/` when the task clearly matches them.
- Prefer `rg` for search and keep context gathering targeted.
- Avoid unrelated cleanup in this codebase because the worktree may contain ongoing user changes.

## 6. Communication

- Be direct, concise, and explicit about tradeoffs.
- For substantial work, give a short plan before editing.
- After changes, summarize what changed, how it was verified, and any remaining risk.
