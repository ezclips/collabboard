// @vitest-environment node
//
// PATCH 7C removed 28 tracked historical backup/broken source copies. The
// guards below are deliberately narrow: they cover only the names that were
// genuinely confusing — historical copies that sat beside a live file of almost
// the same name, where deleting the wrong one would have been silent and
// expensive (a Wall canvas, a Wall layout, and the Excalidraw fork sources the
// app's runtime bundle is built from).
//
// This is NOT a permanent inventory of every deleted file: a long list of dead
// paths has no ongoing value. It pins the confusable pairs, and it pins that the
// live counterparts are still there.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const exists = (relative: string) => fs.existsSync(path.join(process.cwd(), relative));

/** Historical copies whose names sat one character away from a live file. */
const DELETED_CONFUSABLE_COPIES = [
  'components/canvas/brocken_WallCanvas.tsx',
  'components/canvas/1stnewRowCanvas.tsx',
  'components/canvas/layouts/broken_WallLayout.tsx',
  'components/collabboard/canvas/last workingCanvasSetupPage.tsx',
];

/** The live files those copies shadowed. */
const LIVE_COUNTERPARTS = [
  'components/canvas/WallCanvas.tsx',
  'components/canvas/RowCanvas.tsx',
  'components/canvas/layouts/WallLayout.tsx',
  'components/collabboard/canvas/CanvasSetupPage.tsx',
];

/**
 * Fork sources the runtime bundle is built from. Each had one or two tracked
 * `.menu_restore_backup_*` / `.pre_startover_backup_*` copies beside it.
 */
const FORK = 'components/collabboard/canvas/excalidraw_fork/packages/excalidraw';
const LIVE_FORK_SOURCES = [
  `${FORK}/actions/actionToggleSearchMenu.ts`,
  `${FORK}/components/Actions.tsx`,
  `${FORK}/components/DefaultSidebar.tsx`,
  `${FORK}/components/LayerUI.tsx`,
  `${FORK}/components/SearchMenu.tsx`,
  `${FORK}/components/main-menu/DefaultItems.tsx`,
  `${FORK}/data/restore.ts`,
];

describe('repository hygiene: historical source copies', () => {
  it.each(DELETED_CONFUSABLE_COPIES)('%s stays deleted', (relative) => {
    expect(
      exists(relative),
      `${relative} was removed as a dead historical copy; re-adding it re-creates the ambiguity`,
    ).toBe(false);
  });

  it.each(LIVE_COUNTERPARTS)('%s is still present', (relative) => {
    expect(exists(relative), `${relative} is live and must never be deleted`).toBe(true);
  });

  it.each(LIVE_FORK_SOURCES)('%s is still present', (relative) => {
    expect(exists(relative), `${relative} is built into the app's Excalidraw bundle`).toBe(true);
  });

  it('no tracked backup-suffixed copy of a fork source remains', () => {
    // Directory scan rather than a name list, so a newly committed backup is
    // caught even though this file never heard of it.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          walk(path.join(dir, entry.name));
          continue;
        }
        if (/\.(bak|pre_startover_backup_\d+|menu_restore_backup_\d+)$/.test(entry.name)) {
          offenders.push(path.relative(process.cwd(), path.join(dir, entry.name)).replace(/\\/g, '/'));
        }
      }
    };
    walk(path.join(process.cwd(), FORK));
    expect(offenders).toEqual([]);
  });
});

describe('repository hygiene: configuration follows the deletions', () => {
  /**
   * Narrow on purpose — not a general tsconfig linter. It only proves the
   * excludes that existed *because* these historical files existed went away
   * with them, so the cleanup did not simply move litter from the file tree
   * into the configuration.
   */
  const REMOVED_EXCLUDES = [
    'app/dashboard/create-canvas/also no goodpage.tsx',
    'app/dashboard/create-canvas/long_but works_page.tsx',
    'app/dashboard/create-canvas/samepage.tsx',
    'components/canvas/layouts/broken_WallLayout.tsx',
    'components/canvas/1stnewRowCanvas.tsx',
    'components/collabboard/canvas/last workingCanvasSetupPage.tsx',
  ];

  const tsconfig = () =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf8')) as {
      exclude: string[];
    };

  it.each(REMOVED_EXCLUDES)('tsconfig no longer excludes the deleted %s', (relative) => {
    expect(tsconfig().exclude).not.toContain(relative);
  });

  it('every removed exclude pointed at a path that no longer exists', () => {
    // This is what makes the tsconfig edit semantically inert: excluding a
    // nonexistent path and not excluding it produce the same program.
    for (const relative of REMOVED_EXCLUDES) {
      expect(exists(relative), `${relative} must stay deleted`).toBe(false);
    }
  });
});

describe('repository hygiene: routing is unaffected', () => {
  it('create-canvas still has exactly one page.tsx route file', () => {
    const segment = path.join(process.cwd(), 'app/dashboard/create-canvas');
    const routeFiles = fs
      .readdirSync(segment)
      .filter((name) => /^page\.(tsx|ts|jsx|js)$/.test(name));
    expect(routeFiles).toEqual(['page.tsx']);
  });

  it('the deleted create-canvas copies were never routes and are gone', () => {
    for (const name of ['also no goodpage.tsx', 'long_but works_page.tsx', 'samepage.tsx']) {
      expect(exists(`app/dashboard/create-canvas/${name}`)).toBe(false);
    }
  });
});
