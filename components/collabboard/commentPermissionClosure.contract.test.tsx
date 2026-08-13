// @vitest-environment jsdom
//
// PATCH 8AE.2 -- the durable, single-file closure guard for the entire
// comment-permission rollout (PATCH 8Z through PATCH 8AE.1).
//
// PATCH 8Y's original inventory missed DrawingLayout.tsx's standalone
// comment-post EmbeddedCommentList. PATCH 8AD's inventory missed the Map
// layout's PostPopup route entirely. Both were only caught by later,
// independent audits -- proof that a one-time inventory is not durable.
// This file exists so a THIRD missed surface fails a test automatically,
// rather than waiting for a fourth audit patch to notice by hand.
//
// Two complementary techniques:
//  1. COMPLETENESS: `git grep` for every live `<CommentPopup` and
//     `<EmbeddedCommentList` JSX usage in production source, and assert the
//     resulting file set matches a hardcoded, reviewed allowlist exactly.
//     Adding a comment renderer to ANY new file -- a new layout, a new
//     editor, a new popup -- fails this test until the allowlist (and this
//     file's own per-surface assertions) are updated, which forces the next
//     patch to classify it rather than silently ship it ungated.
//  2. PER-SURFACE GATING: for every file in the allowlist, assert every
//     single `<CommentPopup .../>` / `<EmbeddedCommentList .../>` block it
//     contains has an `accessMode=` prop wired -- not just the file overall,
//     every occurrence, so a second unguarded block added next to an
//     already-guarded one in the same file still fails.
//
// Source-string checks are used throughout (not full mounts) because several
// of the allowlisted files (`FreeformPadletCards.tsx`, `CanvasClient.tsx`)
// are too large to mount in a unit test -- the same convention established
// by `canonicalCommentPermission.contract.test.tsx` and
// `normalCommentRolloutClosure.contract.test.tsx`.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

function gitGrepFiles(pattern: string): string[] {
  try {
    const output = execFileSync('git', ['grep', '-l', pattern, '--', '*.ts', '*.tsx'], { encoding: 'utf8' });
    return output.split('\n').filter(Boolean).sort();
  } catch (err: any) {
    if (err.status === 1) return []; // git grep exits 1 on zero matches -- not an error.
    throw err;
  }
}

// Extracts every self-closing `<Tag ... />` block's source text. All known
// live CommentPopup/EmbeddedCommentList JSX usages in this codebase are
// self-closing (verified during this patch's own inventory), so this is a
// correct and sufficient scanner for the allowlisted files below.
function extractSelfClosingBlocks(src: string, tag: string): string[] {
  const blocks: string[] = [];
  let idx = 0;
  while (true) {
    const start = src.indexOf(`<${tag}`, idx);
    if (start === -1) break;
    const end = src.indexOf('/>', start);
    if (end === -1) break;
    blocks.push(src.slice(start, end));
    idx = end + 2;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// COMPLETENESS: the exact, reviewed set of production files that render
// <CommentPopup> or <EmbeddedCommentList>, as of PATCH 8AE.2.
// ---------------------------------------------------------------------------

const KNOWN_COMMENT_POPUP_FILES = [
  'app/dashboard/canvas/[id]/CanvasClient.tsx',
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
  'components/collabboard/canvas/ui/OverlayLayer.tsx',
  'components/collabboard/editors/AIComponentEditor.tsx',
  'components/collabboard/editors/ClipartCardDraftModal.tsx',
  'components/collabboard/editors/ContainerEditor.tsx',
  'components/collabboard/editors/DocumentEditor.tsx',
  'components/collabboard/editors/DrawingEditor.tsx',
  'components/collabboard/editors/LinkEditor.tsx',
  'components/collabboard/editors/NoteEditor.tsx',
  'components/collabboard/editors/TableEditor.tsx',
  'components/collabboard/editors/TodoEditor.tsx',
].sort();

const KNOWN_EMBEDDED_COMMENT_LIST_FILES = [
  'components/canvas/RowCanvas.tsx', // DEAD -- see dedicated dead-surface section below.
  'components/collabboard/PostCardContent.tsx',
  'components/collabboard/RowColumnContainerCard.tsx',
  'components/collabboard/canvas/layouts/DrawingLayout.tsx',
].sort();

describe('comment permission closure -- surface completeness (PATCH 8AE.2)', () => {
  it('no new production file renders <CommentPopup> outside the reviewed allowlist', () => {
    const found = gitGrepFiles('<CommentPopup').filter((f) => !f.includes('.test.'));
    expect(found, 'a new <CommentPopup> caller appeared -- classify it and add it to KNOWN_COMMENT_POPUP_FILES').toEqual(KNOWN_COMMENT_POPUP_FILES);
  });

  it('no new production file renders <EmbeddedCommentList> outside the reviewed allowlist', () => {
    const found = gitGrepFiles('<EmbeddedCommentList').filter((f) => !f.includes('.test.'));
    expect(found, 'a new <EmbeddedCommentList> caller appeared -- classify it and add it to KNOWN_EMBEDDED_COMMENT_LIST_FILES').toEqual(KNOWN_EMBEDDED_COMMENT_LIST_FILES);
  });
});

describe('comment permission closure -- every CommentPopup block is gated (PATCH 8AE.2)', () => {
  const expectedBlockCounts: Record<string, number> = {
    'app/dashboard/canvas/[id]/CanvasClient.tsx': 1,
    'components/collabboard/canvas/ui/FreeformPadletCards.tsx': 8,
    'components/collabboard/canvas/ui/OverlayLayer.tsx': 1,
    'components/collabboard/editors/AIComponentEditor.tsx': 1,
    'components/collabboard/editors/ClipartCardDraftModal.tsx': 1,
    'components/collabboard/editors/ContainerEditor.tsx': 1,
    'components/collabboard/editors/DocumentEditor.tsx': 1,
    'components/collabboard/editors/DrawingEditor.tsx': 1,
    'components/collabboard/editors/LinkEditor.tsx': 1,
    'components/collabboard/editors/NoteEditor.tsx': 2, // normal/detached tier + anchored tier
    'components/collabboard/editors/TableEditor.tsx': 1,
    'components/collabboard/editors/TodoEditor.tsx': 1,
  };

  for (const file of KNOWN_COMMENT_POPUP_FILES) {
    it(`${file}: every <CommentPopup /> block carries an explicit accessMode`, () => {
      const src = read(file);
      const blocks = extractSelfClosingBlocks(src, 'CommentPopup');
      expect(blocks.length, `expected ${expectedBlockCounts[file]} <CommentPopup> block(s) in ${file}, found ${blocks.length} -- update expectedBlockCounts if this is an intentional change`).toBe(expectedBlockCounts[file]);
      for (const [i, block] of blocks.entries()) {
        expect(block, `block #${i + 1} in ${file} has no accessMode prop`).toMatch(/accessMode=/);
      }
    });
  }
});

describe('comment permission closure -- every live EmbeddedCommentList block is gated (PATCH 8AE.2)', () => {
  const LIVE_EMBEDDED_COMMENT_LIST_FILES = KNOWN_EMBEDDED_COMMENT_LIST_FILES.filter((f) => f !== 'components/canvas/RowCanvas.tsx');
  const expectedBlockCounts: Record<string, number> = {
    'components/collabboard/PostCardContent.tsx': 3,
    'components/collabboard/RowColumnContainerCard.tsx': 2,
    'components/collabboard/canvas/layouts/DrawingLayout.tsx': 1,
  };

  for (const file of LIVE_EMBEDDED_COMMENT_LIST_FILES) {
    it(`${file}: every <EmbeddedCommentList /> block carries an explicit accessMode`, () => {
      const src = read(file);
      const blocks = extractSelfClosingBlocks(src, 'EmbeddedCommentList');
      expect(blocks.length, `expected ${expectedBlockCounts[file]} <EmbeddedCommentList> block(s) in ${file}, found ${blocks.length} -- update expectedBlockCounts if this is an intentional change`).toBe(expectedBlockCounts[file]);
      for (const [i, block] of blocks.entries()) {
        expect(block, `block #${i + 1} in ${file} has no accessMode prop`).toMatch(/accessMode=/);
      }
    });
  }

  it('RowCanvas.tsx (dead) is not counted as a live gated surface -- it stays dead, not silently "fixed"', () => {
    const src = read('components/canvas/RowCanvas.tsx');
    const blocks = extractSelfClosingBlocks(src, 'EmbeddedCommentList');
    expect(blocks.length).toBe(1);
    // Deliberately NOT asserting accessMode here -- this file must remain
    // reachable-by-nobody, not quietly promoted to a live gated surface.
    // Its dead status is proven by the importer check below instead.
  });

  // A duplicate/unguarded composer added alongside an already-gated
  // EmbeddedCommentList block would NOT be caught by the block-count checks
  // above (they only inspect the <EmbeddedCommentList> block itself, not
  // whatever else a file renders next to it). The composer's own
  // `placeholder="Add a comment..."` literal exists in exactly one place in
  // the whole codebase -- EmbeddedCommentList.tsx's own composer input --
  // so any OTHER file containing that literal directly is proof a
  // hand-rolled, un-vetted composer was added outside the shared component.
  for (const file of [...KNOWN_EMBEDDED_COMMENT_LIST_FILES, 'components/map/PostPopup.tsx', 'components/map/MapCanvas.tsx']) {
    it(`${file}: never hand-rolls the comment composer's own placeholder text (must come only from EmbeddedCommentList.tsx)`, () => {
      const src = read(file);
      expect(src, `${file} contains a duplicate/hand-rolled composer -- the "Add a comment..." placeholder must only ever come from EmbeddedCommentList.tsx`).not.toContain('placeholder="Add a comment');
    });
  }
});

describe('comment permission closure -- Map route re-verification (PATCH 8AE.1)', () => {
  it('link 1: CanvasClient.tsx passes commentAccessMode to its sole MapCanvas call site', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect((src.match(/<MapCanvas\b/g) ?? []).length).toBe(1);
    const start = src.indexOf('<MapCanvas');
    const end = src.indexOf('onUpdateChildComments={async', start);
    expect(src.slice(start, end)).toContain('commentAccessMode={commentAccessMode}');
  });

  it('link 2: MapCanvas.tsx forwards commentAccessMode as accessMode to its sole PostPopup call site', () => {
    const src = read('components/map/MapCanvas.tsx');
    expect(src).toContain('commentAccessMode?: CommentAccessMode');
    expect((src.match(/<PostPopup\b/g) ?? []).length).toBe(1);
    const start = src.indexOf('<PostPopup');
    const end = src.indexOf('/>', start);
    expect(src.slice(start, end)).toContain('accessMode={commentAccessMode}');
  });

  it('link 3: PostPopup.tsx forwards accessMode to RowColumnContainerCard', () => {
    const src = read('components/map/PostPopup.tsx');
    expect(src).toContain('accessMode?: CommentAccessMode');
    const start = src.indexOf('<RowColumnContainerCard');
    const end = src.indexOf('/>', start);
    expect(src.slice(start, end)).toContain('accessMode={accessMode}');
  });

  it('link 4: PostPopup.tsx forwards accessMode to PostCardContent', () => {
    const src = read('components/map/PostPopup.tsx');
    const start = src.indexOf('<PostCardContent');
    const end = src.indexOf('/>', start);
    expect(src.slice(start, end)).toContain('accessMode={accessMode}');
  });

  it('no Map comment renderer relies on its implicit default -- the full chain is explicit', () => {
    const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const mapCanvas = read('components/map/MapCanvas.tsx');
    const postPopup = read('components/map/PostPopup.tsx');
    const link1 = canvasClient.includes('commentAccessMode={commentAccessMode}') && canvasClient.includes('<MapCanvas');
    const link2 = mapCanvas.includes('commentAccessMode?: CommentAccessMode') && mapCanvas.includes('accessMode={commentAccessMode}');
    const link3 =
      postPopup.includes('accessMode?: CommentAccessMode') &&
      /RowColumnContainerCard[\s\S]*?accessMode=\{accessMode\}/.test(postPopup) &&
      /PostCardContent[\s\S]*?accessMode=\{accessMode\}/.test(postPopup);
    expect(link1 && link2 && link3, 'the Map accessMode chain has a broken link').toBe(true);
  });
});

// Every onUpdateChildComments(...) call must target the correct owning id --
// never a sibling child, never the parent Container. This is a count-based
// structural proof rather than a per-mutation mounted test, so it covers ALL
// five mutation handlers (Add/Edit/Delete/Strikethrough/Color) uniformly:
// a single mutation silently retargeted to the wrong id (as happened for
// RowColumnContainerCard.tsx's onColorChange in an earlier draft of this
// audit, caught only by this exact check, not by any mounted UI test) makes
// the total call count diverge from the correct-identifier call count.
describe('comment permission closure -- child-id ownership (PATCH 8AE.2)', () => {
  it('RowColumnContainerCard.tsx: every onUpdateChildComments(...) call targets child.id, never padlet.id', () => {
    const src = read('components/collabboard/RowColumnContainerCard.tsx');
    const total = (src.match(/onUpdateChildComments\(/g) ?? []).length;
    const childTargeted = (src.match(/onUpdateChildComments\(child\.id/g) ?? []).length;
    expect(total, 'expected 10 onUpdateChildComments(...) calls (5 mutations x 2 EmbeddedCommentList blocks)').toBe(10);
    expect(childTargeted, 'every call must target child.id -- a call targeting any other identifier (e.g. padlet.id) would mutate the wrong post').toBe(total);
  });

  it('PostCardContent.tsx: root-level blocks target padlet.id, the nested-container block targets child.id, and no third identifier exists', () => {
    const src = read('components/collabboard/PostCardContent.tsx');
    const total = (src.match(/onUpdateChildComments\(/g) ?? []).length;
    const padletTargeted = (src.match(/onUpdateChildComments\(padlet\.id/g) ?? []).length;
    const childTargeted = (src.match(/onUpdateChildComments\(child\.id/g) ?? []).length;
    expect(total, 'expected 15 onUpdateChildComments(...) calls (5 mutations x 3 EmbeddedCommentList blocks)').toBe(15);
    expect(padletTargeted, 'COMMENT TYPE and IMAGE TYPE blocks (5 mutations each) target the post\'s own id').toBe(10);
    expect(childTargeted, 'the CONTAINER TYPE nested-child block (5 mutations) targets the child\'s id').toBe(5);
    expect(padletTargeted + childTargeted, 'no call may target any identifier other than padlet.id or child.id').toBe(total);
  });

  it('DrawingLayout.tsx: every onUpdateChildComments(...) call targets the standalone post\'s own padlet.id', () => {
    const src = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    const total = (src.match(/onUpdateChildComments\(/g) ?? []).length;
    const padletTargeted = (src.match(/onUpdateChildComments\(padlet\.id/g) ?? []).length;
    expect(total, 'expected 5 onUpdateChildComments(...) calls (5 mutations x 1 EmbeddedCommentList block)').toBe(5);
    expect(padletTargeted).toBe(total);
  });
});

describe('comment permission closure -- COMMENT tier dormancy (single producer)', () => {
  it('resolveCommentAccessMode has exactly one live call site, in CanvasClient.tsx, with no boardPermission argument', () => {
    const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const calls = (canvasClient.match(/resolveCommentAccessMode\(/g) ?? []).length;
    expect(calls).toBe(1);
    expect(canvasClient).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
    expect(canvasClient).not.toMatch(/resolveCommentAccessMode\(currentWorkspaceRole,\s*\S/);

    // No other production file may call it -- a second producer would mean
    // a second, potentially divergent source of truth for accessMode.
    const otherCallers = gitGrepFiles('resolveCommentAccessMode(').filter(
      (f) => f !== 'app/dashboard/canvas/[id]/CanvasClient.tsx' && !f.includes('.test.') && f !== 'lib/domain/canvas/comments.ts',
    );
    expect(otherCallers, `unexpected additional resolveCommentAccessMode caller(s): ${otherCallers.join(', ')}`).toEqual([]);
  });
});

describe('comment permission closure -- dead/dormant surfaces stay non-live (PATCH 8AE.2)', () => {
  it('components/canvas/RowCanvas.tsx has zero production importers', () => {
    const importers = gitGrepFiles("from '@/components/canvas/RowCanvas'").filter((f) => !f.includes('.test.'));
    expect(importers).toEqual([]);
  });

  it('CommentViewPopup.tsx has zero importers anywhere, including tests', () => {
    const mentions = gitGrepFiles('CommentViewPopup');
    // Only its own source file may reference the identifier at all -- no
    // import, mount, or reference exists anywhere else in the repo.
    expect(mentions).toEqual(['components/collabboard/editors/CommentViewPopup.tsx']);
  });

  it('the shared CommentList/FreeformCommentRow foundation has zero production importers outside its own pilot tests', () => {
    const importers = gitGrepFiles("from '@/components/collabboard/comments/CommentList'");
    const allowed = new Set([
      'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
      'components/collabboard/freeformCommentUIContract.characterization.test.tsx',
      'components/collabboard/comments/siteA.pilotParity.test.tsx',
    ]);
    const offenders = importers.filter((f) => !allowed.has(f));
    expect(offenders).toEqual([]);
    // And FreeformPadletCards.tsx -- though allowed to import it -- must not
    // actually render it, per the same proof freeformCommentUIContract.characterization.test.tsx keeps current.
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect((freeform.match(/<CommentList\b/g) ?? []).length).toBe(0);
  });

  it("ContainerEditor.tsx's own detachedComments/commentPopupOpen skeleton remains unreachable", () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    // No <CommentPopup isOpen={commentPopupOpen} ...> render exists anywhere.
    expect(src).not.toMatch(/<CommentPopup[\s\S]{0,400}isOpen=\{commentPopupOpen\}/);
  });
});
