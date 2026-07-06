# Coding Standards

Extends the repo-wide rules in `.claude/rules/` (common + typescript). This file adds Fable-5-specific standards and resolves conflicts. Where `.claude/rules` and this file disagree, this file wins for the Fable 5 codebase.

## 1. Language & Types

- TypeScript strict mode; no `any` (use `unknown` + narrowing); no non-null `!` outside tests.
- Exported functions carry explicit parameter/return types.
- All external input (API bodies, JSONB from DB, localStorage, URL params, AI output) crosses the boundary through a **zod schema**. `lib/ai/validators.ts` is the house pattern — apply it everywhere.
- Domain IDs are branded types (`PostId`, `BoardId`) to prevent cross-entity ID mixups.
- String literal unions over enums.

## 2. Architecture Boundaries (ESLint-enforced, not honor-system)

Add to `eslint.config.mjs`:

- `no-restricted-imports`: `@supabase/*` importable only in `lib/infra/**`; `lib/infra/**` importable only from `lib/domain/**`; `components/ui/**` may not import from `lib/domain`.
- Max file size 800 lines (warning at 400) via lint rule; CI fails on *new* violations (existing offenders are grandfathered on a burn-down list, but any touched file must not grow).
- `no-console` error in `app/`, `components/`, `lib/` (a structured logger wraps the few legit cases; `lib/collabboard/debugCanvasLogger.ts` becomes dev-flag-gated or dies).

## 3. Repository Hygiene (immediate, cheap, mandatory)

The repo currently contains committed noise that must go and never return:

- ❌ Backup copies: `backup_files/`, `*.backup.md`, `*.pre-cleanup-backup`, `components/collabboard/backup_file/`, `testNoteEditor.tsx`, `grok_not_working_page.tsx` → **git is the backup system**; delete them.
- ❌ Build/debug artifacts: `tsc_output.txt`, `current_tsc_output.txt`, `devserver*.log`, `tmp/`, `tmp-line-debug/`, `error_Logs/` → delete + `.gitignore`.
- ❌ Root-level ad-hoc scripts and SQL (`test-*.js`, `fix_*.js`, `supabase_*.sql`) → fold into `scripts/` or `supabase/migrations/` or delete.
- ❌ "backup: snapshot" commits on `master` → work on branches, merge to `main` (note: repo default says `main`, current branch is `master` — pick `main`, align).

## 4. Naming

- Product-neutral domain names: `board`, `post`, `block`, `placement`, `section`. The words `padlet`/`Padlet` may not appear in *new* code (P7); existing occurrences are on the Phase 1 rename list.
- Files: `PascalCase.tsx` components, `camelCase.ts` modules, folders by feature.
- Ops named `entity.verb` (`post.move`, `comment.add`).

## 5. Errors & Logging

Per common rules (explicit handling, no swallowing) plus:

- Commands return `Result<T, DomainError>` (typed discriminated union) — UI maps `DomainError.code` to user-facing copy; no raw `error.message` in the UI.
- Every catch either handles meaningfully or rethrows with context. `catch {}` is lint-banned.
- Client errors → Sentry with board id + op type (no content payloads — privacy).

## 6. Dependencies

- New runtime dependency ⇒ PR description states: license, bundle size, and the alternative considered. GPL/AGPL and unlicensed code are banned from the client bundle (SECURITY.md §Licensing).
- **One library per job** (P6). Current duplications to resolve: `moment` + `dayjs` (keep dayjs), two DnD paradigms (keep `@dnd-kit`), `html2canvas`+`jspdf` vs other exporters (consolidate in `lib/export`).
- Vendored forks (excalidraw_fork) carry a `FORK_NOTES.md`: upstream commit, local patches, re-sync procedure.

## 7. Comments & Docs

- Comments state invariants and *why*, never narrate the code or its history.
- Every `lib/domain` module has a top-of-file contract comment (inputs, guarantees, failure modes).
- Cross-cutting decisions get a dated entry in `docs/ARCHITECTURE.md` §Challenged Decisions or a short ADR in `.fable5/docs/adr/` once we start Phase 1.

## 8. Git & Reviews

- Conventional commits (`feat:`, `fix:`, `refactor:`, …) per `.claude/rules/common/git-workflow.md`.
- PRs small enough to review in 15 minutes; refactors and behavior changes in separate PRs.
- Review checklist = `.claude/rules/common/code-review.md` + the Definition of Done in COMPONENT_GUIDELINES.md §6.
- Security-sensitive paths (auth, share links, uploads, Stripe, RLS) require the security checklist (SECURITY.md) explicitly ticked.
