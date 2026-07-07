# PATCH-002 — Architecture boundary freeze: no new `@supabase/*` imports in UI

**Status:** draft (awaiting owner approval)

## Goal
Add a **blocking** check that forbids new direct `@supabase/*` imports in UI code
(`components/**` and `app/**` pages/layouts), grandfathering the 24 existing
violators so nothing breaks today.

## Reason
The core architectural flaw is UI talking straight to the database
(ARCHITECTURE.md §1.2). We are about to spend weeks extracting those call sites
into a domain layer; every NEW direct import added meanwhile is fresh debt dug
behind us. A freeze makes the debt finite so the extraction can actually finish.

## Why now / why this order
- After PATCH-001 because the freeze needed a working verification pipeline to
  hang off (`verify`, CI) — that now exists.
- Before PATCH-003 (`lib/domain` skeleton) because the skeleton is pointless if
  the monolith keeps growing new violations while we build it.
- Pure config + one small script: zero product-code risk, executable in minutes.

## Expected Outcome
`npm run check:boundaries` exits non-zero when any non-grandfathered UI file
imports `@supabase/*`; it runs inside `npm run verify` and as a **blocking** CI
step. Editors show the same rule via the main ESLint config.

## Files to Create
- `eslint.boundaries.config.mjs` — standalone flat config with ONE rule:
  `no-restricted-imports` (error) for `@supabase/*`, message pointing to
  `.fable5/CLAUDE.md` rule 1. Scope: `components/**/*.{ts,tsx}`,
  `app/**/*.{ts,tsx}`. Excluded (`ignores`): `app/api/**`, `**/route.ts`,
  `components/collabboard/canvas/excalidraw_fork/**`, and the grandfather list
  below (verbatim, with a "burn down, never extend" comment).

## Files to Modify
- `package.json` — add `"check:boundaries": "eslint -c eslint.boundaries.config.mjs \"components/**/*.{ts,tsx}\" \"app/**/*.{ts,tsx}\""`;
  change `verify` to `npm run typecheck && npm run check:boundaries && npm run build`.
- `.github/workflows/ci.yml` — add blocking step "Boundary check" running
  `npm run check:boundaries` (before the build step; it's fast).
- `eslint.config.mjs` — import/spread the boundaries config so editors flag
  violations inline (single source of truth, no duplicated rule definition).

## Files that MUST NOT be touched
- ANY file under `components/`, `app/`, `lib/`, `supabase/`, `types/`, `e2e/`
  (this patch fixes zero violations — it only freezes)
- `next.config.ts`, `middleware.ts`, `playwright.config.ts`

## Grandfather list (24 files — burn down only, never extend)
app/auth/callback/route.ts *(covered by route.ts exclusion — listed for audit only)*
app/collabboard/canvas/[id]/page.tsx
app/dashboard/canvas/[id]/CanvasClient.tsx
app/dashboard/settings/accessibility/page.tsx
app/dashboard/settings/achievements/page.tsx
app/dashboard/settings/ai/page.tsx
app/dashboard/settings/dashboard/page.tsx
app/dashboard/settings/delete-account/page.tsx
app/dashboard/settings/integrations/page.tsx
app/dashboard/settings/logs/page.tsx
app/dashboard/settings/members/page.tsx
app/dashboard/settings/notifications/page.tsx
app/dashboard/settings/page.tsx
app/dashboard/settings/password/page.tsx
app/dashboard/settings/preferences/page.tsx
app/dashboard/settings/profile/page.tsx
app/page.tsx
app/share/[token]/page.tsx
components/ProtectedRoute.tsx
components/canvas/AddPadletMenu.tsx
components/collabboard/PostCardContent.tsx
components/collabboard/canvas/ui/CanvasModals.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/ui-kit/Navbar.tsx

## Architecture Notes
- Server code (`app/api/**`, `**/route.ts`) is out of scope: routes legitimately
  use Supabase until repositories exist (PATCH-003+). The freeze is for UI only.
- `lib/supabase-provider` (`useSupabase()`) remains permitted — it is the legacy
  sanctioned pattern until commands replace it; freezing it now would freeze all
  feature work. The domain layer migration retires it later.
- Known limitation (accepted): grandfathered files can still ADD violations
  internally. The per-file list keeps the blast radius shrinking as files are
  extracted and removed from the list.

## Migration Notes
None. No schema, no data, no runtime behavior.

## Potential Risks
- ESLint flat-config `-c` quirks with Next's bundled ESLint → verify the script
  runs on ESLint 9 CLI directly; if `next lint` conflicts, keep the standalone
  config as the only enforcement (drop the editor spread, note it in the report).
- Glob differences on Windows shells → quote the globs exactly as specified.

## Rollback Plan
`git revert` the single patch commit. Nothing else depends on it.

## Acceptance Criteria
- [ ] `npm run check:boundaries` passes on the current tree (0 errors)
- [ ] Adding `import { createClient } from '@supabase/supabase-js'` to any
      non-grandfathered component makes it fail (demonstrate, then remove)
- [ ] `npm run verify` includes and passes the check
- [ ] CI workflow has the blocking step
- [ ] `git diff` touches only the four listed files

## Required Tests
The two check runs above (clean pass + induced failure) with output pasted in
the report. No new e2e/unit tests.

## Estimated Difficulty
easy
