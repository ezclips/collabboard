// Architecture boundary freeze (PATCH-002, .fable5/patches/PATCH-002.md).
// ONE rule: UI code must not import @supabase/* directly.
// Enforced as a BLOCKING gate via `npm run check:boundaries` (verify + CI).
// STANDALONE config - deliberately NOT spread into eslint.config.mjs (its
// global ignores would disable all main-lint coverage for those paths).
// The grandfather list may only SHRINK. Never add a file to it.
import tsParser from '@typescript-eslint/parser';

// Existing violators, frozen 2026-07-07. Remove entries as files are migrated
// to the domain layer (lib/domain). Adding an entry requires CTO sign-off.
// NOTE: [ and ] are glob character classes — Next.js dynamic-route folders
// like [id] must be escaped (\\[id\\]) or the ignore silently misses the file.
const GRANDFATHERED_UI_FILES = [
  'app/collabboard/canvas/\\[id\\]/page.tsx',
  'app/dashboard/canvas/\\[id\\]/CanvasClient.tsx',
  'app/dashboard/settings/delete-account/page.tsx',
  'app/dashboard/settings/integrations/page.tsx',
  'app/dashboard/settings/members/page.tsx',
  'app/dashboard/settings/page.tsx',
  'app/dashboard/settings/password/page.tsx',
  'app/dashboard/settings/profile/page.tsx',
  'app/page.tsx',
  'app/share/\\[token\\]/page.tsx',
  'components/canvas/AddPadletMenu.tsx',
  'components/collabboard/PostCardContent.tsx',
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
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
  {
    // Domain purity (PATCH-003): lib/domain imports no UI or infrastructure.
    files: ['lib/domain/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'next', 'next/*', '@supabase/*', '@/components/*', '@/app/*'],
              message:
                'lib/domain must stay pure: no UI, no framework, no infrastructure imports (lib/domain/CONVENTIONS.md rule 1).',
            },
          ],
        },
      ],
    },
  },
];
