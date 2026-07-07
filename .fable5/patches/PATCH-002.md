# PATCH-002 — Architecture boundary freeze: no new `@supabase/*` imports in UI

**Status:** DONE (2026-07-07, commit a7fe12c). Implemented by Codex GPT-5.4;
CTO review found the implementation spec-faithful but the SPEC itself had two
defects (both fixed in review): unescaped `[id]`/`[token]` glob character
classes in ignore paths, and unknown-rule errors from inline disable comments
(fixed with `--no-inline-config`, which also hardens the check against
eslint-disable circumvention). Codex skipped Step 4 verification and Step 5
commit — verification would have caught both defects; flagged for future
delegation prompts. All four verification runs green.

**Spec change vs. draft (CTO, 2026-07-07):** `eslint.config.mjs` is NO LONGER
modified. Spreading the boundaries config there would globally ignore `app/api`
and the grandfathered files for ALL lint rules, silently shrinking main lint
coverage. The standalone config + blocking script is the only enforcement;
editor integration comes later with the lint overhaul.

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
- `package.json` — add the `check:boundaries` script; extend `verify`.
- `.github/workflows/ci.yml` — add blocking "Boundary check" step.
- ~~`eslint.config.mjs`~~ — DROPPED (see status note: global-ignores side effect).

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

---

# Final Implementation Specification (execute exactly this)

**For the implementation model.** Read `.fable5/docs/SKILL.md` first. Preconditions:
clean `git status` on branch `master`; do NOT run `npm run build` or any e2e while
the owner's dev server is running (SKILL.md guard) — this patch needs neither.
Node/ESLint context: ESLint ^9 (flat config), `@typescript-eslint/parser` is
available via `eslint-config-next`'s dependencies. Windows host.

## Step 1 — CREATE `eslint.boundaries.config.mjs` (repo root)

Exact content (the grandfather list is final — copy verbatim):

```js
// Architecture boundary freeze (PATCH-002, .fable5/patches/PATCH-002.md).
// ONE rule: UI code must not import @supabase/* directly.
// Enforced as a BLOCKING gate via `npm run check:boundaries` (verify + CI).
// STANDALONE config — deliberately NOT spread into eslint.config.mjs (its
// global ignores would disable all main-lint coverage for those paths).
// The grandfather list may only SHRINK. Never add a file to it.
import tsParser from '@typescript-eslint/parser';

// Existing violators, frozen 2026-07-07. Remove entries as files are migrated
// to the domain layer (lib/domain). Adding an entry requires CTO sign-off.
const GRANDFATHERED_UI_FILES = [
  'app/collabboard/canvas/[id]/page.tsx',
  'app/dashboard/canvas/[id]/CanvasClient.tsx',
  'app/dashboard/settings/accessibility/page.tsx',
  'app/dashboard/settings/achievements/page.tsx',
  'app/dashboard/settings/ai/page.tsx',
  'app/dashboard/settings/dashboard/page.tsx',
  'app/dashboard/settings/delete-account/page.tsx',
  'app/dashboard/settings/integrations/page.tsx',
  'app/dashboard/settings/logs/page.tsx',
  'app/dashboard/settings/members/page.tsx',
  'app/dashboard/settings/notifications/page.tsx',
  'app/dashboard/settings/page.tsx',
  'app/dashboard/settings/password/page.tsx',
  'app/dashboard/settings/preferences/page.tsx',
  'app/dashboard/settings/profile/page.tsx',
  'app/page.tsx',
  'app/share/[token]/page.tsx',
  'components/ProtectedRoute.tsx',
  'components/canvas/AddPadletMenu.tsx',
  'components/collabboard/PostCardContent.tsx',
  'components/collabboard/canvas/ui/CanvasModals.tsx',
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
  'components/collabboard/canvas/ui/OverlayLayer.tsx',
  'components/ui-kit/Navbar.tsx',
];

export default [
  {
    // Global ignores: pruned during traversal (fast; excalidraw_fork contains
    // a vendored node_modules). Server code is out of scope until the domain
    // layer exists: app/api/** and all route.ts handlers.
    ignores: [
      '**/node_modules/**',
      'app/api/**',
      '**/route.ts',
      'components/collabboard/canvas/excalidraw_fork/**',
      ...GRANDFATHERED_UI_FILES,
    ],
  },
  {
    files: ['components/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*'],
              message:
                'UI code must not import Supabase directly (PATCH-002 freeze). Use the domain layer (lib/domain) or, until it covers this feature, the legacy lib/supabase-provider. See .fable5/CLAUDE.md rule 1.',
            },
          ],
        },
      ],
    },
  },
];
```

## Step 2 — MODIFY `package.json` (two edits inside `"scripts"`)

1. Add (keep alphabetical-ish placement near the other checks):
```json
"check:boundaries": "eslint --no-warn-ignored -c eslint.boundaries.config.mjs \"components/**/*.{ts,tsx}\" \"app/**/*.{ts,tsx}\"",
```
2. Replace the existing `"verify"` value with:
```json
"verify": "npm run typecheck && npm run check:boundaries && npm run build"
```
No other package.json changes. Do not touch dependencies.

## Step 3 — MODIFY `.github/workflows/ci.yml`

Insert this step between the "Typecheck (blocking)" step and the "Lint (advisory…)"
step, matching the file's existing indentation:

```yaml
      - name: Boundary check (blocking)
        run: npm run check:boundaries
```

## Step 4 — VERIFY (all output pasted into your report)

```bash
npm run check:boundaries          # MUST exit 0 with no rule errors
npx tsc --noEmit                  # MUST report 0 errors (unchanged)
```

Induced-failure proof (create → check → MUST fail → delete):
```bash
printf "import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n" > components/__boundary-canary.ts
npm run check:boundaries          # MUST exit non-zero citing no-restricted-imports
rm components/__boundary-canary.ts
npm run check:boundaries          # MUST exit 0 again
```

If `--no-warn-ignored` is rejected by the installed ESLint version, drop that
flag and re-run; if "File ignored" warnings then appear but exit code behavior
is correct, that is acceptable — note it in the report.

## Step 5 — COMMIT

Single commit, exactly these files: `eslint.boundaries.config.mjs`,
`package.json`, `.github/workflows/ci.yml`.

```
chore(arch): add blocking UI boundary check — no new @supabase imports (PATCH-002)
```

## Step 6 — REPORT (format from SKILL.md §7)

Status / changes / verification output (all four runs) / surprises / docs: state
that CURRENT_TASK.md + CHANGELOG_ARCHITECTURE.md updates are left to the CTO
review pass — do NOT edit `.fable5/` yourself.

## Hard boundaries (reject-on-touch)
Everything under `components/`, `app/`, `lib/`, `supabase/`, `types/`, `e2e/`
(except the temporary canary file, which must not survive the commit),
`next.config.ts`, `middleware.ts`, `playwright.config.ts`, `eslint.config.mjs`,
anything in `.fable5/`. Fix ZERO existing violations.
