import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const NOTE_EDITOR = 'components/collabboard/editors/NoteEditor.tsx';
const FREEFORM = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const OVERLAY = 'components/collabboard/canvas/ui/OverlayLayer.tsx';
const POPUP = 'components/collabboard/editors/CommentPopup.tsx';

const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('normal/detached Note comments — canonical Comment UI v1 migration', () => {
  it('routes all three live detached Note entry points through CommentPopup', () => {
    const noteEditor = read(NOTE_EDITOR);
    const freeform = read(FREEFORM);

    expect(noteEditor.match(/<CommentPopup/g)?.length).toBeGreaterThanOrEqual(2);
    expect(freeform.match(/Note detached comments[\s\S]*?<CommentPopup/g)?.length).toBe(2);
  });

  it('removes local detached Note rows, action rails, composers, and pickers', () => {
    const noteEditor = read(NOTE_EDITOR);
    const freeform = read(FREEFORM);
    const notePanel = noteEditor.slice(noteEditor.indexOf("{panels.open.detached &&"), noteEditor.indexOf('sharedPanel='));
    expect(notePanel).toContain('<CommentPopup');
    expect(notePanel).not.toContain('<textarea');
    expect(notePanel).not.toContain('title="Edit"');
    expect(notePanel).not.toContain('title="Badge Color"');

    const detachedPanels = freeform.split('Note detached comments').slice(1);
    expect(detachedPanels).toHaveLength(2);
    for (const panel of detachedPanels) {
      expect(panel).toContain('<CommentPopup');
      expect(panel).not.toContain('<textarea');
      expect(panel).not.toContain('title="Edit"');
      expect(panel).not.toContain('title="Color"');
      expect(panel).not.toContain('title="Delete"');
    }
  });

  it('keeps detached storage and canonical callback behavior intact', () => {
    const source = read(NOTE_EDITOR) + read(FREEFORM);
    for (const token of [
      'detachedComments',
      'onSubmit',
      'onEditComment',
      'onRemoveComment',
      'onToggleCommentStrikethrough',
      'onCommentColor',
      'onBadgeColorChange',
      'onCommentTitleChange',
      'onCommentTitleStyleChange',
      'enableCanonicalSelectionStyling',
    ]) {
      expect(source).toContain(token);
    }
  });

  it('inherits the complete canonical behavior surface instead of recreating it', () => {
    const popup = read(POPUP);
    for (const capability of [
      'Add a comment...',
      'aria-label="Send"',
      'applySelectedStyle',
      'applySelectedStrikethrough',
      'handleApplyLink',
      'TextStylePopup',
      'useAnchoredPopover',
    ]) {
      expect(popup).toContain(capability);
    }
  });

  // PATCH 8P: structural, not mounted -- FreeformPadletCards.tsx is too
  // large to mount (established convention, see this file's own header).
  // Proves the pre-existing interaction-isolation wrappers around both Note
  // CommentPopup sites are still present, so a click/mousedown inside the
  // comment panel cannot leak through to the card/canvas underneath (drag,
  // selection, parent-card click). These wrappers predate PATCH 8P; this
  // test simply closes the gap that nothing previously guarded them.
  it('both Note CommentPopup sites are wrapped in click/mousedown isolation containers', () => {
    const freeform = read(FREEFORM);
    const firstNoteAnchor = 'Note detached comments use the canonical panel; this shell only owns placement and close state.';
    const secondNoteAnchor = 'Note detached comments use the canonical panel; this toolbar shell owns placement only.';
    for (const anchor of [firstNoteAnchor, secondNoteAnchor]) {
      const anchorIdx = freeform.indexOf(anchor);
      expect(anchorIdx, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
      const popupIdx = freeform.indexOf('<CommentPopup', anchorIdx);
      const wrapperSlice = freeform.slice(anchorIdx, popupIdx);
      expect(wrapperSlice, `${anchor} wrapper must stop click propagation`).toContain('onClick={(e) => e.stopPropagation()}');
      expect(wrapperSlice, `${anchor} wrapper must stop mousedown propagation`).toContain('onMouseDown={(e) => e.stopPropagation()}');
    }
  });

  // PATCH 8AB permission-wired in-modal highlighted/anchored Note threads --
  // this test previously proved the anchored block stayed byte-identical to
  // the pre-PATCH-8P baseline (fully unwired). It is no longer frozen: it now
  // carries accessMode gating and real identity. What remains frozen is the
  // STORAGE/UI model -- still the TipTap `comment` mark, never migrated to
  // `detachedComments`, never redesigned into the canonical CommentPopup's
  // own UI beyond the accessMode prop it has always accepted.
  it('proves in-modal highlighted/anchored Note threads keep their TipTap-mark storage/UI model while now carrying real permission + identity wiring', () => {
    const currentNote = read(NOTE_EDITOR);
    const anchoredStart = '  const parseCommentThread =';
    const anchoredEnd = '  const handlePostComment =';
    const currentStart = currentNote.indexOf(anchoredStart);
    const currentEnd = currentNote.indexOf(anchoredEnd, currentStart);
    expect(currentStart).toBeGreaterThanOrEqual(0);
    expect(currentEnd).toBeGreaterThan(currentStart);
    const anchoredBlock = currentNote.slice(currentStart, currentEnd);
    // Storage/UI model unchanged -- still TipTap mark based, not migrated.
    expect(anchoredBlock).toContain('buildThreadFromAttrs');
    expect(anchoredBlock).not.toContain('detachedComments');
    // Permission + identity wiring is new as of PATCH 8AB (handleTextComment
    // is the creation-trigger inside this slice; the mutation handlers
    // further down the file -- handleAddComment et al -- are checked below).
    expect(anchoredBlock).toContain('canManageAnchoredComments');
    const handleAddCommentStart = currentNote.indexOf('const handleAddComment = ');
    const handleAddCommentEnd = currentNote.indexOf('const handleEditComment = ', handleAddCommentStart);
    const handleAddCommentBlock = currentNote.slice(handleAddCommentStart, handleAddCommentEnd);
    expect(handleAddCommentBlock).toContain('.setComment(');
    expect(handleAddCommentBlock).toContain('userId: currentUserId,');
    expect(handleAddCommentBlock).not.toContain("userId: 'user1'");
    expect(currentNote).toContain("const anchoredAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';");
    const popupSite = currentNote.slice(currentNote.indexOf('{panels.open.comment && ('));
    expect(popupSite).toContain('accessMode={anchoredAccessMode}');
    expect(popupSite).toContain('guardCommentMutation(anchoredAccessMode,');
    expect(popupSite).toContain('currentUserId={currentUserId}');
    expect(popupSite).toContain('currentUserName={currentUserName}');
    expect(popupSite).not.toContain('currentUserId="user1"');

    const overlay = read(OVERLAY);
    expect(overlay).toContain('accessMode?: CommentAccessMode;');
    expect(overlay).toContain('accessMode={anchoredAccessMode}');
    expect(overlay).not.toContain('detachedComments');
    // PATCH 8AB: OverlayLayer's shared anchored gate now also covers Note,
    // not just Document.
    expect(overlay).toContain('isNoteAnchoredPost');
  });
});
