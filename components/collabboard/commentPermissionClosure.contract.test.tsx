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
  // components/canvas/RowCanvas.tsx (DEAD, zero importers) was deleted
  // entirely by PATCH 8AI -- see dedicated dead-surface section below.
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
    'components/collabboard/canvas/ui/FreeformPadletCards.tsx': 7, // PATCH 8AF removed the 8th, unreachable dead Card-toolbar instance
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
  const LIVE_EMBEDDED_COMMENT_LIST_FILES = KNOWN_EMBEDDED_COMMENT_LIST_FILES;
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

  it('RowCanvas.tsx (formerly dead) was deleted by PATCH 8AI, not silently "fixed" into a live gated surface', () => {
    const fs = require('node:fs');
    expect(fs.existsSync('components/canvas/RowCanvas.tsx')).toBe(false);
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
  it('components/canvas/RowCanvas.tsx no longer exists (deleted PATCH 8AI) and has zero production importers', () => {
    const fs = require('node:fs');
    expect(fs.existsSync('components/canvas/RowCanvas.tsx')).toBe(false);
    const importers = gitGrepFiles("from '@/components/canvas/RowCanvas'").filter((f) => !f.includes('.test.'));
    expect(importers).toEqual([]);
  });

  it('the shared CommentList/FreeformCommentRow foundation has zero production importers outside its own pilot tests', () => {
    const importers = gitGrepFiles("from '@/components/collabboard/comments/CommentList'");
    const allowed = new Set([
      'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
      'components/collabboard/freeformCommentUIContract.characterization.test.tsx',
      'components/collabboard/comments/siteA.pilotParity.test.tsx',
    ]);
    // This guard file's OWN source contains the search pattern as a string
    // literal (the line just above), which is a false-positive git-grep
    // match on itself, not an import -- excluded explicitly rather than by
    // a blanket .test. filter, since two of the genuinely allowed callers
    // are themselves test files.
    const offenders = importers.filter((f) => !allowed.has(f) && f !== 'components/collabboard/commentPermissionClosure.contract.test.tsx');
    expect(offenders).toEqual([]);
    // And FreeformPadletCards.tsx -- though allowed to import it -- must not
    // actually render it, per the same proof freeformCommentUIContract.characterization.test.tsx keeps current.
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect((freeform.match(/<CommentList\b/g) ?? []).length).toBe(0);
  });

  it('lib/infra/canvas/commentMutations.ts remains wired but dormant, untouched by PATCH 8AF', () => {
    // Explicit non-target (see PATCH 8AF spec): the dormant COMMENT access
    // tier and its comment_mutate persistence path require a later
    // "shelve vs activate" architectural decision, not a dead-code deletion.
    // This only re-proves the file still exists and is still threaded the
    // same way -- it does not re-litigate the dormancy finding itself,
    // which canonicalCommentPermission.contract.test.tsx already covers.
    expect(fs.existsSync('lib/infra/canvas/commentMutations.ts')).toBe(true);
    const src = read('lib/infra/canvas/commentMutations.ts');
    expect(src).toContain('export function createCommentModeMutations');
    const canvas = read("app/dashboard/canvas/[id]/CanvasClient.tsx");
    expect(canvas).toContain("from '@/lib/infra/canvas/commentMutations'");
  });
});

describe('comment permission closure -- PATCH 8AF dead comment code cleanup', () => {
  it('CommentViewPopup.tsx no longer exists, and zero production mentions remain anywhere', () => {
    expect(fs.existsSync('components/collabboard/editors/CommentViewPopup.tsx')).toBe(false);
    const mentions = gitGrepFiles('CommentViewPopup').filter((f) => !f.includes('.test.'));
    expect(mentions).toEqual([]);
  });

  it("ContainerEditor.tsx's dead detachedComments-popup skeleton (commentPopupOpen/commentPopupPosition/handleComment/handleAddComment) is entirely removed", () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    expect(src).not.toMatch(/\bcommentPopupOpen\b/);
    expect(src).not.toMatch(/\bcommentPopupPosition\b/);
    expect(src).not.toMatch(/\bhandleComment\b/);
    expect(src).not.toMatch(/\bhandleAddComment\b/);
  });

  it("ContainerEditor.tsx's live child CommentPopup (SortableChildItem, comment-type children) still renders, gated", () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    const start = src.indexOf('child.type === "comment" && onUpdateChildComments');
    expect(start, 'live child CommentPopup branch not found -- ContainerEditor.tsx structure changed').toBeGreaterThan(-1);
    const popupStart = src.indexOf('<CommentPopup', start);
    const popupEnd = src.indexOf('/>', popupStart);
    expect(popupStart).toBeGreaterThan(-1);
    expect(src.slice(popupStart, popupEnd)).toContain('accessMode={accessMode}');
  });

  it('FreeformPadletCards.tsx\'s dead "Todo Comments Popup - Right side" block (nested in the Comment-post branch) is removed', () => {
    // Note: cardCommentPopupPadletId === padlet.id is NOT itself a useful
    // absence check here -- that exact comparison is shared, live
    // infrastructure for OTHER post types' (Note/Todo/Drawing/AI-component)
    // own detached-comment popups elsewhere in this file. The literal label
    // string is the only marker unique to the deleted dead block.
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain('Todo Comments Popup');
  });

  it("FreeformPadletCards.tsx's live Comment-post <CommentPost> rendering still exists, gated", () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    // /<CommentPost(?![A-Za-z])/, not a bare substring search -- the bare
    // substring also matches the unrelated, non-self-closing
    // <CommentPostContextMenu> wrapper that appears earlier in the same branch.
    const match = src.match(/<CommentPost(?![A-Za-z])/);
    expect(match, 'live <CommentPost> usage not found -- FreeformPadletCards.tsx structure changed').not.toBeNull();
    const start = match!.index!;
    const propsEnd = src.indexOf('/>', start);
    expect(src.slice(start, propsEnd)).toContain('accessMode={commentAccessMode}');
  });

  it("FreeformPadletCards.tsx's dead Card-toolbar CommentPopup block (gated on cardToolbarPadletId, which has no live non-null setter anywhere) is removed", () => {
    // PATCH 8AF removed only the CommentPopup sub-block, leaving the rest of
    // the (also dead, non-comment) Card Post Modal wrapper in place as an
    // out-of-scope finding. PATCH 8AG then removed that entire wrapper --
    // see the dedicated "PATCH 8AG dead Card Post Modal wrapper cleanup"
    // describe block below for its own durable assertions.
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain('Note detached comments use the canonical panel; this toolbar shell owns placement only.');
    expect(src).not.toContain('{/* Card Post Modal */}');
  });

  it("the live canonical Clipart CommentPopup entry point (ClipartCardDraftModal.tsx) is unaffected by the dead Card-toolbar block's removal", () => {
    const src = read('components/collabboard/editors/ClipartCardDraftModal.tsx');
    const total = (src.match(/<CommentPopup/g) ?? []).length;
    expect(total).toBe(1);
    const start = src.indexOf('<CommentPopup');
    const end = src.indexOf('/>', start);
    expect(src.slice(start, end)).toContain('accessMode=');
  });
});

describe('comment permission closure -- PATCH 8AG dead Card Post Modal wrapper cleanup', () => {
  it('the dead wrapper ({/* Card Post Modal */}, gated on cardToolbarPadletId && activeCardToolbarPadlet) is absent', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain('{/* Card Post Modal */}');
    expect(src).not.toMatch(/cardToolbarPadletId\s*&&\s*activeCardToolbarPadlet/);
    expect(src).not.toContain('activeCardToolbarPadlet');
  });

  it("the wrapper's former CommentPopup sub-block (removed PATCH 8AF) remains absent", () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain('Note detached comments use the canonical panel; this toolbar shell owns placement only.');
  });

  it('cardToolbarPadletId/setCardToolbarPadletId are NOT fully unused, so the state itself correctly remains (CanvasClient.tsx still resets it; three live guards elsewhere in FreeformPadletCards.tsx still read it)', () => {
    const overlays = read('components/collabboard/canvas/hooks/useCanvasOverlays.ts');
    expect(overlays).toContain("const [cardToolbarPadletId, setCardToolbarPadletId] = useState<string | null>(null);");
    const canvas = read("app/dashboard/canvas/[id]/CanvasClient.tsx");
    expect((canvas.match(/setCardToolbarPadletId\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    // The three live guards this state still gates elsewhere in this file
    // (all pre-existing, all unrelated to the deleted wrapper, all
    // untouched by PATCH 8AG).
    expect(freeform).toContain("padletToEdit?.id === padlet.id && !cardToolbarPadletId");
    expect(freeform).toContain("isImageEmojiOpen && !cardToolbarPadletId");
    expect(freeform).toContain("cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId");
  });

  it('live canonical Note/Clipart comment paths are unaffected', () => {
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(freeform).toContain('Note detached comments use the canonical panel; this shell only owns placement and close state.');
    const clipart = read('components/collabboard/editors/ClipartCardDraftModal.tsx');
    expect((clipart.match(/<CommentPopup/g) ?? []).length).toBe(1);
  });

  it('CardActionsToolbar/CardColorPanel/EmojiReactionPicker remain live elsewhere -- not orphaned by this cleanup', () => {
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    // CardActionsToolbar: the wrapper's own instance was removed here in
    // PATCH 8AG; the remaining instance was the separately dead
    // ({false && ...}) "Left Toolbar" block this test used to expect --
    // PATCH 8AI deleted that block (and the now-unused import) too, so zero
    // remain in this file. See "PATCH 8AI dead RowCanvas + false Left
    // Toolbar block cleanup" below for the dedicated assertions.
    expect((freeform.match(/<CardActionsToolbar\b/g) ?? []).length).toBe(0);
    expect(freeform).not.toContain("from '@/components/collabboard/editors/CardActionsToolbar'");
    // CardColorPanel: the wrapper's own instance is gone; one remains -- the
    // live "Right Color Picker - attached to card" block.
    expect((freeform.match(/<CardColorPanel\b/g) ?? []).length).toBe(1);
    // EmojiReactionPicker: the wrapper's own instance is gone; seven remain,
    // all live (Image/Todo/Link/Table/AI-component/Comment-post branches).
    expect((freeform.match(/<EmojiReactionPicker\b/g) ?? []).length).toBe(7);
    const clipart = read('components/collabboard/editors/ClipartCardDraftModal.tsx');
    expect(clipart).toContain('<CardActionsToolbar');
    expect(clipart).toContain('<CardColorPanel');
    expect(clipart).toContain('<EmojiReactionPicker');
  });
});

describe('comment permission closure -- PATCH 8AI dead RowCanvas + false Left Toolbar block cleanup', () => {
  const fs = require('node:fs');

  it('1: components/canvas/RowCanvas.tsx does not exist', () => {
    expect(fs.existsSync('components/canvas/RowCanvas.tsx')).toBe(false);
  });

  it('2: no production import references RowCanvas', () => {
    const importers = gitGrepFiles("from '@/components/canvas/RowCanvas'").filter((f) => !f.includes('.test.'));
    expect(importers).toEqual([]);
  });

  it('3: the literal-false Left Toolbar block is absent', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain('{false && cardToolbarPadletId === padlet.id && (');
    expect(src).not.toMatch(/\{false\s*&&\s*cardToolbarPadletId/);
  });

  it('4: the "Left Toolbar - moved to card modal" dead marker is absent', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain('Left Toolbar - moved to card modal');
  });

  it('5: FreeformPadletCards.tsx no longer imports CardActionsToolbar (its only usage was the deleted block)', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).not.toContain("from '@/components/collabboard/editors/CardActionsToolbar'");
    expect((src.match(/<CardActionsToolbar\b/g) ?? []).length).toBe(0);
  });

  it('6: ClipartCardDraftModal.tsx still uses CardActionsToolbar (not orphaned by this cleanup)', () => {
    const src = read('components/collabboard/editors/ClipartCardDraftModal.tsx');
    expect(src).toContain("from '@/components/collabboard/editors/CardActionsToolbar'");
    expect(src).toContain('<CardActionsToolbar');
  });

  it('7: RowCanvasDnD remains the live row/grid renderer in CanvasClient.tsx', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain("import RowCanvasDnD from '@/components/collabboard/row/RowCanvasDnD';");
    expect(src).toContain('<RowCanvasDnD');
  });

  it('8: live EmbeddedCommentList callers remain (PostCardContent, RowColumnContainerCard, DrawingLayout)', () => {
    for (const file of [
      'components/collabboard/PostCardContent.tsx',
      'components/collabboard/RowColumnContainerCard.tsx',
      'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    ]) {
      const src = read(file);
      expect(src, `${file} no longer renders <EmbeddedCommentList>`).toMatch(/<EmbeddedCommentList\b/);
    }
  });

  it('9: cardToolbarPadletId/setCardToolbarPadletId remain (kept, per PATCH 8AG/8AI scope) with their three live guards intact', () => {
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(freeform).toContain('cardToolbarPadletId,');
    expect(freeform).toContain('setCardToolbarPadletId,');
    expect(freeform).toContain("padletToEdit?.id === padlet.id && !cardToolbarPadletId");
    expect(freeform).toContain("isImageEmojiOpen && !cardToolbarPadletId");
    expect(freeform).toContain("cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId");
  });

  it('the five block-only overlay setters (setCardColorTab, setIconReplaceTargetPadlet, setIsLibraryOpen, setIsCardEditorOpen, setShowDeleteConfirm) are no longer destructured in FreeformPadletCards.tsx, but their shared underlying state is untouched', () => {
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    for (const name of ['setCardColorTab', 'setIconReplaceTargetPadlet', 'setIsLibraryOpen', 'setIsCardEditorOpen', 'setShowDeleteConfirm']) {
      // Scoped to the destructure-line shape (`    name,`) rather than a bare
      // word-boundary check -- setIsCardEditorOpen is still mentioned in a
      // legitimate historical comment a few lines above its old destructure
      // site, explaining why this file never called it even before PATCH 8AI.
      expect(freeform, `${name} should no longer be destructured in FreeformPadletCards.tsx`).not.toMatch(new RegExp(`^\\s*${name},\\s*$`, 'm'));
    }
    // Four of the five live in the shared useCanvasOverlays.ts hook.
    const overlays = read('components/collabboard/canvas/hooks/useCanvasOverlays.ts');
    for (const name of ['setCardColorTab', 'setIconReplaceTargetPadlet', 'setIsLibraryOpen', 'setShowDeleteConfirm']) {
      expect(overlays, `${name} must remain defined in the shared overlays hook -- other consumers still use it`).toContain(name);
    }
    // setIsCardEditorOpen is a CanvasClient.tsx-local reducer dispatch
    // (canvasState.editors.isCardEditorOpen), not part of useCanvasOverlays.ts
    // -- its live consumer is the CardEditor modal's isOpen prop.
    const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(canvasClient).toContain('setIsCardEditorOpen');
    expect(canvasClient).toContain('isOpen={isCardEditorOpen}');
  });
});
