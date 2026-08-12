import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const NOTE_EDITOR = 'components/collabboard/editors/NoteEditor.tsx';
const FREEFORM = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const OVERLAY = 'components/collabboard/canvas/ui/OverlayLayer.tsx';
const POPUP = 'components/collabboard/editors/CommentPopup.tsx';
const START = 'cd35d76b74b3f81ddccbe39e6e5a16ef9aa0dabb';

const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const baseline = (path: string) => execFileSync('git', ['show', `${START}:${path}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');

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

  it('proves highlighted/anchored Note threads remain on their frozen path', () => {
    const currentNote = read(NOTE_EDITOR);
    const oldNote = baseline(NOTE_EDITOR);
    const anchoredStart = '  const parseCommentThread =';
    const anchoredEnd = '  const handlePostComment =';
    const currentStart = currentNote.indexOf(anchoredStart);
    const oldStart = oldNote.indexOf(anchoredStart);
    const currentEnd = currentNote.indexOf(anchoredEnd, currentStart);
    const oldEnd = oldNote.indexOf(anchoredEnd, oldStart);
    expect(currentStart).toBeGreaterThanOrEqual(0);
    expect(currentEnd).toBeGreaterThan(currentStart);
    expect(currentNote.slice(currentStart, currentEnd)).toBe(oldNote.slice(oldStart, oldEnd));
    expect(read(OVERLAY)).toBe(baseline(OVERLAY));
  });
});
