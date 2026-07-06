# Current Task

> Living document. Update at the start and end of every working session. History goes to the log at the bottom; only ONE task is "Now".

## Now

**Phase 0 — Stop the Bleeding** (ROADMAP.md)

**Active task:** none assigned — next session should pick the first Phase 0 item.

**Recommended first task:** Repo hygiene purge + CI gate.
1. Delete committed noise (backup files, `devserver*.log`, `tsc_output.txt`, `current_tsc_output.txt`, `tmp/`, `tmp-line-debug/`, `error_Logs/`, `backup_files/`, `*.backup.md`, `*.pre-cleanup-backup`, `grok_not_working_page.tsx`, `testNoteEditor.tsx`) and extend `.gitignore`.
2. Reconcile root `supabase_*.sql` files against prod schema → single baseline migration (`supabase db diff`), delete the four `live_schema_dump*.sql`.
3. Get `tsc --noEmit` to zero errors; add typecheck + lint + build as CI gate.

**Definition of done:** clean `git status` after build/dev-server run; `supabase/migrations` rebuilds the schema on a fresh local instance; CI red on type errors.

## Blocked / Decisions Needed

| Decision | Owner | Needed by | Notes |
|---|---|---|---|
| dhtmlx buy-vs-replace | CTO | Phase 0 exit | GPL exposure (SECURITY.md §4); recommendation: replace |
| Surviving canvas system (`components/canvas` vs `components/collabboard/canvas`) | CTO | Phase 1 | Needs feature diff first |
| Default branch `master` vs `main` | — | Phase 0 | Repo config says `main`, work happens on `master`; align |

## Context for a Fresh Session

- Read `.fable5/CLAUDE.md` first, then this file.
- Working tree currently has uncommitted changes across 13 canvas/collabboard/map components — inspect `git status` and either land or stash them deliberately before hygiene work (do not sweep user changes into a cleanup commit).
- Comment storage is split across `metadata.comments` / `detachedComments` / `canvas_comments` with three UI systems — do not "fix" this opportunistically; it's a planned Phase 3 migration (DATABASE.md §5).

## Log

- **2026-07-06** — Architecture audit completed; `.fable5/docs` documentation suite created (20 docs). Phase 0 defined and ready to start.
