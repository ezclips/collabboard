// @vitest-environment jsdom
//
// This file used to hold characterization + hard-stop documentation for the
// context menus that could not yet be migrated onto the shared shell in
// components/ui/context-menu.tsx. All of them have now been migrated:
//
//   - LineContextMenu           -> PATCH 4C
//   - TableCellContextMenu      -> PATCH 4D
//   - FreeformCanvasBoardMenu   -> PATCH 4E
//
// PATCH 4B added the positioned shared primitive that removed the common
// blocker (Radix ContextMenu.Root has no genuine controlled `open` API and its
// Trigger must be a real DOM node, which none of these call sites can provide
// without a fake trigger or a synthesized contextmenu event).
//
// Each menu's "must remain unmigrated" assertions were therefore obsolete --
// keeping them would assert the opposite of the shipped behavior -- and their
// far richer coverage now lives in dedicated suites:
//
//   - components/collabboard/lineContextMenu.characterization.test.tsx
//   - components/collabboard/tableCellContextMenu.characterization.test.tsx
//   - components/collabboard/freeformCanvasBoardMenu.characterization.test.tsx
//
// NOTE: this file is now effectively dead. Only the closing guard below
// remains, and it duplicates an adoption assertion each dedicated suite
// already makes. It is deliberately NOT deleted here so the migration patch
// stays scoped; deleting it belongs in a separate cleanup commit.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATED_MENUS = [
  'components/collabboard/menus/LineContextMenu.tsx',
  'components/collabboard/menus/TableCellContextMenu.tsx',
  'components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx',
];

describe('hand-rolled context menus', () => {
  it('no longer exist: every former hand-rolled menu now uses the shared shell', () => {
    for (const relativePath of MIGRATED_MENUS) {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
      expect(source, `${relativePath} should import the shared shell`).toContain(
        "from '@/components/ui/context-menu'",
      );
      expect(source, `${relativePath} should not hand-roll a fixed surface`).not.toMatch(
        /className="fixed/,
      );
    }
  });
});
