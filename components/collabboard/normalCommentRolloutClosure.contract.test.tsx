// PATCH 8Y -- NORMAL COMMENT ROLLOUT CLOSURE AUDIT.
//
// This is the repository-wide closure guard the rollout (PATCH 8O.1 through
// 8X) built up to. Every prior patch added a per-post-type describe block to
// canonicalCommentPermission.contract.test.tsx proving ITS OWN site(s) are
// wired; nothing until now proved the SET of <CommentPopup call sites across
// the whole app is exactly the set those per-post-type blocks account for --
// so a brand-new, entirely unaccounted-for call site (a regression, or an
// unmigrated post type quietly growing a real implementation) could appear
// without any existing test failing.
//
// This file closes that gap with one durable signal: walk every non-test
// source file under the two directories that have ever hosted a live
// <CommentPopup> usage (components/collabboard, excluding the vendored
// Excalidraw fork, and the single app/dashboard/canvas/[id] page), count
// total <CommentPopup> usages, and require that count -- and its per-file
// breakdown -- to match the fully-classified PATCH 8Y inventory exactly.
// Structural (string counts), not line-number-based, so unrelated edits to
// these files don't spuriously break it -- only a CHANGE IN COUNT does.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const COLLABBOARD_ROOT = 'components/collabboard';
const EXCLUDED_DIRS = new Set(['canvas/excalidraw_fork']);
const EXTRA_FILES = ['app/dashboard/canvas/[id]/CanvasClient.tsx'];

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(process.cwd(), dir);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([...EXCLUDED_DIRS].some((excluded) => relative === path.posix.join(COLLABBOARD_ROOT, excluded))) continue;
      walk(relative, out);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(relative);
    }
  }
  return out;
}

function countOccurrences(haystack: string, needle: string): number {
  return (haystack.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
}

// Counts accessMode= only WITHIN <CommentPopup ... /> blocks, not a raw
// whole-file count -- PATCH 8Z gave FreeformPadletCards.tsx a 9th, entirely
// legitimate accessMode={commentAccessMode} occurrence on the NON-CommentPopup
// <CommentPost> call site (Comment post is Category B/SPECIAL, not a
// CommentPopup caller), which a raw count would conflate with CommentPopup
// wiring.
function countGuardedCommentPopupUsages(src: string): number {
  let count = 0;
  let cursor = 0;
  while (true) {
    const start = src.indexOf('<CommentPopup', cursor);
    if (start === -1) break;
    const end = src.indexOf('/>', start);
    if (end === -1) break;
    const block = src.slice(start, end + 2);
    if (block.includes('accessMode=')) count++;
    cursor = end + 2;
  }
  return count;
}

// PATCH 8Y's own inventory (Phase 1-4). Every file that has ever contained a
// live <CommentPopup> usage, with its exact usage count and how many of
// those usages carry an explicit accessMode= prop (the canonical permission
// contract, PATCH 8O.1+). A file NOT in this map is expected to contain
// ZERO <CommentPopup> usages -- if one appears, that's either a genuine new
// migration (update this map deliberately, in the same patch as the
// contract doc) or an unexpected duplicate (the thing this guard exists to
// catch).
const EXPECTED: Record<string, { usages: number; guarded: number; note: string }> = {
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx': {
    usages: 8,
    guarded: 8,
    note: 'Clipart Site B, Image x2, Note x2, Todo x1, Link x1, Table x1 -- all canonical, all accessMode={commentAccessMode}',
  },
  'app/dashboard/canvas/[id]/CanvasClient.tsx': {
    usages: 1,
    guarded: 1,
    note: 'non-Freeform Image toolbar -- canonical',
  },
  'components/collabboard/editors/ClipartCardDraftModal.tsx': { usages: 1, guarded: 1, note: 'Clipart editor modal -- canonical' },
  'components/collabboard/editors/AIComponentEditor.tsx': { usages: 1, guarded: 1, note: 'AI Component own editor -- canonical (PATCH 8T)' },
  'components/collabboard/editors/DrawingEditor.tsx': { usages: 1, guarded: 1, note: 'Drawing own editor -- canonical (PATCH 8R)' },
  'components/collabboard/editors/LinkEditor.tsx': { usages: 1, guarded: 1, note: 'Link own editor -- canonical (PATCH 8U)' },
  'components/collabboard/editors/TableEditor.tsx': { usages: 1, guarded: 1, note: 'Table own editor -- canonical (PATCH 8V)' },
  'components/collabboard/editors/TodoEditor.tsx': { usages: 1, guarded: 1, note: 'Todo own editor -- canonical (PATCH 8S)' },
  'components/collabboard/editors/NoteEditor.tsx': {
    usages: 2,
    guarded: 1,
    note: 'ONE canonical detached-comment popup (guarded) + ONE anchored/highlighted selected-text popup (Category B, intentionally unguarded, out of scope)',
  },
  'components/collabboard/canvas/ui/OverlayLayer.tsx': {
    usages: 1,
    guarded: 0,
    note: 'on-canvas anchored/highlighted thread controller (Note + Document), Category B, intentionally unguarded',
  },
  'components/collabboard/editors/DocumentEditor.tsx': {
    usages: 1,
    guarded: 0,
    note: 'Document anchored/highlighted selected-text popup, Category B, intentionally unguarded -- Document has no normal/detached tier at all (PATCH 8Q)',
  },
  'components/collabboard/editors/ContainerEditor.tsx': {
    usages: 1,
    guarded: 0,
    note: 'SortableChildItem renders a comment-type CHILD padlet\'s own metadata.comments -- Category B/C child-post rendering, not a Container-owned comment; intentionally unguarded (real gap, out of scope per PATCH 8X/8Y)',
  },
};

const TOTAL_EXPECTED_USAGES = Object.values(EXPECTED).reduce((sum, e) => sum + e.usages, 0);
const TOTAL_EXPECTED_GUARDED = Object.values(EXPECTED).reduce((sum, e) => sum + e.guarded, 0);

describe('PATCH 8Y -- normal comment rollout closure', () => {
  it('TOTAL_EXPECTED_USAGES/GUARDED constants match the PATCH 8Y inventory (20 usages, 16 guarded)', () => {
    // Pins the inventory numbers themselves, independent of the file walk,
    // so a future editor of EXPECTED can see at a glance if their edit
    // changed the totals.
    expect(TOTAL_EXPECTED_USAGES).toBe(20);
    expect(TOTAL_EXPECTED_GUARDED).toBe(16);
  });

  it('every file with a live <CommentPopup usage is accounted for in EXPECTED, with no unaccounted file', () => {
    const files = [...walk(COLLABBOARD_ROOT), ...EXTRA_FILES];
    const foundWithUsage: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      if (countOccurrences(src, '<CommentPopup') > 0) foundWithUsage.push(file);
    }
    const expectedFiles = Object.keys(EXPECTED).sort();
    expect(
      foundWithUsage.sort(),
      'A file contains <CommentPopup that is not in this test\'s EXPECTED map. Either a new post family was migrated (update EXPECTED AND the contract doc in the same patch) or an unexpected duplicate/regression appeared.',
    ).toEqual(expectedFiles);
  });

  it.each(Object.entries(EXPECTED))(
    '%s has exactly the expected <CommentPopup usage and accessMode= count',
    (file, expected) => {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      const usages = countOccurrences(src, '<CommentPopup');
      const guarded = countGuardedCommentPopupUsages(src);
      expect(usages, `${file}: expected ${expected.usages} <CommentPopup usage(s) (${expected.note}), found ${usages}`).toBe(expected.usages);
      expect(guarded, `${file}: expected ${expected.guarded} accessMode= occurrence(s) (${expected.note}), found ${guarded}`).toBe(expected.guarded);
    },
  );

  it('total <CommentPopup usages across the whole app equals the closed rollout total (20)', () => {
    const files = [...walk(COLLABBOARD_ROOT), ...EXTRA_FILES];
    let total = 0;
    for (const file of files) {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      total += countOccurrences(src, '<CommentPopup');
    }
    expect(total).toBe(TOTAL_EXPECTED_USAGES);
  });

  it('resolveCommentAccessMode has exactly one live call site and COMMENT stays dormant (no boardPermission argument passed)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    const calls = countOccurrences(src, 'resolveCommentAccessMode(');
    expect(calls, 'resolveCommentAccessMode should have exactly one live call site (CanvasClient.tsx) -- a second live caller would mean the dormant-COMMENT-tier characterization is stale').toBe(1);
    expect(src).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
    expect(src).not.toMatch(/resolveCommentAccessMode\(currentWorkspaceRole,\s*\S/);
  });

  it('N/A post types (Document, Container) have not silently grown a normal/detached comment tier', () => {
    // Document and Container's only <CommentPopup usages (1 each, per EXPECTED
    // above) are Category B special/embedded, not a Category-A detached tier.
    // If either ever grows a SECOND <CommentPopup usage, that is exactly the
    // "N/A post type suddenly gains a detached-comment UI" case this guard
    // must catch -- covered already by the per-file usages===1 assertions
    // above, restated here as an explicit closure-relevant assertion.
    const document = fs.readFileSync(path.join(process.cwd(), 'components/collabboard/editors/DocumentEditor.tsx'), 'utf8');
    const container = fs.readFileSync(path.join(process.cwd(), 'components/collabboard/editors/ContainerEditor.tsx'), 'utf8');
    expect(countOccurrences(document, '<CommentPopup')).toBe(1);
    expect(countOccurrences(container, '<CommentPopup')).toBe(1);
    // Container's own (dead) detachedComments skeleton must still not be
    // wired to any live trigger -- no isOpen={commentPopupOpen} anywhere.
    expect(container).not.toContain('isOpen={commentPopupOpen}');
  });

  it('FreeformPadletCards.tsx\'s container branch renders no <CommentPopup (no live Container on-canvas comment badge exists)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'), 'utf8');
    const branchStart = src.indexOf("if (padlet.type === 'container')");
    expect(branchStart, 'container branch anchor not found -- FreeformPadletCards.tsx structure changed, update this guard').toBeGreaterThan(-1);
    // The container branch returns before reaching the generic fallback
    // branch (<NotePostContextMenu>, PATCH 8W's finding) -- that fallback's
    // opening is a stable downstream anchor bounding the container branch.
    const fallbackStart = src.indexOf('<NotePostContextMenu', branchStart);
    expect(fallbackStart, 'generic fallback branch anchor not found after container branch').toBeGreaterThan(branchStart);
    const containerBranch = src.slice(branchStart, fallbackStart);
    expect(containerBranch).not.toContain('<CommentPopup');
  });
});

describe('PATCH 8Y -- kanban-canvas comment system stays a separate, unaudited vertical', () => {
  // Discovered during the PATCH 8Y full-repo sweep: components/kanban-canvas
  // has its own complete, independent normal-comment feature (Editor.tsx's
  // inline comment list/composer, Card.tsx's count badge) against its OWN
  // storage (the `kanban_comments` table via lib/kanban/supabaseAdapter.ts),
  // not `padlets.metadata` at all. This is NOT a Padlet post type (Padlet['type']
  // in types/collabboard.ts has no 'kanban' member) and was never in scope for
  // any patch in the 8-series (all of which are scoped to the padlets/collabboard
  // canvas and its CommentPopup). It is intentionally NOT covered by the
  // "NORMAL COMMENT ROLLOUT -- CLOSED" declaration below. This test only pins
  // that the two systems stay structurally separate -- it does not judge or
  // migrate the kanban system.
  it('kanban-canvas does not import the canonical CommentPopup or its collabboard comment infra', () => {
    const editor = fs.readFileSync(path.join(process.cwd(), 'components/kanban-canvas/Editor.tsx'), 'utf8');
    const card = fs.readFileSync(path.join(process.cwd(), 'components/kanban-canvas/Card.tsx'), 'utf8');
    expect(editor).not.toContain("from '@/components/collabboard");
    expect(card).not.toContain("from '@/components/collabboard");
  });

  it('collabboard comment surfaces do not import kanban-canvas storage/UI', () => {
    const freeform = fs.readFileSync(path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'), 'utf8');
    expect(freeform).not.toContain("from '@/components/kanban-canvas");
    expect(freeform).not.toContain("from '@/lib/kanban");
  });
});
